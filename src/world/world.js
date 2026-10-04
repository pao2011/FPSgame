import * as THREE from 'three';
import { RNG, createNoise2D } from '../core/rng.js';
import { CollisionWorld } from './collision.js';
import { Terrain } from './terrain.js';
import { GeoBuilder } from './geobuilder.js';
import { BuildingCtx, genHouse, genWarehouse, genSilo, genHay, genContainer, PALETTES } from './buildings.js';
import {
  genShop, genGasStation, genChurch, genWaterTower, genRadioTower, genLighthouse, genBunker, genWatchtower,
  genTent, genFactory, genStadium, genPier, genCrane, genRuins, genFountain, genLamp, genBench, genFence, genSandbags,
} from './structures.js';
import { RoadNetwork, RectIndex } from './roads.js';
import { createNature } from './nature.js';
import { createWater } from './water.js';
import { HALF, ISLAND_RADIUS } from './constants.js';

const POI_NAMES = {
  port: ['Puerto Pez', 'Bahía Brillante'],
  city: ['Ciudad Comercio', 'Rincón Retail'],
  apartments: ['Pisos Picados', 'Torres Inclinadas'],
  industrial: ['Zona Industrial', 'Fábrica Fatal'],
  military: ['Base Bélica', 'Fuerte Feroz'],
  stadium: ['Estadio Estelar', 'Parque Placentero'],
  town: ['Pueblo Tranquilo', 'Colinas Cansadas', 'Pantano Pegajoso', 'Villa Vacía', 'Aldea Alegre', 'Arroyo Apacible'],
  farm: ['Granja Feliz', 'Huerto Hermoso', 'Rancho Risueño'],
};

// El orden importa: el puerto (costero) y la ciudad se colocan primero.
const POI_SPECS = [
  { type: 'port', radius: 64 },
  { type: 'city', radius: 118 },
  { type: 'apartments', radius: 78 },
  { type: 'industrial', radius: 86 },
  { type: 'military', radius: 82 },
  { type: 'stadium', radius: 72 },
  { type: 'town', radius: 88 },
  { type: 'town', radius: 84 },
  { type: 'town', radius: 80 },
  { type: 'town', radius: 78 },
  { type: 'farm', radius: 72 },
  { type: 'farm', radius: 66 },
];

// Rotación (múltiplo de 90°) que hace mirar la puerta (+Z local) hacia (dx, dz).
function rotFacing(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 3 : 1;
  return dz > 0 ? 0 : 2;
}

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.noise = createNoise2D(this.rng.next);
    this.collision = new CollisionWorld(16);
    this.terrain = new Terrain(this.noise);
    this.roads = new RoadNetwork();
    this.occ = new RectIndex(32);
    this.pois = [];
    this.plans = [];
    this.pads = [];
    this.chestSpots = [];
    this.lootSpots = [];
    this.ammoSpots = [];
    this.dummySpots = [];
    this.carSpots = [];
    this.wreckSpots = [];
    this.ladders = [];
    this.generate();
  }

  generate() {
    this.placePOIs();
    for (const poi of this.pois) this.layoutPOI(poi);
    this.planRoads();
    this.planRoadside();
    this.planLandmarks();
    this.terrain.flats = [...this.pois, ...this.pads];
    this.terrain.zones = this.pois;
    this.scene.add(this.terrain.build());
    this.scene.add(this.roads.buildMesh(this.terrain));
    this.buildStructures();
    this.nature = createNature(this, this.rng);
    this.addWater();
    this.addClouds();
  }

  // ------------------------------------------------------------ UTILIDADES
  isFlatEnough(x, z, r, maxVar) {
    let min = Infinity, max = -Infinity;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      for (const rr of [r * 0.5, r]) {
        const h = this.terrain.rawHeight(x + Math.cos(ang) * rr, z + Math.sin(ang) * rr);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    return { ok: max - min < maxVar && min > 2.5, avg: (min + max) / 2, min };
  }

  free(x0, z0, x1, z1) {
    return !this.occ.hit(x0, z0, x1, z1);
  }

  // Añade un plano de estructura si su huella está libre. fw/fd = huella en mundo.
  tryPlan(plan, margin = 1.5) {
    const hw = plan.fw / 2 + margin, hd = plan.fd / 2 + margin;
    if (!this.free(plan.x - hw, plan.z - hd, plan.x + hw, plan.z + hd)) return false;
    if (plan.poi) {
      const r = plan.poi.radius * 0.86;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (Math.hypot(plan.x + (sx * plan.fw) / 2 - plan.poi.x, plan.z + (sz * plan.fd) / 2 - plan.poi.z) > r) return false;
      }
    }
    // evita construir encima de calles/carreteras
    if (!plan.onRoad && this.roadOverlap(plan)) return false;
    this.occ.add(plan.x - plan.fw / 2 - 0.6, plan.z - plan.fd / 2 - 0.6, plan.x + plan.fw / 2 + 0.6, plan.z + plan.fd / 2 + 0.6, plan);
    this.plans.push(plan);
    return true;
  }

  roadOverlap(plan) {
    const hw = plan.fw / 2, hd = plan.fd / 2;
    for (let i = 0; i <= 4; i++) {
      for (let k = 0; k <= 4; k++) {
        const x = plan.x - hw + (plan.fw * i) / 4, z = plan.z - hd + (plan.fd * k) / 4;
        if (this.roads.edgeDistance(x, z, 12) < 0.3) return true;
      }
    }
    return false;
  }

  // Crea un plano con dimensiones locales W×D y rotación; calcula la huella.
  plan(kind, x, z, rot, W, D, extra = {}) {
    const fw = rot % 2 ? D : W, fd = rot % 2 ? W : D;
    return { kind, x, z, rot, W, D, fw, fd, ...extra };
  }

  addCar(x, z, rot, wreck = false) {
    if (!this.free(x - 2.4, z - 2.4, x + 2.4, z + 2.4)) return false;
    (wreck ? this.wreckSpots : this.carSpots).push({ x, z, y: 0, rot });
    this.occ.add(x - 2.3, z - 2.3, x + 2.3, z + 2.3, { car: true });
    return true;
  }

  // ------------------------------------------------------------- ZONAS
  placePOIs() {
    const rng = this.rng;
    const names = {};
    for (const k in POI_NAMES) names[k] = rng.shuffle(POI_NAMES[k].slice());
    for (const spec of POI_SPECS) {
      for (let attempt = 0; attempt < 700; attempt++) {
        const ang = rng.float(0, Math.PI * 2);
        const coastal = spec.type === 'port';
        const dist = coastal ? rng.float(0.62, 0.8) * ISLAND_RADIUS : Math.sqrt(rng.next()) * ISLAND_RADIUS * 0.78;
        const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
        const gap = attempt < 350 ? 80 : 45;
        if (this.pois.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + spec.radius + gap)) continue;
        let seaDir = null;
        if (coastal) {
          const c = this.terrain.rawHeight(x, z);
          if (c < 3 || c > (attempt < 550 ? 16 : 24)) continue;
          for (let k = 0; k < 16 && !seaDir; k++) {
            const a = (k / 16) * Math.PI * 2;
            // sólo direcciones alineadas a los ejes (los muelles son AABB)
            if (k % 4) continue;
            const dx = Math.cos(a), dz = Math.sin(a);
            const reach = spec.radius * (attempt < 350 ? 0.95 : attempt < 550 ? 1.2 : 1.5);
            if (this.terrain.rawHeight(x + dx * reach, z + dz * reach) < -1.5) seaDir = [Math.round(dx), Math.round(dz)];
          }
          if (!seaDir) continue;
        }
        const f = this.isFlatEnough(x, z, spec.radius * (coastal ? 0.6 : 0.95), attempt < 400 ? 18 : 34);
        if (!f.ok && !coastal) continue;
        if (!coastal && f.avg > 40) continue;
        this.pois.push({
          name: names[spec.type].shift() || spec.type, type: spec.type, x, z, radius: spec.radius,
          height: Math.max(3.5, coastal ? Math.max(3.5, this.terrain.rawHeight(x, z)) : f.avg),
          axis: rng.chance(0.5) ? 'x' : 'z', seaDir, gates: [],
        });
        break;
      }
    }
  }

  // Calle recta dentro de una zona (alineada a un eje). Devuelve sus extremos.
  street(poi, axis, offset, halfLen, width = 8) {
    const pts = [];
    for (let s = -halfLen; s <= halfLen + 0.01; s += 6) {
      pts.push(axis === 'x' ? [poi.x + s, poi.z + offset] : [poi.x + offset, poi.z + s]);
    }
    this.roads.add(pts, width, 'street');
    const a = axis === 'x' ? [poi.x - halfLen, poi.z + offset] : [poi.x + offset, poi.z - halfLen];
    const b = axis === 'x' ? [poi.x + halfLen, poi.z + offset] : [poi.x + offset, poi.z + halfLen];
    return { a, b, dirA: axis === 'x' ? [-1, 0] : [0, -1], dirB: axis === 'x' ? [1, 0] : [0, 1] };
  }

  gatesFrom(poi, st) {
    poi.gates.push({ x: st.a[0], z: st.a[1], dir: st.dirA, poi }, { x: st.b[0], z: st.b[1], dir: st.dirB, poi });
  }

  // Parcelas a ambos lados de una calle: casas mirando a la calle.
  lotsAlong(poi, axis, offset, from, to, step, makePlan) {
    const rng = this.rng;
    for (let s = from; s <= to; s += step + rng.float(-1, 2)) {
      for (const side of [-1, 1]) {
        const p = makePlan(side);
        if (!p) continue;
        const depth = p.depth;
        const perp = offset + side * (4 + 2 + depth / 2);
        const x = axis === 'x' ? poi.x + s : poi.x + perp;
        const z = axis === 'x' ? poi.z + perp : poi.z + s;
        // la puerta mira hacia la calle (dirección -side en el eje perpendicular)
        const rot = axis === 'x' ? rotFacing(0, -side) : rotFacing(-side, 0);
        const plan = this.plan(p.kind, x, z, rot, p.W, p.D, { ...p.extra, poi });
        if (p.porch) {
          // el porche sobresale 2.4 m hacia la calle
          plan.fw += axis === 'x' ? 0 : 2.4;
          plan.fd += axis === 'x' ? 2.4 : 0;
        }
        this.tryPlan(plan);
      }
    }
  }

  housePlan(rng, opts = {}) {
    const W = rng.int(9, 12), D = rng.int(8, 10);
    const porch = rng.chance(0.45);
    return {
      kind: 'house', W, D, depth: D + (porch ? 2.4 : 0), porch,
      extra: {
        floors: opts.floors ?? (rng.chance(0.65) ? 2 : 1), roof: 'gable', porch, chimney: rng.chance(0.4),
        wallColor: rng.pick(PALETTES.house), roofColor: rng.pick(PALETTES.roof), chests: 1, chestChance: 0.55,
      },
    };
  }

  layoutPOI(poi) {
    const rng = this.rng;
    const R = poi.radius * 0.9;
    const A = poi.axis, B = A === 'x' ? 'z' : 'x';
    const at = (u, v) => (A === 'x' ? [poi.x + u, poi.z + v] : [poi.x + v, poi.z + u]); // u = eje principal
    const plaza = () => {
      const p = this.plan('fountain', poi.x, poi.z, 0, 7, 7, { noMap: true, onRoad: true });
      this.tryPlan(p, 0.5);
      for (const [du, dv] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
        const [x, z] = at(du, dv);
        this.tryPlan(this.plan('lamp', x, z, 0, 0.6, 0.6, { noMap: true }), 0.2);
      }
      for (const [du, dv] of [[-5, 6.5], [5, 6.5], [-5, -6.5], [5, -6.5]]) {
        const [x, z] = at(du, dv);
        this.tryPlan(this.plan('bench', x, z, A === 'x' ? 0 : 1, 1.8, 0.6, { noMap: true }), 0.2);
      }
      this.dummySpots.push({ x: at(0, 10)[0], z: at(0, 10)[1] });
    };

    switch (poi.type) {
      case 'town': {
        this.gatesFrom(poi, this.street(poi, A, 0, R));
        const cross = this.street(poi, B, 0, R * 0.62);
        this.gatesFrom(poi, cross);
        plaza();
        // Iglesia, tiendas y gasolinera en parcelas destacadas
        const [gx, gz] = at(R - 28, -17);
        this.tryPlan(this.plan('gas', gx, gz, A === 'x' ? 0 : 3, 18, 20, { poi, chests: 1, chestChance: 0.7 }));
        const [cx, cz] = at(rng.chance(0.5) ? 22 : -22, 17.5);
        this.tryPlan(this.plan('church', cx, cz, A === 'x' ? 2 : 1, 18, 18, { poi, chests: 1, chestChance: 0.8 }));
        this.lotsAlong(poi, A, 0, -R + 12, R - 12, 17, () => (rng.chance(0.15)
          ? { kind: 'shop', W: rng.int(11, 14), D: rng.int(9, 11), depth: 11, extra: { sign: rng.pick([0xd63a2f, 0x2f6fd6, 0x2fa84f, 0xe0a020]), chests: 1, chestChance: 0.8 } }
          : this.housePlan(rng)));
        this.lotsAlong(poi, B, 0, -R * 0.62 + 12, R * 0.62 - 10, 17, () => this.housePlan(rng));
        // Calles traseras paralelas a la principal, con su propia fila de casas
        for (const side of [-1, 1]) {
          const off = side * 38;
          this.street(poi, A, off, R * 0.5, 7);
          this.lotsAlong(poi, A, off, -R * 0.5 + 9, R * 0.5 - 9, 15, () => this.housePlan(rng, { floors: rng.chance(0.4) ? 2 : 1 }));
        }
        const [wx, wz] = at(-R * 0.55, -R * 0.45);
        this.tryPlan(this.plan('watertower', wx, wz, A === 'x' ? 0 : 1, 9, 9, { poi, chests: 1, chestChance: 0.7 }));
        // coches aparcados en la calle principal
        for (let i = 0; i < 4; i++) {
          const u = rng.float(-R + 15, R - 15);
          const [x, z] = at(u, rng.chance(0.5) ? 5.4 : -5.4);
          this.addCar(x, z, A === 'x' ? Math.PI / 2 : 0, rng.chance(0.4));
        }
        break;
      }
      case 'city':
      case 'apartments': {
        const city = poi.type === 'city';
        const blk = city ? 36 : 30;
        const lines = city ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
        for (const k of lines) {
          const off = k * blk;
          const hl = Math.sqrt(Math.max(0, (R * 1.0) ** 2 - off * off));
          if (hl < 20) continue;
          const s1 = this.street(poi, A, off, hl, 9);
          const s2 = this.street(poi, B, off, hl, 9);
          if (k === 0) {
            this.gatesFrom(poi, s1);
            this.gatesFrom(poi, s2);
          }
        }
        const half = city ? 2 : 1;
        let plazaDone = false;
        for (let i = -half; i < half; i++) {
          for (let j = -half; j < half; j++) {
            const u = (i + 0.5) * blk, v = (j + 0.5) * blk;
            const [x, z] = at(u, v);
            if (Math.hypot(x - poi.x, z - poi.z) > R * 0.78) continue;
            const inner = blk - 9 - 3;
            const face = rotFacing(poi.x - x, poi.z - z);
            if (!plazaDone && Math.abs(i + 0.5) < 1 && Math.abs(j + 0.5) < 1 && city) {
              plazaDone = true;
              this.tryPlan(this.plan('fountain', x, z, 0, 7, 7, { noMap: true, onRoad: true }), 0.5);
              this.dummySpots.push({ x: x + 6, z }, { x: x - 6, z });
              continue;
            }
            const r = rng.next();
            if (!city || r < 0.42) {
              const S = city ? rng.int(16, Math.min(22, inner)) : rng.int(10, 12);
              this.tryPlan(this.plan('house', x, z, face, S, S, {
                poi, floors: city ? rng.int(4, 8) : rng.int(5, 9), roof: 'flat', roofAccess: true, bigWindows: city,
                wallColor: rng.pick(PALETTES.city), chests: 2, chestChance: 0.8,
              }));
            } else if (r < 0.7) {
              // dos tiendas por manzana
              for (const sgn of [-1, 1]) {
                const [sx, sz] = at(u + sgn * 6.5, v);
                this.tryPlan(this.plan('shop', sx, sz, face, 10, 10, {
                  poi, sign: rng.pick([0xd63a2f, 0x2f6fd6, 0x2fa84f, 0xe0a020, 0x8a3fd6]), chests: 1, chestChance: 0.7,
                }), 0.3);
              }
            } else if (r < 0.88) {
              this.tryPlan(this.plan('house', x, z, face, 14, 14, {
                poi, floors: rng.int(3, 5), roof: 'flat', roofAccess: true, wallColor: rng.pick(PALETTES.city), chests: 1, chestChance: 0.8,
              }));
            } else {
              // aparcamiento
              for (let c = 0; c < 4; c++) this.addCar(x + rng.float(-8, 8), z + rng.float(-8, 8), rng.int(0, 3) * (Math.PI / 2), rng.chance(0.5));
            }
          }
        }
        if (!city) this.dummySpots.push({ x: at(10, 5.8)[0], z: at(10, 5.8)[1] }, { x: at(-10, 5.8)[0], z: at(-10, 5.8)[1] });
        break;
      }
      case 'industrial': {
        this.gatesFrom(poi, this.street(poi, A, 0, R, 9));
        this.gatesFrom(poi, this.street(poi, B, 0, R * 0.7, 9));
        const [fx, fz] = at(24, 24);
        this.tryPlan(this.plan('factory', fx, fz, rotFacing(poi.x - fx, poi.z - fz), 26, 18, {
          poi, wallColor: rng.pick(PALETTES.industrial), roof: 'flat', chests: 2, chestChance: 0.9,
        }), 4);
        for (const [u, v] of [[-26, 24], [-26, -24], [26, -24]]) {
          const [x, z] = at(u, v);
          if (rng.chance(0.75)) {
            this.tryPlan(this.plan('warehouse', x, z, rotFacing(poi.x - x, poi.z - z), rng.int(20, 24), rng.int(14, 16), {
              poi, wallColor: rng.pick(PALETTES.industrial), roof: 'flat', chests: 2, chestChance: 0.8,
            }));
          } else {
            for (let k = 0; k < 4; k++) {
              const [cx, cz] = at(u + (k - 1.5) * 3.4, v);
              this.tryPlan(this.plan('container', cx, cz, A === 'x' ? 0 : 1, 2.6, 6.2, { poi, stack: rng.int(1, 3) }), 0.3);
            }
          }
        }
        const [wx, wz] = at(-R * 0.62, 6);
        this.tryPlan(this.plan('watertower', wx, wz, 0, 9, 9, { poi, chests: 1, chestChance: 0.6 }));
        for (let i = 0; i < 3; i++) this.addCar(...at(rng.float(-R + 10, R - 10), 6), A === 'x' ? Math.PI / 2 : 0, true);
        break;
      }
      case 'military': {
        this.gatesFrom(poi, this.street(poi, A, 0, R, 8));
        this.gatesFrom(poi, this.street(poi, B, 0, R, 8));
        // Valla perimetral con huecos en las calles
        const F = R * 0.62;
        const g = [[-6, 6]];
        for (const [x0, z0, x1, z1] of [[-F, -F, F, -F], [-F, F, F, F], [-F, -F, -F, F], [F, -F, F, F]]) {
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
          this.plans.push({
            kind: 'fence', x: poi.x + mx, z: poi.z + mz, rot: 0, fw: 0.2, fd: 0.2, noMap: true,
            a: [x0 - mx, z0 - mz], b: [x1 - mx, z1 - mz], gaps: g, color: 0x8a8f96,
          });
        }
        for (const [u, v, kind] of [[22, 22, 'bunker'], [-22, -22, 'bunker'], [-24, 20, 'barracks'], [24, -20, 'barracks']]) {
          const [x, z] = at(u, v);
          const face = rotFacing(poi.x - x, poi.z - z);
          if (kind === 'bunker') this.tryPlan(this.plan('bunker', x, z, face, 14, 10, { poi, chests: 2, chestChance: 0.9 }), 4);
          else this.tryPlan(this.plan('house', x, z, face, 18, 8, { poi, floors: 1, roof: 'gable', wallColor: 0x6f7a55, roofColor: 0x4a5530, chests: 1, chestChance: 0.7 }));
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const x = poi.x + sx * (F - 5), z = poi.z + sz * (F - 5);
          this.tryPlan(this.plan('watchtower', x, z, rotFacing(poi.x - x, poi.z - z), 5, 5, { poi, chests: 1, chestChance: 0.6 }), 0.5);
        }
        for (let i = 0; i < 4; i++) {
          const [x, z] = at(34, -16 + i * 7);
          this.tryPlan(this.plan('tent', x, z, A === 'x' ? 1 : 0, 3.4, 4.8, { poi }), 0.8);
        }
        for (let k = 0; k < 3; k++) {
          const [x, z] = at(-14 + k * 4, 34);
          this.tryPlan(this.plan('container', x, z, A === 'x' ? 0 : 1, 2.6, 6.2, { poi, stack: rng.int(1, 2) }), 0.3);
        }
        this.dummySpots.push({ x: at(-8, -34)[0], z: at(-8, -34)[1] }, { x: at(0, -34)[0], z: at(0, -34)[1] }, { x: at(8, -34)[0], z: at(8, -34)[1] });
        this.addCar(...at(10, 6), A === 'x' ? Math.PI / 2 : 0);
        this.addCar(...at(-10, -6), A === 'x' ? -Math.PI / 2 : Math.PI);
        break;
      }
      case 'port': {
        const [sx, sz] = poi.seaDir;
        // Calle paralela a la costa y otra hacia el interior
        const alongCoast = sx !== 0 ? 'z' : 'x';
        const inland = alongCoast === 'x' ? 'z' : 'x';
        this.gatesFrom(poi, this.street(poi, alongCoast, 0, R, 8));
        const st = this.street(poi, inland, 0, R * 0.55, 8);
        // sólo la puerta del lado de tierra
        const landEnd = (sx || sz) > 0 ? { x: st.a[0], z: st.a[1], dir: st.dirA } : { x: st.b[0], z: st.b[1], dir: st.dirB };
        poi.gates.push({ ...landEnd, poi });
        const toLand = [-sx, -sz];
        for (const k of [-1, 1]) {
          const u = k * 26;
          const x = poi.x + (alongCoast === 'x' ? u : 0) + sx * 12;
          const z = poi.z + (alongCoast === 'z' ? u : 0) + sz * 12;
          this.tryPlan(this.plan('warehouse', x, z, rotFacing(sx, sz), 20, 14, {
            poi, wallColor: rng.pick(PALETTES.industrial), roof: 'gable', roofColor: 0x2f4f6f, chests: 2, chestChance: 0.8,
          }));
        }
        for (let k = 0; k < 5; k++) {
          const u = (k - 2) * 3.4 + 22;
          const x = poi.x + (alongCoast === 'x' ? u : 0) + sx * 34;
          const z = poi.z + (alongCoast === 'z' ? u : 0) + sz * 34;
          this.tryPlan(this.plan('container', x, z, alongCoast === 'x' ? 0 : 1, 2.6, 6.2, { poi, stack: rng.int(1, 3) }), 0.3);
        }
        {
          const x = poi.x + sx * 36 - (alongCoast === 'x' ? 20 : 0), z = poi.z + sz * 36 - (alongCoast === 'z' ? 20 : 0);
          this.tryPlan(this.plan('crane', x, z, rotFacing(sx, sz), 3, 3, { poi }), 1);
        }
        {
          const bx = poi.x + toLand[0] * 20 + (alongCoast === 'x' ? 16 : 0);
          const bz = poi.z + toLand[1] * 20 + (alongCoast === 'z' ? 16 : 0);
          this.tryPlan(this.plan('shop', bx, bz, rotFacing(sx, sz), 12, 10, { poi, sign: 0x2f6fd6, chests: 1, chestChance: 0.7 }));
        }
        this.plans.push({ kind: 'pier', x: poi.x, z: poi.z, rot: rotFacing(sx, sz), fw: 0, fd: 0, poi, seaDir: poi.seaDir, chests: 1, chestChance: 0.8, noMap: true });
        this.addCar(poi.x + toLand[0] * 6 + (alongCoast === 'x' ? 12 : 0), poi.z + toLand[1] * 6 + (alongCoast === 'z' ? 12 : 0), alongCoast === 'x' ? Math.PI / 2 : 0);
        break;
      }
      case 'stadium': {
        // Calle lateral que pasa junto al estadio
        const off = 34;
        this.gatesFrom(poi, this.street(poi, A, off, R, 8));
        const face = A === 'x' ? 0 : 3;
        this.tryPlan(this.plan('stadium', poi.x, poi.z, A === 'x' ? 0 : 1, 46, 47, { poi, chests: 2, chestChance: 0.9 }), 0.5);
        for (const u of [-34, 34]) {
          const [x, z] = at(u, off - 13);
          this.tryPlan(this.plan('shop', x, z, A === 'x' ? 0 : 3, 10, 8, { poi, sign: 0xe0a020, chests: 1, chestChance: 0.6 }));
        }
        for (let i = 0; i < 6; i++) this.addCar(...at(-24 + i * 9, off + 9), face * 0 + (A === 'x' ? 0 : Math.PI / 2), rng.chance(0.3));
        for (let i = 0; i < 3; i++) {
          const [x, z] = at(-12 + i * 12, -34);
          this.tryPlan(this.plan('tent', x, z, A === 'x' ? 0 : 1, 3.4, 4.8, { poi }), 0.8);
        }
        break;
      }
      case 'farm': {
        this.gatesFrom(poi, this.street(poi, A, 0, R, 6));
        const [bx, bz] = at(14, 20);
        this.tryPlan(this.plan('warehouse', bx, bz, rotFacing(poi.x - bx, poi.z - bz), 18, 14, {
          poi, roof: 'gable', wallColor: 0xa8322b, roofColor: 0x5b4636, stripe: 0xf2efe6, hay: true, height: 6.5, chests: 2, chestChance: 0.8,
        }));
        const [hx, hz] = at(-16, 14);
        this.tryPlan(this.plan('house', hx, hz, rotFacing(poi.x - hx, poi.z - hz), 11, 10, {
          poi, floors: 2, roof: 'gable', porch: false, chimney: true, wallColor: rng.pick(PALETTES.house), roofColor: rng.pick(PALETTES.roof), chests: 1, chestChance: 0.8,
        }));
        for (const k of [0, 1]) {
          const [sx, sz] = at(30 + k * 6, 34);
          this.tryPlan(this.plan('silo', sx, sz, 0, 5, 5, { poi }), 0.3);
        }
        const [tx, tz] = at(-30, 28);
        this.tryPlan(this.plan('watchtower', tx, tz, 0, 5, 5, { poi, chests: 1, chestChance: 0.5 }), 0.5);
        // Campos vallados con balas de paja al otro lado de la calle
        for (const u of [-24, 12]) {
          const fwU = 30, fwV = 22;
          const [fx, fz] = at(u, -20);
          const along = A === 'x';
          const hu = fwU / 2, hv = fwV / 2;
          const corners = along ? [[-hu, -hv, hu, -hv], [-hu, hv, hu, hv], [-hu, -hv, -hu, hv], [hu, -hv, hu, hv]] : [[-hv, -hu, hv, -hu], [-hv, hu, hv, hu], [-hv, -hu, -hv, hu], [hv, -hu, hv, hu]];
          corners.forEach(([x0, z0, x1, z1], idx) => {
            const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
            this.plans.push({
              kind: 'fence', x: fx + mx, z: fz + mz, rot: 0, fw: 0.2, fd: 0.2, noMap: true,
              a: [x0 - mx, z0 - mz], b: [x1 - mx, z1 - mz], gaps: idx === 1 ? [[-2, 2]] : [], color: 0xc8a878,
            });
          });
          this.occ.add(fx - (along ? hu : hv), fz - (along ? hv : hu), fx + (along ? hu : hv), fz + (along ? hv : hu), { field: true });
          for (let h = 0; h < 4; h++) {
            const x = fx + rng.float(-8, 8), z = fz + rng.float(-6, 6);
            this.plans.push({ kind: 'hay', x, z, rot: rng.int(0, 3), fw: 1.6, fd: 1.6, poi });
          }
        }
        this.addCar(...at(-4, 6), A === 'x' ? Math.PI / 2 : 0);
        break;
      }
    }
  }

  // ------------------------------------------------------------ CARRETERAS
  planRoads() {
    const rng = this.rng;
    const P = this.pois;
    if (P.length < 2) return;
    // Árbol de expansión mínima + algunas conexiones extra
    const edges = [];
    const inTree = new Set([0]);
    while (inTree.size < P.length) {
      let best = null;
      for (const i of inTree) {
        for (let j = 0; j < P.length; j++) {
          if (inTree.has(j)) continue;
          const d = Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z);
          if (!best || d < best.d) best = { i, j, d };
        }
      }
      inTree.add(best.j);
      edges.push([best.i, best.j]);
    }
    for (let i = 0; i < P.length; i++) {
      const near = P.map((q, j) => ({ j, d: Math.hypot(q.x - P[i].x, q.z - P[i].z) })).filter((e) => e.j !== i).sort((a, b) => a.d - b.d);
      for (const n of near.slice(0, 2)) {
        if (n.d < 560 && rng.chance(0.5) && !edges.some(([a, b]) => (a === i && b === n.j) || (a === n.j && b === i))) edges.push([i, n.j]);
      }
    }
    this.roadEdges = [];
    for (const [i, j] of edges) {
      const pts = this.routeRoad(P[i], P[j]);
      if (!pts) continue;
      this.roads.add(pts, 7, 'road');
      this.roadEdges.push(pts);
      // Aplanar el terreno a lo largo de la carretera (perfil suavizado)
      const hs = pts.map(([x, z]) => {
        for (const p of [P[i], P[j]]) if (Math.hypot(x - p.x, z - p.z) < p.radius * 1.05) return p.height;
        return Math.max(1.5, this.terrain.rawHeight(x, z));
      });
      const sm = hs.map((_, k) => {
        let s = 0, n = 0;
        for (let q = Math.max(0, k - 6); q <= Math.min(hs.length - 1, k + 6); q++) {
          s += hs[q];
          n++;
        }
        return s / n;
      });
      for (let k = 0; k < pts.length; k += 2) {
        const [x, z] = pts[k];
        if (this.pois.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius * 0.85)) continue;
        this.pads.push({ x, z, radius: 7.5, height: sm[k] });
      }
    }
  }

  // Trazado curvo entre la mejor puerta de cada zona; evita agua y otras zonas.
  routeRoad(A, B) {
    const rng = this.rng;
    const pickGate = (P, Q) => {
      let best = null, bd = Infinity;
      for (const g of P.gates) {
        const d = Math.hypot(g.x - Q.x, g.z - Q.z);
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      return best;
    };
    const ga = pickGate(A, B), gb = pickGate(B, A);
    if (!ga || !gb) return null;
    const a2 = [ga.x + ga.dir[0] * 25, ga.z + ga.dir[1] * 25];
    const b2 = [gb.x + gb.dir[0] * 25, gb.z + gb.dir[1] * 25];
    const dist = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
    for (let attempt = 0; attempt < 14; attempt++) {
      const ctrl = [[ga.x, ga.z], a2];
      const n = Math.max(1, Math.floor(dist / 70));
      const nx = -(b2[1] - a2[1]) / dist, nz = (b2[0] - a2[0]) / dist;
      const amp = Math.min(60, dist * 0.12) * (attempt < 6 ? 1 + attempt * 0.4 : 0.15 * attempt) * (attempt % 2 ? -1 : 1);
      const phase = rng.float(0, Math.PI * 2);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const off = Math.sin(t * Math.PI) * amp * Math.sin(phase + t * 4.0) + rng.float(-8, 8);
        ctrl.push([a2[0] + (b2[0] - a2[0]) * t + nx * off, a2[1] + (b2[1] - a2[1]) * t + nz * off]);
      }
      ctrl.push(b2, [gb.x, gb.z]);
      const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
      const len = curve.getLength();
      const pts = curve.getSpacedPoints(Math.max(4, Math.round(len / 5))).map((v) => [v.x, v.z]);
      let ok = true;
      for (const [x, z] of pts) {
        const h = this.terrain.rawHeight(x, z);
        const inA = Math.hypot(x - A.x, z - A.z) < A.radius * 1.1;
        const inB = Math.hypot(x - B.x, z - B.z) < B.radius * 1.1;
        if (!inA && !inB && (h < 1.0 || h > 62)) { ok = false; break; }
        if (this.pois.some((p) => p !== A && p !== B && Math.hypot(x - p.x, z - p.z) < p.radius * 0.98)) { ok = false; break; }
        if (!inA && !inB && this.occ.hit(x - 3, z - 3, x + 3, z + 3)) { ok = false; break; }
      }
      if (ok) return pts;
    }
    return null;
  }

  // ------------------------------------------------ JUNTO A LAS CARRETERAS
  planRoadside() {
    const rng = this.rng;
    let gas = 0;
    for (const pts of this.roadEdges || []) {
      let acc = rng.float(30, 90);
      for (let k = 1; k < pts.length - 1; k++) {
        acc -= Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        if (acc > 0) continue;
        acc = rng.float(90, 170);
        const [x, z] = pts[k];
        if (this.pois.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius * 1.4)) continue;
        const tx = pts[k + 1][0] - pts[k - 1][0], tz = pts[k + 1][1] - pts[k - 1][1];
        const tl = Math.hypot(tx, tz);
        const side = rng.chance(0.5) ? 1 : -1;
        const nx = (-tz / tl) * side, nz = (tx / tl) * side;
        const r = rng.next();
        let p;
        if (r < 0.2 && gas < 3) p = { kind: 'gas', W: 18, D: 20, extra: { chests: 1, chestChance: 0.7 } };
        else if (r < 0.62) p = this.housePlan(rng);
        else if (r < 0.75) p = { kind: 'shop', W: 12, D: 10, extra: { sign: rng.pick([0xd63a2f, 0x2f6fd6, 0x2fa84f]), chests: 1, chestChance: 0.7 } };
        else if (r < 0.88) p = { kind: 'house', W: 7, D: 6, extra: { floors: 1, roof: 'gable', chimney: true, wallColor: 0x8a5a32, roofColor: 0x4a3a2a, chests: 1, chestChance: 0.6 } };
        else p = { kind: 'warehouse', W: 16, D: 12, extra: { roof: 'gable', wallColor: 0xa8322b, roofColor: 0x5b4636, stripe: 0xf2efe6, hay: true, height: 6, chests: 1, chestChance: 0.7 } };
        const depth = Math.max(p.W, p.D);
        const off = 3.5 + 4 + depth / 2;
        const cx = x + nx * off, cz = z + nz * off;
        const f = this.isFlatEnough(cx, cz, depth * 0.6, 7);
        if (!f.ok || f.avg > 45) continue;
        const rot = rotFacing(-nx, -nz);
        const plan = this.plan(p.kind, cx, cz, rot, p.W, p.D, { ...p.extra, pad: { x: cx, z: cz, radius: depth * 0.8 + 2, height: f.avg } });
        if (p.kind === 'gas' && this.tryPlan(plan)) {
          gas++;
          this.pads.push(plan.pad);
        } else if (p.kind !== 'gas' && this.tryPlan(plan)) {
          this.pads.push(plan.pad);
          if (rng.chance(0.4)) this.addCar(x + nx * 5.5, z + nz * 5.5, Math.atan2(-tx, -tz), rng.chance(0.6));
        }
      }
    }
  }

  // -------------------------------------------------- PUNTOS DESTACADOS
  randomLand(rng, maxR = ISLAND_RADIUS * 0.85) {
    const a = rng.float(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * maxR;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  awayFromAll(x, z, r) {
    if (this.pois.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius * 1.2 + r)) return false;
    if (this.roads.edgeDistance(x, z, 40) < r + 4) return false;
    return this.free(x - r, z - r, x + r, z + r);
  }

  addLandmark(kind, x, z, rot, W, D, extra = {}, padH = null) {
    const f = this.isFlatEnough(x, z, Math.max(W, D) * 0.6, 12);
    const h = padH ?? f.avg;
    const plan = this.plan(kind, x, z, rot, W, D, { ...extra, pad: { x, z, radius: Math.max(W, D) * 0.75 + 2, height: h } });
    if (this.tryPlan(plan)) {
      this.pads.push(plan.pad);
      return plan;
    }
    return null;
  }

  planLandmarks() {
    const rng = this.rng;
    // Antena de radio en la cima más alta accesible
    let best = null;
    for (let i = 0; i < 4000; i++) {
      const [x, z] = this.randomLand(rng, ISLAND_RADIUS * 0.75);
      const h = this.terrain.rawHeight(x, z);
      if (best && h <= best.h) continue;
      if (!this.awayFromAll(x, z, 14)) continue;
      if (!this.isFlatEnough(x, z, 9, 9).ok) continue;
      best = { x, z, h };
    }
    if (best) this.addLandmark('radio', best.x, best.z, rng.int(0, 3), 16, 12, { chests: 1, chestChance: 0.9 });
    // Faro en la costa (lejos del puerto)
    const port = this.pois.find((p) => p.type === 'port');
    for (let i = 0; i < 3000; i++) {
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(0.66, 0.84) * ISLAND_RADIUS;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = this.terrain.rawHeight(x, z);
      if (h < 3 || h > 14) continue;
      if (port && Math.hypot(x - port.x, z - port.z) < 350) continue;
      if (this.terrain.rawHeight(x * 1.08, z * 1.08) > -1) continue;
      if (!this.awayFromAll(x, z, 12)) continue;
      if (this.addLandmark('lighthouse', x, z, rotFacing(-x, -z), 22, 12, { chests: 1, chestChance: 0.9 }, Math.max(3, h))) break;
    }
    const scatter = (kind, count, W, D, extra, test) => {
      let n = 0;
      for (let i = 0; i < 2500 && n < count; i++) {
        const [x, z] = this.randomLand(rng);
        if (!this.awayFromAll(x, z, Math.max(W, D) / 2 + 6)) continue;
        if (test && !test(x, z)) continue;
        const f = this.isFlatEnough(x, z, Math.max(W, D) * 0.6, 6);
        if (!f.ok || f.avg > 46) continue;
        if (this.addLandmark(kind, x, z, rng.int(0, 3), W, D, typeof extra === 'function' ? extra() : extra)) n++;
      }
    };
    const forest = (x, z) => this.noise(x * 0.006 + 300, z * 0.006) > 0.1;
    scatter('house', 5, 7, 6, () => ({ floors: 1, roof: 'gable', chimney: true, wallColor: 0x8a5a32, roofColor: 0x4a3a2a, chests: 1, chestChance: 0.8 }), forest);
    scatter('ruins', 3, 13, 10, { chests: 1, chestChance: 0.9 });
    scatter('watchtower', 4, 5, 5, { chests: 1, chestChance: 0.6 });
    scatter('watertower', 2, 9, 9, { chests: 1, chestChance: 0.7 });
    scatter('bunker', 2, 14, 10, { chests: 2, chestChance: 0.8 });
    // Campamentos: 3 tiendas en círculo
    let camps = 0;
    for (let i = 0; i < 2000 && camps < 3; i++) {
      const [x, z] = this.randomLand(rng);
      if (!forest(x, z) || !this.awayFromAll(x, z, 12)) continue;
      const f = this.isFlatEnough(x, z, 9, 4);
      if (!f.ok) continue;
      this.pads.push({ x, z, radius: 12, height: f.avg });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const tx = x + Math.cos(a) * 6, tz = z + Math.sin(a) * 6;
        this.tryPlan(this.plan('tent', tx, tz, rotFacing(x - tx, z - tz), 3.4, 4.8, {}), 0.5);
      }
      this.plans.push({ kind: 'campfire', x, z, rot: 0, fw: 1.5, fd: 1.5, noMap: true });
      camps++;
    }
  }

  // ------------------------------------------------------- CONSTRUCCIÓN
  buildStructures() {
    const geo = new GeoBuilder();
    const rng = this.rng;
    for (const p of this.plans) {
      let y = this.terrain.heightAt(p.x, p.z);
      if (p.kind === 'pier') {
        const r = this.placePier(p);
        if (!r) continue;
        y = r.y;
      }
      const ctx = new BuildingCtx(geo, this.collision, p.x, y, p.z, p.rot);
      switch (p.kind) {
        case 'house': genHouse(ctx, rng, p); break;
        case 'warehouse': genWarehouse(ctx, rng, p); break;
        case 'factory': genFactory(ctx, rng, p); break;
        case 'shop': genShop(ctx, rng, p); break;
        case 'gas': genGasStation(ctx, rng); break;
        case 'church': genChurch(ctx, rng); break;
        case 'watertower': genWaterTower(ctx); break;
        case 'radio': genRadioTower(ctx, rng); break;
        case 'lighthouse': genLighthouse(ctx, rng); break;
        case 'bunker': genBunker(ctx, rng); break;
        case 'watchtower': genWatchtower(ctx); break;
        case 'tent': genTent(ctx, rng); break;
        case 'stadium': genStadium(ctx, rng); break;
        case 'pier': genPier(ctx, rng, { length: p.length, deckLocal: 1.6 - y }); break;
        case 'crane': genCrane(ctx); break;
        case 'ruins': genRuins(ctx, rng); break;
        case 'fountain': genFountain(ctx); break;
        case 'lamp': genLamp(ctx); break;
        case 'bench': genBench(ctx); break;
        case 'silo': genSilo(ctx, rng); break;
        case 'hay': genHay(ctx); break;
        case 'container': genContainer(ctx, rng, p.stack); break;
        case 'fence': genFence(ctx, p.a[0], p.a[1], p.b[0], p.b[1], p.gaps, p.color); break;
        case 'sandbags': genSandbags(ctx, -p.W / 2, -0.3, p.W / 2, 0.3); break;
        case 'campfire':
          ctx.geometry(new THREE.CylinderGeometry(0.9, 1.0, 0.25, 10), 0x555555, 0, 0.12, 0);
          ctx.box(-0.5, 0.2, -0.08, 0.5, 0.35, 0.08, 0x6b4a2b, false);
          ctx.box(-0.08, 0.2, -0.5, 0.08, 0.35, 0.5, 0x6b4a2b, false);
          ctx.spot(ctx.chestSpots, 2.2, 0.05, 0, 0, 0);
          p.chests = 1;
          p.chestChance = 0.5;
          break;
      }
      // Pocos cofres: se elige un subconjunto de los candidatos
      const cands = rng.shuffle(ctx.chestSpots.slice());
      const max = p.chests ?? 1;
      const n = rng.chance(p.chestChance ?? 0.6) ? Math.min(cands.length, max > 1 ? rng.int(1, max) : 1) : 0;
      this.chestSpots.push(...cands.slice(0, n));
      // Si no hay cofre, el hueco puede tener botín en el suelo
      for (const c of cands.slice(n, n + 1)) if (rng.chance(0.35)) this.lootSpots.push(c);
      this.lootSpots.push(...ctx.lootSpots);
      this.ammoSpots.push(...ctx.ammoSpots);
      this.ladders.push(...ctx.ladders);
    }
    for (const d of this.dummySpots) d.y = this.terrain.heightAt(d.x, d.z);
    for (const c of [...this.carSpots, ...this.wreckSpots]) c.y = this.terrain.heightAt(c.x, c.z);
    this.buildingMesh = geo.build();
    this.buildingMesh.name = 'buildings';
    this.scene.add(this.buildingMesh);
  }

  // Busca la orilla en la dirección del mar y coloca allí el muelle.
  placePier(p) {
    const [sx, sz] = p.seaDir;
    let shore = null;
    for (let d = p.poi.radius * 0.5; d < p.poi.radius * 2.2; d += 1) {
      const x = p.poi.x + sx * d, z = p.poi.z + sz * d;
      if (this.terrain.heightAt(x, z) < 0.8) {
        shore = { x: p.poi.x + sx * (d - 4), z: p.poi.z + sz * (d - 4) };
        break;
      }
    }
    if (!shore) return null;
    p.x = shore.x;
    p.z = shore.z;
    p.length = 40;
    p.fw = sx ? 50 : 14;
    p.fd = sz ? 50 : 14;
    const cx = p.x + sx * 25, cz = p.z + sz * 25;
    this.occ.add(cx - p.fw / 2, cz - p.fd / 2, cx + p.fw / 2, cz + p.fd / 2, p);
    return { y: this.terrain.heightAt(p.x, p.z) };
  }

  occupied(x, z, margin = 0) {
    return !!this.occ.hit(x - margin, z - margin, x + margin, z + margin);
  }

  poiAt(x, z) {
    for (const p of this.pois) if (Math.hypot(p.x - x, p.z - z) < p.radius) return p;
    return null;
  }

  addWater() {
    this.water = createWater(this.scene, this.terrain, new THREE.Vector3(0.45, 0.8, 0.35));
  }

  addClouds() {
    const rng = this.rng;
    const geos = [];
    const base = new THREE.IcosahedronGeometry(1, 1);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 80; i++) {
      const cx = rng.float(-HALF * 1.3, HALF * 1.3), cz = rng.float(-HALF * 1.3, HALF * 1.3);
      const cy = rng.float(160, 300);
      const n = rng.int(4, 8);
      for (let k = 0; k < n; k++) {
        const s = rng.float(8, 18);
        m.compose(
          new THREE.Vector3(cx + rng.float(-20, 20), cy + rng.float(-3, 5), cz + rng.float(-12, 12)),
          new THREE.Quaternion(),
          new THREE.Vector3(s * 1.4, s * 0.6, s),
        );
        geos.push(base.clone().applyMatrix4(m));
      }
    }
    let count = 0;
    for (const g of geos) count += g.attributes.position.count;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o);
      nor.set(g.attributes.normal.array, o);
      o += g.attributes.position.array.length;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, emissive: 0x666666 });
    this.clouds = new THREE.Mesh(geo, cm);
    this.scene.add(this.clouds);
  }

  // Altura del suelo (terreno o techo) bajo un punto, buscando desde `fromY`.
  groundBelow(x, z, fromY) {
    let h = this.terrain.heightAt(x, z);
    const hit = this.collision.raycast(x, fromY, z, 0, -1, 0, fromY - h + 1);
    if (hit) h = Math.max(h, fromY - hit.t);
    return h;
  }

  // Volumen de escalera de mano que contiene el punto (o null).
  ladderAt(x, y, z, r = 0.35) {
    for (const l of this.ladders) {
      if (x + r > l.minX && x - r < l.maxX && z + r > l.minZ && z - r < l.maxZ && y < l.maxY && y + 1.8 > l.minY) return l;
    }
    return null;
  }
}
