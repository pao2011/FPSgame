import * as THREE from 'three';
import { GeoBuilder } from './geobuilder.js';
import { BuildingCtx } from './buildings.js';
import { ISLAND_RADIUS } from './constants.js';

// Tirolesas: cables tendidos entre dos postes para cruzar la isla deprisa
// (de una cima a un pueblo, de un lado a otro del río…). Se usan con E, se
// recorren en los dos sentidos y se sueltan saltando.
export const ZIP_POLE = 4.3; // altura del enganche del cable sobre el suelo
export const ZIP_HANG = 2.05; // de las manos (cable) a los pies

const tmp = new THREE.Vector3();

export class Zipline {
  constructor(a, b) {
    const top = (p) => new THREE.Vector3(p.x, p.y + ZIP_POLE, p.z);
    this.a = a.clone();
    this.b = b.clone();
    const A = top(a), B = top(b);
    const len = A.distanceTo(B);
    this.sag = Math.min(4.5, len * 0.022); // comba del cable en el centro
    const n = Math.max(8, Math.ceil(len / 4));
    this.pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3().lerpVectors(A, B, t);
      p.y -= this.sag * 4 * t * (1 - t);
      this.pts.push(p);
    }
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.len = this.cum[this.cum.length - 1];
    this.minX = Math.min(A.x, B.x) - 3;
    this.maxX = Math.max(A.x, B.x) + 3;
    this.minZ = Math.min(A.z, B.z) - 3;
    this.maxZ = Math.max(A.z, B.z) + 3;
  }

  // Punto del cable a s metros desde el poste A (y tangente, si se pide).
  pointAt(s, out, tan = null) {
    s = Math.max(0, Math.min(this.len, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= s) lo = m;
      else hi = m;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const k = (s - this.cum[lo]) / seg;
    out.lerpVectors(this.pts[lo], this.pts[hi], k);
    if (tan) tan.subVectors(this.pts[hi], this.pts[lo]).normalize();
    return out;
  }

  // Punto del cable más cercano a p: { s, d } (distancia a lo largo y separación).
  closest(p) {
    let best = { s: 0, d: Infinity };
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const l2 = abx * abx + aby * aby + abz * abz;
      let t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2;
      t = Math.max(0, Math.min(1, t));
      const x = a.x + abx * t - p.x, y = a.y + aby * t - p.y, z = a.z + abz * t - p.z;
      const d = Math.sqrt(x * x + y * y + z * z);
      if (d < best.d) best = { s: this.cum[i - 1] + (this.cum[i] - this.cum[i - 1]) * t, d };
    }
    return best;
  }
}

// ¿El cable pasa libre por encima del terreno y de los edificios?
function clear(world, z) {
  const t = world.terrain;
  const col = world.collision;
  const P = z.pts;
  for (let i = 1; i < P.length - 1; i++) {
    const p = P[i];
    const k = i / (P.length - 1);
    // Cerca de los postes el jugador ya va con los pies casi en el suelo
    const need = k < 0.08 || k > 0.92 ? ZIP_HANG - 0.2 : ZIP_HANG + 1.2;
    if (p.y - t.heightAt(p.x, p.z) < need) return false;
    const w = world.waterLevelAt?.(p.x, p.z) ?? 0;
    if (p.y - w < ZIP_HANG + 0.8) return false;
  }
  // El cuerpo colgado (a la altura del cable y de los pies) no choca con nada
  for (const dy of [-0.3, -ZIP_HANG + 0.3]) {
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      tmp.subVectors(b, a);
      const L = tmp.length();
      tmp.divideScalar(L);
      if (col.raycast(a.x, a.y + dy, a.z, tmp.x, tmp.y, tmp.z, L)) return false;
    }
  }
  return true;
}

// Base de un poste: suelo firme, sin agua ni edificios encima.
function goodBase(world, x, z) {
  const t = world.terrain;
  if (Math.hypot(x, z) > ISLAND_RADIUS * 0.9) return null;
  const y = t.heightAt(x, z);
  if (y < 2.2) return null;
  if (t.slopeAt(x, z) > 0.55) return null;
  if ((world.waterDepth?.(x, z) ?? -1) > -0.5) return null;
  if (world.collision.overlaps(x - 1.4, y + 0.05, z - 1.4, x + 1.4, y + ZIP_POLE + 1, z + 1.4)) return null;
  if (world.roads.edgeDistance(x, z, 8) < 1.5) return null;
  return y;
}

// Planea las tirolesas: desde las alturas hacia las zonas y entre zonas
// vecinas, con el cable siempre despejado. Usa el generador del mundo
// (misma isla para todos, también online).
export function planZiplines(world, rng, max = 14) {
  const t = world.terrain;
  const out = [];
  // Puntos de anclaje candidatos: cimas y laderas altas + bordes de zonas
  const anchors = [];
  for (let i = 0; i < 2600; i++) {
    const a = rng.float(0, Math.PI * 2), r = Math.sqrt(rng.next()) * ISLAND_RADIUS * 0.85;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = t.heightAt(x, z);
    if (h < 22) continue;
    anchors.push({ x, z, h, high: true });
  }
  anchors.sort((p, q) => q.h - p.h);
  const highs = anchors.slice(0, 220);
  const edges = [];
  for (const poi of world.pois) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rng.float(-0.2, 0.2);
      const r = poi.radius * rng.float(0.82, 1.05);
      edges.push({ x: poi.x + Math.cos(a) * r, z: poi.z + Math.sin(a) * r, poi });
    }
  }
  const far = (x, z, d) => out.every((zl) => Math.hypot(zl.a.x - x, zl.a.z - z) > d && Math.hypot(zl.b.x - x, zl.b.z - z) > d);
  const crosses = (A, B) =>
    out.some((zl) => {
      // cruce en planta con otra tirolesa
      const d = (B.x - A.x) * (zl.b.z - zl.a.z) - (B.z - A.z) * (zl.b.x - zl.a.x);
      if (Math.abs(d) < 1e-6) return false;
      const u = ((zl.a.x - A.x) * (zl.b.z - zl.a.z) - (zl.a.z - A.z) * (zl.b.x - zl.a.x)) / d;
      const v = ((zl.a.x - A.x) * (B.z - A.z) - (zl.a.z - A.z) * (B.x - A.x)) / d;
      return u > 0 && u < 1 && v > 0 && v < 1;
    });
  const tryPair = (A, B) => {
    const ya = goodBase(world, A.x, A.z), yb = goodBase(world, B.x, B.z);
    if (ya === null || yb === null) return false;
    const d = Math.hypot(B.x - A.x, B.z - A.z);
    if (d < 70 || d > 300) return false;
    // Pendiente razonable (si no, el cable no se sostiene)
    if (Math.abs(ya - yb) / d > 0.38) return false;
    if (!far(A.x, A.z, 40) || !far(B.x, B.z, 40) || crosses(A, B)) return false;
    const z = new Zipline(new THREE.Vector3(A.x, ya, A.z), new THREE.Vector3(B.x, yb, B.z));
    if (!clear(world, z)) return false;
    out.push(z);
    return true;
  };
  // 1) Desde las cimas hacia el borde de una zona cercana
  for (const A of rng.shuffle(highs.slice())) {
    if (out.length >= Math.ceil(max * 0.6)) break;
    if (!far(A.x, A.z, 60)) continue;
    const opts = edges.filter((e) => {
      const d = Math.hypot(e.x - A.x, e.z - A.z);
      return d > 80 && d < 290;
    });
    rng.shuffle(opts);
    for (const B of opts.slice(0, 12)) if (tryPair(A, B)) break;
  }
  // 2) Entre zonas vecinas (por encima de ríos y valles)
  for (const E of rng.shuffle(edges.slice())) {
    if (out.length >= max) break;
    const opts = edges.filter((e) => e.poi !== E.poi && Math.hypot(e.x - E.x, e.z - E.z) > 90 && Math.hypot(e.x - E.x, e.z - E.z) < 280);
    rng.shuffle(opts);
    for (const B of opts.slice(0, 6)) if (tryPair(E, B)) break;
  }
  return out;
}

// Postes (con plataforma y colisión) y cables de todas las tirolesas.
export function buildZiplines(world, list) {
  if (!list.length) return null;
  const geo = new GeoBuilder();
  const group = new THREE.Group();
  group.name = 'ziplines';
  for (const z of list) {
    for (const [p, q] of [[z.a, z.b], [z.b, z.a]]) {
      const yaw = Math.atan2(q.x - p.x, q.z - p.z);
      const rot = (((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4);
      const ctx = new BuildingCtx(geo, world.collision, p.x, p.y, p.z, rot);
      // Plataforma de madera, poste metálico y brazo con la polea
      ctx.box(-1.3, -0.6, -1.3, 1.3, 0.25, 1.3, 0x7a5a3c);
      ctx.box(-0.16, 0.25, -0.16, 0.16, ZIP_POLE + 0.6, 0.16, 0x5d6670);
      ctx.box(-0.55, ZIP_POLE - 0.05, -0.12, 0.55, ZIP_POLE + 0.12, 0.12, 0x3f464e, false);
      ctx.box(-0.22, 0.25, -1.1, 0.22, 0.9, -0.9, 0xe0a020, false);
      // Franjas amarillas y negras para verlo de lejos
      for (let k = 0; k < 3; k++) ctx.box(-0.18, ZIP_POLE - 1.4 + k * 0.4, -0.18, 0.18, ZIP_POLE - 1.2 + k * 0.4, 0.18, k % 2 ? 0x1b1b22 : 0xf2c230, false);
    }
  }
  const { group: poles, chunks } = geo.buildChunks(160);
  for (const c of chunks) world.lod.add(c.mesh, 'building', c.cx, c.cz, c.r);
  group.add(poles);
  // Cables: un tubo fino por tirolesa, todos en una sola malla
  const tubes = list.map((z) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(z.pts), z.pts.length * 2, 0.05, 4, false));
  const merged = mergeTubes(tubes);
  const cable = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.8 }));
  cable.name = 'zip-cables';
  cable.castShadow = false;
  group.add(cable);
  return group;
}

function mergeTubes(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) {
    nv += g.attributes.position.count;
    ni += g.index.count;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    const I = g.index.array;
    for (let i = 0; i < I.length; i++) idx[oi + i] = I[i] + ov;
    ov += g.attributes.position.count;
    oi += I.length;
    g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  m.computeBoundingSphere();
  return m;
}

// Tirolesa al alcance de un personaje (pos = pies): el cable debe quedar
// a menos de maxD en horizontal y entre la cabeza y un salto por encima.
export function findZipline(list, pos, maxD = 2.4) {
  let best = null;
  const hand = tmp.set(pos.x, pos.y + ZIP_HANG, pos.z);
  for (const z of list) {
    if (hand.x < z.minX || hand.x > z.maxX || hand.z < z.minZ || hand.z > z.maxZ) continue;
    const c = z.closest(hand);
    if (c.d > maxD + 3) continue;
    const p = z.pointAt(c.s, new THREE.Vector3());
    const dh = Math.hypot(p.x - hand.x, p.z - hand.z);
    const dy = p.y - hand.y; // >0: el cable está por encima de las manos
    if (dh > maxD || dy > maxD * 1.25 || dy < -1.2) continue;
    const d = dh + Math.abs(dy) * 0.5;
    if (!best || d < best.d) best = { zip: z, s: c.s, d };
  }
  return best;
}
