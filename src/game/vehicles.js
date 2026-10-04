import * as THREE from 'three';
import { makeCarModel, mergeGroupGeometry } from './models.js';
import { GRAVITY } from '../world/constants.js';
import { clamp } from '../core/rng.js';

const COLORS = [0xd63a2f, 0x2f6fd6, 0xf2c230, 0x2fa84f, 0xf07a1a, 0xe8e8e8];
const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const MAX_SPEED = 26;
const REVERSE = 8;
const tmp = new THREE.Vector3();

let protoGeo = null;
function carParts(color) {
  // Carrocería fusionada por color + 4 ruedas independientes (giran).
  const g = makeCarModel(color, false);
  const wheels = g.userData.wheels;
  for (const w of wheels) g.remove(w);
  if (!protoGeo) {
    const w = wheels[0].clone();
    w.position.set(0, 0, 0);
    protoGeo = mergeGroupGeometry(w);
  }
  return { body: mergeGroupGeometry(g), wheelPos: wheels.map((w) => w.position.clone()) };
}

class Vehicle {
  constructor(game, spot, color) {
    this.game = game;
    this.spawn = spot;
    const parts = carParts(color);
    this.root = new THREE.Group();
    const body = new THREE.Mesh(parts.body, vcMat);
    body.castShadow = true;
    this.root.add(body);
    this.wheels = parts.wheelPos.map((p) => {
      const w = new THREE.Mesh(protoGeo, vcMat);
      w.position.copy(p);
      w.castShadow = true;
      this.root.add(w);
      return w;
    });
    game.scene.add(this.root);
    this.pos = this.root.position;
    this.seatPos = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.pos.set(this.spawn.x, this.spawn.y, this.spawn.z);
    this.heading = this.spawn.rot;
    this.speed = 0;
    this.vy = 0;
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.driver = null;
    this.remoteDriver = null;
    this.netTarget = null;
    this.spin = 0;
    this.sync();
    this.setCollider(true);
  }

  // Conducido por otro jugador: se acerca suavemente al último estado recibido.
  followNet(dt) {
    const t = this.netTarget;
    if (!t) return;
    const k = Math.min(1, dt * 12);
    this.pos.x += (t.p[0] - this.pos.x) * k;
    this.pos.y += (t.p[1] - this.pos.y) * k;
    this.pos.z += (t.p[2] - this.pos.z) * k;
    let dh = t.h - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += dh * k;
    this.speed = t.s;
    this.steer = t.st || 0;
    this.spin -= (this.speed * dt) / 0.4;
    this.sync();
  }

  // Colisión estática mientras está aparcado (se quita al conducir).
  setCollider(on) {
    const col = this.game.world.collision;
    if (this.collider) col.remove(this.collider);
    this.collider = null;
    if (!on) return;
    const c = Math.abs(Math.cos(this.heading)), s = Math.abs(Math.sin(this.heading));
    const ex = c * 1.0 + s * 2.1, ez = s * 1.0 + c * 2.1;
    const p = this.pos;
    this.collider = col.add(p.x - ex, p.y, p.z - ez, p.x + ex, p.y + 1.7, p.z + ez, { type: 'car', ref: this });
  }

  get forward() {
    return tmp.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  ground(x, z, fromY) {
    return this.game.world.groundBelow(x, z, fromY);
  }

  // ¿Choca la carrocería en esta posición? (ignora bordillos bajos)
  blocked(x, y, z, heading) {
    const col = this.game.world.collision;
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    for (const s of [-1.35, 0, 1.35]) {
      const cx = x + fx * s, cz = z + fz * s;
      const hits = col.query(cx - 0.95, y + 0.6, cz - 0.95, cx + 0.95, y + 1.7, cz + 0.95, this._q || (this._q = []));
      for (const b of hits) if (b.data?.type !== 'leaves') return b;
    }
    return null;
  }

  update(dt, input) {
    const driving = !!this.driver;
    let throttle = 0, steerIn = 0, brake = false;
    if (driving && input) {
      if (input.held('forward')) throttle += 1;
      if (input.held('back')) throttle -= 1;
      if (input.held('left')) steerIn += 1;
      if (input.held('right')) steerIn -= 1;
      brake = input.held('jump');
    }
    if (throttle > 0) this.speed += (this.speed < 0 ? 26 : 13) * dt;
    else if (throttle < 0) this.speed -= (this.speed > 0 ? 26 : 9) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 5 * dt);
    if (brake) this.speed *= Math.max(0, 1 - 4 * dt);
    this.speed *= 1 - 0.15 * dt;

    const gy0 = this.ground(this.pos.x, this.pos.z, this.pos.y + 1.2);
    const inWater = gy0 < -0.9;
    if (inWater) this.speed *= Math.max(0, 1 - 2.5 * dt);
    this.speed = clamp(this.speed, -REVERSE, MAX_SPEED);

    this.steer += (steerIn - this.steer) * Math.min(1, dt * 6);
    const turn = this.steer * 1.7 * clamp(this.speed / 7, -1, 1) * (brake ? 1.5 : 1);
    const newHeading = this.heading + turn * dt;

    // Movimiento con sub-pasos y colisión
    const dist = this.speed * dt;
    const n = Math.max(1, Math.ceil(Math.abs(dist) / 0.4));
    for (let i = 0; i < n; i++) {
      const h = this.heading + ((newHeading - this.heading) * (i + 1)) / n;
      const nx = this.pos.x - Math.sin(h) * (dist / n);
      const nz = this.pos.z - Math.cos(h) * (dist / n);
      const ng = this.ground(nx, nz, this.pos.y + 1.2);
      const ny = Math.max(this.pos.y, ng);
      const hit = ng - this.pos.y > 0.9 ? true : this.blocked(nx, ny, nz, h);
      if (hit) {
        if (Math.abs(this.speed) > 10) this.game.audio.land();
        this.speed = -this.speed * 0.25;
        break;
      }
      this.pos.x = nx;
      this.pos.z = nz;
    }
    this.heading = newHeading;

    // Gravedad / apoyo en el suelo
    const gy = this.ground(this.pos.x, this.pos.z, this.pos.y + 1.2);
    if (this.pos.y > gy + 0.05) {
      this.vy -= GRAVITY * dt;
      this.pos.y = Math.max(gy, this.pos.y + this.vy * dt);
      if (this.pos.y === gy) this.vy = 0;
    } else {
      this.pos.y = gy;
      this.vy = 0;
    }

    // Inclinación según el terreno bajo las ruedas
    const f = this.forward;
    const rx = -f.z, rz = f.x;
    const hF = this.ground(this.pos.x + f.x * 1.6, this.pos.z + f.z * 1.6, this.pos.y + 1.5);
    const hB = this.ground(this.pos.x - f.x * 1.6, this.pos.z - f.z * 1.6, this.pos.y + 1.5);
    const hR = this.ground(this.pos.x + rx * 0.9, this.pos.z + rz * 0.9, this.pos.y + 1.5);
    const hL = this.ground(this.pos.x - rx * 0.9, this.pos.z - rz * 0.9, this.pos.y + 1.5);
    const tp = clamp(Math.atan2(hF - hB, 3.2), -0.6, 0.6);
    const tr = clamp(Math.atan2(hR - hL, 1.8), -0.5, 0.5);
    this.pitch += (tp - this.pitch) * Math.min(1, dt * 8);
    this.roll += (tr - this.roll) * Math.min(1, dt * 8);

    this.spin -= (this.speed * dt) / 0.4;
    if (driving && Math.abs(this.speed) > 6) this.runOver();
    this.sync();
  }

  // Atropellar dianas, bots y otros jugadores.
  runOver() {
    const g = this.game;
    const sp = Math.abs(this.speed);
    this.hitCd = Math.max(0, (this.hitCd || 0) - 1 / 60);
    for (const b of g.bots.list) {
      if (!b.alive || b.mode !== 'ground') continue;
      if (b.pos.distanceToSquared(this.pos) < 6) {
        b.damage(sp * 3, 'car', this.driver);
        b.vel.copy(this.forward).multiplyScalar(sp * 0.6).setY(6);
        b.pos.addScaledVector(this.forward, 1.5);
      }
    }
    if (g.net && this.hitCd <= 0) {
      for (const r of g.net.remotes) {
        if (r.alive && r.mode === 'ground' && !r.vehicle && r.pos.distanceToSquared(this.pos) < 6) {
          r.damage(sp * 3, 'car', this.driver);
          this.hitCd = 0.5;
        }
      }
    }
    for (const d of g.dummies.list) {
      if (d.alive && d.pos.distanceToSquared(this.pos) < 5) g.dummies.damage(d, 200, false, d.pos.clone().setY(d.pos.y + 1.2));
    }
  }

  sync() {
    this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    this.wheels.forEach((w, i) => {
      w.rotation.order = 'YXZ';
      w.rotation.x = this.spin;
      w.rotation.y = i % 2 === 0 ? this.steer * 0.45 : 0; // delanteras
    });
    this.seatPos.set(this.pos.x, this.pos.y + 0.55, this.pos.z).addScaledVector(this.forward, -0.1);
  }
}

export class Vehicles {
  constructor(game, spots) {
    this.game = game;
    this.list = spots.map((s, i) => new Vehicle(game, s, COLORS[i % COLORS.length]));
    this.list.forEach((v, i) => (v.index = i));
  }

  reset() {
    for (const v of this.list) v.reset();
  }

  findNear(pos, maxDist = 3.6) {
    let best = null, bd = maxDist;
    for (const v of this.list) {
      if (v.driver || v.remoteDriver || v.pendingEnter) continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (d < bd && Math.abs(v.pos.y - pos.y) < 2.5) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  // En online se pide el coche al servidor (puede que otro llegue antes).
  enter(player, v) {
    const net = this.game.net;
    if (net && !v.netGranted) {
      v.pendingEnter = true;
      net.requestVehicle(v, player);
      setTimeout(() => (v.pendingEnter = false), 1500);
      return;
    }
    v.netGranted = false;
    v.pendingEnter = false;
    v.driver = player;
    v.setCollider(false);
    player.vehicle = v;
    player.vel.set(0, 0, 0);
    player.crouching = false;
    player.yaw = v.heading;
    this.game.audio.engine(true, 0);
  }

  exit(player) {
    const v = player.vehicle;
    if (!v) return;
    const f = v.forward.clone();
    const right = new THREE.Vector3(-f.z, 0, f.x);
    const col = this.game.world.collision;
    const tries = [right.clone().multiplyScalar(-2.3), right.clone().multiplyScalar(2.3), f.clone().multiplyScalar(-3.4), new THREE.Vector3(0, 1.8, 0)];
    let out = tries[tries.length - 1].add(v.pos);
    for (const o of tries.slice(0, 3)) {
      const p = v.pos.clone().add(o);
      p.y = Math.max(this.game.world.groundBelow(p.x, p.z, v.pos.y + 2), v.pos.y);
      if (!col.overlaps(p.x - 0.35, p.y + 0.05, p.z - 0.35, p.x + 0.35, p.y + 1.8, p.z + 0.35)) {
        out = p;
        break;
      }
    }
    player.pos.copy(out);
    player.vel.set(0, 0, 0);
    player.vehicle = null;
    v.driver = null;
    this.game.audio.engine(false);
    this.game.net?.sendVehicleExit(v);
  }

  // El servidor confirma quién conduce el coche `i`.
  netEnter(i, who) {
    const v = this.list[i];
    if (!v) return;
    v.pendingEnter = false;
    const g = this.game;
    if (who === g.player) {
      if (g.player.vehicle || !g.player.alive || g.player.knocked) {
        g.net?.sendVehicleExit(v);
        return;
      }
      g.build.setActive(false);
      v.netGranted = true;
      this.enter(g.player, v);
      return;
    }
    if (!who) return;
    v.remoteDriver = who;
    v.netTarget = null;
    v.setCollider(false);
  }

  netExit(i, m) {
    const v = this.list[i];
    if (!v || v.driver) return;
    v.remoteDriver = null;
    v.netTarget = null;
    if (m.p) {
      v.pos.set(m.p[0], m.p[1], m.p[2]);
      v.heading = m.h ?? v.heading;
    }
    v.speed = 0;
    v.vy = 0;
    v.sync();
    v.setCollider(true);
  }

  update(dt, input) {
    const cam = this.game.camera.position;
    for (const v of this.list) {
      const near = v.pos.distanceToSquared(cam) < 260 * 260;
      v.root.visible = near;
      if (v.remoteDriver) {
        v.followNet(dt);
        continue;
      }
      if (v.driver || Math.abs(v.speed) > 0.01 || v.vy !== 0) {
        if (v.collider) v.setCollider(false);
        v.update(dt, v.driver ? input : null);
      } else if (!v.collider) v.setCollider(true);
    }
    const p = this.game.player;
    if (p.vehicle) this.game.audio.engine(true, p.vehicle.speed);
  }
}
