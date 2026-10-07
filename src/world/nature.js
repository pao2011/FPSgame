import * as THREE from 'three';
import { ISLAND_RADIUS } from './constants.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { usesPBR, isMobileQuality } from '../game/models.js';

// Geometría con color por vértice (para fusionar varias piezas en una).
function tinted(geo, r, g, b) {
  const ng = geo.index ? geo.toNonIndexed() : geo;
  const n = ng.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = r;
    c[i * 3 + 1] = g;
    c[i * 3 + 2] = b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (ng.attributes.uv) ng.deleteAttribute('uv');
  return ng;
}

// Deforma una geometría con ruido determinista (rocas y copas irregulares).
function lumpy(geo, amount, seed) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let f = cache.get(k);
    if (f === undefined) {
      f = 1 + (Math.sin(v.x * 12.9 + seed) * Math.cos(v.z * 7.3 - seed) + Math.sin(v.y * 9.1 + seed * 2)) * amount;
      cache.set(k, f);
    }
    v.multiplyScalar(f);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Árboles, rocas y arbustos instanciados.
export function createNature(world, rng) {
  const { terrain, collision, scene } = world;
  const pines = [];
  const rounds = [];
  const rocks = [];
  const bushes = [];

  const accept = (x, z, margin) => {
    // Creativo: el centro de la isla queda libre para construir
    if (world.creative && Math.hypot(x, z) < 300) return null;
    const h = terrain.heightAt(x, z);
    if (h < 2.5 || h > 58) return null;
    if (terrain.slopeAt(x, z) > 0.8) return null;
    if (world.waterDepth && world.waterDepth(x, z) > -0.4) return null; // ni en lagos ni en ríos
    if (world.occupied(x, z, margin)) return null;
    if (world.roads.edgeDistance(x, z, 24) < margin + 1) return null;
    if (world.nearZipline(x, z, margin + 3.5)) return null;
    const poi = world.poiAt(x, z);
    if (poi && poi.type !== 'town' && poi.type !== 'farm') return null;
    if (poi && !rng.chance(0.12)) return null;
    return h;
  };

  for (let i = 0; i < 20000 && pines.length + rounds.length < 3600; i++) {
    const ang = rng.float(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * ISLAND_RADIUS;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const forest = world.noise(x * 0.006 + 300, z * 0.006);
    if (forest < -0.15 && !rng.chance(0.08)) continue;
    const h = accept(x, z, 2);
    if (h === null) continue;
    const s = rng.float(0.8, 1.5);
    const t = { x, y: h, z, s, rot: rng.float(0, Math.PI * 2) };
    t.pine = h > 30 || rng.chance(0.4);
    if (t.pine) pines.push(t);
    else rounds.push(t);
  }
  for (let i = 0; i < 6000 && rocks.length < 520; i++) {
    const ang = rng.float(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * (ISLAND_RADIUS + 10);
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const h = terrain.heightAt(x, z);
    if (h < 0.5) continue;
    if (world.waterDepth && world.waterDepth(x, z) > 0.3) continue;
    if (world.creative && Math.hypot(x, z) < 300) continue;
    if (world.occupied(x, z, 2) || world.poiAt(x, z) || world.roads.edgeDistance(x, z, 24) < 3 || world.nearZipline(x, z, 3)) continue;
    rocks.push({ x, y: h, z, s: rng.float(0.8, 3.2), rot: rng.float(0, Math.PI * 2) });
  }
  for (let i = 0; i < 9000 && bushes.length < 1400; i++) {
    const ang = rng.float(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * ISLAND_RADIUS;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const h = accept(x, z, 1);
    if (h === null) continue;
    bushes.push({ x, y: h, z, s: rng.float(0.6, 1.2), rot: rng.float(0, Math.PI * 2) });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();

  // Instancias repartidas en parcelas de CH m: cada parcela es un InstancedMesh
  // con su esfera envolvente (three.js descarta las que no se ven) y se
  // registra en world.lod para ocultarla cuando queda lejos. Se recorre la
  // lista en su orden original para que el generador aleatorio dé lo mismo.
  // Devuelve, para cada elemento, { mesh, index } (para talar/picar).
  const CH = 160;
  const chunked = (geo, material, list, fn, shadow, kind) => {
    const groups = new Map();
    const slot = list.map((t) => {
      const key = Math.floor(t.x / CH) * 1000 + Math.floor(t.z / CH);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { n: 0, mesh: null, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }));
      g.minX = Math.min(g.minX, t.x);
      g.maxX = Math.max(g.maxX, t.x);
      g.minZ = Math.min(g.minZ, t.z);
      g.maxZ = Math.max(g.maxZ, t.z);
      return { g, index: g.n++ };
    });
    for (const g of groups.values()) {
      const mesh = (g.mesh = new THREE.InstancedMesh(geo, material, g.n));
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
    }
    const parts = list.map((t, i) => {
      const { g, index } = slot[i];
      fn(t, index, g.mesh);
      g.mesh.setMatrixAt(index, m);
      return { mesh: g.mesh, index };
    });
    for (const g of groups.values()) {
      const mesh = g.mesh;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      const cx = (g.minX + g.maxX) / 2, cz = (g.minZ + g.maxZ) / 2;
      world.lod?.add(mesh, kind, cx, cz, Math.hypot(g.maxX - g.minX, g.maxZ - g.minZ) / 2 + 4);
    }
    return parts;
  };

  const PBR = usesPBR();
  // Móvil: menos polígonos por árbol/roca/arbusto
  const LITE = isMobileQuality();
  const ico = LITE ? 0 : 1;
  const M = ({ roughness = 0.9, ...o }) => (PBR ? new THREE.MeshStandardMaterial({ roughness, metalness: 0, ...o }) : new THREE.MeshLambertMaterial(o));
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.36, 1, LITE ? 5 : 7, 1, LITE).translate(0, 0.5, 0);
  const trunkMat = M({ color: 0x6b4a2b });
  const all = [...pines, ...rounds];
  const trunkParts = chunked(trunkGeo, trunkMat, all, (t) => {
    const th = t.pine ? 2.2 : 2.8;
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y - 0.2, t.z), q, new THREE.Vector3(t.s, th * t.s, t.s));
  }, !LITE, 'tree');

  // Pino: tres pisos de ramas (más oscuros abajo) en una sola geometría
  const pineGeo = mergeGeometries([
    tinted(new THREE.ConeGeometry(2.0, 4.0, LITE ? 6 : 8).translate(0, 3.6, 0), 0.78, 0.82, 0.78),
    tinted(new THREE.ConeGeometry(1.6, 3.4, LITE ? 6 : 8).rotateY(0.4).translate(0, 5.6, 0), 0.9, 0.95, 0.9),
    tinted(new THREE.ConeGeometry(1.1, 2.8, LITE ? 6 : 8).rotateY(0.8).translate(0, 7.5, 0), 1.05, 1.08, 1.0),
  ]);
  const pineMat = M({ color: 0xffffff, vertexColors: true, flatShading: true });
  const pineParts = chunked(pineGeo, pineMat, pines, (t, i, mesh) => {
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
    col.setHSL(0.36 + rng.float(-0.03, 0.03), 0.5, 0.24 + rng.float(-0.04, 0.04));
    mesh.setColorAt(i, col);
  }, true, 'tree');

  // Árbol frondoso: racimo de copas irregulares
  const blob = (r, x, y, z, k, seed) => tinted(lumpy(new THREE.IcosahedronGeometry(r, ico), 0.08, seed).translate(x, y, z), k, k, k * 0.95);
  const roundGeo = mergeGeometries([
    blob(1.9, 0, 4.4, 0, 0.85, 1),
    blob(1.4, 1.1, 5.2, 0.4, 1.0, 2),
    blob(1.3, -0.9, 5.4, -0.5, 1.05, 3),
    blob(1.1, 0.2, 6.2, -0.2, 1.15, 4),
  ]);
  const roundMat = M({ color: 0xffffff, vertexColors: true, flatShading: true });
  const roundParts = chunked(roundGeo, roundMat, rounds, (t, i, mesh) => {
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s * 1.1, t.s, t.s * 1.1));
    col.setHSL(0.27 + rng.float(-0.05, 0.05), 0.55, 0.36 + rng.float(-0.06, 0.06));
    mesh.setColorAt(i, col);
  }, true, 'tree');

  const rockGeo = lumpy(new THREE.IcosahedronGeometry(1, ico), 0.14, 7);
  const rockMat = M({ color: 0xffffff, flatShading: true, roughness: 0.95 });
  const rockParts = chunked(rockGeo, rockMat, rocks, (t, i, mesh) => {
    q.setFromEuler(new THREE.Euler(rng.float(0, 1), t.rot, rng.float(0, 1)));
    m.compose(new THREE.Vector3(t.x, t.y + t.s * 0.25, t.z), q, new THREE.Vector3(t.s * 1.2, t.s * 0.8, t.s));
    const g = 0.45 + rng.float(-0.06, 0.08);
    col.setRGB(g, g * 0.98, g * 0.94);
    mesh.setColorAt(i, col);
  }, !LITE, 'rock');

  const bushGeo = mergeGeometries([
    tinted(lumpy(new THREE.IcosahedronGeometry(0.8, ico), 0.1, 11).translate(0, 0.5, 0), 0.9, 0.9, 0.9),
    tinted(lumpy(new THREE.IcosahedronGeometry(0.55, ico), 0.1, 12).translate(0.45, 0.75, 0.2), 1.1, 1.1, 1.05),
  ]);
  chunked(bushGeo, roundMat, bushes, (t, i, mesh) => {
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s * 1.3, t.s, t.s * 1.3));
    col.setHSL(0.3 + rng.float(-0.04, 0.04), 0.5, 0.3 + rng.float(-0.05, 0.05));
    mesh.setColorAt(i, col);
  }, false, 'bush');

  // Colisiones y datos para poder talar/picar (ver game/harvest.js)
  const harvestables = [];
  all.forEach((t, i) => {
    t.kind = 'tree';
    t.mat = 'wood';
    t.hp = t.maxHp = Math.round(120 * t.s);
    t.parts = [trunkParts[i]];
    t.center = new THREE.Vector3(t.x, t.y, t.z);
    const e = 0.35 * t.s;
    t.boxes = [[t.x - e, t.y - 1, t.z - e, t.x + e, t.y + (t.pine ? 9 : 3.2) * t.s, t.z + e, 'tree']];
    if (!t.pine) t.boxes.push([t.x - 1.7 * t.s, t.y + 3.2 * t.s, t.z - 1.7 * t.s, t.x + 1.7 * t.s, t.y + 6.2 * t.s, t.z + 1.7 * t.s, 'leaves']);
    harvestables.push(t);
  });
  pines.forEach((t, i) => t.parts.push(pineParts[i]));
  rounds.forEach((t, i) => t.parts.push(roundParts[i]));
  rocks.forEach((r, i) => {
    r.kind = 'rock';
    r.mat = 'stone';
    r.hp = r.maxHp = Math.round(90 * r.s + 60);
    r.parts = [rockParts[i]];
    r.center = new THREE.Vector3(r.x, r.y, r.z);
    const e = r.s * 0.75;
    r.boxes = [[r.x - e, r.y - 1, r.z - e, r.x + e, r.y + r.s * 0.8, r.z + e, 'rock']];
    harvestables.push(r);
  });
  for (const h of harvestables) {
    h.colliders = h.boxes.map((b) => collision.add(b[0], b[1], b[2], b[3], b[4], b[5], { type: b[6], ref: h }));
  }

  return { pines, rounds, rocks, bushes, harvestables };
}
