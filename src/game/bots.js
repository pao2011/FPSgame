import * as THREE from 'three';
import { Character } from './character.js';
import { WEAPONS, CONSUMABLES, PICKAXE } from './items.js';
import { random, clamp } from '../core/rng.js';
import { ISLAND_RADIUS } from '../world/constants.js';

const NAMES = [
  'Lucía', 'Mateo', 'Sofía', 'Hugo', 'Valeria', 'Leo', 'Martina', 'Pablo', 'Paula', 'Álvaro',
  'Daniela', 'Diego', 'Carla', 'Marcos', 'Elena', 'Bruno', 'Noa', 'Iker', 'Alba', 'Adrián',
  'Vega', 'Gael', 'Lola', 'Thiago', 'Abril', 'Enzo', 'Irene', 'Unai', 'Julia', 'Izan',
];

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const wish = new THREE.Vector3();

const THINK = 0.25;

class Bot extends Character {
  constructor(game, i) {
    super(game);
    this.isBot = true;
    this.name = NAMES[i % NAMES.length];
    this.model.root.visible = false;
  }

  reset() {
    this.resetBody();
    this.mode = 'bus';
    this.weapon = null;
    this.mag = 0;
    this.cooldown = 0;
    this.reloadT = 0;
    this.swingT = 0;
    this.skill = random.float(0.45, 1.0);
    this.jumpFrac = random.float(0.1, 0.85);
    this.deployAlt = random.float(70, 120);
    this.landTarget = null;
    this.goal = null;
    this.goalKind = null;
    this.goalTimer = 0;
    this.target = null;
    this.targetSeen = false;
    this.reaction = 0;
    this.thinkT = random.float(0, THINK);
    this.strafe = random.chance(0.5) ? 1 : -1;
    this.strafeT = 0;
    this.stuckT = 0;
    this.stuckCount = 0;
    this.detourT = 0;
    this.detour = new THREE.Vector3();
    this.lastPos = new THREE.Vector3();
    this.stormTick = 0;
    this.lastAttacker = null;
    this.mats = { wood: random.int(0, 3) * 10, stone: random.int(0, 2) * 10, metal: random.int(0, 1) * 10 };
    this.extra = null; // consumible que soltará al morir
    this.model.root.visible = false;
    this.setHeld(PICKAXE);
  }

  get def() {
    return this.weapon ? WEAPONS[this.weapon.type] : null;
  }

  // ------------------------------------------------------------------ DAÑO
  damage(amount, type, attacker = null) {
    if (!this.alive) return false;
    this.absorb(amount, type);
    if (attacker && attacker !== this && attacker.alive) {
      this.lastAttacker = attacker;
      if (!this.target || !this.targetSeen) {
        this.target = attacker;
        this.reaction = Math.min(this.reaction, 0.3);
      }
    }
    if (this.health <= 0) {
      this.health = 0;
      this.die(type, attacker);
      return true;
    }
    return false;
  }

  die(type, killer) {
    this.alive = false;
    this.model.root.visible = false;
    const g = this.game;
    const at = this.pos.clone();
    at.y += 0.8;
    const drops = [];
    if (this.weapon) {
      drops.push({ ...this.weapon, mag: WEAPONS[this.weapon.type].mag });
      const a = WEAPONS[this.weapon.type].ammo;
      drops.push({ kind: 'ammo', ammo: a, count: a === 'heavy' ? 8 : a === 'shells' ? 12 : 40 });
    }
    if (this.extra) drops.push(this.extra);
    for (const m in this.mats) if (this.mats[m] > 0) drops.push({ kind: 'material', mat: m, count: this.mats[m] });
    g.pickups.burst(drops, at);
    g.effects.debris(at, 0x9b5cff);
    g.onElimination(this, killer, type);
  }

  // ------------------------------------------------------------- UPDATE
  update(dt) {
    if (!this.alive) return;
    const g = this.game;
    switch (this.mode) {
      case 'bus': this.updateBus(); break;
      case 'freefall': this.updateAir(dt, false); break;
      case 'glide': this.updateAir(dt, true); break;
      case 'ground': this.updateGround(dt); break;
    }
    // Tormenta
    if (this.mode !== 'bus' && g.storm.active && g.storm.isOutside(this.pos.x, this.pos.z)) {
      this.stormTick += dt;
      if (this.stormTick >= 1) {
        this.stormTick -= 1;
        this.damage(g.storm.dps, 'storm');
      }
    }
    if (!this.alive) return;
    const visible = this.mode !== 'bus' && this.pos.distanceToSquared(g.camera.position) < 320 * 320;
    this.model.root.visible = visible;
    if (visible) this.updateModel(dt, this.weapon || PICKAXE, this.swingT);
  }

  updateBus() {
    const bus = this.game.bus;
    this.pos.copy(bus.pos);
    const frac = bus.t / bus.length;
    if ((bus.doorsOpen && frac >= this.jumpFrac) || bus.mustEject || !bus.active) {
      this.pos.y -= 3.5;
      this.vel.copy(bus.velocity).multiplyScalar(0.35);
      this.vel.y = -5;
      this.mode = 'freefall';
      this.freefallTime = 0;
      this.landTarget = this.pickLanding();
    }
  }

  pickLanding() {
    const w = this.game.world;
    const cands = [];
    for (const s of w.lootSpots) {
      const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
      if (d < 280) cands.push(s);
    }
    for (const c of this.game.containers.list) {
      if (c.active && c.kind === 'chest' && Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) < 280) cands.push(c.pos);
    }
    if (cands.length) {
      const s = random.pick(cands);
      return new THREE.Vector3(s.x + random.float(-6, 6), 0, s.z + random.float(-6, 6));
    }
    const a = random.float(0, Math.PI * 2);
    const r = Math.sqrt(random.next()) * ISLAND_RADIUS * 0.8;
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  }

  updateAir(dt, gliding) {
    const t = this.landTarget;
    tmpA.set(t.x - this.pos.x, 0, t.z - this.pos.z);
    const dist = tmpA.length();
    wish.copy(tmpA).normalize();
    if (dist < 8) wish.multiplyScalar(dist / 8);
    this.yaw = Math.atan2(-wish.x, -wish.z);
    if (!gliding) {
      // Cae en picado si el objetivo está cerca
      const dive = dist < 120 ? 1 : 0.2;
      this.freefallStep(dt, wish, dive);
      if (this.altitude < this.deployAlt) this.deployGlider();
    } else {
      this.glideStep(dt, wish, dist < 40 ? 1 : 0);
    }
    if (this.onGround) {
      this.mode = 'ground';
      this.glider.visible = false;
      this.vel.set(0, 0, 0);
      this.lastPos.copy(this.pos);
    }
  }

  // --------------------------------------------------------------- SUELO
  enemies() {
    const g = this.game;
    const out = [];
    if (g.player.alive && g.player.mode !== 'bus' && g.player.mode !== 'lobby') out.push(g.player);
    for (const b of g.bots.list) if (b !== this && b.alive && b.mode !== 'bus') out.push(b);
    return out;
  }

  canSee(other) {
    const eye = this.eye;
    const to = tmpB.copy(other.pos);
    to.y += other.height * 0.75;
    const dir = to.sub(eye);
    const dist = dir.length();
    dir.divideScalar(dist);
    const hit = this.game.raycast(eye, dir, dist + 1, 0, this);
    return !!hit && hit.kind === 'character' && hit.entity === other;
  }

  think() {
    const g = this.game;
    const range = this.def ? Math.min(this.def.range, 90) : 12;
    // Mantener el objetivo actual si sigue vivo y cerca
    if (this.target && (!this.target.alive || this.target.pos.distanceTo(this.pos) > range * 1.4)) this.target = null;
    if (!this.target || !this.targetSeen) {
      let best = null, bd = range;
      const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
      for (const e of this.enemies()) {
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > bd) continue;
        const facing = (dx * fwdX + dz * fwdZ) / (d || 1);
        if (d > 18 && facing < 0.2 && e !== this.lastAttacker) continue; // fuera de su campo de visión
        if (!this.canSee(e)) continue;
        best = e;
        bd = d;
      }
      if (best && best !== this.target) {
        this.target = best;
        this.reaction = random.float(0.35, 0.9) * (1.4 - this.skill);
      }
    }
    this.targetSeen = this.target ? this.canSee(this.target) : false;

    // Objetivos de movimiento cuando no está peleando
    this.goalTimer -= THINK;
    const st = g.storm;
    const outsideNext = st.active && st.state !== 'done' &&
      Math.hypot(this.pos.x - st.next.x, this.pos.z - st.next.y) > st.nextRadius * 0.9 &&
      (st.state === 'shrink' || st.timer < 35);
    if (st.active && (st.isOutside(this.pos.x, this.pos.z) || outsideNext)) {
      const c = st.isOutside(this.pos.x, this.pos.z) ? st.center : st.next;
      this.goal = new THREE.Vector3(c.x, 0, c.y);
      this.goalKind = 'storm';
      return;
    }
    if (this.goalKind === 'storm') this.goal = null;
    if (!this.weapon || this.goalTimer <= 0 || !this.goal) this.pickGoal();
  }

  pickGoal() {
    const g = this.game;
    this.goalTimer = random.float(10, 18);
    let best = null, bd = this.weapon ? 30 : 70;
    // armas en el suelo
    for (const pk of g.pickups.items) {
      if (pk.item.kind !== 'weapon' || !pk.settled) continue;
      if (this.weapon && pk.item.rarity <= this.weapon.rarity) continue;
      const d = pk.pos.distanceTo(this.pos);
      if (d < bd && Math.abs(pk.pos.y - this.pos.y) < 4) {
        bd = d;
        best = { pos: pk.pos, kind: 'pickup', ref: pk };
      }
    }
    for (const c of g.containers.list) {
      if (!c.active || c.opened || c.kind !== 'chest') continue;
      const d = c.pos.distanceTo(this.pos);
      if (d < bd && Math.abs(c.pos.y - this.pos.y) < 4) {
        bd = d;
        best = { pos: c.pos, kind: 'chest', ref: c };
      }
    }
    if (best) {
      this.goal = best.pos.clone();
      this.goalKind = best.kind;
      this.goalRef = best.ref;
      return;
    }
    // Paseo aleatorio dentro de la zona segura
    const st = g.storm;
    const cx = st.active ? st.next.x : 0, cz = st.active ? st.next.y : 0;
    const r = st.active ? Math.max(10, st.nextRadius * 0.8) : 300;
    for (let i = 0; i < 10; i++) {
      const a = random.float(0, Math.PI * 2);
      const rr = Math.sqrt(random.next()) * r;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (g.world.terrain.heightAt(x, z) > 1 && Math.hypot(x - this.pos.x, z - this.pos.z) < 120) {
        this.goal = new THREE.Vector3(x, 0, z);
        this.goalKind = 'roam';
        return;
      }
    }
    const a = random.float(0, Math.PI * 2);
    this.goal = new THREE.Vector3(this.pos.x + Math.cos(a) * 40, 0, this.pos.z + Math.sin(a) * 40);
    this.goalKind = 'roam';
  }

  updateGround(dt) {
    const g = this.game;
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = THINK;
      this.think();
    }
    this.cooldown -= dt;
    this.swingT = Math.max(0, this.swingT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.mag = this.def.mag;
    }

    wish.set(0, 0, 0);
    let speed = 5.4;
    const fighting = this.target && this.target.alive && (this.targetSeen || this.target === this.lastAttacker);
    if (fighting) {
      const tp = this.target.pos;
      tmpA.set(tp.x - this.pos.x, 0, tp.z - this.pos.z);
      const d = tmpA.length();
      tmpA.normalize();
      this.yaw = Math.atan2(-tmpA.x, -tmpA.z);
      const dy = tp.y + this.target.height * 0.7 - (this.pos.y + this.eyeHeight);
      this.pitch = Math.atan2(dy, d);
      const ideal = !this.weapon ? 1.2 : this.def.pellets ? 6 : this.weapon.type === 'sniper' ? 50 : 18;
      if (!this.targetSeen || d > ideal + 4) wish.copy(tmpA);
      else if (d < ideal - 4) wish.copy(tmpA).negate();
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = random.float(0.7, 1.8);
        this.strafe = -this.strafe;
      }
      if (this.weapon) wish.addScaledVector(tmpB.set(-tmpA.z, 0, tmpA.x), this.strafe * 0.8);
      if (wish.lengthSq() > 0) wish.normalize();
      speed = 4.6;
      this.reaction -= dt;
      if (this.targetSeen && this.reaction <= 0) this.attack(d);
    } else if (this.goal) {
      tmpA.set(this.goal.x - this.pos.x, 0, this.goal.z - this.pos.z);
      const d = tmpA.length();
      if (d < 1.6) this.arrive();
      else {
        wish.copy(tmpA).divideScalar(d);
        this.yaw = Math.atan2(-wish.x, -wish.z);
        this.pitch = 0;
        if (d > 20) speed = 7.2;
      }
      if (this.goalKind === 'chest' && d < 2.4 && this.goalRef && !this.goalRef.opened) {
        g.containers.open(this.goalRef, this);
        this.goal = null;
        this.goalTimer = 0.5;
      }
    }
    this.autoPickup();

    // Atasco: saltar y, si sigue, rodear
    if (this.detourT > 0) {
      this.detourT -= dt;
      wish.copy(this.detour);
    }
    this.stuckT += dt;
    if (this.stuckT > 0.5) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      const wanted = wish.lengthSq() > 0.1;
      if (wanted && moved < 0.5) this.stuckCount++;
      else this.stuckCount = 0;
      if (this.stuckCount >= 3 && this.detourT <= 0) {
        const a = Math.atan2(wish.z, wish.x) + (random.chance(0.5) ? 1 : -1) * random.float(1.2, 2.2);
        this.detour.set(Math.cos(a), 0, Math.sin(a));
        this.detourT = random.float(1, 2);
        this.stuckCount = 0;
        if (this.goalKind !== 'storm') this.goalTimer = Math.min(this.goalTimer, 2);
      }
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
    }
    const jump = this.stuckCount >= 1 && this.onGround;
    const land = this.groundStep(dt, wish, speed, jump);
    this.fallDamage(land);
  }

  arrive() {
    this.goal = null;
    this.goalTimer = Math.min(this.goalTimer, random.float(0.5, 2));
  }

  autoPickup() {
    const g = this.game;
    for (const pk of g.pickups.items) {
      if (!pk.settled || pk.pos.distanceToSquared(this.pos) > 2.6) continue;
      const it = pk.item;
      if (it.kind === 'weapon') {
        if (this.weapon && it.rarity <= this.weapon.rarity && !(this.weapon.type === 'pistol' && it.type !== 'pistol')) continue;
        if (this.weapon) g.pickups.spawn(this.weapon, pk.pos.clone(), new THREE.Vector3(0, 3, 0));
        this.weapon = { ...it };
        this.mag = it.mag;
        this.setHeld(this.weapon);
      } else if (it.kind === 'consumable') {
        const def = CONSUMABLES[it.type];
        if (def.shield) this.shield = Math.min(def.cap, this.shield + def.shield * Math.min(2, it.count));
        else this.health = Math.min(def.cap, this.health + def.heal * Math.min(2, it.count));
        if (!this.extra && random.chance(0.4)) this.extra = { ...it, count: 1 };
      } else if (it.kind === 'material') {
        this.mats[it.mat] += it.count;
      } else if (it.kind !== 'ammo') continue;
      g.pickups.remove(pk);
      if (this.goalKind === 'pickup' && this.goalRef === pk) this.arrive();
      break;
    }
  }

  // --------------------------------------------------------------- COMBATE
  attack(dist) {
    const g = this.game;
    if (!this.weapon) {
      if (dist < 2.2 && this.swingT <= 0) {
        this.swingT = 0.55;
        this.target.damage(20, 'pickaxe', this);
        g.audio.pickaxe();
      }
      return;
    }
    const def = this.def;
    if (this.reloadT > 0 || this.cooldown > 0) return;
    if (this.mag <= 0) {
      this.reloadT = def.reload[this.weapon.rarity] * 1.2;
      return;
    }
    if (dist > def.range) return;
    this.mag--;
    this.cooldown = (1 / def.rate) * (def.auto ? 1.6 : 1.3) + random.float(0, 0.15);
    const eye = this.eye;
    const tgt = this.target;
    const aim = tmpA.copy(tgt.pos);
    aim.y += tgt.height * (random.chance(0.15 * this.skill) ? 0.92 : 0.6);
    const dir = aim.sub(eye).normalize();
    const moving = this.hSpeed > 1 ? 1.4 : 1;
    const err = (def.pellets ? def.spread : def.spread * 0.6 + 0.02) * moving * (1.6 - this.skill * 0.8);
    const pellets = def.pellets || 1;
    const muzzle = eye.clone().addScaledVector(dir, 0.6);
    const d = new THREE.Vector3();
    let total = 0, head = false, victim = null;
    for (let i = 0; i < pellets; i++) {
      g.combat.coneDir(dir, err, d);
      const hit = g.raycast(eye, d, def.range, 0, this);
      const end = hit ? hit.point : eye.clone().addScaledVector(d, def.range);
      if (this.pos.distanceToSquared(g.camera.position) < 200 * 200 && i < 4) g.effects.tracer(muzzle, end, 0xffe0a0, 0.02);
      if (!hit) continue;
      if (hit.kind === 'character') {
        let dmg = def.damage[this.weapon.rarity] * (hit.head ? def.headMult : 1);
        if (def.falloff) {
          const [a, b] = def.falloff;
          if (hit.t > a) dmg *= Math.max(0.2, 1 - ((hit.t - a) / (b - a)) * 0.8);
        }
        total += dmg;
        head = head || hit.head;
        victim = hit.entity;
      } else if (hit.kind === 'world' && hit.box?.data?.type === 'build') {
        g.build.damage(hit.box.data.piece, def.damage[this.weapon.rarity]);
      } else if (hit.kind === 'dummy') {
        g.dummies.damage(hit.dummy, def.damage[this.weapon.rarity], hit.head, hit.point);
      }
    }
    if (victim && total > 0) victim.damage(total, head ? 'headshot' : 'bullet', this);
    const dCam = this.pos.distanceTo(g.camera.position);
    const vol = clamp(1 - dCam / 260, 0, 1);
    if (vol > 0.03) g.audio.shot(def.sound, vol * vol * 0.9);
    if (dCam < 150) g.effects.muzzleFlash(null, muzzle);
  }
}

export class BotManager {
  constructor(game, count) {
    this.game = game;
    this.list = [];
    for (let i = 0; i < count; i++) this.list.push(new Bot(game, i));
  }

  reset(active = true) {
    random.shuffle(this.list);
    for (const b of this.list) {
      b.reset();
      if (!active) b.alive = false;
    }
  }

  get aliveCount() {
    let n = 0;
    for (const b of this.list) if (b.alive) n++;
    return n;
  }

  update(dt) {
    for (const b of this.list) b.update(dt);
  }

  raycast(o, dir, maxT, ignore) {
    let best = null;
    for (const b of this.list) {
      if (b === ignore) continue;
      const h = b.raycastHit(o, dir, best ? best.t : maxT);
      if (h) best = { ...h, entity: b };
    }
    return best;
  }
}

