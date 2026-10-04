// Modo creativo: isla plana, todas las armas, materiales infinitos, vuelo y
// un catálogo con todos los edificios de la isla para colocarlos donde quieras.
// La isla creativa se guarda sola en el navegador.
import * as THREE from 'three';
import { GeoBuilder } from '../world/geobuilder.js';
import { BuildingCtx, genHouse, genWarehouse, genSilo, genHay, genContainer, PALETTES } from '../world/buildings.js';
import {
  genShop, genGasStation, genChurch, genWaterTower, genRadioTower, genLighthouse, genBunker, genWatchtower,
  genTent, genFactory, genStadium, genCrane, genRuins, genFountain, genLamp, genBench, genSandbags,
} from '../world/structures.js';
import { RNG } from '../core/rng.js';
import { PICKAXE, makeWeapon, AMMO } from './items.js';
import { yawToDir } from './build.js';

const SAVE_KEY = 'islaRoyale.creative.v1';

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
    this.panelOpen = false;
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
    this.buildPanel();
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
    p.inventory = [PICKAXE, makeWeapon('ar', 4), makeWeapon('shotgun', 4), makeWeapon('sniper', 4), makeWeapon('smg', 4), makeWeapon('pistol', 4)];
    p.selected = 1;
    g.combat.modelKey = null;
    this.flying = false;
    this.load();
    g.hud.toast(g.touch
      ? 'Modo creativo: 🏠 catálogo de edificios · doble SALTAR para volar'
      : 'Modo creativo: B catálogo de edificios · doble Espacio para volar · F editar');
  }

  stop() {
    this.save();
    this.select(null);
    this.closePanel();
    this.flying = false;
  }

  // Munición infinita e invulnerable.
  tick() {
    const p = this.game.player;
    for (const a in AMMO) p.ammo[a] = AMMO[a].max;
    p.invuln = 1;
    p.health = 100;
    p.shield = 100;
  }

  // ------------------------------------------------------------ CATÁLOGO
  buildPanel() {
    const el = (this.panel = document.createElement('div'));
    el.id = 'creative-panel';
    el.innerHTML = `
      <div class="cp-card">
        <div class="cp-head"><b>Catálogo de la isla</b><span>Elige un edificio para colocarlo</span><button class="cp-x" data-cp="close">✕</button></div>
        <div class="cp-grid">${PREFABS.map((p) => `<button data-prefab="${p.id}"><i>${p.icon}</i><span>${p.name}</span><small>${p.W}×${p.D} m</small></button>`).join('')}</div>
        <div class="cp-actions">
          <button data-cp="erase" class="danger">🧽 Borrar edificios</button>
          <button data-cp="clear" class="secondary">Vaciar la isla</button>
        </div>
      </div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.prefab) this.select(BY_ID[b.dataset.prefab]);
      else if (b.dataset.cp === 'erase') this.setErase(true);
      else if (b.dataset.cp === 'clear') {
        if (confirm('¿Borrar todos los edificios y construcciones de tu isla creativa?')) this.clearAll();
      }
      this.closePanel();
    });
    document.body.appendChild(el);
  }

  openPanel() {
    const g = this.game;
    this.panelOpen = true;
    this.panel.classList.add('open');
    g.uiOpen = true;
    g.input.unlock();
  }

  closePanel() {
    if (!this.panelOpen) return;
    const g = this.game;
    this.panelOpen = false;
    this.panel.classList.remove('open');
    if (g.state === 'playing' && !g.paused) g.input.lock();
    setTimeout(() => (g.uiOpen = false), 200);
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
    if (input.wasPressed('KeyB')) this.togglePanel();
    this.updateFlight(dt, input);
    if (p.mode !== 'ground' || p.vehicle) {
      this.ghost.visible = false;
      return;
    }
    if (this.selected) {
      if (input.mouseClicked(2) || input.wasPressed('Escape')) return this.select(null);
      if (input.wasPressed('KeyR')) this.rot = (this.rot + 1) % 4;
      const t = this.target();
      const ok = this.fits(t);
      const def = this.selected;
      const y = g.world.terrain.heightAt(t.x, t.z);
      this.ghost.visible = true;
      this.ghost.scale.set(t.fw, def.h, t.fd);
      this.ghost.position.set(t.x, y + def.h / 2, t.z);
      this.ghost.material.color.setHex(ok ? 0x5ab4ff : 0xff5050);
      this.ghostEdges.material.color.setHex(ok ? 0xaee0ff : 0xff9090);
      if (input.mouseClicked(0)) {
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
      if (input.mouseClicked(2)) return this.setErase(false);
      const o = g.aimOrigin, d = g.aimDir;
      const hit = g.world.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 120);
      const data = hit?.box?.data;
      const rec = data?.type === 'prefab' ? data.prefab : null;
      this.setHighlight(rec);
      if (input.mouseClicked(0)) {
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
    if (input.wasPressed('Space')) {
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
    const speed = input.down('ShiftLeft') ? 26 : 14;
    const k = Math.min(1, dt * 6);
    p.vel.x += (wish.x * speed - p.vel.x) * k;
    p.vel.z += (wish.z * speed - p.vel.z) * k;
    const vy = input.down('Space') ? 10 : input.down('KeyC') || input.down('ControlLeft') ? -10 : 0;
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
      pieces: [...this.game.build.pieces.values()].map((q) => [q.type, q.cx, q.cz, q.base, q.dir, q.mat, q.mask ?? -1]),
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
    for (const [type, cx, cz, base, dir, mat, mask] of data.pieces || []) {
      const t = { type, cx, cz, base, dir };
      t.key = b.key(type, cx, cz, base, dir);
      if (b.pieces.has(t.key) || !b.geos[type]) continue;
      const piece = b.place(t, owner, mat, true);
      piece.owner = 'me';
      piece.grow = 1;
      piece.mesh.scale.setScalar(1);
      piece.hp = piece.maxHp;
      piece.buildT = piece.buildTime;
      if (mask >= 0 && mask !== piece.mask) b.applyEdit(piece, mask, dir, true);
    }
    this.dirty = false;
  }
}
