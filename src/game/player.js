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
        else if (this.grapple) this.updateGrapple(dt, input);
        else if (this.parkour) this.updateParkour(dt);
        else this.updateGround(dt, input);
        break;
    }
    this.updateKnocked(dt);
    this.updateMedals(dt);
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
    this.gliderUsed = false;
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
    // La primera vez el planeador se abre solo a 90 m; si luego lo cierras,
    // se vuelve a abrir solo a 12 m (para no estrellarte)
    const first = !this.gliderUsed;
    const manual = input.hit('jump') && this.freefallTime > (first ? 1.0 : 0.25) && this.altitude > 6;
    if (this.altitude < (first ? 90 : 12) || manual) {
      this.deployGlider();
      this.gliderUsed = true;
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
    // Cerrar el planeador (caída libre) mientras quede altura de sobra
    if (input.hit('jump') && this.glideT > 0.4 && this.canCloseGlider) {
      this.mode = 'freefall';
      this.freefallTime = 0;
      this.glider.visible = false;
      this.vel.y = Math.min(this.vel.y, -12);
      this.game.audio.glider();
    }
    if (this.onGround) this.land(true);
  }

  // Altura mínima para poder cerrar el planeador
  get canCloseGlider() {
    return this.mode === 'glide' && this.altitude > 22;
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
    // (en el agua, agacharse es bucear)
    let wantCrouch = input.held('crouch') && !this.swimming;
    if (this.game.settings.toggleCrouch && !this.swimming) {
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
    this.sprinting = sprintKey && forwardHeld && (!this.crouching || this.swimming) && combat.adsBlend < 0.2 && !combat.using;
    let speed = 5.4;
    if (this.crouching) speed = 2.8;
    else if (this.sprinting) speed = SPRINT;
    if (this.medals?.speed) speed *= 1.15;
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
    // Parkour: saltar hacia una pared baja la trepa; hacia una ventana o una
    // valla, se pasa al otro lado. En el aire, mantener Espacio agarra bordes.
    const wantParkour = !ladder && (forwardHeld || w.lengthSq() > 0.25) &&
      (input.hit('jump') || (!this.onGround && input.held('jump') && this.vel.y < 3 && this.airT > 0.15));
    if (wantParkour && this.tryParkour()) return;
    // Nadar: Espacio da una brazada hacia arriba (para salir del agua) y
    // agachado se bucea
    if (this.swimming) {
      speed = this.sprinting ? 6.0 : 4.4;
      if (this.medals?.speed) speed *= 1.15;
      if (input.hit('jump')) this.vel.y = 6.2;
    }
    this.updateDive(dt, input);
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

  // ------------------------------------------------------------ PARKOUR
  // Busca delante un borde que trepar (muros de 1 a 2,8 m) o un obstáculo
  // fino que saltar/atravesar (vallas, sacos, ventanas). true = empieza.
  tryParkour() {
    const c = this.game.world.collision;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const p = this.pos;
    const at = (d) => [p.x + fx * d, p.z + fz * d];
    const probe = (d, y0, y1, w = 0.18) => {
      const [x, z] = at(d);
      return c.overlaps(x - w, p.y + y0, z - w, x + w, p.y + y1, z + w);
    };
    // Pared delante (a menos de medio metro del cuerpo)
    let near = -1;
    for (let d = R + 0.05; d <= R + 0.75; d += 0.1) {
      if (probe(d, 0.45, 0.55) || probe(d, 0.85, 0.95) || probe(d, 1.25, 1.35)) {
        near = d + 0.12;
        break;
      }
    }
    if (near < 0) return false;
    // Altura del borde: el primer hueco libre encima del obstáculo
    let top = -1;
    for (let h = 0.5; h <= 3.0; h += 0.1) {
      if (!probe(near, h, h + 0.08) && probe(near, h - 0.12, h - 0.02)) {
        top = h;
        break;
      }
    }
    if (top < 0) return false;
    // a) Trepar: sitio para estar de pie encima, un poco más allá del borde
    if (top >= 0.95 && top <= 2.85) {
      for (const d of [near + 0.2, near + 0.5]) {
        const [x, z] = at(d);
        const y = p.y + top;
        if (c.overlaps(x - R, y + 0.03, z - R, x + R, y + 1.78, z + R)) continue;
        if (!c.overlaps(x - 0.15, y - 0.2, z - 0.15, x + 0.15, y - 0.01, z + 0.15)) continue; // sin apoyo
        this.startParkour('climb', new THREE.Vector3(x, y, z), top);
        return true;
      }
    }
    // b) Obstáculo fino (valla, alféizar de ventana): pasar al otro lado
    if (top <= 1.5) {
      let far = -1;
      for (let d = near + 0.1; d <= near + 1.3; d += 0.1) {
        if (!probe(d, top - 0.3, top - 0.2, 0.06)) {
          far = d;
          break;
        }
      }
      if (far < 0) return false;
      const dEnd = far + R + 0.3;
      // Hueco por encima del alféizar (al menos agachado) en todo el recorrido
      for (let d = near - 0.2; d <= dEnd; d += 0.15) {
        const [x, z] = at(d);
        if (c.overlaps(x - 0.22, p.y + top + 0.05, z - 0.22, x + 0.22, p.y + top + 0.95, z + 0.22)) return false;
      }
      const [ex, ez] = at(dEnd);
      const gy = this.game.world.groundBelow(ex, ez, p.y + top + 0.3);
      if (gy < p.y - 3.5 || gy > p.y + top) return false;
      if (c.overlaps(ex - R, gy + 0.05, ez - R, ex + R, gy + 1.2, ez + R)) return false;
      this.startParkour('vault', new THREE.Vector3(ex, gy, ez), top);
      return true;
    }
    return false;
  }

  startParkour(kind, to, top) {
    if (this.sliding) this.endSlide(true);
    const from = this.pos.clone();
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    // Punto intermedio: encima del borde
    // (encima del borde: a mitad de camino entre la posición y el destino)
    const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2;
    const mid = kind === 'climb'
      ? new THREE.Vector3(from.x + fx * 0.15, to.y + 0.08, from.z + fz * 0.15)
      : new THREE.Vector3(mx, from.y + top + 0.12, mz);
    const dur = kind === 'climb' ? 0.32 + top * 0.12 : 0.45;
    this.parkour = { kind, from, mid, to, t: 0, dur, speed: Math.max(4, this.hSpeed), fx, fz };
    this.climbing = true;
    // Por una ventana se pasa agachado
    if (kind === 'vault' && !this.crouching) {
      this.crouching = true;
      this.eyeOffset += 0.5;
      this.parkour.uncrouch = true;
    }
    this.vel.set(0, 0, 0);
    this.game.audio.vault?.(kind);
  }

  updateParkour(dt) {
    const k = this.parkour;
    k.t += dt / k.dur;
    const t = Math.min(1, k.t);
    const ease = (x) => x * x * (3 - 2 * x);
    const prevY = this.pos.y;
    if (t < 0.5) this.pos.lerpVectors(k.from, k.mid, ease(t / 0.5));
    else this.pos.lerpVectors(k.mid, k.to, ease((t - 0.5) / 0.5));
    // (la cámara no da saltos: el suavizado de escalones absorbe la subida)
    this.eyeOffset -= (this.pos.y - prevY) * 0.35;
    this.onGround = false;
    if (t >= 1) {
      this.parkour = null;
      this.climbing = false;
      this.onGround = true;
      this.vel.set(k.fx * k.speed * 0.8, 0, k.fz * k.speed * 0.8);
      this.noFallT = Math.max(this.noFallT, 0.8);
      if (k.uncrouch) {
        const c = this.game.world.collision, p = this.pos;
        if (!c.overlaps(p.x - R, p.y + 0.1, p.z - R, p.x + R, p.y + 1.8, p.z + R)) {
          this.crouching = false;
          this.eyeOffset -= 0.5;
        }
      }
      this.game.audio.step(this.game.groundMaterial(this), 1.2);
    }
  }

  // ------------------------------------------------------------ BUCEAR
  // Agachado en el agua se baja (hasta 3 m o casi el fondo); al soltar, se
  // vuelve a la superficie.
  updateDive(dt, input) {
    const w = this.game.world;
    if (!this.swimming && !(this.dive > 0)) return;
    const level = w.waterLevelAt?.(this.pos.x, this.pos.z) ?? 0;
    const floor = w.terrain.heightAt(this.pos.x, this.pos.z);
    // (los pies no bajan del fondo: nivel - 1,25 - buceo ≥ fondo + 0,2)
    const maxDive = Math.max(0, Math.min(3, level - floor - 1.45));
    const want = input.held('crouch') && this.swimming ? maxDive : 0;
    this.dive = Math.max(0, Math.min(maxDive, (this.dive || 0) + Math.sign(want - (this.dive || 0)) * 2.2 * dt));
    if (Math.abs(want - this.dive) < 0.05) this.dive = want;
  }

  // ------------------------------------------------------------ LANZASOPAPAS
  // Dispara la ventosa desde la cámara; si se pega a algo (a menos de 75 m)
  // empieza el tirón. Devuelve true si ha gastado una carga.
  fireGrapple(origin, dir, skip) {
    const g = this.game;
    const hit = g.raycast(origin, dir, 75 + skip, skip, this);
    g.audio.grapple?.(!!hit);
    if (!hit || hit.kind === 'character' || hit.kind === 'dummy') {
      g.hud.toast(hit ? 'La ventosa no se pega a las personas' : 'Demasiado lejos: la ventosa no llega');
      return !!hit;
    }
    if (this.sliding) this.endSlide(true);
    if (this.crouching) {
      this.crouching = false;
      this.eyeOffset -= 0.5;
    }
    this.grapple = { point: hit.point.clone().addScaledVector(hit.normal || dir, 0.3), t: 0, speed: Math.max(10, this.hSpeed) };
    g.effects.plunger?.(hit.point, hit.normal);
    return true;
  }

  updateGrapple(dt, input) {
    const G = this.grapple;
    G.t += dt;
    const to = zP.copy(G.point).sub(this.pos);
    to.y -= 0.9;
    const dist = to.length();
    G.speed = Math.min(36, G.speed + 70 * dt);
    to.divideScalar(Math.max(dist, 1e-4));
    this.vel.copy(to).multiplyScalar(G.speed);
    this.vel.y += 2; // un poco de arco hacia arriba
    const before = this.pos.clone();
    this.jumped = false;
    this.move(dt);
    const moved = this.pos.distanceTo(before) / Math.max(dt, 1e-4);
    this.game.effects.rope?.(this.game.combat.muzzleWorld(zT), G.point);
    // Suelta: al llegar, si choca con algo, si salta o si tarda demasiado
    if (dist < 2.2 || G.t > 3 || input.hit('jump') || (G.t > 0.25 && moved < G.speed * 0.3)) this.endGrapple(input.hit('jump'));
  }

  endGrapple(jump = false) {
    if (!this.grapple) return;
    this.grapple = null;
    this.game.effects.rope?.(null);
    this.vel.multiplyScalar(0.55);
    this.vel.y = Math.max(this.vel.y, jump ? 9 : 5);
    this.noFallT = Math.max(this.noFallT, 2.5);
  }

  // ------------------------------------------------------------ MEDALLONES
  addMedal(id) {
    this.medals = this.medals || {};
    this.medals[id] = true;
    const names = { armor: 'Coraza (-20 % de daño recibido)', speed: 'Velocidad (+15 % de velocidad)', fury: 'Furia (+20 % de daño)', vigor: 'Vigor (regeneras escudo)' };
    this.game.hud.toast(`🏅 Medallón de ${names[id] || id}`);
    this.game.audio.chest?.();
  }

  updateMedals(dt) {
    // Vigor: regenera escudo si no te han dado en los últimos 3 s
    if (this.medals?.vigor && this.alive && !this.knocked && this.game.time - (this.hurtAt || -99) > 3 && this.shield < 100) {
      this.shield = Math.min(100, this.shield + 4 * dt);
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
    this.hurtAt = this.game.time;
    this.game.hud.flashDamage(type, attacker);
    this.game.audio.hurt();
    if (this.game.touch && type !== 'storm') this.game.touch.haptic('hurt');
  }

  onEliminated(type, killer) {
    this.zip = null;
    this.sliding = false;
    if (this.grapple) this.endGrapple();
    this.medals = null;
    this.game.onPlayerEliminated(type, killer);
  }
}
