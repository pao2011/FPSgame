import * as THREE from 'three';
import { Character } from './character.js';
import { WEAPONS, CONSUMABLES, PICKAXE, MATERIALS, THROWABLES } from './items.js';
import { random, clamp } from '../core/rng.js';
import { ISLAND_RADIUS } from '../world/constants.js';
import { randomOutfit } from './character.js';
import { PICKAXES, GLIDERS, BAGS, TRAILS } from './cosmetics.js';

// Los bots llevan a veces cosméticos de la taquilla (para dar variedad).
function botOutfit() {
  const o = randomOutfit();
  const any = (list, p) => (Math.random() < p ? Object.keys(list)[Math.floor(Math.random() * Object.keys(list).length)] : undefined);
  o.pick = any(PICKAXES, 0.4);
  o.glider = any(GLIDERS, 0.5);
  o.bag = any(BAGS, 0.3);
  o.trail = any(TRAILS, 0.35);
  return o;
}
import { yawToDir, WALL_PRESETS } from './build.js';

const WINDOW_MASK = WALL_PRESETS.find((p) => p.name === 'Ventana').mask;

const NAMES = [
  'Lucía', 'Mateo', 'Sofía', 'Hugo', 'Valeria', 'Leo', 'Martina', 'Pablo', 'Paula', 'Álvaro',
  'Daniela', 'Diego', 'Carla', 'Marcos', 'Elena', 'Bruno', 'Noa', 'Iker', 'Alba', 'Adrián',
  'Vega', 'Gael', 'Lola', 'Thiago', 'Abril', 'Enzo', 'Irene', 'Unai', 'Julia', 'Izan',
  'Nora', 'Dante', 'Olivia', 'Marco', 'Jimena', 'Rubén', 'Aitana', 'Óscar', 'Candela', 'Joel',
  'Emma', 'Lucas', 'Chloe', 'Nico', 'Ariadna', 'Saúl', 'Mía', 'Teo', 'Laia', 'Gonzalo',
  'Zoe', 'Ian', 'Clara', 'Rayan', 'Inés', 'Erik', 'Lara', 'Biel', 'Carmen', 'Liam',
];

// Parámetros por dificultad: reacción (s), error de puntería (rad), velocidad
// de seguimiento (rad/s), probabilidad de apuntar a la cabeza, de construir...
export const DIFF = {
  facil: { react: [0.8, 1.3], err: 0.075, track: 2.2, head: 0.04, build: 0, burst: [2, 3], pause: [0.6, 1.0], jump: 0, strafe: 0.4, see: 70, heal: 0.5, nade: 0.15 },
  normal: { react: [0.45, 0.8], err: 0.048, track: 3.6, head: 0.1, build: 0.35, burst: [3, 5], pause: [0.35, 0.7], jump: 0.12, strafe: 0.8, see: 95, heal: 0.85, nade: 0.35 },
  dificil: { react: [0.28, 0.5], err: 0.032, track: 5.5, head: 0.2, build: 0.65, burst: [4, 7], pause: [0.2, 0.45], jump: 0.25, strafe: 1, see: 115, heal: 1, nade: 0.55 },
  experto: { react: [0.15, 0.32], err: 0.022, track: 8, head: 0.3, build: 0.9, burst: [5, 9], pause: [0.12, 0.3], jump: 0.4, strafe: 1, see: 135, heal: 1, nade: 0.7 },
};

// Distancia ideal de combate y alcance efectivo de cada arma (o de su familia).
const RANGE = {
  shotgun: [3, 9], tactical: [3, 10], doublebarrel: [2, 7], smg: [6, 16], minigun: [8, 26], pistol: [8, 22], revolver: [10, 35],
  handcannon: [10, 35], ar: [14, 42], burst: [14, 45], heavyar: [12, 40], dmr: [30, 90], sniper: [35, 110], hunting: [30, 90],
  rocket: [12, 50], glauncher: [10, 30], plasma: [14, 50], boombow: [15, 60],
};
const EFFECTIVE = {
  shotgun: 24, tactical: 24, doublebarrel: 18, smg: 50, minigun: 70, pistol: 60, revolver: 90, handcannon: 90, ar: 120, burst: 120,
  heavyar: 110, dmr: 200, sniper: 240, hunting: 200, rocket: 110, glauncher: 45, plasma: 140, boombow: 130,
};
const cat = (w) => WEAPONS[w.type]?.cat || 'ar';
const rangeOf = (w) => RANGE[w.type] || RANGE[cat(w)] || RANGE.ar;
const effectiveOf = (w) => EFFECTIVE[w.type] ?? EFFECTIVE[cat(w)] ?? 60;
// Arrojadizos que los bots saben usar
const BOT_NADES = ['grenade', 'sticky', 'molotov', 'c4', 'smoke'];
const emptyNades = () => ({ grenade: 0, sticky: 0, impulse: 0, c4: 0, smoke: 0, molotov: 0 });
const THINK = 0.22;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const wish = new THREE.Vector3();

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Preferencia de arma según la distancia al objetivo.
const SCORED = new Set(['shotgun', 'tactical', 'smg', 'minigun', 'ar', 'burst', 'plasma', 'dmr', 'sniper', 'rocket', 'glauncher', 'boombow', 'revolver']);
function weaponScore(item, d) {
  if (!item) return -1;
  const t = SCORED.has(item.type) ? item.type : WEAPONS[item.type]?.cat || item.type;
  let s;
  if (t === 'shotgun' || t === 'tactical') s = d < 10 ? 3.2 : d < 18 ? 1.5 : 0.2;
  else if (t === 'smg') s = d < 20 ? 2.5 : d < 40 ? 1.6 : 0.6;
  else if (t === 'minigun') s = d < 35 ? 2.7 : d < 60 ? 1.8 : 0.7;
  else if (t === 'ar' || t === 'burst') s = d < 10 ? 1.5 : d < 90 ? 2.7 : 1.9;
  else if (t === 'plasma') s = d < 10 ? 1.8 : d < 120 ? 3 : 2.2;
  else if (t === 'dmr') s = d > 40 ? 3 : d > 20 ? 2 : 0.8;
  else if (t === 'sniper') s = d > 50 ? 3.3 : d > 25 ? 1.6 : 0.3;
  else if (t === 'rocket') s = d < 6 ? 0.2 : d < 60 ? 2.6 : 1.2;
  else if (t === 'glauncher') s = d < 6 ? 0.2 : d < 35 ? 2.4 : 0.4;
  else if (t === 'boombow') s = d < 8 ? 0.6 : d < 80 ? 2.8 : 1.5;
  else if (t === 'revolver') s = d < 60 ? 1.8 : 1.1;
  else s = d < 50 ? 1.3 : 0.6;
  return s + item.rarity * 0.15;
}

class Bot extends Character {
  constructor(game, i) {
    super(game, botOutfit());
    this.isBot = true;
    this.id = i;
    this.name = NAMES[i % NAMES.length];
    this.model.root.visible = false;
    this.memory = new Map();
    this.blacklist = new Set();
    this.detour = new THREE.Vector3();
    this.lastPos = new THREE.Vector3();
    this.goal = null;
  }

  reset(diff = 'normal') {
    this.resetBody();
    this.d = DIFF[diff] || DIFF.normal;
    this.mode = 'bus';
    this.weapons = [null, null, null];
    this.cur = 0;
    this.heals = { bandage: 0, medkit: 0, smallshield: 0, shieldpot: 0, chugjug: 0, flopper: 0, slurp: 0 };
    this.nades = emptyNades();
    this.nadeCd = random.float(2, 5);
    this.c4T = 0;
    this.burstShot = 0;
    this.mats = { wood: random.int(0, 2) * 10, stone: 0, metal: 0 };
    this.cooldown = 0;
    this.reloadT = 0;
    this.swingT = 0;
    this.swapT = 0;
    this.burstLeft = 3;
    this.burstPause = 0;
    this.useT = 0;
    this.using = null;
    this.buildCd = 0;
    this.memory.clear();
    this.blacklist.clear();
    this.target = null;
    this.targetVisible = false;
    this.timeOnTarget = 0;
    this.reaction = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.aimHead = false;
    this.ph = [random.float(0, 6), random.float(0, 6), random.float(0, 6)];
    this.box = null;
    this.peek = null;
    this.ping = null;
    this.task = 'idle';
    this.goal = null;
    this.goalRef = null;
    this.goalT = 0;
    this.path = null;
    this.pathGoal = null;
    this.pathT = -99;
    this.pathPending = false;
    this.wp = 0;
    this.stuckT = 0;
    this.stuckCount = 0;
    this.detourT = 0;
    this.strafe = random.chance(0.5) ? 1 : -1;
    this.strafeT = 0;
    this.thinkT = random.float(0, THINK);
    this.jumpFrac = random.float(0.1, 0.85);
    // Marcas de jefe/secuaz (los bots se reutilizan entre partidas)
    this.boss = false;
    this.bossKind = null;
    this.bossDef = null;
    if (this.bossOutfit) {
      this.bossOutfit = false;
      this.setOutfit(randomOutfit());
    }
    this.home = null;
    this.dmgTaken = 0;
    this.rumor = null; // último tiroteo oído a lo lejos
    this.bold = random.next(); // los más atrevidos (bold < 0.7) acuden a los disparos
    this.deployAlt = random.float(70, 120);
    this.landTarget = null;
    this.lastHurt = -99;
    this.lastAttacker = null;
    this.stormTick = 0;
    this.respawnT = 0;
    this.model.root.visible = false;
    this.setHeld(PICKAXE);
  }

  get weapon() {
    return this.weapons[this.cur];
  }

  get def() {
    const w = this.weapon;
    return w ? WEAPONS[w.type] : null;
  }

  get hasWeapon() {
    return this.weapons.some(Boolean);
  }

  get totalMats() {
    return this.mats.wood + this.mats.stone + this.mats.metal;
  }

  // ------------------------------------------------------------ MEMORIA
  remember(e, seen, pos = e.pos) {
    const m = this.memory.get(e) || { pos: new THREE.Vector3(), vel: new THREE.Vector3(), time: -99, seen: false, seenAt: -99 };
    m.pos.copy(pos);
    m.vel.copy(e.vel);
    m.time = this.game.time;
    m.seen = seen;
    if (seen) m.seenAt = this.game.time;
    this.memory.set(e, m);
    return m;
  }

  // ------------------------------------------------------------ DAÑO
  onHurt(amount, type, attacker) {
    this.lastHurt = this.game.time;
    this.cancelUse();
    if (!attacker || attacker === this || !attacker.alive) return;
    this.remember(attacker, false);
    this.lastAttacker = attacker;
    if (!this.target || !this.targetVisible) {
      this.target = attacker;
      this.reaction = Math.min(this.reaction, 0.3);
    }
    this.game.shareIntel(this, attacker);
    // Reacción de constructor: muro hacia el atacante
    if (this.game.mode.build && this.mode === 'ground' && !this.knocked && this.buildCd <= 0 && this.totalMats >= 10 && random.chance(this.d.build)) {
      this.buildWallToward(attacker.pos);
    }
  }

  onEliminated(type, killer) {
    this.model.root.visible = false;
    this.path = null;
    const g = this.game;
    const at = this.pos.clone();
    at.y += 0.8;
    const drops = [];
    for (const w of this.weapons) {
      if (!w) continue;
      drops.push({ ...w, mag: WEAPONS[w.type].mag });
      const a = WEAPONS[w.type].ammo;
      drops.push({ kind: 'ammo', ammo: a, count: a === 'heavy' ? 8 : a === 'shells' ? 12 : a === 'rockets' ? 4 : 40 });
    }
    for (const h in this.heals) if (this.heals[h] > 0) drops.push({ kind: 'consumable', type: h, count: this.heals[h] });
    for (const t in this.nades) if (this.nades[t] > 0) drops.push({ kind: 'throwable', type: t, count: this.nades[t] });
    for (const m in this.mats) if (this.mats[m] > 0) drops.push({ kind: 'material', mat: m, count: Math.min(999, this.mats[m]) });
    if (!g.mode.respawn) g.pickups.burst(drops.slice(0, 10), at);
    if (at.distanceTo(g.camera.position) < 200) g.effects.debris(at, 0x9b5cff);
  }

  cancelUse() {
    this.using = null;
    this.useT = 0;
  }

  // ------------------------------------------------------------ UPDATE
  update(dt) {
    if (this.peek) this.updatePeek();
    if (!this.alive) return;
    const g = this.game;
    this.updateKnocked(dt);
    this.tickCommon(dt);
    if (!this.alive) return;
    switch (this.mode) {
      case 'lobby': this.updateLobby(dt); break;
      case 'bus': this.updateBus(); break;
      case 'freefall': this.updateAir(dt, false); break;
      case 'glide': this.updateAir(dt, true); break;
      case 'ground': this.updateGround(dt); break;
    }
    if (this.mode !== 'bus' && this.mode !== 'lobby' && g.storm.active && g.storm.isOutside(this.pos.x, this.pos.z)) {
      this.stormTick += dt;
      if (this.stormTick >= 1) {
        this.stormTick -= 1;
        this.damage(g.storm.dps, 'storm');
      }
    }
    if (!this.alive) return;
    const visible = this.mode !== 'bus' && this.pos.distanceToSquared(g.camera.position) < 330 * 330;
    if (this.mode === 'lobby') {
      this.model.root.visible = visible && this.lobbyShown;
      if (this.model.root.visible) this.updateModel(dt, this.lobbyItem || PICKAXE, 0);
      return;
    }
    this.model.root.visible = visible;
    if (visible) this.animLOD(dt, this.weapon || PICKAXE, this.swingT);
  }

  // LOD de animación: de lejos la pose se recalcula menos veces por segundo
  // (más espaciado en calidad móvil); la posición se actualiza siempre.
  animLOD(dt, item, swingT) {
    const g = this.game;
    const d2 = this.pos.distanceToSquared(g.camera.position);
    const mobile = g.liteCpu;
    const every = d2 < 45 * 45 ? 1 : d2 < 110 * 110 ? (mobile ? 3 : 2) : mobile ? 5 : 3;
    this.animAcc = (this.animAcc || 0) + dt;
    this.animN = (this.animN || 0) + 1;
    if (this.animN >= every) {
      this.updateModel(this.animAcc, item, swingT);
      this.animAcc = 0;
      this.animN = 0;
    } else {
      this.model.root.position.copy(this.pos);
      this.model.root.rotation.set(0, this.yaw, 0);
    }
  }

  // ----------------------------------------------------------- ISLA DE INICIO
  // Paseo tranquilo por la isla de inicio mientras se reúnen los jugadores.
  enterLobby(x, z, yaw) {
    this.resetBody();
    this.mode = 'lobby';
    this.pos.set(x, this.game.world.terrain.heightAt(x, z) + 1, z);
    this.yaw = yaw;
    this.lobbyGoal = null;
    this.lobbyWait = random.float(0.5, 4);
    this.lobbyShown = true;
    this.lobbyItem = random.chance(0.4) ? { kind: 'weapon', type: random.pick(['ar', 'shotgun', 'smg', 'pistol', 'burst']), rarity: random.int(0, 4) } : PICKAXE;
    this.setHeld(this.lobbyItem);
  }

  updateLobby(dt) {
    const g = this.game;
    const L = g.world.lobby;
    this.lobbyWait -= dt;
    if (!this.lobbyGoal && this.lobbyWait <= 0) {
      const a = random.float(0, Math.PI * 2), r = random.float(4, 38);
      this.lobbyGoal = new THREE.Vector3(L.center.x + Math.cos(a) * r, 0, L.center.z + Math.sin(a) * r);
    }
    wish.set(0, 0, 0);
    if (this.lobbyGoal) {
      tmpA.set(this.lobbyGoal.x - this.pos.x, 0, this.lobbyGoal.z - this.pos.z);
      const d = tmpA.length();
      if (d < 1.5 || this.stuckT > 2) {
        this.lobbyGoal = null;
        this.lobbyWait = random.float(1, 5);
        this.stuckT = 0;
      } else {
        wish.copy(tmpA).divideScalar(d);
        this.yaw = Math.atan2(-wish.x, -wish.z);
        if (this.hSpeed < 0.5) this.stuckT += dt;
      }
    }
    const jump = this.onGround && random.chance(dt * 0.25);
    this.sprinting = !!this.lobbyGoal && random.chance(0.5);
    this.groundStep(dt, wish, this.lobbyGoal ? 5.4 : 0, jump || (this.lobbyGoal && this.stuckT > 0.6 && this.onGround));
  }

  // ----------------------------------------------------------- AUTOBÚS/AIRE
  updateBus() {
    const g = this.game;
    const bus = g.bus;
    this.pos.copy(bus.pos);
    const frac = bus.t / bus.length;
    const leader = g.teamLeader(this.team);
    let go;
    if (leader && leader !== this && leader.mode === 'bus') go = false; // espera al líder
    else if (leader && leader !== this) go = true; // el líder ya saltó
    else go = frac >= this.jumpFrac;
    if ((bus.doorsOpen && go) || bus.mustEject || !bus.active) this.jump();
  }

  jump() {
    const bus = this.game.bus;
    this.pos.copy(bus.pos);
    this.pos.y -= 3.5;
    this.vel.copy(bus.velocity).multiplyScalar(0.35);
    this.vel.y = -5;
    this.mode = 'freefall';
    this.freefallTime = 0;
    const leader = this.game.teamLeader(this.team);
    if (leader && leader !== this && leader.landTarget) {
      this.landTarget = leader.landTarget.clone().add(new THREE.Vector3(random.float(-12, 12), 0, random.float(-12, 12)));
    } else this.landTarget = this.pickLanding();
  }

  pickLanding() {
    const g = this.game;
    const cands = [];
    // sólo botín a ras de suelo (no en tejados ni plantas altas)
    const low = (p) => {
      const k = g.nav.idx(p.x, p.z);
      return k >= 0 && p.y - g.nav.ground[k] < 1.2 && !g.storm.isOutside(p.x, p.z);
    };
    for (const c of g.containers.list) {
      if (c.active && !c.locked && c.kind === 'chest' && Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) < 300 && low(c.pos)) cands.push(c.pos);
    }
    for (const pk of g.pickups.items) if (pk.item.kind === 'weapon' && Math.hypot(pk.pos.x - this.pos.x, pk.pos.z - this.pos.z) < 300 && low(pk.pos)) cands.push(pk.pos);
    if (cands.length) {
      // Casi la mitad prefiere zonas con nombre, cuevas y trincheras
      // (aterrizajes "calientes": hay pelea desde el principio)
      const hot = random.chance(0.45) ? cands.filter((p) => g.world.poiAt(p.x, p.z) || g.world.sites.some((q) => q.contains(p.x, p.z))) : [];
      const s = random.pick(hot.length ? hot : cands);
      return new THREE.Vector3(s.x + random.float(-5, 5), 0, s.z + random.float(-5, 5));
    }
    const st = g.storm;
    const a = random.float(0, Math.PI * 2);
    const r = Math.sqrt(random.next()) * Math.min(ISLAND_RADIUS * 0.8, st.radius * 0.8);
    return new THREE.Vector3(st.center.x + Math.cos(a) * r, 0, st.center.y + Math.sin(a) * r);
  }

  updateAir(dt, gliding) {
    const g = this.game;
    // Los compañeros del jugador le siguen en el aire
    const leader = g.teamLeader(this.team);
    if (leader && leader !== this && !leader.isBot && leader.mode !== 'bus') {
      this.landTarget.set(leader.pos.x + (this.id % 3 - 1) * 8, 0, leader.pos.z + ((this.id >> 1) % 3 - 1) * 8);
    }
    const t = this.landTarget;
    tmpA.set(t.x - this.pos.x, 0, t.z - this.pos.z);
    const dist = tmpA.length();
    wish.copy(tmpA).normalize();
    if (dist < 8) wish.multiplyScalar(dist / 8);
    this.yaw = Math.atan2(-wish.x, -wish.z);
    if (!gliding) {
      this.freefallStep(dt, wish, dist < 140 ? 1 : 0.2);
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

  respawnAt(x, z, loadout, height = 140) {
    this.resetBody();
    this.weapons = loadout.weapons.map((w) => (w ? { ...w } : null));
    this.cur = 0;
    this.heals = { bandage: 0, medkit: 0, smallshield: 0, shieldpot: 0, chugjug: 0, flopper: 0, slurp: 0, ...loadout.heals };
    this.nades = { ...emptyNades(), ...(loadout.nades || {}) };
    this.mats = { wood: 150, stone: 80, metal: 40 };
    this.memory.clear();
    this.target = null;
    this.task = 'idle';
    this.path = null;
    this.goal = null;
    this.pos.set(x, height, z);
    this.vel.set(0, -10, 0);
    this.mode = 'freefall';
    this.deployAlt = Math.min(this.deployAlt, height - 5);
    this.landTarget = new THREE.Vector3(x, 0, z);
    this.setHeld(this.weapon || PICKAXE);
  }

  // ------------------------------------------------------------ PERCEPCIÓN
  canSee(other) {
    const eye = this.eye;
    const to = tmpB.copy(other.pos);
    to.y += other.height * 0.7;
    if (this.game.explosives.smokeBlocks(eye, to)) return false;
    const dir = to.sub(eye);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.divideScalar(dist);
    const hit = this.game.raycast(eye, dir, dist + 1, 0, this);
    return !!hit && hit.kind === 'character' && hit.entity === other;
  }

  perceive() {
    const g = this.game;
    const now = g.time;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const cands = [];
    for (const e of g.characters()) {
      if (e === this || !e.alive || e.team === this.team || e.mode === 'bus' || e.mode === 'lobby') continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > this.d.see) continue;
      const known = this.memory.get(e);
      const facing = (dx * fx + dz * fz) / (d || 1);
      // Campo de visión ~130°, pero de cerca o si ya lo conoce lo detecta igual
      if (d > 14 && facing < -0.1 && !(known && now - known.time < 3)) continue;
      // Disfrazado de arbusto: sólo se le descubre muy de cerca (o si ya se le seguía)
      if (e.bush && d > (e.crouching ? 5 : 9) && !(known && now - known.time < 2)) continue;
      cands.push({ e, d });
    }
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(3, cands.length); i++) {
      const { e } = cands[i];
      if (this.canSee(e)) {
        this.remember(e, true);
        this.game.shareIntel(this, e);
      } else {
        const m = this.memory.get(e);
        if (m) m.seen = false;
      }
    }
    // Oído: disparos cercanos de enemigos
    for (const n of g.noises) {
      if (now - n.t > 0.8 || !n.src.alive || n.src.team === this.team) continue;
      const d = this.pos.distanceTo(n.pos);
      if (d < n.r) {
        const m = this.memory.get(n.src);
        if (!m || now - m.time > 0.5) this.remember(n.src, false, n.pos);
      } else if (d < n.r * 2.6 && (!this.rumor || now - this.rumor.t > 4)) {
        // Tiroteo a lo lejos: puede acudir a él (ver decide)
        this.rumor = { pos: n.pos.clone(), t: now };
      }
    }
  }

  pickTarget() {
    const now = this.game.time;
    let best = null, bs = -Infinity;
    for (const [e, m] of this.memory) {
      if (!e.alive || now - m.time > 9) {
        this.memory.delete(e);
        continue;
      }
      const d = this.pos.distanceTo(m.pos);
      let s = -d * 0.6;
      if (m.seen && now - m.seenAt < 0.6) s += 60;
      if (e === this.lastAttacker && now - this.lastHurt < 4) s += 35;
      if (e.knocked) s -= 25;
      if (e === this.target) s += 10; // no cambiar de objetivo a cada momento
      if (s > bs) {
        bs = s;
        best = e;
      }
    }
    if (best !== this.target) {
      this.target = best;
      this.timeOnTarget = 0;
      this.aimHead = random.chance(this.d.head);
      this.reaction = random.float(this.d.react[0], this.d.react[1]);
    }
    const m = best && this.memory.get(best);
    this.targetVisible = !!m && m.seen && now - m.seenAt < 0.4;
  }

  // ------------------------------------------------------------ DECISIÓN
  stormDanger() {
    const st = this.game.storm;
    if (!st.active) return 0;
    const dNow = Math.hypot(this.pos.x - st.center.x, this.pos.z - st.center.y) - st.radius;
    if (dNow > -6) return 2;
    if (st.state === 'done') return 0;
    const dNext = Math.hypot(this.pos.x - st.next.x, this.pos.z - st.next.y) - st.nextRadius * 0.8;
    if (dNext <= 0) return 0;
    const travel = dNext / 5.5;
    const left = st.state === 'shrink' ? st.timer : st.timer + 25;
    return travel + 15 > left ? 2 : travel + 45 > left ? 1 : 0;
  }

  safePoint() {
    const st = this.game.storm;
    const useNext = st.state !== 'done';
    const cx = useNext ? st.next.x : st.center.x, cz = useNext ? st.next.y : st.center.y;
    const r = (useNext ? st.nextRadius : st.radius) * 0.55;
    tmpA.set(this.pos.x - cx, 0, this.pos.z - cz);
    const d = tmpA.length() || 1;
    return new THREE.Vector3(cx + (tmpA.x / d) * Math.min(d, r), 0, cz + (tmpA.z / d) * Math.min(d, r));
  }

  setTask(task, goal = null, ref = null) {
    if (this.task !== task || ref !== this.goalRef || (goal && (!this.goal || this.goal.distanceTo(goal) > 6))) {
      this.task = task;
      this.goal = goal ? goal.clone() : null;
      this.goalRef = ref;
      this.goalT = 0;
    }
  }

  healItem() {
    const h = this.heals;
    if (this.health + this.shield < 110 && h.chugjug > 0) return 'chugjug';
    if ((this.health < 70 || this.shield < 50) && h.slurp > 0) return 'slurp';
    if (this.health < 65 && h.flopper > 0) return 'flopper';
    if (this.shield < 50 && h.smallshield > 0) return 'smallshield';
    if (this.shield < 75 && h.shieldpot > 0) return 'shieldpot';
    if (this.health < 50 && h.medkit > 0) return 'medkit';
    if (this.health < 75 && h.bandage > 0) return 'bandage';
    if (this.health < 70 && h.campfire > 0) return 'campfire';
    return null;
  }

  needsLoot() {
    if (!this.hasWeapon) return true;
    if (this.weapons.filter(Boolean).length < 2) return true;
    const heals = this.heals.smallshield + this.heals.shieldpot + this.heals.medkit + this.heals.bandage + this.heals.flopper + this.heals.slurp + this.heals.chugjug;
    return heals < 2 || this.weapons.some((w) => w && w.rarity < 2);
  }

  findLoot() {
    const g = this.game;
    let best = null, bd = this.hasWeapon ? 55 : 85;
    const worst = this.weapons.reduce((m, w) => Math.min(m, w ? w.rarity : -1), 9);
    for (const pk of g.pickups.items) {
      if (!pk.settled || this.blacklist.has(pk)) continue;
      const it = pk.item;
      let want = false;
      if (it.kind === 'consumable' && !(it.type in this.heals)) continue;
      if (it.kind === 'weapon') want = it.rarity > worst || this.weapons.some((w) => !w) || !this.weapons.some((w) => w && w.type === it.type && w.rarity >= it.rarity) && it.rarity >= worst;
      else if (it.kind === 'consumable') want = (this.heals[it.type] || 0) < 4;
      else if (it.kind === 'throwable') want = BOT_NADES.includes(it.type) && this.nadeCount() < 5;
      if (!want) continue;
      const d = pk.pos.distanceTo(this.pos);
      if (d < bd && Math.abs(pk.pos.y - this.pos.y) < 2.5) {
        bd = d;
        best = { pos: pk.pos, ref: pk, kind: 'pickup' };
      }
    }
    for (const c of g.containers.list) {
      if (!c.active || c.opened || c.locked || c.kind !== 'chest' || this.blacklist.has(c)) continue;
      const d = c.pos.distanceTo(this.pos);
      if (d >= bd) continue;
      // sólo cofres a ras de suelo (la IA no sube escaleras)
      const k = g.nav.idx(c.pos.x, c.pos.z);
      if (k < 0 || c.pos.y - g.nav.ground[k] > 1.2) continue;
      bd = d;
      best = { pos: c.pos, ref: c, kind: 'chest' };
    }
    return best;
  }

  findHarvest() {
    let best = null, bd = 45;
    for (const h of this.game.harvest.list) {
      if (h.hp <= 0 || this.blacklist.has(h)) continue;
      const d = Math.hypot(h.center.x - this.pos.x, h.center.z - this.pos.z);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  decide() {
    const g = this.game;
    const now = g.time;
    if (this.knocked) {
      // Arrastrarse hacia el compañero en pie más cercano
      const mate = g.teamMembers(this.team).find((c) => c !== this && c.alive && !c.knocked);
      this.setTask('crawl', mate ? mate.pos : null, mate);
      return;
    }
    const tm = this.target && this.memory.get(this.target);
    const tDist = tm ? this.pos.distanceTo(tm.pos) : Infinity;
    const enemyClose = tm && tDist < 25 && now - tm.time < 3;
    const hpTot = this.health + this.shield;
    const storm = this.stormDanger();

    if (storm === 2 && !(this.targetVisible && enemyClose)) return this.setTask('rotate', this.safePoint());
    if (this.targetVisible && this.target) {
      const eff = this.def ? effectiveOf(this.weapon) : 0;
      const bestW = this.weapons.reduce((m, w) => Math.max(m, w ? effectiveOf(w) : 0), 0);
      if (this.hasWeapon && tDist < Math.max(eff, bestW) * 1.1) return this.setTask('fight', null, this.target);
      // Sin arma sólo pelea a pico si le atacan o lo tiene encima
      const attacked = this.target === this.lastAttacker && now - this.lastHurt < 4;
      if (!this.hasWeapon && (attacked || tDist < 2.5)) return this.setTask('fight', null, this.target);
    }
    const item = this.healItem();
    if (item && hpTot < 160 && now - this.lastHurt > 2.5 && !enemyClose && random.chance(this.d.heal)) return this.setTask('heal');
    if (this.task === 'heal' && item && now - this.lastHurt > 2.5) return;
    const downed = g.teamMembers(this.team).find((c) => c !== this && c.knocked && c.pos.distanceTo(this.pos) < 80);
    if (downed && !enemyClose) return this.setTask('revive', downed.pos, downed);
    if (tm && now - tm.time < 7 && this.hasWeapon && hpTot >= 70) return this.setTask('hunt', tm.pos, this.target);
    if (storm === 1) return this.setTask('rotate', this.safePoint());
    // Compañeros: acuden al marcador del jugador
    if (this.ping && now < this.ping.until && this.pos.distanceTo(this.ping.pos) > 6) return this.setTask('rotate', this.ping.pos);
    const leader = g.teamLeader(this.team);
    if (leader && leader !== this && leader.alive && leader.mode === 'ground' && !g.storm.isOutside(leader.pos.x, leader.pos.z)) {
      const d = leader.pos.distanceTo(this.pos);
      if (d > 30 || (this.task === 'follow' && d > 12)) return this.setTask('follow', leader.pos, leader);
    }
    // Tiroteo a lo lejos: los bots equipados y atrevidos van hacia él
    // (más peleas y menos paseos por la isla vacía)
    const rumor = this.rumor;
    if (rumor && now - rumor.t < 20 && this.bold < 0.7 && this.hasWeapon && hpTot >= 100 && !g.storm.isOutside(rumor.pos.x, rumor.pos.z)) {
      if (this.pos.distanceTo(rumor.pos) > 18) return this.setTask('investigate', rumor.pos);
      this.rumor = null;
    }
    if (this.task === 'loot' && this.goalRef && this.goalT < 25 && this.lootValid(this.goalRef)) return;
    if (this.needsLoot()) {
      const l = this.findLoot();
      if (l) return this.setTask('loot', l.pos, l.ref);
    }
    if (g.mode.build && this.totalMats < 150) {
      if (this.task === 'harvest' && this.goalRef && this.goalRef.hp > 0 && this.goalT < 20) return;
      const h = this.findHarvest();
      if (h) return this.setTask('harvest', h.center, h);
    }
    if (this.task === 'roam' && this.goal && this.goalT < 30 && Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) > 4) return;
    this.setTask('roam', this.roamPoint());
  }

  lootValid(ref) {
    if (ref.item) return this.game.pickups.items.includes(ref);
    return ref.active && !ref.opened;
  }

  roamPoint() {
    const g = this.game;
    const st = g.storm;
    const cx = st.active ? st.next.x : 0, cz = st.active ? st.next.y : 0;
    const r = st.active ? Math.max(12, st.nextRadius * 0.75) : 400;
    // preferir zonas con nombre cercanas dentro de la zona segura
    const pois = g.world.pois.filter((p) => Math.hypot(p.x - cx, p.z - cz) < r && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 260);
    if (pois.length && random.chance(0.6)) {
      const p = random.pick(pois);
      return new THREE.Vector3(p.x + random.float(-p.radius, p.radius) * 0.5, 0, p.z + random.float(-p.radius, p.radius) * 0.5);
    }
    for (let i = 0; i < 12; i++) {
      const a = random.float(0, Math.PI * 2);
      const rr = Math.sqrt(random.next()) * r;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (g.world.isLand(x, z, 1) && Math.hypot(x - this.pos.x, z - this.pos.z) < 150) return new THREE.Vector3(x, 0, z);
    }
    const a = random.float(0, Math.PI * 2);
    return new THREE.Vector3(this.pos.x + Math.cos(a) * 40, 0, this.pos.z + Math.sin(a) * 40);
  }

  // ------------------------------------------------------------ MOVIMIENTO
  // Devuelve true al llegar. Usa A* por la rejilla de navegación.
  navigate(goal, arrive = 1.5) {
    wish.set(0, 0, 0);
    if (!goal) return true;
    const g = this.game;
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < arrive) {
      this.path = null;
      return true;
    }
    if (dist < 16 && g.nav.lineFree(this.pos.x, this.pos.z, goal.x, goal.z)) {
      wish.set(dx / dist, 0, dz / dist);
      return false;
    }
    const now = g.time;
    const stale = !this.pathGoal || this.pathGoal.distanceTo(goal) > 6 || now - this.pathT > 8;
    if ((stale || !this.path) && !this.pathPending) g.requestPath(this, goal);
    if (this.path && this.wp < this.path.pts.length) {
      const p = this.path.pts[this.wp];
      let px = p[0] - this.pos.x, pz = p[1] - this.pos.z;
      let pd = Math.hypot(px, pz);
      while (pd < 1.2 && this.wp < this.path.pts.length - 1) {
        this.wp++;
        const q = this.path.pts[this.wp];
        px = q[0] - this.pos.x;
        pz = q[1] - this.pos.z;
        pd = Math.hypot(px, pz);
      }
      if (pd < 1.2 && this.wp >= this.path.pts.length - 1) {
        // fin de un tramo parcial: pedir el siguiente
        this.path = null;
        this.pathT = -99;
      }
      if (pd > 0.01) wish.set(px / pd, 0, pz / pd);
    } else {
      wish.set(dx / dist, 0, dz / dist); // mientras llega el camino
    }
    return false;
  }

  setPath(res, goal) {
    this.pathPending = false;
    this.pathT = this.game.time;
    this.pathGoal = goal.clone();
    this.path = res && res.pts.length ? res : null;
    this.wp = 0;
    if (!res) {
      if (this.goalRef && (this.task === 'loot' || this.task === 'harvest')) this.blacklist.add(this.goalRef);
      // Sin camino (encerrado o encima de algo): desvío aleatorio con salto
      const a = random.float(0, Math.PI * 2);
      this.detour.set(Math.cos(a), 0, Math.sin(a));
      this.detourT = random.float(1, 2);
      if (this.onGround) this.vel.y = 8.2;
    }
  }

  // ------------------------------------------------------------ SUELO
  updateGround(dt) {
    const g = this.game;
    this.thinkT -= dt;
    this.goalT += dt;
    this.cooldown -= dt;
    this.swapT = Math.max(0, this.swapT - dt);
    this.buildCd -= dt;
    this.swingT = Math.max(0, this.swingT - dt);
    this.burstPause -= dt;
    this.nadeCd -= dt;
    if (this.c4T > 0) {
      this.c4T -= dt;
      if (this.c4T <= 0) g.explosives.detonate(this);
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0 && this.weapon) this.weapon.mag = WEAPONS[this.weapon.type].mag;
    }
    if (this.thinkT <= 0) {
      this.thinkT = THINK;
      this.perceive();
      this.pickTarget();
      this.decide();
      this.autoPickup();
      if (g.infiniteMats) this.mats.wood = Math.max(this.mats.wood, 200);
    }

    // Si deja de curarse (p. ej. para pelear) se cancela la cura a medias
    if (this.using && this.task !== 'heal') {
      this.cancelUse();
      this.crouching = false;
    }
    let speed = 5.4;
    let jump = false;
    wish.set(0, 0, 0);
    switch (this.task) {
      case 'crawl':
        if (this.goal && this.goalRef) this.goal.copy(this.goalRef.pos);
        this.navigate(this.goal, 1.2);
        speed = 1.6;
        break;
      case 'rotate':
        this.navigate(this.goal, 4);
        speed = 7.2;
        if (this.targetVisible) this.aimAndShoot(dt);
        break;
      case 'investigate':
        if (this.navigate(this.goal, 10)) this.rumor = null;
        speed = 6.8;
        break;
      case 'fight':
        speed = this.fightMove(dt);
        if (!this.tryThrow()) this.aimAndShoot(dt);
        break;
      case 'hunt': {
        const m = this.memory.get(this.goalRef);
        if (m) this.goal.copy(m.pos);
        if (this.navigate(this.goal, 3)) this.memory.delete(this.goalRef);
        speed = 6.2;
        if (this.target && this.memory.get(this.target)?.seen === false && !this.tryThrow()) this.shootBlockingBuild(dt);
        break;
      }
      case 'heal':
        this.doHeal(dt);
        break;
      case 'revive':
        this.doRevive(dt);
        break;
      case 'follow': {
        const L = this.goalRef;
        if (L) this.goal.set(L.pos.x + ((this.id % 3) - 1) * 4, 0, L.pos.z + (((this.id >> 1) % 3) - 1) * 4);
        this.navigate(this.goal, 5);
        speed = this.goal && this.goal.distanceTo(this.pos) > 20 ? 7.6 : 5.4;
        break;
      }
      case 'loot':
        if (this.navigate(this.goal, this.goalRef?.item ? 1.0 : 2.0)) {
          const c = this.goalRef;
          if (c && c.kind === 'chest' && !c.opened) g.containers.open(c, this);
          this.task = 'idle';
          this.thinkT = 0.5;
        }
        speed = this.goal && this.goal.distanceTo(this.pos) > 25 ? 7.2 : 5.4;
        break;
      case 'harvest':
        this.doHarvest(dt);
        break;
      default:
        if (this.navigate(this.goal, 4)) this.goal = null;
        speed = this.goal && this.goal.distanceTo(this.pos) > 30 ? 7.2 : 5.4;
    }
    if (this.task !== 'fight' && this.task !== 'rotate' && this.targetVisible && this.reaction <= 0) this.aimAndShoot(dt);
    else if (this.task !== 'fight' && this.task !== 'heal' && this.task !== 'revive' && wish.lengthSq() > 0) {
      this.yaw = Math.atan2(-wish.x, -wish.z);
      this.pitch *= 0.9;
    }

    // Atascos: saltar, luego desvío y recalcular camino
    if (this.detourT > 0) {
      this.detourT -= dt;
      wish.copy(this.detour);
    }
    this.stuckT += dt;
    if (this.stuckT > 0.6) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      if (wish.lengthSq() > 0.1 && moved < 0.35 * speed * 0.2 + 0.2) this.stuckCount++;
      else this.stuckCount = 0;
      if (this.stuckCount >= 2) {
        this.path = null;
        this.pathT = -99;
      }
      if (this.stuckCount >= 4 && this.detourT <= 0) {
        const a = Math.atan2(wish.z, wish.x) + (random.chance(0.5) ? 1 : -1) * random.float(1.2, 2.2);
        this.detour.set(Math.cos(a), 0, Math.sin(a));
        this.detourT = random.float(0.6, 1.4);
        this.stuckCount = 0;
        if (this.goalRef && (this.task === 'loot' || this.task === 'harvest')) this.blacklist.add(this.goalRef);
      }
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
    }
    if (this.stuckCount >= 1 && this.onGround) jump = true;
    if (wish.lengthSq() > 1) wish.normalize();
    if (this.knocked) speed = Math.min(speed, 1.6);
    const land = this.groundStep(dt, wish, speed, jump && !this.knocked);
    this.fallDamage(land);
  }

  // Movimiento de combate: distancia ideal según el arma, esquivas y saltos.
  fightMove(dt) {
    const tgt = this.target;
    if (!tgt) return 5.4;
    const m = this.memory.get(tgt);
    tmpA.set(m.pos.x - this.pos.x, 0, m.pos.z - this.pos.z);
    const d = tmpA.length() || 1;
    tmpA.divideScalar(d);
    const [rmin, rmax] = this.weapon ? rangeOf(this.weapon) : [0, 1.5];
    wish.set(0, 0, 0);
    const low = this.health + this.shield < 50;
    if (!this.targetVisible) {
      this.navigate(m.pos, 2);
      return 6.2;
    }
    if (low && d > 7 && this.weapon) wish.copy(tmpA).negate();
    else if (d > rmax) wish.copy(tmpA);
    else if (d < rmin) wish.copy(tmpA).negate();
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = random.float(0.5, 1.5);
      this.strafe = -this.strafe;
    }
    if (this.weapon) wish.addScaledVector(tmpB.set(-tmpA.z, 0, tmpA.x), this.strafe * this.d.strafe);
    if (this.onGround && random.chance(this.d.jump * dt)) this.groundJump = true;
    // Ventaja de altura: rampa hacia el enemigo si está muy por encima
    if (this.game.mode.build && tgt.pos.y - this.pos.y > 3.5 && d < 30 && this.buildCd <= 0 && random.chance(this.d.build * 0.5)) {
      const dir = yawToDir(Math.atan2(-tmpA.x, -tmpA.z));
      if (this.totalMats >= 40 && this.d.build >= 0.5) {
        // «90»: muro hacia el enemigo y rampa girada para ganar altura
        const b = this.game.build;
        b.placeFor(this, 'wall', dir);
        const side = (dir + (this.strafe > 0 ? 1 : 3)) % 4;
        b.placeFor(this, 'ramp', side);
        const [sx, sz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
        wish.set(sx, 0, sz);
        this.groundJump = true;
        this.buildCd = 0.55;
      } else {
        this.game.build.placeFor(this, 'ramp', dir);
        this.buildCd = 0.8;
        wish.copy(tmpA);
      }
    }
    // Encajonado: abre una ventana en el muro que da al enemigo para disparar
    if (this.box && this.buildCd <= 0 && !this.peek) this.peekEdit(m.pos);
    if (this.groundJump) {
      this.groundJump = false;
      this.vel.y = this.onGround ? 8.2 : this.vel.y;
    }
    // Recargar detrás de un muro si el enemigo está cerca
    if (this.reloadT > 0 && d < 25 && this.buildCd <= 0 && this.game.mode.build && random.chance(this.d.build * 0.6)) this.buildWallToward(tgt.pos);
    return low ? 6.5 : 4.8;
  }

  // ------------------------------------------------------------ DISPARO
  chooseWeapon(d) {
    let best = this.cur, bs = weaponScore(this.weapon, d);
    for (let i = 0; i < this.weapons.length; i++) {
      const s = weaponScore(this.weapons[i], d);
      if (s > bs + 0.25) {
        bs = s;
        best = i;
      }
    }
    if (best !== this.cur) {
      this.cur = best;
      this.swapT = 0.35;
      this.reloadT = 0;
      this.setHeld(this.weapon || PICKAXE);
    }
  }

  aimAndShoot(dt) {
    const g = this.game;
    const tgt = this.target;
    if (!tgt || !tgt.alive) return;
    const m = this.memory.get(tgt);
    if (!m) return;
    const eye = this.eye;
    const aim = tmpA.copy(this.targetVisible ? tgt.pos : m.pos);
    aim.y += tgt.height * (this.aimHead ? 0.9 : 0.62);
    const dist = aim.distanceTo(eye);
    this.chooseWeapon(dist);
    const def = this.def;
    const ballistic = def?.projectile || def?.explosive;
    if (ballistic) {
      const t = dist / ballistic.speed;
      aim.addScaledVector(tgt.vel, t);
      aim.y += 0.5 * ballistic.gravity * t * t;
      if (def.explosive) aim.y -= tgt.height * 0.45; // a los pies: la explosión alcanza igual
    } else if (this.d.track > 5) aim.addScaledVector(tgt.vel, 0.05);
    const dx = aim.x - eye.x, dy = aim.y - eye.y, dz = aim.z - eye.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    const step = this.d.track * dt;
    this.aimYaw += clamp(angDiff(this.aimYaw, wantYaw), -step, step);
    this.aimPitch += clamp(wantPitch - this.aimPitch, -step, step);
    this.yaw = this.aimYaw;
    this.pitch = this.aimPitch;
    this.timeOnTarget += dt;
    this.reaction -= dt;
    const aligned = Math.abs(angDiff(this.aimYaw, wantYaw)) < 0.15 && Math.abs(wantPitch - this.aimPitch) < 0.15;
    if (this.reaction > 0 || !aligned || !this.targetVisible || this.swapT > 0 || this.using || this.knocked) return;

    if (!def) {
      // Sin arma: pico cuerpo a cuerpo
      if (dist < 2.4 && this.swingT <= 0) {
        this.swingT = 0.55;
        tgt.damage(20, 'pickaxe', this);
        g.audio.pickaxe();
      }
      return;
    }
    if (this.reloadT > 0 || this.cooldown > 0 || this.burstPause > 0) return;
    if (this.weapon.mag <= 0) {
      this.startReload();
      return;
    }
    if (dist > def.range) return;

    // Error de puntería persistente que se reduce al fijar el blanco
    const t = g.time;
    const settle = 1 + 1.8 * Math.exp(-this.timeOnTarget / 1.1);
    const mov = (this.hSpeed > 1 ? 1.3 : 1) * (tgt.hSpeed > 3 ? 1.25 : 1) * (tgt.knocked ? 0.6 : 1);
    const err = this.d.err * settle * mov;
    const ey = (Math.sin(t * 1.7 + this.ph[0]) + 0.5 * Math.sin(t * 3.3 + this.ph[1])) * err;
    const ep = (Math.sin(t * 2.1 + this.ph[2]) + 0.5 * Math.sin(t * 3.9 + this.ph[0])) * err * 0.7;
    const yaw = this.aimYaw + ey, pitch = this.aimPitch + ep;
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    this.fire(def, dir, eye);
  }

  startReload() {
    const def = this.def;
    if (!def || this.reloadT > 0) return;
    const r = def.reload[this.weapon.rarity];
    this.reloadT = def.shellReload ? r * (def.mag - this.weapon.mag) : r;
  }

  fire(def, dir, eye) {
    const g = this.game;
    const w = this.weapon;
    w.mag--;
    this.cooldown = 1 / def.rate + random.float(0, 0.05);
    if (def.burst) {
      // Rifle de ráfagas: disparos seguidos y luego la pausa de la cadencia
      this.burstShot++;
      if (this.burstShot < def.burst && w.mag > 0) this.cooldown = def.burstDelay;
      else {
        this.burstShot = 0;
        this.cooldown += random.float(0.05, 0.25);
      }
    } else if (def.auto) {
      this.burstLeft--;
      if (this.burstLeft <= 0) {
        this.burstLeft = random.int(this.d.burst[0], this.d.burst[1]);
        this.burstPause = random.float(this.d.pause[0], this.d.pause[1]);
      }
    } else this.cooldown += random.float(0.05, 0.25) + (def.charge || 0);
    if (def.explosive) {
      const muzzleE = eye.clone().addScaledVector(dir, 0.8);
      g.explosives.launch(this, w.type, w.rarity, muzzleE, dir, 1);
      g.net?.shotFx(this, def.sound, muzzleE, []);
      const dC = this.pos.distanceTo(g.camera.position);
      const v = clamp(1 - dC / 260, 0, 1);
      if (v > 0.03) g.audio.shot(def.sound, v * v * 0.9, this.pos);
      g.noise(this.pos, 90, this);
      return;
    }
    const still = this.hSpeed < 1;
    const spread = def.pellets ? def.spread : (still ? def.adsSpread * 2 + 0.006 : def.spread * 0.8);
    const pellets = def.pellets || 1;
    // Las trazadoras salen del cañón del arma (no de los ojos)
    const muzzle = this.gunMuzzle(new THREE.Vector3(), eye, dir);
    const near = this.pos.distanceToSquared(g.camera.position) < 260 * 260;
    const d = new THREE.Vector3();
    let total = 0, head = false, victim = null;
    const ends = g.net ? [] : null;
    for (let i = 0; i < pellets; i++) {
      g.combat.coneDir(dir, spread, d);
      const hit = g.raycast(eye, d, def.range, 0, this);
      if ((near || ends) && i < 4) {
        const end = hit ? hit.point : eye.clone().addScaledVector(d, def.range);
        if (near) {
          g.effects.tracer(muzzle, end, def.beam || 0xffe0a0, def.beam ? 0.045 : 0.02, def.beam ? 0.14 : 0.07);
          g.effects.nearMiss(muzzle, end, this);
        }
        if (ends) ends.push(end);
      }
      if (!hit) continue;
      if (hit.kind === 'character') {
        if (hit.entity.team === this.team) continue;
        let dmg = def.damage[w.rarity] * (hit.head ? def.headMult : 1);
        if (def.falloff) {
          const [a, b] = def.falloff;
          if (hit.t > a) dmg *= Math.max(0.2, 1 - ((hit.t - a) / (b - a)) * 0.8);
        }
        total += dmg;
        head = head || hit.head;
        victim = hit.entity;
      } else if (hit.kind === 'world' && hit.box?.data?.type === 'build') {
        g.build.damage(hit.box.data.piece, def.damage[w.rarity]);
        if (near && i < 4) g.effects.bulletImpact(eye, hit);
      } else if (hit.kind === 'dummy') {
        g.dummies.damage(hit.dummy, def.damage[w.rarity], hit.head, hit.point);
      } else if (near && i < 4) {
        g.effects.bulletImpact(eye, hit);
      }
    }
    if (victim && total > 0) {
      if (!victim.isPlayer && near) g.effects.hitSpark(victim.pos.clone().setY(victim.pos.y + victim.height * (head ? 0.92 : 0.6)), victim.shield > 0, head);
      victim.damage(total, head ? 'headshot' : 'bullet', this);
    }
    if (ends) g.net.shotFx(this, def.sound, muzzle, ends);
    const dCam = this.pos.distanceTo(g.camera.position);
    const vol = clamp(1 - dCam / 260, 0, 1);
    if (vol > 0.03) g.audio.shot(def.sound, vol * vol * 0.9, this.pos);
    if (dCam < 150) g.effects.muzzleFlash(null, muzzle);
    if (dCam < 35 && !def.beam) g.effects.shell(muzzle.clone().addScaledVector(dir, -0.45), this.yaw, !!def.pellets);
    g.noise(this.pos, def.sound === 'sniper' || def.sound === 'dmr' ? 160 : 90, this);
  }

  // Si el objetivo se esconde tras una construcción, dispararla.
  shootBlockingBuild(dt) {
    const m = this.memory.get(this.target);
    if (!m || this.game.time - m.seenAt > 5 || !this.def || this.reloadT > 0 || this.cooldown > 0) return;
    const eye = this.eye;
    const dir = tmpB.copy(m.pos).setY(m.pos.y + 1).sub(eye);
    const dist = dir.length();
    dir.divideScalar(dist);
    const hit = this.game.raycast(eye, dir, Math.min(dist, 45), 0, this);
    if (hit && hit.kind === 'world' && hit.box?.data?.type === 'build') {
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.pitch = Math.asin(clamp(dir.y, -1, 1));
      if (this.weapon.mag <= 0) this.startReload();
      else this.fire(this.def, dir.clone(), eye);
    }
  }

  nadeCount() {
    let n = 0;
    for (const t of BOT_NADES) n += this.nades[t] || 0;
    return n;
  }

  // Lanza una granada, molotov o C4 al objetivo si está a buena distancia
  // (sobre todo si se esconde detrás de algo). Devuelve true si lanzó.
  tryThrow() {
    if (this.nadeCd > 0 || this.using || this.knocked || this.swapT > 0 || !this.target) return false;
    const g = this.game;
    const m = this.memory.get(this.target);
    if (!m || g.time - m.time > 2) return false;
    const d = Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z);
    this.nadeCd = random.float(1.5, 3);
    const dy = m.pos.y - this.pos.y;
    if (d < 7 || d > 32 || dy > 6 || dy < -16) return false;
    const opts = ['grenade', 'sticky', 'molotov', 'c4'].filter((t) => this.nades[t] > 0);
    if (!opts.length || !random.chance(this.d.nade * (this.targetVisible ? 0.5 : 1))) return false;
    const type = random.pick(opts);
    const T = Math.min(1.7, Math.max(0.45, d / 14));
    const at = m.pos.clone().addScaledVector(this.target.vel, T * 0.5);
    const vel = g.explosives.aimThrow(this, at);
    const dir = tmpA.set(at.x - this.pos.x, 0, at.z - this.pos.z).normalize();
    if (!g.explosives.throwItem(this, type, dir, vel)) return false;
    this.nades[type]--;
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.nadeCd = random.float(5, 10);
    this.cooldown = Math.max(this.cooldown, 0.5);
    if (type === 'c4') this.c4T = T + random.float(0.2, 0.6);
    return true;
  }

  // ------------------------------------------------------------ CONSTRUIR
  buildWallToward(p) {
    const yaw = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    if (this.game.build.placeFor(this, 'wall', yawToDir(yaw))) this.buildCd = 2.2;
  }

  boxUp() {
    const b = this.game.build;
    let n = 0;
    const walls = [];
    for (let dir = 0; dir < 4; dir++) {
      const w = b.placeFor(this, 'wall', dir);
      if (w) {
        n++;
        walls.push(w);
      }
    }
    if (b.placeFor(this, 'cone', 0)) n++;
    if (n) this.buildCd = 3;
    if (walls.length) this.box = { walls, at: this.pos.clone(), t: this.game.time };
  }

  // Editar el muro de la caja que mira al enemigo: ventana, disparar y cerrar.
  peekEdit(enemyPos) {
    const g = this.game;
    const box = this.box;
    if (!box || this.pos.distanceTo(box.at) > 3 || g.time - box.t > 25 || this.d.build < 0.5) {
      this.box = null;
      return;
    }
    const dir = yawToDir(Math.atan2(-(enemyPos.x - this.pos.x), -(enemyPos.z - this.pos.z)));
    const w = box.walls.find((p) => p.dir === dir && g.build.pieces.has(p.key));
    if (!w) return;
    g.build.applyEdit(w, WINDOW_MASK);
    this.peek = { piece: w, until: g.time + random.float(1.6, 2.6) };
    this.buildCd = 1;
  }

  updatePeek() {
    const p = this.peek;
    if (!p || this.game.time < p.until) return;
    this.peek = null;
    if (this.game.build.pieces.has(p.piece.key) && this.alive) this.game.build.applyEdit(p.piece, 0);
  }

  // ------------------------------------------------------------ ACCIONES
  doHeal(dt) {
    const item = this.using || this.healItem();
    if (!item) {
      this.task = 'idle';
      return;
    }
    if (!this.using) {
      if (this.game.mode.build && this.totalMats >= 50 && this.game.time - this.lastHurt < 12) this.boxUp();
      else if (this.nades.smoke > 0 && this.game.time - this.lastHurt < 10) {
        // Sin muros: humo a los pies para curarse a cubierto
        this.nades.smoke--;
        const at = this.pos.clone();
        this.game.explosives.throwItem(this, 'smoke', tmpA.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), this.game.explosives.aimThrow(this, at));
      }
      this.using = item;
      this.useT = CONSUMABLES[item].use || 0.6;
      this.crouching = true;
    }
    this.useT -= dt;
    if (this.useT <= 0) {
      const def = CONSUMABLES[this.using];
      if (this.using === 'campfire') {
        // Fogata a sus pies (cura mientras se queda cerca)
        const y = this.game.world.groundBelow(this.pos.x, this.pos.z, this.pos.y + 1);
        this.game.gadgets.addFire(this.pos.x + 0.8, y, this.pos.z);
        this.game.net?.sendPad(this.pos.x + 0.8, y, this.pos.z, 0, 'fire');
      }
      if (def.heal) this.health = Math.min(def.cap, this.health + def.heal);
      if (def.shield) this.shield = Math.min(def.cap, this.shield + def.shield);
      if (def.over) this.regen = { left: def.over.total, rate: def.over.rate };
      this.heals[this.using]--;
      this.using = null;
      this.crouching = false;
    }
  }

  doRevive(dt) {
    const mate = this.goalRef;
    if (!mate || !mate.alive || !mate.knocked) {
      this.task = 'idle';
      return;
    }
    if (this.navigate(mate.pos, 1.6)) {
      mate.reviveT += dt;
      mate.reviver = this;
      this.yaw = Math.atan2(-(mate.pos.x - this.pos.x), -(mate.pos.z - this.pos.z));
      if (mate.reviveT >= 5) {
        mate.revive();
        this.game.onRevive(mate, this);
        this.task = 'idle';
      }
    }
  }

  doHarvest(dt) {
    const h = this.goalRef;
    if (!h || h.hp <= 0) {
      this.task = 'idle';
      return;
    }
    const reach = h.kind === 'rock' ? h.s * 0.75 + 1.4 : 1.6;
    if (this.navigate(h.center, reach)) {
      this.yaw = Math.atan2(-(h.center.x - this.pos.x), -(h.center.z - this.pos.z));
      if (this.swingT <= 0) {
        this.swingT = 0.55;
        this.game.harvest.hit(h, 50, this);
        if (this.pos.distanceTo(this.game.camera.position) < 60) this.game.audio.harvest(h.mat);
      }
      if (this.totalMats >= 220) this.task = 'idle';
    }
  }

  autoPickup() {
    const g = this.game;
    for (const pk of g.pickups.items) {
      if (!pk.settled || pk.pos.distanceToSquared(this.pos) > 3.2 || Math.abs(pk.pos.y - this.pos.y) > 1.6) continue;
      const it = pk.item;
      if (it.kind === 'consumable' && !(it.type in this.heals)) continue;
      if (it.kind === 'weapon') {
        let slot = this.weapons.findIndex((w) => !w);
        if (slot < 0) {
          // sustituir el peor arma si la nueva es mejor (o el mismo tipo peor)
          let worst = -1, wr = 99;
          this.weapons.forEach((w, i) => {
            const r = w.rarity + (w.type === it.type ? -0.5 : 0) + (WEAPONS[w.type].cat === 'pistol' ? -1 : 0);
            if (r < wr) {
              wr = r;
              worst = i;
            }
          });
          if (wr >= it.rarity) continue;
          slot = worst;
          g.pickups.spawn(this.weapons[slot], pk.pos.clone(), new THREE.Vector3(0, 3, 0));
        }
        this.weapons[slot] = { ...it };
        if (!this.weapon) this.cur = slot;
        this.setHeld(this.weapon || PICKAXE);
      } else if (it.kind === 'consumable') {
        this.heals[it.type] = (this.heals[it.type] || 0) + it.count;
      } else if (it.kind === 'throwable') {
        this.nades[it.type] = Math.min(THROWABLES[it.type].max, (this.nades[it.type] || 0) + it.count);
      } else if (it.kind === 'material') {
        this.mats[it.mat] = Math.min(MATERIALS[it.mat].max, this.mats[it.mat] + it.count);
      } else if (it.kind !== 'ammo') continue;
      g.net?.claimPickup(pk, this);
      g.pickups.remove(pk);
      if (this.goalRef === pk) this.task = 'idle';
      break;
    }
  }
}

export class BotManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.pool = [];
  }

  // Prepara `count` bots activos con sus equipos.
  reset(count, teams, diff) {
    while (this.pool.length < count) this.pool.push(new Bot(this.game, this.pool.length));
    random.shuffle(this.pool);
    this.list = this.pool.slice(0, count);
    this.pool.forEach((b, i) => {
      b.reset(diff);
      if (i >= count) {
        b.alive = false;
        b.model.root.visible = false;
      }
    });
    const names = random.shuffle(NAMES.slice());
    this.list.forEach((b, i) => {
      b.team = teams[i];
      b.name = names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : '');
    });
  }

  get aliveCount() {
    let n = 0;
    for (const b of this.list) if (b.alive) n++;
    return n;
  }

  // Marcador del jugador: sus compañeros bots van hacia allí.
  onPing(pos, team) {
    let n = 0;
    for (const b of this.list) {
      if (!b.alive || b.team !== team || b.knocked) continue;
      b.ping = { pos: pos.clone(), until: this.game.time + 30 };
      n++;
    }
    return n;
  }

  // Añade un bot durante la partida (modo creativo).
  spawnExtra(team, diff, x, z, loadout) {
    let b = this.pool.find((q) => !this.list.includes(q));
    if (!b) {
      b = new Bot(this.game, this.pool.length);
      this.pool.push(b);
    }
    b.reset(diff);
    b.team = team;
    b.name = NAMES[random.int(0, NAMES.length - 1)];
    b.respawnAt(x, z, loadout, this.game.world.terrain.heightAt(x, z) + 6);
    this.list.push(b);
    return b;
  }

  removeAll() {
    for (const b of this.list) {
      b.alive = false;
      b.model.root.visible = false;
    }
    this.list = [];
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
