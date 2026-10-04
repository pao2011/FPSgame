import * as THREE from 'three';
import { World } from '../world/world.js';
import { createSky } from '../world/sky.js';
import { Input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { Effects } from './effects.js';
import { PickupManager, ContainerManager, spawnFloorLoot } from './loot.js';
import { Dummies } from './dummies.js';
import { BattleBus } from './bus.js';
import { Storm } from './storm.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { HUD } from '../ui/hud.js';
import { MapRenderer } from '../ui/minimap.js';
import { itemName, itemRarity, RARITIES } from './items.js';
import { clamp } from '../core/rng.js';

const BASE_FOV = 80;
const SKY_COLOR = 0xbfe3ff;
const tmpV = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const tmpR = new THREE.Vector3();

export class Game {
  constructor(container) {
    // ------------------------------------------------------------ RENDER
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);
    this.canvas = renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY_COLOR, 200, 1200);
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 4000);
    this.camera.rotation.order = 'YXZ';

    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 10);
    this.viewScene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5040, 2.0));
    const vd = new THREE.DirectionalLight(0xfff2dd, 2.2);
    vd.position.set(0.5, 1, 0.3);
    this.viewScene.add(vd);

    this.sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
    this.sky = createSky(this.scene, this.sunDir);
    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b7a4a, 1.6));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d8, 2.8));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);

    // ------------------------------------------------------------ MUNDO
    const params = new URLSearchParams(location.search);
    this.seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);
    this.world = new World(this.scene, this.seed);

    this.input = new Input(this.canvas);
    this.audio = audio;
    this.effects = new Effects(this);
    this.pickups = new PickupManager(this);
    this.containers = new ContainerManager(this, this.world.chestSpots, this.world.ammoSpots);
    this.dummies = new Dummies(this, this.world.dummySpots);
    this.bus = new BattleBus(this.scene);
    this.storm = new Storm(this.scene, this.world);
    this.storm.active = false;
    this.storm.mesh.visible = false;
    this.player = new Player(this);
    this.combat = new Combat(this);
    this.mapRenderer = new MapRenderer(this.world);
    this.hud = new HUD(this);

    this.state = 'menu';
    this.camMode = 'fp';
    this.paused = false;
    this.hadLock = false;
    this.time = 0;
    this.matchTime = 0;
    this.stormTick = 0;
    this.aimOrigin = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.aimSkip = 0;
    this.interact = null;

    this.setupUI();
    addEventListener('resize', () => this.onResize());
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.timer = new THREE.Timer();
    this.hud.show(false);
    window.game = this;
    this.containers.reset();
    this.loop();
  }

  // ------------------------------------------------------------------ UI
  setupUI() {
    const $ = (id) => document.getElementById(id);
    $('seed-label').textContent = `Isla #${this.seed}`;
    $('play-btn').addEventListener('click', () => {
      this.audio.init();
      this.input.lock();
      this.startMatch();
    });
    $('pause').addEventListener('click', () => {
      this.input.lock();
      this.setPaused(false);
    });
    $('again-btn').addEventListener('click', () => {
      this.audio.init();
      this.input.lock();
      this.startMatch();
    });
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock();
    });
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = innerWidth / innerHeight;
    this.viewCamera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  onLockChange(locked) {
    if (locked) {
      this.hadLock = true;
      this.setPaused(false);
    } else if (this.state === 'playing' && this.hadLock) {
      this.setPaused(true);
    }
  }

  setPaused(p) {
    this.paused = p;
    document.getElementById('pause').style.display = p ? 'flex' : 'none';
    if (p) this.audio.setWind(0);
  }

  startMatch() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('death').style.display = 'none';
    this.player.reset();
    this.combat.reset();
    this.effects.clear();
    this.pickups.clear();
    spawnFloorLoot(this, this.world.lootSpots);
    this.containers.reset();
    this.dummies.reset();
    this.bus.launch();
    this.player.mode = 'bus';
    this.player.yaw = Math.atan2(-this.bus.dir.x, -this.bus.dir.z) + 0.6;
    this.player.pitch = -0.35;
    this.storm.reset();
    this.storm.mesh.visible = true;
    this.state = 'playing';
    this.matchTime = 0;
    this.stormTick = 0;
    this.hud.show(true);
    this.hud.lastZone = null;
    this.audio.busHorn?.();
  }

  onJumpFromBus() {
    this.hud.toast('¡Has saltado! Mira hacia abajo y pulsa W para caer más rápido');
  }

  onLanded() {
    this.hud.toast('¡Has aterrizado! Busca cofres y armas');
  }

  onDeath(type) {
    this.state = 'dead';
    this.player.model.root.visible = false;
    document.exitPointerLock?.();
    const p = this.player;
    const t = Math.floor(this.matchTime);
    const cause = type === 'storm' ? 'La tormenta te ha eliminado' : type === 'fall' ? 'Has muerto por la caída' : 'Has sido eliminado';
    document.getElementById('death-cause').textContent = cause;
    document.getElementById('death-stats').innerHTML = `
      <div><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><span>Tiempo vivo</span></div>
      <div><b>${p.stats.chests}</b><span>Cofres abiertos</span></div>
      <div><b>${Math.round(p.stats.damage)}</b><span>Daño a dianas</span></div>
      <div><b>${Math.round(p.stats.distance)} m</b><span>Recorrido</span></div>`;
    document.getElementById('death').style.display = 'flex';
    this.hud.setScope(false);
    this.audio.setWind(0);
    this.audio.setStorm(0);
    this.audio.setChest(0, 0);
  }

  // ---------------------------------------------------------- RAYCAST
  raycast(origin, dir, maxDist, skip = 0) {
    const o = tmpV.copy(origin).addScaledVector(dir, skip);
    let best = null;
    let maxT = maxDist - skip;
    if (maxT <= 0) return null;
    const hb = this.world.collision.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, maxT);
    if (hb) best = { t: hb.t, kind: 'world', normal: new THREE.Vector3(hb.nx, hb.ny, hb.nz) };
    const ht = this.world.terrain.raycast(o, dir, best ? best.t : maxT);
    if (ht && (!best || ht.t < best.t)) best = { t: ht.t, kind: 'terrain', normal: null };
    const hd = this.dummies.raycast(o, dir, best ? best.t : maxT);
    if (hd) best = { t: hd.t, kind: 'dummy', dummy: hd.dummy, head: hd.head, normal: dir.clone().negate() };
    if (!best) return null;
    best.point = o.clone().addScaledVector(dir, best.t);
    if (best.kind === 'terrain') best.normal = this.world.terrain.normalAt(best.point.x, best.point.z, new THREE.Vector3());
    best.t += skip;
    return best;
  }

  // ---------------------------------------------------------- LOOP
  loop = (ts) => {
    requestAnimationFrame(this.loop);
    this.timer.update(ts);
    const dt = Math.min(0.05, this.timer.getDelta());
    this.step(dt);
    this.render();
  };

  step(dt) {
    const input = this.input;
    this.time += dt;
    const t = this.time;

    if (this.state === 'menu') {
      this.updateMenuCamera(t);
      this.world.clouds.rotation.y = t * 0.003;
      this.containers.update(dt, t);
      input.endFrame();
      return;
    }
    if (this.paused) {
      input.endFrame();
      return;
    }

    const p = this.player;
    if (this.state === 'playing') {
      this.matchTime += dt;
      this.handleGlobalKeys(input);
      // Mirar
      const zoom = this.camera.fov / BASE_FOV;
      const sens = 0.0022 * zoom;
      p.yaw -= input.mouseDX * sens;
      p.pitch -= input.mouseDY * sens;
      p.pitch = clamp(p.pitch, -1.5, 1.5);
      p.update(dt, input);
      this.updateCamera(dt);
      this.combat.update(dt, input);
      this.updateInteraction(input);
      this.updateStorm(dt);
      this.updateBanner();
    } else {
      this.updateCamera(dt);
    }

    this.bus.update(dt, t);
    this.storm.update(dt);
    this.pickups.update(dt, t);
    this.containers.update(dt, t);
    this.dummies.update(dt);
    this.effects.update(dt);
    this.updateAudio();
    this.world.clouds.rotation.y = t * 0.003;
    if (this.state === 'playing') this.hud.update(dt);
    input.endFrame();
  }

  handleGlobalKeys(input) {
    const p = this.player;
    if (input.wasPressed('KeyM')) this.hud.toggleMap();
    if (input.wasPressed('KeyV')) {
      this.camMode = this.camMode === 'fp' ? 'tp' : 'fp';
      this.hud.toast(this.camMode === 'fp' ? 'Cámara: primera persona' : 'Cámara: tercera persona');
    }
    if (p.mode !== 'ground') return;
    for (let i = 0; i < 6; i++) if (input.wasPressed('Digit' + (i + 1))) this.combat.select(i);
    if (input.wheel) this.combat.cycle(input.wheel > 0 ? 1 : -1);
    if (input.wasPressed('KeyG')) this.dropSelected();
  }

  dropSelected() {
    const p = this.player;
    const item = p.inventory[p.selected];
    if (p.selected === 0 || !item) return;
    p.inventory[p.selected] = null;
    this.combat.reloading = false;
    this.combat.cancelUse();
    const f = tmpF.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const pos = p.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
    this.pickups.spawn(item, pos, f.clone().multiplyScalar(3).setY(3));
    this.combat.modelKey = null;
  }

  tryPickup(pk) {
    const p = this.player;
    const item = pk.item;
    if (p.addItem(item)) {
      this.pickups.remove(pk);
      this.audio.pickup();
      this.combat.modelKey = null;
      return;
    }
    if (p.selected > 0 && p.inventory[p.selected]) {
      const cur = p.inventory[p.selected];
      p.inventory[p.selected] = { ...item };
      this.pickups.remove(pk);
      this.pickups.spawn(cur, pk.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, 2.5, 0));
      this.combat.reloading = false;
      this.combat.cancelUse();
      this.combat.modelKey = null;
      this.combat.swapT = 0.3;
      this.audio.pickup();
    } else {
      this.hud.toast('Inventario lleno: selecciona un objeto para intercambiarlo');
    }
  }

  updateInteraction(input) {
    const p = this.player;
    if (p.mode !== 'ground' || !p.alive) {
      this.hud.setPrompt(null);
      return;
    }
    const eye = p.eye;
    const dir = this.aimDir;
    const c = this.containers.findInteract(eye, dir);
    const k = this.pickups.findInteract(eye, dir);
    let target = null;
    if (c && (!k || c.score >= k.score)) target = c;
    else if (k) target = k;

    // Recogida automática de munición
    for (const pk of this.pickups.items.slice()) {
      if (pk.item.kind === 'ammo' && pk.settled && pk.pos.distanceTo(p.pos) < 1.3) {
        p.addItem(pk.item);
        this.pickups.remove(pk);
        this.audio.pickup();
        this.hud.toast(`+${pk.item.count} ${pk.item.ammo === 'shells' ? 'cartuchos' : 'munición ' + { light: 'ligera', medium: 'media', heavy: 'pesada' }[pk.item.ammo]}`);
      }
    }

    if (!target) {
      this.hud.setPrompt(null);
      return;
    }
    if (target.container) {
      const ct = target.container;
      this.hud.setPrompt(`<kbd>E</kbd> ${ct.kind === 'chest' ? 'Abrir cofre' : 'Abrir caja de munición'}`);
      if (input.wasPressed('KeyE')) {
        this.containers.open(ct);
        if (ct.kind === 'chest') p.stats.chests++;
      }
    } else {
      const it = target.pickup.item;
      const col = RARITIES[itemRarity(it)].color;
      const extra = it.kind === 'weapon' ? ` <small>${RARITIES[it.rarity].name}</small>` : it.count ? ` <small>x${it.count}</small>` : '';
      this.hud.setPrompt(`<kbd>E</kbd> Recoger <span style="color:${col}">${itemName(it)}</span>${extra}`);
      if (input.wasPressed('KeyE')) this.tryPickup(target.pickup);
    }
  }

  updateStorm(dt) {
    const p = this.player;
    if (!p.alive || p.mode === 'bus' || !this.storm.active) return;
    if (this.storm.isOutside(p.pos.x, p.pos.z)) {
      this.stormTick += dt;
      if (this.stormTick >= 1) {
        this.stormTick -= 1;
        p.damage(this.storm.dps, 'storm');
      }
    } else this.stormTick = 0;
  }

  updateBanner() {
    const p = this.player;
    const hud = this.hud;
    if (p.mode === 'bus') {
      if (this.bus.doorsTime > 0) hud.banner('AUTOBÚS DE BATALLA', `Las puertas se abren en ${Math.ceil(this.bus.doorsTime)}…`);
      else if (!this.bus.doorsOpen) hud.banner('AUTOBÚS DE BATALLA', 'Esperando a sobrevolar la isla…');
      else hud.banner('PULSA <kbd>ESPACIO</kbd> PARA SALTAR', 'Mueve el ratón para mirar · M: mapa');
    } else if (p.mode === 'freefall' && p.freefallTime < 4) {
      hud.banner('', '');
    } else hud.banner('');
  }

  updateAudio() {
    const p = this.player;
    const a = this.audio;
    if (!a.ctx || this.state !== 'playing') return;
    if (p.mode === 'freefall') a.setWind(Math.min(1, p.vel.length() / 55));
    else if (p.mode === 'glide') a.setWind(0.3);
    else if (p.mode === 'bus') a.setWind(0.12);
    else a.setWind(0);
    const near = p.mode === 'ground' ? this.containers.nearestChest(p.pos, 20) : null;
    if (near) {
      const v = Math.pow(1 - near.dist / 20, 2);
      tmpR.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      const to = tmpV.copy(near.chest.pos).sub(p.pos).setY(0).normalize();
      a.setChest(v, to.dot(tmpR));
    } else a.setChest(0, 0);
    a.setStorm(p.mode !== 'bus' && this.storm.active && this.storm.isOutside(p.pos.x, p.pos.z) ? 1 : 0);
  }

  // ---------------------------------------------------------- CÁMARA
  updateMenuCamera(t) {
    const a = t * 0.04;
    this.camera.position.set(Math.cos(a) * 420, 190, Math.sin(a) * 420);
    this.camera.lookAt(0, 10, 0);
    this.focusShadow(new THREE.Vector3(0, 0, 0));
  }

  updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    const f = tmpF.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    let fov = BASE_FOV;
    this.aimDir.copy(f);
    this.aimSkip = 0;

    if (p.mode === 'bus' || p.mode === 'lobby') {
      const target = this.bus.pos.clone();
      target.y += 3;
      cam.position.copy(target).addScaledVector(f, -30);
      this.aimOrigin.copy(cam.position);
      p.model.root.visible = false;
      this.scene.fog.near = 300;
      this.scene.fog.far = 1700;
    } else if (p.mode === 'freefall' || p.mode === 'glide' || !p.alive) {
      const target = p.pos.clone();
      target.y += p.mode === 'glide' ? 2.2 : 1.2;
      const dist = p.mode === 'glide' ? 7.5 : 6;
      cam.position.copy(target).addScaledVector(f, -dist);
      const th = this.world.terrain.heightAt(cam.position.x, cam.position.z) + 0.5;
      if (cam.position.y < th) cam.position.y = th;
      this.aimOrigin.copy(cam.position);
      p.model.root.visible = p.alive;
      fov = BASE_FOV + (p.mode === 'freefall' ? Math.min(12, -p.vel.y / 5) : 0);
      this.scene.fog.near = 250;
      this.scene.fog.far = 1500;
    } else {
      const ads = this.combat.adsBlend;
      const item = p.item;
      const adsFov = item && item.kind === 'weapon' ? this.combat.def(item).adsFov : BASE_FOV;
      fov = BASE_FOV + (adsFov - BASE_FOV) * ads;
      if (p.sprinting) fov += 6;
      this.scene.fog.near = 180;
      this.scene.fog.far = 1100;
      if (this.camMode === 'fp') {
        cam.position.copy(p.eye);
        this.aimOrigin.copy(cam.position);
        p.model.root.visible = false;
      } else {
        const pivot = p.eye.clone();
        pivot.y += 0.15;
        const right = tmpR.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        const desired = pivot.clone()
          .addScaledVector(right, 0.7 - ads * 0.15)
          .addScaledVector(f, -(3.0 - ads * 1.5));
        const dir = desired.clone().sub(pivot);
        const dist = dir.length();
        dir.divideScalar(dist);
        let d = dist;
        const hb = this.world.collision.raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, dist);
        if (hb) d = Math.min(d, hb.t - 0.2);
        const ht = this.world.terrain.raycast(pivot, dir, dist);
        if (ht) d = Math.min(d, ht.t - 0.3);
        d = Math.max(0.2, d);
        cam.position.copy(pivot).addScaledVector(dir, d);
        this.aimOrigin.copy(cam.position);
        this.aimSkip = Math.max(0, tmpV.copy(pivot).sub(cam.position).dot(f)) + 0.2;
        p.model.root.visible = true;
      }
    }
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 12);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const focus = p.mode === 'bus' ? this.bus.pos : p.pos;
    this.focusShadow(focus);
  }

  focusShadow(focus) {
    const s = this.sun;
    s.target.position.set(focus.x, Math.max(0, focus.y - 0), focus.z);
    s.position.copy(s.target.position).addScaledVector(this.sunDir, 200);
    s.target.updateMatrixWorld();
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.state === 'playing' && this.camMode === 'fp' && this.player.mode === 'ground' && this.combat.viewmodel.visible) {
      r.clearDepth();
      r.render(this.viewScene, this.viewCamera);
    }
  }
}
