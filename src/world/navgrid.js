import { MAP_SIZE, HALF } from './constants.js';

// Rejilla de navegación 2D (a nivel de suelo) para la IA.
// Cada celda guarda cuántas cajas de colisión la bloquean, de modo que al
// construir o destruir algo basta con sumar/restar. A* con montículo binario.

const CELL = 1;
const R = 0.2; // inflado de obstáculos (deja pasar por puertas de 1.5 m)

export class NavGrid {
  constructor(world) {
    this.world = world;
    this.cell = CELL;
    this.size = Math.floor(MAP_SIZE / CELL);
    const n = this.size * this.size;
    this.block = new Uint8Array(n); // nº de obstáculos
    this.cost = new Uint8Array(n); // coste extra (agua, pendiente)
    this.ground = new Float32Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.state = new Uint32Array(n); // 2*stamp = abierto, 2*stamp+1 = cerrado
    this.stamp = 0;
    this.heap = new Int32Array(n);
    this.f = new Float32Array(n);
    this.build();
  }

  idx(x, z) {
    const i = Math.floor((x + HALF) / CELL), j = Math.floor((z + HALF) / CELL);
    if (i < 0 || j < 0 || i >= this.size || j >= this.size) return -1;
    return j * this.size + i;
  }

  center(k, out = [0, 0]) {
    out[0] = -HALF + ((k % this.size) + 0.5) * CELL;
    out[1] = -HALF + (Math.floor(k / this.size) + 0.5) * CELL;
    return out;
  }

  build() {
    const t = this.world.terrain;
    const S = this.size;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        this.ground[j * S + i] = t.heightAt(-HALF + (i + 0.5) * CELL, -HALF + (j + 0.5) * CELL);
      }
    }
    const G = this.ground;
    const w = this.world;
    for (let j = 2; j < S - 2; j++) {
      for (let i = 2; i < S - 2; i++) {
        const k = j * S + i;
        const h = G[k];
        // profundidad del agua (mar, lagos o ríos)
        const wl = h > (w.maxWaterLevel ?? 0) || !w.waterLevelAt ? 0 : w.waterLevelAt(-HALF + (i + 0.5) * CELL, -HALF + (j + 0.5) * CELL);
        const depth = wl - h;
        if (depth > 3.5 && wl <= 0) this.block[k] = 255; // mar profundo (los lagos se cruzan a nado)
        else if (depth > 0.9) this.cost[k] = 6; // nadar es lento
        else {
          const sl = Math.abs(G[k + 2] - G[k - 2]) + Math.abs(G[k + 2 * S] - G[k - 2 * S]);
          this.cost[k] = sl > 6 ? 5 : sl > 3 ? 2 : 0;
        }
      }
    }
    for (const b of this.world.collision.boxes) this.mark(b, 1);
    // A partir de aquí, mantener la rejilla al día con los cambios del mundo
    this.world.collision.onAdd = (b) => this.mark(b, 1);
    this.world.collision.onRemove = (b) => this.mark(b, -1);
  }

  // ¿Bloquea esta caja el paso de alguien que anda por el suelo de la celda?
  mark(b, delta) {
    if (b.data?.type === 'leaves') return;
    const S = this.size;
    if (b.data?.type === 'bridge') {
      // Puente: por encima del cauce; la IA cruza por él sin nadar
      if (delta > 0) {
        for (let j = Math.max(0, Math.floor((b.minZ + HALF) / CELL)); j <= Math.min(S - 1, Math.floor((b.maxZ + HALF) / CELL)); j++) {
          for (let i = Math.max(0, Math.floor((b.minX + HALF) / CELL)); i <= Math.min(S - 1, Math.floor((b.maxX + HALF) / CELL)); i++) {
            this.cost[j * S + i] = 0;
            if (this.block[j * S + i] === 255) this.block[j * S + i] = 0;
          }
        }
      }
      return;
    }
    const i0 = Math.max(0, Math.floor((b.minX - R + HALF) / CELL));
    const i1 = Math.min(S - 1, Math.floor((b.maxX + R + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((b.minZ - R + HALF) / CELL));
    const j1 = Math.min(S - 1, Math.floor((b.maxZ + R + HALF) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * S + i;
        const gnd = this.ground[k];
        // bloquea si sobresale más de un escalón y está a la altura del cuerpo
        if (b.maxY > gnd + 0.6 && b.minY < gnd + 1.9) {
          const v = this.block[k];
          if (v === 255) continue;
          this.block[k] = Math.max(0, Math.min(254, v + delta));
        }
      }
    }
  }

  walkable(k) {
    return k >= 0 && this.block[k] === 0;
  }

  // Celda libre más cercana (búsqueda en anillos).
  nearestFree(k, maxR = 6) {
    if (this.walkable(k)) return k;
    const S = this.size;
    const ci = k % S, cj = Math.floor(k / S);
    for (let r = 1; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= S || j >= S) continue;
          const q = j * S + i;
          if (this.block[q] === 0) return q;
        }
      }
    }
    return -1;
  }

  // Línea recta libre entre dos celdas (para suavizar caminos).
  lineFree(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (CELL * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const k = this.idx(ax + dx * t, az + dz * t);
      if (!this.walkable(k) || this.cost[k] >= 5) return false;
    }
    return true;
  }

  // A* (8 vecinos, sin cortar esquinas). Devuelve [[x,z], ...] o null.
  findPath(sx, sz, tx, tz, maxNodes = 40000) {
    const start = this.nearestFree(this.idx(sx, sz), 10);
    const goal = this.nearestFree(this.idx(tx, tz), 8);
    if (start < 0 || goal < 0) return null;
    // Atajo: si hay línea recta libre no hace falta A* (lo más habitual en
    // campo abierto y lo que más tiempo de CPU ahorra).
    if (goal === this.idx(tx, tz) && Math.hypot(tx - sx, tz - sz) < 160 && this.lineFree(sx, sz, tx, tz)) {
      return { pts: [[sx, sz], [tx, tz]], complete: true };
    }
    const S = this.size;
    const st = ++this.stamp;
    const heap = this.heap;
    let hn = 0;
    const gi = goal % S, gj = Math.floor(goal / S);
    const hfun = (k) => {
      const di = Math.abs((k % S) - gi), dj = Math.abs(Math.floor(k / S) - gj);
      return (Math.max(di, dj) + 0.414 * Math.min(di, dj)) * 1.05;
    };
    const push = (k) => {
      let i = hn++;
      heap[i] = k;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.f[heap[p]] <= this.f[heap[i]]) break;
        const t = heap[p];
        heap[p] = heap[i];
        heap[i] = t;
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      heap[0] = heap[--hn];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < hn && this.f[heap[l]] < this.f[heap[m]]) m = l;
        if (r < hn && this.f[heap[r]] < this.f[heap[m]]) m = r;
        if (m === i) break;
        const t = heap[m];
        heap[m] = heap[i];
        heap[i] = t;
        i = m;
      }
      return top;
    };
    this.g[start] = 0;
    this.f[start] = hfun(start);
    this.parent[start] = -1;
    const OPEN = st * 2, CLOSED = st * 2 + 1;
    this.state[start] = OPEN;
    push(start);
    let best = start, bestH = hfun(start);
    let expanded = 0;
    const DI = [1, -1, 0, 0, 1, 1, -1, -1];
    const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    let found = false;
    while (hn > 0 && expanded < maxNodes) {
      const k = pop();
      if (this.state[k] === CLOSED) continue;
      this.state[k] = CLOSED;
      expanded++;
      if (k === goal) {
        found = true;
        best = k;
        break;
      }
      const h = this.f[k] - this.g[k];
      if (h < bestH) {
        bestH = h;
        best = k;
      }
      const ci = k % S, cj = Math.floor(k / S);
      for (let d = 0; d < 8; d++) {
        const i = ci + DI[d], j = cj + DJ[d];
        if (i < 0 || j < 0 || i >= S || j >= S) continue;
        const q = j * S + i;
        if (this.block[q] !== 0 || this.state[q] === CLOSED) continue;
        if (d >= 4 && (this.block[cj * S + i] !== 0 || this.block[j * S + ci] !== 0)) continue;
        const ng = this.g[k] + (d >= 4 ? 1.414 : 1) * (1 + this.cost[q]);
        if (this.state[q] !== OPEN || ng < this.g[q]) {
          this.state[q] = OPEN;
          this.g[q] = ng;
          this.f[q] = ng + hfun(q);
          this.parent[q] = k;
          push(q);
        }
      }
    }
    // Reconstruir (si no se llegó, hasta el nodo más cercano al objetivo)
    const cells = [];
    for (let k = best; k !== -1; k = this.parent[k]) {
      cells.push(k);
      if (cells.length > 20000) break;
    }
    cells.reverse();
    const pts = cells.map((k) => this.center(k, [0, 0]));
    if (found) pts.push([tx, tz]);
    return { pts: this.smooth(pts), complete: found };
  }

  // Elimina puntos intermedios cuando hay línea recta libre.
  smooth(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 40);
      while (j > i + 1 && !this.lineFree(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}
