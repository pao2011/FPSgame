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
    this.destroyed = [];
    this.shaking = new Set();
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
    this.shaking.add(obj);
    if (obj.hp <= 0) {
      gain += 12;
      this.destroy(obj);
    }
    if (!p) return 0;
    const before = p.mats[obj.mat];
    p.mats[obj.mat] = Math.min(MATERIALS[obj.mat].max, before + gain);
    return p.mats[obj.mat] - before;
  }

  destroy(obj) {
    const col = this.game.world.collision;
    for (const c of obj.colliders) col.remove(c);
    obj.colliders = [];
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
      if (obj.parts) {
        for (const part of obj.parts) {
          part.mesh.setMatrixAt(part.index, part.base);
          part.mesh.instanceMatrix.needsUpdate = true;
        }
      } else obj.mesh.visible = true;
    }
    for (const obj of this.list) obj.hp = obj.maxHp;
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
