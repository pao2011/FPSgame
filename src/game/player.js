import * as THREE from 'three';
import { GRAVITY, HALF, WATER_LEVEL } from '../world/constants.js';
import { PICKAXE, CONSUMABLES, AMMO } from './items.js';
import { makeCharacter, makeGlider, makeItemModel } from './models.js';
import { clamp } from '../core/rng.js';

const R = 0.35; // medio ancho de la caja del jugador
const STEP = 0.55; // altura máxima de escalón
const SWIM_Y = WATER_LEVEL - 1.25;

const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const wish = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this._q = [];
    const skins = [0xe0b48a, 0xc68a5a, 0x8d5a3a, 0xf1c9a5];
    const shirts = [0x2f6fd6, 0xd63a2f, 0x2fa84f, 0xe0a020, 0x8a3fd6];
    this.model = makeCharacter({
      skin: skins[Math.floor(Math.random() * skins.length)],
      shirt: shirts[Math.floor(Math.random() * shirts.length)],
    });
    game.scene.add(this.model.root);
    this.glider = makeGlider();
    this.glider.visible = false;
    this.model.root.add(this.glider);
    this.heldKey = null;
    this.reset();
  }

  reset() {
    this.pos.set(0, 300, 0);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.2;
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
    this.inventory = [PICKAXE, null, null, null, null, null];
    this.selected = 0;
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0 };
    this.eyeOffset = 0;
    this.freefallTime = 0;
    this.altitude = 0;
    this.walkPhase = 0;
    this.stepTimer = 0;
    this.glideT = 0;
    this.stats = { chests: 0, damage: 0, distance: 0 };
    this.glider.visible = false;
    this.model.root.visible = false;
    this.setHeld(PICKAXE);
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

  get item() {
    return this.inventory[this.selected];
  }

  get hSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  // ------------------------------------------------------------ INVENTARIO
  addItem(item) {
    if (item.kind === 'ammo') {
      const a = AMMO[item.ammo];
      this.ammo[item.ammo] = Math.min(a.max, this.ammo[item.ammo] + item.count);
      return true;
    }
    if (item.kind === 'consumable') {
      const def = CONSUMABLES[item.type];
      for (let i = 1; i < 6 && item.count > 0; i++) {
        const s = this.inventory[i];
        if (s && s.kind === 'consumable' && s.type === item.type && s.count < def.max) {
          const n = Math.min(def.max - s.count, item.count);
          s.count += n;
          item.count -= n;
        }
      }
      if (item.count <= 0) return true;
    }
    for (let i = 1; i < 6; i++) {
      if (!this.inventory[i]) {
        this.inventory[i] = { ...item };
        if (this.selected === 0 && item.kind === 'weapon') this.game.combat.select(i);
        return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------- UPDATE
  update(dt, input) {
    switch (this.mode) {
      case 'bus': this.updateBus(dt, input); break;
      case 'freefall': this.updateFreefall(dt, input); break;
      case 'glide': this.updateGlide(dt, input); break;
      case 'ground': this.updateGround(dt, input); break;
    }
    this.eyeOffset *= Math.exp(-dt * 14);
    this.updateModel(dt);
  }

  updateBus(dt, input) {
    const bus = this.game.bus;
    this.pos.copy(bus.pos);
    this.pos.y -= 2;
    if ((bus.doorsOpen && input.wasPressed('Space')) || bus.mustEject || !bus.active) this.jumpFromBus();
  }

  jumpFromBus() {
    const bus = this.game.bus;
    this.pos.copy(bus.pos);
    this.pos.y -= 3.5;
    this.vel.copy(bus.velocity).multiplyScalar(0.35);
    this.vel.y = -5;
    this.mode = 'freefall';
    this.freefallTime = 0;
    this.model.root.visible = true;
    this.game.onJumpFromBus();
  }

  moveWish(input) {
    fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(-fwd.z, 0, fwd.x);
    wish.set(0, 0, 0);
    if (input.down('KeyW')) wish.add(fwd);
    if (input.down('KeyS')) wish.sub(fwd);
    if (input.down('KeyD')) wish.add(right);
    if (input.down('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    return wish;
  }

  updateFreefall(dt, input) {
    this.freefallTime += dt;
    this.altitude = this.pos.y - this.game.world.groundBelow(this.pos.x, this.pos.z, this.pos.y);
    const w = this.moveWish(input);
    const dive = input.down('KeyW') ? clamp((-this.pitch - 0.25) / 0.9, 0, 1) : 0;
    const hs = 17 - 7 * dive;
    const vy = -30 - 28 * dive;
    const k = Math.min(1, dt * 1.6);
    this.vel.x += (w.x * hs - this.vel.x) * k;
    this.vel.z += (w.z * hs - this.vel.z) * k;
    this.vel.y += (vy - this.vel.y) * Math.min(1, dt * 2);
    this.diveAmount = dive;
    const auto = this.altitude < 90;
    const manual = input.wasPressed('Space') && this.freefallTime > 1.0 && this.altitude > 20;
    if (auto || manual) {
      this.mode = 'glide';
      this.glideT = 0;
      this.glider.visible = true;
      this.game.audio.glider();
      this.vel.y = Math.max(this.vel.y, -18);
    }
    this.move(dt);
    if (this.onGround) this.land(false);
  }

  updateGlide(dt, input) {
    this.glideT += dt;
    this.altitude = this.pos.y - this.game.world.groundBelow(this.pos.x, this.pos.z, this.pos.y);
    const w = this.moveWish(input);
    if (w.lengthSq() === 0) {
      fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      w.copy(fwd).multiplyScalar(0.35);
    }
    const dive = input.down('KeyW') ? clamp((-this.pitch - 0.1) / 0.8, 0, 1) : 0;
    const hs = 14 + 4 * dive;
    const vy = -8 - 6 * dive;
    const k = Math.min(1, dt * 1.2);
    this.vel.x += (w.x * hs - this.vel.x) * k;
    this.vel.z += (w.z * hs - this.vel.z) * k;
    this.vel.y += (vy - this.vel.y) * Math.min(1, dt * 2.5);
    this.diveAmount = dive;
    this.move(dt);
    if (this.onGround) this.land(true);
  }

  land(fromGlide) {
    this.mode = 'ground';
    this.glider.visible = false;
    this.vel.set(0, 0, 0);
    this.game.audio.land();
    if (!fromGlide) this.damage(30, 'fall');
    this.game.onLanded();
  }

  updateGround(dt, input) {
    const wantCrouch = input.down('KeyC') || input.down('ControlLeft');
    if (wantCrouch && !this.crouching) {
      this.crouching = true;
      this.eyeOffset += 0.5;
    } else if (!wantCrouch && this.crouching) {
      const c = this.game.world.collision;
      if (!c.overlaps(this.pos.x - R, this.pos.y + 0.1, this.pos.z - R, this.pos.x + R, this.pos.y + 1.8, this.pos.z + R)) {
        this.crouching = false;
        this.eyeOffset -= 0.5;
      }
    }
    const combat = this.game.combat;
    const w = this.moveWish(input);
    const forwardHeld = input.down('KeyW') && !input.down('KeyS');
    this.sprinting = input.down('ShiftLeft') && forwardHeld && !this.crouching && combat.adsBlend < 0.2 && !combat.using;
    let speed = 5.4;
    if (this.crouching) speed = 2.8;
    else if (this.sprinting) speed = 8.0;
    if (combat.adsBlend > 0.5) speed = Math.min(speed, 3.6);
    if (combat.using) speed = Math.min(speed, 2.6);
    if (this.swimming) speed = Math.min(speed, 3.4);

    const accel = this.onGround ? 14 : 2.5;
    const k = Math.min(1, dt * accel);
    this.vel.x += (w.x * speed - this.vel.x) * k;
    this.vel.z += (w.z * speed - this.vel.z) * k;

    this.jumped = false;
    if (input.wasPressed('Space') && this.onGround && !this.swimming) {
      this.vel.y = 8.2;
      this.onGround = false;
      this.jumped = true;
      if (this.crouching) {
        this.crouching = false;
        this.eyeOffset -= 0.5;
      }
    }
    this.vel.y -= GRAVITY * dt;
    const before = this.pos.clone();
    const landSpeed = this.move(dt);
    this.stats.distance += Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (landSpeed > 17) {
      const dmg = Math.round((landSpeed - 17) * 5);
      this.damage(dmg, 'fall');
      this.game.audio.land();
    }
    // pasos
    const hs = this.hSpeed;
    if (this.onGround && hs > 1) {
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) {
        this.stepTimer = 2.4;
        this.game.audio.step();
      }
    }
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
    // Agua
    this.swimming = false;
    if (this.mode === 'ground' && this.pos.y < SWIM_Y) {
      this.pos.y = SWIM_Y;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
      this.swimming = true;
    }
    const lim = HALF + 150;
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

  // ------------------------------------------------------------ DAÑO
  damage(amount, type) {
    if (!this.alive) return;
    let rest = amount;
    if (type !== 'storm' && type !== 'fall' && this.shield > 0) {
      const s = Math.min(this.shield, rest);
      this.shield -= s;
      rest -= s;
    }
    this.health -= rest;
    this.game.hud.flashDamage(type);
    this.game.audio.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.game.onDeath(type);
    }
  }

  // ------------------------------------------------------------ MODELO
  setHeld(item) {
    const key = !item ? 'none' : item.kind === 'weapon' ? `w${item.type}${item.rarity}` : item.kind === 'consumable' ? `c${item.type}` : 'pick';
    if (key === this.heldKey) return;
    this.heldKey = key;
    const hand = this.model.hand;
    while (hand.children.length) hand.remove(hand.children[0]);
    if (!item) return;
    const m = makeItemModel(item);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, -0.05, 0);
    if (item.kind === 'pickaxe') {
      m.rotation.x = 0;
      m.position.y = -0.2;
    }
    m.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    hand.add(m);
  }

  updateModel(dt) {
    const m = this.model;
    const root = m.root;
    root.position.copy(this.pos);
    root.rotation.set(0, this.yaw, 0);
    m.body.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0);
    if (this.mode === 'freefall') {
      const tilt = -1.1 - (this.diveAmount || 0) * 0.4;
      m.body.position.y = 1.0;
      m.body.rotation.x = tilt;
      m.body.position.y = 1.2;
      m.armL.rotation.set(0, 0, -2.2);
      m.armR.rotation.set(0, 0, 2.2);
      m.legL.rotation.set(0.3, 0, -0.25);
      m.legR.rotation.set(0.3, 0, 0.25);
      return;
    }
    if (this.mode === 'glide') {
      m.body.rotation.x = -0.15 - (this.diveAmount || 0) * 0.3;
      m.armL.rotation.set(0, 0, -2.7);
      m.armR.rotation.set(0, 0, 2.7);
      m.legL.rotation.set(0.15, 0, 0);
      m.legR.rotation.set(-0.1, 0, 0);
      this.glider.rotation.z = Math.sin(this.glideT * 1.5) * 0.05;
      return;
    }
    const hs = this.hSpeed;
    this.walkPhase += dt * hs * 1.7;
    const swing = Math.sin(this.walkPhase) * Math.min(1, hs / 5) * 0.8;
    m.legL.rotation.set(swing, 0, 0);
    m.legR.rotation.set(-swing, 0, 0);
    if (this.crouching) {
      m.body.position.y = -0.4;
      m.legL.rotation.x = swing * 0.5 - 0.9;
      m.legR.rotation.x = -swing * 0.5 - 0.9;
      m.body.rotation.x = 0.1;
    }
    const item = this.item;
    if (item && item.kind === 'weapon') {
      const aim = Math.PI / 2 + this.pitch;
      m.armR.rotation.set(aim, 0, 0);
      m.armL.rotation.set(aim, 0, 0.55);
      m.hand.rotation.set(0, 0, 0);
      m.hand.children[0] && (m.hand.children[0].rotation.x = -Math.PI / 2);
    } else {
      m.armR.rotation.set(-swing * 0.8 + 0.3, 0, 0);
      m.armL.rotation.set(swing * 0.8, 0, 0);
    }
    const swingT = this.game.combat?.swingT ?? 0;
    if (item && item.kind === 'pickaxe' && swingT > 0) m.armR.rotation.x = 1.8 - (1 - swingT / 0.55) * 2.4;
  }
}
