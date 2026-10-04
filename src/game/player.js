import * as THREE from 'three';
import { PICKAXE, CONSUMABLES, AMMO, MATERIALS } from './items.js';
import { Character, R } from './character.js';
import { clamp } from '../core/rng.js';

const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const wish = new THREE.Vector3();

export class Player extends Character {
  constructor(game) {
    super(game);
    this.name = 'Tú';
    this.isPlayer = true;
    this.reset();
  }

  reset() {
    this.resetBody();
    this.pos.set(0, 300, 0);
    this.yaw = 0;
    this.pitch = -0.2;
    this.inventory = [PICKAXE, null, null, null, null, null];
    this.selected = 0;
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0 };
    this.mats = { wood: 0, stone: 0, metal: 0 };
    this.stepTimer = 0;
    this.vehicle = null;
    this.stats = { chests: 0, damage: 0, distance: 0, kills: 0, built: 0 };
    this.model.root.visible = false;
    this.setHeld(PICKAXE);
  }

  get item() {
    return this.inventory[this.selected];
  }

  // ------------------------------------------------------------ INVENTARIO
  addItem(item) {
    if (item.kind === 'ammo') {
      this.ammo[item.ammo] = Math.min(AMMO[item.ammo].max, this.ammo[item.ammo] + item.count);
      return true;
    }
    if (item.kind === 'material') {
      this.mats[item.mat] = Math.min(MATERIALS[item.mat].max, this.mats[item.mat] + item.count);
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
      case 'bus': this.updateBus(input); break;
      case 'freefall': this.updateFreefall(dt, input); break;
      case 'glide': this.updateGlide(dt, input); break;
      case 'ground':
        if (this.vehicle) this.pos.copy(this.vehicle.seatPos);
        else this.updateGround(dt, input);
        break;
    }
    this.updateKnocked(dt);
    this.eyeOffset *= Math.exp(-dt * 14);
    const item = this.game.build?.active ? null : this.item;
    this.updateModel(dt, item, this.game.combat?.swingT ?? 0);
    if (this.vehicle) this.model.root.rotation.y = this.vehicle.heading;
  }

  updateBus(input) {
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
    const w = this.moveWish(input);
    const dive = input.down('KeyW') ? clamp((-this.pitch - 0.25) / 0.9, 0, 1) : 0;
    this.freefallStep(dt, w, dive);
    const manual = input.wasPressed('Space') && this.freefallTime > 1.0 && this.altitude > 20;
    if (this.altitude < 90 || manual) {
      this.deployGlider();
      this.game.audio.glider();
    }
    if (this.onGround) this.land(false);
  }

  updateGlide(dt, input) {
    const w = this.moveWish(input);
    if (w.lengthSq() === 0) {
      fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      w.copy(fwd).multiplyScalar(0.35);
    }
    const dive = input.down('KeyW') ? clamp((-this.pitch - 0.1) / 0.8, 0, 1) : 0;
    this.glideStep(dt, w, dive);
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
    if (this.knocked) {
      // Derribado: sólo puede arrastrarse
      const w = this.moveWish(input);
      this.sprinting = false;
      this.groundStep(dt, w, 1.6, false);
      return;
    }
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

    const before = this.pos.clone();
    const landSpeed = this.groundStep(dt, w, speed, input.wasPressed('Space'));
    this.stats.distance += Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (landSpeed > 17) {
      this.fallDamage(landSpeed);
      this.game.audio.land();
    }
    const hs = this.hSpeed;
    if (this.onGround && hs > 1) {
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) {
        this.stepTimer = 2.4;
        this.game.audio.step();
      }
    }
  }

  // ------------------------------------------------------------ DAÑO
  onHurt(amount, type, attacker) {
    this.game.hud.flashDamage(type, attacker);
    this.game.audio.hurt();
  }

  onEliminated(type, killer) {
    this.game.onPlayerEliminated(type, killer);
  }
}
