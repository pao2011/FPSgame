import * as THREE from 'three';
import { RNG, createNoise2D } from '../core/rng.js';
import { CollisionWorld } from './collision.js';
import { Terrain } from './terrain.js';
import { GeoBuilder } from './geobuilder.js';
import { BuildingCtx, genHouse, genWarehouse, genSilo, genHay, genContainer, PALETTES } from './buildings.js';
import {
  genShop, genGasStation, genChurch, genWaterTower, genRadioTower, genLighthouse, genBunker, genWatchtower,
  genTent, genFactory, genStadium, genPier, genCrane, genRuins, genFountain, genLamp, genBench, genFence, genSandbags,
  genWindmill, genCastle, genMarket,
} from './structures.js';
import { RoadNetwork, RectIndex } from './roads.js';
import { createNature } from './nature.js';
import { createWater } from './water.js';
import { createLobbyIsland } from './lobby.js';
import { Hydro } from './hydro.js';
import { Site, CELL, buildSite, buildHalos } from './underground.js';
import { HALF, ISLAND_RADIUS } from './constants.js';

const POI_NAMES = {
  port: ['Puerto Pez', 'Bahía Brillante'],
  city: ['Ciudad Comercio', 'Rincón Retail'],
  apartments: ['Pisos Picados', 'Torres Inclinadas'],
  industrial: ['Zona Industrial', 'Fábrica Fatal'],
  military: ['Base Bélica', 'Fuerte Feroz'],
  stadium: ['Estadio Estelar', 'Parque Placentero'],
  town: ['Pueblo Tranquilo', 'Colinas Cansadas', 'Pantano Pegajoso', 'Villa Vacía', 'Aldea Alegre', 'Arroyo Apacible', 'Cruce Curioso'],
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
  // Zonas pequeñas extra: más sitios donde aterrizar y pelear
  { type: 'town', radius: 66 },
  { type: 'apartments', radius: 60 },
];

// Rotación (múltiplo de 90°) que hace mirar la puerta (+Z local) hacia (dx, dz).
function rotFacing(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 3 : 1;
  return dz > 0 ? 0 : 2;
}

export class World {
  // opts.creative: isla plana y vacía para el modo creativo.
  constructor(scene, seed, opts = {}) {
    this.scene = scene;
    this.seed = seed;
    this.creative = !!opts.creative;
    this.rng = new RNG(seed);
    this.noise = createNoise2D(this.rng.next);
    this.collision = new CollisionWorld(16);
    this.terrain = new Terrain(this.noise, { flat: this.creative });
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
    this.doors = [];
    this.landmarks = []; // lugares destacados con nombre (mapa)
    this.hydro = new Hydro(); // ríos y lagos
    this.sites = []; // cuevas y trincheras
    this.generate();
  }

  generate() {
    if (!this.creative) {
      this.placePOIs();
      for (const poi of this.pois) this.layoutPOI(poi);
      this.planWater();
      this.planUnderground();
      this.planRoads();
      this.planRoadside();
      this.planLandmarks();
    }
    this.terrain.flats = [...this.pois, ...this.pads];
    this.terrain.zones = this.pois;
    this.terrain.hydro = this.hydro.lakes.length || this.hydro.rivers.length ? this.hydro : null;
    this.hydro.buildMask(HALF);
    // Nivel de agua más alto de la isla (por encima, seguro que no hay agua)
    this.maxWaterLevel = Math.max(0, ...this.hydro.lakes.map((l) => l.level), ...this.hydro.rivers.map((r) => r.s[0]));
    this.terrain.roadNet = this.roads;
    this.terrain.sites = this.sites;
    this.scene.add(this.terrain.build());
    this.scene.add(this.roads.buildMesh(this.terrain));
    this.buildStructures();
    this.nature = createNature(this, this.rng);
    this.addWater();
    this.addClouds();
    this.lobby = createLobbyIsland(this);
    this.dummySpots.push(...this.lobby.dummies);
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
    // evita construir encima de calles/carreteras y junto al agua
    if (!plan.onRoad && this.roadOverlap(plan)) return false;
    if (!plan.poi && this.hydro.edgeDistance(plan.x, plan.z) < Math.max(plan.fw, plan.fd) * 0.75 + 8) return false;
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
    if (this.hydro.edgeDistance(x, z) < 6) return false;
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
        // Zonas algo más juntas hacia el centro: menos caminata entre peleas
        const dist = coastal ? rng.float(0.62, 0.8) * ISLAND_RADIUS : Math.sqrt(rng.next()) * ISLAND_RADIUS * 0.72;
        const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
        const gap = attempt < 350 ? 60 : 40;
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

  // ------------------------------------------------------------ AGUA
  // Lagos en hondonadas y ríos que bajan de ellos (o de una fuente en lo
  // alto) hasta el mar. Se planean antes que las carreteras: éstas rodean
  // los lagos y cruzan los ríos por puentes.
  planWater() {
    const rng = this.rng;
    const t = this.terrain;
    const H = this.hydro;
    const names = rng.shuffle(['Lago Sereno', 'Laguna Azul', 'Lago Espejo']);
    for (let i = 0; i < 4000 && H.lakes.length < 3; i++) {
      const [x, z] = this.randomLand(rng, ISLAND_RADIUS * 0.72);
      const R = rng.float(30, 50);
      if (this.pois.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius * 1.6 + R * 1.45 + 12)) continue;
      if (H.lakes.some((l) => Math.hypot(l.x - x, l.z - z) < (l.R + R) * 1.6 + 80)) continue;
      const lake = { x, z, R, p1: rng.float(0, Math.PI * 2), p2: rng.float(0, Math.PI * 2), depth: rng.float(3.5, 5.5) };
      // La orilla debe ser bastante uniforme para que el agua no "se salga"
      let min = Infinity, max = -Infinity;
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const r = H.lakeShoreR(lake, x + Math.cos(a), z + Math.sin(a));
        for (const q of [1.0, 1.15, 1.3, 1.45]) {
          const h = t.rawHeight(x + Math.cos(a) * r * q, z + Math.sin(a) * r * q);
          min = Math.min(min, h);
          max = Math.max(max, h);
        }
      }
      if (max - min > 10 || min < 4 || min > 40) continue;
      lake.level = min - 0.6;
      lake.name = names.pop();
      H.addLake(lake);
      this.landmarks.push({ name: lake.name, x, z });
    }
    let rivers = 0;
    for (const lake of rng.shuffle(H.lakes.slice())) {
      if (rivers >= 2) break;
      if (this.planRiver({ lake, x: lake.x, z: lake.z })) rivers++;
    }
    // Si faltan ríos: nacen en un manantial en lo alto
    for (let i = 0; i < 3000 && rivers < 2; i++) {
      const [x, z] = this.randomLand(rng, ISLAND_RADIUS * 0.6);
      const h = t.rawHeight(x, z);
      if (h < 22 || h > 42) continue;
      if (this.pois.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius * 1.4 + 30)) continue;
      if (H.edgeDistance(x, z) < 120) continue;
      if (this.planRiver({ x, z })) rivers++;
    }
  }

  planRiver(src) {
    const t = this.terrain;
    const H = this.hydro;
    // Salida hacia la costa más cercana
    let bestDir = null;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      let d = 30, pen = 0;
      for (; d < 900; d += 10) {
        const x = src.x + Math.cos(a) * d, z = src.z + Math.sin(a) * d;
        if (t.rawHeight(x, z) < -1.5) break;
        if (this.pois.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius * 1.3)) pen += 40;
      }
      // Ríos largos (que crucen parte de la isla) pero sin pasar por las zonas
      if (d < 900 && d > 120 && (!bestDir || Math.abs(d - 400) + pen < bestDir.cost)) bestDir = { a, cost: Math.abs(d - 400) + pen };
    }
    if (!bestDir) return null;
    let a = bestDir.a;
    const a0 = a;
    let x = src.x, z = src.z;
    if (src.lake) {
      const r = H.lakeShoreR(src.lake, x + Math.cos(a), z + Math.sin(a));
      x += Math.cos(a) * (r - 2);
      z += Math.sin(a) * (r - 2);
    }
    const raw = [[x, z]];
    let reached = false;
    for (let step = 0; step < 150 && !reached; step++) {
      let bc = Infinity, bx = 0, bz = 0, ba = a;
      for (let k = -4; k <= 4; k++) {
        const na = a + k * 0.2;
        const nx = x + Math.cos(na) * 10, nz = z + Math.sin(na) * 10;
        // Busca el valle (más bajo), sin girar bruscamente, hacia fuera de la isla
        // Rumbo general hacia la costa elegida, con meandros
        const want = a0 + Math.sin(step * 0.22 + a0 * 3) * 0.55;
        const off = Math.abs(Math.atan2(Math.sin(na - want), Math.cos(na - want)));
        let c = t.rawHeight(nx, nz) + Math.abs(k) * 0.3 + off * 2.2 + this.noise(nx * 0.012 + 77, nz * 0.012) * 1.5;
        c -= (Math.hypot(nx, nz) - Math.hypot(x, z)) * 0.15;
        for (const p of this.pois) if (Math.hypot(p.x - nx, p.z - nz) < p.radius * 1.35 + 18) c += 1000;
        for (const l of H.lakes) if (H.lakeEdge(l, nx, nz) < (l === src.lake ? 0 : 30)) c += 1000;
        if (H.riverAt(nx, nz, 40)) c += 1000;
        if (c < bc) {
          bc = c;
          bx = nx;
          bz = nz;
          ba = na;
        }
      }
      if (bc >= 1000) return null;
      x = bx;
      z = bz;
      a = ba;
      raw.push([x, z]);
      reached = t.rawHeight(x, z) < -1.5;
    }
    if (!reached || raw.length < 12) return null;
    const curve = new THREE.CatmullRomCurve3(raw.map(([px, pz]) => new THREE.Vector3(px, 0, pz)), false, 'centripetal');
    const pts = curve.getSpacedPoints(Math.max(8, Math.round(curve.getLength() / 4))).map((v) => [v.x, v.z]);
    if (pts.some(([px, pz]) => this.pois.some((p) => Math.hypot(p.x - px, p.z - pz) < p.radius * 1.3 + 10))) return null;
    const n = pts.length;
    // Superficie: siempre bajando, por debajo del terreno y sin saltos bruscos
    const s = new Array(n);
    let cur = src.lake ? src.lake.level : t.rawHeight(pts[0][0], pts[0][1]) - 1.8;
    for (let k = 0; k < n; k++) {
      cur = Math.min(cur, t.rawHeight(pts[k][0], pts[k][1]) - 1.6);
      s[k] = Math.max(0, cur);
    }
    for (let k = n - 2; k >= 0; k--) s[k] = Math.min(s[k], s[k + 1] + 0.45);
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 1; k < n - 1; k++) s[k] = s[k - 1] * 0.25 + s[k] * 0.5 + s[k + 1] * 0.25;
      for (let k = 1; k < n; k++) s[k] = Math.min(s[k], s[k - 1]);
    }
    if (src.lake) src.lake.level = Math.min(src.lake.level, s[0]);
    const river = {
      pts, s, depth: 1.9,
      hw: pts.map((_, k) => 4.5 + 3 * (k / (n - 1))),
      ribbonFrom: 0, ribbonTo: n - 1,
    };
    if (src.lake) while (river.ribbonFrom < n - 1 && H.lakeEdge(src.lake, pts[river.ribbonFrom][0], pts[river.ribbonFrom][1]) < 4) river.ribbonFrom++;
    while (river.ribbonTo > river.ribbonFrom && s[river.ribbonTo - 1] <= 0.05) river.ribbonTo--;
    H.addRiver(river);
    return river;
  }

  // ------------------------------------------------------- BAJO TIERRA
  // Cuevas (salas y túneles cubiertos, con antorchas y cristales) y
  // trincheras (zigzag a cielo abierto con refugios cubiertos y faroles).
  planUnderground() {
    const rng = this.rng;
    const specs = [
      { kind: 'cave', name: 'Cueva Cristal' },
      { kind: 'trench', name: 'Trincheras' },
      { kind: 'cave', name: 'Gruta Sombría' },
      { kind: 'trench', name: 'Frente Embarrado' },
    ];
    for (const spec of specs) {
      const cave = spec.kind === 'cave';
      for (let attempt = 0; attempt < 3000; attempt++) {
        const nx = cave ? rng.int(14, 16) : rng.int(13, 15);
        const nz = cave ? rng.int(12, 14) : nx;
        const [x, z] = this.randomLand(rng, ISLAND_RADIUS * 0.7);
        const half = (Math.hypot(nx, nz) * CELL) / 2;
        const padR = (half + 3) / 0.85;
        if (this.sites.some((q) => Math.hypot(q.x - x, q.z - z) < 220)) continue;
        if (!this.awayFromAll(x, z, padR * 0.9)) continue;
        const f = this.isFlatEnough(x, z, padR, attempt < 1500 ? 7 : 11);
        if (!f.ok || f.avg < 4 || f.avg > 44) continue;
        const ox = -HALF + CELL * Math.round((x - (nx * CELL) / 2 + HALF) / CELL);
        const oz = -HALF + CELL * Math.round((z - (nz * CELL) / 2 + HALF) / CELL);
        const site = new Site(spec.kind, spec.name, ox, oz, nx, nz, f.avg);
        if (cave) site.layoutCave(rng);
        else site.layoutTrench(rng);
        site.finalize();
        this.sites.push(site);
        this.pads.push({ x: site.x, z: site.z, radius: padR, height: f.avg });
        this.occ.add(ox - 3, oz - 3, ox + site.w + 3, oz + site.d + 3, { site });
        this.landmarks.push({ name: spec.name, x: site.x, z: site.z });
        this.plans.push({ kind: 'site', site, x: site.x, z: site.z, rot: 0, fw: site.w, fd: site.d, noMap: true, chests: cave ? 6 : 5, chestChance: 1 });
        break;
      }
    }
  }

  // ------------------------------------------------------------ CARRETERAS
  planRoads() {
    const rng = this.rng;
    const P = this.pois;
    if (P.length < 2) return;
    // Árbol de expansión mínima + algunas conexiones extra. El coste
    // penaliza las parejas separadas por montañas (mejor rodearlas).
    const cost = (a, b) => {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      let top = -Infinity;
      for (let k = 1; k < 20; k++) top = Math.max(top, this.terrain.rawHeight(a.x + ((b.x - a.x) * k) / 20, a.z + ((b.z - a.z) * k) / 20));
      return d * (1 + Math.max(0, top - Math.max(a.height, b.height) - 8) / 10);
    };
    const edges = [];
    const inTree = new Set([0]);
    while (inTree.size < P.length) {
      let best = null;
      for (const i of inTree) {
        for (let j = 0; j < P.length; j++) {
          if (inTree.has(j)) continue;
          const d = cost(P[i], P[j]);
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
    const tree = P.length - 1; // las primeras aristas conectan todas las zonas
    edges.forEach(([i, j], e) => {
      const r = this.routeRoad(P[i], P[j]);
      // Las conexiones extra que obligan a cortar media montaña, fuera
      if (!r || (e >= tree && r.cut > 14)) return;
      // El terreno se moldea después con el perfil (corredor en roads.js)
      this.roads.add(r.pts, 7, 'road', r.hs);
      this.roadEdges.push(r);
    });
  }

  // Perfil (altura del firme) de una carretera: suavizado, fijo a la altura
  // de las zonas que une y, sobre los ríos, a la altura de los puentes.
  roadProfile(pts, A, B) {
    const t = this.terrain;
    const n = pts.length;
    const zoneOf = (x, z) => (Math.hypot(x - A.x, z - A.z) < A.radius * 1.05 ? A : Math.hypot(x - B.x, z - B.z) < B.radius * 1.05 ? B : null);
    let hs = pts.map(([x, z]) => zoneOf(x, z)?.height ?? Math.max(1.5, t.rawHeight(x, z)));
    const smooth = (a, R) => a.map((_, k) => {
      let sum = 0, c = 0;
      for (let q = Math.max(0, k - R); q <= Math.min(n - 1, k + R); q++) {
        sum += a[q];
        c++;
      }
      return sum / c;
    });
    hs = smooth(smooth(hs, 7), 7);
    // Anclajes: dentro de las zonas, la altura de la zona; junto a otra
    // carretera ya trazada, su misma altura (los cruces y salidas compartidas
    // quedan a nivel). Entre anclajes se reparte la corrección linealmente,
    // conservando la forma suave del perfil.
    const anchors = [];
    pts.forEach(([x, z], k) => {
      const zone = zoneOf(x, z);
      const near = zone ? null : this.roads.profileNear(x, z, 9);
      if (zone || near) anchors.push([k, (zone ? zone.height : near.hp) - hs[k]]);
    });
    if (anchors.length) {
      let a = 0;
      hs = hs.map((v, j) => {
        while (a < anchors.length - 1 && anchors[a + 1][0] <= j) a++;
        const [k0, r0] = anchors[a];
        if (j <= k0 || a === anchors.length - 1) return v + r0;
        const [k1, r1] = anchors[a + 1];
        return v + r0 + ((r1 - r0) * (j - k0)) / (k1 - k0);
      });
    }
    // Pendiente máxima ~12 %: si hay que cruzar una loma, mejor un desmonte
    // (paso entre paredes de roca) que una rampa imposible.
    const fixed = new Set(anchors.map(([k]) => k));
    const g = 0.6; // m de desnivel por punto (5 m)
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 1; j < n; j++) if (!fixed.has(j)) hs[j] = Math.min(hs[j - 1] + g, Math.max(hs[j - 1] - g, hs[j]));
      for (let j = n - 2; j >= 0; j--) if (!fixed.has(j)) hs[j] = Math.min(hs[j + 1] + g, Math.max(hs[j + 1] - g, hs[j]));
    }
    // Puentes: el firme pasa 2.4 m sobre el agua, con rampas de acceso suaves
    pts.forEach(([x, z], k) => {
      const r = this.hydro.riverAt(x, z, 14);
      if (!r) return;
      const h = r.s + 2.4;
      for (let j = 0; j < n; j++) hs[j] = Math.max(hs[j], h - Math.abs(k - j) * 0.45);
    });
    return hs;
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
    let best = null;
    for (let attempt = 0; attempt < 18; attempt++) {
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
      let ok = true, riverRun = 0;
      for (const [x, z] of pts) {
        const h = this.terrain.rawHeight(x, z);
        const inA = Math.hypot(x - A.x, z - A.z) < A.radius * 1.1;
        const inB = Math.hypot(x - B.x, z - B.z) < B.radius * 1.1;
        if (!inA && !inB && (h < 1.0 || h > 62)) { ok = false; break; }
        if (this.pois.some((p) => p !== A && p !== B && Math.hypot(x - p.x, z - p.z) < p.radius * 0.98)) { ok = false; break; }
        if (!inA && !inB && this.occ.hit(x - 3, z - 3, x + 3, z + 3)) { ok = false; break; }
        // Los lagos se rodean; los ríos se cruzan (puente), no se siguen
        if (this.hydro.lakeAt(x, z, 22)) { ok = false; break; }
        if (this.hydro.riverAt(x, z, 14)) {
          if (++riverRun > 14) { ok = false; break; }
        } else riverRun = 0;
      }
      if (!ok) continue;
      // Entre los trazados válidos, el que menos desmonte/terraplén necesita
      const hs = this.roadProfile(pts, A, B);
      let cut = 0;
      pts.forEach(([x, z], k) => {
        if (Math.hypot(x - A.x, z - A.z) < A.radius * 1.1 || Math.hypot(x - B.x, z - B.z) < B.radius * 1.1) return;
        if (this.hydro.riverAt(x, z, 14)) return;
        cut = Math.max(cut, Math.abs(this.terrain.rawHeight(x, z) - hs[k]));
      });
      if (!best || cut < best.cut) best = { pts, hs, cut };
      if (cut < 4.5) break;
    }
    return best;
  }

  // ------------------------------------------------ JUNTO A LAS CARRETERAS
  planRoadside() {
    const rng = this.rng;
    let gas = 0;
    for (const { pts, hs } of this.roadEdges || []) {
      let acc = rng.float(25, 70);
      for (let k = 1; k < pts.length - 1; k++) {
        acc -= Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        if (acc > 0) continue;
        acc = rng.float(70, 140);
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
        if (!f.ok || f.avg > 45 || Math.abs(f.avg - hs[k]) > 4) continue;
        const rot = rotFacing(-nx, -nz);
        // a la altura de la carretera, para que la entrada quede a nivel
        const plan = this.plan(p.kind, cx, cz, rot, p.W, p.D, { ...p.extra, pad: { x: cx, z: cz, radius: depth * 0.8 + 2, height: hs[k] } });
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
    if (this.roads.edgeDistance(x, z, 48) < r + 10) return false;
    if (this.hydro.edgeDistance(x, z) < r * 1.7 + 10) return false;
    return this.free(x - r, z - r, x + r, z + r);
  }

  addLandmark(kind, x, z, rot, W, D, extra = {}, padH = null) {
    const f = this.isFlatEnough(x, z, Math.max(W, D) * 0.6, 12);
    const h = padH ?? f.avg;
    const plan = this.plan(kind, x, z, rot, W, D, { ...extra, pad: { x, z, radius: Math.max(W, D) * 0.75 + 2, height: h } });
    if (this.tryPlan(plan)) {
      this.pads.push(plan.pad);
      if (extra.label) this.landmarks.push({ name: extra.label, x, z });
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
    if (best) this.addLandmark('radio', best.x, best.z, rng.int(0, 3), 16, 12, { chests: 1, chestChance: 0.9, label: 'Antena' });
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
      if (this.addLandmark('lighthouse', x, z, rotFacing(-x, -z), 22, 12, { chests: 1, chestChance: 0.9, label: 'Faro' }, Math.max(3, h))) break;
    }
    const scatter = (kind, count, W, D, extra, test, flat = 6) => {
      let n = 0;
      for (let i = 0; i < 2500 && n < count; i++) {
        const [x, z] = this.randomLand(rng);
        if (!this.awayFromAll(x, z, Math.max(W, D) / 2 + 6)) continue;
        if (test && !test(x, z)) continue;
        const f = this.isFlatEnough(x, z, Math.max(W, D) * 0.6, flat);
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
    // Estructuras nuevas: castillo, molinos y mercadillos
    scatter('castle', 1, 28, 28, { chests: 3, chestChance: 1, label: 'Castillo Corona' }, null, 10);
    scatter('windmill', 2, 9, 9, () => ({ chests: 2, chestChance: 0.8, label: 'Molino' }));
    scatter('market', 2, 19, 15, () => ({ chests: 1, chestChance: 0.8, label: 'Mercadillo' }));
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
    const glow = new GeoBuilder(); // llamas, faroles y cristales (sin iluminar)
    const caps = new GeoBuilder(); // tapas de cuevas/trincheras (material del terreno)
    const rng = this.rng;
    for (const p of this.plans) {
      let ctx;
      if (p.kind === 'site') ctx = buildSite(p.site, geo, glow, caps, this.collision, rng, this.terrain);
      else {
        let y = this.terrain.heightAt(p.x, p.z);
        if (p.kind === 'pier') {
          const r = this.placePier(p);
          if (!r) continue;
          y = r.y;
        }
        ctx = new BuildingCtx(geo, this.collision, p.x, y, p.z, p.rot);
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
          case 'windmill': genWindmill(ctx, rng); break;
          case 'castle': genCastle(ctx, rng); break;
          case 'market': genMarket(ctx, rng); break;
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
      }
      // Todos los huecos son candidatos: en cada partida cada cofre aparece
      // con una probabilidad (el mapa es fijo, los cofres no).
      const cands = ctx.chestSpots;
      const max = p.chests ?? 1;
      const expected = (p.chestChance ?? 0.6) * (max > 1 ? (1 + max) / 2 : 1);
      const chance = Math.min(0.8, Math.max(0.18, (expected / Math.max(1, cands.length)) * 1.25));
      for (const c of cands) {
        c.chance = chance;
        this.chestSpots.push(c);
      }
      this.lootSpots.push(...ctx.lootSpots);
      this.ammoSpots.push(...ctx.ammoSpots);
      this.ladders.push(...ctx.ladders);
      this.doors.push(...ctx.doors);
    }
    this.buildBridges(geo);
    for (const d of this.dummySpots) d.y = this.terrain.heightAt(d.x, d.z);
    for (const c of [...this.carSpots, ...this.wreckSpots]) c.y = this.terrain.heightAt(c.x, c.z);
    this.buildingMesh = geo.build();
    this.buildingMesh.name = 'buildings';
    this.scene.add(this.buildingMesh);
    if (glow.pos.length) {
      this.glowMesh = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
      this.glowMesh.castShadow = this.glowMesh.receiveShadow = false;
      this.glowMesh.name = 'underground-glow';
      this.scene.add(this.glowMesh);
    }
    if (caps.pos.length) {
      const m = caps.build(this.terrain.mesh.material);
      m.castShadow = false;
      m.name = 'underground-caps';
      this.scene.add(m);
    }
    const halos = buildHalos(this.sites);
    if (halos) this.scene.add(halos);
  }

  // Puentes donde una carretera cruza un río: tablero, barandillas y pilar.
  // Las colisiones son de tipo 'bridge' (la IA las ignora en su rejilla).
  buildBridges(geo) {
    if (!this.hydro.rivers.length) return;
    const t = this.terrain;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const piece = (x, y, z, sx, sy, sz, yaw, hex) => {
      q.setFromAxisAngle(up, yaw);
      m.compose(v.set(x, y, z), q, sc.set(sx, sy, sz));
      geo.geometry(box, hex, m);
    };
    const col = (x, y0, z, h, y1) => this.collision.add(x - h, y0, z - h, x + h, y1, z + h, { type: 'bridge' });
    this.bridges = [];
    for (const road of this.roads.roads) {
      if (!road.hs) continue;
      const S = this.roads.samples(road, 1);
      const flag = S.map((p) => t.heightAt(p.x, p.z) < p.hp - 0.4);
      const spans = [];
      for (let k = 0; k < S.length; k++) {
        if (!flag[k]) continue;
        let e = k;
        while (e + 1 < S.length && flag[e + 1]) e++;
        const last = spans[spans.length - 1];
        if (last && k - last[1] < 5) last[1] = e;
        else spans.push([k, e]);
        k = e;
      }
      for (let [a, b] of spans) {
        if (!S.slice(a, b + 1).some((p) => this.hydro.riverAt(p.x, p.z, 3))) continue;
        a = Math.max(0, a - 2);
        b = Math.min(S.length - 1, b + 2);
        const hw = road.width / 2;
        for (let k = a; k <= b; k++) {
          const p = S[k];
          const yaw = Math.atan2(p.tx, p.tz);
          const nx = -p.tz, nz = p.tx;
          piece(p.x, p.hp - 0.32, p.z, road.width + 0.9, 0.6, 1.3, yaw, 0x8d8d86);
          col(p.x, p.hp - 0.62, p.z, hw * 0.9, p.hp + 0.07);
          for (const side of [-1, 1]) {
            const rx = p.x + nx * (hw + 0.3) * side, rz = p.z + nz * (hw + 0.3) * side;
            piece(rx, p.hp + 0.95, rz, 0.12, 0.12, 1.1, yaw, 0x8a8f96);
            piece(rx, p.hp + 0.5, rz, 0.08, 0.08, 1.1, yaw, 0x8a8f96);
            if (k % 2 === 0) piece(rx, p.hp + 0.48, rz, 0.14, 1.0, 0.14, yaw, 0x6f747a);
            col(rx, p.hp, rz, 0.18, p.hp + 1.05);
          }
        }
        if (b - a > 14) {
          const p = S[(a + b) >> 1];
          const y0 = t.heightAt(p.x, p.z) - 0.6, y1 = p.hp - 0.6;
          piece(p.x, (y0 + y1) / 2, p.z, road.width * 0.7, y1 - y0, 1.2, Math.atan2(p.tx, p.tz), 0x7d7a72);
          col(p.x, y0, p.z, 0.9, y1);
        }
        this.bridges.push({ x: S[(a + b) >> 1].x, z: S[(a + b) >> 1].z });
      }
    }
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
    this.water = createWater(this.scene, this, new THREE.Vector3(0.45, 0.8, 0.35));
  }

  // Nivel del agua en (x, z): el de un lago o río si lo hay, si no el mar (0).
  waterLevelAt(x, z) {
    const s = this.terrain.hydro ? this.hydro.surfaceAt(x, z) : -Infinity;
    return s > 0 ? s : 0;
  }

  // Profundidad del agua (negativa = tierra seca a esa altura sobre el agua).
  waterDepth(x, z) {
    return this.waterLevelAt(x, z) - this.terrain.heightAt(x, z);
  }

  // Tierra firme (ni mar, ni lago, ni río).
  isLand(x, z, minH = 1.5) {
    return this.terrain.heightAt(x, z) > minH && this.waterDepth(x, z) < 0.2;
  }

  // ¿Está el punto bajo techo en una cueva o refugio? (para la lluvia)
  coveredAt(x, y, z) {
    for (const s of this.sites) if (s.covered(x, y, z)) return true;
    return false;
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
