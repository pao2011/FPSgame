import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/rng.js';
import { GeoBuilder } from './geobuilder.js';
import { BuildingCtx } from './buildings.js';
import { addGroundDetail } from './terrain.js';
import { LOBBY } from './constants.js';

// Isla de Inicio: sala de espera antes del autobús de batalla. Está fuera del
// mapa (al este de la isla principal) y no aparece en el minimapa, pero se ve
// desde la costa. Tiene plaza central, plataformas de aparición, mesas con
// armas para practicar, dianas, palmeras y un gran cartel.
export function createLobbyIsland(world) {
  const { terrain, collision, scene } = world;
  const rng = new RNG(world.seed ^ 0x10bb1);
  const group = new THREE.Group();
  group.name = 'lobby-island';
  const cx = LOBBY.x, cz = LOBBY.z, R = LOBBY.radius;

  // ------------------------------------------------------------ TERRENO
  const RINGS = 30, SEG = 72;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  const maxR = R * 1.6;
  for (let r = 0; r <= RINGS; r++) {
    const rr = (r / RINGS) ** 1.15 * maxR;
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const h = terrain.heightAt(x, z);
      pos.push(x, h, z);
      if (h > 1.8) c.setRGB(0.33 + rng.float(0, 0.05), 0.6 + rng.float(0, 0.06), 0.24);
      else if (h > -1.2) c.setRGB(0.88, 0.8, 0.57);
      else c.setRGB(0.66, 0.6, 0.44);
      c.convertSRGBToLinear();
      col.push(c.r, c.g, c.b);
      if (r === 0) break; // el centro es un solo vértice
    }
  }
  // anillo 1..RINGS: el índice del primer vértice del anillo r es 1 + (r-1)*SEG
  const ring = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * SEG + (s % SEG));
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SEG; s++) {
      if (r === 0) idx.push(0, ring(1, s + 1), ring(1, s));
      else idx.push(ring(r, s), ring(r, s + 1), ring(r + 1, s), ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const gmat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(gmat);
  const ground = new THREE.Mesh(geo, gmat);
  ground.receiveShadow = true;
  group.add(ground);

  // ------------------------------------------------------------ PLAZA Y DECORADO
  const gb = new GeoBuilder();
  const y0 = terrain.heightAt(cx, cz);
  // Orientación: el frente del cartel mira hacia la isla principal (origen)
  const face = Math.atan2(-cx, -cz);
  const ctx = new BuildingCtx(gb, collision, cx, y0, cz, 0);
  // plaza de piedra
  ctx.geometry(new THREE.CylinderGeometry(15, 15.5, 0.6, 40), 0xc9c2b2, 0, -0.2, 0);
  ctx.geometry(new THREE.CylinderGeometry(9, 9, 0.62, 40), 0xb2aa98, 0, -0.19, 0);
  ctx.colliderOnly(-10.5, -1, -10.5, 10.5, 0.1, 10.5);
  // escenario central con el logo
  ctx.geometry(new THREE.CylinderGeometry(3.2, 3.6, 0.8, 24), 0x2f7de1, 0, 0.2, 0);
  ctx.colliderOnly(-2.6, -1, -2.6, 2.6, 0.6, 2.6);

  // Cartel gigante "ISLA DE INICIO" mirando a la isla principal
  const sx = Math.sin(face), sz = Math.cos(face);
  const signD = 24;
  const sgx = cx + sx * signD, sgz = cz + sz * signD;
  const sgy = terrain.heightAt(sgx, sgz);
  const signCtx = new BuildingCtx(gb, collision, sgx, sgy, sgz, 0);
  const px = Math.cos(face), pz = -Math.sin(face); // perpendicular al frente
  for (const k of [-6.5, 6.5]) {
    const lx = px * k, lz = pz * k;
    signCtx.box(lx - 0.35, -2, lz - 0.35, lx + 0.35, 10, lz + 0.35, 0x3a3d42);
  }
  group.add(gb.build());
  const signTex = makeSignTexture();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 5.2), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
  sign.position.set(sgx, sgy + 7.4, sgz);
  sign.rotation.y = face;
  group.add(sign);

  // Plataformas de aparición (círculos brillantes alrededor de la plaza)
  const spawns = [];
  const padMat = new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const padGeo = new THREE.RingGeometry(0.6, 1.05, 28).rotateX(-Math.PI / 2);
  const pads = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = cx + Math.cos(a) * 12.5, z = cz + Math.sin(a) * 12.5;
    const y = Math.max(terrain.heightAt(x, z), y0 + 0.1) + 0.12;
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(x, y, z);
    group.add(pad);
    pads.push(pad);
    spawns.push({ x, z, yaw: Math.atan2(-(cx - x), -(cz - z)) + Math.PI });
  }

  // Palmeras (decorativas, con colisión en el tronco). Todas en dos mallas
  // (troncos y hojas): 2 llamadas de dibujo en vez de ~200.
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 7);
  const leafGeo = new THREE.ConeGeometry(2.6, 0.9, 7, 1, true);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6440 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9a3a, side: THREE.DoubleSide });
  const trunks = [], leaves = [];
  const tm = new THREE.Matrix4(), pm = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler();
  const tp = new THREE.Vector3(), ts = new THREE.Vector3();
  let palms = 0;
  for (let i = 0; i < 200 && palms < 22; i++) {
    const a = rng.float(0, Math.PI * 2), d = rng.float(R * 0.35, R * 0.85);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const h = terrain.heightAt(x, z);
    if (h < 1.2) continue;
    if (Math.hypot(x - sgx, z - sgz) < 10) continue;
    const H = rng.float(5, 8);
    const segs = 4;
    const lean = rng.float(-0.25, 0.25);
    const rotY = rng.float(0, Math.PI * 2);
    pm.compose(tp.set(x, h - 0.2, z), tq.setFromEuler(te.set(0, rotY, 0)), ts.set(1, 1, 1));
    for (let k = 0; k < segs; k++) {
      tm.compose(tp.set(lean * k * 0.6, (k + 0.5) * (H / segs), 0), tq.identity(), ts.set(1, H / segs, 1));
      trunks.push(trunkGeo.clone().applyMatrix4(tm.premultiply(pm)));
    }
    for (let k = 0; k < 5; k++) {
      tm.compose(tp.set(lean * segs * 0.6, H + 0.1, 0), tq.setFromEuler(te.set(0.5, (k / 5) * Math.PI * 2, 0, 'YXZ')), ts.set(1, 1, 1));
      leaves.push(leafGeo.clone().applyMatrix4(tm.premultiply(pm)));
    }
    collision.add(x - 0.3, h - 1, z - 0.3, x + 0.3, h + H, z + 0.3, { type: 'building' });
    palms++;
  }
  if (palms) {
    for (const [list, m] of [[trunks, trunkMat], [leaves, leafMat]]) {
      const mesh = new THREE.Mesh(mergeGeometries(list), m);
      mesh.castShadow = true;
      group.add(mesh);
      list.forEach((g) => g.dispose());
    }
  }

  // Mesas con armas para practicar (el botín se coloca al entrar en la isla)
  const gb2 = new GeoBuilder();
  const loot = [];
  for (let i = 0; i < 4; i++) {
    const a = face + Math.PI / 4 + (i * Math.PI) / 2;
    const x = cx + Math.cos(a) * 20, z = cz + Math.sin(a) * 20;
    const h = terrain.heightAt(x, z);
    const tctx = new BuildingCtx(gb2, collision, x, h, z, 0);
    tctx.box(-1.6, 0, -0.6, 1.6, 0.9, 0.6, 0x8a6440);
    tctx.box(-1.7, 0.9, -0.7, 1.7, 1.0, 0.7, 0x6b4a2b);
    for (const k of [-1, 0, 1]) loot.push({ x: x + k * 1.0, y: h + 1.0, z });
  }
  // dianas de práctica
  const dummies = [];
  for (let i = 0; i < 4; i++) {
    const a = face + Math.PI + (i - 1.5) * 0.25;
    const x = cx + Math.cos(a) * 34, z = cz + Math.sin(a) * 34;
    const h = terrain.heightAt(x, z);
    if (h > 1) dummies.push({ x, y: h, z });
  }
  // parada del autobús junto a la plaza
  {
    const a = face - Math.PI / 2;
    const x = cx + Math.cos(a) * 17, z = cz + Math.sin(a) * 17;
    const h = terrain.heightAt(x, z);
    const bctx = new BuildingCtx(gb2, collision, x, h, z, 0);
    bctx.box(-0.08, 0, -0.08, 0.08, 3.2, 0.08, 0x3a3d42);
    bctx.box(-0.6, 2.4, -0.06, 0.6, 3.3, 0.06, 0x2f7de1, false);
    bctx.box(-2.2, 2.6, -1.2, 2.2, 2.75, 1.2, 0xd8d8d8, false);
    for (const k of [-2, 2]) bctx.box(k - 0.06, 0, -1.1, k + 0.06, 2.6, -0.98, 0x8a8f96);
    bctx.box(-1.8, 0.45, -1.0, 1.8, 0.55, -0.6, 0x8a6440);
  }
  group.add(gb2.build());

  scene.add(group);
  world.lod?.add(group, 'building', cx, cz, R * 1.6);
  return { group, spawns, loot, dummies, pads, center: new THREE.Vector3(cx, y0, cz), face };
}

function makeSignTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 332;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, '#2f7de1');
  g.addColorStop(1, '#1a3f8a');
  x.fillStyle = g;
  x.fillRect(0, 0, cv.width, cv.height);
  x.strokeStyle = '#ffd34d';
  x.lineWidth = 14;
  x.strokeRect(10, 10, cv.width - 20, cv.height - 20);
  x.textAlign = 'center';
  x.fillStyle = '#fff';
  x.font = 'bold 120px "Lilita One", "Arial Black", sans-serif';
  x.fillText('ISLA DE INICIO', cv.width / 2, 170);
  x.fillStyle = '#ffd34d';
  x.font = 'bold 52px "Lilita One", "Arial Black", sans-serif';
  x.fillText('¡El autobús de batalla sale pronto!', cv.width / 2, 260);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
