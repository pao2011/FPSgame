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
const NET_OWNER = { mats: { wood: 999, stone: 999, metal: 999 }, isPlayer: false, isNet: true, team: -1 };
export const FREE_OWNER = NET_OWNER;

// ------------------------------------------------------------- EDICIÓN
// Muros: rejilla 3×3 (bit = fila*3 + columna, fila 0 arriba). Suelos, rampas
// y techos: rejilla 2×2 alineada con el mundo (bit = fila*2 + columna; fila 0
// = norte, columna 0 = oeste). Un bit a 1 = casilla quitada.
const W = (cells) => cells.reduce((m, [r, c]) => m | (1 << (r * 3 + c)), 0);
export const WALL_PRESETS = [
  { name: 'Puerta', mask: W([[1, 1], [2, 1]]) },
  { name: 'Ventana', mask: W([[1, 1]]) },
  { name: 'Arco', mask: W([[2, 0], [2, 1], [2, 2], [1, 1]]) },
  { name: 'Arco grande', mask: W([[1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]]) },
  { name: 'Media pared', mask: W([[0, 0], [0, 1], [0, 2]]) },
  { name: 'Valla (muro bajo)', mask: W([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]) },
  { name: 'Puerta lateral', mask: W([[1, 0], [2, 0]]) },
  { name: 'Ventana doble', mask: W([[1, 0], [1, 2]]) },
];
const FULL = { wall: 511, floor: 15, ramp: 15, cone: 15 };
const EDIT_NAMES = new Map(WALL_PRESETS.map((p) => [p.mask, p.name]));

// Casillas de 2×2 a dirección de subida (2 casillas del mismo lado).
function sideOf(mask) {
  if (mask === 0b0011) return 0; // fila norte
  if (mask === 0b1100) return 2; // fila sur
  if (mask === 0b1010) return 1; // columna este
  if (mask === 0b0101) return 3; // columna oeste
  return -1;
}

// Columnas de un muro editado que forman una puerta (hueco de 1×2 abajo).
function doorColumns(mask) {
  const out = [];
  const off = (r, c) => c < 0 || c > 2 || (mask >> (r * 3 + c)) & 1;
  for (let c = 0; c < 3; c++) {
    const hole = off(1, c) && off(2, c) && !off(0, c);
    const nb = (cc) => cc < 0 || cc > 2 || (!off(1, cc) && !off(2, cc));
    if (hole && nb(c - 1) && nb(c + 1)) out.push(c);
  }
  return out;
}

export function editName(type, mask) {
  if (!mask) return '';
  if (type === 'wall') return EDIT_NAMES.get(mask) || 'Muro editado';
  if (type === 'floor') return 'Suelo con hueco';
  if (type === 'cone') return sideOf(mask) >= 0 ? 'Tejado inclinado' : 'Tejado plano';
  return 'Rampa girada';
}

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

// Sistema de construcción por rejilla al estilo Fortnite, con edición de
// piezas (puertas, ventanas, arcos, medias paredes, vallas, suelos con hueco,
// rampas giradas y tejados inclinados o planos).
export class BuildSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.piece = 0;
    this.mat = 0;
    this.rot = 0; // giro manual (R) para rampas y tejados
    this.cooldown = 0;
    this.pieces = new Map();
    this.editing = null;
    this.materials = {};
    for (const m of MAT_ORDER) this.materials[m] = new THREE.MeshLambertMaterial({ map: texture(m) });
    this.doorMat = new THREE.MeshLambertMaterial({ color: 0x7a4f2a });
    this.geoCache = new Map();

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
    // Rejilla de edición
    this.tileOn = new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
    this.tileOff = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    this.tileHover = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    this.overlay = new THREE.Group();
    this.overlay.visible = false;
    game.scene.add(this.overlay);
    this.raycaster = new THREE.Raycaster();
    this.target = null;
  }

  get pieceId() {
    return PIECES[this.piece].id;
  }

  get matId() {
    return MAT_ORDER[this.mat];
  }

  get settings() {
    return this.game.settings;
  }

  // Construyendo o editando: el arma no se usa.
  get busy() {
    return this.active || !!this.editing;
  }

  setActive(on) {
    this.active = on;
    if (!on) for (const id in this.ghosts) this.ghosts[id].visible = false;
    if (on) this.cancelEdit();
    this.game.combat.cancelUse();
    this.game.combat.reloading = false;
  }

  reset() {
    this.cancelEdit();
    for (const p of [...this.pieces.values()]) this.remove(p, false);
    this.setActive(false);
    this.rot = 0;
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
    const base = this.levelBase(p.pos.y, p.pos.x, p.pos.z);
    const id = this.pieceId;
    const rd = (d + this.rot) % 4;
    let t = { type: id, cx: cx + dx, cz: cz + dz, base, dir: rd, edit: 0 };
    if (id === 'wall') {
      t = { type: 'wall', cx, cz, base: pitch > 0.7 ? base + H : base, dir: d, edit: 0 };
    } else if (id === 'floor') {
      if (pitch > 0.35) t = { type: 'floor', cx, cz, base: base + H, dir: d, edit: 0 };
      else if (pitch < -1.0) t = { type: 'floor', cx, cz, base, dir: d, edit: 0 };
    } else if (id === 'ramp') {
      // Si estamos sobre una rampa mirando en su sentido, la continuamos.
      for (const q of this.pieces.values()) {
        if (q.type === 'ramp' && q.cx === cx && q.cz === cz && q.dir === d && p.pos.y > q.base - 0.3 && p.pos.y < q.base + H + 0.3) {
          t = { type: 'ramp', cx: cx + dx, cz: cz + dz, base: q.base + H, dir: d, edit: 0 };
          break;
        }
      }
    } else if (id === 'cone') {
      if (pitch > 0.2) t = { type: 'cone', cx, cz, base: base + H, dir: rd, edit: 0 };
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

  // ------------------------------------------------------- GEOMETRÍA
  // Transforma una caja local de muro (centrado en el origen, X a lo largo
  // del muro) a coordenadas del mundo según su dirección.
  wallBox(t, x0, y0, z0, x1, y1, z1) {
    const [dx, dz] = DIRS[t.dir];
    const cxw = t.cx * G + G / 2 + (dx * G) / 2, czw = t.cz * G + G / 2 + (dz * G) / 2;
    const yb = t.base + H / 2;
    if (dx === 0) return [cxw + x0, yb + y0, czw + z0, cxw + x1, yb + y1, czw + z1];
    // giro de 90°: x' = z, z' = -x
    return [cxw + z0, yb + y0, czw - x1, cxw + z1, yb + y1, czw - x0];
  }

  // Filas de casillas de un muro (tramos horizontales seguidos) en local.
  wallRuns(mask) {
    const out = [];
    const tw = G / 3, th = H / 3;
    for (let r = 0; r < 3; r++) {
      let c = 0;
      while (c < 3) {
        if ((mask >> (r * 3 + c)) & 1) { c++; continue; }
        let e = c;
        while (e + 1 < 3 && !((mask >> (r * 3 + e + 1)) & 1)) e++;
        out.push([-G / 2 + c * tw, H / 2 - (r + 1) * th, -T / 2, -G / 2 + (e + 1) * tw, H / 2 - r * th, T / 2]);
        c = e + 1;
      }
    }
    return out;
  }

  floorTiles(mask) {
    const out = [];
    for (let i = 0; i < 4; i++) {
      if ((mask >> i) & 1) continue;
      const xi = i % 2, zi = i >> 1;
      out.push([-G / 2 + xi * (G / 2), -G / 2 + zi * (G / 2), -G / 2 + (xi + 1) * (G / 2), -G / 2 + (zi + 1) * (G / 2)]);
    }
    return out;
  }

  coneVariant(t) {
    if (t.type !== 'cone' || !t.edit) return 'pyramid';
    return sideOf(t.edit) >= 0 ? 'slope' : 'flat';
  }

  // Cajas de colisión de una pieza (en coordenadas del mundo).
  boxesFor(t) {
    const x0 = t.cx * G, z0 = t.cz * G, b = t.base;
    if (t.type === 'wall') {
      const out = this.wallRuns(t.edit || 0).map((r) => this.wallBox(t, ...r));
      // puertas cerradas
      if (t.edit && !t.doorOpen) {
        for (const c of doorColumns(t.edit)) {
          out.push(this.wallBox(t, -G / 2 + c * (G / 3), -H / 2, -T / 4, -G / 2 + (c + 1) * (G / 3), -H / 2 + (2 * H) / 3, T / 4));
        }
      }
      return out;
    }
    if (t.type === 'floor') {
      const cxw = x0 + G / 2, czw = z0 + G / 2;
      return this.floorTiles(t.edit || 0).map(([ax, az, bx, bz]) => [cxw + ax, b - T, czw + az, cxw + bx, b, czw + bz]);
    }
    if (t.type === 'cone') {
      const v = this.coneVariant(t);
      if (v === 'flat') return [[x0, b - T, z0, x0 + G, b + 0.25, z0 + G]];
      if (v === 'slope') return this.stairBoxes(x0, z0, b, sideOf(t.edit), 1.6, 6);
      return [
        [x0, b - T, z0, x0 + G, b + 0.4, z0 + G],
        [x0 + 0.7, b, z0 + 0.7, x0 + G - 0.7, b + 0.9, z0 + G - 0.7],
        [x0 + 1.4, b, z0 + 1.4, x0 + G - 1.4, b + 1.4, z0 + G - 1.4],
      ];
    }
    // Rampa: escalones (la física sube escalones de hasta 0.55 m)
    return this.stairBoxes(x0, z0, b, t.dir, H, RAMP_STEPS);
  }

  stairBoxes(x0, z0, b, dir, height, steps) {
    const out = [];
    const sd = G / steps, sh = height / steps;
    for (let k = 0; k < steps; k++) {
      const top = b + (k + 1) * sh;
      const a = k * sd, c = (k + 1) * sd;
      switch (dir) {
        case 0: out.push([x0, b, z0 + G - c, x0 + G, top, z0 + G - a]); break;
        case 2: out.push([x0, b, z0 + a, x0 + G, top, z0 + c]); break;
        case 1: out.push([x0 + a, b, z0, x0 + c, top, z0 + G]); break;
        default: out.push([x0 + G - c, b, z0, x0 + G - a, top, z0 + G]); break;
      }
    }
    return out;
  }

  // Geometría (en caché) de una pieza editada.
  geoFor(t) {
    if (!t.edit) return this.geos[t.type];
    const key = `${t.type}:${t.type === 'cone' ? this.coneVariant(t) : t.edit}`;
    let g = this.geoCache.get(key);
    if (g) return g;
    if (t.type === 'wall') {
      const parts = this.wallRuns(t.edit).map(([a, b, c, d, e, f]) => new THREE.BoxGeometry(d - a, e - b, f - c).translate((a + d) / 2, (b + e) / 2, (c + f) / 2));
      g = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
    } else if (t.type === 'floor') {
      const parts = this.floorTiles(t.edit).map(([ax, az, bx, bz]) => new THREE.BoxGeometry(bx - ax, T, bz - az).translate((ax + bx) / 2, 0, (az + bz) / 2));
      g = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
    } else if (t.type === 'cone') {
      const v = this.coneVariant(t);
      if (v === 'flat') g = new THREE.BoxGeometry(G, T, G).translate(0, -0.7, 0);
      else g = new THREE.BoxGeometry(G, T, Math.hypot(G, 1.6));
    } else g = this.geos[t.type];
    this.geoCache.set(key, g);
    return g;
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
      if (this.coneVariant(t) === 'slope') {
        obj.rotation.order = 'YXZ';
        obj.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][sideOf(t.edit)];
        obj.rotation.x = Math.atan2(1.6, G);
      }
    } else {
      obj.position.set(cxw, t.base + H / 2 + 0.12, czw);
      const ang = Math.atan2(H, G);
      // la geometría de la rampa recorre Z; inclinamos para que suba hacia dir
      obj.rotation.order = 'YXZ';
      obj.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][t.dir];
      obj.rotation.x = ang;
    }
  }

  // Malla de una pieza: grupo con la pieza y, si tiene, las hojas de puerta.
  buildMesh(piece) {
    const group = piece.mesh || new THREE.Group();
    while (group.children.length) group.remove(group.children[0]);
    const mesh = new THREE.Mesh(this.geoFor(piece), this.materials[piece.mat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    this.placeMesh(group, piece);
    piece.doors = [];
    if (piece.type === 'wall' && piece.edit) {
      for (const c of doorColumns(piece.edit)) {
        const hinge = new THREE.Group();
        hinge.position.set(-G / 2 + c * (G / 3) + 0.04, -H / 2, 0);
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(G / 3 - 0.08, (2 * H) / 3 - 0.05, T * 0.5), this.doorMat);
        leaf.position.set((G / 3 - 0.08) / 2, (2 * H) / 6, 0);
        leaf.castShadow = true;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshLambertMaterial({ color: 0xd9b44a }));
        knob.position.set(G / 3 - 0.25, (2 * H) / 6 - 0.1, T * 0.35);
        hinge.add(leaf, knob);
        hinge.rotation.y = piece.doorOpen ? -Math.PI / 2 * 0.95 : 0;
        group.add(hinge);
        piece.doors.push({ hinge, col: c });
      }
    }
    return group;
  }

  setColliders(piece) {
    const col = this.game.world.collision;
    if (piece.colliders) for (const c of piece.colliders) col.remove(c);
    piece.colliders = this.boxesFor(piece).map((b) => col.add(b[0], b[1], b[2], b[3], b[4], b[5], { type: 'build', piece }));
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
    t.edit = 0;
    t.key = this.key(t.type, t.cx, t.cz, t.base, t.dir);
    // material: el que más tenga
    let matId = 'wood';
    for (const m of MAT_ORDER) if (owner.mats[m] > owner.mats[matId]) matId = m;
    if (this.canPlace(t, owner, matId) !== 'ok') return null;
    return this.place(t, owner, matId);
  }

  place(t, owner = this.game.player, matId = this.matId, fromNet = false) {
    const def = MATERIALS[matId];
    const piece = {
      ...t, edit: t.edit || 0, doorOpen: !!t.doorOpen, mat: matId, maxHp: def.hp, hp: def.hp * 0.3, buildT: 0, buildTime: def.buildTime, grow: 0,
      team: t.team ?? owner.team ?? -1, mesh: null, colliders: null,
      owner: owner.isPlayer ? 'me' : owner.isNet ? 'net' : 'bot',
    };
    piece.mesh = this.buildMesh(piece);
    piece.mesh.scale.setScalar(0.3);
    this.game.scene.add(piece.mesh);
    this.setColliders(piece);
    this.pieces.set(t.key, piece);
    if (!fromNet && (!this.game.infiniteMats || !owner.isPlayer)) owner.mats[matId] = Math.max(0, owner.mats[matId] - BUILD_COST);
    if (owner.isPlayer) owner.stats.built++;
    if (owner.isPlayer || piece.mesh.position.distanceTo(this.game.player.pos) < 40) this.game.audio.build();
    if (!fromNet) this.game.net?.sendBuild(piece);
    this.game.creative?.changed();
    return piece;
  }

  // Pieza colocada por otro jugador (partida online).
  netPlace(m) {
    if (this.pieces.has(m.key) || !this.geos[m.type] || !MATERIALS[m.mat]) return;
    const t = { type: m.type, cx: m.cx, cz: m.cz, base: m.base, dir: m.dir, key: m.key, edit: m.edit | 0, team: m.team ?? -1 };
    this.place(t, NET_OWNER, m.mat, true);
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
    if (this.editing?.piece === piece) this.cancelEdit();
    this.game.creative?.changed();
    if (fx) {
      this.game.effects.debris(piece.mesh.position.clone(), MATERIALS[piece.mat].hex);
      this.game.audio.breakPiece();
    }
  }

  // ------------------------------------------------------------ EDICIÓN
  canEdit(piece) {
    const p = this.game.player;
    return piece.team === -1 || piece.team === p.team || !!this.game.mode.creative;
  }

  // Aplica una edición (local o recibida por red).
  applyEdit(piece, mask, fromNet = false, dir = null) {
    if (piece.type === 'ramp') {
      const side = dir ?? sideOf(mask);
      if (side < 0) return;
      piece.dir = side;
      piece.edit = 0;
    } else {
      piece.edit = mask & FULL[piece.type];
      if (piece.edit === FULL[piece.type]) return;
    }
    piece.doorOpen = false;
    piece.mesh = this.buildMesh(piece);
    piece.mesh.scale.setScalar(Math.max(0.3, piece.grow ? 0.3 + 0.7 * piece.grow : 1));
    this.setColliders(piece);
    if (!fromNet) {
      this.game.net?.sendBuildEdit(piece);
      this.game.player.stats.edits = (this.game.player.stats.edits || 0) + 1;
    }
    this.game.creative?.changed();
  }

  // Edición hecha por otro jugador (m.bedit: mask = casillas quitadas).
  netEdit(m) {
    const piece = this.pieces.get(m.key);
    if (!piece) return;
    if (this.editing?.piece === piece) this.cancelEdit();
    this.applyEdit(piece, m.mask | 0, true, piece.type === 'ramp' ? m.dir & 3 : null);
  }

  // Compatibilidad: termina la edición aplicándola o no.
  endEdit(apply = true) {
    if (apply) this.confirmEdit();
    else this.cancelEdit();
  }

  setDoor(piece, open, fromNet = false) {
    if (!piece.doors?.length || piece.doorOpen === open) return;
    piece.doorOpen = open;
    this.setColliders(piece);
    if (piece.mesh.position.distanceTo(this.game.player.pos) < 40) this.game.audio.door();
    if (!fromNet) this.game.net?.sendBuildDoor(piece);
  }

  // Puerta más cercana delante del jugador (para el aviso "E Abrir puerta").
  findDoor(eye, forward, maxDist = 3.2) {
    let best = null, bd = maxDist;
    const v = new THREE.Vector3();
    for (const piece of this.pieces.values()) {
      if (!piece.doors?.length) continue;
      for (const d of piece.doors) {
        d.hinge.getWorldPosition(v);
        v.y += H / 3;
        const dist = v.distanceTo(eye);
        if (dist > bd) continue;
        const dot = v.sub(eye).normalize().dot(forward);
        if (dot < 0.5) continue;
        bd = dist;
        best = piece;
      }
    }
    return best;
  }

  // Pieza a la que apunta el jugador (para entrar en edición).
  aimedPiece(maxDist = 7) {
    const g = this.game;
    const hit = g.raycast(g.aimOrigin, g.aimDir, maxDist + g.aimSkip, g.aimSkip, g.player);
    const piece = hit?.box?.data?.type === 'build' ? hit.box.data.piece : null;
    return piece && this.pieces.has(piece.key) ? piece : null;
  }

  startEdit(piece) {
    if (!this.canEdit(piece)) {
      this.game.hud.toast('Solo puedes editar las construcciones de tu equipo');
      return;
    }
    const fromBuild = this.active;
    if (this.active) {
      this.active = false;
      for (const id in this.ghosts) this.ghosts[id].visible = false;
    }
    this.game.combat.cancelUse();
    this.game.combat.reloading = false;
    const n = piece.type === 'wall' ? 9 : 4;
    const mask = piece.type === 'ramp' ? 0 : piece.edit || 0;
    this.editing = { piece, mask, start: mask, n, drag: null, hover: -1, fromBuild };
    this.buildOverlay();
    this.game.audio.editTile();
  }

  buildOverlay() {
    const e = this.editing;
    const o = this.overlay;
    while (o.children.length) o.remove(o.children[0]);
    const piece = e.piece;
    e.tiles = [];
    if (piece.type === 'wall') {
      this.placeMesh(o, piece);
      const tw = G / 3, th = H / 3;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(tw - 0.08, th - 0.08), this.tileOn);
          m.position.set(-G / 2 + (c + 0.5) * tw, H / 2 - (r + 0.5) * th, 0);
          m.userData.bit = r * 3 + c;
          o.add(m);
          e.tiles.push(m);
        }
      }
      // caja fina que envuelve el muro para que se vea por ambos lados
      o.children.forEach((m) => (m.renderOrder = 3));
    } else {
      o.rotation.set(0, 0, 0);
      const y = piece.type === 'floor' ? piece.base + 0.06 : piece.type === 'ramp' ? piece.base + H / 2 + 0.3 : piece.base + 1.0;
      o.position.set(piece.cx * G + G / 2, y, piece.cz * G + G / 2);
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(G / 2 - 0.12, G / 2 - 0.12).rotateX(-Math.PI / 2), this.tileOn);
        m.position.set(-G / 4 + (i % 2) * (G / 2), 0, -G / 4 + (i >> 1) * (G / 2));
        m.userData.bit = i;
        m.renderOrder = 3;
        o.add(m);
        e.tiles.push(m);
      }
    }
    o.visible = true;
    this.paintOverlay();
  }

  paintOverlay() {
    const e = this.editing;
    for (const m of e.tiles) {
      const off = (e.mask >> m.userData.bit) & 1;
      m.material = m.userData.bit === e.hover ? this.tileHover : off ? this.tileOff : this.tileOn;
    }
  }

  cancelEdit() {
    if (!this.editing) return;
    this.editing = null;
    this.overlay.visible = false;
  }

  confirmEdit() {
    const e = this.editing;
    if (!e) return;
    const piece = e.piece;
    const full = FULL[piece.type];
    if (e.mask === full) this.game.hud.toast('No puedes quitar todas las casillas');
    else if (piece.type === 'ramp') {
      if (e.mask) {
        if (sideOf(e.mask) < 0) this.game.hud.toast('Rampa: selecciona las 2 casillas del lado hacia el que quieres que suba');
        else this.applyEdit(piece, e.mask);
      }
    } else if (e.mask !== (piece.edit || 0)) this.applyEdit(piece, e.mask);
    const back = e.fromBuild;
    this.cancelEdit();
    if (back) this.setActive(true);
  }

  updateEdit(input) {
    const e = this.editing;
    const g = this.game;
    const p = g.player;
    const piece = e.piece;
    if (!this.pieces.has(piece.key) || piece.mesh.position.distanceTo(p.eye) > 9) {
      this.cancelEdit();
      return;
    }
    // casilla bajo la mira
    this.raycaster.set(g.aimOrigin, g.aimDir);
    this.raycaster.far = 12;
    const hit = this.raycaster.intersectObjects(e.tiles, false)[0];
    const bit = hit ? hit.object.userData.bit : -1;
    if (bit !== e.hover) {
      e.hover = bit;
      this.paintOverlay();
    }
    const fire = input.held('fire');
    if (input.hit('fire') && bit >= 0) {
      e.drag = !((e.mask >> bit) & 1);
      e.mask ^= 1 << bit;
      g.audio.editTile();
      this.paintOverlay();
    } else if (fire && e.drag !== null && bit >= 0 && this.settings.editDragSelect) {
      const want = e.drag ? 1 : 0;
      if (((e.mask >> bit) & 1) !== want) {
        e.mask = want ? e.mask | (1 << bit) : e.mask & ~(1 << bit);
        g.audio.editTile();
        this.paintOverlay();
      }
    }
    if (!fire) e.drag = null;
    if (input.hit('editReset')) {
      e.mask = 0;
      this.paintOverlay();
    }
    // Presets de muro con las teclas de hueco (1-6) y 7-8
    if (piece.type === 'wall') {
      for (let i = 0; i < WALL_PRESETS.length; i++) {
        if ((i < 6 && input.hit('slot' + (i + 1))) || (i >= 6 && input.wasPressed('Digit' + (i + 1)))) {
          e.mask = WALL_PRESETS[i].mask;
          this.paintOverlay();
          this.confirmEdit();
          return;
        }
      }
    }
    if (input.hit('edit') || (this.settings.editConfirmOnRelease && input.up('edit'))) this.confirmEdit();
    else if (input.hit('build')) {
      this.cancelEdit();
      this.setActive(true);
    }
  }

  // ------------------------------------------------------------ PREFABRICADOS
  // Coloca una lista de piezas relativas a una casilla (modo creativo).
  placeRelative(list, cx, cz, base, dirOff = 0, matId = this.matId) {
    let n = 0;
    for (const q of list) {
      // giro de la plantilla en pasos de 90°
      let x = q.x, z = q.z;
      for (let k = 0; k < dirOff; k++) [x, z] = [-z, x];
      const t = { type: q.type, cx: cx + x, cz: cz + z, base: base + (q.y || 0) * H, dir: (q.dir + dirOff) % 4, edit: q.edit || 0 };
      t.key = this.key(t.type, t.cx, t.cz, t.base, t.dir);
      if (this.pieces.has(t.key)) continue;
      const piece = this.place(t, FREE_OWNER, q.mat || matId);
      piece.buildT = piece.buildTime;
      piece.hp = piece.maxHp;
      piece.team = this.game.player.team;
      n++;
    }
    return n;
  }

  serialize() {
    return [...this.pieces.values()].map((p) => ({ type: p.type, cx: p.cx, cz: p.cz, base: Math.round(p.base * 100) / 100, dir: p.dir, mat: p.mat, edit: p.edit }));
  }

  load(list) {
    let n = 0;
    for (const q of list) {
      if (!this.geos[q.type] || !MATERIALS[q.mat]) continue;
      const t = { type: q.type, cx: q.cx, cz: q.cz, base: q.base, dir: q.dir, edit: q.edit | 0 };
      t.key = this.key(t.type, t.cx, t.cz, t.base, t.dir);
      if (this.pieces.has(t.key)) continue;
      const piece = this.place(t, FREE_OWNER, q.mat);
      piece.buildT = piece.buildTime;
      piece.hp = piece.maxHp;
      piece.team = this.game.player.team;
      n++;
    }
    return n;
  }

  // ------------------------------------------------------------ UPDATE
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
      if (p.doors?.length) {
        const want = p.doorOpen ? -Math.PI / 2 * 0.95 : 0;
        for (const d of p.doors) d.hinge.rotation.y += (want - d.hinge.rotation.y) * Math.min(1, dt * 10);
      }
    }
    const g = this.game;
    const player = g.player;
    if (player.mode !== 'ground' || !player.alive || player.vehicle || player.knocked) {
      if (this.active) this.setActive(false);
      this.cancelEdit();
      this.editTarget = null;
      return;
    }
    if (this.editing) {
      this.editTarget = null;
      this.updateEdit(input);
      return;
    }
    // Entrar en edición (desde combate o construcción)
    const aimed = g.creative?.busy ? null : this.aimedPiece();
    this.editTarget = aimed && this.canEdit(aimed) ? aimed : null;
    if (input.hit('edit')) {
      if (aimed) {
        this.startEdit(aimed);
        return;
      }
      if (!g.mode.build) g.hud.toast('No hay ninguna construcción que editar');
    }
    const quick = ['pieceWall', 'pieceFloor', 'pieceRamp', 'pieceCone'].findIndex((a) => input.hit(a));
    if ((input.hit('build') || quick >= 0) && !g.mode.build) {
      g.hud.toast('La construcción está desactivada en este modo');
      return;
    }
    if (quick >= 0) {
      if (!this.active) this.setActive(true);
      this.piece = quick;
    } else if (input.hit('build')) {
      this.setActive(!this.active);
      const help = g.touch ? 'toca la pieza abajo · dispara para colocar · ✎ editar' : '1-4 pieza · clic der. material · R girar · F editar · Q salir';
      if (this.settings.showHints) g.hud.toast(this.active ? `Construcción: ${help}` : 'Modo combate');
    }
    if (!this.active) return;
    for (let i = 0; i < PIECES.length; i++) if (input.hit('slot' + (i + 1))) this.piece = i;
    if (input.wheel) this.piece = (this.piece + (input.wheel > 0 ? 1 : -1) + PIECES.length) % PIECES.length;
    if (input.hit('ads')) this.mat = (this.mat + 1) % MAT_ORDER.length;
    if (input.hit('reload')) this.rot = (this.rot + 1) % 4;

    const t = this.computeTarget();
    let status = this.canPlace(t);
    // Cambio automático de material si se acaba el elegido
    if (status === 'nomats' && this.settings.autoMaterial) {
      for (let k = 1; k < MAT_ORDER.length; k++) {
        const m = (this.mat + k) % MAT_ORDER.length;
        if (player.mats[MAT_ORDER[m]] >= BUILD_COST) {
          this.mat = m;
          status = this.canPlace(t);
          break;
        }
      }
    }
    this.target = t;
    this.status = status;
    const preview = this.settings.buildPreview !== false;
    for (const id in this.ghosts) this.ghosts[id].visible = preview && id === t.type;
    const ghost = this.ghosts[t.type];
    this.placeMesh(ghost, t);
    this.ghostMat.color.setHex(status === 'ok' ? 0x5ab4ff : 0xff5050);

    this.cooldown -= dt;
    const turbo = this.settings.turboBuild;
    const want = turbo ? input.held('fire') : input.hit('fire');
    if (want && this.cooldown <= 0) {
      if (status === 'ok') {
        this.place(t);
        this.cooldown = turbo ? Math.max(0.03, this.settings.turboDelay ?? 0.08) : 0;
      } else if (input.hit('fire')) {
        if (status === 'nomats') g.hud.toast(`Te faltan materiales (${BUILD_COST} de ${MATERIALS[this.matId].name}). Usa el pico en árboles, rocas o coches.`);
        this.cooldown = 0.2;
      }
    }
  }
}
