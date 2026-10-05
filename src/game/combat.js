import * as THREE from 'three';
import { WEAPONS, CONSUMABLES, MATERIALS, THROWABLES } from './items.js';
import { makeItemModel, makeWeaponModel, makeLaunchPad, makeViewHand, outfitColors, itemKey } from './models.js';
import { lerp } from '../core/rng.js';

const tmpV = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const HIP = new THREE.Vector3(0.19, -0.19, -0.48);
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
    this.burstLeft = 0;
    this.burstT = 0;
    this.spin = 0;
    this.charge = 0;
    this.throwCd = 0;
    this.pads = [];
    this.adsToggled = false;
    this.lastSlot = 0;
    this.quickHealPending = false;
  }

  reset() {
    this.cooldown = 0;
    this.reloading = false;
    this.using = null;
    this.adsBlend = 0;
    this.bloom = 0;
    this.projectiles.length = 0;
    this.modelKey = null;
    this.burstLeft = 0;
    this.spin = 0;
    this.charge = 0;
    this.throwCd = 0;
    for (const pad of this.pads) this.game.scene.remove(pad.mesh);
    this.pads.length = 0;
    this.adsToggled = false;
    this.lastSlot = 0;
  }

  get player() {
    return this.game.player;
  }

  select(i) {
    const p = this.player;
    if (i === p.selected) return;
    this.lastSlot = p.selected;
    p.selected = i;
    this.adsToggled = false;
    this.reloading = false;
    this.cancelUse();
    this.swapT = 0.3;
    this.autoReloadT = -1;
    this.burstLeft = 0;
    this.spin = 0;
    if (this.charge > 0) this.game.hud.setProgress(null);
    this.charge = 0;
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

  // Curación rápida: elige la mejor cura para tu estado y la empieza a usar.
  quickHeal() {
    const p = this.player;
    const opts = [];
    p.inventory.forEach((it, i) => {
      if (!it || it.kind !== 'consumable') return;
      const d = CONSUMABLES[it.type];
      let score = -1;
      if (d.over || (d.heal && d.shield)) score = p.health < 100 || p.shield < 100 ? 5 : -1;
      else if (d.heal) score = p.health < d.cap ? (p.health < 50 ? 4 : 2) + d.heal / 100 : -1;
      else if (d.shield) score = p.shield < d.cap ? 3 + d.shield / 100 : -1;
      if (score > 0) opts.push({ i, score });
    });
    if (!opts.length) {
      this.game.hud.toast('No tienes curas útiles ahora mismo');
      return;
    }
    opts.sort((a, b) => b.score - a.score);
    this.select(opts[0].i);
    this.quickHealPending = true;
  }

  ensureModel(item) {
    const camo = item.kind === 'weapon' ? this.player.outfit?.camo || null : null;
    const look = `${this.player.outfitSig}`;
    const key = (item.kind === 'weapon' ? `w_${item.type}_${item.rarity}_${camo || ''}` : itemKey(item)) + look;
    if (key === this.modelKey) return;
    this.modelKey = key;
    if (this.vm) this.viewmodel.remove(this.vm);
    const vm = new THREE.Group();
    const model = item.kind === 'pickaxe' ? makeWeaponModel('pickaxe', 0, null, this.player.outfit?.pick) : makeItemModel(item, camo);
    if (item.kind === 'throwable') {
      model.scale.setScalar(0.55);
      model.position.set(0.02, 0.0, -0.06);
    }
    vm.add(model);
    // Manos enguantadas
    const oc = outfitColors(this.player.outfit);
    const hand = (x, y, z, rx = 0) => {
      const g = makeViewHand(oc.skin, oc.shirt);
      g.position.set(x, y, z);
      g.rotation.x = rx;
      vm.add(g);
    };
    if (item.kind === 'weapon') {
      const oneHand = item.type === 'pistol' || item.type === 'revolver' || item.type === 'handcannon';
      hand(0.0, -0.07, 0.07, 0.4);
      hand(-0.02, -0.05, oneHand ? 0.0 : item.type === 'boombow' ? -0.05 : -0.28, 0.2);
    } else if (item.kind === 'pickaxe') {
      hand(0, 0.0, 0, 0);
    } else {
      hand(0.06, -0.06, 0.05, 0.3);
    }
    vm.userData.sightY = model.userData.sightY ?? 0.08;
    vm.userData.muzzle = model.userData.muzzle;
    vm.userData.spin = model.userData.spin;
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
    if (!def || this.reloading || item.mag >= def.mag || (p.ammo[def.ammo] <= 0 && !this.game.infiniteAmmo)) return;
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
    this.updatePads(dt);
    this.throwCd = Math.max(0, this.throwCd - dt);
    if (p.mode !== 'ground' || !p.alive || p.vehicle || g.build.busy || g.creative?.busy || p.knocked || g.spectating) {
      this.viewmodel.visible = false;
      this.adsBlend = 0;
      g.hud.setScope(false);
      g.explosives.hidePreview();
      if (this.charge > 0) g.hud.setProgress(null);
      this.charge = 0;
      this.burstLeft = 0;
      return;
    }
    const item = p.item || p.inventory[0];
    this.ensureModel(item);
    const def = this.def(item);

    this.cooldown -= dt;
    this.swapT = Math.max(0, this.swapT - dt);
    this.bloom = Math.max(0, this.bloom - dt * (def ? def.maxBloom * 2.2 : 0.1));
    this.kick *= Math.exp(-dt * 14);

    // Apuntar (mantener o alternar, según Opciones)
    if (g.settings.toggleAds) {
      if (input.hit('ads')) this.adsToggled = !this.adsToggled;
      if (!def || p.sprinting) this.adsToggled = false;
    }
    const adsHeld = g.settings.toggleAds ? this.adsToggled : input.held('ads');
    const wantAds = adsHeld && !!def && !this.reloading && !p.sprinting && this.swapT <= 0;
    this.adsBlend = Math.max(0, Math.min(1, this.adsBlend + (wantAds ? dt / 0.16 : -dt / 0.12)));

    if (input.hit('reload')) this.startReload();
    if (input.hit('quickHeal')) this.quickHeal();
    if (input.hit('lastWeapon')) this.select(this.lastSlot);

    if (def) this.updateWeapon(dt, input, item, def);
    else if (item.kind === 'pickaxe') this.updatePickaxe(dt, input);
    else if (item.kind === 'consumable') this.updateConsumable(dt, input, item);
    if (item.kind === 'throwable') this.updateThrowable(dt, input, item);
    else g.explosives.hidePreview();

    this.animate(dt, input, item, def);
  }

  updateWeapon(dt, input, item, def) {
    const p = this.player;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        if (def.shellReload) {
          const inf = this.game.infiniteAmmo;
          if (p.ammo[def.ammo] > 0 || inf) {
            item.mag++;
            if (!inf) p.ammo[def.ammo]--;
          }
          if (item.mag < def.mag && (p.ammo[def.ammo] > 0 || inf)) {
            this.reloadT = this.reloadTotal;
            this.game.audio.reload();
          } else this.reloading = false;
        } else {
          const inf = this.game.infiniteAmmo;
          const n = inf ? def.mag - item.mag : Math.min(def.mag - item.mag, p.ammo[def.ammo]);
          item.mag += n;
          if (!inf) p.ammo[def.ammo] -= n;
          this.reloading = false;
        }
      }
    }
    if (this.autoReloadT > 0) {
      this.autoReloadT -= dt;
      if (this.autoReloadT <= 0) this.startReload();
    }
    // Ráfaga en curso
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        if (item.mag > 0 && !this.reloading) {
          this.fire(item, def);
          this.burstLeft--;
          this.burstT = def.burstDelay;
        } else this.burstLeft = 0;
      }
      return;
    }
    // Minigun: hay que hacer girar los cañones antes de disparar
    if (def.spinUp) {
      const spinning = input.held('fire') && !this.reloading && this.swapT <= 0 && item.mag > 0;
      this.spin = Math.max(0, Math.min(1, this.spin + (spinning ? dt / def.spinUp : -dt / (def.spinUp * 0.8))));
      if (spinning && this.spin < 1) {
        this.game.audio.spin?.(this.spin);
        return;
      }
    }
    // Arco: mantener para tensar, soltar para disparar
    if (def.charge) {
      const can = this.cooldown <= 0 && this.swapT <= 0 && !this.reloading && item.mag > 0;
      if (input.held('fire') && can) {
        this.charge = Math.min(1, this.charge + dt / def.charge);
        this.game.hud.setProgress(this.charge, this.charge >= 1 ? 'Arco tensado · suelta para disparar' : 'Tensando el arco…');
        return;
      }
      if (this.charge > 0) {
        const power = Math.max(0.15, this.charge);
        this.charge = 0;
        this.game.hud.setProgress(null);
        if (can) this.fire(item, def, power);
        return;
      }
    }
    const wantFire = def.auto ? input.held('fire') : input.hit('fire');
    if (!wantFire || this.cooldown > 0 || this.swapT > 0) return;
    if (this.reloading) {
      if (def.shellReload && item.mag > 0) this.reloading = false;
      else return;
    }
    if (item.mag <= 0) {
      if (p.ammo[def.ammo] > 0 || this.game.infiniteAmmo) this.startReload();
      else if (input.hit('fire')) {
        this.game.audio.empty();
        this.game.hud.toast('Sin munición: ' + def.name);
      }
      this.cooldown = 0.2;
      return;
    }
    if (def.charge) return;
    this.fire(item, def);
    if (def.burst) {
      this.burstLeft = def.burst - 1;
      this.burstT = def.burstDelay;
    }
  }

  fire(item, def, power = 1) {
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
    const ends = [];
    for (let i = 0; i < pellets; i++) {
      this.coneDir(dir, spread, d);
      if (def.explosive) {
        // Se apunta desde la cámara y el proyectil sale del cañón hacia ese punto
        const aim = g.raycast(origin, d, 300, skip, p);
        const target = aim ? aim.point : origin.clone().addScaledVector(d, 300);
        const from = muzzle.distanceTo(target) > 2.5 ? muzzle : origin.clone().addScaledVector(d, skip + 0.5);
        const ld = target.clone().sub(from).normalize();
        g.explosives.launch(p, item.type, item.rarity, from, ld, power);
        continue;
      }
      if (def.pierce) {
        this.pierceShot(origin, d, skip, def, item, hits, muzzle, ends);
        continue;
      }
      if (def.projectile) {
        const start = origin.clone().addScaledVector(d, skip);
        this.projectiles.push({
          pos: start, vel: d.clone().multiplyScalar(def.projectile.speed), gravity: def.projectile.gravity,
          life: 3, item, def, from: muzzle.clone(), traveled: 0,
        });
        ends.push(origin.clone().addScaledVector(d, 300));
        continue;
      }
      const hit = g.raycast(origin, d, def.range, skip, p);
      const end = hit ? hit.point : origin.clone().addScaledVector(d, def.range);
      g.effects.tracer(muzzle, end, 0xfff1b0, def.pellets ? 0.015 : 0.022);
      ends.push(end);
      if (hit) this.collectHit(hit, def, item, hits);
    }
    this.applyHits(hits);
    if (!def.explosive) g.net?.shotFx(p, def.sound, muzzle, ends);
    else g.net?.shotFx(p, def.sound, muzzle, []);
    this.bloom = Math.min(def.maxBloom, this.bloom + def.bloom);
    const rec = def.recoil * (1 - 0.45 * this.adsBlend);
    p.pitch += rec;
    p.yaw += (Math.random() - 0.5) * rec * 0.6;
    this.kick = Math.min(1.5, this.kick + (def.pellets || def.scope ? 1.2 : 0.55));
    g.audio.shot(def.sound);
    g.noise(p.pos, def.sound === 'sniper' || def.sound === 'dmr' ? 160 : 90, p);
    let viewPos = null;
    if (g.camMode === 'fp' && this.vm?.userData.muzzle && this.viewmodel.visible) {
      viewPos = this.vm.userData.muzzle.getWorldPosition(new THREE.Vector3());
    }
    if (def.sound !== 'bow') g.effects.muzzleFlash(viewPos, muzzle);
    if (!def.explosive && !def.projectile && !def.beam && def.sound !== 'bow') g.effects.shell(muzzle.clone().addScaledVector(dir, -0.45), p.yaw, !!def.pellets);
    if (item.mag === 0 && (p.ammo[def.ammo] > 0 || g.infiniteAmmo) && g.settings.autoReload !== false) this.autoReloadT = Math.min(0.35, this.cooldown);
  }

  // Disparo que atraviesa construcciones y personajes (rifle de plasma).
  pierceShot(origin, d, skip, def, item, hits, muzzle, ends) {
    const g = this.game;
    let from = origin.clone();
    let left = def.range;
    let ignore = this.player;
    let sk = skip;
    let end = null;
    for (let k = 0; k <= def.pierce; k++) {
      const hit = g.raycast(from, d, left, sk, ignore);
      if (!hit) break;
      end = hit.point;
      this.collectHit(hit, def, item, hits);
      const build = hit.box?.data?.type === 'build';
      if (hit.kind !== 'character' && hit.kind !== 'dummy' && !build) break;
      left -= hit.t + 0.35;
      if (left <= 0) break;
      from = hit.point.clone().addScaledVector(d, build ? 0.35 : 0.05);
      ignore = hit.kind === 'character' ? hit.entity : null;
      sk = 0;
    }
    const e = end || origin.clone().addScaledVector(d, def.range);
    g.effects.tracer(muzzle, e, def.beam, 0.05, 0.14);
    ends.push(e);
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
      if (e.head && e.kind !== 'dummy') g.player.stats.heads++;
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
    if (input.held('fire') && this.swingT <= 0 && this.swapT <= 0) {
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
    const start = (input.hit('fire') || this.quickHealPending) && this.swapT <= 0;
    this.quickHealPending = false;
    // Plataforma de salto: un clic la coloca en el suelo
    if (def.deploy) {
      if (start && this.deployPad()) this.consumeOne(item);
      return;
    }
    if (!this.using && start) {
      const healFull = !def.heal || p.health >= def.cap;
      const shieldFull = !def.shield || p.shield >= def.cap;
      if (def.over && p.health >= 100 && p.shield >= 100) {
        g.hud.toast('Ya tienes la salud y el escudo al máximo');
        return;
      }
      if (def.heal && def.shield && healFull && shieldFull) {
        g.hud.toast('Ya tienes la salud y el escudo al máximo');
        return;
      }
      if (def.heal && !def.shield && healFull) {
        g.hud.toast(def.cap < 100 ? `Las vendas solo curan hasta ${def.cap}` : 'Ya tienes la salud al máximo');
        return;
      }
      if (def.shield && !def.heal && shieldFull) {
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
        if (def.over) p.regen = { left: def.over.total, rate: def.over.rate };
        this.using = null;
        g.hud.setProgress(null);
        g.audio.heal();
        this.consumeOne(item);
      }
    }
  }

  consumeOne(item) {
    const p = this.player;
    item.count--;
    if (item.count <= 0) {
      p.inventory[p.selected] = null;
      this.modelKey = null;
      this.select(0);
    }
  }

  // --------------------------------------------------- PLATAFORMA DE SALTO
  deployPad() {
    const g = this.game;
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const x = p.pos.x + fx * 2.2, z = p.pos.z + fz * 2.2;
    const y = g.world.groundBelow(x, z, p.pos.y + 1.5);
    if (Math.abs(y - p.pos.y) > 1.6 || y < 0.2) {
      g.hud.toast('No se puede colocar aquí: busca suelo plano');
      return false;
    }
    this.addPad(x, y, z, p.yaw);
    g.net?.sendPad(x, y, z, p.yaw);
    g.audio.build();
    g.hud.toast('Plataforma de salto colocada: písala para salir disparado');
    return true;
  }

  // También la usan las plataformas que colocan otros jugadores (online).
  addPad(x, y, z, yaw) {
    const mesh = makeLaunchPad();
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    this.game.scene.add(mesh);
    this.pads.push({ mesh, pos: mesh.position });
  }

  updatePads() {
    const g = this.game;
    const c = g.player;
    if (!this.pads.length || !c.alive || c.mode !== 'ground' || c.vehicle || c.launchT > 0) return;
    for (const pad of this.pads) {
      if (Math.abs(c.pos.x - pad.pos.x) > 1.25 || Math.abs(c.pos.z - pad.pos.z) > 1.25) continue;
      if (c.pos.y < pad.pos.y - 0.3 || c.pos.y > pad.pos.y + 0.9) continue;
      c.vel.y = 46;
      c.onGround = false;
      c.launchT = 0.6;
      c.padLaunch = true;
      c.noFallT = 8;
      g.audio.launch();
      break;
    }
  }

  // Granadas, C4, humo, molotov… Clic izq.: lanzar · clic der. (C4): detonar.
  updateThrowable(dt, input, item) {
    const g = this.game;
    const p = this.player;
    const def = THROWABLES[item.type];
    const placed = def.remote ? g.explosives.charges(p) : 0;
    if (item.count > 0 && this.swapT <= 0) g.explosives.showPreview(p, item.type, g.aimDir);
    else g.explosives.hidePreview();
    if (def.remote && input.hit('ads')) {
      if (g.explosives.detonate(p)) g.audio.detonator?.();
      else g.hud.toast('No has colocado ningún C4');
    }
    if (input.hit('fire') && item.count > 0 && this.throwCd <= 0 && this.swapT <= 0) {
      if (g.explosives.throwItem(p, item.type, g.aimDir)) {
        item.count--;
        this.throwCd = 0.5;
        this.kick = 1.2;
      } else g.hud.toast('Ya tienes 10 C4 colocados: detónalos con clic derecho');
    }
    // Sin unidades (y sin C4 pendientes de detonar) se libera la casilla
    if (item.count <= 0 && !(def.remote && (placed > 0 || g.explosives.charges(p) > 0))) {
      p.inventory[p.selected] = null;
      this.modelKey = null;
      g.explosives.hidePreview();
      this.select(0);
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
    if (vm.userData.spin) vm.userData.spin.rotation.z += dt * (this.spin * 28 + (this.cooldown > 0 ? 6 : 0));
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
    if (this.charge > 0) {
      pos.z += this.charge * 0.06;
      rz -= this.charge * 0.05;
    }
    if (item.kind === 'throwable' && this.throwCd > 0) {
      const k = this.throwCd / 0.5;
      pos.y -= Math.sin(k * Math.PI) * 0.12;
      rx += Math.sin(k * Math.PI) * 0.8;
    }
    if (this.using) {
      pos.y += Math.sin(performance.now() / 120) * 0.01;
      pos.x -= 0.08;
    }
    vm.position.copy(pos);
    vm.rotation.set(rx, ry, rz);
  }
}
