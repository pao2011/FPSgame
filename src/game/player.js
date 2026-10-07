import * as THREE from 'three';
import { PICKAXE, AMMO, MATERIALS, stackDef } from './items.js';
import { Character, R } from './character.js';
import { clamp } from '../core/rng.js';
import { GRAVITY } from '../world/constants.js';
import { ZIP_HANG, findZipline } from '../world/ziplines.js';

const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const wish = new THREE.Vector3();
const zP = new THREE.Vector3();
const zT = new THREE.Vector3();

const SPRINT = 8.6; // velocidad corriendo (andar: 5.4)
const SLIDE_BOOST = 3.4; // impulso al empezar a deslizarse
const SLIDE_MAX = 17;

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
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 };
    this.autorun = false;
    this.crouchToggled = false;
    this.mats = { wood: 0, stone: 0, metal: 0 };
    this.stepTimer = 0;
    this.vehicle = null;
    this.stats = { chests: 0, damage: 0, distance: 0, kills: 0, built: 0, edits: 0, heads: 0 };
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
    const def = stackDef(item);
    if (def) {
      for (let i = 1; i < 6 && item.count > 0; i++) {
        const s = this.inventory[i];
        if (s && s.kind === item.kind && s.type === item.type && s.count < def.max) {
          const n = Math.min(def.max - s.count, item.count);
          s.count += n;
          item.count -= n;
        }
      }
      if (item.count <= 0) return true;
    }
    // Las curas se ordenan a la derecha y las armas a la izquierda (Opciones)
    const right = (item.kind === 'consumable' || item.kind === 'throwable') && this.game.settings.autoSortConsumables !== false;
    for (let k = 1; k < 6; k++) {
      const i = right ? 6 - k : k;
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
    this.tickCommon(dt);
    switch (this.mode) {
      case 'bus': this.updateBus(input); break;
      case 'freefall': this.updateFreefall(dt, input); break;
      case 'glide': this.updateGlide(dt, input); break;
      case 'ground':
        if (this.vehicle) this.pos.copy(this.vehicle.seatPos);
        else if (this.zip) this.updateZip(dt, input);
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
    if ((bus.doorsOpen && input.hit('jump')) || bus.mustEject || !bus.active) this.jumpFromBus();
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
    const ax = input.axis;
    if (ax?.active) {
      // Joystick táctil: dirección analógica; empujarlo poco = andar despacio
      wish.addScaledVector(fwd, ax.y).addScaledVector(right, ax.x);
      const m = wish.length();
      if (m > 0.001) wish.multiplyScalar(Math.min(1, Math.max(0.35, m / 0.8)) / m);
      return wish;
    }
    if (input.held('forward') || this.autorun) wish.add(fwd);
    if (input.held('back')) wish.sub(fwd);
    if (input.held('right')) wish.add(right);
    if (input.held('left')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    return wish;
  }

  updateFreefall(dt, input) {
    const w = this.moveWish(input);
    const dive = input.held('forward') ? clamp((-this.pitch - 0.25) / 0.9, 0, 1) : 0;
    this.freefallStep(dt, w, dive);
    const manual = input.hit('jump') && this.freefallTime > 1.0 && this.altitude > 20;
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
    const dive = input.held('forward') ? clamp((-this.pitch - 0.1) / 0.8, 0, 1) : 0;
    this.glideStep(dt, w, dive);
    if (this.onGround) this.land(true);
  }

  land(fromGlide) {
    this.mode = 'ground';
    this.glider.visible = false;
    this.vel.set(0, 0, 0);
    this.game.audio.land();
    if (!fromGlide && this.noFallT <= 0) this.damage(30, 'fall');
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
    if (input.hit('autorun')) this.autorun = !this.autorun;
    if (this.autorun && (input.hit('back') || input.hit('forward'))) this.autorun = false;
    // Modo creativo: volando no hay gravedad
    if (this.game.creative?.flying) {
      this.game.creative.flyStep(dt, this.moveWish(input), input);
      return;
    }
    // Plataforma de salto: al llegar arriba se abre el planeador
    if (this.padLaunch && this.launchT <= 0 && this.vel.y < 4 && !this.onGround) {
      this.padLaunch = false;
      this.deployGlider();
      this.game.audio.glider();
      return;
    }
    // Deslizarse: agacharse mientras se corre
    if (!this.sliding && input.hit('crouch') && this.onGround && !this.swimming && this.slideCd <= 0 && (this.sprinting || this.hSpeed > 7.2)) {
      this.startSlide();
    }
    if (this.sliding) {
      this.updateSlide(dt, input);
      return;
    }
    let wantCrouch = input.held('crouch');
    if (this.game.settings.toggleCrouch) {
      if (input.hit('crouch')) this.crouchToggled = !this.crouchToggled;
      if (input.hit('jump') || this.sprinting) this.crouchToggled = false;
      wantCrouch = this.crouchToggled;
    }
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
    const forwardHeld = (input.held('forward') || this.autorun) && !input.held('back');
    // (en táctil el joystick ya decide cuándo se corre)
    const sprintDefault = this.game.settings.sprintDefault && !this.game.touch;
    const sprintKey = sprintDefault ? !input.held('sprint') : input.held('sprint');
    this.sprinting = sprintKey && forwardHeld && !this.crouching && combat.adsBlend < 0.2 && !combat.using && !this.swimming;
    let speed = 5.4;
    if (this.crouching) speed = 2.8;
    else if (this.sprinting) speed = SPRINT;
    if (combat.adsBlend > 0.5) speed = Math.min(speed, 3.6);
    if (combat.using) speed = Math.min(speed, 2.6);
    if (this.swimming) speed = Math.min(speed, 3.4);

    // Escaleras de mano: W para subir; sin pulsar, se baja despacio
    const ladder = this.game.world.ladderAt(this.pos.x, this.pos.y, this.pos.z);
    if (ladder) {
      if (input.held('forward')) this.vel.y = 4.5 + 24 * dt;
      else if (input.held('back')) this.vel.y = -3 + 24 * dt;
      else this.vel.y = Math.max(this.vel.y, -1.5);
      this.onGround = false;
    }
    const before = this.pos.clone();
    // mientras trepa no avanza; arriba del todo ya puede pasar a la plataforma
    const atTop = ladder && this.pos.y > ladder.maxY - 1.0;
    if (ladder && !atTop) {
      // pegado a la escalera: sin deriva horizontal mientras sube
      this.vel.x = 0;
      this.vel.z = 0;
    }
    if (this.game.speedMult) speed *= this.game.speedMult;
    const landSpeed = this.groundStep(dt, w, ladder && !atTop ? speed * 0.02 : speed, input.hit('jump') && !ladder);
    this.stats.distance += Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (landSpeed > 17) {
      this.fallDamage(landSpeed);
      this.game.audio.land();
    }
    const hs = this.hSpeed;
    if (this.onGround && hs > 1) {
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) {
        this.stepTimer = this.sprinting ? 2.9 : 2.4;
        this.game.audio.step(this.game.groundMaterial(this), this.sprinting ? 1.25 : 1);
      }
    }
    // Saltar a una tirolesa en el aire: se engancha sola al tocarla
    this.airT = this.onGround ? 0 : (this.airT || 0) + dt;
    if (this.airT > 0.2 && this.vel.y < 3 && this.zipCd <= 0 && this.game.world.ziplines.length) {
      const z = findZipline(this.game.world.ziplines, this.pos, 1.3);
      if (z) this.startZip(z);
    }
  }

  // ------------------------------------------------------------ DESLIZARSE
  startSlide() {
    const hs = this.hSpeed;
    this.sliding = true;
    this.sprinting = false;
    this.slideT = 1.05;
    this.slideSpeed = Math.min(SLIDE_MAX, Math.max(hs, SPRINT) + SLIDE_BOOST);
    if (hs > 0.5) this.slideDir = new THREE.Vector3(this.vel.x / hs, 0, this.vel.z / hs);
    else this.slideDir = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.crouchToggled = false;
    if (!this.crouching) {
      this.crouching = true;
      this.eyeOffset += 0.5;
    }
    this.game.audio.slide();
    this.game.effects.dust?.(this.pos, this.slideDir, 4);
  }

  updateSlide(dt, input) {
    const t = this.game.world.terrain;
    const d = this.slideDir;
    // Cuesta abajo se gana velocidad (y el deslizamiento dura más)
    const along = (t.heightAt(this.pos.x + d.x * 1.2, this.pos.z + d.z * 1.2) - t.heightAt(this.pos.x, this.pos.z)) / 1.2;
    const onTerrain = this.pos.y - t.heightAt(this.pos.x, this.pos.z) < 0.15;
    const slope = onTerrain ? clamp(along, -1, 1) : 0;
    this.slideSpeed += (-6.5 - slope * GRAVITY * 0.85) * dt;
    this.slideSpeed = Math.min(SLIDE_MAX, this.slideSpeed);
    this.slideT -= dt;
    if (slope < -0.12 && this.slideSpeed > 7) this.slideT = Math.max(this.slideT, 0.2);
    // Un poco de control: la dirección gira despacio hacia donde se empuja
    const w = this.moveWish(input);
    if (w.lengthSq() > 0.01) {
      const cross = d.x * w.z - d.z * w.x;
      const a = clamp(cross, -1, 1) * Math.min(1, dt * 1.6);
      const c = Math.cos(a), sn = Math.sin(a);
      const nx = d.x * c - d.z * sn, nz = d.x * sn + d.z * c;
      d.set(nx, 0, nz).normalize();
    }
    this.vel.x = d.x * this.slideSpeed;
    this.vel.z = d.z * this.slideSpeed;
    // Polvo al deslizarse
    this.dustT = (this.dustT || 0) - dt;
    if (this.dustT <= 0 && this.onGround) {
      this.dustT = 0.07;
      this.game.effects.dust?.(this.pos, d, 1);
    }
    const before = this.pos.clone();
    this.jumped = false;
    if (input.hit('jump') && this.onGround) {
      // Salto deslizando: conserva el impulso
      this.vel.y = 8.4;
      this.onGround = false;
      this.jumped = true;
      this.endSlide(true);
    }
    this.vel.y -= GRAVITY * dt;
    const land = this.move(dt);
    if (land > 17) this.fallDamage(land);
    this.stats.distance += Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (!this.sliding) return;
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    // Fin: sin velocidad, choque contra algo o se acabó el tiempo
    if (this.slideSpeed < 4.5 || moved < this.slideSpeed * 0.35 || this.slideT <= 0 || this.swimming) this.endSlide(false);
  }

  endSlide(jumping) {
    this.sliding = false;
    this.slideCd = 0.45;
    const keepCrouch = !jumping && this.game.settings.toggleCrouch ? false : !jumping && this.game.input.held('crouch');
    if (!keepCrouch && this.crouching) {
      const c = this.game.world.collision;
      if (!c.overlaps(this.pos.x - R, this.pos.y + 0.1, this.pos.z - R, this.pos.x + R, this.pos.y + 1.8, this.pos.z + R)) {
        this.crouching = false;
        this.eyeOffset -= 0.5;
      }
    }
  }

  // ------------------------------------------------------------ TIROLESA
  startZip(found) {
    const z = found.zip;
    if (this.sliding) this.endSlide(true);
    if (this.crouching) {
      this.crouching = false;
      this.eyeOffset -= 0.5;
    }
    this.zip = z;
    this.zipS = clamp(found.s, 0.6, z.len - 0.6);
    z.pointAt(this.zipS, zP, zT);
    // Sentido: hacia donde se mira (y si se mira de lado, hacia el extremo más lejano)
    fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const dot = fwd.x * zT.x + fwd.z * zT.z;
    this.zipDir = Math.abs(dot) > 0.25 ? Math.sign(dot) : this.zipS < z.len / 2 ? 1 : -1;
    this.zipSpeed = Math.max(6, Math.abs(this.vel.x * zT.x + this.vel.z * zT.z));
    this.sprinting = false;
    this.autorun = false;
    this.game.audio.zipClack();
  }

  updateZip(dt, input) {
    const z = this.zip;
    z.pointAt(this.zipS, zP, zT);
    // Más rápido cuesta abajo, algo más lento cuesta arriba
    const up = zT.y * this.zipDir;
    const target = clamp(23 - up * 22, 15, 30);
    this.zipSpeed += (target - this.zipSpeed) * Math.min(1, dt * 1.4);
    // Atrás: frena y da la vuelta
    if (input.hit('back') && this.zipSpeed < 30) {
      this.zipDir = -this.zipDir;
      this.zipSpeed = 4;
    }
    const before = this.pos.clone();
    this.zipS += this.zipDir * this.zipSpeed * dt;
    z.pointAt(this.zipS, zP, zT);
    // Colgado un poco a un lado del cable (si no, en primera persona el
    // cable tapa el centro de la pantalla)
    const hl = Math.hypot(zT.x, zT.z) || 1;
    this.pos.set(zP.x - (zT.z / hl) * 0.38 * this.zipDir, zP.y - ZIP_HANG, zP.z + (zT.x / hl) * 0.38 * this.zipDir);
    this.vel.copy(zT).multiplyScalar(this.zipDir * this.zipSpeed);
    this.onGround = false;
    this.sprinting = false;
    this.stats.distance += Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (input.hit('jump')) this.leaveZip(true);
    else if (input.hit('crouch')) this.leaveZip(false);
    else if (this.zipS <= 0.7 || this.zipS >= z.len - 0.7) this.leaveZip(false, true);
  }

  leaveZip(jump, atEnd = false) {
    if (!this.zip) return;
    this.zip.pointAt(this.zipS, zP, zT);
    const sp = this.zipSpeed * this.zipDir;
    this.zip = null;
    this.zipCd = 0.8;
    this.vel.set(zT.x * sp, 0, zT.z * sp).multiplyScalar(jump ? 0.75 : atEnd ? 0.35 : 0.55);
    this.vel.y = jump ? 7.5 : 0;
    this.noFallT = Math.max(this.noFallT, 2.5); // sin daño de caída al soltarse
    this.game.audio.zipClack();
  }

  // ------------------------------------------------------------ DAÑO
  onHurt(amount, type, attacker) {
    this.game.hud.flashDamage(type, attacker);
    this.game.audio.hurt();
    if (this.game.touch && type !== 'storm') this.game.touch.haptic('hurt');
  }

  onEliminated(type, killer) {
    this.zip = null;
    this.sliding = false;
    this.game.onPlayerEliminated(type, killer);
  }
}
