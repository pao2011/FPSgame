import * as THREE from 'three';
import { GRAVITY, HALF, WATER_LEVEL } from '../world/constants.js';
import { makeCharacter, makeGlider, makeItemModel, optimizeCharacter, mergedMesh, itemKey } from './models.js';
import { rayAABB } from './dummies.js';
import { clamp } from '../core/rng.js';

export const R = 0.35; // medio ancho de la caja de colisión
const STEP = 0.55; // altura máxima de escalón
const SWIM_Y = WATER_LEVEL - 1.25;

export const SKINS = [0xf1c9a5, 0xe0b48a, 0xc68a5a, 0xa86f48, 0x8d5a3a, 0x5e3a24];
export const SHIRTS = [0x2f6fd6, 0xd63a2f, 0x2fa84f, 0xe0a020, 0x8a3fd6, 0x1fb5b0, 0xe05a9a, 0x444a55, 0xff7a1a, 0xf2f2f2, 0x1b1b22, 0x7ad0ff];
export const PANTS = [0x2b2b38, 0x3a4a6a, 0x5a4632, 0x2f4a2f, 0x1d1d1d, 0x8a2a2a, 0xc9b28a, 0x4a3a6a];
export const HAIR = [0x3a2a1a, 0x111111, 0xc9a050, 0x7a3a1a, 0xdddddd, 0xd23a6a, 0x3a7ad2, 0x4fd27a];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function randomOutfit() {
  return { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR) };
}
const MUZZLES = new Map();

// Personaje físico compartido por el jugador y los bots: colisiones contra
// cajas + terreno, modos de caída/planeo/suelo, daño y modelo animado.
export class Character {
  constructor(game, outfit = null) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this._q = [];
    this.glider = makeGlider();
    this.glider.visible = false;
    this.setOutfit(outfit || randomOutfit());
    this.heldKey = null;
    this.yaw = 0;
    this.pitch = 0;
    this.team = 0;
  }

  // (Re)construye el modelo con los colores indicados.
  setOutfit(outfit) {
    const o = { ...randomOutfit(), ...outfit };
    const sig = `${o.skin}|${o.shirt}|${o.pants}|${o.hair}|${o.suit || ''}|${o.acc || ''}|${o.camo || ''}`;
    if (sig === this.outfitSig) return;
    this.outfitSig = sig;
    this.outfit = o;
    const old = this.model;
    this.model = optimizeCharacter(makeCharacter(o));
    if (old) {
      this.game.scene.remove(old.root);
      this.model.root.visible = old.root.visible;
    }
    this.game.scene.add(this.model.root);
    this.model.root.add(this.glider);
    this.heldKey = null;
  }

  resetBody() {
    this.vel.set(0, 0, 0);
    this.mode = 'lobby';
    this.onGround = false;
    this.canStep = false;
    this.jumped = false;
    this.crouching = false;
    this.sprinting = false;
    this.swimming = false;
    this.health = 100;
    this.shield = 0;
    this.alive = true;
    this.eyeOffset = 0;
    this.freefallTime = 0;
    this.altitude = 0;
    this.walkPhase = 0;
    this.glideT = 0;
    this.diveAmount = 0;
    this.glider.visible = false;
    this.knocked = false;
    this.knockHp = 0;
    this.knocker = null;
    this.reviveT = 0;
    this.invuln = 0;
    this.noFallT = 0; // sin daño de caída (impulso, plataforma de salto)
    this.launchT = 0;
    this.launched = false; // lanzado por una explosión (sin daño al caer)
    this.padLaunch = false; // plataforma de salto (abre el planeador)
    this.regen = null; // curación progresiva (Zumo Slurp)
  }

  // Temporizadores comunes y curación progresiva.
  tickCommon(dt) {
    this.noFallT = Math.max(0, this.noFallT - dt);
    this.launchT = Math.max(0, this.launchT - dt);
    const r = this.regen;
    if (r && this.alive && !this.knocked) {
      let amt = Math.min(r.left, r.rate * dt);
      r.left -= amt;
      const toHp = Math.min(amt, 100 - this.health);
      this.health += toHp;
      amt -= toHp;
      if (amt > 0) this.shield = Math.min(100, this.shield + amt);
      if (r.left <= 0 || (this.health >= 100 && this.shield >= 100)) this.regen = null;
    }
  }

  get height() {
    return this.crouching ? 1.25 : 1.8;
  }

  get eyeHeight() {
    return this.crouching ? 1.12 : 1.62;
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight + this.eyeOffset, this.pos.z);
  }

  get hSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get inAir() {
    return this.mode === 'freefall' || this.mode === 'glide';
  }

  // ------------------------------------------------------------ MOVIMIENTO
  // wish: dirección horizontal deseada (normalizada o cero). dive: 0..1
  freefallStep(dt, wish, dive) {
    this.freefallTime += dt;
    this.altitude = this.pos.y - this.game.world.groundBelow(this.pos.x, this.pos.z, this.pos.y);
    const hs = 17 - 7 * dive;
    const vy = -30 - 28 * dive;
    const k = Math.min(1, dt * 1.6);
    this.vel.x += (wish.x * hs - this.vel.x) * k;
    this.vel.z += (wish.z * hs - this.vel.z) * k;
    this.vel.y += (vy - this.vel.y) * Math.min(1, dt * 2);
    this.diveAmount = dive;
    this.move(dt);
  }

  deployGlider() {
    this.mode = 'glide';
    this.glideT = 0;
    this.glider.visible = true;
    this.vel.y = Math.max(this.vel.y, -18);
  }

  glideStep(dt, wish, dive) {
    this.glideT += dt;
    this.altitude = this.pos.y - this.game.world.groundBelow(this.pos.x, this.pos.z, this.pos.y);
    const hs = 14 + 4 * dive;
    const vy = -8 - 6 * dive;
    const k = Math.min(1, dt * 1.2);
    this.vel.x += (wish.x * hs - this.vel.x) * k;
    this.vel.z += (wish.z * hs - this.vel.z) * k;
    this.vel.y += (vy - this.vel.y) * Math.min(1, dt * 2.5);
    this.diveAmount = dive;
    this.move(dt);
  }

  // Devuelve la velocidad de impacto si ha aterrizado este paso.
  groundStep(dt, wish, speed, jump) {
    const accel = this.onGround ? 14 : 2.5;
    const k = Math.min(1, dt * accel);
    this.vel.x += (wish.x * speed - this.vel.x) * k;
    this.vel.z += (wish.z * speed - this.vel.z) * k;
    this.jumped = false;
    if (jump && this.onGround && !this.swimming) {
      this.vel.y = 8.2;
      this.onGround = false;
      this.jumped = true;
      if (this.crouching) {
        this.crouching = false;
        this.eyeOffset -= 0.5;
      }
    }
    this.vel.y -= GRAVITY * dt;
    const land = this.move(dt);
    // Lanzado por una explosión: al caer no se hace daño
    if (this.launched && this.onGround && this.vel.y <= 0) {
      this.launched = false;
      return 0;
    }
    return land;
  }

  fallDamage(landSpeed) {
    if (this.noFallT > 0) return;
    if (landSpeed > 17) this.damage(Math.round((landSpeed - 17) * 5), 'fall');
  }

  // ------------------------------------------------------------ FÍSICA
  move(dt) {
    const wasGround = this.onGround;
    this.canStep = wasGround;
    this.onGround = false;
    let landSpeed = 0;
    const maxComp = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt;
    const n = Math.min(40, Math.max(1, Math.ceil(maxComp / 0.25)));
    const sdt = dt / n;
    for (let i = 0; i < n; i++) {
      this._moveH(0, this.vel.x * sdt);
      this._moveH(2, this.vel.z * sdt);
      const vy = this.vel.y;
      this._moveY(vy * sdt);
      if (this.onGround) {
        if (vy < 0) landSpeed = Math.max(landSpeed, -vy);
        this.canStep = true;
      }
    }
    // Pegarse al suelo al bajar escaleras/pendientes
    if (!this.onGround && wasGround && this.vel.y <= 0 && !this.jumped && this.mode === 'ground') {
      const g = this._groundProbe(0.6);
      if (g !== null) {
        this.eyeOffset += this.pos.y - g;
        this.pos.y = g;
        this.onGround = true;
        this.vel.y = 0;
      }
    }
    this.swimming = false;
    if (this.mode === 'ground' && this.pos.y < SWIM_Y) {
      this.pos.y = SWIM_Y;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
      this.swimming = true;
    }
    // Límite del mundo (incluye la isla de inicio, fuera del mapa)
    const lim = HALF + 560;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    return landSpeed;
  }

  _overlap(b) {
    const p = this.pos;
    const e = 1e-5;
    return (
      p.x - R < b.maxX - e && p.x + R > b.minX + e &&
      p.y < b.maxY - e && p.y + this.height > b.minY + e &&
      p.z - R < b.maxZ - e && p.z + R > b.minZ + e
    );
  }

  _moveH(axis, amt) {
    if (amt === 0) return;
    const p = this.pos;
    if (axis === 0) p.x += amt;
    else p.z += amt;
    const h = this.height;
    const col = this.game.world.collision;
    const boxes = col.query(p.x - R, p.y, p.z - R, p.x + R, p.y + h, p.z + R, this._q);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!this._overlap(b)) continue;
      const stepH = b.maxY - p.y;
      if (
        this.canStep && this.mode === 'ground' && stepH > 0 && stepH <= STEP &&
        !col.overlaps(p.x - R, b.maxY + 0.001, p.z - R, p.x + R, b.maxY + h, p.z + R)
      ) {
        p.y = b.maxY;
        this.eyeOffset -= stepH;
        continue;
      }
      if (axis === 0) {
        p.x = amt > 0 ? b.minX - R - 1e-4 : b.maxX + R + 1e-4;
        this.vel.x = 0;
      } else {
        p.z = amt > 0 ? b.minZ - R - 1e-4 : b.maxZ + R + 1e-4;
        this.vel.z = 0;
      }
    }
  }

  _moveY(amt) {
    const p = this.pos;
    p.y += amt;
    const h = this.height;
    const boxes = this.game.world.collision.query(p.x - R, p.y, p.z - R, p.x + R, p.y + h, p.z + R, this._q);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!this._overlap(b)) continue;
      if (amt <= 0) {
        p.y = b.maxY;
        this.vel.y = 0;
        this.onGround = true;
      } else {
        p.y = b.minY - h - 1e-4;
        this.vel.y = 0;
      }
    }
    const th = this.game.world.terrain.heightAt(p.x, p.z);
    if (p.y <= th) {
      p.y = th;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    }
  }

  _groundProbe(maxDrop) {
    const p = this.pos;
    let best = this.game.world.terrain.heightAt(p.x, p.z);
    if (best < p.y - maxDrop) best = -Infinity;
    const boxes = this.game.world.collision.query(p.x - R, p.y - maxDrop, p.z - R, p.x + R, p.y, p.z + R, this._q);
    for (const b of boxes) if (b.maxY <= p.y + 1e-3 && b.maxY > best) best = b.maxY;
    return best === -Infinity ? null : best;
  }

  // ------------------------------------------------------------ IMPACTOS
  // Raycast contra la cabeza y el cuerpo (cajas alineadas a ejes).
  raycastHit(o, dir, maxT) {
    if (!this.alive || this.mode === 'bus' || this.mode === 'lobby' || this.vehicle) return null;
    const p = this.pos;
    if (Math.abs(p.x - o.x) > maxT + 2 || Math.abs(p.z - o.z) > maxT + 2) return null;
    const h = this.height;
    const headMin = h - 0.38;
    let best = null;
    let t = rayAABB(o, dir, [p.x - 0.2, p.y + headMin, p.z - 0.2], [p.x + 0.2, p.y + h + 0.08, p.z + 0.2], maxT);
    if (t !== null) best = { t, head: true };
    t = rayAABB(o, dir, [p.x - 0.33, p.y, p.z - 0.33], [p.x + 0.33, p.y + headMin, p.z + 0.33], best ? best.t : maxT);
    if (t !== null) best = { t, head: false };
    return best;
  }

  // Daño común: sin fuego amigo, derribo si quedan compañeros en pie y
  // eliminación. Devuelve true (eliminado), 'knock' (derribado) o false.
  damage(amount, type, attacker = null) {
    if (!this.alive || amount <= 0) return false;
    if (attacker && attacker !== this && attacker.team === this.team) return false;
    // Isla de inicio y modo dios (creativo): sin daño
    if (this.game.phase === 'lobby' || (this.isPlayer && this.game.godMode)) return false;
    if (this.invuln > 0 && type !== 'storm') return false;
    if (this.knocked) {
      this.knockHp -= amount;
      this.onHurt(amount, type, attacker);
      if (this.knockHp <= 0) {
        this.eliminate(type, attacker || this.knocker);
        return true;
      }
      return false;
    }
    this.absorb(amount, type);
    this.onHurt(amount, type, attacker);
    if (this.health <= 0) {
      this.health = 0;
      if (this.game.canKnock(this)) {
        this.knock(type, attacker);
        return 'knock';
      }
      this.eliminate(type, attacker);
      return true;
    }
    return false;
  }

  onHurt() {}
  onEliminated() {}

  knock(type, attacker) {
    this.knocked = true;
    this.knockHp = 100;
    this.knocker = attacker;
    this.crouching = true;
    this.reviveT = 0;
    this.game.onKnock(this, attacker, type);
  }

  revive() {
    this.knocked = false;
    this.health = 30;
    this.shield = 0;
    this.crouching = false;
    this.knocker = null;
    this.reviveT = 0;
    this.invuln = 1;
  }

  eliminate(type, killer) {
    if (!this.alive) return;
    this.alive = false;
    this.knocked = false;
    this.onEliminated(type, killer);
    this.game.onElimination(this, killer, type);
  }

  // Desangrado mientras está derribado.
  updateKnocked(dt) {
    this.invuln = Math.max(0, this.invuln - dt);
    if (!this.knocked) return;
    this.knockHp -= dt * 3;
    if (this.knockHp <= 0) this.eliminate('bleed', this.knocker);
  }

  // Aplica el daño (el escudo absorbe salvo tormenta/caída). Devuelve el
  // reparto para poder mostrar los números.
  absorb(amount, type) {
    let rest = amount;
    let shieldDmg = 0;
    if (type !== 'storm' && type !== 'fall' && this.shield > 0) {
      shieldDmg = Math.min(this.shield, rest);
      this.shield -= shieldDmg;
      rest -= shieldDmg;
    }
    this.health -= rest;
    return { shieldDmg, hpDmg: rest };
  }

  // ------------------------------------------------------------ MODELO
  setHeld(item) {
    const key = item ? itemKey(item) : 'none';
    if (key === this.heldKey) return;
    this.heldKey = key;
    const hand = this.model.hand;
    while (hand.children.length) hand.remove(hand.children[0]);
    if (!item) return;
    // Malla fusionada (1 draw call) + punto de boca de cañón para trazadoras.
    const camo = item.kind === 'weapon' ? this.outfit?.camo || null : null;
    const mk = itemKey(item) + (camo ? '_' + camo : '');
    if (!MUZZLES.has(mk)) MUZZLES.set(mk, makeItemModel(item).userData.muzzle?.position.clone() ?? new THREE.Vector3());
    const m = new THREE.Group();
    m.add(mergedMesh(mk, () => makeItemModel(item, camo)));
    const muzzle = new THREE.Object3D();
    muzzle.position.copy(MUZZLES.get(mk));
    m.add(muzzle);
    m.userData.muzzle = muzzle;
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, -0.05, 0);
    if (item.kind === 'pickaxe') {
      m.rotation.x = 0;
      m.position.y = -0.2;
    }
    hand.add(m);
  }

  updateModel(dt, item, swingT = 0) {
    const m = this.model;
    const root = m.root;
    root.position.copy(this.pos);
    root.rotation.set(0, this.yaw, 0);
    m.body.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0);
    m.head.rotation.set(0, 0, 0);
    const joints = (kl, kr, el, er) => {
      if (m.kneeL) {
        m.kneeL.rotation.set(kl, 0, 0);
        m.kneeR.rotation.set(kr, 0, 0);
        m.elbowL.rotation.set(el, 0, 0);
        m.elbowR.rotation.set(er, 0, 0);
      }
    };
    if (this.emote && this.updateEmote?.(dt, m, joints)) return;
    if (this.mode === 'freefall') {
      const t = (this.freefallTime || 0) * 3;
      m.body.rotation.x = -1.1 - this.diveAmount * 0.4;
      m.body.position.y = 1.2;
      m.armL.rotation.set(Math.sin(t) * 0.1, 0, -2.2 + this.diveAmount * 0.9);
      m.armR.rotation.set(-Math.sin(t) * 0.1, 0, 2.2 - this.diveAmount * 0.9);
      m.legL.rotation.set(0.3 - this.diveAmount * 0.2, 0, -0.25);
      m.legR.rotation.set(0.3 - this.diveAmount * 0.2, 0, 0.25);
      joints(-0.5 + this.diveAmount * 0.4, -0.5 + this.diveAmount * 0.4, 0.3, 0.3);
      return;
    }
    if (this.mode === 'glide') {
      m.body.rotation.x = -0.15 - this.diveAmount * 0.3;
      m.armL.rotation.set(0, 0, -2.7);
      m.armR.rotation.set(0, 0, 2.7);
      m.legL.rotation.set(0.25, 0, 0);
      m.legR.rotation.set(-0.05, 0, 0);
      joints(-0.5, -0.25, 0.25, 0.25);
      this.glider.rotation.z = Math.sin(this.glideT * 1.5) * 0.05;
      return;
    }
    if (this.vehicle) {
      m.legL.rotation.set(1.45, 0, 0.08);
      m.legR.rotation.set(1.45, 0, -0.08);
      m.armL.rotation.set(1.1, 0, 0.1);
      m.armR.rotation.set(1.1, 0, -0.1);
      joints(-1.5, -1.5, 0.5, 0.5);
      m.body.position.y = -0.45;
      return;
    }
    const hs = this.hSpeed;
    this.walkPhase += dt * hs * 1.7;
    const amp = Math.min(1, hs / 5);
    const swing = Math.sin(this.walkPhase) * amp * 0.8;
    // Rodilla: se dobla al pasar la pierna por debajo y hacia atrás
    const kneeL = -(0.08 + Math.max(0, Math.sin(this.walkPhase + 1.4)) * 1.1) * amp;
    const kneeR = -(0.08 + Math.max(0, Math.sin(this.walkPhase + 1.4 + Math.PI)) * 1.1) * amp;
    if (this.knocked) {
      // arrastrándose por el suelo
      m.body.rotation.x = -1.25;
      m.body.position.set(0, 0.35, 0.6);
      m.armL.rotation.set(2.6 + swing, 0, -0.2);
      m.armR.rotation.set(2.6 - swing, 0, 0.2);
      m.legL.rotation.set(0.1 + swing * 0.4, 0, 0);
      m.legR.rotation.set(0.1 - swing * 0.4, 0, 0);
      joints(-0.4 - Math.max(0, swing) * 0.6, -0.4 - Math.max(0, -swing) * 0.6, 0.6, 0.6);
      return;
    }
    let kl = kneeL, kr = kneeR;
    m.legL.rotation.set(swing, 0, 0);
    m.legR.rotation.set(-swing, 0, 0);
    // Inclinación al correr y rebote al andar
    m.body.rotation.x = this.sprinting ? 0.12 : 0.03 * amp;
    m.body.position.y = -Math.abs(Math.sin(this.walkPhase)) * 0.04 * amp;
    if (this.crouching) {
      m.body.position.y = -0.35;
      m.legL.rotation.x = 1.0 + swing * 0.4;
      m.legR.rotation.x = 1.0 - swing * 0.4;
      kl = kr = -1.7;
      m.body.rotation.x = 0.18;
    } else if (this.mode === 'ground' && !this.onGround && !this.swimming) {
      // En el aire (salto): piernas recogidas
      m.legL.rotation.x = 0.6;
      m.legR.rotation.x = 0.15;
      kl = -1.1;
      kr = -0.5;
    }
    let el = 0.35 + Math.max(0, swing) * 0.5, er = 0.35 + Math.max(0, -swing) * 0.5;
    if (item && item.kind === 'weapon') {
      const aim = Math.PI / 2 + this.pitch;
      m.armR.rotation.set(aim, 0, -0.05);
      m.armL.rotation.set(aim - 0.1, 0, 0.6);
      el = 0.25;
      er = 0.1;
      if (m.hand.children[0]) m.hand.children[0].rotation.x = -Math.PI / 2;
      m.head.rotation.x = -this.pitch * 0.4;
    } else {
      m.armR.rotation.set(-swing * 0.8 + 0.2, 0, -0.06);
      m.armL.rotation.set(swing * 0.8, 0, 0.06);
    }
    if (item && item.kind === 'pickaxe' && swingT > 0) {
      m.armR.rotation.x = 1.8 - (1 - swingT / 0.55) * 2.4;
      er = 0.5;
    }
    joints(kl, kr, el, er);
  }
}
