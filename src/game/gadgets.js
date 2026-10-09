import * as THREE from 'three';
import { mat, getGlowTexture } from './models.js';
import { WEAPONS, RARITIES, MATERIALS, lootForChest } from './items.js';
import { G, H, FREE_OWNER, WALL_PRESETS } from './build.js';
import { random, RNG } from '../core/rng.js';
import { GRAVITY, MAP_SEED } from '../world/constants.js';

// Objetos de Fortnite que faltaban: fogata acogedora, burbuja escudo, fuerte
// portátil (con neumático para subir), arbusto, caña de pescar con bancos de
// peces y mesas de mejora de armas.

const FIRE_TIME = 25; // s que dura la fogata
const FIRE_HEAL = 2; // vida por segundo
const FIRE_R = 4.2;
const BUBBLE_TIME = 15;
const BUBBLE_R = 4.2;
// Mejoras en la mesa: rareza de destino -> coste
const UPGRADE = [null, { mat: 'wood', n: 100 }, { mat: 'stone', n: 200 }, { mat: 'metal', n: 300 }, { mat: 'metal', n: 400 }];

const tmpV = new THREE.Vector3();

export class Gadgets {
  constructor(game) {
    this.game = game;
    this.fires = [];
    this.bubbles = [];
    this.bushes = new Map(); // personaje -> malla del arbusto
    this.hops = null;
    this.cast = null;
    this.createBenches();
    this.createFishSpots();
  }

  // ------------------------------------------------------------ PARTIDA
  reset() {
    for (const f of this.fires) this.game.scene.remove(f.mesh);
    for (const b of this.bubbles) this.game.scene.remove(b.mesh);
    for (const c of [...this.bushes.keys()]) this.setBush(c, false, true);
    this.fires = [];
    this.bubbles = [];
    this.endCast();
    for (const s of this.spots) s.ready = 0;
  }

  // ------------------------------------------------------------ USO
  // Lo llama Combat al usar un consumible con «gadget». Devuelve true si se
  // ha gastado una unidad.
  use(type, p) {
    const g = this.game;
    if (type === 'campfire') {
      const at = this.groundAhead(p, 1.6);
      if (!at) return false;
      this.addFire(at.x, at.y, at.z);
      g.net?.sendPad(at.x, at.y, at.z, 0, 'fire');
      g.hud.toast('🔥 Fogata acogedora: cura 2 de vida por segundo a quien esté cerca');
      return true;
    }
    if (type === 'bubble') {
      this.addBubble(p.pos.x, p.pos.y, p.pos.z);
      g.net?.sendPad(p.pos.x, p.pos.y, p.pos.z, 0, 'bubble');
      g.hud.toast('🫧 Burbuja escudo: para las balas durante 15 s');
      return true;
    }
    if (type === 'portafort') return this.portafort(p);
    if (type === 'bush') {
      if (p.bush) {
        g.hud.toast('Ya vas disfrazado de arbusto');
        return false;
      }
      this.setBush(p, true);
      g.hud.toast('🌳 Eres un arbusto: los enemigos no te ven de lejos hasta que te hagan daño');
      return true;
    }
    return false;
  }

  groundAhead(p, d) {
    const g = this.game;
    const x = p.pos.x - Math.sin(p.yaw) * d, z = p.pos.z - Math.cos(p.yaw) * d;
    const y = g.world.groundBelow(x, z, p.pos.y + 1.5);
    if (Math.abs(y - p.pos.y) > 1.6) {
      g.hud.toast('No se puede colocar aquí: busca suelo plano');
      return null;
    }
    return { x, y, z };
  }

  // ------------------------------------------------------------ FOGATA
  addFire(x, y, z) {
    const g = new THREE.Group();
    const log = mat(0x6b4426);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6).rotateZ(Math.PI / 2), log);
      m.rotation.y = (i * Math.PI) / 4;
      m.position.y = 0.1 + (i % 2) * 0.08;
      g.add(m);
    }
    const stones = mat(0x8a857a);
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), stones);
      const a = (i / 8) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6);
      g.add(s);
    }
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff8a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.scale.set(1.3, 1.7, 1);
    flame.position.y = 0.75;
    g.add(flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xffc23a }));
    core.position.y = 0.5;
    g.add(core);
    g.position.set(x, y, z);
    this.game.scene.add(g);
    this.fires.push({ mesh: g, flame, core, pos: g.position, t: FIRE_TIME, heal: new Map() });
  }

  // ------------------------------------------------------------ BURBUJA
  addBubble(x, y, z) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(BUBBLE_R, 28, 18),
      new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    );
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(BUBBLE_R * 1.002, 2)), new THREE.LineBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.35 }));
    m.add(wire);
    m.position.set(x, y + 0.3, z);
    m.scale.setScalar(0.1);
    this.game.scene.add(m);
    this.bubbles.push({ mesh: m, pos: m.position, t: BUBBLE_TIME });
    this.game.audio.build?.();
  }

  // Las balas no atraviesan las burbujas (ni de dentro afuera ni al revés).
  raycast(o, dir, maxT) {
    let best = null;
    for (const b of this.bubbles) {
      if (b.mesh.scale.x < 0.9) continue;
      const ox = o.x - b.pos.x, oy = o.y - b.pos.y, oz = o.z - b.pos.z;
      const bq = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - BUBBLE_R * BUBBLE_R;
      const disc = bq * bq - c;
      if (disc < 0) continue;
      const s = Math.sqrt(disc);
      let t = -bq - s;
      if (t < 0.05) t = -bq + s;
      if (t < 0.05 || t > maxT || (best && t > best.t)) continue;
      const n = new THREE.Vector3(ox + dir.x * t, oy + dir.y * t, oz + dir.z * t).normalize();
      if (c < 0) n.negate(); // desde dentro
      best = { t, normal: n };
    }
    return best;
  }

  // ------------------------------------------------------------ FUERTE PORTÁTIL
  // Torre de metal de 3 plantas alrededor de tu casilla con un neumático
  // dentro que te sube a la azotea (por un hueco del suelo de arriba).
  portafort(p) {
    const g = this.game;
    const B = g.build;
    if (!g.mode.build) {
      g.hud.toast('En este modo no se puede construir');
      return false;
    }
    const cx = Math.floor(p.pos.x / G), cz = Math.floor(p.pos.z / G);
    const base = B.levelBase(p.pos.y, p.pos.x, p.pos.z);
    const owner = { ...FREE_OWNER, mats: { metal: 999 }, isNet: false, isPlayer: false, team: p.team };
    const add = (type, lv, dir, edit = 0) => {
      const t = { type, cx, cz, base: base + lv * H, dir, edit };
      t.key = B.key(type, cx, cz, t.base, dir);
      if (B.pieces.has(t.key) || B.canPlace(t, owner, 'metal') !== 'ok') return; // no encerrar a nadie
      const piece = B.place(t, owner, 'metal');
      piece.team = p.team;
    };
    for (let lv = 0; lv < 3; lv++) for (let d = 0; d < 4; d++) add('wall', lv, d);
    add('floor', 3, 0, 1); // azotea con un hueco (casilla noroeste) encima del neumático
    for (let d = 0; d < 4; d++) add('wall', 3, d, WALL_PRESETS.find((w) => w.name.startsWith('Valla')).mask);
    const x = cx * G + G / 4, z = cz * G + G / 4;
    this.addTire(x, base, z, base + 3 * H, cx * G + G / 2, cz * G + G / 2);
    g.net?.sendPad(x, base, z, 0, 'tire');
    g.hud.toast('🏰 Fuerte portátil: súbete al neumático para llegar arriba');
    return true;
  }

  addTire(x, y, z, top = y + 3 * H, tx = x + G / 4, tz = z + G / 4) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 8, 16).rotateX(Math.PI / 2), mat(0x1c1c1c));
    tire.position.set(x, y + 0.22, z);
    this.game.scene.add(tire);
    // Salto: hasta 1,5 m por encima de la azotea
    const vy = Math.sqrt(2 * GRAVITY * (top + 1.6 - y));
    this.game.combat.pads.push({ mesh: tire, pos: tire.position, vy, hop: { top, x: tx, z: tz }, r: 0.8 });
  }

  // ------------------------------------------------------------ ARBUSTO
  setBush(c, on, silent = false) {
    const g = this.game;
    const old = this.bushes.get(c);
    if (old) {
      g.scene.remove(old);
      this.bushes.delete(c);
    }
    c.bush = !!on;
    if (on) {
      const m = new THREE.Group();
      const leaf = mat(0x3f8f3a), leaf2 = mat(0x2f7a2c);
      for (let i = 0; i < 9; i++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + (i % 3) * 0.08, 0), i % 2 ? leaf : leaf2);
        const a = (i / 9) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.35, 0.45 + (i % 3) * 0.5, Math.sin(a) * 0.35);
        m.add(s);
      }
      g.scene.add(m);
      this.bushes.set(c, m);
    } else if (!silent && c.isPlayer) g.hud.toast('🍂 Has perdido el arbusto');
    if (!silent && c.isPlayer) g.net?.sendGadget?.({ k: 'bush', on: !!on });
  }

  // ------------------------------------------------------------ MESAS DE MEJORA
  createBenches() {
    const g = this.game, w = g.world, T = w.terrain;
    this.benches = [];
    const col = w.collision;
    const random = new RNG(MAP_SEED + 31); // mismo sitio para todos (online)
    for (const poi of w.pois || []) {
      // Sitio llano y libre cerca del centro de la zona
      for (let k = 0; k < 60; k++) {
        const a = random.float(0, Math.PI * 2), r = random.float(4, Math.min(30, poi.radius * 0.6));
        const x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r;
        if (!w.isLand(x, z) || T.slopeAt(x, z) > 0.12) continue;
        const y = T.heightAt(x, z);
        if (col.overlaps(x - 1.6, y + 0.1, z - 1.6, x + 1.6, y + 2.2, z + 1.6)) continue;
        const yaw = random.float(0, Math.PI * 2);
        const mesh = makeBench();
        mesh.position.set(x, y, z);
        mesh.rotation.y = yaw;
        g.scene.add(mesh);
        col.add(x - 0.9, y, z - 0.9, x + 0.9, y + 1.0, z + 0.9, { type: 'bench' });
        this.benches.push({ mesh, pos: mesh.position, poi: poi.name });
        break;
      }
    }
  }

  // ------------------------------------------------------------ PESCA
  createFishSpots() {
    const g = this.game, w = g.world;
    this.spots = [];
    const random = new RNG(MAP_SEED + 57);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    for (let k = 0; k < 4000 && this.spots.length < 28; k++) {
      const a = random.float(0, Math.PI * 2), r = random.float(40, 560);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const depth = w.waterDepth(x, z);
      if (depth < 0.8 || depth > 7) continue;
      if (this.spots.some((s) => Math.hypot(s.x - x, s.z - z) < 60)) continue;
      const y = w.waterLevelAt(x, z) + 0.05;
      const grp = new THREE.Group();
      const rings = [];
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.95, 24).rotateX(-Math.PI / 2), ringMat.clone());
        grp.add(ring);
        rings.push(ring);
      }
      grp.position.set(x, y, z);
      g.scene.add(grp);
      this.spots.push({ x, z, y, pos: grp.position, mesh: grp, rings, ready: 0 });
    }
  }

  // Lanzar la caña hacia el banco de peces al que apuntas.
  fish(p) {
    const g = this.game;
    if (this.cast) return false;
    const eye = p.eye, dir = g.aimDir;
    let best = null, bd = 0;
    for (const s of this.spots) {
      if (s.ready > 0) continue;
      tmpV.copy(s.pos).sub(eye);
      const d = tmpV.length();
      if (d > 24) continue;
      const dot = tmpV.divideScalar(d).dot(dir);
      if (dot > 0.93 && dot > bd) {
        bd = dot;
        best = s;
      }
    }
    if (!best) {
      g.hud.toast('🎣 Apunta a un banco de peces (ondas en el agua) a menos de 24 m');
      return false;
    }
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xe0303a));
    bob.position.copy(best.pos);
    g.scene.add(bob);
    this.cast = { spot: best, bob, t: random.float(1.6, 3.2) };
    g.audio.throwSound?.(0.6);
    return true;
  }

  endCast() {
    if (!this.cast) return;
    this.game.scene.remove(this.cast.bob);
    this.cast = null;
  }

  catchFish() {
    const g = this.game;
    const s = this.cast.spot;
    this.endCast();
    s.ready = 60; // el banco tarda en volver
    const r = random.next();
    let item;
    if (r < 0.45) item = { kind: 'consumable', type: 'flopper', count: 1 };
    else if (r < 0.65) item = { kind: 'consumable', type: 'slurp', count: 1 };
    else if (r < 0.75) item = { kind: 'consumable', type: 'shieldpot', count: 1 };
    else item = lootForChest(random).find((it) => it.kind === 'weapon') || { kind: 'consumable', type: 'flopper', count: 1 };
    const p = g.player;
    g.pickups.burst([item], p.pos.clone().setY(p.pos.y + 1));
    g.effects.puff?.(s.pos.clone().setY(s.pos.y + 0.3), 0xffffff, 0.8, 0.7, null, 0.6);
    g.audio.pickup?.();
    g.hud.toast('🎣 ¡Has pescado algo!');
  }

  // ------------------------------------------------------------ INTERACCIÓN
  // Mesa de mejora: E con un arma en la mano.
  interact(input, E) {
    const g = this.game;
    const p = g.player;
    const b = this.benches.find((q) => Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 2.4 && Math.abs(q.pos.y - p.pos.y) < 2);
    if (!b) return false;
    const item = p.inventory[p.selected];
    if (!item || item.kind !== 'weapon') {
      g.hud.setPrompt('🔧 Mesa de mejora: saca un arma para mejorarla');
      return true;
    }
    const def = WEAPONS[item.type];
    const next = item.rarity + 1;
    const cost = UPGRADE[next];
    if (!cost || next > (def.maxR ?? 5)) {
      g.hud.setPrompt('🔧 Esta arma ya no se puede mejorar más');
      return true;
    }
    const have = g.infiniteMats ? Infinity : p.mats[cost.mat];
    const name = RARITIES[next].name;
    const ok = have >= cost.n;
    g.hud.setPrompt(`${E} Mejorar a <span style="color:${RARITIES[next].color}">${name}</span> <small>(${cost.n} de ${MATERIALS[cost.mat].name.toLowerCase()}${ok ? '' : ' · no tienes suficiente'})</small>`);
    if (input.hit('interact')) {
      if (!ok) {
        g.hud.toast(`Te faltan ${cost.n - p.mats[cost.mat]} de ${MATERIALS[cost.mat].name.toLowerCase()}`);
        return true;
      }
      if (!g.infiniteMats) p.mats[cost.mat] -= cost.n;
      item.rarity = next;
      item.mag = Math.max(item.mag, 0);
      g.combat.modelKey = null; // vuelve a crear el arma con el color nuevo
      g.audio.vault?.('open');
      g.effects.puff?.(b.pos.clone().setY(b.pos.y + 1.2), 0xffe27a, 1, 0.8, null, 0.7);
      g.hud.toast(`🔧 ${def.name} mejorada a ${name}`);
      p.stats.upgrades = (p.stats.upgrades || 0) + 1;
    }
    return true;
  }

  // ------------------------------------------------------------ UPDATE
  update(dt) {
    const g = this.game;
    const time = g.time;
    // Fogatas: curan a los personajes que simula este ordenador
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      const k = 0.85 + Math.sin(time * 13 + i) * 0.1 + Math.sin(time * 7.3) * 0.05;
      f.flame.scale.set(1.3 * k, 1.7 * k * Math.min(1, f.t / 3 + 0.3), 1);
      f.core.scale.setScalar(Math.max(0.2, Math.min(1, f.t / 3)) * k);
      for (const c of g.characters()) {
        if (!c.alive || c.knocked || c.health >= 100 || (g.net && !g.net.isLocal(c))) continue;
        if (Math.hypot(c.pos.x - f.pos.x, c.pos.z - f.pos.z) > FIRE_R || Math.abs(c.pos.y - f.pos.y) > 2.5) continue;
        c.health = Math.min(100, c.health + FIRE_HEAL * dt);
      }
      if (f.t <= 0) {
        g.scene.remove(f.mesh);
        this.fires.splice(i, 1);
      }
    }
    // Burbujas: crecen al aparecer y se apagan al final
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t -= dt;
      const grow = Math.min(1, b.mesh.scale.x + dt * 4);
      b.mesh.scale.setScalar(b.t < 0.4 ? Math.max(0.01, b.t / 0.4) : grow);
      b.mesh.material.opacity = 0.13 + Math.sin(time * 3 + i) * 0.03;
      if (b.t <= 0) {
        g.scene.remove(b.mesh);
        this.bubbles.splice(i, 1);
      }
    }
    // Arbustos: siguen al personaje
    for (const [c, m] of this.bushes) {
      if (!c.alive || c.knocked) {
        this.setBush(c, false, !c.isPlayer);
        continue;
      }
      m.position.copy(c.pos);
      m.scale.setScalar(c.crouching ? 0.85 : 1);
      m.visible = c.mode === 'ground' && (c.model?.root?.visible ?? true);
    }
    // Neumático del fuerte: al pasar la azotea, empujón hacia el centro
    const p = g.player;
    if (p.fortHop) {
      const h = p.fortHop;
      if (p.pos.y > h.top + 0.6 && p.vel.y < 4) {
        p.vel.x = (h.x - p.pos.x) * 3;
        p.vel.z = (h.z - p.pos.z) * 3;
        p.fortHop = null;
      } else if (p.onGround && p.vel.y <= 0) p.fortHop = null;
    }
    // Bancos de peces
    const cam = g.camera.position;
    for (const s of this.spots) {
      if (s.ready > 0) s.ready -= dt;
      const near = s.ready <= 0 && Math.abs(s.x - cam.x) < 140 && Math.abs(s.z - cam.z) < 140;
      s.mesh.visible = near;
      if (!near) continue;
      s.rings.forEach((r, i) => {
        const k = (time * 0.6 + i / 3) % 1;
        r.scale.setScalar(0.4 + k * 1.6);
        r.material.opacity = 0.55 * (1 - k);
      });
    }
    // Pesca en curso
    if (this.cast) {
      const c = this.cast;
      c.t -= dt;
      c.bob.position.y = c.spot.y + 0.05 + Math.sin(time * 6) * 0.04 - (c.t < 0.5 ? 0.12 : 0);
      if (!p.alive || p.pos.distanceTo(c.spot.pos) > 30) this.endCast();
      else if (c.t <= 0) this.catchFish();
    }
    // Mesas de mejora: brillo suave
    for (const b of this.benches) {
      const glow = b.mesh.userData.glow;
      if (glow) glow.material.opacity = 0.5 + Math.sin(time * 3 + b.pos.x) * 0.2;
    }
  }
}

function makeBench() {
  const g = new THREE.Group();
  const add = (w, h, d, c, x, y, z, opts) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, opts));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(1.8, 0.12, 1.0, 0x8a5a32, 0, 0.9, 0); // tablero
  for (const [x, z] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) add(0.1, 0.9, 0.1, 0x5b3a1e, x, 0.45, z);
  add(1.6, 0.06, 0.8, 0x6b4426, 0, 0.3, 0); // balda
  add(0.3, 0.25, 0.3, 0x55595e, -0.55, 1.08, 0); // tornillo de banco
  add(0.5, 0.06, 0.08, 0x8a8f96, -0.55, 1.2, 0.2);
  add(0.4, 0.08, 0.15, 0xc0392b, 0.4, 1.0, 0.15); // caja de herramientas
  add(0.08, 0.03, 0.5, 0xbfbfbf, 0.2, 0.98, -0.2); // llave
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffd34d, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(2.2, 1.6, 1);
  glow.position.y = 1.3;
  g.add(glow);
  g.userData.glow = glow;
  return g;
}

