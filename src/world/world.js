import * as THREE from 'three';
import { RNG, createNoise2D } from '../core/rng.js';
import { CollisionWorld } from './collision.js';
import { Terrain } from './terrain.js';
import { GeoBuilder } from './geobuilder.js';
import {
  BuildingCtx, genHouse, genWarehouse, genSilo, genHay, genContainer, PALETTES,
} from './buildings.js';
import { createNature } from './nature.js';
import { HALF } from './constants.js';

const POI_NAMES = {
  city: ['Ciudad Comercio', 'Rincón Retail', 'Barrio Bajo'],
  towers: ['Torres Inclinadas', 'Pisos Picados'],
  farm: ['Granja Feliz', 'Huerto Hermoso', 'Rancho Risueño'],
  industrial: ['Zona Industrial', 'Fábrica Fatal', 'Puerto Pez'],
  town: ['Pueblo Tranquilo', 'Parque Placentero', 'Colinas Cansadas', 'Pantano Pegajoso', 'Villa Vacía', 'Aldea Alegre'],
};

const POI_TYPES = [
  { type: 'city', radius: 85 },
  { type: 'towers', radius: 62 },
  { type: 'farm', radius: 58 },
  { type: 'industrial', radius: 66 },
  { type: 'town', radius: 72 },
  { type: 'town', radius: 66 },
  { type: 'town', radius: 60 },
  { type: 'farm', radius: 52 },
];

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.noise = createNoise2D(this.rng.next);
    this.collision = new CollisionWorld(16);
    this.terrain = new Terrain(this.noise);
    this.pois = [];
    this.footprints = []; // {x0,z0,x1,z1}
    this.chestSpots = [];
    this.lootSpots = [];
    this.ammoSpots = [];
    this.dummySpots = [];
    this.plans = [];
    this.generate();
  }

  generate() {
    this.placePOIs();
    this.planPOIBuildings();
    this.planScattered();
    this.terrain.flats = [...this.pois, ...this.plans.filter((p) => p.pad).map((p) => p.pad)];
    this.terrain.zones = this.pois;
    this.scene.add(this.terrain.build());
    this.buildStructures();
    this.nature = createNature(this, this.rng);
    this.addWater();
    this.addClouds();
  }

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

  placePOIs() {
    const rng = this.rng;
    const names = {};
    for (const k in POI_NAMES) names[k] = rng.shuffle(POI_NAMES[k].slice());
    for (const spec of POI_TYPES) {
      for (let attempt = 0; attempt < 400; attempt++) {
        const ang = rng.float(0, Math.PI * 2);
        const dist = Math.sqrt(rng.next()) * 330;
        const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
        if (this.pois.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + spec.radius + 60)) continue;
        const f = this.isFlatEnough(x, z, spec.radius, attempt < 250 ? 18 : 30);
        if (!f.ok || f.avg > 38) continue;
        this.pois.push({
          name: names[spec.type].shift() || spec.type, type: spec.type, x, z, radius: spec.radius,
          height: Math.max(3.5, f.avg),
        });
        break;
      }
    }
  }

  addPlan(plan) {
    const hw = plan.fw / 2 + 1.5, hd = plan.fd / 2 + 1.5;
    this.footprints.push({ x0: plan.x - hw, z0: plan.z - hd, x1: plan.x + hw, z1: plan.z + hd });
    this.plans.push(plan);
  }

  footprintFree(x, z, hw, hd) {
    return !this.footprints.some((f) => x + hw > f.x0 && x - hw < f.x1 && z + hd > f.z0 && z - hd < f.z1);
  }

  // Rotación que orienta la puerta (+Z local) hacia el punto (tx,tz).
  faceRot(x, z, tx, tz) {
    const dx = tx - x, dz = tz - z;
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 3 : 1;
    return dz > 0 ? 0 : 2;
  }

  planPOIBuildings() {
    const rng = this.rng;
    for (const poi of this.pois) {
      const H = poi.height;
      const grid = (spacing, maxR, fn) => {
        const n = Math.ceil(maxR / spacing);
        for (let gx = -n; gx <= n; gx++) {
          for (let gz = -n; gz <= n; gz++) {
            const x = poi.x + gx * spacing + rng.float(-2, 2);
            const z = poi.z + gz * spacing + rng.float(-2, 2);
            if (Math.hypot(x - poi.x, z - poi.z) > maxR) continue;
            fn(x, z, gx, gz);
          }
        }
      };
      if (poi.type === 'town') {
        grid(24, poi.radius * 0.72, (x, z, gx, gz) => {
          if (gx === 0 && gz === 0) {
            this.dummySpots.push({ x, z, y: H }, { x: x + 3, z, y: H }, { x: x - 3, z: z + 2, y: H });
            return;
          }
          if (!rng.chance(0.82)) return;
          const W = rng.int(10, 13), D = rng.int(9, 12);
          const rot = this.faceRot(x, z, poi.x, poi.z);
          const fw = rot % 2 ? D : W, fd = rot % 2 ? W : D;
          this.addPlan({
            kind: 'house', x, z, y: H, rot, fw, fd, W, D, floors: rng.chance(0.75) ? 2 : 1,
            roof: 'gable', wallColor: rng.pick(PALETTES.house), roofColor: rng.pick(PALETTES.roof),
          });
        });
      } else if (poi.type === 'city') {
        grid(25, poi.radius * 0.74, (x, z, gx, gz) => {
          if (gx === 0 && gz === 0) {
            this.dummySpots.push({ x, z, y: H }, { x: x + 3, z: z + 1, y: H }, { x: x - 3, z: z - 1, y: H });
            return;
          }
          if (!rng.chance(0.9)) return;
          const W = rng.int(12, 16), D = rng.int(12, 16);
          const rot = this.faceRot(x, z, poi.x, poi.z);
          this.addPlan({
            kind: 'house', x, z, y: H, rot, fw: rot % 2 ? D : W, fd: rot % 2 ? W : D, W, D,
            floors: rng.int(2, 5), roof: 'flat', roofAccess: true, wallColor: rng.pick(PALETTES.city),
          });
        });
      } else if (poi.type === 'towers') {
        grid(21, poi.radius * 0.7, (x, z, gx, gz) => {
          if (gx === 0 && gz === 0) {
            this.dummySpots.push({ x, z, y: H }, { x: x + 3, z, y: H });
            return;
          }
          if (!rng.chance(0.85)) return;
          const W = 10, D = 10;
          const rot = this.faceRot(x, z, poi.x, poi.z);
          const tall = Math.hypot(x - poi.x, z - poi.z) < poi.radius * 0.45;
          this.addPlan({
            kind: 'house', x, z, y: H, rot, fw: W, fd: D, W, D, floors: tall ? rng.int(5, 7) : rng.int(2, 4),
            roof: 'flat', roofAccess: true, wallColor: rng.pick(PALETTES.city),
          });
        });
      } else if (poi.type === 'farm') {
        const rot = rng.int(0, 3);
        this.addPlan({
          kind: 'warehouse', x: poi.x, z: poi.z, y: H, rot, W: 18, D: 14, fw: rot % 2 ? 14 : 18, fd: rot % 2 ? 18 : 14,
          roof: 'gable', wallColor: 0xa8322b, roofColor: 0x5b4636, stripe: 0xf2efe6, hay: true, height: 6.5,
        });
        const offs = [[24, 6], [-22, -8], [6, -24], [-6, 24]];
        rng.shuffle(offs);
        for (let i = 0; i < 2; i++) {
          const [ox, oz] = offs[i];
          const x = poi.x + ox, z = poi.z + oz;
          const r2 = this.faceRot(x, z, poi.x, poi.z);
          this.addPlan({
            kind: 'house', x, z, y: H, rot: r2, W: 11, D: 10, fw: r2 % 2 ? 10 : 11, fd: r2 % 2 ? 11 : 10,
            floors: 2, roof: 'gable', wallColor: rng.pick(PALETTES.house), roofColor: rng.pick(PALETTES.roof),
          });
        }
        const [sx, sz] = offs[2];
        this.addPlan({ kind: 'silo', x: poi.x + sx * 0.8, z: poi.z + sz * 0.8, y: H, rot: 0, fw: 5, fd: 5 });
        this.addPlan({ kind: 'silo', x: poi.x + sx * 0.8 + 6, z: poi.z + sz * 0.8, y: H, rot: 0, fw: 5, fd: 5 });
        for (let i = 0; i < 8; i++) {
          const x = poi.x + rng.float(-poi.radius * 0.6, poi.radius * 0.6);
          const z = poi.z + rng.float(-poi.radius * 0.6, poi.radius * 0.6);
          if (this.footprintFree(x, z, 1.2, 1.2)) this.addPlan({ kind: 'hay', x, z, y: H, rot: rng.int(0, 3), fw: 1.6, fd: 1.6 });
        }
        const [dx, dz] = offs[3];
        this.dummySpots.push({ x: poi.x + dx * 0.6, z: poi.z + dz * 0.6, y: H }, { x: poi.x + dx * 0.6 + 3, z: poi.z + dz * 0.6, y: H });
      } else if (poi.type === 'industrial') {
        grid(30, poi.radius * 0.62, (x, z, gx, gz) => {
          if (gx === 0 && gz === 0) {
            this.dummySpots.push({ x, z, y: H }, { x: x + 3, z, y: H }, { x: x - 3, z, y: H });
            return;
          }
          const rot = this.faceRot(x, z, poi.x, poi.z);
          if (rng.chance(0.7)) {
            const W = rng.int(20, 24), D = rng.int(14, 17);
            this.addPlan({
              kind: 'warehouse', x, z, y: H, rot, W, D, fw: rot % 2 ? D : W, fd: rot % 2 ? W : D,
              roof: 'flat', wallColor: rng.pick(PALETTES.industrial),
            });
          } else {
            for (let k = 0; k < 3; k++) {
              const cx = x + (k - 1) * 3.2, cz = z + rng.float(-3, 3);
              this.addPlan({ kind: 'container', x: cx, z: cz, y: H, rot: 1, fw: 2.6, fd: 6.2, stack: rng.int(1, 2) });
            }
          }
        });
      }
    }
  }

  planScattered() {
    const rng = this.rng;
    let placed = 0;
    for (let attempt = 0; attempt < 3000 && placed < 34; attempt++) {
      const ang = rng.float(0, Math.PI * 2);
      const dist = Math.sqrt(rng.next()) * 400;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (this.pois.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius * 1.5 + 15)) continue;
      const W = rng.int(9, 12), D = rng.int(8, 11);
      if (!this.footprintFree(x, z, 14, 14)) continue;
      const f = this.isFlatEnough(x, z, 9, 7);
      if (!f.ok || f.avg > 45) continue;
      const rot = rng.int(0, 3);
      const watch = rng.chance(0.15);
      const bw = watch ? 7 : W, bd = watch ? 7 : D;
      this.addPlan({
        kind: 'house', x, z, y: f.avg, rot, W: bw, D: bd,
        fw: rot % 2 ? bd : bw, fd: rot % 2 ? bw : bd,
        floors: watch ? 4 : rng.chance(0.6) ? 2 : 1,
        roof: watch ? 'flat' : 'gable', roofAccess: watch,
        wallColor: rng.pick(watch ? PALETTES.city : PALETTES.house), roofColor: rng.pick(PALETTES.roof),
        pad: { x, z, radius: Math.max(W, D) * 0.8 + 2, height: f.avg },
      });
      placed++;
    }
  }

  buildStructures() {
    const geo = new GeoBuilder();
    const rng = this.rng;
    for (const p of this.plans) {
      const y = this.terrain.heightAt(p.x, p.z);
      const ctx = new BuildingCtx(geo, this.collision, p.x, y, p.z, p.rot);
      switch (p.kind) {
        case 'house': genHouse(ctx, rng, p); break;
        case 'warehouse': genWarehouse(ctx, rng, p); break;
        case 'silo': genSilo(ctx, rng); break;
        case 'hay': genHay(ctx); break;
        case 'container': genContainer(ctx, rng, p.stack); break;
      }
      this.chestSpots.push(...ctx.chestSpots);
      this.lootSpots.push(...ctx.lootSpots);
      this.ammoSpots.push(...ctx.ammoSpots);
    }
    for (const d of this.dummySpots) d.y = this.terrain.heightAt(d.x, d.z);
    this.buildingMesh = geo.build();
    this.buildingMesh.name = 'buildings';
    this.scene.add(this.buildingMesh);
  }

  // ¿Está ocupado por un edificio (con margen)?
  occupied(x, z, margin = 0) {
    for (const f of this.footprints) {
      if (x > f.x0 - margin && x < f.x1 + margin && z > f.z0 - margin && z < f.z1 + margin) return true;
    }
    return false;
  }

  poiAt(x, z) {
    for (const p of this.pois) if (Math.hypot(p.x - x, p.z - z) < p.radius) return p;
    return null;
  }

  addWater() {
    const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.MeshPhongMaterial({
      color: 0x2a8fd0, transparent: true, opacity: 0.82, shininess: 120, specular: 0x88ccff,
    });
    this.water = new THREE.Mesh(geo, m);
    this.water.position.y = 0;
    this.water.receiveShadow = true;
    this.scene.add(this.water);
  }

  addClouds() {
    const rng = this.rng;
    const geos = [];
    const base = new THREE.IcosahedronGeometry(1, 1);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 45; i++) {
      const cx = rng.float(-HALF * 1.3, HALF * 1.3), cz = rng.float(-HALF * 1.3, HALF * 1.3);
      const cy = rng.float(150, 280);
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
    // Fusión manual (todas comparten atributos)
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
}
