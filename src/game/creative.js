// Modo creativo: isla plana, todas las armas, materiales infinitos, vuelo,
// un catálogo con todos los edificios de la isla para colocarlos donde
// quieras y herramientas (catálogo de objetos, bots, dianas, cofres,
// prefabricados de construcción, ranuras de guardado, teletransporte, hora
// del día y tormenta). La isla creativa se guarda sola en el navegador. El
// panel con pestañas está en src/ui/creative.js.
import * as THREE from 'three';
import { GeoBuilder } from '../world/geobuilder.js';
import { BuildingCtx, genHouse, genWarehouse, genSilo, genHay, genContainer, PALETTES } from '../world/buildings.js';
import {
  genShop, genGasStation, genChurch, genWaterTower, genRadioTower, genLighthouse, genBunker, genWatchtower,
  genTent, genFactory, genStadium, genCrane, genRuins, genFountain, genLamp, genBench, genSandbags,
  genCastle, genWindmill, genMarket,
} from '../world/structures.js';
import { RNG, random } from '../core/rng.js';
import { PICKAXE, makeWeapon, AMMO } from './items.js';
import { yawToDir, G, WALL_PRESETS } from './build.js';
import { SKY } from '../world/sky.js';

const SAVE_KEY = 'islaRoyale.creative.v1';
const SLOT_KEY = 'islaRoyale.creative.slot';
const NIGHT = { top: new THREE.Color(0x0a1230), horizon: new THREE.Color(0x2a3560), fog: new THREE.Color(0x1a2240) };
const DAY = { top: new THREE.Color(SKY.top), horizon: new THREE.Color(SKY.horizon), fog: new THREE.Color(SKY.horizon) };

// Prefabricados: piezas relativas a la casilla de delante (norte = hacia
// donde miras). y = plantas hacia arriba.
const P = (type, x, z, dir = 0, y = 0, edit = 0) => ({ type, x, z, dir, y, edit });
const DOOR = WALL_PRESETS[0].mask;
const WINDOW = WALL_PRESETS[1].mask;
export const PIECE_PREFABS = {
  box: {
    name: 'Caja 1×1 (encerrarse)', here: true,
    pieces: [P('wall', 0, 0, 0), P('wall', 0, 0, 1), P('wall', 0, 0, 2), P('wall', 0, 0, 3), P('cone', 0, 0, 0, 1)],
  },
  rampRush: {
    name: 'Subida de rampas',
    pieces: [0, 1, 2, 3, 4, 5].flatMap((k) => [P('ramp', 0, -1 - k, 0, k), P('wall', 0, -1 - k, 1, k), P('wall', 0, -1 - k, 3, k)]),
  },
  tower: {
    name: 'Torre de rampas (90s)',
    pieces: [0, 1, 2, 3, 4, 5].flatMap((k) => [P('wall', 0, -1, 0, k), P('wall', 0, -1, 1, k), P('wall', 0, -1, 2, k, k === 0 ? DOOR : 0), P('wall', 0, -1, 3, k), P('ramp', 0, -1, k % 4, k)]),
  },
  fort: {
    name: 'Fuerte 2×2 (3 plantas)',
    pieces: (() => {
      const out = [];
      for (let y = 0; y < 3; y++) {
        for (const [x, z] of [[0, -1], [1, -1], [0, -2], [1, -2]]) {
          // huecos para las rampas interiores
          if (y > 0 && !(y === 1 && x === 1 && z === -1) && !(y === 2 && x === 0 && z === -2)) out.push(P('floor', x, z, 0, y));
        }
        out.push(P('wall', 0, -2, 0, y, y === 1 ? WINDOW : 0), P('wall', 1, -2, 0, y, y === 1 ? WINDOW : 0));
        out.push(P('wall', 0, -1, 2, y, y === 0 ? DOOR : 0), P('wall', 1, -1, 2, y));
        out.push(P('wall', 0, -1, 3, y), P('wall', 0, -2, 3, y), P('wall', 1, -1, 1, y), P('wall', 1, -2, 1, y));
      }
      out.push(P('ramp', 1, -1, 0, 0), P('ramp', 0, -2, 2, 1));
      for (const [x, z] of [[0, -1], [1, -1], [0, -2], [1, -2]]) out.push(P('cone', x, z, 0, 3));
      return out;
    })(),
  },
  wallLine: { name: 'Muro de 5', pieces: [-2, -1, 0, 1, 2].map((x) => P('wall', x, -1, 0)) },
  bridge: { name: 'Puente (8 suelos)', pieces: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => P('floor', 0, -k, 0, 0)) },
  arena: {
    name: 'Plataforma de combate 5×5',
    pieces: (() => {
      const out = [];
      for (let x = -2; x <= 2; x++) for (let z = -6; z <= -2; z++) out.push(P('floor', x, z, 0, 0));
      return out;
    })(),
  },
};


// Catálogo. W×D = huella en metros; h = altura aproximada (para la silueta).
export const PREFABS = [
  { id: 'house1', name: 'Casa', icon: '🏠', W: 10, D: 9, h: 7, gen: (c, r) => genHouse(c, r, { W: 10, D: 9, floors: 1, roof: 'gable', porch: true, chimney: true, wallColor: PALETTES.house[0], roofColor: PALETTES.roof[0] }) },
  { id: 'house2', name: 'Casa de 2 plantas', icon: '🏡', W: 11, D: 10, h: 10, gen: (c, r) => genHouse(c, r, { W: 11, D: 10, floors: 2, roof: 'gable', porch: false, chimney: false, wallColor: PALETTES.house[2], roofColor: PALETTES.roof[1] }) },
  { id: 'tower', name: 'Edificio de pisos', icon: '🏢', W: 16, D: 16, h: 24, gen: (c, r) => genHouse(c, r, { W: 16, D: 16, floors: 6, roof: 'flat', roofAccess: true, bigWindows: true, wallColor: PALETTES.city[0] }) },
  { id: 'shop', name: 'Tienda', icon: '🏪', W: 12, D: 10, h: 6, gen: (c, r) => genShop(c, r, { W: 12, D: 10, sign: 0xd63a2f }) },
  { id: 'gas', name: 'Gasolinera', icon: '⛽', W: 18, D: 20, h: 6, gen: (c, r) => genGasStation(c, r) },
  { id: 'church', name: 'Iglesia', icon: '⛪', W: 18, D: 18, h: 16, gen: (c, r) => genChurch(c, r) },
  { id: 'warehouse', name: 'Nave', icon: '🏭', W: 22, D: 15, h: 8, gen: (c, r) => genWarehouse(c, r, { W: 22, D: 15, wallColor: PALETTES.industrial[0], roof: 'flat' }) },
  { id: 'factory', name: 'Fábrica', icon: '🏗️', W: 26, D: 18, h: 14, gen: (c, r) => genFactory(c, r, { W: 26, D: 18, wallColor: PALETTES.industrial[2], roof: 'flat' }) },
  { id: 'stadium', name: 'Estadio', icon: '🏟️', W: 46, D: 47, h: 10, gen: (c, r) => genStadium(c, r) },
  { id: 'bunker', name: 'Búnker', icon: '🪖', W: 14, D: 10, h: 4, gen: (c, r) => genBunker(c, r) },
  { id: 'watchtower', name: 'Torre de vigilancia', icon: '🗼', W: 5, D: 5, h: 9, gen: (c) => genWatchtower(c) },
  { id: 'watertower', name: 'Depósito de agua', icon: '🛢️', W: 9, D: 9, h: 16, gen: (c) => genWaterTower(c) },
  { id: 'radio', name: 'Antena de radio', icon: '📡', W: 16, D: 12, h: 30, gen: (c, r) => genRadioTower(c, r) },
  { id: 'lighthouse', name: 'Faro', icon: '🚨', W: 22, D: 12, h: 26, gen: (c, r) => genLighthouse(c, r) },
  { id: 'crane', name: 'Grúa', icon: '🏗', W: 3, D: 3, h: 22, gen: (c) => genCrane(c) },
  { id: 'silo', name: 'Silo', icon: '🌾', W: 5, D: 5, h: 12, gen: (c, r) => genSilo(c, r) },
  { id: 'castle', name: 'Castillo', icon: '🏰', W: 28, D: 28, h: 16, gen: (c, r) => genCastle(c, r) },
  { id: 'windmill', name: 'Molino', icon: '🌬️', W: 9, D: 9, h: 15, gen: (c, r) => genWindmill(c, r) },
  { id: 'market', name: 'Mercadillo', icon: '🛍️', W: 19, D: 15, h: 3, gen: (c, r) => genMarket(c, r) },
  { id: 'ruins', name: 'Ruinas', icon: '🏚️', W: 13, D: 10, h: 3, gen: (c, r) => genRuins(c, r) },
  { id: 'tent', name: 'Tienda de campaña', icon: '⛺', W: 3.4, D: 4.8, h: 2, gen: (c, r) => genTent(c, r) },
  { id: 'container', name: 'Contenedor', icon: '📦', W: 2.6, D: 6.2, h: 3, gen: (c, r) => genContainer(c, r, 1) },
  { id: 'containers', name: 'Contenedores apilados', icon: '🧱', W: 2.6, D: 6.2, h: 8, gen: (c, r) => genContainer(c, r, 3) },
  { id: 'fountain', name: 'Fuente', icon: '⛲', W: 7, D: 7, h: 3, gen: (c) => genFountain(c) },
  { id: 'hay', name: 'Fardo de paja', icon: '🟫', W: 1.6, D: 1.6, h: 1.2, gen: (c) => genHay(c) },
  { id: 'sandbags', name: 'Sacos terreros', icon: '🛡️', W: 6, D: 0.8, h: 1.1, gen: (c) => genSandbags(c, -3, -0.3, 3, 0.3) },
  { id: 'bench', name: 'Banco', icon: '🪑', W: 1.8, D: 0.6, h: 1, gen: (c) => genBench(c) },
  { id: 'lamp', name: 'Farola', icon: '💡', W: 0.6, D: 0.6, h: 5, gen: (c) => genLamp(c) },
];
const BY_ID = Object.fromEntries(PREFABS.map((p) => [p.id, p]));

export class Creative {
  constructor(game) {
    this.game = game;
    this.placed = [];
    this.selected = null; // prefab elegido para colocar
    this.erase = false;
    this.rot = 0;
    this.flying = false;
    this.lastJump = -1;
    this.saveT = 0;
    this.dirty = false;
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.18, depthWrite: false });
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
    this.ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xaee0ff }));
    this.ghost.add(this.ghostEdges);
    this.ghost.visible = false;
    game.scene.add(this.ghost);
    this.highlight = null;
    this.night = 0;
    this.stormOn = false;
  }

  // El catálogo de edificios es una pestaña del panel creativo.
  get panelOpen() {
    return !!this.game.creativePanel?.open;
  }

  get on() {
    return !!this.game.mode?.creative && this.game.state === 'playing';
  }

  // Colocando o borrando: no se dispara.
  get busy() {
    return this.on && (!!this.selected || this.erase || this.panelOpen);
  }

  // ------------------------------------------------------------ PARTIDA
  start() {
    const g = this.game;
    const p = g.player;
    g.storm.active = false;
    g.storm.mesh.visible = false;
    g.godMode = true;
    g.infiniteAmmo = true;
    p.inventory = [PICKAXE, makeWeapon('ar', 4), makeWeapon('shotgun', 4), makeWeapon('sniper', 4), makeWeapon('smg', 4), makeWeapon('pistol', 4)];
    p.selected = 1;
    g.combat.modelKey = null;
    this.flying = false;
    this.load();
    g.hud.toast(g.touch
      ? 'Modo creativo: 🏠 catálogo de edificios · doble SALTAR para volar'
      : `Modo creativo: ${g.key('catalog')} catálogo y herramientas · doble ${g.key('jump')} para volar · ${g.key('edit')} editar`);
  }

  stop() {
    this.save();
    this.select(null);
    this.closePanel();
    this.flying = false;
  }

  // Munición infinita y modo dios (se pueden quitar en Herramientas).
  tick() {
    const g = this.game;
    const p = g.player;
    if (g.infiniteAmmo) for (const a in AMMO) p.ammo[a] = AMMO[a].max;
    if (g.godMode) {
      p.invuln = 1;
      p.health = 100;
      p.shield = 100;
    }
  }

  // ------------------------------------------------------------ CATÁLOGO
  openPanel() {
    this.game.creativePanel?.show('buildings');
  }

  closePanel() {
    if (this.panelOpen) this.game.creativePanel.toggle();
  }

  togglePanel() {
    if (this.panelOpen) this.closePanel();
    else this.openPanel();
  }

  select(prefab) {
    this.selected = prefab;
    this.erase = false;
    this.ghost.visible = false;
    this.setHighlight(null);
    if (prefab) {
      this.game.build.setActive(false);
      this.game.hud.toast(this.game.touch
        ? `${prefab.name}: dispara para colocar · ↻ girar · ✕ cancelar`
        : `${prefab.name}: clic para colocar · R girar · clic der. cancelar`);
    }
  }

  setErase(on) {
    this.select(null);
    this.erase = on;
    if (on) {
      this.game.build.setActive(false);
      this.game.hud.toast(this.game.touch ? 'Borrar: apunta a un edificio y dispara · ✕ terminar' : 'Borrar: apunta a un edificio y haz clic · clic der. terminar');
    }
  }

  cancel() {
    this.select(null);
    this.erase = false;
  }

  // ------------------------------------------------------------ COLOCAR
  // Construye el edificio con los mismos generadores que la isla normal.
  spawn(id, x, z, rot, seed = 1) {
    const def = BY_ID[id];
    if (!def) return null;
    const g = this.game;
    const world = g.world;
    const rec = { id, x, z, rot, seed, boxes: [], ladders: [], mesh: null };
    const col = world.collision;
    const proxy = { add: (a, b, c, d, e, f) => {
      const box = col.add(a, b, c, d, e, f, { type: 'prefab', prefab: rec });
      rec.boxes.push(box);
      return box;
    } };
    const geo = new GeoBuilder();
    const y = world.terrain.heightAt(x, z);
    const ctx = new BuildingCtx(geo, proxy, x, y, z, rot);
    try {
      def.gen(ctx, new RNG(seed));
    } catch (err) {
      console.warn('No se pudo crear', id, err);
    }
    rec.ladders = ctx.ladders;
    world.ladders.push(...ctx.ladders);
    rec.mesh = geo.build(world.buildingMesh?.material);
    g.scene.add(rec.mesh);
    this.placed.push(rec);
    this.changed();
    return rec;
  }

  removePrefab(rec) {
    const world = this.game.world;
    for (const b of rec.boxes) world.collision.remove(b);
    world.ladders = world.ladders.filter((l) => !rec.ladders.includes(l));
    this.game.scene.remove(rec.mesh);
    rec.mesh.geometry.dispose();
    this.placed = this.placed.filter((r) => r !== rec);
    this.game.effects.debris(new THREE.Vector3(rec.x, this.game.world.terrain.heightAt(rec.x, rec.z) + 1, rec.z), 0xbbbbbb);
    this.game.audio.breakPiece();
    this.changed();
  }

  clearAll() {
    for (const r of [...this.placed]) this.removePrefab(r);
    this.game.build.reset();
    this.changed();
  }

  target() {
    const p = this.game.player;
    const def = this.selected;
    const dir = (yawToDir(p.yaw) + this.rot) % 4;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const dist = Math.max(def.W, def.D) / 2 + 4;
    const x = Math.round(p.pos.x + fx * dist), z = Math.round(p.pos.z + fz * dist);
    // La puerta (+Z local) mira hacia el jugador
    const rot = (dir + 2) % 4;
    const swap = rot % 2 === 1;
    return { x, z, rot, fw: swap ? def.D : def.W, fd: swap ? def.W : def.D };
  }

  fits(t) {
    const w = this.game.world;
    const hw = t.fw / 2, hd = t.fd / 2;
    if (Math.hypot(t.x, t.z) > 440) return false;
    const y = w.terrain.heightAt(t.x, t.z);
    if (y < 1) return false;
    return !w.collision.overlaps(t.x - hw + 0.2, y + 0.3, t.z - hd + 0.2, t.x + hw - 0.2, y + 2.5, t.z + hd - 0.2);
  }

  setHighlight(rec) {
    if (this.highlight === rec) return;
    if (this.highlight?.mesh) this.highlight.mesh.material = this.game.world.buildingMesh?.material || this.highlight.mesh.material;
    this.highlight = rec;
    if (rec) {
      this.redMat ||= new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xff7070, emissive: 0x401010 });
      rec.mesh.material = this.redMat;
    }
  }

  update(dt, input) {
    const g = this.game;
    const p = g.player;
    if (!this.on) return;
    this.tick();
    this.saveT += dt;
    if (this.dirty && this.saveT > 3) this.save();
    this.updateFlight(dt, input);
    if (p.mode !== 'ground' || p.vehicle) {
      this.ghost.visible = false;
      return;
    }
    if (this.selected) {
      if (input.hit('ads') || input.wasPressed('Escape')) return this.select(null);
      if (input.hit('reload')) this.rot = (this.rot + 1) % 4;
      const t = this.target();
      const ok = this.fits(t);
      const def = this.selected;
      const y = g.world.terrain.heightAt(t.x, t.z);
      this.ghost.visible = true;
      this.ghost.scale.set(t.fw, def.h, t.fd);
      this.ghost.position.set(t.x, y + def.h / 2, t.z);
      this.ghost.material.color.setHex(ok ? 0x5ab4ff : 0xff5050);
      this.ghostEdges.material.color.setHex(ok ? 0xaee0ff : 0xff9090);
      if (input.hit('fire')) {
        if (!ok) g.hud.toast('No cabe ahí: hay algo en medio o está fuera de la isla');
        else {
          this.spawn(def.id, t.x, t.z, t.rot, Math.floor(Math.random() * 1e6));
          g.audio.build();
          const r = g.progress.bump('prefabs');
          g.announceRewards?.(r);
        }
      }
      return;
    }
    this.ghost.visible = false;
    if (this.erase) {
      if (input.hit('ads')) return this.setErase(false);
      const o = g.aimOrigin, d = g.aimDir;
      const hit = g.world.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 120);
      const data = hit?.box?.data;
      const rec = data?.type === 'prefab' ? data.prefab : null;
      this.setHighlight(rec);
      if (input.hit('fire')) {
        if (rec) {
          this.setHighlight(null);
          this.removePrefab(rec);
        } else if (data?.type === 'build') g.build.remove(data.piece, true);
      }
    }
  }

  // Doble salto: volar. Saltar sube, agacharse baja.
  updateFlight(dt, input) {
    const g = this.game;
    const p = g.player;
    if (p.mode !== 'ground' || p.vehicle) {
      this.flying = false;
      return;
    }
    if (input.hit('jump')) {
      if (g.time - this.lastJump < 0.35) {
        this.flying = !this.flying;
        this.lastJump = -1;
        g.hud.toast(this.flying ? 'Volando · saltar: subir · agacharse: bajar · doble salto: aterrizar' : 'Has dejado de volar');
      } else this.lastJump = g.time;
    }
  }

  // Lo llama el jugador en vez de la física normal mientras vuela.
  flyStep(dt, wish, input) {
    const p = this.game.player;
    const speed = (input.held('sprint') ? 26 : 14) * (this.game.speedMult || 1);
    const k = Math.min(1, dt * 6);
    p.vel.x += (wish.x * speed - p.vel.x) * k;
    p.vel.z += (wish.z * speed - p.vel.z) * k;
    const vy = input.held('jump') ? 10 : input.held('crouch') ? -10 : 0;
    p.vel.y += (vy - p.vel.y) * k;
    p.onGround = false;
    p.move(dt);
    if (p.onGround && vy <= 0 && p.vel.y <= 0) this.flying = false;
  }

  // ------------------------------------------------------------ GUARDAR
  changed() {
    if (!this.on) return;
    this.dirty = true;
    this.saveT = 0;
  }

  save() {
    if (!this.game.mode?.creative) return;
    this.dirty = false;
    const data = {
      prefabs: this.placed.map((r) => [r.id, r.x, r.z, r.rot, r.seed]),
      pieces: [...this.game.build.pieces.values()].map((q) => [q.type, q.cx, q.cz, q.base, q.dir, q.mat, q.edit | 0]),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* almacenamiento no disponible */
    }
  }

  load() {
    for (const r of [...this.placed]) this.removePrefab(r);
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch {
      data = null;
    }
    if (!data) return;
    for (const [id, x, z, rot, seed] of data.prefabs || []) this.spawn(id, x, z, rot, seed);
    const b = this.game.build;
    const owner = { mats: { wood: 999, stone: 999, metal: 999 }, isPlayer: false, isNet: false };
    for (const [type, cx, cz, base, dir, mat, edit] of data.pieces || []) {
      const t = { type, cx, cz, base, dir, edit: edit > 0 ? edit : 0 };
      t.key = b.key(type, cx, cz, base, dir);
      if (b.pieces.has(t.key) || !b.geos[type]) continue;
      const piece = b.place(t, owner, mat, true);
      piece.owner = 'me';
      piece.grow = 1;
      piece.mesh.scale.setScalar(1);
      piece.hp = piece.maxHp;
      piece.buildT = piece.buildTime;
      piece.team = this.game.player.team;
    }
    this.dirty = false;
  }
  // ------------------------------------------------------------ HERRAMIENTAS
  // Se reinicia al empezar cualquier partida.
  reset() {
    const g = this.game;
    g.dummies.clearExtra();
    g.containers.clearExtra();
    this.setNight(0);
    this.stormOn = false;
  }

  // ------------------------------------------------------------ OBJETOS
  give(item) {
    const g = this.game;
    const p = g.player;
    const it = { ...item };
    if (it.kind === 'weapon') it.mag = makeWeapon(it.type, it.rarity).mag;
    if (it.kind === 'ammo' || it.kind === 'material') {
      p.addItem(it);
      g.audio.pickup();
      return;
    }
    if (!p.addItem(it)) {
      // inventario lleno: sustituye el objeto en la mano
      const slot = p.selected > 0 ? p.selected : 1;
      p.inventory[slot] = it;
      g.combat.modelKey = null;
    }
    g.combat.modelKey = null;
    g.audio.pickup();
  }

  front(dist = 3) {
    const p = this.game.player;
    return new THREE.Vector3(p.pos.x - Math.sin(p.yaw) * dist, p.pos.y + 1, p.pos.z - Math.cos(p.yaw) * dist);
  }

  drop(item) {
    const it = { ...item };
    if (it.kind === 'weapon') it.mag = makeWeapon(it.type, it.rarity).mag;
    const pk = this.game.pickups.spawn(it, this.front(2.5), new THREE.Vector3(0, 3, 0));
    pk.noAuto = true;
  }

  clearInventory() {
    const p = this.game.player;
    p.inventory = [PICKAXE, null, null, null, null, null];
    p.selected = 0;
    this.game.combat.modelKey = null;
  }

  heal() {
    const p = this.game.player;
    p.health = 100;
    p.shield = 100;
  }

  // ------------------------------------------------------------ MUNDO
  groundAt(v) {
    return this.game.world.groundBelow(v.x, v.z, v.y + 4);
  }

  spawnBot(diff = 'normal') {
    const g = this.game;
    const f = this.front(18);
    const team = 1 + g.bots.list.length;
    const b = g.bots.spawnExtra(team, diff, f.x, f.z, g.botLoadout());
    if (!g.chars.includes(b)) g.chars.push(b);
    g.hud.toast(`Bot enemigo (${diff}) generado delante de ti`);
  }

  removeBots() {
    const g = this.game;
    g.bots.removeAll();
    g.chars = g.chars.filter((c) => !c.isBot);
  }

  spawnDummy() {
    const g = this.game;
    const f = this.front(6);
    const p = g.player;
    g.dummies.add({ x: f.x, y: this.groundAt(f), z: f.z, yaw: p.yaw }, true);
  }

  spawnContainer(kind) {
    const g = this.game;
    const f = this.front(3);
    const p = g.player;
    g.containers.add(kind, { x: f.x, y: this.groundAt(f), z: f.z, rotY: p.yaw + Math.PI });
  }

  prefab(id) {
    const g = this.game;
    const p = g.player;
    const pf = PIECE_PREFABS[id];
    if (!pf) return;
    const cx = Math.floor(p.pos.x / G), cz = Math.floor(p.pos.z / G);
    const base = g.build.levelBase(p.pos.y, p.pos.x, p.pos.z);
    const n = g.build.placeRelative(pf.pieces, cx, cz, base, pf.here ? 0 : yawToDir(p.yaw));
    g.hud.toast(`${pf.name}: ${n} piezas`);
  }

  clearBuilds() {
    this.game.build.reset();
    this.game.hud.toast('Construcciones borradas');
  }

  saveSlot(i) {
    try {
      const data = this.game.build.serialize();
      localStorage.setItem(SAVE_KEY + i, JSON.stringify(data));
      this.game.hud.toast(`Guardado en la ranura ${i} (${data.length} piezas)`);
    } catch {
      this.game.hud.toast('No se ha podido guardar (almacenamiento no disponible)');
    }
  }

  loadSlot(i) {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY + i) || 'null');
      if (!data) return this.game.hud.toast(`La ranura ${i} está vacía`);
      const n = this.game.build.load(data);
      this.game.hud.toast(`Cargadas ${n} piezas de la ranura ${i}`);
    } catch {
      this.game.hud.toast('No se ha podido cargar');
    }
  }

  slotInfo(i) {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY + i) || 'null');
      return data ? `${data.length} piezas` : 'vacía';
    } catch {
      return '—';
    }
  }

  teleport(x, z) {
    const g = this.game;
    const p = g.player;
    this.flying = false;
    p.vel.set(0, 0, 0);
    p.pos.set(x, g.world.groundBelow(x, z, 400) + 1, z);
    g.hud.toast('Teletransportado');
  }

  setStorm(on) {
    const g = this.game;
    this.stormOn = on;
    if (on) g.storm.reset('br', random);
    g.storm.active = on;
    g.storm.mesh.visible = on;
  }

  // 0 = día, 1 = noche
  setNight(v) {
    const g = this.game;
    this.night = v;
    const sky = g.sky.material.uniforms;
    sky.top.value.copy(DAY.top).lerp(NIGHT.top, v);
    sky.horizon.value.copy(DAY.horizon).lerp(NIGHT.horizon, v);
    g.scene.fog.color.copy(DAY.fog).lerp(NIGHT.fog, v);
    g.sun.intensity = 3.0 * (1 - v * 0.85);
    g.hemi.intensity = 1.5 * (1 - v * 0.6);
    g.sun.color.setHex(v > 0.5 ? 0xaabbff : 0xffefd2);
  }

}
