// Mundo de colisión basado en cajas alineadas a los ejes (AABB) con una
// rejilla espacial 2D (XZ) para consultas y raycasts rápidos.

const EPS = 1e-5;

export class CollisionWorld {
  constructor(cellSize = 16) {
    this.cellSize = cellSize;
    this.boxes = [];
    this.cells = new Map();
    this.stamp = 0;
  }

  _key(cx, cz) {
    return (cx + 2048) * 4096 + (cz + 2048);
  }

  add(minX, minY, minZ, maxX, maxY, maxZ, data = null) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, data, _s: 0, _cells: [] };
    this.boxes.push(b);
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs), x1 = Math.floor(maxX / cs);
    const z0 = Math.floor(minZ / cs), z1 = Math.floor(maxZ / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this._key(cx, cz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(b);
        b._cells.push(list);
      }
    }
    return b;
  }

  remove(b) {
    for (const list of b._cells) {
      const i = list.indexOf(b);
      if (i >= 0) list.splice(i, 1);
    }
    b._cells.length = 0;
    const i = this.boxes.indexOf(b);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  // Devuelve las cajas que se solapan estrictamente con el AABB dado.
  query(minX, minY, minZ, maxX, maxY, maxZ, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs), x1 = Math.floor(maxX / cs);
    const z0 = Math.floor(minZ / cs), z1 = Math.floor(maxZ / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this._key(cx, cz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._s === s) continue;
          b._s = s;
          if (
            minX < b.maxX - EPS && maxX > b.minX + EPS &&
            minY < b.maxY - EPS && maxY > b.minY + EPS &&
            minZ < b.maxZ - EPS && maxZ > b.minZ + EPS
          ) {
            out.push(b);
          }
        }
      }
    }
    return out;
  }

  overlaps(minX, minY, minZ, maxX, maxY, maxZ) {
    return this.query(minX, minY, minZ, maxX, maxY, maxZ, this._tmp || (this._tmp = [])).length > 0;
  }

  // Raycast con recorrido DDA de la rejilla. dir debe estar normalizado.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const s = ++this.stamp;
    const cs = this.cellSize;
    let cx = Math.floor(ox / cs);
    let cz = Math.floor(oz / cs);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(cs / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(cs / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * cs - ox : ox - cx * cs) / Math.abs(dx) : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * cs - oz : oz - cz * cs) / Math.abs(dz) : Infinity;

    let bestT = maxDist;
    let best = null;
    let nAxis = 0, nSign = 0;
    let tCell = 0;
    for (let guard = 0; guard < 4096; guard++) {
      const list = this.cells.get(this._key(cx, cz));
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._s === s) continue;
          b._s = s;
          // Slab test
          let tmin = 0, tmax = bestT, axis = -1, sign = 0;
          let ok = true;
          // X
          if (Math.abs(dx) < 1e-9) {
            if (ox < b.minX || ox > b.maxX) ok = false;
          } else {
            let t1 = (b.minX - ox) / dx, t2 = (b.maxX - ox) / dx, sg = -1;
            if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
            if (t1 > tmin) { tmin = t1; axis = 0; sign = sg; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) ok = false;
          }
          if (ok) {
            if (Math.abs(dy) < 1e-9) {
              if (oy < b.minY || oy > b.maxY) ok = false;
            } else {
              let t1 = (b.minY - oy) / dy, t2 = (b.maxY - oy) / dy, sg = -1;
              if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
              if (t1 > tmin) { tmin = t1; axis = 1; sign = sg; }
              if (t2 < tmax) tmax = t2;
              if (tmin > tmax) ok = false;
            }
          }
          if (ok) {
            if (Math.abs(dz) < 1e-9) {
              if (oz < b.minZ || oz > b.maxZ) ok = false;
            } else {
              let t1 = (b.minZ - oz) / dz, t2 = (b.maxZ - oz) / dz, sg = -1;
              if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
              if (t1 > tmin) { tmin = t1; axis = 2; sign = sg; }
              if (t2 < tmax) tmax = t2;
              if (tmin > tmax) ok = false;
            }
          }
          // axis === -1 => el origen está dentro de la caja: se ignora.
          if (ok && axis >= 0 && tmin < bestT) {
            bestT = tmin;
            best = b;
            nAxis = axis;
            nSign = sign;
          }
        }
      }
      if (tMaxX < tMaxZ) {
        tCell = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        tCell = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
      if (tCell > bestT || tCell === Infinity) break;
    }
    if (!best) return null;
    return {
      t: bestT,
      box: best,
      nx: nAxis === 0 ? nSign : 0,
      ny: nAxis === 1 ? nSign : 0,
      nz: nAxis === 2 ? nSign : 0,
    };
  }
}
