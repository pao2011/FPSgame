import { makeDummy } from './models.js';

// Muñecos de práctica para probar el sistema de disparo (sin IA).
export class Dummies {
  constructor(game, spots) {
    this.game = game;
    this.list = [];
    for (const s of spots) {
      const model = makeDummy();
      model.position.set(s.x, s.y, s.z);
      model.rotation.y = Math.random() * Math.PI * 2;
      model.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      game.scene.add(model);
      game.world.collision.add(s.x - 0.12, s.y, s.z - 0.12, s.x + 0.12, s.y + 0.9, s.z + 0.12, { type: 'dummy' });
      this.list.push({ model, upper: model.userData.upper, pos: model.position, health: 100, shield: 50, alive: true, respawn: 0, fall: 0, shake: 0 });
    }
  }

  reset() {
    for (const d of this.list) this._revive(d);
  }

  _revive(d) {
    d.alive = true;
    d.health = 100;
    d.shield = 50;
    d.fall = 0;
    d.upper.rotation.set(0, 0, 0);
  }

  // Raycast contra cabeza y torso (cajas alineadas a ejes).
  raycast(o, dir, maxT) {
    let best = null;
    for (const d of this.list) {
      if (!d.alive) continue;
      const p = d.pos;
      if (Math.abs(p.x - o.x) > maxT + 2 || Math.abs(p.z - o.z) > maxT + 2) continue;
      const boxes = [
        { head: true, min: [p.x - 0.19, p.y + 1.6, p.z - 0.19], max: [p.x + 0.19, p.y + 1.97, p.z + 0.19] },
        { head: false, min: [p.x - 0.32, p.y + 0.9, p.z - 0.32], max: [p.x + 0.32, p.y + 1.6, p.z + 0.32] },
      ];
      for (const b of boxes) {
        const t = rayAABB(o, dir, b.min, b.max, best ? best.t : maxT);
        if (t !== null) best = { t, dummy: d, head: b.head };
      }
    }
    return best;
  }

  damage(d, amount, head, point) {
    const fx = this.game.effects;
    let rest = amount;
    if (d.shield > 0) {
      const s = Math.min(d.shield, rest);
      d.shield -= s;
      rest -= s;
      fx.damageNumber(point, s, head ? 'head shield' : 'shield');
    }
    if (rest > 0) {
      d.health -= rest;
      fx.damageNumber(point, rest, head ? 'head' : '');
    }
    d.shake = 0.25;
    if (d.health <= 0) {
      d.alive = false;
      d.respawn = 6;
      return true;
    }
    return false;
  }

  update(dt) {
    for (const d of this.list) {
      if (d.shake > 0) {
        d.shake -= dt;
        d.upper.rotation.z = Math.sin(d.shake * 60) * d.shake * 0.4;
      }
      if (!d.alive) {
        d.fall = Math.min(1, d.fall + dt * 3);
        d.upper.rotation.x = d.fall * 1.5;
        d.respawn -= dt;
        if (d.respawn <= 0) this._revive(d);
      }
    }
  }
}

export function rayAABB(o, d, min, max, maxT) {
  let tmin = 0, tmax = maxT;
  const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(da[a]) < 1e-9) {
      if (oa[a] < min[a] || oa[a] > max[a]) return null;
      continue;
    }
    let t1 = (min[a] - oa[a]) / da[a], t2 = (max[a] - oa[a]) / da[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}

