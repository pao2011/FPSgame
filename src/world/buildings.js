import * as THREE from 'three';
import { patternOf, PAT } from './geobuilder.js';

// Generadores procedurales de edificios. Todo se define en coordenadas
// locales (puerta principal hacia +Z) y se rota en múltiplos de 90° para que
// las colisiones sigan siendo AABB.

const WALL_T = 0.3;
const FLOOR_H = 3.2;
const SLAB = 0.25;
const BASE = 0.15;

export const PALETTES = {
  house: [0xe8d9b5, 0xd9a07a, 0xa9c7d9, 0xf0f0e6, 0xc6d6a0, 0xe0b5b5, 0xd4c08a],
  city: [0x9aa3ad, 0xb7a68c, 0x7f8c99, 0xc9c1b2, 0x8fa1b3, 0xa38f7a],
  roof: [0x8a3b32, 0x4a5a6a, 0x5b4636, 0x2f4f6f, 0x7a2f2f],
  industrial: [0x8c96a0, 0x6f7f73, 0xa0927d, 0x7d8a99],
};

const TRIM = 0xf2efe6;
const FLOORC = 0x9c7650;
const STAIRC = 0x7a5a3c;
const CONCRETE = 0x8d8d86;

// Material que da una pieza de edificio al picarla, según su aspecto.
export function materialOf(hex) {
  const p = patternOf(hex);
  if (p === PAT.planks || p === PAT.siding) return 'wood';
  if (p === PAT.metal || p === PAT.corrugated || p === PAT.panels) return 'metal';
  if (p !== PAT.plain) return 'stone';
  // Color liso: marrones/cálidos = madera; grises = piedra
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
  return r > b && sat > 0.22 ? 'wood' : 'stone';
}

// Piezas destructibles de un edificio: cada caja sólida (muro, losa,
// escalón…) es una pieza con vida que se puede picar o volar. Los detalles
// sin colisión (marcos, tejados) se asignan a la pieza que más tocan para
// que desaparezcan con ella.
export class DestSet {
  constructor(geo, groundY, list) {
    this.geo = geo;
    this.groundY = groundY;
    this.list = list; // lista global (mundo) de piezas
    this.mine = [];
    this.decor = [];
    // Edificio: sus piezas y (al romper la primera) quién toca a quién
    this.bld = { pieces: this.mine, adj: null };
  }

  add(aabb, hex) {
    const [x0, y0, z0, x1, y1, z1] = aabb;
    // La base a ras de suelo no se rompe (se vería el hueco bajo el edificio)
    if (y0 <= this.groundY + 0.2 && y1 - y0 < 0.7) return null;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const area = Math.max(dx * dy, dz * dy, dx * dz);
    const hp = Math.round(Math.min(600, Math.max(80, 60 + area * 10)));
    const piece = {
      kind: 'building', id: this.list.length, mat: materialOf(hex), hp, maxHp: hp, hex,
      center: new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
      aabb, boxes: [[x0, y0, z0, x1, y1, z1, 'building']], colliders: [], ranges: [],
      bld: this.bld, grounded: y0 <= this.groundY + 0.5,
    };
    this.list.push(piece);
    this.mine.push(piece);
    return piece;
  }

  // Asigna los detalles a la pieza con la que más se solapan.
  finish() {
    const own = this.geo.own;
    for (const d of this.decor) {
      const [a0, a1, a2, a3, a4, a5] = d.aabb;
      let best = null, bv = 0;
      for (const p of this.mine) {
        const b = p.aabb, e = 0.15;
        const ox = Math.min(a3, b[3] + e) - Math.max(a0, b[0] - e);
        const oy = Math.min(a4, b[4] + e) - Math.max(a1, b[1] - e);
        const oz = Math.min(a5, b[5] + e) - Math.max(a2, b[2] - e);
        if (ox <= 0 || oy <= 0 || oz <= 0) continue;
        const v = (ox + 0.01) * (oy + 0.01) * (oz + 0.01);
        if (v > bv) {
          bv = v;
          best = p;
        }
      }
      if (best) for (let t = d.t0; t < d.t1; t++) own[t] = best.id;
    }
    this.decor.length = 0;
  }

  // Detalle sin colisión: triángulos [t0, t1) del GeoBuilder.
  decorFrom(t0) {
    const t1 = this.geo.own.length;
    if (t1 <= t0) return;
    const P = this.geo.pos;
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = t0 * 9; i < t1 * 9; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (P[i + k] < bb[k]) bb[k] = P[i + k];
        if (P[i + k] > bb[k + 3]) bb[k + 3] = P[i + k];
      }
    }
    this.decor.push({ t0, t1, aabb: bb });
  }
}

export class BuildingCtx {
  constructor(geo, collision, cx, cy, cz, rot) {
    this.geo = geo;
    this.collision = collision;
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.rot = ((rot % 4) + 4) % 4;
    this.chestSpots = [];
    this.lootSpots = [];
    this.ammoSpots = [];
    this.ladders = [];
    this.doors = [];
    this.dest = null; // DestSet si el edificio se puede destruir
  }

  // Contexto hijo desplazado (lx, lz locales) y girado dRot*90°; comparte
  // las listas de puntos de botín con el padre.
  sub(lx, lz, dRot = 0, dy = 0) {
    const p = this.tp(lx, dy, lz);
    const c = new BuildingCtx(this.geo, this.collision, p[0], p[1], p[2], this.rot + dRot);
    c.chestSpots = this.chestSpots;
    c.lootSpots = this.lootSpots;
    c.ammoSpots = this.ammoSpots;
    c.ladders = this.ladders;
    c.doors = this.doors;
    c.dest = this.dest;
    return c;
  }

  // Puerta real (hoja con bisagra) en un hueco de muro paralelo al eje X
  // local: de x0 a x1, en la cara z (grosor t), altura y0..y1.
  door(x0, x1, z0, z1, y0, y1) {
    const a = this.tp(x0, y0, z0), b = this.tp(x1, y1, z1);
    // El eje del hueco en el mundo: X si rot es 0 o 2, Z si es 1 o 3
    const alongX = this.rot % 2 === 0;
    this.doors.push({
      minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
      minZ: Math.min(a[2], b[2]), maxZ: Math.max(a[2], b[2]),
      y0: a[1], y1: b[1], alongX,
    });
  }

  // Volumen de escalera de mano (no sólido): el jugador sube al pulsar W.
  ladder(x0, y0, z0, x1, y1, z1) {
    const a = this.tp(x0, y0, z0);
    const b = this.tp(x1, y1, z1);
    this.ladders.push({
      minX: Math.min(a[0], b[0]), minY: a[1], minZ: Math.min(a[2], b[2]),
      maxX: Math.max(a[0], b[0]), maxY: b[1], maxZ: Math.max(a[2], b[2]),
    });
  }

  // Escalera de mano visual + volumen de subida, apoyada en una pared.
  // (x, z) = pie de la escalera; face = lado hacia el que mira el que sube.
  ladderVisual(x, z, y0, y1, axis = 'x') {
    const w = 0.5;
    const c = 0x6b5a45;
    if (axis === 'x') {
      this.box(x - w, y0, z - 0.06, x - w + 0.08, y1 + 1, z + 0.06, c, false);
      this.box(x + w - 0.08, y0, z - 0.06, x + w, y1 + 1, z + 0.06, c, false);
      for (let y = y0 + 0.4; y < y1 + 0.9; y += 0.45) this.box(x - w, y, z - 0.04, x + w, y + 0.06, z + 0.04, c, false);
      this.ladder(x - w, y0, z - 0.6, x + w, y1 + 1.1, z + 0.6);
    } else {
      this.box(x - 0.06, y0, z - w, x + 0.06, y1 + 1, z - w + 0.08, c, false);
      this.box(x - 0.06, y0, z + w - 0.08, x + 0.06, y1 + 1, z + w, c, false);
      for (let y = y0 + 0.4; y < y1 + 0.9; y += 0.45) this.box(x - 0.04, y, z - w, x + 0.04, y + 0.06, z + w, c, false);
      this.ladder(x - 0.6, y0, z - w, x + 0.6, y1 + 1.1, z + w);
    }
  }

  tp(x, y, z) {
    let wx, wz;
    switch (this.rot) {
      case 0: wx = x; wz = z; break;
      case 1: wx = -z; wz = x; break;
      case 2: wx = -x; wz = -z; break;
      default: wx = z; wz = -x; break;
    }
    return [this.cx + wx, this.cy + y, this.cz + wz];
  }

  // Ángulo (radianes) que corresponde a una dirección local.
  yaw(localYaw = 0) {
    // rot 1 => +Z local apunta a -X mundial => yaw -PI/2
    return localYaw - (this.rot * Math.PI) / 2;
  }

  box(x0, y0, z0, x1, y1, z1, color, collide = true, jitter = 0.06) {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const a = this.tp(x0, y0, z0);
    const b = this.tp(x1, y1, z1);
    const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
    const minZ = Math.min(a[2], b[2]), maxZ = Math.max(a[2], b[2]);
    const d = this.dest;
    const piece = d && collide ? d.add([minX, a[1], minZ, maxX, b[1], maxZ], color) : null;
    const t0 = this.geo.own.length;
    if (piece) this.geo.owner = piece.id;
    this.geo.box(minX, a[1], minZ, maxX, b[1], maxZ, color, jitter);
    this.geo.owner = -1;
    if (d && !collide) d.decorFrom(t0);
    if (collide) {
      const c = this.collision.add(minX, a[1], minZ, maxX, b[1], maxZ, piece ? { type: 'building', ref: piece } : { type: 'building' });
      if (piece) piece.colliders.push(c);
    }
  }

  colliderOnly(x0, y0, z0, x1, y1, z1, hex = CONCRETE, shared = null) {
    const a = this.tp(x0, y0, z0);
    const b = this.tp(x1, y1, z1);
    const bb = [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2]), Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2])];
    const piece = shared || this.dest?.add(bb, hex);
    if (shared) shared.boxes.push([...bb, 'building']);
    const c = this.collision.add(bb[0], bb[1], bb[2], bb[3], bb[4], bb[5], piece ? { type: 'building', ref: piece } : { type: 'building' });
    if (piece) piece.colliders.push(c);
  }

  poly(verts, color, inside) {
    const t0 = this.geo.own.length;
    this.geo.poly(verts.map((v) => this.tp(v[0], v[1], v[2])), color, this.tp(inside[0], inside[1], inside[2]));
    this.dest?.decorFrom(t0);
  }

  geometry(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, localYaw = 0) {
    const p = this.tp(x, y, z);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p[0], p[1], p[2]),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw(localYaw)),
      new THREE.Vector3(sx, sy, sz),
    );
    const t0 = this.geo.own.length;
    this.geo.geometry(geo, color, m);
    this.dest?.decorFrom(t0);
  }

  spot(list, x, y, z, faceX = 0, faceZ = 0) {
    const p = this.tp(x, y, z);
    const f = this.tp(faceX, y, faceZ);
    list.push({ x: p[0], y: p[1], z: p[2], rotY: Math.atan2(f[0] - p[0], f[2] - p[2]) });
  }

  // Muro con huecos. axis 'x': el muro recorre X (de a0 a a1) y ocupa [t0,t1] en Z.
  wall(axis, a0, a1, t0, t1, y0, y1, openings, color) {
    const ops = openings.slice().sort((p, q) => p.a - q.a);
    let cur = a0;
    const B = (s0, s1, yy0, yy1) => {
      if (axis === 'x') this.box(s0, yy0, t0, s1, yy1, t1, color);
      else this.box(t0, yy0, s0, t1, yy1, s1, color);
    };
    for (const op of ops) {
      const oa = Math.max(op.a, a0), ob = Math.min(op.b, a1);
      if (ob <= oa) continue;
      if (oa > cur) B(cur, oa, y0, y1);
      if (op.bottom > y0) B(oa, ob, y0, op.bottom);
      if (op.top < y1) B(oa, ob, op.top, y1);
      cur = ob;
    }
    if (cur < a1) B(cur, a1, y0, y1);
  }

  // Losa con un agujero rectangular opcional {x0,z0,x1,z1}.
  slab(x0, z0, x1, z1, y0, y1, hole, color) {
    if (!hole) {
      this.box(x0, y0, z0, x1, y1, z1, color);
      return;
    }
    const hx0 = Math.max(x0, hole.x0), hx1 = Math.min(x1, hole.x1);
    const hz0 = Math.max(z0, hole.z0), hz1 = Math.min(z1, hole.z1);
    this.box(x0, y0, z0, x1, y1, hz0, color);
    this.box(x0, y0, hz1, x1, y1, z1, color);
    this.box(x0, y0, hz0, hx0, y1, hz1, color);
    this.box(hx1, y0, hz0, x1, y1, hz1, color);
  }

  // Escalera de bloques macizos. dir = +1 (sube hacia +Z) o -1.
  stairs(x0, x1, zStart, dir, y0, height, steps, color) {
    const stepH = height / steps;
    const stepD = 0.4;
    for (let k = 0; k < steps; k++) {
      const za = zStart + dir * k * stepD;
      const zb = zStart + dir * (k + 1) * stepD;
      this.box(x0, y0, Math.min(za, zb), x1, y0 + (k + 1) * stepH, Math.max(za, zb), color, true, 0.02);
    }
    return steps * stepD;
  }

  // Tejado a dos aguas sobre [-X,X] x [-Z,Z] a partir de yb.
  gableRoof(X, Z, yb, rh, roofColor, gableColor) {
    const alongX = X >= Z;
    const P = (a, y, b) => (alongX ? [a, y, b] : [b, y, a]);
    const A = alongX ? X : Z; // eje de la cumbrera
    const B = alongX ? Z : X; // eje de la pendiente
    const inside = [0, yb + rh * 0.3, 0];
    const v = {
      a: P(-A, yb, -B), b: P(A, yb, -B), c: P(A, yb, B), d: P(-A, yb, B),
      r1: P(-A, yb + rh, 0), r2: P(A, yb + rh, 0),
    };
    // El tejado entero es una sola pieza destructible
    let roof = null;
    if (this.dest) {
      const a = this.tp(-X, yb, -Z), b = this.tp(X, yb + rh, Z);
      roof = this.dest.add([Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2]), Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2])], roofColor);
      if (roof) roof.boxes = []; // las cajas reales son los escalones de abajo
    }
    const dest = this.dest;
    this.dest = null;
    if (roof) this.geo.owner = roof.id;
    this.poly([v.a, v.b, v.r2, v.r1], roofColor, inside);
    this.poly([v.d, v.c, v.r2, v.r1], roofColor, inside);
    this.poly([v.a, v.d, v.r1], gableColor, inside);
    this.poly([v.b, v.c, v.r2], gableColor, inside);
    this.poly([v.a, v.b, v.c, v.d], gableColor, inside);
    this.geo.owner = -1;
    // Colisión escalonada que aproxima las dos pendientes
    const n = 4;
    for (let i = 0; i < n; i++) {
      const s0 = (B * i) / n, s1 = (B * (i + 1)) / n;
      const h = yb + rh * (1 - (i + 0.5) / n);
      for (const sg of [-1, 1]) {
        const lo = sg < 0 ? -s1 : s0;
        const hi = sg < 0 ? -s0 : s1;
        if (alongX) this.colliderOnly(-A, yb, lo, A, h, hi, roofColor, roof);
        else this.colliderOnly(lo, yb, -A, hi, h, A, roofColor, roof);
      }
    }
    this.dest = dest;
  }
}

export function windowsFor(a0, a1, y0, rng, avoid = [], big = false) {
  const len = a1 - a0;
  const step = big ? 3.0 : 3.2;
  const half = big ? 1.15 : 0.7;
  const n = Math.max(0, Math.floor((len - 1.5) / step));
  const ops = [];
  for (let i = 0; i < n; i++) {
    const c = a0 + (len * (i + 1)) / (n + 1);
    if (avoid.some(([p, q]) => c + half + 0.1 > p && c - half - 0.1 < q)) continue;
    if (big || rng.chance(0.85)) ops.push({ a: c - half, b: c + half, bottom: y0 + (big ? 0.8 : 1.0), top: y0 + (big ? 2.75 : 2.3) });
  }
  return ops;
}

// Casa / edificio de varias plantas con escaleras interiores.
export function genHouse(ctx, rng, o) {
  const { W, D, floors } = o;
  const wallColor = o.wallColor;
  const roofColor = o.roofColor ?? 0x8a3b32;
  const t = WALL_T;
  const hw = W / 2, hd = D / 2;
  const topY = BASE + floors * FLOOR_H;

  ctx.box(-hw - 0.3, -3, -hd - 0.3, hw + 0.3, BASE, hd + 0.3, CONCRETE);

  const doorX = rng.float(-hw + 2.2, hw - 2.2) * 0.5 + (rng.chance(0.5) ? 1 : -1) * hw * 0.25;
  const stairW = 1.4;
  const stairRun = 10 * 0.4;
  const zs = -hd + t + 1.1; // hueco detrás del primer escalón para poder subir de frente
  const ze = zs + stairRun;

  for (let f = 0; f < floors; f++) {
    const y0 = BASE + f * FLOOR_H;
    const y1 = y0 + FLOOR_H;
    const side = f % 2 === 0 ? -1 : 1;
    const sx0 = side < 0 ? -hw + t : hw - t - stairW;
    const sx1 = sx0 + stairW;
    const hasStairs = f < floors - 1 || o.roofAccess;

    // Muros exteriores
    const big = !!o.bigWindows;
    const frontOps = windowsFor(-hw + t, hw - t, y0, rng, f === 0 ? [[doorX - 0.9, doorX + 0.9]] : [], big);
    if (f === 0) {
      frontOps.push({ a: doorX - 0.8, b: doorX + 0.8, bottom: y0, top: y0 + 2.5 });
      ctx.door(doorX - 0.8, doorX + 0.8, hd - t, hd, y0, y0 + 2.5);
    }
    ctx.wall('x', -hw, hw, hd - t, hd, y0, y1, frontOps, wallColor);

    const bx = side < 0 ? hw * 0.5 : -hw * 0.5;
    // (sin ventanas detrás de la escalera interior: ni en la pared lateral
    // contra la que va ni en la de atrás, junto a su arranque)
    const stairBack = hasStairs ? [[sx0 - 0.2, sx1 + 0.2]] : [];
    const backOps = windowsFor(-hw + t, hw - t, y0, rng, f === 0 ? [[bx - 0.9, bx + 0.9], ...stairBack] : stairBack, big);
    if (f === 0) {
      backOps.push({ a: bx - 0.75, b: bx + 0.75, bottom: y0, top: y0 + 2.5 });
      ctx.door(bx - 0.75, bx + 0.75, -hd, -hd + t, y0, y0 + 2.5);
    }
    ctx.wall('x', -hw, hw, -hd, -hd + t, y0, y1, backOps, wallColor);
    const stairSide = hasStairs ? [[zs - 0.3, ze + 0.3]] : [];
    ctx.wall('z', -hd + t, hd - t, -hw, -hw + t, y0, y1, windowsFor(-hd + t, hd - t, y0, rng, side < 0 ? stairSide : [], big), wallColor);
    ctx.wall('z', -hd + t, hd - t, hw - t, hw, y0, y1, windowsFor(-hd + t, hd - t, y0, rng, side > 0 ? stairSide : [], big), wallColor);

    // Cornisa decorativa entre plantas
    if (f > 0) {
      ctx.box(-hw - 0.08, y0 - 0.15, hd - 0.02, hw + 0.08, y0 + 0.05, hd + 0.08, TRIM, false);
      ctx.box(-hw - 0.08, y0 - 0.15, -hd - 0.08, hw + 0.08, y0 + 0.05, -hd + 0.02, TRIM, false);
    }

    if (hasStairs) ctx.stairs(sx0, sx1, zs, 1, y0, FLOOR_H, 10, STAIRC);

    // Losa superior (suelo de la siguiente planta o techo)
    const hole = hasStairs ? { x0: sx0 - 0.05, z0: zs - 0.05, x1: sx1 + 0.05, z1: ze } : null;
    ctx.slab(-hw + t, -hd + t, hw - t, hd - t, y1 - SLAB, y1, hole, f === floors - 1 ? 0x77756f : FLOORC);

    // Puntos de botín (evitando escaleras y huecos)
    const corners = [
      [-hw + t + 0.7, hd - t - 0.6],
      [hw - t - 0.7, hd - t - 0.6],
    ];
    if (f === 0) corners.push([-side * (hw - t - 0.7), -hd + t + 0.6]);
    // Candidatos: el mundo elige como mucho 1 cofre por casa (ver world.js)
    for (const [cx, cz] of corners) {
      if (f === 0 && Math.abs(cx - doorX) < 1.6 && cz > 0) continue;
      ctx.spot(ctx.chestSpots, cx, y0, cz, 0, 0);
    }
    const lx = side < 0 ? hw * 0.25 : -hw * 0.25;
    ctx.spot(ctx.lootSpots, lx, y0, hd * 0.25);
    if (f === 0 && rng.chance(0.3)) ctx.spot(ctx.ammoSpots, -lx, y0, hd - t - 0.5, 0, 0);
  }

  // Porche delante de la puerta
  if (o.porch) {
    const px0 = doorX - 2.2, px1 = doorX + 2.2;
    ctx.box(px0, -0.5, hd, px1, BASE + 0.05, hd + 2.2, 0x9a7a55);
    ctx.box(px0, 2.9, hd, px1, 3.05, hd + 2.3, o.roofColor ?? 0x8a3b32, false);
    for (const x of [px0 + 0.1, px1 - 0.25]) ctx.box(x, BASE, hd + 2.0, x + 0.15, 2.9, hd + 2.15, TRIM);
  }
  if (o.roof === 'gable') {
    const rh = Math.min(W, D) * 0.32;
    ctx.gableRoof(hw + 0.5, hd + 0.5, topY, rh, roofColor, wallColor);
    if (o.chimney) {
      const cx = hw * 0.55;
      ctx.box(cx - 0.45, topY, -0.45 - hd * 0.3, cx + 0.45, topY + rh + 1.0, 0.45 - hd * 0.3, 0x8a5040, false);
    }
  } else {
    // Azotea con parapeto
    const p = 0.25;
    ctx.box(-hw, topY, -hd, hw, topY + 1.0, -hd + p, wallColor);
    ctx.box(-hw, topY, hd - p, hw, topY + 1.0, hd, wallColor);
    ctx.box(-hw, topY, -hd + p, -hw + p, topY + 1.0, hd - p, wallColor);
    ctx.box(hw - p, topY, -hd + p, hw, topY + 1.0, hd - p, wallColor);
    if (o.roofAccess) {
      ctx.spot(ctx.lootSpots, (floors % 2 === 0 ? 1 : -1) * -hw * 0.3, topY, hd * 0.3);
      ctx.spot(ctx.chestSpots, hw - 1.2, topY, hd - 1.0, 0, 0);
    }
    // Detalles: aire acondicionado / depósito
    if (rng.chance(0.7)) ctx.box(hw * 0.2, topY, hd * 0.1, hw * 0.2 + 1.6, topY + 1.1, hd * 0.1 + 1.2, 0xb8bcc0);
  }

  return { W, D };
}

// Nave / almacén grande con altillo.
export function genWarehouse(ctx, rng, o) {
  const { W, D } = o;
  const H = o.height ?? 7;
  const t = WALL_T;
  const hw = W / 2, hd = D / 2;
  const wallColor = o.wallColor;
  ctx.box(-hw - 0.3, -3, -hd - 0.3, hw + 0.3, BASE, hd + 0.3, CONCRETE);
  const y0 = BASE, y1 = BASE + H;

  const high = (a0, a1) => {
    const ops = [];
    const n = Math.floor((a1 - a0) / 4);
    for (let i = 0; i < n; i++) {
      const c = a0 + ((a1 - a0) * (i + 0.5)) / n;
      ops.push({ a: c - 1.1, b: c + 1.1, bottom: y0 + H - 2.4, top: y0 + H - 1.0 });
    }
    return ops;
  };

  const front = high(-hw + t, hw - t).filter((op) => op.b < -2.6 || op.a > 2.6);
  front.push({ a: -2.4, b: 2.4, bottom: y0, top: y0 + 5 });
  ctx.wall('x', -hw, hw, hd - t, hd, y0, y1, front, wallColor);
  const back = high(-hw + t, hw - t);
  back.push({ a: -hw * 0.5 - 0.8, b: -hw * 0.5 + 0.8, bottom: y0, top: y0 + 2.5 });
  ctx.wall('x', -hw, hw, -hd, -hd + t, y0, y1, back, wallColor);
  ctx.wall('z', -hd + t, hd - t, -hw, -hw + t, y0, y1, high(-hd + t, hd - t), wallColor);
  const right = high(-hd + t, hd - t);
  right.push({ a: hd * 0.3 - 0.8, b: hd * 0.3 + 0.8, bottom: y0, top: y0 + 2.5 });
  ctx.wall('z', -hd + t, hd - t, hw - t, hw, y0, y1, right, wallColor);

  // Franja decorativa
  ctx.box(-hw - 0.05, y0 + 2.8, hd - 0.02, -2.5, y0 + 3.1, hd + 0.06, o.stripe ?? 0xd8b23a, false);
  ctx.box(2.5, y0 + 2.8, hd - 0.02, hw + 0.05, y0 + 3.1, hd + 0.06, o.stripe ?? 0xd8b23a, false);

  // Altillo trasero con escalera
  const mezzY = y0 + 3.5;
  const mezzD = 4.5;
  const mz1 = -hd + t + mezzD;
  ctx.box(-hw + t, mezzY - 0.25, -hd + t, hw - t, mezzY, mz1, 0x6e6a64);
  ctx.box(-hw + t, mezzY, mz1 - 0.08, hw - t - 1.6, mezzY + 1.0, mz1, 0x555555); // barandilla
  for (const px of [-hw * 0.5, 0, hw * 0.5]) ctx.box(px - 0.15, y0, mz1 - 0.3, px + 0.15, mezzY - 0.25, mz1, 0x555555);
  ctx.stairs(hw - t - 1.5, hw - t - 0.1, mz1 + 11 * 0.4, -1, y0, 3.5, 11, 0x5d5d5d);

  if (o.roof === 'gable') {
    ctx.slab(-hw + t, -hd + t, hw - t, hd - t, y1 - SLAB, y1, null, 0x77756f);
    ctx.gableRoof(hw + 0.6, hd + 0.6, y1, Math.min(W, D) * 0.3, o.roofColor ?? 0x7a2f2f, wallColor);
  } else {
    ctx.slab(-hw + t, -hd + t, hw - t, hd - t, y1 - SLAB, y1, null, 0x77756f);
    ctx.box(-hw, y1, -hd, hw, y1 + 0.6, -hd + 0.25, wallColor);
    ctx.box(-hw, y1, hd - 0.25, hw, y1 + 0.6, hd, wallColor);
    ctx.box(-hw, y1, -hd + 0.25, -hw + 0.25, y1 + 0.6, hd - 0.25, wallColor);
    ctx.box(hw - 0.25, y1, -hd + 0.25, hw, y1 + 0.6, hd - 0.25, wallColor);
  }

  // Cajas en el interior
  const crate = o.hay ? 0xd9c25a : 0x8b6a40;
  const nCrates = rng.int(3, 6);
  for (let i = 0; i < nCrates; i++) {
    const s = o.hay ? 1.3 : rng.float(1.1, 1.6);
    const x = rng.float(-hw + 2, hw - 4);
    const z = rng.float(mz1 + 1.5, hd - 3.5);
    if (Math.abs(x) < 3 && z > hd - 6) continue;
    ctx.box(x - s / 2, y0, z - s / 2, x + s / 2, y0 + s, z + s / 2, crate);
    if (rng.chance(0.4)) ctx.box(x - s / 2 + 0.1, y0 + s, z - s / 2 + 0.1, x + s / 2 - 0.1, y0 + s * 1.9, z + s / 2 - 0.1, crate);
  }

  ctx.spot(ctx.chestSpots, -hw + t + 1.2, mezzY, -hd + t + 0.8, 0, 0);
  if (rng.chance(0.6)) ctx.spot(ctx.chestSpots, hw * 0.3, mezzY, -hd + t + 0.8, 0, 0);
  if (rng.chance(0.6)) ctx.spot(ctx.chestSpots, -hw + t + 0.8, y0, hd - t - 1.0, 0, 0);
  ctx.spot(ctx.lootSpots, 0, y0, 0);
  ctx.spot(ctx.lootSpots, -hw * 0.4, mezzY, -hd + t + 2.5);
  ctx.spot(ctx.ammoSpots, hw * 0.4, y0, hd * 0.4, 0, 0);
}

// Silo de granja
export function genSilo(ctx, rng) {
  const r = 2.4, h = rng.float(11, 15);
  ctx.geometry(new THREE.CylinderGeometry(r, r, h, 16), 0xb9bdc2, 0, h / 2, 0);
  ctx.geometry(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a3b32, 0, h, 0);
  ctx.colliderOnly(-r * 0.85, -1, -r * 0.85, r * 0.85, h + r * 0.6, r * 0.85, 0xb8bcc0);
}

export function genHay(ctx) {
  ctx.geometry(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 12).rotateZ(Math.PI / 2), 0xd9c25a, 0, 0.8, 0);
  ctx.colliderOnly(-0.7, 0, -0.75, 0.7, 1.55, 0.75, 0xd9c25a);
}

export function genContainer(ctx, rng, stack = 1) {
  const colors = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910, 0x7d3c98];
  for (let s = 0; s < stack; s++) {
    const c = rng.pick(colors);
    const y = s * 2.6;
    ctx.box(-3, y, -1.2, 3, y + 2.6, 1.2, c);
    for (let k = -2.6; k <= 2.6; k += 0.65) ctx.box(k - 0.05, y + 0.1, 1.2, k + 0.05, y + 2.5, 1.26, c, false, 0.15);
  }
}
