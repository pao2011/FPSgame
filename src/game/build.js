import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MATERIALS, BUILD_COST } from './items.js';
import { R } from './character.js';

export const G = 4; // ancho de casilla
export const H = 3.2; // altura de planta
const T = 0.2; // grosor de muros y suelos
const RAMP_STEPS = 10;

export const PIECES = [
  { id: 'wall', name: 'Muro', key: '1' },
  { id: 'floor', name: 'Suelo', key: '2' },
  { id: 'ramp', name: 'Rampa', key: '3' },
  { id: 'cone', name: 'Techo', key: '4' },
];
export const MAT_ORDER = ['wood', 'stone', 'metal'];
const NET_OWNER = { mats: { wood: 999, stone: 999, metal: 999 }, isPlayer: false, isNet: true };

// Edición: los muros se dividen en 3×3 casillas y los suelos en 2×2.
// mask = bits de las casillas que siguen en pie (índice = fila * columnas + columna).
const EDIT_GRID = { wall: [3, 3], floor: [2, 2] };
export const FULL_MASK = { wall: 0x1ff, floor: 0xf };
const editGeoCache = new Map();

// Direcciones: 0 = norte (-Z), 1 = este (+X), 2 = sur (+Z), 3 = oeste (-X)
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function yawToDir(yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 1 : 3;
  return fz > 0 ? 2 : 0;
}

function texture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  if (kind === 'wood') {
    x.fillStyle = '#b07a40';
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? '#a06c36' : '#bb8749';
      x.fillRect(0, i * 16, 128, 15);
      x.fillStyle = '#6e4a22';
      x.fillRect(0, i * 16 + 15, 128, 1);
      x.fillRect(((i * 37) % 100) + 10, i * 16, 2, 15);
    }
  } else if (kind === 'stone') {
    x.fillStyle = '#8e939a';
    x.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 6; r++) {
      for (let k = 0; k < 4; k++) {
        const ox = (r % 2) * 16;
        const g = 140 + Math.floor(Math.random() * 30);
        x.fillStyle = `rgb(${g},${g + 3},${g + 8})`;
        x.fillRect(k * 32 + ox - 16 + 2, r * 21 + 2, 28, 18);
      }
    }
  } else {
    x.fillStyle = '#7f93a8';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#6b7f94';
    for (let i = 0; i < 4; i++) x.fillRect(0, i * 32 + 30, 128, 3);
    x.fillStyle = '#c9d5e0';
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) x.fillRect(k * 32 + 6, i * 32 + 6, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Sistema de construcción por rejilla al estilo Fortnite.
export class BuildSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.piece = 0;
    this.mat = 0;
    this.cooldown = 0;
    this.pieces = new Map();
    this.materials = {};
    for (const m of MAT_ORDER) this.materials[m] = new THREE.MeshLambertMaterial({ map: texture(m) });

    const rampLen = Math.hypot(G, H);
    this.geos = {
      wall: new THREE.BoxGeometry(G, H, T),
      floor: new THREE.BoxGeometry(G, T, G),
      ramp: new THREE.BoxGeometry(G, T, rampLen),
      cone: new THREE.ConeGeometry(G * 0.7071, 1.6, 4, 1).rotateY(Math.PI / 4),
    };
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghostEdge = new THREE.LineBasicMaterial({ color: 0xaee0ff, transparent: true, opacity: 0.9 });
    this.ghosts = {};
    for (const id in this.geos) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.geos[id], this.ghostMat));
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.geos[id]), this.ghostEdge));
      g.visible = false;
      game.scene.add(g);
      this.ghosts[id] = g;
    }
    this.target = null;
  }

  get pieceId() {
    return PIECES[this.piece].id;
  }

  // Construyendo o editando: el arma no se usa.
  get busy() {
    return this.active || !!this.editing;
  }

  // Geometría de una pieza (las editadas se montan con sus casillas).
  geoFor(type, mask) {
    const full = FULL_MASK[type];
    if (full === undefined || mask === undefined || mask === full) return this.geos[type];
    const key = type + mask;
    let g = editGeoCache.get(key);
    if (g) return g;
    const [cols, rows] = EDIT_GRID[type];
    const parts = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (!(mask & (1 << (j * cols + i)))) continue;
        let b;
        if (type === 'wall') b = new THREE.BoxGeometry(G / cols, H / rows, T).translate(-G / 2 + (i + 0.5) * (G / cols), -H / 2 + (j + 0.5) * (H / rows), 0);
        else b = new THREE.BoxGeometry(G / cols, T, G / rows).translate(-G / 2 + (i + 0.5) * (G / cols), 0, -G / 2 + (j + 0.5) * (G / rows));
        parts.push(b.toNonIndexed());
      }
    }
    g = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
    editGeoCache.set(key, g);
    return g;
  }

  get matId() {
    return MAT_ORDER[this.mat];
  }

  setActive(on) {
    if (!on && this.editing) this.endEdit(false);
    this.active = on;
    if (!on) for (const id in this.ghosts) this.ghosts[id].visible = false;
    this.game.combat.cancelUse();
    this.game.combat.reloading = false;
  }

  reset() {
    if (this.editing) this.endEdit(false);
    for (const p of [...this.pieces.values()]) this.remove(p, false);
    this.setActive(false);
  }

  // ---------------------------------------------------------- OBJETIVO
  levelBase(feetY, x, z) {
    // Alinea la altura con la estructura más cercana (si hay) para que las
    // piezas encajen; si no, la planta empieza a la altura de los pies.
    let anchor = null, best = 14;
    for (const p of this.pieces.values()) {
      const d = Math.abs(p.cx * G + G / 2 - x) + Math.abs(p.cz * G + G / 2 - z);
      if (d < best) {
        best = d;
        anchor = p.base;
      }
    }
    if (anchor === null) return feetY;
    const k = Math.floor((feetY - anchor + 0.35) / H);
    return anchor + k * H;
  }

  computeTarget() {
    const p = this.game.player;
    const yaw = p.yaw, pitch = p.pitch;
    const d = yawToDir(yaw);
    const [dx, dz] = DIRS[d];
    const cx = Math.floor(p.pos.x / G), cz = Math.floor(p.pos.z / G);
    let base = this.levelBase(p.pos.y, p.pos.x, p.pos.z);
    const id = this.pieceId;
    let t = { type: id, cx: cx + dx, cz: cz + dz, base, dir: d };
    if (id === 'wall') {
      t = { type: 'wall', cx, cz, base: pitch > 0.7 ? base + H : base, dir: d };
    } else if (id === 'floor') {
      if (pitch > 0.35) t = { type: 'floor', cx, cz, base: base + H, dir: d };
      else if (pitch < -1.0) t = { type: 'floor', cx, cz, base, dir: d };
    } else if (id === 'ramp') {
      // Si estamos sobre una rampa mirando en su sentido, la continuamos.
      for (const q of this.pieces.values()) {
        if (q.type === 'ramp' && q.cx === cx && q.cz === cz && q.dir === d && p.pos.y > q.base - 0.3 && p.pos.y < q.base + H + 0.3) {
          t = { type: 'ramp', cx: cx + dx, cz: cz + dz, base: q.base + H, dir: d };
          break;
        }
      }
    } else if (id === 'cone') {
      if (pitch > 0.2) t = { type: 'cone', cx, cz, base: base + H, dir: d };
    }
    t.key = this.key(t.type, t.cx, t.cz, t.base, t.dir);
    return t;
  }

  key(type, cx, cz, base, dir) {
    const lv = Math.round(base * 10);
    if (type === 'wall') {
      // Normaliza el borde para que el muro entre dos casillas sea único.
      let ex = cx, ez = cz, axis;
      if (dir === 0) axis = 'x';
      else if (dir === 2) { axis = 'x'; ez = cz + 1; }
      else if (dir === 3) axis = 'z';
      else { axis = 'z'; ex = cx + 1; }
      return `wall:${axis}:${ex}:${ez}:${lv}`;
    }
    return `${type}:${cx}:${cz}:${lv}`;
  }

  // Cajas de colisión de una pieza.
  boxesFor(t) {
    const x0 = t.cx * G, z0 = t.cz * G, b = t.base;
    const full = FULL_MASK[t.type];
    if (full !== undefined && t.mask !== undefined && t.mask !== full) return this.editedBoxes(t, x0, z0, b);
    if (t.type === 'wall') {
      const d = t.dir;
      if (d === 0) return [[x0, b, z0 - T / 2, x0 + G, b + H, z0 + T / 2]];
      if (d === 2) return [[x0, b, z0 + G - T / 2, x0 + G, b + H, z0 + G + T / 2]];
      if (d === 3) return [[x0 - T / 2, b, z0, x0 + T / 2, b + H, z0 + G]];
      return [[x0 + G - T / 2, b, z0, x0 + G + T / 2, b + H, z0 + G]];
    }
    if (t.type === 'floor') return [[x0, b - T, z0, x0 + G, b, z0 + G]];
    if (t.type === 'cone') {
      return [
        [x0, b - T, z0, x0 + G, b + 0.4, z0 + G],
        [x0 + 0.7, b, z0 + 0.7, x0 + G - 0.7, b + 0.9, z0 + G - 0.7],
        [x0 + 1.4, b, z0 + 1.4, x0 + G - 1.4, b + 1.4, z0 + G - 1.4],
      ];
    }
    // Rampa: escalones (la física sube escalones de hasta 0.55 m)
    const out = [];
    const sd = G / RAMP_STEPS, sh = H / RAMP_STEPS;
    for (let k = 0; k < RAMP_STEPS; k++) {
      const top = b + (k + 1) * sh;
      const a = k * sd, c = (k + 1) * sd;
      switch (t.dir) {
        case 0: out.push([x0, b, z0 + G - c, x0 + G, top, z0 + G - a]); break;
        case 2: out.push([x0, b, z0 + a, x0 + G, top, z0 + c]); break;
        case 1: out.push([x0 + a, b, z0, x0 + c, top, z0 + G]); break;
        default: out.push([x0 + G - c, b, z0, x0 + G - a, top, z0 + G]); break;
      }
    }
    return out;
  }

  // Cajas de colisión de una pieza editada (una por casilla en pie).
  editedBoxes(t, x0, z0, b) {
    const out = [];
    const [cols, rows] = EDIT_GRID[t.type];
    const cw = G / cols, rh = (t.type === 'wall' ? H : G) / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (!(t.mask & (1 << (j * cols + i)))) continue;
        if (t.type === 'floor') {
          out.push([x0 + i * cw, b - T, z0 + j * rh, x0 + (i + 1) * cw, b, z0 + (j + 1) * rh]);
          continue;
        }
        const y0 = b + j * rh, y1 = y0 + rh;
        const d = t.dir;
        if (d === 0 || d === 2) {
          const z = d === 0 ? z0 : z0 + G;
          out.push([x0 + i * cw, y0, z - T / 2, x0 + (i + 1) * cw, y1, z + T / 2]);
        } else {
          // muro girado 90°: la columna local +X va hacia -Z en el mundo
          const x = d === 3 ? x0 : x0 + G;
          out.push([x - T / 2, y0, z0 + G - (i + 1) * cw, x + T / 2, y1, z0 + G - i * cw]);
        }
      }
    }
    return out;
  }

  // Posición/rotación de la malla de una pieza.
  placeMesh(obj, t) {
    const cxw = t.cx * G + G / 2, czw = t.cz * G + G / 2;
    obj.rotation.set(0, 0, 0);
    if (t.type === 'wall') {
      const [dx, dz] = DIRS[t.dir];
      obj.position.set(cxw + (dx * G) / 2, t.base + H / 2, czw + (dz * G) / 2);
      obj.rotation.y = dx !== 0 ? Math.PI / 2 : 0;
    } else if (t.type === 'floor') {
      obj.position.set(cxw, t.base - T / 2, czw);
    } else if (t.type === 'cone') {
      obj.position.set(cxw, t.base + 0.8, czw);
    } else {
      obj.position.set(cxw, t.base + H / 2 + 0.12, czw);
      const ang = Math.atan2(H, G);
      // la geometría de la rampa recorre Z; inclinamos para que suba hacia dir
      obj.rotation.order = 'YXZ';
      obj.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][t.dir];
      obj.rotation.x = ang;
    }
  }

  canPlace(t, owner = this.game.player, matId = this.matId) {
    if (this.pieces.has(t.key)) return 'occupied';
    if (!this.game.infiniteMats && owner.mats[matId] < BUILD_COST) return 'nomats';
    // No encerrar a nadie dentro de una pieza
    const boxes = this.boxesFor(t);
    for (const c of this.game.characters()) {
      if (!c.alive || c.mode !== 'ground') continue;
      const p = c.pos;
      if (Math.abs(p.x - t.cx * G - G / 2) > 8 || Math.abs(p.z - t.cz * G - G / 2) > 8) continue;
      const h = c.height;
      for (const b of boxes) {
        if (p.x - R < b[3] && p.x + R > b[0] && p.y < b[4] - 0.01 && p.y + h > b[1] && p.z - R < b[5] && p.z + R > b[2]) {
          return 'player';
        }
      }
    }
    return 'ok';
  }

  // Coloca una pieza para un bot. kind: 'wall' | 'ramp' | 'cone' | 'floor'.
  // dir = dirección (0-3) hacia la que mira la pieza.
  placeFor(owner, kind, dir, opts = {}) {
    const [dx, dz] = DIRS[dir];
    const cx = Math.floor(owner.pos.x / G), cz = Math.floor(owner.pos.z / G);
    const base = this.levelBase(owner.pos.y, owner.pos.x, owner.pos.z);
    let t;
    if (kind === 'wall') t = { type: 'wall', cx, cz, base, dir };
    else if (kind === 'ramp') t = { type: 'ramp', cx: cx + dx, cz: cz + dz, base: opts.base ?? base, dir };
    else if (kind === 'cone') t = { type: 'cone', cx, cz, base: base + H, dir };
    else t = { type: 'floor', cx: cx + dx, cz: cz + dz, base, dir };
    t.key = this.key(t.type, t.cx, t.cz, t.base, t.dir);
    // material: el que más tenga
    let matId = 'wood';
    for (const m of MAT_ORDER) if (owner.mats[m] > owner.mats[matId]) matId = m;
    if (this.canPlace(t, owner, matId) !== 'ok') return null;
    return this.place(t, owner, matId);
  }

  place(t, owner = this.game.player, matId = this.matId, fromNet = false) {
    const def = MATERIALS[matId];
    if (t.mask === undefined && FULL_MASK[t.type] !== undefined) t.mask = FULL_MASK[t.type];
    const mesh = new THREE.Mesh(this.geoFor(t.type, t.mask), this.materials[matId]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.placeMesh(mesh, t);
    mesh.scale.setScalar(0.3);
    this.game.scene.add(mesh);
    const piece = {
      ...t, mat: matId, mesh, maxHp: def.hp, hp: def.hp * 0.3, buildT: 0, buildTime: def.buildTime, grow: 0,
      owner: owner.isPlayer ? 'me' : owner.isNet ? 'net' : 'bot',
    };
    piece.colliders = this.boxesFor(t).map((b) =>
      this.game.world.collision.add(b[0], b[1], b[2], b[3], b[4], b[5], { type: 'build', piece }),
    );
    this.pieces.set(t.key, piece);
    if (!fromNet && (!this.game.infiniteMats || !owner.isPlayer)) owner.mats[matId] = Math.max(0, owner.mats[matId] - BUILD_COST);
    if (owner.isPlayer) owner.stats.built++;
    if (owner.isPlayer || mesh.position.distanceTo(this.game.player.pos) < 40) this.game.audio.build();
    if (!fromNet) this.game.net?.sendBuild(piece);
    this.game.creative?.changed();
    return piece;
  }

  // Pieza colocada por otro jugador (partida online).
  netPlace(m) {
    if (this.pieces.has(m.key) || !this.geos[m.type] || !MATERIALS[m.mat]) return;
    const t = { type: m.type, cx: m.cx, cz: m.cz, base: m.base, dir: m.dir, key: m.key };
    const piece = this.place(t, NET_OWNER, m.mat, true);
    if (m.mask !== undefined && m.mask !== piece.mask) this.applyEdit(piece, m.mask, piece.dir, true);
  }

  // Edición hecha por otro jugador.
  netEdit(m) {
    const piece = this.pieces.get(m.key);
    if (!piece) return;
    if (this.editing?.piece === piece) this.endEdit(false);
    this.applyEdit(piece, m.mask, m.dir, true);
  }

  // ---------------------------------------------------------- EDICIÓN
  // Pieza propia a la que apunta el jugador (o null).
  findEditable() {
    const g = this.game;
    const p = g.player;
    if (p.mode !== 'ground' || !p.alive || p.vehicle || p.knocked) return null;
    const o = g.aimOrigin, d = g.aimDir;
    const hit = g.world.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 7 + g.aimSkip);
    const piece = hit?.box?.data?.type === 'build' ? hit.box.data.piece : null;
    if (!piece || !this.pieces.has(piece.key) || piece.type === 'cone') return null;
    if (piece.owner !== 'me' && !g.mode.creative) return null;
    return piece;
  }

  startEdit(piece) {
    const g = this.game;
    this.active = false;
    for (const id in this.ghosts) this.ghosts[id].visible = false;
    g.combat.cancelUse();
    g.combat.reloading = false;
    const grid = EDIT_GRID[piece.type];
    const ed = { piece, mask: piece.mask, dir: piece.dir, tiles: [], group: new THREE.Group(), paint: null, hover: -1 };
    if (grid) {
      const [cols, rows] = grid;
      const tw = G / cols, th = (piece.type === 'wall' ? H : G) / rows;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const geo = piece.type === 'wall' ? new THREE.BoxGeometry(tw - 0.06, th - 0.06, T + 0.1) : new THREE.BoxGeometry(tw - 0.06, T + 0.1, th - 0.06);
          const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.4, depthWrite: false }));
          if (piece.type === 'wall') m.position.set(-G / 2 + (i + 0.5) * tw, -H / 2 + (j + 0.5) * th, 0);
          else m.position.set(-G / 2 + (i + 0.5) * tw, 0, -G / 2 + (j + 0.5) * th);
          m.userData.idx = j * cols + i;
          ed.tiles.push(m);
          ed.group.add(m);
        }
      }
      this.placeMesh(ed.group, piece);
    } else {
      // Rampa: se muestra la rampa con la nueva dirección
      ed.ghost = new THREE.Mesh(this.geos.ramp, new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.45, depthWrite: false }));
      ed.group.add(ed.ghost);
      const t = { ...piece };
      this.placeMesh(ed.ghost, t);
      // casillas para girar: 4 flechas alrededor
      ed.tiles = [];
    }
    piece.mesh.visible = false;
    g.scene.add(ed.group);
    this.editing = ed;
    this.refreshEditTiles();
    g.hud.toast(piece.type === 'ramp'
      ? (g.touch ? 'Edición: dispara para girar la rampa · ✎ para confirmar' : 'Edición: clic para girar la rampa · F confirmar · clic der. reiniciar')
      : (g.touch ? 'Edición: toca/arrastra con disparar las casillas a quitar · ✎ confirmar' : 'Edición: marca las casillas a quitar · F confirmar · clic der. reiniciar'));
  }

  refreshEditTiles() {
    const ed = this.editing;
    if (!ed) return;
    for (const m of ed.tiles) {
      const on = !!(ed.mask & (1 << m.userData.idx));
      const hov = m.userData.idx === ed.hover;
      m.material.color.setHex(on ? (hov ? 0x9fd8ff : 0x5ab4ff) : (hov ? 0xff8080 : 0xff4040));
      m.material.opacity = on ? 0.4 : 0.22;
    }
  }

  endEdit(apply = true) {
    const ed = this.editing;
    if (!ed) return;
    this.editing = null;
    this.game.scene.remove(ed.group);
    for (const m of ed.tiles) {
      m.geometry.dispose();
      m.material.dispose();
    }
    ed.ghost?.material.dispose();
    const piece = ed.piece;
    if (!this.pieces.has(piece.key)) return;
    piece.mesh.visible = true;
    if (apply && (ed.mask !== piece.mask || ed.dir !== piece.dir)) {
      if (ed.mask === 0) return; // no se puede quitar todo
      this.applyEdit(piece, ed.mask, ed.dir);
      this.game.player.stats.edits++;
    }
  }

  // Cambia la forma de una pieza (casillas en pie o dirección de la rampa).
  applyEdit(piece, mask, dir, fromNet = false) {
    const col = this.game.world.collision;
    for (const c of piece.colliders) col.remove(c);
    piece.mask = mask;
    piece.dir = dir;
    piece.mesh.geometry = this.geoFor(piece.type, mask);
    piece.mesh.scale.setScalar(1);
    piece.grow = 1;
    this.placeMesh(piece.mesh, piece);
    piece.colliders = this.boxesFor(piece).map((b) => col.add(b[0], b[1], b[2], b[3], b[4], b[5], { type: 'build', piece }));
    if (piece.mesh.position.distanceTo(this.game.player.pos) < 40) this.game.audio.build();
    if (!fromNet) this.game.net?.sendBuildEdit(piece);
    this.game.creative?.changed();
  }

  updateEdit(input) {
    const g = this.game;
    const ed = this.editing;
    const p = g.player;
    if (!this.pieces.has(ed.piece.key) || p.mode !== 'ground' || !p.alive || p.vehicle || p.knocked
      || ed.piece.mesh.position.distanceTo(p.pos) > 10) {
      this.endEdit(false);
      return;
    }
    if (input.wasPressed('KeyF') || input.wasPressed('KeyQ')) {
      this.endEdit(true);
      return;
    }
    // Clic derecho: reiniciar (devuelve la pieza a su forma completa)
    if (input.mouseClicked(2)) {
      const full = FULL_MASK[ed.piece.type];
      if (full !== undefined) {
        ed.mask = full;
        this.endEdit(true);
      } else {
        ed.dir = ed.piece.dir;
        this.placeMesh(ed.ghost, { ...ed.piece, dir: ed.dir });
      }
      return;
    }
    if (ed.ghost) {
      if (input.mouseClicked(0)) {
        ed.dir = (ed.dir + 1) % 4;
        this.placeMesh(ed.ghost, { ...ed.piece, dir: ed.dir });
        g.audio.click?.();
      }
      return;
    }
    // Casilla a la que se apunta
    const ray = this.ray || (this.ray = new THREE.Raycaster());
    ray.set(g.aimOrigin, g.aimDir);
    ray.far = 12;
    const hit = ray.intersectObjects(ed.tiles, false)[0];
    ed.hover = hit ? hit.object.userData.idx : -1;
    if (!input.mouseDown(0)) ed.paint = null;
    else if (ed.hover >= 0) {
      const bit = 1 << ed.hover;
      if (ed.paint === null) ed.paint = ed.mask & bit ? 'remove' : 'add';
      if (ed.paint === 'remove') ed.mask &= ~bit;
      else ed.mask |= bit;
    }
    this.refreshEditTiles();
  }

  damage(piece, amount, fromNet = false) {
    if (!this.pieces.has(piece.key)) return;
    piece.hp -= amount;
    const net = this.game.net;
    if (net && !fromNet) net.sendBuildDamage(piece, amount);
    if (piece.hp <= 0) {
      this.remove(piece, true);
      if (net && !fromNet) net.sendBuildRemove(piece);
    }
  }

  remove(piece, fx) {
    for (const c of piece.colliders) this.game.world.collision.remove(c);
    this.game.scene.remove(piece.mesh);
    this.pieces.delete(piece.key);
    this.game.creative?.changed();
    if (fx) {
      this.game.effects.debris(piece.mesh.position.clone(), MATERIALS[piece.mat].hex);
      this.game.audio.breakPiece();
    }
  }

  update(dt, input) {
    // Animación de crecimiento y ganancia de vida mientras se construye.
    for (const p of this.pieces.values()) {
      if (p.grow < 1) {
        p.grow = Math.min(1, p.grow + dt * 5);
        p.mesh.scale.setScalar(0.3 + 0.7 * p.grow);
      }
      if (p.buildT < p.buildTime) {
        const step = Math.min(dt, p.buildTime - p.buildT);
        p.buildT += step;
        p.hp = Math.min(p.maxHp, p.hp + (p.maxHp * 0.7 * step) / p.buildTime);
      }
    }
    const player = this.game.player;
    if (this.editing) {
      this.updateEdit(input);
      this.editTarget = null;
      return;
    }
    if (player.mode !== 'ground' || !player.alive || player.vehicle || player.knocked) {
      if (this.active) this.setActive(false);
      this.editTarget = null;
      return;
    }
    // Editar: F mirando a una construcción propia
    this.editTarget = this.game.creative?.busy ? null : this.findEditable();
    if (input.wasPressed('KeyF') && this.editTarget) {
      this.startEdit(this.editTarget);
      return;
    }
    if (input.wasPressed('KeyQ') && !this.game.mode.build) {
      this.game.hud.toast('La construcción está desactivada en este modo');
      return;
    }
    if (input.wasPressed('KeyQ')) {
      this.setActive(!this.active);
      const help = this.game.touch ? 'toca la pieza abajo · dispara para colocar' : '1-4 pieza · clic der. material · Q salir';
      this.game.hud.toast(this.active ? `Modo construcción: ${help}` : 'Modo combate');
    }
    if (!this.active) return;
    for (let i = 0; i < PIECES.length; i++) if (input.wasPressed('Digit' + (i + 1))) this.piece = i;
    if (input.wheel) this.piece = (this.piece + (input.wheel > 0 ? 1 : -1) + PIECES.length) % PIECES.length;
    if (input.mouseClicked(2)) this.mat = (this.mat + 1) % MAT_ORDER.length;

    const t = this.computeTarget();
    const status = this.canPlace(t);
    this.target = t;
    this.status = status;
    for (const id in this.ghosts) this.ghosts[id].visible = id === t.type;
    const ghost = this.ghosts[t.type];
    this.placeMesh(ghost, t);
    this.ghostMat.color.setHex(status === 'ok' ? 0x5ab4ff : 0xff5050);

    this.cooldown -= dt;
    if (input.mouseDown(0) && this.cooldown <= 0) {
      if (status === 'ok') {
        this.place(t);
        this.cooldown = 0.12;
      } else if (input.mouseClicked(0)) {
        if (status === 'nomats') this.game.hud.toast(`Te faltan materiales (${BUILD_COST} de ${MATERIALS[this.matId].name}). Usa el pico en árboles, rocas o coches.`);
        this.cooldown = 0.2;
      }
    }
  }
}
