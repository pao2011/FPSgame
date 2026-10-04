import * as THREE from 'three';
import { ISLAND_RADIUS } from './constants.js';

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
    if (world.occupied(x, z, margin)) return null;
    if (world.roads.edgeDistance(x, z, 24) < margin + 1) return null;
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
    if (world.creative && Math.hypot(x, z) < 300) continue;
    if (world.occupied(x, z, 2) || world.poiAt(x, z) || world.roads.edgeDistance(x, z, 24) < 3) continue;
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

  const instanced = (geo, material, list, fn, shadow = true) => {
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach((t, i) => {
      fn(t, i, mesh);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 1, 6).translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const all = [...pines, ...rounds];
  const trunkMesh = instanced(trunkGeo, trunkMat, all, (t, i) => {
    const th = t.pine ? 2.2 : 2.8;
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y - 0.2, t.z), q, new THREE.Vector3(t.s, th * t.s, t.s));
  });

  const pineGeo = new THREE.ConeGeometry(1.8, 5.5, 7).translate(0, 4.6, 0);
  const pineGeo2 = new THREE.ConeGeometry(1.35, 3.8, 7).translate(0, 7.0, 0);
  const pineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const pineMeshes = [];
  for (const g of [pineGeo, pineGeo2]) {
    pineMeshes.push(instanced(g, pineMat, pines, (t, i, mesh) => {
      q.setFromAxisAngle(up, t.rot);
      m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      col.setHSL(0.36 + rng.float(-0.03, 0.03), 0.5, 0.24 + rng.float(-0.04, 0.04));
      mesh.setColorAt(i, col);
    }));
  }

  const roundGeo = new THREE.IcosahedronGeometry(2.4, 0).translate(0, 4.6, 0);
  const roundMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const roundMesh = instanced(roundGeo, roundMat, rounds, (t, i, mesh) => {
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s * 1.1, t.s, t.s * 1.1));
    col.setHSL(0.27 + rng.float(-0.05, 0.05), 0.55, 0.36 + rng.float(-0.06, 0.06));
    mesh.setColorAt(i, col);
  });

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const rockMesh = instanced(rockGeo, rockMat, rocks, (t, i, mesh) => {
    q.setFromEuler(new THREE.Euler(rng.float(0, 1), t.rot, rng.float(0, 1)));
    m.compose(new THREE.Vector3(t.x, t.y + t.s * 0.25, t.z), q, new THREE.Vector3(t.s * 1.2, t.s * 0.8, t.s));
    const g = 0.45 + rng.float(-0.06, 0.08);
    col.setRGB(g, g * 0.98, g * 0.94);
    mesh.setColorAt(i, col);
  });

  const bushGeo = new THREE.IcosahedronGeometry(0.9, 0).translate(0, 0.5, 0);
  instanced(bushGeo, roundMat, bushes, (t, i, mesh) => {
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s * 1.3, t.s, t.s * 1.3));
    col.setHSL(0.3 + rng.float(-0.04, 0.04), 0.5, 0.3 + rng.float(-0.05, 0.05));
    mesh.setColorAt(i, col);
  }, false);

  // Colisiones y datos para poder talar/picar (ver game/harvest.js)
  const harvestables = [];
  all.forEach((t, i) => {
    t.kind = 'tree';
    t.mat = 'wood';
    t.hp = t.maxHp = Math.round(120 * t.s);
    t.parts = [{ mesh: trunkMesh, index: i }];
    t.center = new THREE.Vector3(t.x, t.y, t.z);
    const e = 0.35 * t.s;
    t.boxes = [[t.x - e, t.y - 1, t.z - e, t.x + e, t.y + (t.pine ? 9 : 3.2) * t.s, t.z + e, 'tree']];
    if (!t.pine) t.boxes.push([t.x - 1.7 * t.s, t.y + 3.2 * t.s, t.z - 1.7 * t.s, t.x + 1.7 * t.s, t.y + 6.2 * t.s, t.z + 1.7 * t.s, 'leaves']);
    harvestables.push(t);
  });
  pines.forEach((t, i) => pineMeshes.forEach((mesh) => t.parts.push({ mesh, index: i })));
  rounds.forEach((t, i) => t.parts.push({ mesh: roundMesh, index: i }));
  rocks.forEach((r, i) => {
    r.kind = 'rock';
    r.mat = 'stone';
    r.hp = r.maxHp = Math.round(90 * r.s + 60);
    r.parts = [{ mesh: rockMesh, index: i }];
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
