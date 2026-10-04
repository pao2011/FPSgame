import * as THREE from 'three';
import { PICKAXE, makeWeapon, CONSUMABLES, AMMO, MATERIALS } from './items.js';
import { yawToDir, G, WALL_PRESETS } from './build.js';
import { random } from '../core/rng.js';
import { SKY } from '../world/sky.js';

const SAVE_KEY = 'islaRoyale.creative.slot';
const NIGHT = { top: new THREE.Color(0x0a1230), horizon: new THREE.Color(0x2a3560), fog: new THREE.Color(0x1a2240) };
const DAY = { top: new THREE.Color(SKY.top), horizon: new THREE.Color(SKY.horizon), fog: new THREE.Color(SKY.horizon) };

// Prefabricados: piezas relativas a la casilla de delante (norte = hacia
// donde miras). y = plantas hacia arriba.
const P = (type, x, z, dir = 0, y = 0, edit = 0) => ({ type, x, z, dir, y, edit });
const DOOR = WALL_PRESETS[0].mask;
const WINDOW = WALL_PRESETS[1].mask;
export const PREFABS = {
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

// Herramientas del modo creativo (las usa el panel de src/ui/creative.js).
export class CreativeTools {
  constructor(game) {
    this.game = game;
    this.night = 0;
    this.stormOn = false;
  }

  reset() {
    const g = this.game;
    g.dummies.clearExtra();
    g.containers.clearExtra();
    this.setNight(0);
    this.stormOn = false;
  }

  begin() {
    const g = this.game;
    const p = g.player;
    // Aparece en el borde de un pueblo, con espacio para construir
    const poi = g.world.pois.find((q) => q.type === 'town') || g.world.pois[0];
    let x = 0, z = 0;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      x = poi.x + Math.cos(a) * poi.radius * 1.15;
      z = poi.z + Math.sin(a) * poi.radius * 1.15;
      if (g.world.terrain.heightAt(x, z) > 3 && !g.world.occupied(x, z, 6)) break;
    }
    p.resetBody();
    p.mode = 'ground';
    p.pos.set(x, g.world.groundBelow(x, z, 200) + 0.5, z);
    p.yaw = Math.atan2(-(poi.x - x), -(poi.z - z));
    p.pitch = -0.1;
    p.inventory = [PICKAXE, makeWeapon('ar', 4), makeWeapon('shotgun', 4), makeWeapon('smg', 3),
      { kind: 'consumable', type: 'shieldpot', count: 3 }, { kind: 'consumable', type: 'medkit', count: 3 }];
    p.selected = 1;
    p.ammo = { light: 999, medium: 999, heavy: 999, shells: 999, rockets: 99 };
    p.model.root.visible = g.camMode !== 'fp';
    g.combat.modelKey = null;
    g.hud.toast(`Modo creativo · ${g.key('catalog')}: catálogo y herramientas · doble ${g.key('jump')}: volar`);
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
    const pf = PREFABS[id];
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
    p.flying = false;
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

  update() {}
}

export const CATALOG_INFO = { CONSUMABLES, AMMO, MATERIALS };
