import * as THREE from 'three';
import { PAT } from './geobuilder.js';
import { BuildingCtx } from './buildings.js';

// Lugares bajo tierra: cuevas y trincheras. Se excavan en una rejilla de
// celdas de 4 m alineada con la del terreno (así el suelo del terreno queda
// exactamente plano dentro de los pasillos). Las celdas macizas son bloques
// de tierra/roca cuya cara superior queda a ras del suelo; las rampas son
// pendientes del propio terreno, de modo que la IA puede entrar y salir.
// La luz (antorchas, faroles, cristales) se hornea en el color de los
// vértices y, cerca del jugador, se refuerza con luces dinámicas.

export const CELL = 4;
export const SOLID = 0, OPEN = 1, ROOM = 2, RAMP = 3;
const OUT = -1;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const tmpC = new THREE.Color();
const tmpL = new THREE.Color();

export class Site {
  constructor(kind, name, ox, oz, nx, nz, H) {
    this.kind = kind;
    this.name = name;
    this.ox = ox;
    this.oz = oz;
    this.nx = nx;
    this.nz = nz;
    this.H = H;
    this.D = kind === 'cave' ? 4.4 : 1.9; // profundidad
    this.floor = H - this.D;
    this.clear = 3.4; // altura libre bajo el techo de la cueva
    this.L = kind === 'cave' ? 3 : 2; // largo (celdas) de las rampas de entrada
    this.cells = new Int8Array(nx * nz); // todo macizo al principio
    this.ramps = new Map(); // índice de celda -> { k, dir }
    this.lights = [];
    this.x = ox + (nx * CELL) / 2;
    this.z = oz + (nz * CELL) / 2;
    this.w = nx * CELL;
    this.d = nz * CELL;
  }

  get(i, j) {
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? OUT : this.cells[j * this.nx + i];
  }

  set(i, j, t) {
    if (i >= 0 && j >= 0 && i < this.nx && j < this.nz) this.cells[j * this.nx + i] = t;
  }

  contains(x, z, m = 0) {
    return x >= this.ox - m && x <= this.ox + this.w + m && z >= this.oz - m && z <= this.oz + this.d + m;
  }

  typeAt(x, z) {
    return this.get(Math.floor((x - this.ox) / CELL), Math.floor((z - this.oz) / CELL));
  }

  // ¿Está el punto bajo techo (dentro de una sala cubierta)?
  covered(x, y, z) {
    if (!this.contains(x, z) || y > this.H + 0.6) return false;
    return this.typeAt(x, z) === ROOM;
  }

  // ------------------------------------------------------------ TRAZADO
  // Rampa de entrada desde un lado (0 oeste, 1 este, 2 norte, 3 sur).
  // Devuelve la celda interior donde termina.
  addRamp(side, pos) {
    const L = this.L;
    for (let k = 0; k < L; k++) {
      const [i, j] = side === 0 ? [k, pos] : side === 1 ? [this.nx - 1 - k, pos] : side === 2 ? [pos, k] : [pos, this.nz - 1 - k];
      this.set(i, j, RAMP);
      this.ramps.set(j * this.nx + i, { k, dir: side });
    }
    return side === 0 ? [L, pos] : side === 1 ? [this.nx - 1 - L, pos] : side === 2 ? [pos, L] : [pos, this.nz - 1 - L];
  }

  // Pasillo en L entre dos celdas (sólo convierte celdas macizas).
  carve(i0, j0, i1, j1, type, xFirst = true) {
    const mark = (i, j) => {
      if (this.get(i, j) === SOLID) this.set(i, j, type);
    };
    let i = i0, j = j0;
    mark(i, j);
    const stepI = () => { while (i !== i1) { i += Math.sign(i1 - i); mark(i, j); } };
    const stepJ = () => { while (j !== j1) { j += Math.sign(j1 - j); mark(i, j); } };
    if (xFirst) { stepI(); stepJ(); } else { stepJ(); stepI(); }
  }

  nearestOf(i, j, types) {
    let best = null, bd = Infinity;
    for (let b = 0; b < this.nz; b++) {
      for (let a = 0; a < this.nx; a++) {
        if (!types.includes(this.get(a, b))) continue;
        const d = Math.abs(a - i) + Math.abs(b - j);
        if (d < bd) {
          bd = d;
          best = [a, b];
        }
      }
    }
    return best;
  }

  layoutCave(rng) {
    const m = this.L;
    const loI = m, hiI = this.nx - 1 - m, loJ = m, hiJ = this.nz - 1 - m;
    const ch = (this.chambers = []);
    for (let t = 0; t < 80 && ch.length < 4; t++) {
      const w = rng.int(2, 4), h = rng.int(2, 3);
      const i0 = rng.int(loI, hiI - w + 1), j0 = rng.int(loJ, hiJ - h + 1);
      if (ch.some((c) => i0 <= c.i0 + c.w && i0 + w >= c.i0 && j0 <= c.j0 + c.h && j0 + h >= c.j0)) continue;
      ch.push({ i0, j0, w, h, ci: i0 + (w >> 1), cj: j0 + (h >> 1) });
    }
    for (const c of ch) for (let j = c.j0; j < c.j0 + c.h; j++) for (let i = c.i0; i < c.i0 + c.w; i++) this.set(i, j, ROOM);
    for (let k = 1; k < ch.length; k++) this.carve(ch[k - 1].ci, ch[k - 1].cj, ch[k].ci, ch[k].cj, ROOM, rng.chance(0.5));
    // Dos entradas en lados distintos
    const sides = rng.shuffle([0, 1, 2, 3]).slice(0, 2);
    for (const s of sides) {
      const n = s < 2 ? this.nz : this.nx;
      const [ei, ej] = this.addRamp(s, rng.int(m, n - 1 - m));
      const c = ch.reduce((b, q) => (Math.abs(q.ci - ei) + Math.abs(q.cj - ej) < Math.abs(b.ci - ei) + Math.abs(b.cj - ej) ? q : b), ch[0]);
      this.carve(ei, ej, c.ci, c.cj, ROOM, s >= 2);
    }
    // Un tragaluz en la sala más grande
    const big = ch.reduce((b, q) => (q.w * q.h > b.w * b.h ? q : b), ch[0]);
    this.set(big.ci, big.cj, OPEN);
    big.sky = true;
  }

  layoutTrench(rng) {
    const m = this.L;
    const loI = m, hiI = this.nx - 1 - m, loJ = m, hiJ = this.nz - 1 - m;
    const clampJ = (j) => Math.max(loJ, Math.min(hiJ, j));
    // Dos líneas de fuego en zigzag unidas por trincheras de comunicación
    this.rows = [Math.round(this.nz * 0.3), Math.round(this.nz * 0.7)];
    for (const r of this.rows) {
      let cur = r;
      for (let i = loI; i <= hiI; i++) {
        this.set(i, cur, OPEN);
        if (i % 3 === 2 && i < hiI) {
          const nr = cur === r ? clampJ(r + (rng.chance(0.5) ? 1 : -1)) : r;
          this.set(i, nr, OPEN);
          cur = nr;
        }
      }
    }
    const cols = rng.shuffle(Array.from({ length: hiI - loI - 1 }, (_, k) => loI + 1 + k)).slice(0, 2);
    for (const c of cols) this.carve(c, this.rows[0], c, this.rows[1], OPEN);
    // Entradas por los cuatro lados
    for (let s = 0; s < 4; s++) {
      const n = s < 2 ? this.nz : this.nx;
      const pos = s < 2 ? this.rows[s] : rng.int(loI + 1, hiI - 1);
      const [ei, ej] = this.addRamp(s, Math.max(m, Math.min(n - 1 - m, pos)));
      const t = this.nearestOf(ei, ej, [OPEN]);
      if (t) this.carve(ei, ej, t[0], t[1], OPEN, s < 2);
    }
    // Refugios cubiertos (2x2) pegados a la trinchera
    this.dugouts = [];
    for (let t = 0; t < 200 && this.dugouts.length < 2; t++) {
      const i = rng.int(loI, hiI), j = rng.int(loJ, hiJ);
      if (this.get(i, j) !== OPEN) continue;
      const [di, dj] = rng.pick(DIRS);
      const a0 = di > 0 ? i + 1 : di < 0 ? i - 2 : i - (rng.chance(0.5) ? 1 : 0);
      const b0 = dj > 0 ? j + 1 : dj < 0 ? j - 2 : j - (rng.chance(0.5) ? 1 : 0);
      let ok = true;
      for (let b = b0 - 1; b <= b0 + 2 && ok; b++) {
        for (let a = a0 - 1; a <= a0 + 2 && ok; a++) {
          const inside = a >= a0 && a <= a0 + 1 && b >= b0 && b <= b0 + 1;
          const tt = this.get(a, b);
          if (inside && (tt !== SOLID || a < loI || a > hiI || b < loJ || b > hiJ)) ok = false;
          if (!inside && tt === RAMP) ok = false;
        }
      }
      if (!ok) continue;
      for (let b = b0; b <= b0 + 1; b++) for (let a = a0; a <= a0 + 1; a++) this.set(a, b, ROOM);
      this.dugouts.push({ i0: a0, j0: b0, door: [i, j] });
    }
  }

  // Fracción de profundidad (0 = superficie, 1 = suelo) de cada vértice.
  // Los vértices rodeados sólo de celdas macizas se quedan en superficie:
  // allí se ve el propio terreno (sin tapa ni costuras).
  finalize() {
    const { nx, nz } = this;
    const vf = (this.vf = new Float32Array((nx + 1) * (nz + 1)));
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        let f = -1;
        for (const [ci, cj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
          const t = this.get(ci, cj);
          if (t === OUT || t === SOLID) continue;
          let cf = 1;
          if (t === RAMP) {
            const r = this.ramps.get(cj * nx + ci);
            const outer = r.dir === 0 ? i === ci : r.dir === 1 ? i === ci + 1 : r.dir === 2 ? j === cj : j === cj + 1;
            cf = (outer ? r.k : r.k + 1) / this.L;
          }
          f = Math.max(f, cf);
        }
        vf[j * (nx + 1) + i] = Math.max(0, f);
      }
    }
  }

  // Profundidad (0..1) interpolada en cualquier punto: en los vértices de la
  // rejilla de 4 m es exacta; entre ellos (terreno HD de 2 m) es bilineal,
  // así los pasillos siguen planos y las rampas rectas.
  depthFrac(x, z) {
    const fx = Math.max(0, Math.min(this.nx, (x - this.ox) / CELL));
    const fz = Math.max(0, Math.min(this.nz, (z - this.oz) / CELL));
    const i = Math.min(this.nx - 1, Math.floor(fx)), j = Math.min(this.nz - 1, Math.floor(fz));
    const u = fx - i, v = fz - j, V = this.nx + 1, f = this.vf;
    const a = f[j * V + i], b = f[j * V + i + 1], c = f[(j + 1) * V + i], d = f[(j + 1) * V + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  // Altura del terreno dentro del sitio.
  vertexHeight(x, z) {
    return this.H - this.depthFrac(x, z) * this.D;
  }

  // ------------------------------------------------------------ LUZ
  ambient(t, y) {
    if (y > this.H - 0.05) return 1;
    const depth = Math.min(1, Math.max(0, (this.H - y) / this.D));
    if (this.kind === 'cave') {
      if (t === ROOM) return 0.17;
      if (t === OPEN) return 0.62;
      if (t === RAMP) return 1 - depth * 0.6;
      return 0.3;
    }
    if (t === ROOM) return 0.26;
    return 1 - depth * 0.4;
  }

  // Multiplicador de color (ambiente + luces) en un punto con normal n.
  lightAt(x, y, z, t, nx, ny, nz, out) {
    const a = this.ambient(t, y);
    out.setRGB(a, a, a);
    for (const L of this.lights) {
      const dx = L.x - x, dy = L.y - y, dz = L.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > L.range) continue;
      const k = (1 - d / L.range) ** 2 * L.bake * (0.35 + 0.65 * Math.max(0, (dx * nx + dy * ny + dz * nz) / (d || 1)));
      out.r += L.color.r * k;
      out.g += L.color.g * k;
      out.b += L.color.b * k;
    }
    out.r = Math.min(out.r, 1.6);
    out.g = Math.min(out.g, 1.6);
    out.b = Math.min(out.b, 1.6);
    return out;
  }

  // Color (sRGB) del suelo excavado, o false si el vértice está en superficie.
  floorColor(x, z, h, out) {
    if (this.depthFrac(x, z) <= 0.001) return false;
    // Celdas que tocan el punto (4 alrededor de un vértice, 1 o 2 si no)
    let t = SOLID;
    for (const [ox, oz] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]]) {
      const c = this.typeAt(x + ox, z + oz);
      if (c === OPEN || (c === RAMP && t !== OPEN) || (c === ROOM && t === SOLID)) t = c;
    }
    if (this.kind === 'cave') out.setRGB(0.34, 0.31, 0.28);
    else out.setRGB(0.42, 0.33, 0.22);
    this.lightAt(x, h + 0.2, z, t, 0, 1, 0, tmpL);
    out.r *= tmpL.r;
    out.g *= tmpL.g;
    out.b *= tmpL.b;
    return true;
  }

  // Hornea la luz en los vértices añadidos a `geo` desde `from`.
  bake(geo, from) {
    const P = geo.pos, N = geo.nor, Cc = geo.col;
    for (let v = from; v < P.length; v += 3) {
      const x = P[v], y = P[v + 1], z = P[v + 2];
      const t = this.typeAt(x + N[v] * 0.1, z + N[v + 2] * 0.1);
      this.lightAt(x, y, z, t, N[v], N[v + 1], N[v + 2], tmpL);
      Cc[v] *= tmpL.r;
      Cc[v + 1] *= tmpL.g;
      Cc[v + 2] *= tmpL.b;
    }
  }

  addLight(x, y, z, hex, opts = {}) {
    this.lights.push({
      x, y, z, color: new THREE.Color(hex), bake: opts.bake ?? 1.3, range: opts.range ?? 8,
      power: opts.power ?? 14, flicker: !!opts.flicker, phase: Math.random() * 10,
    });
  }
}

// ------------------------------------------------------------ GEOMETRÍA
// Cara plana subdividida (para que la luz horneada tenga resolución).
function face(geo, o, U, V, nu, nv, hex, inside, pat) {
  for (let a = 0; a < nu; a++) {
    for (let b = 0; b < nv; b++) {
      const p = (s, t) => [o[0] + U[0] * s + V[0] * t, o[1] + U[1] * s + V[1] * t, o[2] + U[2] * s + V[2] * t];
      const s0 = a / nu, s1 = (a + 1) / nu, t0 = b / nv, t1 = (b + 1) / nv;
      geo.poly([p(s0, t0), p(s1, t0), p(s1, t1), p(s0, t1)], hex, inside, 0, pat);
    }
  }
}

// Ruido de valor 3D (determinista) para deformar la roca de las cuevas.
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

// Deforma las paredes y techos (posición -> desplazamiento continuo, así las
// caras vecinas siguen unidas) y recalcula las normales de cada triángulo.
function roughen(geo, from, top) {
  const P = geo.pos, N = geo.nor;
  for (let v = from; v < P.length; v += 3) {
    const x = P[v], y = P[v + 1], z = P[v + 2];
    const k = Math.min(1, Math.max(0, (top - 0.15 - y) / 0.9)) * 0.38;
    if (k <= 0) continue;
    const f = 0.42;
    P[v] += (noise3(x * f, y * f, z * f) - 0.5) * 2 * k;
    P[v + 1] += (noise3(x * f + 31, y * f + 7, z * f) - 0.5) * 1.4 * k;
    P[v + 2] += (noise3(x * f, y * f + 13, z * f + 57) - 0.5) * 2 * k;
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let v = from; v < P.length; v += 9) {
    a.fromArray(P, v);
    b.fromArray(P, v + 3);
    c.fromArray(P, v + 6);
    n.subVectors(b, a).cross(c.sub(a)).normalize();
    if (n.x * N[v] + n.y * N[v + 1] + n.z * N[v + 2] < 0) n.negate();
    for (let q = 0; q < 9; q += 3) {
      N[v + q] = n.x;
      N[v + q + 1] = n.y;
      N[v + q + 2] = n.z;
    }
  }
}

// Construye el sitio: geometría (geo), brillos sin iluminar (glow), tapas a
// ras de suelo (capGeo, se dibujan con el material del terreno), colisiones
// y puntos de botín. Devuelve el contexto con los puntos.
export function buildSite(site, geo, glow, capGeo, collision, rng, terrain) {
  const ctx = new BuildingCtx(geo, collision, 0, 0, 0, 0);
  const start = geo.pos.length;
  const { ox, oz, nx, nz, H, floor: F } = site;
  const C = CELL;
  const cave = site.kind === 'cave';
  const wallHex = cave ? 0x6e675d : 0x7a5a38;
  const wallPat = cave ? PAT.plain : PAT.planks;
  const yc = F + site.clear;
  const cellBox = (i, j) => [ox + i * C, oz + j * C, ox + (i + 1) * C, oz + (j + 1) * C];
  const open = (t) => t === OPEN || t === ROOM || t === RAMP;
  const V = nx + 1;
  const capped = (i, j) => {
    const t = site.get(i, j);
    if (t === ROOM) return cave;
    if (t !== SOLID) return false;
    const f = site.vf;
    return !!(f[j * V + i] || f[j * V + i + 1] || f[(j + 1) * V + i] || f[(j + 1) * V + i + 1]);
  };
  // Tapa superior a ras del suelo, con un bisel hacia las celdas sin tapa
  // (donde se ve el terreno) para que no quede escalón. Mismo material y
  // mismos colores que el terreno: no se nota la costura.
  const capFace = (i, j) => {
    const [x0, z0, x1, z1] = cellBox(i, j);
    const from = capGeo.pos.length;
    const cap = 0x5f8f3e;
    const top = [(x0 + x1) / 2, H - 1, (z0 + z1) / 2];
    const y = H + 0.03, yb = H - 0.08, b = 0.5;
    const geo = capGeo;
    face(geo, [x0, y, z0], [C, 0, 0], [0, 0, C], 1, 1, cap, top, PAT.plain);
    const flat = (di, dj) => {
      const t = site.get(i + di, j + dj);
      return t !== OPEN && t !== RAMP && !(t === ROOM && cave) && !capped(i + di, j + dj);
    };
    if (flat(-1, 0)) geo.poly([[x0, y, z0], [x0, y, z1], [x0 - b, yb, z1], [x0 - b, yb, z0]], cap, top, 0, PAT.plain);
    if (flat(1, 0)) geo.poly([[x1, y, z0], [x1, y, z1], [x1 + b, yb, z1], [x1 + b, yb, z0]], cap, top, 0, PAT.plain);
    if (flat(0, -1)) geo.poly([[x0, y, z0], [x1, y, z0], [x1, yb, z0 - b], [x0, yb, z0 - b]], cap, top, 0, PAT.plain);
    if (flat(0, 1)) geo.poly([[x0, y, z1], [x1, y, z1], [x1, yb, z1 + b], [x0, yb, z1 + b]], cap, top, 0, PAT.plain);
    for (let v = from; v < geo.pos.length; v += 3) {
      terrain.colorAt(geo.pos[v], geo.pos[v + 2], H, 0, tmpC, true).convertSRGBToLinear();
      geo.col[v] = tmpC.r;
      geo.col[v + 1] = tmpC.g;
      geo.col[v + 2] = tmpC.b;
    }
  };

  // --- Paredes, techos y tapas superiores
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const t = site.get(i, j);
      const [x0, z0, x1, z1] = cellBox(i, j);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (t === SOLID) {
        const yb = F - 0.3;
        const inside = [cx, (yb + H) / 2, cz];
        const nv = Math.max(2, Math.ceil((H - yb) / 1.2));
        if (open(site.get(i + 1, j))) face(geo, [x1, yb, z0], [0, 0, C], [0, H - yb, 0], 4, nv, wallHex, inside, wallPat);
        if (open(site.get(i - 1, j))) face(geo, [x0, yb, z0], [0, 0, C], [0, H - yb, 0], 4, nv, wallHex, inside, wallPat);
        if (open(site.get(i, j + 1))) face(geo, [x0, yb, z1], [C, 0, 0], [0, H - yb, 0], 4, nv, wallHex, inside, wallPat);
        if (open(site.get(i, j - 1))) face(geo, [x0, yb, z0], [C, 0, 0], [0, H - yb, 0], 4, nv, wallHex, inside, wallPat);
        // Tapa sólo si el terreno de debajo baja en alguna esquina
        if (capped(i, j)) capFace(i, j);
      } else if (t === ROOM && cave) {
        face(geo, [x0, yc, z0], [C, 0, 0], [0, 0, C], 3, 3, 0x5d574f, [cx, yc + 0.3, cz], PAT.plain);
        capFace(i, j);
        const inside = [cx, (yc + H) / 2, cz];
        for (const [di, dj] of DIRS) {
          const n = site.get(i + di, j + dj);
          if (n !== OPEN && n !== RAMP) continue;
          if (di) face(geo, [di > 0 ? x1 : x0, yc, z0], [0, 0, C], [0, H - yc, 0], 4, 1, wallHex, inside, wallPat);
          else face(geo, [x0, yc, dj > 0 ? z1 : z0], [C, 0, 0], [0, H - yc, 0], 4, 1, wallHex, inside, wallPat);
        }
      } else if (t === ROOM) {
        // Refugio de trinchera: techo de troncos con sacos encima
        ctx.box(x0 - 0.35, H + 0.15, z0 - 0.35, x1 + 0.35, H + 0.5, z1 + 0.35, 0x6b4a2b);
        if (rng.chance(0.6)) ctx.box(x0 + 0.5, H + 0.5, z0 + 0.6, x1 - 0.5, H + 0.85, z1 - 0.6, 0xb8a67a);
      }
    }
  }
  if (cave) roughen(geo, start, H);
  // --- Colisiones: filas de bloques macizos y de techos
  for (let j = 0; j < nz; j++) {
    for (const [type, y0, y1] of [[SOLID, F - 0.6, H], ...(cave ? [[ROOM, yc, H]] : [])]) {
      let i = 0;
      while (i < nx) {
        if (site.get(i, j) !== type) {
          i++;
          continue;
        }
        let e = i;
        while (e + 1 < nx && site.get(e + 1, j) === type) e++;
        collision.add(ox + i * C, y0, oz + j * C, ox + (e + 1) * C, y1, oz + (j + 1) * C, { type: 'building' });
        i = e + 1;
      }
    }
  }

  if (cave) decorateCave(site, ctx, glow, rng, cellBox);
  else decorateTrench(site, ctx, glow, rng, cellBox);
  site.bake(geo, start);
  return ctx;
}

// Cristal brillante (sin iluminar) en `glow`.
function crystal(glow, x, y, z, s, h, tilt, yaw, hex) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y + h * 0.45, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, tilt * 0.6)),
    new THREE.Vector3(s, h, s),
  );
  glow.geometry(new THREE.OctahedronGeometry(1, 0), hex, m);
}

function decorateCave(site, ctx, glow, rng, cellBox) {
  const { H, floor: F } = site;
  const C = CELL;
  const yc = F + site.clear;
  const geo = ctx.geo;
  const rock = 0x7a7266;
  const cone = new THREE.ConeGeometry(1, 1, 6);
  const CRYSTALS = [0x5ff2ff, 0xc86bff, 0x7dff9a];
  for (const ch of site.chambers) {
    const x0 = site.ox + ch.i0 * C, z0 = site.oz + ch.j0 * C;
    const x1 = x0 + ch.w * C, z1 = z0 + ch.h * C;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const corners = rng.shuffle([[x0 + 1.1, z0 + 1.1], [x1 - 1.1, z0 + 1.1], [x0 + 1.1, z1 - 1.1], [x1 - 1.1, z1 - 1.1]]);
    // Cofre en una esquina, cristales en otra, estalagmitas en el resto
    const [chx, chz] = corners[0];
    ctx.spot(ctx.chestSpots, chx, F, chz, cx, cz);
    if (ch.w * ch.h >= 6) ctx.spot(ctx.chestSpots, corners[3][0], F, corners[3][1], cx, cz);
    const [kx, kz] = corners[1];
    const hex = rng.pick(CRYSTALS);
    for (let k = 0; k < 6; k++) {
      crystal(glow, kx + rng.float(-0.7, 0.7), F, kz + rng.float(-0.7, 0.7), rng.float(0.12, 0.28), rng.float(0.5, 1.5), rng.float(-0.5, 0.5), rng.float(0, 6), hex);
    }
    site.addLight(kx, F + 0.9, kz, hex, { bake: 1.6, range: 9, power: 12 });
    for (const [sx, sz] of corners.slice(2, ch.w * ch.h >= 6 ? 3 : 4)) {
      for (let k = 0; k < 3; k++) {
        const h = rng.float(0.5, 1.7), r = h * rng.float(0.22, 0.32);
        const x = sx + rng.float(-0.6, 0.6), z = sz + rng.float(-0.6, 0.6);
        ctx.geometry(cone, rock, x, F + h / 2 - 0.05, z, r, h, r);
        if (h > 1) ctx.colliderOnly(x - r * 0.5, F, z - r * 0.5, x + r * 0.5, F + h * 0.8, z + r * 0.5);
      }
    }
    // Estalactitas
    for (let k = 0; k < ch.w * ch.h; k++) {
      const x = rng.float(x0 + 0.5, x1 - 0.5), z = rng.float(z0 + 0.5, z1 - 0.5);
      if (ch.sky && Math.abs(x - (site.ox + ch.ci * C + C / 2)) < C * 0.7 && Math.abs(z - (site.oz + ch.cj * C + C / 2)) < C * 0.7) continue;
      const h = rng.float(0.4, 1.3), r = h * 0.2;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, yc - h / 2 + 0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI), new THREE.Vector3(r, h, r));
      geo.geometry(cone, 0x6a6359, m);
    }
    ctx.spot(ctx.lootSpots, cx + rng.float(-1, 1), F, cz + rng.float(-1, 1));
    if (ch.sky) site.addLight(site.ox + ch.ci * C + C / 2, F + 2.5, site.oz + ch.cj * C + C / 2, 0xbfe4ff, { bake: 0.9, range: 9, power: 0 });
  }
  // Antorchas en las paredes de túneles y salas
  let torches = 0;
  for (let t = 0; t < 400 && torches < 5 + site.chambers.length; t++) {
    const i = rng.int(0, site.nx - 1), j = rng.int(0, site.nz - 1);
    if (site.get(i, j) !== ROOM) continue;
    const [di, dj] = rng.pick(DIRS);
    if (site.get(i + di, j + dj) !== SOLID) continue;
    const [x0, z0, x1, z1] = cellBox(i, j);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const wx = di ? (di > 0 ? x1 - 0.4 : x0 + 0.4) : cx, wz = dj ? (dj > 0 ? z1 - 0.4 : z0 + 0.4) : cz;
    if (site.lights.some((L) => Math.hypot(L.x - wx, L.z - wz) < 6)) continue;
    const y = F + 2.1;
    ctx.box(wx - 0.05, y - 0.55, wz - 0.05, wx + 0.05, y, wz + 0.05, 0x5a3d22, false);
    ctx.box(di ? Math.min(wx, wx + di * 0.45) : wx - 0.03, y - 0.42, dj ? Math.min(wz, wz + dj * 0.45) : wz - 0.03, di ? Math.max(wx, wx + di * 0.45) : wx + 0.03, y - 0.36, dj ? Math.max(wz, wz + dj * 0.45) : wz + 0.03, 0x3a3d42, false);
    ctx.box(wx - 0.09, y - 0.1, wz - 0.09, wx + 0.09, y, wz + 0.09, 0x3a3d42, false);
    glow.box(wx - 0.08, y, wz - 0.08, wx + 0.08, y + 0.22, wz + 0.08, 0xffa040, 0);
    site.addLight(wx - di * 0.4, y + 0.2, wz - dj * 0.4, 0xff9a40, { bake: 1.5, range: 8.5, power: 16, flicker: true });
    torches++;
    if (torches % 2) ctx.spot(ctx.ammoSpots, cx + rng.float(-0.8, 0.8), F, cz + rng.float(-0.8, 0.8), wx, wz);
  }
  // Rocas sobre la cueva (parece un afloramiento rocoso) y en la boca
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const nearRamp = (i, j) => DIRS.some(([di, dj]) => site.get(i + di, j + dj) === RAMP) || site.get(i, j) === RAMP;
  for (let k = 0; k < Math.round(site.nx * site.nz * 0.3); k++) {
    const i = rng.int(0, site.nx - 1), j = rng.int(0, site.nz - 1);
    const t = site.get(i, j);
    if (t === RAMP || t === OPEN || nearRamp(i, j)) continue;
    const sx = rng.float(1.0, 2.6), sy = rng.float(0.7, 2.2), sz = rng.float(1.0, 2.6);
    const [x0, z0, x1, z1] = cellBox(i, j);
    const x = rng.float(x0 + sx * 0.6, x1 - sx * 0.6), z = rng.float(z0 + sz * 0.6, z1 - sz * 0.6);
    if (!(x1 - x0 > sx * 1.2) || !(z1 - z0 > sz * 1.2)) continue;
    ctx.geometry(ico, rng.pick([0x8b8579, 0x9b968b, 0x7d776c]), x, H + sy * 0.35, z, sx, sy, sz, rng.float(0, 6));
    ctx.colliderOnly(x - sx * 0.7, H, z - sz * 0.7, x + sx * 0.7, H + sy * 1.1, z + sz * 0.7);
  }
}

function decorateTrench(site, ctx, glow, rng, cellBox) {
  const { H, floor: F, nx, nz } = site;
  const C = CELL;
  const usedEdge = new Set();
  // Pasarelas de tablones en el fondo
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (site.get(i, j) !== OPEN) continue;
      const [x0, z0, x1, z1] = cellBox(i, j);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const alongX = site.get(i - 1, j) !== SOLID || site.get(i + 1, j) !== SOLID;
      if (alongX) ctx.box(x0, F - 0.03, cz - 0.6, x1, F + 0.06, cz + 0.6, 0x8a6440, false, 0.15);
      else ctx.box(cx - 0.6, F - 0.03, z0, cx + 0.6, F + 0.06, z1, 0x8a6440, false, 0.15);
    }
  }
  // Escaleras para salir y banquetas de tiro
  let ladders = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (site.get(i, j) !== OPEN) continue;
      const [x0, z0, x1, z1] = cellBox(i, j);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (const [di, dj] of DIRS) {
        if (site.get(i + di, j + dj) !== SOLID) continue;
        const key = `${i},${j},${di},${dj}`;
        if (ladders < 6 && rng.chance(0.08)) {
          if (di) ctx.ladderVisual(di > 0 ? x1 - 0.12 : x0 + 0.12, cz + rng.float(-1, 1), F, H, 'z');
          else ctx.ladderVisual(cx + rng.float(-1, 1), dj > 0 ? z1 - 0.12 : z0 + 0.12, F, H, 'x');
          usedEdge.add(key);
          ladders++;
        } else if (dj && rng.chance(0.35)) {
          // banqueta de tiro (0.5 m) para asomarse por encima del parapeto
          const z = dj > 0 ? z1 : z0;
          ctx.box(x0 + 0.3, F, Math.min(z, z - dj * 0.8), x1 - 0.3, F + 0.5, Math.max(z, z - dj * 0.8), 0x6b4a2b);
        }
      }
    }
  }
  // Sacos terreros en el borde de la trinchera (parapeto)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (site.get(i, j) !== SOLID) continue;
      const [x0, z0, x1, z1] = cellBox(i, j);
      for (const [di, dj] of DIRS) {
        if (site.get(i + di, j + dj) !== OPEN || usedEdge.has(`${i + di},${j + dj},${-di},${-dj}`) || !rng.chance(0.6)) continue;
        const a = rng.float(0.2, 0.8), b = rng.float(3.2, 3.8);
        if (di) {
          const x = di > 0 ? x1 : x0;
          const xa = Math.min(x, x - di * 0.7), xb = Math.max(x, x - di * 0.7);
          ctx.box(xa, H, z0 + a, xb, H + 0.55, z0 + b, 0xb8a67a);
          ctx.box(xa + 0.08, H + 0.55, z0 + a + 0.1, xb - 0.08, H + 0.68, z0 + b - 0.1, 0xa8966a, false);
        } else {
          const z = dj > 0 ? z1 : z0;
          const za = Math.min(z, z - dj * 0.7), zb = Math.max(z, z - dj * 0.7);
          ctx.box(x0 + a, H, za, x0 + b, H + 0.55, zb, 0xb8a67a);
          ctx.box(x0 + a + 0.1, H + 0.55, za + 0.08, x0 + b - 0.1, H + 0.68, zb - 0.08, 0xa8966a, false);
        }
      }
    }
  }
  // Faroles en postes por las trincheras
  let lamps = 0;
  for (let t = 0; t < 400 && lamps < 7; t++) {
    const i = rng.int(0, nx - 1), j = rng.int(0, nz - 1);
    if (site.get(i, j) !== OPEN) continue;
    const [di, dj] = rng.pick(DIRS);
    if (site.get(i + di, j + dj) !== SOLID) continue;
    const [x0, z0, x1, z1] = cellBox(i, j);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const px = di ? (di > 0 ? x1 - 0.3 : x0 + 0.3) : cx + 1.2, pz = dj ? (dj > 0 ? z1 - 0.3 : z0 + 0.3) : cz + 1.2;
    if (site.lights.some((L) => Math.hypot(L.x - px, L.z - pz) < 9)) continue;
    ctx.box(px - 0.06, F, pz - 0.06, px + 0.06, F + 1.75, pz + 0.06, 0x5a3d22, false);
    ctx.box(px - 0.13, F + 1.75, pz - 0.13, px + 0.13, F + 1.8, pz + 0.13, 0x3a3d42, false);
    glow.box(px - 0.11, F + 1.5, pz - 0.11, px + 0.11, F + 1.75, pz + 0.11, 0xffc070, 0);
    site.addLight(px, F + 1.6, pz, 0xffb060, { bake: 1.2, range: 8, power: 12, flicker: true });
    lamps++;
  }
  // Refugios: lámpara colgada, cofre y munición
  for (const d of site.dugouts) {
    const x0 = site.ox + d.i0 * C, z0 = site.oz + d.j0 * C;
    const cx = x0 + C, cz = z0 + C;
    glow.box(cx - 0.12, H - 0.15, cz - 0.12, cx + 0.12, H + 0.1, cz + 0.12, 0xffd080, 0);
    ctx.box(cx - 0.02, H + 0.1, cz - 0.02, cx + 0.02, H + 0.15, cz + 0.02, 0x3a3d42, false);
    site.addLight(cx, H - 0.3, cz, 0xffc070, { bake: 1.5, range: 9, power: 14 });
    ctx.spot(ctx.chestSpots, x0 + 1, F, z0 + 1, cx, cz);
    ctx.spot(ctx.chestSpots, x0 + 2 * C - 1, F, z0 + 2 * C - 1, cx, cz);
    ctx.spot(ctx.ammoSpots, x0 + 2 * C - 1, F, z0 + 1, cx, cz);
    ctx.box(x0 + 0.4, F, z0 + 2 * C - 1.2, x0 + 2.2, F + 0.45, z0 + 2 * C - 0.4, 0x6b4a2b);
  }
  // Más botín por las trincheras
  for (let k = 0, n = 0; k < 200 && n < 5; k++) {
    const i = rng.int(0, nx - 1), j = rng.int(0, nz - 1);
    if (site.get(i, j) !== OPEN) continue;
    const [x0, z0] = cellBox(i, j);
    ctx.spot(n < 2 ? ctx.chestSpots : n < 3 ? ctx.ammoSpots : ctx.lootSpots, x0 + C / 2 + rng.float(-1, 1), F + 0.06, z0 + C / 2 + rng.float(-1, 1), x0 + C / 2, z0 + C / 2);
    n++;
  }
}

// Halos de luz (sprites aditivos) para los puntos de luz.
function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildHalos(sites) {
  const pos = [], col = [];
  for (const s of sites) {
    for (const L of s.lights) {
      if (!L.power) continue;
      pos.push(L.x, L.y, L.z);
      col.push(L.color.r, L.color.g, L.color.b);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 2.2, map: haloTexture(), vertexColors: true, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const p = new THREE.Points(g, m);
  p.name = 'underground-halos';
  return p;
}

// Luces dinámicas: un puñado de PointLight que se asignan a las fuentes de
// luz subterráneas más cercanas a la cámara (en calidad baja/móvil sólo se
// usa la luz horneada).
export class UndergroundFx {
  constructor(scene, sites, quality) {
    this.sources = sites.flatMap((s) => s.lights.filter((L) => L.power > 0));
    this.pool = [];
    this.pickT = 0;
    this.t = 0;
    if (!this.sources.length || quality === 'baja' || quality === 'movil') return;
    for (let k = 0; k < 3; k++) {
      const L = new THREE.PointLight(0xffffff, 0, 13, 2);
      scene.add(L);
      this.pool.push({ L, src: null });
    }
  }

  update(dt, cam) {
    if (!this.pool.length) return;
    this.t += dt;
    if ((this.pickT -= dt) <= 0) {
      this.pickT = 0.3;
      const near = [];
      for (const s of this.sources) {
        const d = Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z);
        if (d < 42) near.push({ s, d });
      }
      near.sort((a, b) => a.d - b.d);
      const want = near.slice(0, this.pool.length).map((n) => n.s);
      for (const e of this.pool) if (e.src && !want.includes(e.src)) e.src = null;
      for (const s of want) {
        if (this.pool.some((e) => e.src === s)) continue;
        const e = this.pool.find((q) => !q.src);
        e.src = s;
        e.L.position.set(s.x, s.y, s.z);
        e.L.color.copy(s.color);
        e.L.intensity = 0;
      }
    }
    for (const e of this.pool) {
      const s = e.src;
      let target = 0;
      if (s) {
        const d = Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z);
        const fade = 1 - Math.min(1, Math.max(0, (d - 26) / 14));
        const fl = s.flicker ? 0.82 + 0.1 * Math.sin(this.t * 13 + s.phase) + 0.08 * Math.sin(this.t * 31 + s.phase * 2) : 1;
        target = s.power * fade * fl;
      }
      e.L.intensity += (target - e.L.intensity) * Math.min(1, dt * 10);
    }
  }
}
