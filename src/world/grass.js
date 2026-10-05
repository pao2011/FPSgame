import * as THREE from 'three';

// Matas de hierba instanciadas alrededor de la cámara, mecidas por el viento.
// El mundo se divide en parcelas de CHUNK m; cada parcela calcula una vez sus
// matas (posición determinista, sólo sobre terreno verde fuera de carreteras
// y edificios) y se guardan en caché. Al cambiar de parcela se rellenan las
// instancias con las parcelas cercanas. Desactivado en calidad baja/móvil.
const CHUNK = 16;
const RING = 3; // parcelas a cada lado (7×7)

function hash(x, z, k) {
  const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function tuftGeometry() {
  // Tres hojas cruzadas, cada una de dos tramos que se estrechan.
  const pos = [], col = [], idx = [];
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI + b * 0.37;
    const ca = Math.cos(a), sa = Math.sin(a);
    const lean = 0.12 + (b % 3) * 0.06;
    const h = 0.3 + (b % 2) * 0.12;
    const w = 0.07;
    const off = ((b * 0.29) % 0.2) - 0.1;
    const base = pos.length / 3;
    const rows = [
      [0, w, 0.72],
      [0.55, w * 0.65, 0.95],
      [1, 0, 1.18],
    ];
    for (const [t, hw, shade] of rows) {
      const y = t * h;
      const fwd = lean * t * t;
      const cx = off * ca + -sa * fwd, cz = off * sa + ca * fwd;
      pos.push(cx - ca * hw, y, cz - sa * hw);
      col.push(shade, shade, shade);
      if (hw > 0) {
        pos.push(cx + ca * hw, y, cz + sa * hw);
        col.push(shade, shade, shade);
      }
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Normales hacia arriba: la hierba se ilumina como el suelo (sin caras negras).
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  g.normalizeNormals?.();
  return g;
}

export class Grass {
  constructor(scene, world, quality) {
    this.world = world;
    this.enabled = quality === 'alta' || quality === 'normal';
    this.cache = new Map();
    this.cx = null;
    this.cz = null;
    if (!this.enabled) return;
    this.perChunk = quality === 'alta' ? 260 : 150;
    this.max = this.perChunk * (RING * 2 + 1) ** 2;
    this.uniforms = { uTime: { value: 0 }, uFade: { value: CHUNK * (RING + 0.2) } };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uFade = this.uniforms.uFade;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uFade;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
{
  vec3 ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float d = length(cameraPosition.xz - ip.xz);
  float k = 1.0 - smoothstep(uFade * 0.65, uFade, d);
  transformed *= k;
  float t = transformed.y;
  float ph = ip.x * 0.21 + ip.z * 0.17;
  float gust = sin(uTime * 0.9 + ip.x * 0.03 + ip.z * 0.02) * 0.5 + 0.5;
  float sway = (sin(uTime * 2.3 + ph) * 0.6 + sin(uTime * 3.7 + ph * 1.7) * 0.25) * (0.35 + gust * 0.65);
  transformed.x += sway * t * t * 0.55;
  transformed.z += sway * t * t * 0.3;
}`,
        );
    };
    this.mesh = new THREE.InstancedMesh(tuftGeometry(), mat, this.max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  chunk(ix, iz) {
    const key = ix * 100000 + iz;
    let c = this.cache.get(key);
    if (c) return c;
    const w = this.world, t = w.terrain;
    const mats = [], cols = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.perChunk; i++) {
      const x = ix * CHUNK + hash(ix, iz, i) * CHUNK;
      const z = iz * CHUNK + hash(iz, ix, i + 0.5) * CHUNK;
      const h = t.heightAt(x, z);
      if (h < 2.6 || h > 48) continue;
      // Agrupadas en manchas: menos densidad donde el ruido es bajo.
      if (t.noise && t.noise(x * 0.06 + 11, z * 0.06 - 4) < -0.35 + hash(x, z, 9) * 0.3) continue;
      const slope = t.slopeAt(x, z);
      if (slope > 0.5) continue;
      t.colorAt(x, z, h, slope, col);
      if (col.g < col.r + 0.12 || col.g < col.b + 0.2) continue;
      if (w.roads && w.roads.edgeDistance(x, z, 8) < 0.6) continue;
      if (w.occupied && w.occupied(x, z, 0.3)) continue;
      const sc = 0.55 + hash(x, z, 3) * 0.55;
      q.setFromAxisAngle(up, hash(x, z, 5) * Math.PI * 2);
      s.set(sc, sc * (0.8 + hash(x, z, 7) * 0.5), sc);
      p.set(x, h - 0.03, z);
      m.compose(p, q, s);
      mats.push(...m.elements);
      col.convertSRGBToLinear().multiplyScalar(0.95 + hash(x, z, 8) * 0.2);
      cols.push(col.r, col.g, col.b);
    }
    c = { m: new Float32Array(mats), c: new Float32Array(cols) };
    if (this.cache.size > 400) this.cache.clear();
    this.cache.set(key, c);
    return c;
  }

  // Fuerza el recálculo (p. ej. tras construir un edificio en creativo).
  reset() {
    this.cache.clear();
    this.cx = null;
  }

  update(dt, camPos) {
    if (!this.enabled) return;
    // Rendimiento: si los FPS se hunden un buen rato, se quita el césped
    this.fpsAcc = (this.fpsAcc || 0) + dt;
    this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 5) {
      const fps = this.fpsN / this.fpsAcc;
      this.slow = fps < 28 ? (this.slow || 0) + 1 : 0;
      this.fpsAcc = this.fpsN = 0;
      if (this.slow >= 3) {
        this.enabled = false;
        this.mesh.visible = false;
        this.onAutoOff?.();
        return;
      }
    }
    this.uniforms.uTime.value += dt;
    const cx = Math.floor(camPos.x / CHUNK), cz = Math.floor(camPos.z / CHUNK);
    // Muy alto (autobús, caída libre): no merece la pena dibujarla.
    const gy = this.world.terrain.heightAt(camPos.x, camPos.z);
    this.mesh.visible = camPos.y - gy < 60;
    if (!this.mesh.visible || (cx === this.cx && cz === this.cz)) return;
    this.cx = cx;
    this.cz = cz;
    const im = this.mesh.instanceMatrix.array, ic = this.mesh.instanceColor.array;
    let n = 0;
    for (let dx = -RING; dx <= RING; dx++) {
      for (let dz = -RING; dz <= RING; dz++) {
        const c = this.chunk(cx + dx, cz + dz);
        const k = c.m.length / 16;
        im.set(c.m, n * 16);
        ic.set(c.c, n * 3);
        n += k;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
