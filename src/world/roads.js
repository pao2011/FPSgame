import * as THREE from 'three';

// Índice espacial simple de rectángulos (ocupación del suelo).
export class RectIndex {
  constructor(cell = 32) {
    this.cell = cell;
    this.map = new Map();
    this.list = [];
  }
  _keys(x0, z0, x1, z1, fn) {
    const c = this.cell;
    for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
      for (let gz = Math.floor(z0 / c); gz <= Math.floor(z1 / c); gz++) fn(gx * 100000 + gz);
    }
  }
  add(x0, z0, x1, z1, data = null) {
    const r = { x0, z0, x1, z1, data };
    this.list.push(r);
    this._keys(x0, z0, x1, z1, (k) => {
      let l = this.map.get(k);
      if (!l) this.map.set(k, (l = []));
      l.push(r);
    });
    return r;
  }
  hit(x0, z0, x1, z1) {
    let found = null;
    this._keys(x0, z0, x1, z1, (k) => {
      if (found) return;
      const l = this.map.get(k);
      if (!l) return;
      for (const r of l) {
        if (x1 > r.x0 && x0 < r.x1 && z1 > r.z0 && z0 < r.z1) {
          found = r;
          return;
        }
      }
    });
    return found;
  }
}

// Red de carreteras: polilíneas con ancho, consulta de distancia y malla.
export class RoadNetwork {
  constructor() {
    this.roads = [];
    this.segs = new Map();
    this.cell = 24;
  }

  add(pts, width = 7, kind = 'road') {
    const road = { pts, width, kind };
    this.roads.push(road);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const s = { ax, az, bx, bz, w: width, road };
      const m = width / 2 + 2;
      const c = this.cell;
      for (let gx = Math.floor((Math.min(ax, bx) - m) / c); gx <= Math.floor((Math.max(ax, bx) + m) / c); gx++) {
        for (let gz = Math.floor((Math.min(az, bz) - m) / c); gz <= Math.floor((Math.max(az, bz) + m) / c); gz++) {
          const k = gx * 100000 + gz;
          let l = this.segs.get(k);
          if (!l) this.segs.set(k, (l = []));
          l.push(s);
        }
      }
    }
    return road;
  }

  // Distancia al borde de la carretera más cercana (negativa = encima).
  edgeDistance(x, z, search = 24) {
    let best = Infinity;
    const c = this.cell;
    const r = Math.ceil(search / c);
    const gx0 = Math.floor(x / c), gz0 = Math.floor(z / c);
    for (let gx = gx0 - r; gx <= gx0 + r; gx++) {
      for (let gz = gz0 - r; gz <= gz0 + r; gz++) {
        const l = this.segs.get(gx * 100000 + gz);
        if (!l) continue;
        for (const s of l) {
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const len2 = dx * dx + dz * dz || 1;
          let t = ((x - s.ax) * dx + (z - s.az) * dz) / len2;
          t = Math.max(0, Math.min(1, t));
          const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)) - s.w / 2;
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  // Punto de carretera más cercano y su dirección.
  nearest(x, z, search = 60) {
    let best = null, bd = Infinity;
    const c = this.cell;
    const r = Math.ceil(search / c);
    const gx0 = Math.floor(x / c), gz0 = Math.floor(z / c);
    for (let gx = gx0 - r; gx <= gx0 + r; gx++) {
      for (let gz = gz0 - r; gz <= gz0 + r; gz++) {
        const l = this.segs.get(gx * 100000 + gz);
        if (!l) continue;
        for (const s of l) {
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const len2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
          const px = s.ax + dx * t, pz = s.az + dz * t;
          const d = Math.hypot(x - px, z - pz);
          if (d < bd) {
            bd = d;
            const L = Math.sqrt(len2);
            best = { x: px, z: pz, dx: dx / L, dz: dz / L, dist: d };
          }
        }
      }
    }
    return best;
  }

  // Ribbon de asfalto que sigue el terreno + líneas discontinuas.
  buildMesh(terrain) {
    const pos = [], col = [], dash = [];
    const asphalt = new THREE.Color(0x3d3f44);
    const street = new THREE.Color(0x4a4c51);
    for (const road of this.roads) {
      const pts = road.pts;
      const c = road.kind === 'street' ? street : asphalt;
      const hw = road.width / 2;
      const L = [], Rr = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const nx = -tz, nz = tx;
        const [x, z] = pts[i];
        const lx = x + nx * hw, lz = z + nz * hw, rx = x - nx * hw, rz = z - nz * hw;
        L.push([lx, terrain.heightAt(lx, lz) + 0.09, lz]);
        Rr.push([rx, terrain.heightAt(rx, rz) + 0.09, rz]);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const quad = [L[i], Rr[i + 1], Rr[i], L[i], L[i + 1], Rr[i + 1]]; // CCW visto desde arriba
        for (const v of quad) {
          pos.push(v[0], v[1], v[2]);
          col.push(c.r, c.g, c.b);
        }
      }
      // Línea central discontinua (solo carreteras)
      if (road.kind !== 'road') continue;
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const seg = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / seg, dz = (bz - az) / seg;
        for (let s = 0; s < seg; s += 1) {
          if ((acc + s) % 9 > 3.5) continue;
          const x = ax + dx * s, z = az + dz * s;
          const y = terrain.heightAt(x, z) + 0.12;
          const nx = -dz * 0.1, nz = dx * 0.1;
          const x2 = x + dx, z2 = z + dz, y2 = terrain.heightAt(x2, z2) + 0.12;
          dash.push(x + nx, y, z + nz, x2 - nx, y2, z2 - nz, x - nx, y, z - nz, x + nx, y, z + nz, x2 + nx, y2, z2 + nz, x2 - nx, y2, z2 - nz);
        }
        acc += seg;
      }
    }
    const group = new THREE.Group();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    group.add(m);
    if (dash.length) {
      const dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.Float32BufferAttribute(dash, 3));
      dg.computeVertexNormals();
      group.add(new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ color: 0xf2d24a, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
    }
    return group;
  }
}
