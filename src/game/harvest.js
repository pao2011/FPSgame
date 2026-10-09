import * as THREE from 'three';
import { makeCarModel, mergedMesh, getGlowTexture } from './models.js';
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
    this.falling = [];
    this.destroyed = [];
    this.shaking = new Set();
  }

  // Golpe de pico del jugador con punto débil (como en Fortnite): tras cada
  // golpe aparece un punto azul cerca; acertarle hace el doble de daño y da el
  // doble de material. Devuelve { gain, crit }.
  pickaxeHit(obj, point, normal, dmg = 50, who = this.game.player) {
    const w = this.weak;
    const crit = !!w && w.obj === obj && w.pos.distanceTo(point) < 0.55;
    const gain = this.hit(obj, crit ? dmg * 2 : dmg, who, false, crit ? 2 : 1);
    if (obj.hp > 0) this.placeWeak(obj, point, normal);
    else this.clearWeak();
    return { gain, crit };
  }

  placeWeak(obj, point, normal) {
    if (!this.weakSprite) {
      this.weakSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x5ad1ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.weakSprite.renderOrder = 5;
      this.game.scene.add(this.weakSprite);
    }
    const n = new THREE.Vector3().copy(normal || new THREE.Vector3(0, 0, 1)).normalize();
    const side = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, n).normalize();
    const pos = point.clone().addScaledVector(side, (Math.random() - 0.5) * 0.7).addScaledVector(up, (Math.random() - 0.5) * 0.9).addScaledVector(n, 0.08);
    this.weak = { obj, pos, t: 4 };
    this.weakSprite.position.copy(pos);
    this.weakSprite.visible = true;
  }

  clearWeak() {
    this.weak = null;
    if (this.weakSprite) this.weakSprite.visible = false;
  }

  // Objeto por su número de red (árbol/roca/coche o pieza de edificio).
  byId(i) {
    return i < this.list.length ? this.list[i] : this.pieces[i - this.list.length];
  }

  // Golpe de pico. Devuelve los materiales conseguidos por `who`.
  // fromNet: golpe de otro jugador online (sólo se aplica el daño).
  hit(obj, dmg, who = this.game.player, fromNet = false, mult = 1) {
    if (obj.hp <= 0) return 0;
    const p = who;
    obj.hp -= dmg;
    if (!fromNet) this.game.net?.sendHarvest(obj, dmg);
    let gain = YIELD[obj.mat] * mult;
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

  // Cofres y cajas que estaban apoyados en una pieza que se rompe: revientan.
  smashChestsOn(bb) {
    const C = this.game.containers;
    if (!C) return;
    for (const c of C.list) {
      if (!c.active || c.opened || c.broken || c.locked) continue;
      const p = c.pos;
      if (p.x < bb[0] - 0.3 || p.x > bb[3] + 0.3 || p.z < bb[2] - 0.3 || p.z > bb[5] + 0.3) continue;
      if (p.y < bb[4] - 0.35 || p.y > bb[4] + 0.4) continue;
      C.smash(c, null);
    }
  }

  // Integridad estructural: las piezas del edificio que ya no tocan (a través
  // de otras) el suelo se caen. Lo calcula igual cada jugador online.
  checkSupport(bld) {
    if (!bld) return;
    const P = bld.pieces;
    const touch = (a, b) => {
      const e = 0.06;
      return a[0] <= b[3] + e && b[0] <= a[3] + e && a[1] <= b[4] + e && b[1] <= a[4] + e && a[2] <= b[5] + e && b[2] <= a[5] + e;
    };
    const reach = (alive) => {
      const seen = new Set();
      const q = P.filter((p) => (p.grounded || p.anchor) && alive(p));
      for (const p of q) seen.add(p);
      while (q.length) {
        const p = q.pop();
        for (const n of bld.adj.get(p)) if (!seen.has(n) && alive(n)) {
          seen.add(n);
          q.push(n);
        }
      }
      return seen;
    };
    if (!bld.adj) {
      bld.adj = new Map(P.map((p) => [p, []]));
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          if (!touch(P[i].aabb, P[j].aabb)) continue;
          bld.adj.get(P[i]).push(P[j]);
          bld.adj.get(P[j]).push(P[i]);
        }
      }
      // Lo que ya estaba suelto al generar el mapa (toldos, carteles…) se
      // considera anclado: sólo cae lo que pierde su apoyo.
      const ok = reach(() => true);
      for (const p of P) if (!ok.has(p)) p.anchor = true;
    }
    const ok = reach((p) => p.hp > 0);
    const fall = P.filter((p) => p.hp > 0 && !ok.has(p));
    if (!fall.length) return;
    this.fallingChunk(fall);
    for (const p of fall) {
      p.hp = 0;
      this.damaged.add(p);
      this.destroy(p, true);
    }
  }

  // Copia de los triángulos de las piezas que se caen: cae y se deshace.
  fallingChunk(list) {
    const g = this.game;
    let n = 0;
    for (const p of list) for (const r of p.ranges) n += r.count;
    if (!n || n > 120000 || list[0].center.distanceTo(g.camera.position) > 220) return;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), pat = new Float32Array(n);
    let k = 0, mat = null;
    const c = new THREE.Vector3();
    for (const p of list) {
      for (const r of p.ranges) {
        const A = r.mesh.geometry.attributes;
        const i0 = r.start * 3, i1 = (r.start + r.count) * 3;
        pos.set(A.position.array.subarray(i0, i1), k * 3);
        nor.set(A.normal.array.subarray(i0, i1), k * 3);
        col.set(A.color.array.subarray(i0, i1), k * 3);
        pat.set(A.pat.array.subarray(r.start, r.start + r.count), k);
        k += r.count;
        mat = r.mesh.material;
      }
      c.add(p.center);
    }
    c.divideScalar(list.length);
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] -= c.x;
      pos[i + 1] -= c.y;
      pos[i + 2] -= c.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('pat', new THREE.BufferAttribute(pat, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(c);
    mesh.castShadow = true;
    g.scene.add(mesh);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
    this.falling.push({ mesh, vy: 0, t: 0, spin, list: list.slice(0, 6) });
    g.audio.breakPiece?.(Math.max(0.3, 1 - c.distanceTo(g.camera.position) / 220));
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

  destroy(obj, falling = false) {
    const col = this.game.world.collision;
    for (const c of obj.colliders) col.remove(c);
    obj.colliders = [];
    if (obj.kind === 'building') {
      this.collapse(obj, true);
      this.destroyed.push(obj);
      const g = this.game;
      g.mapDoors?.breakNear(obj.aabb);
      this.smashChestsOn(obj.aabb);
      if (!falling) this.checkSupport(obj.bld);
      const d = obj.center.distanceTo(g.camera.position);
      if (d < 160 && !falling) {
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
    this.clearWeak();
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
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.vy -= 16 * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.z += f.spin.z * dt;
      if (f.t > 1.1) f.mesh.scale.setScalar(Math.max(0.01, 1 - (f.t - 1.1) / 0.35));
      if (f.t > 1.45) {
        const g = this.game;
        g.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        for (const p of f.list) {
          const at = p.center.clone();
          at.y = Math.max(g.world.terrain.heightAt(at.x, at.z) + 0.5, at.y - 6);
          g.effects.debris(at, p.hex);
          g.effects.puff?.(at, 0xb8b0a0, 1.6, 1.4, null, 0.5);
        }
        this.falling.splice(i, 1);
      }
    }
    if (this.weak) {
      this.weak.t -= dt;
      const s = 0.42 + Math.sin(this.game.time * 9) * 0.06;
      this.weakSprite.scale.set(s, s, 1);
      if (this.weak.t <= 0 || this.weak.obj.hp <= 0) this.clearWeak();
    }
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
