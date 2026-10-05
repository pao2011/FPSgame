import * as THREE from 'three';
import { MAP_SIZE, HALF, LOBBY } from './constants.js';
import { smoothstep } from '../core/rng.js';
import { usesPBR, isMobileQuality } from '../game/models.js';

const tmpColor = new THREE.Color();

// Variación de color con ruido en el shader del terreno: rompe la
// uniformidad de los colores por vértice (matas de hierba, tierra, vetas).
// hd (calidad alta): además, microrrelieve en la iluminación (normales con
// ruido fino) y más detalle de color de cerca. En calidad móvil, versión
// ligera: dos ruidos por píxel en vez de cuatro.
export function addGroundDetail(mat, hd = false) {
  if (isMobileQuality()) mat.defines = { ...mat.defines, LITE: '' };
  mat.customProgramCacheKey = () => (hd ? 'groundHD' : 'ground');
  mat.onBeforeCompile = (sh) => {
    if (hd) sh.fragmentShader = '#define GROUND_HD\n' + sh.fragmentShader;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;\nvarying vec3 vGNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGWorld = (modelMatrix * vec4(position, 1.0)).xyz;\nvGNormal = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGWorld;
varying vec3 vGNormal;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Ruido en los tres planos: no se estira en las laderas empinadas
float gN3(vec3 p) { return (gNoise(p.xz) + gNoise(p.zy + 17.0) + gNoise(p.xy + 31.0)) * 0.3333; }
float gDetail(vec3 p) { return gN3(p * 0.9) * 0.55 + gN3(p * 2.3) * 0.3 + gN3(p * 5.7) * 0.15; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef GROUND_HD
{
  // Microrrelieve: inclina la normal según el gradiente de un ruido fino
  float camDn = length(cameraPosition - vGWorld);
  float fadeN = 1.0 - smoothstep(25.0, 160.0, camDn);
  if (fadeN > 0.0) {
    vec3 q = vGWorld;
    float e = 0.12;
    float h0 = gDetail(q);
    vec3 grad = vec3(gDetail(q + vec3(e, 0.0, 0.0)) - h0, gDetail(q + vec3(0.0, e, 0.0)) - h0, gDetail(q + vec3(0.0, 0.0, e)) - h0) / e;
    vec3 gn = normalize(vGNormal);
    vec3 bw = -(grad - gn * dot(grad, gn)); // sólo la parte tangente a la ladera
    float rocky = 1.0 - smoothstep(0.75, 0.95, clamp(gn.y, 0.0, 1.0));
    normal = normalize(normal + (viewMatrix * vec4(bw, 0.0)).xyz * fadeN * (0.28 + rocky * 0.5));
  }
}
#endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 gp = vGWorld.xz;
  float camD = length(cameraPosition - vGWorld);
  float fade = 1.0 - smoothstep(120.0, 600.0, camD);
#ifdef LITE
  float big = gNoise(gp * 0.05);
  float fine = gNoise(gp * 1.1);
#else
  float big = gNoise(gp * 0.035) * 0.6 + gNoise(gp * 0.09) * 0.4;
#ifdef GROUND_HD
  float fine = gN3(vGWorld * 0.7) * 0.5 + gN3(vGWorld * 2.3) * 0.5;
#else
  float fine = gNoise(gp * 0.7) * 0.5 + gNoise(gp * 2.3) * 0.5;
#endif
#endif
  float green = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
  float grassy = smoothstep(0.0, 0.08, green);
  vec3 c = diffuseColor.rgb;
  c *= 0.86 + big * 0.28;
  c = mix(c, c * vec3(1.12, 1.05, 0.72), grassy * smoothstep(0.55, 0.8, big) * 0.6);
  c *= mix(1.0, 0.9 + fine * 0.2, fade);
#ifdef GROUND_HD
  // De cerca: briznas, piedrecillas y manchas de tierra
  float near = 1.0 - smoothstep(15.0, 90.0, camD);
  float speck = gN3(vGWorld * 9.0) * 0.6 + gN3(vGWorld * 23.0) * 0.4;
  c *= mix(1.0, 0.82 + speck * 0.34, near);
  float dirt = smoothstep(0.62, 0.78, gNoise(gp * 0.22 + 13.0)) * grassy;
  c = mix(c, c * vec3(1.18, 0.95, 0.7), dirt * 0.35);
#endif
  float gFlat = clamp(vGNormal.y, 0.0, 1.0);
  c = mix(c * vec3(0.92, 0.9, 0.88), c, smoothstep(0.75, 0.95, gFlat));
  diffuseColor.rgb = c;
}`);
  };
}

// Terreno de isla basado en ruido con zonas aplanadas para pueblos/edificios.
export class Terrain {
  constructor(noise, opts = {}) {
    this.noise = noise;
    this.flat = !!opts.flat; // isla plana del modo creativo
    // Calidad alta: malla del doble de resolución (2 m) con relieve fino
    this.hd = !!opts.hd && !this.flat;
    this.flats = []; // {x, z, radius, height}
    this.zones = []; // POIs para colorear el suelo
    this.hydro = null; // ríos y lagos (excavan el terreno)
    this.roadNet = null; // carreteras (corredor con perfil suavizado)
    this.sites = []; // cuevas y trincheras (excavadas en la rejilla)
    this.res = this.hd ? 800 : 400;
    this.cell = MAP_SIZE / this.res;
    this.heights = null;
    this.maxHeight = 0;
  }

  rawHeight(x, z) {
    const n = this.noise;
    if (this.flat) {
      // Llanura de ~800 m de diámetro con playa alrededor
      const d = Math.sqrt(x * x + z * z);
      const coast = smoothstep(380, 470, d + n(x * 0.01, z * 0.01) * 12);
      return 6 * (1 - coast) - 14 * coast;
    }
    const nx = x * 0.0032, nz = z * 0.0032;
    let h = 0, amp = 1, f = 1, sum = 0;
    for (let o = 0; o < 5; o++) {
      h += n(nx * f + o * 17.3, nz * f - o * 9.1) * amp;
      sum += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    h /= sum;
    // Montañas sólo en algunas regiones (máscara de baja frecuencia)
    const ridge = 1 - Math.abs(n(x * 0.0021 + 100, z * 0.0021 - 50));
    const mask = smoothstep(0.15, 0.55, n(x * 0.0011 + 500, z * 0.0011 - 300));
    const mountain = Math.pow(smoothstep(0.62, 1.0, ridge), 1.5) * 48 * mask;
    let height = 11 + h * 16 + mountain;
    const d = Math.sqrt(x * x + z * z) / HALF;
    const coast = smoothstep(0.78, 0.97, d + n(x * 0.008, z * 0.008) * 0.06);
    height = height * (1 - coast) - 14 * coast;
    return height;
  }

  // Índice espacial de las zonas aplanadas (pueblos, edificios y carreteras).
  indexFlats() {
    const B = 48;
    this.flatGrid = new Map();
    this.flats.forEach((p, i) => {
      const r = p.radius * 1.6;
      for (let gx = Math.floor((p.x - r) / B); gx <= Math.floor((p.x + r) / B); gx++) {
        for (let gz = Math.floor((p.z - r) / B); gz <= Math.floor((p.z + r) / B); gz++) {
          const k = gx * 10000 + gz;
          let l = this.flatGrid.get(k);
          if (!l) this.flatGrid.set(k, (l = []));
          l.push(i);
        }
      }
    });
    this.flatB = B;
  }

  shapedHeight(x, z) {
    let h = this.rawHeight(x, z);
    this._flatW = 0; // cuánto ha aplanado alguna zona este punto (0..1)
    const list = this.flatGrid.get(Math.floor(x / this.flatB) * 10000 + Math.floor(z / this.flatB));
    if (!list) return h;
    for (const i of list) {
      const p = this.flats[i];
      const dx = x - p.x, dz = z - p.z;
      const r = p.radius;
      if (Math.abs(dx) > r * 1.7 || Math.abs(dz) > r * 1.7) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      const w = 1 - smoothstep(r * 0.85, r * 1.6, d);
      if (w > 0) {
        h += (p.height - h) * w;
        if (w > this._flatW) this._flatW = w;
      }
    }
    return h;
  }

  // Relieve fino (sólo calidad alta) para el terreno natural: ondulaciones,
  // montículos y más rugosidad en las montañas.
  detailHeight(x, z, base) {
    const n = this.noise;
    const d = n(x * 0.045 + 31, z * 0.045 - 17) * 0.55 + n(x * 0.11 - 9, z * 0.11 + 44) * 0.3 + n(x * 0.27 + 71, z * 0.27 + 5) * 0.14;
    const rocky = 1 + smoothstep(22, 48, base) * 1.6;
    return d * rocky;
  }

  // Altura final de un vértice: relieve + zonas aplanadas, después ríos y
  // lagos, luego el corredor de las carreteras (que no rellena los cauces:
  // ahí van puentes) y por último las cuevas/trincheras.
  finalHeight(x, z) {
    let h = this.shapedHeight(x, z);
    let natural = 1 - this._flatW;
    if (this.hydro) {
      h = this.hydro.shape(x, z, h);
      if (this.hd) natural *= smoothstep(4, 16, this.hydro.edgeDistance(x, z));
    }
    if (this.roadNet) {
      h = this.roadNet.corridor(x, z, h, this.hydro);
      natural *= 1 - this.roadNet.lastWeight;
    }
    for (const s of this.sites) if (s.contains(x, z, 0.01)) return s.vertexHeight(x, z);
    // Sólo en calidad alta y lejos de zonas, carreteras y agua
    if (this.hd && natural > 0.001 && h > 1) h += this.detailHeight(x, z, h) * natural * smoothstep(1, 4, h);
    return h;
  }

  build() {
    this.indexFlats();
    const N = this.res;
    const V = N + 1;
    const heights = (this.heights = new Float32Array(V * V));
    let maxH = -Infinity;
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const h = this.finalHeight(-HALF + i * this.cell, -HALF + j * this.cell);
        heights[j * V + i] = h;
        if (h > maxH) maxH = h;
      }
    }
    this.maxHeight = maxH;

    const positions = new Float32Array(V * V * 3);
    const colors = new Float32Array(V * V * 3);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const idx = j * V + i;
        const x = -HALF + i * this.cell;
        const z = -HALF + j * this.cell;
        const h = heights[idx];
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = h;
        positions[idx * 3 + 2] = z;
        const slope = this.slopeAtGrid(i, j);
        // colorAt devuelve sRGB; los vertex colors se guardan en lineal.
        this.colorAt(x, z, h, slope, tmpColor).convertSRGBToLinear();
        colors[idx * 3] = tmpColor.r;
        colors[idx * 3 + 1] = tmpColor.g;
        colors[idx * 3 + 2] = tmpColor.b;
      }
    }
    // La malla se divide en TILES×TILES parcelas que comparten los vértices:
    // cada parcela tiene su propio índice y su esfera envolvente, así three.js
    // descarta las que quedan fuera de cámara (y las lejanas, ver world/lod.js).
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    const full = new THREE.BufferGeometry();
    full.setAttribute('position', posAttr);
    {
      // Normales con la malla completa (sin costuras entre parcelas)
      const all = new Uint32Array(N * N * 6);
      let k = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const a = j * V + i, b = (j + 1) * V + i, c = j * V + i + 1, d = (j + 1) * V + i + 1;
          all[k++] = a; all[k++] = b; all[k++] = c;
          all[k++] = c; all[k++] = b; all[k++] = d;
        }
      }
      full.setIndex(new THREE.BufferAttribute(all, 1));
      full.computeVertexNormals();
    }
    const norAttr = full.getAttribute('normal');
    const mat = usesPBR() ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
    addGroundDetail(mat, this.hd);
    const group = new THREE.Group();
    group.name = 'terrain';
    group.matrixAutoUpdate = false;
    this.tiles = [];
    const TILES = 8;
    const T = N / TILES;
    for (let tj = 0; tj < TILES; tj++) {
      for (let ti = 0; ti < TILES; ti++) {
        const idx = new Uint32Array(T * T * 6);
        let k = 0, minH = Infinity, maxH2 = -Infinity;
        for (let j = tj * T; j < (tj + 1) * T; j++) {
          for (let i = ti * T; i < (ti + 1) * T; i++) {
            const a = j * V + i, b = (j + 1) * V + i, c = j * V + i + 1, d = (j + 1) * V + i + 1;
            idx[k++] = a; idx[k++] = b; idx[k++] = c;
            idx[k++] = c; idx[k++] = b; idx[k++] = d;
            const h = heights[a];
            if (h < minH) minH = h;
            if (h > maxH2) maxH2 = h;
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', posAttr);
        g.setAttribute('normal', norAttr);
        g.setAttribute('color', colAttr);
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        const x0 = -HALF + ti * T * this.cell, z0 = -HALF + tj * T * this.cell, size = T * this.cell;
        const cx = x0 + size / 2, cz = z0 + size / 2, cy = (minH + maxH2) / 2;
        g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, minH, z0), new THREE.Vector3(x0 + size, maxH2, z0 + size));
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.hypot(size / 2, size / 2, (maxH2 - minH) / 2) + 1);
        const tile = new THREE.Mesh(g, mat);
        tile.receiveShadow = true;
        tile.matrixAutoUpdate = false;
        tile.name = 'terrain-tile';
        group.add(tile);
        this.tiles.push({ mesh: tile, cx, cz, r: size * 0.71 });
      }
    }
    full.dispose();
    this.mesh = group;
    this.material = mat;
    return this.mesh;
  }

  slopeAtGrid(i, j) {
    const V = this.res + 1;
    const H = this.heights;
    const i0 = Math.max(0, i - 1), i1 = Math.min(V - 1, i + 1);
    const j0 = Math.max(0, j - 1), j1 = Math.min(V - 1, j + 1);
    const dx = (H[j * V + i1] - H[j * V + i0]) / ((i1 - i0) * this.cell);
    const dz = (H[j1 * V + i] - H[j0 * V + i]) / ((j1 - j0) * this.cell);
    return Math.sqrt(dx * dx + dz * dz);
  }

  slopeAt(x, z) {
    const e = 2;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.sqrt(dx * dx + dz * dz);
  }

  colorAt(x, z, h, slope, out, noSites = false) {
    if (!noSites) for (const s of this.sites) if (s.contains(x, z, 0.01) && s.floorColor(x, z, h, out)) return out;
    const n = this.noise(x * 0.02, z * 0.02) * 0.5 + 0.5;
    const n2 = this.noise(x * 0.07 + 50, z * 0.07) * 0.5 + 0.5;
    if (h < 0.6) {
      out.setRGB(0.62, 0.58, 0.42);
    } else if (h < 2.4) {
      out.setRGB(0.86, 0.79, 0.56);
    } else if (h > 64) {
      out.setRGB(0.92, 0.94, 0.97);
    } else if (slope > 0.75 || h > 50) {
      const g = 0.42 + n * 0.12;
      out.setRGB(g, g * 0.97, g * 0.92);
    } else {
      out.setRGB(0.3 + n * 0.08 + n2 * 0.04, 0.55 + n * 0.12, 0.2 + n2 * 0.05);
      if (slope > 0.45) out.lerp(tmpRock.setRGB(0.45, 0.42, 0.36), (slope - 0.45) / 0.3);
      if (this.hd) {
        // Más variedad: manchas de hierba seca, tierra y flores silvestres
        const n3 = this.noise(x * 0.09 - 21, z * 0.09 + 8) * 0.5 + 0.5;
        const n4 = this.noise(x * 0.31 + 5, z * 0.31 - 3) * 0.5 + 0.5;
        if (n3 > 0.68) out.lerp(tmpRock.setRGB(0.6, 0.6, 0.3), (n3 - 0.68) * 2.2);
        if (n4 > 0.8 && slope < 0.3) out.lerp(tmpRock.setRGB(0.5, 0.42, 0.3), (n4 - 0.8) * 2.5);
        out.multiplyScalar(0.93 + n4 * 0.12);
      }
    }
    for (const zn of this.zones) {
      const dx = x - zn.x, dz = z - zn.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > zn.radius * 0.95) continue;
      const edge = 1 - smoothstep(zn.radius * 0.75, zn.radius * 0.95, d);
      if (zn.type === 'city' || zn.type === 'apartments' || zn.type === 'industrial' || zn.type === 'port' || zn.type === 'military') {
        const g = 0.36 + n2 * 0.05;
        out.lerp(tmpRock.setRGB(g, g, g * 1.03), edge * 0.9);
      } else if (zn.type === 'farm') {
        const stripe = Math.floor((x + 1000) / 5) % 2 === 0;
        if (stripe) out.lerp(tmpRock.setRGB(0.55, 0.42, 0.25), edge * 0.8);
        else out.lerp(tmpRock.setRGB(0.72, 0.68, 0.3), edge * 0.7);
      } else {
        out.lerp(tmpRock.setRGB(0.55, 0.5, 0.4), edge * 0.35 * n2);
      }
    }
    // Orillas de ríos y lagos: arena húmeda y lecho más oscuro
    if (this.hydro && h > 0.6) {
      const s = this.hydro.surfaceAt(x, z);
      if (s > -Infinity) {
        const wet = smoothstep(-1.4, 0.1, s - h);
        out.lerp(tmpRock.setRGB(0.66, 0.6, 0.44), wet * 0.85);
        out.lerp(tmpRock.setRGB(0.4, 0.38, 0.3), smoothstep(0.3, 2.5, s - h) * 0.7);
      }
    }
    return out;
  }

  // Altura exacta de la malla (interpolación triangular idéntica a la geometría).
  heightAt(x, z) {
    const N = this.res;
    const fx = (x + HALF) / this.cell;
    const fz = (z + HALF) / this.cell;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return this.lobbyHeight(x, z);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const V = N + 1;
    const H = this.heights;
    const h00 = H[j * V + i];
    const h10 = H[j * V + i + 1];
    const h01 = H[(j + 1) * V + i];
    const h11 = H[(j + 1) * V + i + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  // Isla de inicio (fuera de la rejilla del mapa): meseta con playa.
  lobbyHeight(x, z) {
    const dx = x - LOBBY.x, dz = z - LOBBY.z;
    const R = LOBBY.radius;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > R * 1.6) return -16;
    const a = Math.atan2(dz, dx);
    const r = R * (1 + 0.07 * Math.sin(a * 3 + 1.3) + 0.04 * Math.sin(a * 7));
    const t = smoothstep(r * 0.72, r * 1.08, d);
    const hill = (this.noise(x * 0.04 + 900, z * 0.04) * 0.5 + 0.5) * 1.4 * (1 - smoothstep(r * 0.25, r * 0.7, d));
    let h = (LOBBY.height + hill) * (1 - t) - 7 * t;
    if (d > r * 1.08) h = -7 - 9 * smoothstep(r * 1.08, R * 1.6, d);
    return h;
  }

  normalAt(x, z, out) {
    const e = 0.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  // Raycast contra el terreno: avance por pasos + bisección.
  raycast(o, d, maxDist) {
    if (d.y > 0 && o.y > this.maxHeight) return null;
    const step = 1.5;
    let prevT = 0;
    let prevDiff = o.y - this.heightAt(o.x, o.z);
    if (prevDiff < 0) return null;
    for (let t = step; t <= maxDist + step; t += step) {
      const tt = Math.min(t, maxDist);
      const y = o.y + d.y * tt;
      const x = o.x + d.x * tt, z = o.z + d.z * tt;
      const diff = y - this.heightAt(x, z);
      if (diff < 0) {
        let a = prevT, b = tt;
        for (let k = 0; k < 10; k++) {
          const m = (a + b) * 0.5;
          const dm = o.y + d.y * m - this.heightAt(o.x + d.x * m, o.z + d.z * m);
          if (dm < 0) b = m;
          else a = m;
        }
        return { t: (a + b) * 0.5 };
      }
      if (d.y > 0 && y > this.maxHeight) return null;
      prevT = tt;
      prevDiff = diff;
      if (tt >= maxDist) break;
    }
    return null;
  }
}

const tmpRock = new THREE.Color();
