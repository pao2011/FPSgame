import * as THREE from 'three';
import { makeCarModel, mergedMesh } from './models.js';
import { MATERIALS } from './items.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpT = new THREE.Matrix4();

const YIELD = { wood: 8, stone: 7, metal: 9 };

// Árboles, rocas y coches abandonados que se pueden picar para conseguir
// materiales de construcción.
export class Harvest {
  constructor(game) {
    this.game = game;
    const world = game.world;
    this.list = [...world.nature.harvestables];
    for (const s of world.wreckSpots) {
      const mesh = mergedMesh('wreck', () => makeCarModel(0, true));
      mesh.position.set(s.x, s.y, s.z);
      mesh.rotation.set(0.04, s.rot, -0.05);
      game.scene.add(mesh);
      const c = Math.cos(s.rot), sn = Math.sin(s.rot);
      const ex = Math.abs(c) * 1.0 + Math.abs(sn) * 2.15;
      const ez = Math.abs(sn) * 1.0 + Math.abs(c) * 2.15;
      const w = {
        kind: 'wreck', mat: 'metal', hp: 420, maxHp: 420, mesh,
        center: new THREE.Vector3(s.x, s.y, s.z), rot: s.rot,
        boxes: [[s.x - ex, s.y, s.z - ez, s.x + ex, s.y + 1.75, s.z + ez, 'wreck']],
      };
      w.colliders = w.boxes.map((b) => world.collision.add(b[0], b[1], b[2], b[3], b[4], b[5], { type: b[6], ref: w }));
      this.list.push(w);
    }
    this.list.forEach((o, i) => (o.hid = i));
    // Piezas de edificios (aparte: la IA no las tala). Mismo número en todos
    // los equipos porque el mapa es el mismo.
    this.pieces = world.destructibles || [];
    this.pieces.forEach((o, i) => (o.hid = this.list.length + i));
    this.damaged = new Set();
    this.destroyed = [];
    this.shaking = new Set();
  }

  // Objeto por su número de red (árbol/roca/coche o pieza de edificio).
  byId(i) {
    return i < this.list.length ? this.list[i] : this.pieces[i - this.list.length];
  }

  // Golpe de pico. Devuelve los materiales conseguidos por `who`.
  // fromNet: golpe de otro jugador online (sólo se aplica el daño).
  hit(obj, dmg, who = this.game.player, fromNet = false) {
    if (obj.hp <= 0) return 0;
    const p = who;
    obj.hp -= dmg;
    if (!fromNet) this.game.net?.sendHarvest(obj, dmg);
    let gain = YIELD[obj.mat];
    obj.shakeT = 0.3;
    if (obj.kind === 'building') {
      this.damaged.add(obj);
      gain = Math.max(1, Math.round(gain * Math.min(1, dmg / 50)));
      if (obj.hp > 0) this.tint(obj, 0.55 + 0.45 * (obj.hp / obj.maxHp));
    } else this.shaking.add(obj);
    if (obj.hp <= 0) {
      gain += 12;
      this.destroy(obj);
    }
    if (!p) return 0;
    const before = p.mats[obj.mat];
    p.mats[obj.mat] = Math.min(MATERIALS[obj.mat].max, before + gain);
    return p.mats[obj.mat] - before;
  }

  // Oscurece una pieza de edificio según el daño (grietas, polvo).
  tint(obj, k) {
    for (const r of obj.ranges) {
      const attr = r.mesh.geometry.attributes.color;
      const a = attr.array, i0 = r.start * 3, n = r.count * 3;
      if (!r.col) r.col = a.slice(i0, i0 + n);
      for (let i = 0; i < n; i++) a[i0 + i] = r.col[i] * k;
      attr.addUpdateRange(i0, n);
      attr.needsUpdate = true;
    }
  }

  // Pieza de edificio: sus triángulos se colapsan (sin rehacer la parcela).
  collapse(obj, on) {
    for (const r of obj.ranges) {
      const attr = r.mesh.geometry.attributes.position;
      const a = attr.array, i0 = r.start * 3, n = r.count * 3;
      if (on) {
        if (!r.pos) r.pos = a.slice(i0, i0 + n);
        a.fill(0, i0, i0 + n);
      } else if (r.pos) a.set(r.pos, i0);
      attr.addUpdateRange(i0, n);
      attr.needsUpdate = true;
    }
  }

  destroy(obj) {
    const col = this.game.world.collision;
    for (const c of obj.colliders) col.remove(c);
    obj.colliders = [];
    if (obj.kind === 'building') {
      this.collapse(obj, true);
      this.destroyed.push(obj);
      const g = this.game;
      g.mapDoors?.breakNear(obj.aabb);
      const d = obj.center.distanceTo(g.camera.position);
      if (d < 160) {
        const [x0, y0, z0, x1, y1, z1] = obj.aabb;
        const hex = MATERIALS[obj.mat].hex;
        const n = Math.min(6, 1 + Math.round(Math.max(x1 - x0, y1 - y0, z1 - z0) / 2));
        for (let i = 0; i < n; i++) {
          const p = new THREE.Vector3(x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0), z0 + Math.random() * (z1 - z0));
          g.effects.debris(p, i % 2 ? hex : obj.hex);
        }
        g.audio.breakPiece?.(Math.max(0.2, 1 - d / 160));
      }
      return;
    }
    if (obj.parts) {
      for (const part of obj.parts) {
        if (!part.base) {
          part.base = new THREE.Matrix4();
          part.mesh.getMatrixAt(part.index, part.base);
        }
        part.mesh.setMatrixAt(part.index, ZERO);
        part.mesh.instanceMatrix.needsUpdate = true;
      }
    } else obj.mesh.visible = false;
    this.shaking.delete(obj);
    this.destroyed.push(obj);
    if (obj.center.distanceTo(this.game.camera.position) < 200) this.game.effects.debris(obj.center.clone().setY(obj.center.y + 1.2), MATERIALS[obj.mat].hex);
  }

  reset() {
    const col = this.game.world.collision;
    for (const obj of this.destroyed) {
      obj.colliders = obj.boxes.map((b) => col.add(b[0], b[1], b[2], b[3], b[4], b[5], { type: b[6], ref: obj }));
      if (obj.kind === 'building') this.collapse(obj, false);
      else if (obj.parts) {
        for (const part of obj.parts) {
          part.mesh.setMatrixAt(part.index, part.base);
          part.mesh.instanceMatrix.needsUpdate = true;
        }
      } else obj.mesh.visible = true;
    }
    for (const obj of this.list) obj.hp = obj.maxHp;
    for (const obj of this.damaged) {
      obj.hp = obj.maxHp;
      this.tint(obj, 1);
    }
    this.damaged.clear();
    this.destroyed.length = 0;
  }

  // Pequeño temblor al golpear.
  update(dt) {
    for (const obj of this.shaking) {
      obj.shakeT -= dt;
      const k = Math.max(0, obj.shakeT) / 0.3;
      const ang = Math.sin(obj.shakeT * 50) * 0.05 * k;
      if (obj.parts) {
        for (const part of obj.parts) {
          if (!part.base) {
            part.base = new THREE.Matrix4();
            part.mesh.getMatrixAt(part.index, part.base);
          }
          const c = obj.center;
          tmpT.makeTranslation(c.x, c.y, c.z);
          tmpR.makeRotationZ(ang);
          tmpM.copy(tmpT).multiply(tmpR).multiply(tmpT.makeTranslation(-c.x, -c.y, -c.z)).multiply(part.base);
          part.mesh.setMatrixAt(part.index, tmpM);
          part.mesh.instanceMatrix.needsUpdate = true;
        }
      } else {
        obj.mesh.rotation.z = -0.05 + ang;
      }
      if (obj.shakeT <= 0) this.shaking.delete(obj);
    }
  }
}
