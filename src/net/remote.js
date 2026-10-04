import { Character } from '../game/character.js';
import { PICKAXE, WEAPONS, CONSUMABLES, THROWABLES, makeWeapon } from '../game/items.js';

const INTERP_DELAY = 0.12; // s de retraso para interpolar entre estados
const MODES = ['lobby', 'bus', 'freefall', 'glide', 'ground'];
export const modeCode = (m) => Math.max(0, MODES.indexOf(m));

// Objeto en la mano <-> texto corto para la red.
export function heldCode(item) {
  if (!item) return '';
  if (item.kind === 'weapon') return `w${item.type}:${item.rarity}`;
  if (item.kind === 'consumable') return `c${item.type}`;
  if (item.kind === 'throwable') return `t${item.type}`;
  return 'p';
}

function heldFromCode(code) {
  if (!code) return null;
  if (code === 'p') return PICKAXE;
  if (code[0] === 'w') {
    const [type, r] = code.slice(1).split(':');
    return WEAPONS[type] ? makeWeapon(type, Number(r) || 0) : null;
  }
  if (code[0] === 'c') return CONSUMABLES[code.slice(1)] ? { kind: 'consumable', type: code.slice(1), count: 1 } : null;
  if (code[0] === 't') return THROWABLES[code.slice(1)] ? { kind: 'throwable', type: code.slice(1), count: 1 } : null;
  return null;
}

// Banderas del estado
export const F_CROUCH = 1, F_KNOCKED = 2, F_ALIVE = 4, F_SPRINT = 8, F_SWING = 16;

// Personaje controlado por otro ordenador (otro jugador o un bot del
// anfitrión). No tiene física propia: interpola los estados recibidos.
export class RemotePlayer extends Character {
  constructor(game, info) {
    super(game, info.outfit);
    this.netId = info.id;
    this.name = info.name;
    this.team = info.team;
    this.isRemote = true;
    this.isHuman = !info.bot;
    this.remoteBot = !!info.bot;
    this.snaps = [];
    this.heldItem = null;
    this.heldSig = null;
    this.swingT = 0;
    this.vehicle = null;
    this.gone = false;
    this.dead = false;
    this.resetBody();
    this.mode = 'bus';
    this.model.root.visible = false;
  }

  // s: { p:[x,y,z], y, pi, m, f, hp, sh, h, v }
  applyState(s, now) {
    if (this.gone) return;
    const snap = { t: now, x: s.p[0], y: s.p[1], z: s.p[2], yaw: s.y, pitch: s.pi };
    const last = this.snaps[this.snaps.length - 1];
    if (last && now - last.t < 0.001) this.snaps[this.snaps.length - 1] = snap;
    else this.snaps.push(snap);
    if (this.snaps.length > 20) this.snaps.shift();
    const f = s.f | 0;
    const prevMode = this.mode;
    this.mode = MODES[s.m] || 'ground';
    const alive = !!(f & F_ALIVE);
    if (!this.dead) {
      if (alive && !this.alive && prevMode !== this.mode) this.snaps = [snap]; // reaparición: sin interpolar el salto
      this.alive = alive;
    }
    this.crouching = !!(f & F_CROUCH);
    this.knocked = !!(f & F_KNOCKED);
    this.sprinting = !!(f & F_SPRINT);
    if (f & F_SWING && this.swingT <= 0) this.swingT = 0.55;
    if (this.knocked) this.knockHp = s.hp;
    else this.health = s.hp;
    this.shield = s.sh;
    if (s.h !== this.heldSig) {
      this.heldSig = s.h;
      this.heldItem = heldFromCode(s.h);
    }
    const v = s.v ?? -1;
    this.vehicle = v >= 0 ? this.game.vehicles.list[v] || null : null;
    this.glider.visible = this.mode === 'glide';
  }

  update(dt, now) {
    if (this.gone) return;
    this.swingT = Math.max(0, this.swingT - dt);
    const snaps = this.snaps;
    if (snaps.length) {
      const rt = now - INTERP_DELAY;
      let a = snaps[0], b = snaps[0];
      for (let i = snaps.length - 1; i >= 0; i--) {
        if (snaps[i].t <= rt) {
          a = snaps[i];
          b = snaps[i + 1] || snaps[i];
          break;
        }
      }
      const span = b.t - a.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 1;
      const nx = a.x + (b.x - a.x) * k, ny = a.y + (b.y - a.y) * k, nz = a.z + (b.z - a.z) * k;
      if (dt > 0) this.vel.set((nx - this.pos.x) / dt, (ny - this.pos.y) / dt, (nz - this.pos.z) / dt);
      this.pos.set(nx, ny, nz);
      let dy = b.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw = a.yaw + dy * k;
      this.pitch = a.pitch + (b.pitch - a.pitch) * k;
      // Velocidad horizontal estable para la animación de andar
      if (span > 0) {
        const vx = (b.x - a.x) / span, vz = (b.z - a.z) / span;
        this.vel.x = vx;
        this.vel.z = vz;
      }
    }
    const g = this.game;
    const visible = this.alive && this.mode !== 'bus' && this.mode !== 'lobby' && this.pos.distanceToSquared(g.camera.position) < 360 * 360;
    this.model.root.visible = visible;
    if (!visible) return;
    if (this.vehicle) this.pos.copy(this.vehicle.seatPos);
    const item = this.heldItem;
    this.setHeld(item);
    this.updateModel(dt, item, this.swingT);
    if (this.vehicle) this.model.root.rotation.y = this.vehicle.heading;
  }

  // El daño lo aplica el ordenador que controla a este personaje.
  damage(amount, type, attacker = null) {
    if (!this.alive || amount <= 0 || this.gone) return false;
    if (attacker && attacker !== this && attacker.team === this.team) return false;
    this.game.net?.sendHit(this, amount, type, attacker);
    return false;
  }

  revive() {
    if (this.reviveSentAt && performance.now() - this.reviveSentAt < 1000) return;
    this.reviveSentAt = performance.now();
    this.reviveT = 0;
    this.game.net?.sendRevive(this);
  }

  knock() {}
  eliminate() {}
  updateKnocked() {}

  // Marcado como eliminado por un mensaje de la red.
  netEliminate(permanent) {
    this.alive = false;
    this.knocked = false;
    if (permanent) this.dead = true;
    this.model.root.visible = false;
    this.vehicle = null;
  }

  remove() {
    this.gone = true;
    this.netEliminate(true);
    this.game.scene.remove(this.model.root);
  }

  muzzleWorld(out) {
    const m = this.model.hand.children[0]?.userData.muzzle;
    if (m && this.model.root.visible) {
      this.model.root.updateMatrixWorld(true);
      return m.getWorldPosition(out);
    }
    return out.copy(this.eye);
  }
}

