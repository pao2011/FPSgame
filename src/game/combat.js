import * as THREE from 'three';
import { WEAPONS, CONSUMABLES, MATERIALS } from './items.js';
import { makeItemModel, makeWeaponModel, mat } from './models.js';
import { lerp } from '../core/rng.js';

const tmpV = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const HIP = new THREE.Vector3(0.2, -0.2, -0.42);
const HIP_PICK = new THREE.Vector3(0.42, -0.72, -0.72);
const HIP_ITEM = new THREE.Vector3(0.16, -0.18, -0.38);

// Sistema de armas: disparo, apuntado, retroceso, recarga, consumibles y pico.
export class Combat {
  constructor(game) {
    this.game = game;
    this.viewmodel = new THREE.Group();
    game.viewScene.add(this.viewmodel);
    this.vm = null;
    this.modelKey = null;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadTotal = 1;
    this.bloom = 0;
    this.adsBlend = 0;
    this.swapT = 0;
    this.swingT = 0;
    this.swingHit = false;
    this.using = null;
    this.useT = 0;
    this.kick = 0;
    this.bobPhase = 0;
    this.sway = new THREE.Vector2();
    this.projectiles = [];
    this.autoReloadT = -1;
  }

  reset() {
    this.cooldown = 0;
    this.reloading = false;
    this.using = null;
    this.adsBlend = 0;
    this.bloom = 0;
    this.projectiles.length = 0;
    this.modelKey = null;
  }

  get player() {
    return this.game.player;
  }

  select(i) {
    const p = this.player;
    if (i === p.selected) return;
    p.selected = i;
    this.reloading = false;
    this.cancelUse();
    this.swapT = 0.3;
    this.autoReloadT = -1;
  }

  cycle(dir) {
    const p = this.player;
    let i = p.selected;
    for (let k = 0; k < 6; k++) {
      i = (i + dir + 6) % 6;
      if (i === 0 || p.inventory[i]) break;
    }
    this.select(i);
  }

  cancelUse() {
    if (this.using) {
      this.using = null;
      this.game.hud.setProgress(null);
    }
  }

  ensureModel(item) {
    const key = item.kind === 'weapon' ? `w_${item.type}_${item.rarity}` : item.kind === 'consumable' ? `c_${item.type}` : 'pickaxe';
    if (key === this.modelKey) return;
    this.modelKey = key;
    if (this.vm) this.viewmodel.remove(this.vm);
    const vm = new THREE.Group();
    const model = item.kind === 'pickaxe' ? makeWeaponModel('pickaxe') : makeItemModel(item);
    vm.add(model);
    // Manos simples
    const skin = mat(0xe0b48a);
    const sleeve = mat(0x2f6fd6);
    const hand = (x, y, z, rx = 0) => {
      const g = new THREE.Group();
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.11), skin);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.3), sleeve);
      s.position.z = 0.2;
      g.add(h, s);
      g.position.set(x, y, z);
      g.rotation.x = rx;
      vm.add(g);
    };
    if (item.kind === 'weapon') {
      hand(0.0, -0.07, 0.07, 0.4);
      hand(-0.02, -0.05, item.type === 'pistol' ? 0.0 : -0.28, 0.2);
    } else if (item.kind === 'pickaxe') {
      hand(0, 0.0, 0, 0);
    } else {
      hand(0.06, -0.06, 0.05, 0.3);
    }
    vm.userData.sightY = model.userData.sightY ?? 0.08;
    vm.userData.muzzle = model.userData.muzzle;
    this.vm = vm;
    this.viewmodel.add(vm);
    this.player.setHeld(item);
  }

  def(item) {
    return item && item.kind === 'weapon' ? WEAPONS[item.type] : null;
  }

  startReload() {
    const p = this.player;
    const item = p.item;
    const def = this.def(item);
    if (!def || this.reloading || item.mag >= def.mag || p.ammo[def.ammo] <= 0) return;
    this.reloading = true;
    this.reloadTotal = def.reload[item.rarity];
    this.reloadT = this.reloadTotal;
    this.game.audio.reload();
  }

  currentSpread(def) {
    const p = this.player;
    let s = lerp(def.spread, def.adsSpread, this.adsBlend);
    const hs = p.hSpeed;
    if (hs > 1) s *= p.sprinting ? 1.9 : 1.35;
    if (!p.onGround) s *= 2;
    if (p.crouching) s *= 0.75;
    return s + this.bloom * (1 - this.adsBlend * 0.5);
  }

  coneDir(dir, spread, out) {
    if (spread <= 0) return out.copy(dir);
    tmpR.crossVectors(dir, UP);
    if (tmpR.lengthSq() < 1e-6) tmpR.set(1, 0, 0);
    tmpR.normalize();
    tmpU.crossVectors(tmpR, dir).normalize();
    const r = spread * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    return out.copy(dir).addScaledVector(tmpR, Math.cos(a) * r).addScaledVector(tmpU, Math.sin(a) * r).normalize();
  }

  muzzleWorld(out) {
    const g = this.game;
    if (g.camMode === 'fp' && this.vm?.userData.muzzle) {
      this.vm.updateMatrixWorld(true);
      this.vm.userData.muzzle.getWorldPosition(out); // espacio de la cámara de viewmodel
      return g.camera.localToWorld(out);
    }
    const hand = this.player.model.hand;
    const m = hand.children[0]?.userData.muzzle;
    if (m) {
      this.player.model.root.updateMatrixWorld(true);
      return m.getWorldPosition(out);
    }
    return out.copy(this.player.eye);
  }

  update(dt, input) {
    const g = this.game;
    const p = this.player;
    this.updateProjectiles(dt);
    if (p.mode !== 'ground' || !p.alive || p.vehicle || g.build.active) {
      this.viewmodel.visible = false;
      this.adsBlend = 0;
      g.hud.setScope(false);
      return;
    }
    const item = p.item || p.inventory[0];
    this.ensureModel(item);
    const def = this.def(item);

    this.cooldown -= dt;
    this.swapT = Math.max(0, this.swapT - dt);
    this.bloom = Math.max(0, this.bloom - dt * (def ? def.maxBloom * 2.2 : 0.1));
    this.kick *= Math.exp(-dt * 14);

    // Apuntar
    const wantAds = input.mouseDown(2) && !!def && !this.reloading && !p.sprinting && this.swapT <= 0;
    this.adsBlend = Math.max(0, Math.min(1, this.adsBlend + (wantAds ? dt / 0.16 : -dt / 0.12)));

    if (input.wasPressed('KeyR')) this.startReload();

    if (def) this.updateWeapon(dt, input, item, def);
    else if (item.kind === 'pickaxe') this.updatePickaxe(dt, input);
    else if (item.kind === 'consumable') this.updateConsumable(dt, input, item);

    this.animate(dt, input, item, def);
  }

  updateWeapon(dt, input, item, def) {
    const p = this.player;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        if (def.shellReload) {
          if (p.ammo[def.ammo] > 0) {
            item.mag++;
            p.ammo[def.ammo]--;
          }
          if (item.mag < def.mag && p.ammo[def.ammo] > 0) {
            this.reloadT = this.reloadTotal;
            this.game.audio.reload();
          } else this.reloading = false;
        } else {
          const n = Math.min(def.mag - item.mag, p.ammo[def.ammo]);
          item.mag += n;
          p.ammo[def.ammo] -= n;
          this.reloading = false;
        }
      }
    }
    if (this.autoReloadT > 0) {
      this.autoReloadT -= dt;
      if (this.autoReloadT <= 0) this.startReload();
    }
    const wantFire = def.auto ? input.mouseDown(0) : input.mouseClicked(0);
    if (!wantFire || this.cooldown > 0 || this.swapT > 0) return;
    if (this.reloading) {
      if (def.shellReload && item.mag > 0) this.reloading = false;
      else return;
    }
    if (item.mag <= 0) {
      if (p.ammo[def.ammo] > 0) this.startReload();
      else if (input.mouseClicked(0)) {
        this.game.audio.empty();
        this.game.hud.toast('Sin munición: ' + def.name);
      }
      this.cooldown = 0.2;
      return;
    }
    this.fire(item, def);
  }

  fire(item, def) {
    const g = this.game;
    const p = this.player;
    item.mag--;
    this.cooldown = 1 / def.rate;
    const origin = g.aimOrigin;
    const dir = g.aimDir;
    const skip = g.aimSkip;
    const muzzle = this.muzzleWorld(new THREE.Vector3());
    const pellets = def.pellets || 1;
    const spread = def.pellets ? lerp(def.spread, def.adsSpread, this.adsBlend) * (p.onGround ? 1 : 1.4) : this.currentSpread(def);
    const hits = new Map();
    const d = new THREE.Vector3();
    for (let i = 0; i < pellets; i++) {
      this.coneDir(dir, spread, d);
      if (def.projectile) {
        const start = origin.clone().addScaledVector(d, skip);
        this.projectiles.push({
          pos: start, vel: d.clone().multiplyScalar(def.projectile.speed), gravity: def.projectile.gravity,
          life: 3, item, def, from: muzzle.clone(), traveled: 0,
        });
        continue;
      }
      const hit = g.raycast(origin, d, def.range, skip, p);
      const end = hit ? hit.point : origin.clone().addScaledVector(d, def.range);
      g.effects.tracer(muzzle, end, 0xfff1b0, def.pellets ? 0.015 : 0.022);
      if (hit) this.collectHit(hit, def, item, hits);
    }
    this.applyHits(hits);
    this.bloom = Math.min(def.maxBloom, this.bloom + def.bloom);
    const rec = def.recoil * (1 - 0.45 * this.adsBlend);
    p.pitch += rec;
    p.yaw += (Math.random() - 0.5) * rec * 0.6;
    this.kick = Math.min(1.5, this.kick + (def.pellets || def.scope ? 1.2 : 0.55));
    g.audio.shot(def.sound);
    let viewPos = null;
    if (g.camMode === 'fp' && this.vm?.userData.muzzle && this.viewmodel.visible) {
      viewPos = this.vm.userData.muzzle.getWorldPosition(new THREE.Vector3());
    }
    g.effects.muzzleFlash(viewPos, muzzle);
    if (item.mag === 0 && p.ammo[def.ammo] > 0) this.autoReloadT = Math.min(0.35, this.cooldown);
  }

  collectHit(hit, def, item, hits) {
    const base = def.damage[item.rarity];
    if (hit.kind === 'dummy' || hit.kind === 'character') {
      let dmg = base * (hit.head ? def.headMult : 1);
      if (def.falloff) {
        const [a, b] = def.falloff;
        if (hit.t > a) dmg *= Math.max(0.2, 1 - ((hit.t - a) / (b - a)) * 0.8);
      }
      const target = hit.kind === 'dummy' ? hit.dummy : hit.entity;
      const e = hits.get(target) || { dmg: 0, head: false, point: hit.point, kind: hit.kind };
      e.dmg += dmg;
      e.head = e.head || hit.head;
      hits.set(target, e);
      return;
    }
    this.game.effects.impact(hit.point, hit.normal, hit.kind === 'terrain' ? 0xb59a6a : 0xffd27a);
    const data = hit.box?.data;
    if (data?.type === 'build') this.game.build.damage(data.piece, base);
  }

  // Aplica el daño acumulado por objetivo (la escopeta suma sus perdigones).
  applyHits(hits) {
    const g = this.game;
    for (const [target, e] of hits) {
      let killed;
      if (e.kind === 'dummy') killed = g.dummies.damage(target, e.dmg, e.head, e.point);
      else killed = this.damageCharacter(target, e.dmg, e.head, e.point, 'bullet');
      g.player.stats.damage += e.dmg;
      g.hud.hitMarker(e.head, killed);
      g.audio.hit(e.head);
    }
  }

  damageCharacter(target, dmg, head, point, type) {
    const fx = this.game.effects;
    const sh = Math.min(target.shield, dmg);
    if (sh > 0) fx.damageNumber(point, sh, head ? 'head shield' : 'shield');
    if (dmg - sh > 0) fx.damageNumber(point, dmg - sh, head ? 'head' : '');
    return target.damage(dmg, type, this.player);
  }

  updateProjectiles(dt) {
    const g = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      const step = tmpV.copy(pr.vel).multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().divideScalar(len);
      const hit = g.raycast(pr.pos, dir, len, 0, g.player);
      const prev = pr.traveled < 1 ? pr.from : pr.pos.clone();
      if (hit) {
        g.effects.tracer(prev, hit.point, 0xffffff, 0.04, 0.12);
        const hits = new Map();
        this.collectHit(hit, pr.def, pr.item, hits);
        this.applyHits(hits);
        this.projectiles.splice(i, 1);
        continue;
      }
      pr.pos.add(step);
      pr.traveled += len;
      g.effects.tracer(prev, pr.pos, 0xffffff, 0.04, 0.12);
      pr.vel.y -= pr.gravity * dt;
      if (pr.life <= 0) this.projectiles.splice(i, 1);
    }
  }

  updatePickaxe(dt, input) {
    const g = this.game;
    this.swingT = Math.max(0, this.swingT - dt);
    if (input.mouseDown(0) && this.swingT <= 0 && this.swapT <= 0) {
      this.swingT = 0.55;
      this.swingHit = true;
    }
    if (this.swingHit && this.swingT < 0.36) {
      this.swingHit = false;
      const hit = g.raycast(g.aimOrigin, g.aimDir, 2.6 + g.aimSkip, g.aimSkip, this.player);
      if (!hit) return;
      const data = hit.box?.data;
      if (hit.kind === 'dummy') {
        const killed = g.dummies.damage(hit.dummy, 20, false, hit.point);
        g.hud.hitMarker(false, killed);
        g.audio.hit(false);
      } else if (hit.kind === 'character') {
        const killed = this.damageCharacter(hit.entity, 20, false, hit.point, 'pickaxe');
        g.hud.hitMarker(false, killed);
        g.audio.hit(false);
      } else if (data?.ref?.mat) {
        // Recolección de materiales
        const gain = g.harvest.hit(data.ref, 50);
        g.effects.impact(hit.point, hit.normal, MATERIALS[data.ref.mat].hex);
        if (gain > 0) g.effects.damageNumber(hit.point, `+${gain} ${MATERIALS[data.ref.mat].name}`, 'mat');
        else g.hud.toast(`Tienes el máximo de ${MATERIALS[data.ref.mat].name.toLowerCase()}`);
        g.audio.harvest(data.ref.mat);
      } else {
        if (data?.type === 'build') g.build.damage(data.piece, 50);
        g.effects.impact(hit.point, hit.normal, 0xcccccc);
        g.audio.pickaxe();
      }
    }
  }

  updateConsumable(dt, input, item) {
    const g = this.game;
    const p = this.player;
    const def = CONSUMABLES[item.type];
    if (!this.using && input.mouseClicked(0) && this.swapT <= 0) {
      if (def.heal && p.health >= def.cap) {
        g.hud.toast(def.cap < 100 ? `Las vendas solo curan hasta ${def.cap}` : 'Ya tienes la salud al máximo');
        return;
      }
      if (def.shield && p.shield >= def.cap) {
        g.hud.toast(def.cap < 100 ? `Solo puedes usarlas hasta ${def.cap} de escudo` : 'Ya tienes el escudo al máximo');
        return;
      }
      this.using = item;
      this.useT = def.use;
    }
    if (this.using) {
      this.useT -= dt;
      g.hud.setProgress(1 - this.useT / def.use, `Usando: ${def.name}`);
      if (this.useT <= 0) {
        if (def.heal) p.health = Math.min(def.cap, p.health + def.heal);
        if (def.shield) p.shield = Math.min(def.cap, p.shield + def.shield);
        item.count--;
        if (item.count <= 0) {
          p.inventory[p.selected] = null;
          this.modelKey = null;
          this.select(0);
        }
        this.using = null;
        g.hud.setProgress(null);
        g.audio.heal();
      }
    }
  }

  animate(dt, input, item, def) {
    const g = this.game;
    const p = this.player;
    const vm = this.vm;
    if (!vm) return;
    const scoped = def?.scope && this.adsBlend > 0.9;
    g.hud.setScope(scoped);
    this.viewmodel.visible = g.camMode === 'fp' && !scoped;

    const hip = item.kind === 'pickaxe' ? HIP_PICK : item.kind === 'weapon' ? HIP : HIP_ITEM;
    const ads = tmpV.set(0, -vm.userData.sightY - 0.022, -0.42);
    const pos = new THREE.Vector3().lerpVectors(hip, ads, this.adsBlend);
    const hs = p.hSpeed;
    const bobAmt = p.onGround ? Math.min(1, hs / 6) * (1 - this.adsBlend * 0.9) : 0;
    this.bobPhase += dt * hs * 1.5;
    pos.x += Math.sin(this.bobPhase) * 0.012 * bobAmt;
    pos.y += Math.abs(Math.cos(this.bobPhase)) * 0.016 * bobAmt;
    this.sway.x = lerp(this.sway.x, -input.mouseDX * 0.0005, Math.min(1, dt * 10));
    this.sway.y = lerp(this.sway.y, input.mouseDY * 0.0005, Math.min(1, dt * 10));
    this.sway.clampScalar(-0.04, 0.04);
    const swayK = 1 - this.adsBlend * 0.8;
    pos.x += this.sway.x * swayK;
    pos.y += this.sway.y * swayK;
    pos.z += this.kick * 0.05 * (1 - this.adsBlend * 0.5);

    let rx = this.kick * 0.1, ry = 0, rz = 0;
    if (p.sprinting) {
      pos.x += 0.04;
      pos.y -= 0.06;
      ry = 0.6;
      rz = 0.15;
    }
    if (this.reloading) {
      const k = 1 - this.reloadT / this.reloadTotal;
      const s = Math.sin(k * Math.PI);
      pos.y -= s * (def.shellReload ? 0.04 : 0.1);
      rx -= s * 0.5;
      rz += s * 0.3;
    }
    if (this.swapT > 0) {
      pos.y -= (this.swapT / 0.3) * 0.3;
      rx -= (this.swapT / 0.3) * 0.6;
    }
    if (item.kind === 'pickaxe') {
      rx += -0.2;
      ry += 0.3;
      if (this.swingT > 0) {
        const k = 1 - this.swingT / 0.55;
        const s = k < 0.35 ? -k / 0.35 : -1 + (k - 0.35) / 0.65;
        rx += s * -1.6;
        pos.x -= Math.sin(k * Math.PI) * 0.15;
      }
    }
    if (this.using) {
      pos.y += Math.sin(performance.now() / 120) * 0.01;
      pos.x -= 0.08;
    }
    vm.position.copy(pos);
    vm.rotation.set(rx, ry, rz);
  }
}
