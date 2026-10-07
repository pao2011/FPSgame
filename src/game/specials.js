import * as THREE from 'three';
import { random } from '../core/rng.js';
import { makeWeapon, WEAPONS, AMMO } from './items.js';
import { getGlowTexture } from './models.js';
import { ISLAND_RADIUS } from '../world/constants.js';

// Botín especial de las partidas contra bots:
//  · Llamas de botín escondidas por la isla: mantén E para abrirlas.
//  · Suministros que caen del cielo con un globo y una columna de humo.
//  · La corona: la lleva quien ganó la partida anterior (o un bot); si lo
//    eliminan cae al suelo y la puede coger cualquiera. Ganar con ella es una
//    «victoria coronada» y la racha sigue mientras sigas ganando.
const LLAMAS = 4;
const DROP_TIMES = [75, 160, 250, 340, 430];
const OPEN_LLAMA = 1.2; // s manteniendo E
const OPEN_DROP = 1.0;

const tmp = new THREE.Vector3();

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra });
}

// Llama piñata: cuerpo morado con franjas de colores, cuello, cabeza y orejas.
function makeLlama() {
  const g = new THREE.Group();
  const body = mat(0x8a3fd6), stripe = [0xffd34d, 0x3fa9ff, 0xff5a8a, 0x5fe05a];
  const box = (w, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'number' ? mat(c) : c);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  box(0.8, 0.6, 1.3, body, 0, 1.0, 0);
  stripe.forEach((c, i) => box(0.84, 0.1, 0.16, c, 0, 1.0 + (i % 2 ? 0.12 : -0.12), -0.45 + i * 0.3));
  box(0.36, 0.9, 0.36, body, 0, 1.65, -0.5);
  box(0.42, 0.36, 0.6, body, 0, 2.15, -0.68);
  box(0.12, 0.26, 0.1, 0xffd34d, -0.12, 2.43, -0.55);
  box(0.12, 0.26, 0.1, 0xffd34d, 0.12, 2.43, -0.55);
  box(0.07, 0.07, 0.04, 0x111111, -0.14, 2.22, -0.99);
  box(0.07, 0.07, 0.04, 0x111111, 0.14, 2.22, -0.99);
  for (const [x, z] of [[-0.28, -0.45], [0.28, -0.45], [-0.28, 0.45], [0.28, 0.45]]) box(0.16, 0.75, 0.16, 0x6a2fb0, x, 0.37, z);
  box(0.9, 0.08, 0.6, 0xff5a8a, 0, 1.34, 0.1); // silla
  box(0.12, 0.3, 0.12, body, 0, 1.15, 0.72); // cola
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xc78bff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(3.4, 3.4, 1);
  glow.position.y = 1.3;
  g.add(glow);
  return g;
}

// Caja de suministros con globo, cuerdas y columna de humo azul.
function makeDrop() {
  const g = new THREE.Group();
  const crate = new THREE.Group();
  const add = (geo, m, x, y, z, parent = crate) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(1.4, 1.1, 1.4), mat(0x2f6fd6), 0, 0.55, 0);
  for (const y of [0.08, 1.02]) add(new THREE.BoxGeometry(1.46, 0.12, 1.46), mat(0xf2c230), 0, y, 0);
  add(new THREE.BoxGeometry(0.12, 1.1, 1.46), mat(0xf2c230), 0, 0.55, 0);
  add(new THREE.BoxGeometry(1.46, 1.1, 0.12), mat(0xf2c230), 0, 0.55, 0);
  g.add(crate);
  const balloon = new THREE.Group();
  add(new THREE.SphereGeometry(1.3, 16, 12), mat(0x3fa9ff, { roughness: 0.3 }), 0, 4.6, 0, balloon);
  add(new THREE.ConeGeometry(0.3, 0.4, 8), mat(0x2f6fd6), 0, 3.2, 0, balloon);
  const rope = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([-0.6, 0.6].flatMap((x) => [-0.6, 0.6].flatMap((z) => [new THREE.Vector3(x, 1.1, z), new THREE.Vector3(0, 3.1, 0)]))),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  balloon.add(rope);
  g.add(balloon);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.6, 120, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = 60;
  g.add(beam);
  g.userData = { crate, balloon, beam };
  return g;
}

// Corona dorada con puntas y gemas.
function makeCrown() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.85, roughness: 0.25, emissive: 0x6b4a00, emissiveIntensity: 0.4 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.12, 14, 1, true), gold);
  ring.material.side = THREE.DoubleSide;
  g.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), gold);
    spike.position.set(Math.cos(a) * 0.19, 0.12, Math.sin(a) * 0.19);
    g.add(spike);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xd63a2f : 0x3a8dff, emissive: i % 2 ? 0x600000 : 0x002060 }));
    gem.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
    g.add(gem);
  }
  return g;
}

export class Specials {
  constructor(game) {
    this.game = game;
    this.llamas = [];
    this.drops = [];
    this.active = false;
    this.crown = { holder: null, pos: null, mesh: null, glow: null, startStreak: 0, startedWith: false };
  }

  // Sólo en partidas battle royale locales (en online el botín lo arbitra el servidor).
  start(mode) {
    this.clear();
    const g = this.game;
    this.active = !g.net && !mode.respawn && !mode.creative && !mode.noBots && !g.world.creative;
    if (!this.active) return;
    // Llamas en sitios escondidos (lejos de las zonas, en el campo)
    for (let i = 0, tries = 0; i < LLAMAS && tries < 600; tries++) {
      const p = this.randomSpot(ISLAND_RADIUS * 0.82, true);
      if (!p || this.llamas.some((l) => l.pos.distanceTo(p) < 150)) continue;
      const mesh = makeLlama();
      mesh.position.copy(p);
      mesh.rotation.y = random.float(0, Math.PI * 2);
      g.scene.add(mesh);
      const col = g.world.collision.add(p.x - 0.5, p.y, p.z - 0.75, p.x + 0.5, p.y + 1.4, p.z + 0.75, { type: 'llama' });
      this.llamas.push({ pos: p, mesh, col, hold: 0, phase: random.float(0, 6) });
      i++;
    }
    this.dropQueue = DROP_TIMES.slice();
    // Corona: tuya si ganaste la anterior; si no, a veces la lleva un bot
    const streak = g.progress?.data.crown || 0;
    this.crown.startStreak = streak;
    this.crown.startedWith = streak > 0;
    if (streak > 0) this.giveCrown(g.player, true);
    else if (random.chance(0.35)) {
      const bots = g.bots.list.filter((b) => !b.boss && b.alive);
      if (bots.length) this.giveCrown(random.pick(bots), true);
    }
  }

  clear() {
    const g = this.game;
    for (const l of this.llamas) {
      g.scene.remove(l.mesh);
      if (l.col) g.world.collision.remove(l.col);
    }
    for (const d of this.drops) {
      g.scene.remove(d.mesh);
      if (d.col) g.world.collision.remove(d.col);
    }
    this.llamas = [];
    this.drops = [];
    this.dropQueue = [];
    const c = this.crown;
    if (c.holder) c.holder.crowned = false;
    c.holder = null;
    c.pos = null;
    if (c.mesh) {
      c.mesh.parent?.remove(c.mesh);
      c.glow.visible = false;
    }
    this.active = false;
  }

  // Punto de tierra firme al aire libre (sin edificios encima ni agua).
  randomSpot(maxR, hidden = false) {
    const w = this.game.world;
    for (let i = 0; i < 60; i++) {
      const a = random.float(0, Math.PI * 2), r = Math.sqrt(random.next()) * maxR;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = w.terrain.heightAt(x, z);
      if (y < 2 || w.terrain.slopeAt(x, z) > 0.5) continue;
      if ((w.waterDepth?.(x, z) ?? -1) > -0.3) continue;
      if (w.collision.overlaps(x - 1.5, y + 0.1, z - 1.5, x + 1.5, y + 30, z + 1.5)) continue;
      if (hidden && w.poiAt(x, z)) continue;
      return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  // ------------------------------------------------------------ CORONA
  ensureCrownMesh() {
    const cr = this.crown;
    if (!cr.mesh) {
      cr.mesh = makeCrown();
      cr.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffd34d, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      cr.glow.scale.set(2.2, 2.2, 1);
      cr.glow.visible = false;
      this.game.scene.add(cr.glow);
    }
  }

  giveCrown(c, quiet = false) {
    const cr = this.crown;
    this.ensureCrownMesh();
    if (cr.holder) cr.holder.crowned = false;
    cr.holder = c;
    cr.pos = null;
    cr.glow.visible = false;
    c.crowned = true;
    const head = c.model.head;
    head.add(cr.mesh);
    cr.mesh.position.set(0, 0.36, 0);
    cr.mesh.rotation.set(0, 0, 0);
    cr.mesh.scale.setScalar(1);
    if (quiet) return;
    const g = this.game;
    if (c.isPlayer) {
      g.hud.toast('👑 ¡Tienes la corona! Gana la partida para conseguir una victoria coronada');
      g.audio.chest?.();
    } else g.hud.killFeed(`👑 <b>${c.name}</b> ha cogido la corona`, false);
  }

  dropCrown(pos) {
    const cr = this.crown;
    const g = this.game;
    this.ensureCrownMesh();
    if (cr.holder) {
      cr.holder.crowned = false;
      if (cr.holder.isPlayer) g.hud.toast('👑 Has perdido la corona');
      else g.hud.killFeed(`👑 <b>${cr.holder.name}</b> ha perdido la corona: ¡está en el suelo!`, false);
    }
    cr.holder = null;
    cr.mesh.parent?.remove(cr.mesh);
    g.scene.add(cr.mesh);
    const y = g.world.groundBelow(pos.x, pos.z, pos.y + 1.5);
    cr.pos = new THREE.Vector3(pos.x, Math.max(y, g.world.waterLevelAt?.(pos.x, pos.z) ?? 0) + 1.0, pos.z);
    cr.mesh.position.copy(cr.pos);
    cr.mesh.scale.setScalar(2.2);
    cr.glow.position.copy(cr.pos);
    cr.glow.visible = true;
  }

  // Racha de victoria coronada si el jugador gana con la corona puesta.
  crownWin() {
    const cr = this.crown;
    if (cr.holder !== this.game.player) return 0;
    return cr.startedWith ? cr.startStreak + 1 : 1;
  }

  // ------------------------------------------------------------ SUMINISTROS
  spawnDrop() {
    const g = this.game;
    const st = g.storm;
    // Dentro de la próxima zona segura (o de la actual)
    const cx = st.next?.x ?? st.center.x, cz = st.next?.y ?? st.center.y;
    const r = Math.max(30, (st.nextRadius ?? st.radius) * 0.7);
    let p = null;
    for (let i = 0; i < 40 && !p; i++) {
      const a = random.float(0, Math.PI * 2), d = Math.sqrt(random.next()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.hypot(x, z) > ISLAND_RADIUS * 0.88) continue;
      const y = g.world.groundBelow(x, z, 300);
      if (y < 1.5 || (g.world.waterDepth?.(x, z) ?? -1) > -0.3) continue;
      p = new THREE.Vector3(x, y, z);
    }
    if (!p) return;
    const mesh = makeDrop();
    mesh.position.set(p.x, p.y + 140, p.z);
    g.scene.add(mesh);
    this.drops.push({ ground: p, mesh, landed: false, opened: false, hold: 0, col: null });
    g.hud.killFeed('📦 <b>¡Un suministro cae del cielo!</b> Búscalo en el mapa', false);
    g.audio.busHorn?.();
  }

  // ------------------------------------------------------------ BOTÍN
  llamaLoot() {
    const heals = ['shieldpot', 'medkit', 'slurp', 'smallshield', 'bandage'];
    const thr = ['grenade', 'impulse', 'sticky', 'smoke'];
    const out = [
      { kind: 'material', mat: 'wood', count: 200 }, { kind: 'material', mat: 'stone', count: 150 }, { kind: 'material', mat: 'metal', count: 100 },
      ...['light', 'medium', 'heavy', 'shells'].map((a) => ({ kind: 'ammo', ammo: a, count: AMMO[a].pickup * 3 })),
      { kind: 'consumable', type: random.pick(heals), count: 2 },
      { kind: 'consumable', type: random.pick(heals), count: 2 },
      { kind: 'throwable', type: random.pick(thr), count: 3 },
    ];
    if (random.chance(0.5)) out.push({ kind: 'consumable', type: random.chance(0.5) ? 'grappler' : 'launchpad', count: random.chance(0.5) ? 10 : 1 });
    return out;
  }

  dropLoot() {
    const types = Object.keys(WEAPONS).filter((k) => !WEAPONS[k].explosive && (WEAPONS[k].maxR ?? 5) >= 4);
    const t1 = random.pick(types);
    const t2 = random.pick(types.filter((t) => WEAPONS[t].cat !== WEAPONS[t1].cat));
    return [
      makeWeapon(t1, random.chance(0.3) ? 5 : 4),
      makeWeapon(t2, 4),
      { kind: 'ammo', ammo: WEAPONS[t1].ammo, count: AMMO[WEAPONS[t1].ammo].pickup * 3 },
      { kind: 'ammo', ammo: WEAPONS[t2].ammo, count: AMMO[WEAPONS[t2].ammo].pickup * 3 },
      { kind: 'consumable', type: random.chance(0.4) ? 'chugjug' : 'slurp', count: 1 },
      { kind: 'consumable', type: 'shieldpot', count: 2 },
      { kind: 'material', mat: 'metal', count: 150 },
    ];
  }

  // Confeti al abrir una llama
  confetti(pos) {
    const fx = this.game.effects;
    for (let i = 0; i < 18; i++) {
      tmp.set(pos.x + random.float(-0.6, 0.6), pos.y + 1.2 + random.float(0, 0.8), pos.z + random.float(-0.6, 0.6));
      fx.chunk(tmp, random.pick([0xffd34d, 0x3fa9ff, 0xff5a8a, 0x5fe05a, 0xc78bff]), 0.6, null, 6);
    }
    fx.puff(tmp.set(pos.x, pos.y + 1.2, pos.z), 0xe8d0ff, 1.2, 0.8, null, 0.5);
  }

  // ------------------------------------------------------------ INTERACCIÓN
  // Mantener E junto a una llama o un suministro posado. true = gestionado.
  interact(input, E, dt) {
    if (!this.active) return false;
    const g = this.game;
    const p = g.player;
    let target = null, kind = '';
    for (const l of this.llamas) if (l.pos.distanceTo(p.pos) < 2.6) (target = l), (kind = 'llama');
    for (const d of this.drops) if (d.landed && !d.opened && d.ground.distanceTo(p.pos) < 2.6) (target = d), (kind = 'drop');
    if (!target) return false;
    const total = kind === 'llama' ? OPEN_LLAMA : OPEN_DROP;
    const label = kind === 'llama' ? 'Abrir la llama de botín' : 'Abrir el suministro';
    if (input.held('interact')) {
      target.hold += dt;
      g.hud.setProgress(Math.min(1, target.hold / total), `${label}…`);
      if (target.hold >= total) {
        g.hud.setProgress(null);
        if (kind === 'llama') this.openLlama(target);
        else this.openDrop(target);
      }
    } else if (target.hold > 0) {
      target.hold = 0;
      g.hud.setProgress(null);
    }
    g.hud.setPrompt(`Mantén ${E} · ${label}`);
    return true;
  }

  openLlama(l) {
    const g = this.game;
    this.llamas.splice(this.llamas.indexOf(l), 1);
    g.scene.remove(l.mesh);
    g.world.collision.remove(l.col);
    this.confetti(l.pos);
    g.pickups.burst(this.llamaLoot(), l.pos.clone().setY(l.pos.y + 1));
    g.audio.chest?.();
    g.hud.toast('🦙 ¡Llama de botín abierta!');
    g.player.stats.chests++;
  }

  openDrop(d) {
    const g = this.game;
    d.opened = true;
    g.scene.remove(d.mesh);
    if (d.col) g.world.collision.remove(d.col);
    this.drops.splice(this.drops.indexOf(d), 1);
    g.pickups.burst(this.dropLoot(), d.ground.clone().setY(d.ground.y + 0.9));
    g.audio.chest?.();
    g.player.stats.chests++;
  }

  // ------------------------------------------------------------ MAPA
  mapMarks() {
    if (!this.active) return [];
    const out = this.drops.map((d) => ({ icon: '📦', x: d.ground.x, z: d.ground.z }));
    const cr = this.crown;
    if (cr.pos) out.push({ icon: '👑', x: cr.pos.x, z: cr.pos.z });
    return out;
  }

  compassMarks() {
    if (!this.active) return [];
    const out = this.drops.map((d) => ({ pos: d.ground, cls: 'drop', icon: '📦' }));
    if (this.crown.pos) out.push({ pos: this.crown.pos, cls: 'drop', icon: '👑' });
    return out;
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const t = g.time;
    // Suministros programados
    if (g.phase === 'match' && this.dropQueue.length && g.matchTime >= this.dropQueue[0]) {
      this.dropQueue.shift();
      this.spawnDrop();
    }
    for (const d of this.drops) {
      const m = d.mesh;
      const ud = m.userData;
      if (!d.landed) {
        m.position.y = Math.max(d.ground.y, m.position.y - 8 * dt);
        m.rotation.y += dt * 0.4;
        ud.crate.rotation.z = Math.sin(t * 1.3) * 0.06;
        if (m.position.y <= d.ground.y + 0.01) {
          d.landed = true;
          ud.balloon.visible = false;
          ud.crate.rotation.z = 0;
          d.col = g.world.collision.add(d.ground.x - 0.7, d.ground.y, d.ground.z - 0.7, d.ground.x + 0.7, d.ground.y + 1.1, d.ground.z + 0.7, { type: 'drop' });
          g.effects.puff(d.ground.clone().setY(d.ground.y + 0.3), 0xb8a888, 1.5, 1.2, null, 0.5);
          // Los bots cercanos más atrevidos acuden a por él
          for (const b of g.bots.list) if (b.alive && !b.boss && b.bold < 0.7 && b.pos.distanceTo(d.ground) < 300) b.rumor = { pos: d.ground.clone(), t: g.time };
          if (d.ground.distanceTo(g.camera.position) < 120) g.audio.land();
        }
      }
      ud.beam.material.opacity = 0.16 + Math.sin(t * 3) * 0.05;
    }
    // Llamas: saltitos y giro lento
    for (const l of this.llamas) {
      if (l.pos.distanceToSquared(g.camera.position) > 250 * 250) {
        l.mesh.visible = false;
        continue;
      }
      l.mesh.visible = true;
      l.mesh.position.y = l.pos.y + Math.abs(Math.sin(t * 2.2 + l.phase)) * 0.18;
      l.mesh.rotation.y += dt * 0.3;
    }
    // Corona
    const cr = this.crown;
    if (cr.holder && (!cr.holder.alive || !g.chars.includes(cr.holder))) this.dropCrown(cr.holder.pos);
    if (cr.pos) {
      cr.mesh.rotation.y += dt * 2;
      cr.mesh.position.y = cr.pos.y + Math.sin(t * 3) * 0.12;
      for (const c of g.chars) {
        if (!c.alive || c.knocked || c.mode !== 'ground' || c.isRemote || c.boss) continue;
        if (Math.abs(c.pos.x - cr.pos.x) < 1.6 && Math.abs(c.pos.z - cr.pos.z) < 1.6 && Math.abs(c.pos.y + 1 - cr.pos.y) < 2.5) {
          this.giveCrown(c);
          break;
        }
      }
    }
  }
}
