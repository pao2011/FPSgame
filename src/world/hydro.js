import * as THREE from 'three';
import { smoothstep } from '../core/rng.js';

// Ríos y lagos de interior. Cada masa de agua tiene su propia superficie
// (los lagos están por encima del nivel del mar y los ríos bajan hasta la
// costa). El terreno se excava con un perfil común: lecho bajo el agua,
// orilla con pendiente suave y un pequeño dique alrededor para que el agua
// nunca "flote" por encima de la tierra.

const BANK = 30; // alcance máximo de las orillas excavadas (m)
const LAKE_SHORE = 5; // la malla del lago llega 5 m más allá de la orilla
const RIVER_SHORE = 3.5;

// Altura del terreno excavado a una distancia `e` del borde del agua
// (e < 0: dentro del agua). s = superficie, D = profundidad, ramp = distancia
// desde la orilla hasta la profundidad máxima.
function carve(e, s, D, ramp) {
  if (e < 0) return s - 0.35 - D * smoothstep(0, ramp, -e);
  return s - 0.35 + e * 0.38 + (e > 6 ? (e - 6) * (e - 6) * 0.06 : 0);
}

// Dique: la tierra junto al agua queda al menos 0.6 m por encima de ella.
function levee(e, s) {
  return s + 0.6 - Math.max(0, e - 3) * 0.45;
}

export class Hydro {
  constructor() {
    this.lakes = [];
    this.rivers = [];
    this.cell = 32;
    this.grid = new Map();
    this._best = [];
  }

  // ------------------------------------------------------------ LAGOS
  addLake(l) {
    this.lakes.push(l);
    return l;
  }

  lakeShoreR(l, x, z) {
    const a = Math.atan2(z - l.z, x - l.x);
    return l.R * (1 + 0.16 * Math.sin(2 * a + l.p1) + 0.08 * Math.sin(3 * a + l.p2));
  }

  // Distancia (m) al borde del lago: negativa dentro.
  lakeEdge(l, x, z) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d > l.R * 1.3 + BANK) return Infinity;
    return d - this.lakeShoreR(l, x, z);
  }

  // ------------------------------------------------------------ RÍOS
  // pts: [[x, z]], s: superficie por punto, hw: medio ancho por punto.
  addRiver(r) {
    r.index = this.rivers.length;
    this.rivers.push(r);
    const c = this.cell;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const m = Math.max(r.hw[i], r.hw[i + 1]) + BANK;
      const seg = { r, i, ax, az, bx, bz };
      for (let gx = Math.floor((Math.min(ax, bx) - m) / c); gx <= Math.floor((Math.max(ax, bx) + m) / c); gx++) {
        for (let gz = Math.floor((Math.min(az, bz) - m) / c); gz <= Math.floor((Math.max(az, bz) + m) / c); gz++) {
          const k = gx * 100000 + gz;
          let l = this.grid.get(k);
          if (!l) this.grid.set(k, (l = []));
          l.push(seg);
        }
      }
    }
    return r;
  }

  // Punto más cercano de cada río a (x, z): rellena this._best[ríoIdx] con
  // { e, s, hw, d, tx, tz } (e = distancia al borde del agua).
  _rivers(x, z) {
    const best = this._best;
    for (let i = 0; i < this.rivers.length; i++) best[i] = null;
    const l = this.grid.get(Math.floor(x / this.cell) * 100000 + Math.floor(z / this.cell));
    if (!l) return best;
    for (const sg of l) {
      const dx = sg.bx - sg.ax, dz = sg.bz - sg.az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - sg.ax) * dx + (z - sg.az) * dz) / len2));
      const d = Math.hypot(x - (sg.ax + dx * t), z - (sg.az + dz * t));
      const r = sg.r, i = sg.i;
      const hw = r.hw[i] + (r.hw[i + 1] - r.hw[i]) * t;
      const e = d - hw;
      const b = best[r.index];
      if (b && b.e <= e) continue;
      const L = Math.sqrt(len2);
      best[r.index] = { e, d, hw, depth: r.depth, s: r.s[i] + (r.s[i + 1] - r.s[i]) * t, tx: dx / L, tz: dz / L, k: i + t };
    }
    return best;
  }

  // ------------------------------------------------------------ CONSULTAS
  // Altura del terreno tras excavar lagos y ríos.
  shape(x, z, h) {
    if (!this.lakes.length && !this.rivers.length) return h;
    const rv = this._rivers(x, z);
    // Primero los diques (sólo suben), luego las excavaciones (sólo bajan):
    // así un dique nunca rellena otra masa de agua.
    for (const l of this.lakes) {
      const e = this.lakeEdge(l, x, z);
      if (e < BANK) h = Math.max(h, levee(e, l.level));
    }
    for (const b of rv) if (b && b.e < BANK && b.s > 0.4) h = Math.max(h, levee(b.e, b.s));
    for (const l of this.lakes) {
      const e = this.lakeEdge(l, x, z);
      if (e < BANK) h = Math.min(h, carve(e, l.level, l.depth, 9));
    }
    for (const b of rv) if (b && b.e < BANK) h = Math.min(h, carve(b.e, b.s, b.depth, b.hw));
    return h;
  }

  // Máscara de celdas de 8 m cercanas al agua: fuera de ellas no hay agua
  // dulce y las consultas por fotograma (nadar, IA…) salen al momento.
  buildMask(half) {
    const C = 8, N = Math.ceil((half * 2) / C);
    const m = new Uint8Array(N * N);
    const mark = (x0, z0, x1, z1) => {
      for (let j = Math.max(0, Math.floor((z0 + half) / C)); j <= Math.min(N - 1, Math.floor((z1 + half) / C)); j++) {
        for (let i = Math.max(0, Math.floor((x0 + half) / C)); i <= Math.min(N - 1, Math.floor((x1 + half) / C)); i++) m[j * N + i] = 1;
      }
    };
    for (const l of this.lakes) {
      const r = l.R * 1.3 + LAKE_SHORE + 2;
      mark(l.x - r, l.z - r, l.x + r, l.z + r);
    }
    for (const r of this.rivers) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const w = Math.max(r.hw[i], r.hw[i + 1]) + RIVER_SHORE + 2;
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        mark(Math.min(ax, bx) - w, Math.min(az, bz) - w, Math.max(ax, bx) + w, Math.max(az, bz) + w);
      }
    }
    this.mask = { m, N, C, half };
  }

  // Superficie del agua dulce en (x, z) o -Infinity si no hay.
  surfaceAt(x, z) {
    const M = this.mask;
    if (M) {
      const i = Math.floor((x + M.half) / M.C), j = Math.floor((z + M.half) / M.C);
      if (i < 0 || j < 0 || i >= M.N || j >= M.N || !M.m[j * M.N + i]) return -Infinity;
    }
    let s = -Infinity;
    for (const l of this.lakes) if (l.level > s && this.lakeEdge(l, x, z) < LAKE_SHORE) s = l.level;
    if (this.rivers.length) {
      for (const b of this._rivers(x, z)) if (b && b.e < RIVER_SHORE && b.s > s) s = b.s;
    }
    return s;
  }

  // 1 sobre el cauce de un río, 0 lejos (para que las carreteras no lo rellenen).
  riverMask(x, z) {
    let m = 0;
    for (const b of this._rivers(x, z)) if (b) m = Math.max(m, 1 - smoothstep(0.5, 3.5, b.e));
    return m;
  }

  // Distancia aproximada al borde del agua más cercano (Infinity si lejos).
  edgeDistance(x, z) {
    let e = Infinity;
    for (const l of this.lakes) e = Math.min(e, this.lakeEdge(l, x, z));
    for (const b of this._rivers(x, z)) if (b) e = Math.min(e, b.e);
    return e;
  }

  // Lago que contiene el punto (con margen), o null.
  lakeAt(x, z, margin = 0) {
    for (const l of this.lakes) if (this.lakeEdge(l, x, z) < margin) return l;
    return null;
  }

  // Río más cercano en (x, z) a menos de `margin` del agua, o null.
  riverAt(x, z, margin = 0) {
    let best = null;
    for (const b of this._rivers(x, z)) if (b && b.e < margin && (!best || b.e < best.e)) best = b;
    return best;
  }

  // ------------------------------------------------------------ MALLAS
  // Geometría del agua de lagos y ríos. Atributo `flow` = (dirección x, z
  // de la corriente, amplitud del oleaje).
  buildGeometry() {
    const pos = [], flow = [];
    const tri = (a, b, c) => {
      for (const v of [a, b, c]) {
        pos.push(v[0], v[1], v[2]);
        flow.push(v[3], v[4], v[5]);
      }
    };
    for (const l of this.lakes) {
      const N = 56;
      const c = [l.x, l.level, l.z, 0, 0, 0.4];
      const ring = [];
      for (let k = 0; k <= N; k++) {
        const a = (k / N) * Math.PI * 2;
        const r = l.R * (1 + 0.16 * Math.sin(2 * a + l.p1) + 0.08 * Math.sin(3 * a + l.p2)) + LAKE_SHORE;
        ring.push([l.x + Math.cos(a) * r, l.level, l.z + Math.sin(a) * r, 0, 0, 0.4]);
      }
      for (let k = 0; k < N; k++) tri(c, ring[k + 1], ring[k]);
    }
    for (const r of this.rivers) {
      const L = [], R = [];
      for (let i = r.ribbonFrom; i <= r.ribbonTo; i++) {
        const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const w = r.hw[i] + RIVER_SHORE;
        const [x, z] = r.pts[i];
        const slope = i > 0 ? Math.max(0, r.s[i - 1] - r.s[i]) / 4 : 0;
        const sp = 1.1 + Math.min(1.6, slope * 40);
        L.push([x - tz * w, r.s[i], z + tx * w, tx * sp, tz * sp, 0.5]);
        R.push([x + tz * w, r.s[i], z - tx * w, tx * sp, tz * sp, 0.5]);
      }
      for (let i = 0; i < L.length - 1; i++) {
        tri(L[i], L[i + 1], R[i]);
        tri(R[i], L[i + 1], R[i + 1]);
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 3));
    g.computeBoundingSphere();
    return g;
  }
}
