import * as THREE from 'three';
import { smoothstep } from '../core/rng.js';

// Grano de asfalto, parches y grietas (procedural, coordenadas de mundo).
function addAsphaltDetail(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vAWorld;
float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float aNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(aHash(i), aHash(i + vec2(1.0, 0.0)), u.x), mix(aHash(i + vec2(0.0, 1.0)), aHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vAWorld.xz;
  float camD = length(cameraPosition - vAWorld);
  float fade = 1.0 - smoothstep(40.0, 260.0, camD);
  float grain = aNoise(p * 7.0) * 0.55 + aNoise(p * 2.3) * 0.45;
  float aPatch = smoothstep(0.62, 0.66, aNoise(p * 0.11 + 7.3));
  float crack = 1.0 - smoothstep(0.0, 0.012, abs(aNoise(p * 0.5) - 0.5));
  crack *= smoothstep(0.45, 0.6, aNoise(p * 0.07 + 3.0));
  vec3 c = diffuseColor.rgb;
  c *= 0.9 + aNoise(p * 0.05) * 0.18;
  c *= mix(1.0, 0.86 + grain * 0.26, fade);
  c = mix(c, c * 0.8, aPatch * 0.7);
  c = mix(c, c * 0.62, crack * (1.0 - smoothstep(10.0, 70.0, camD)));
  diffuseColor.rgb = c;
}`);
  };
}

// Índice espacial simple de rectángulos (ocupación del suelo).
export class RectIndex {
  constructor(cell = 32) {
    this.cell = cell;
    this.map = new Map();
    this.list = [];
  }
  _keys(x0, z0, x1, z1, fn) {
    const c = this.cell;
    for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
      for (let gz = Math.floor(z0 / c); gz <= Math.floor(z1 / c); gz++) fn(gx * 100000 + gz);
    }
  }
  add(x0, z0, x1, z1, data = null) {
    const r = { x0, z0, x1, z1, data };
    this.list.push(r);
    this._keys(x0, z0, x1, z1, (k) => {
      let l = this.map.get(k);
      if (!l) this.map.set(k, (l = []));
      l.push(r);
    });
    return r;
  }
  hit(x0, z0, x1, z1) {
    let found = null;
    this._keys(x0, z0, x1, z1, (k) => {
      if (found) return;
      const l = this.map.get(k);
      if (!l) return;
      for (const r of l) {
        if (x1 > r.x0 && x0 < r.x1 && z1 > r.z0 && z0 < r.z1) {
          found = r;
          return;
        }
      }
    });
    return found;
  }
}

// Red de carreteras: polilíneas con ancho, consulta de distancia y malla.
export class RoadNetwork {
  constructor() {
    this.roads = [];
    this.segs = new Map();
    this.cell = 24;
  }

  // hs (opcional): altura del firme en cada punto (perfil suavizado). Las
  // carreteras con perfil moldean el terreno a su alrededor (corredor).
  add(pts, width = 7, kind = 'road', hs = null) {
    const road = { pts, width, kind, hs };
    this.roads.push(road);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const s = { ax, az, bx, bz, w: width, road, i };
      const m = width / 2 + 2;
      const c = this.cell;
      for (let gx = Math.floor((Math.min(ax, bx) - m) / c); gx <= Math.floor((Math.max(ax, bx) + m) / c); gx++) {
        for (let gz = Math.floor((Math.min(az, bz) - m) / c); gz <= Math.floor((Math.max(az, bz) + m) / c); gz++) {
          const k = gx * 100000 + gz;
          let l = this.segs.get(k);
          if (!l) this.segs.set(k, (l = []));
          l.push(s);
        }
      }
    }
    return road;
  }

  // Distancia al borde de la carretera más cercana (negativa = encima).
  edgeDistance(x, z, search = 24) {
    let best = Infinity;
    const c = this.cell;
    const r = Math.ceil(search / c);
    const gx0 = Math.floor(x / c), gz0 = Math.floor(z / c);
    for (let gx = gx0 - r; gx <= gx0 + r; gx++) {
      for (let gz = gz0 - r; gz <= gz0 + r; gz++) {
        const l = this.segs.get(gx * 100000 + gz);
        if (!l) continue;
        for (const s of l) {
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const len2 = dx * dx + dz * dz || 1;
          let t = ((x - s.ax) * dx + (z - s.az) * dz) / len2;
          t = Math.max(0, Math.min(1, t));
          const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)) - s.w / 2;
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  // Altura del perfil de la carretera (con perfil) más cercana a menos de
  // `maxD` m del eje, o null.
  profileNear(x, z, maxD = 8) {
    let best = null;
    const c = this.cell;
    const r = Math.ceil(maxD / c);
    const gx0 = Math.floor(x / c), gz0 = Math.floor(z / c);
    for (let gx = gx0 - r; gx <= gx0 + r; gx++) {
      for (let gz = gz0 - r; gz <= gz0 + r; gz++) {
        const l = this.segs.get(gx * 100000 + gz);
        if (!l) continue;
        for (const s of l) {
          const hs = s.road.hs;
          if (!hs) continue;
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const len2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
          const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
          if (d < maxD && (!best || d < best.d)) best = { d, hp: hs[s.i] + (hs[s.i + 1] - hs[s.i]) * t };
        }
      }
    }
    return best;
  }

  // Punto de carretera más cercano y su dirección.
  nearest(x, z, search = 60) {
    let best = null, bd = Infinity;
    const c = this.cell;
    const r = Math.ceil(search / c);
    const gx0 = Math.floor(x / c), gz0 = Math.floor(z / c);
    for (let gx = gx0 - r; gx <= gx0 + r; gx++) {
      for (let gz = gz0 - r; gz <= gz0 + r; gz++) {
        const l = this.segs.get(gx * 100000 + gz);
        if (!l) continue;
        for (const s of l) {
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const len2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
          const px = s.ax + dx * t, pz = s.az + dz * t;
          const d = Math.hypot(x - px, z - pz);
          if (d < bd) {
            bd = d;
            const L = Math.sqrt(len2);
            best = { x: px, z: pz, dx: dx / L, dz: dz / L, dist: d };
          }
        }
      }
    }
    return best;
  }

  // Terreno moldeado por el corredor de las carreteras con perfil: el firme
  // queda a la altura del perfil y a los lados hay un talud cuya anchura
  // crece con el desnivel (nada de montaña "atravesando" el asfalto).
  // hydro: no se rellenan los cauces de los ríos (ahí hay puentes).
  corridor(x, z, h, hydro) {
    const c = this.cell;
    const gx0 = Math.floor(x / c), gz0 = Math.floor(z / c);
    let bw = 0, bd = Infinity, target = h;
    for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
      for (let gz = gz0 - 1; gz <= gz0 + 1; gz++) {
        const l = this.segs.get(gx * 100000 + gz);
        if (!l) continue;
        for (const s of l) {
          const hs = s.road.hs;
          if (!hs) continue;
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const len2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
          const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
          const hp = hs[s.i] + (hs[s.i + 1] - hs[s.i]) * t;
          const inner = s.w / 2 + 3;
          const fade = Math.min(26, Math.max(4, Math.abs(h - hp) * 1.8));
          const w = 1 - smoothstep(inner, inner + fade, d);
          // el tramo más cercano manda (continuidad en curvas y cruces)
          if (w > bw || (w > 0 && w === bw && d < bd)) {
            bw = w;
            bd = d;
            target = hp;
          }
        }
      }
    }
    if (bw <= 0) return h;
    if (hydro) bw *= 1 - hydro.riverMask(x, z);
    return h + (target - h) * bw;
  }

  // Puntos cada `step` m a lo largo de una carretera, con su tangente y la
  // altura del perfil (null si la carretera no tiene perfil).
  samples(road, step = 2) {
    const out = [];
    const { pts, hs } = road;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / step));
      const last = i === pts.length - 2;
      for (let q = 0; q < n + (last ? 1 : 0); q++) {
        const t = q / n;
        out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, hp: hs ? hs[i] + (hs[i + 1] - hs[i]) * t : null });
      }
    }
    for (let k = 0; k < out.length; k++) {
      const a = out[Math.max(0, k - 1)], b = out[Math.min(out.length - 1, k + 1)];
      const tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      out[k].tx = tx / tl;
      out[k].tz = tz / tl;
      out[k].dist = k ? out[k - 1].dist + Math.hypot(out[k].x - out[k - 1].x, out[k].z - out[k - 1].z) : 0;
    }
    return out;
  }

  // Ribbon de asfalto que sigue el perfil (o el terreno) + líneas discontinuas.
  buildMesh(terrain) {
    const pos = [], col = [], dash = [];
    const asphalt = new THREE.Color(0x3d3f44);
    const street = new THREE.Color(0x4a4c51);
    // Altura del firme: nunca por debajo del terreno (subdividido cada 2 m
    // y con tres filas transversales para que el relieve no lo atraviese).
    const yAt = (x, z, hp, lift) => Math.max(hp ?? -Infinity, terrain.heightAt(x, z)) + lift;
    for (const road of this.roads) {
      const c = road.kind === 'street' ? street : asphalt;
      const hw = road.width / 2;
      const S = this.samples(road, 2);
      const rows = [[], [], []];
      for (const p of S) {
        const nx = -p.tz, nz = p.tx;
        for (let r = 0; r < 3; r++) {
          const o = hw * (1 - r); // +hw (izquierda), 0, -hw (derecha)
          const x = p.x + nx * o, z = p.z + nz * o;
          rows[r].push([x, yAt(x, z, p.hp, 0.08), z]);
        }
      }
      for (let r = 0; r < 2; r++) {
        const A = rows[r], B = rows[r + 1];
        for (let i = 0; i < S.length - 1; i++) {
          const quad = [A[i], B[i + 1], B[i], A[i], A[i + 1], B[i + 1]]; // CCW visto desde arriba
          for (const v of quad) {
            pos.push(v[0], v[1], v[2]);
            col.push(c.r, c.g, c.b);
          }
        }
      }
      // Línea central discontinua (solo carreteras)
      if (road.kind !== 'road') continue;
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1];
        if (a.dist % 9 > 3.5) continue;
        const nx = -a.tz * 0.1, nz = a.tx * 0.1;
        const y = yAt(a.x, a.z, a.hp, 0.12), y2 = yAt(b.x, b.z, b.hp, 0.12);
        dash.push(a.x + nx, y, a.z + nz, b.x - nx, y2, b.z - nz, a.x - nx, y, a.z - nz, a.x + nx, y, a.z + nz, b.x + nx, y2, b.z + nz, b.x - nx, y2, b.z - nz);
      }
    }
    const group = new THREE.Group();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const rm = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    addAsphaltDetail(rm);
    const m = new THREE.Mesh(g, rm);
    m.receiveShadow = true;
    group.add(m);
    if (dash.length) {
      const dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.Float32BufferAttribute(dash, 3));
      dg.computeVertexNormals();
      group.add(new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ color: 0xf2d24a, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
    }
    return group;
  }
}
