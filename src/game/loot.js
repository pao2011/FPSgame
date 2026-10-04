import * as THREE from 'three';
import { makeItemModel, makeContainerFast, getGlowTexture, mergedMesh, itemKey } from './models.js';
import { itemRarity, RARITIES, lootForChest, lootForFloor, lootForAmmoBox } from './items.js';
import { random } from '../core/rng.js';

const tmp = new THREE.Vector3();

// Objetos en el suelo que se pueden recoger.
export class PickupManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.ringGeo = new THREE.RingGeometry(0.25, 0.45, 24).rotateX(-Math.PI / 2);
    this.beamGeo = new THREE.CylinderGeometry(0.05, 0.12, 4, 8, 1, true).translate(0, 2, 0);
  }

  spawn(item, pos, vel = null) {
    const group = new THREE.Group();
    const model = new THREE.Group();
    model.add(mergedMesh(itemKey(item), () => makeItemModel(item)));
    const rarity = itemRarity(item);
    const color = RARITIES[rarity].hex;
    model.position.y = 0.35;
    if (item.kind === 'weapon') model.rotation.z = 0.0;
    group.add(model);
    const ring = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.position.y = 0.03;
    group.add(ring);
    if (item.kind !== 'ammo' && rarity >= 1) {
      const beam = new THREE.Mesh(
        this.beamGeo,
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.25 + rarity * 0.05, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      group.add(beam);
    }
    group.position.copy(pos);
    this.game.scene.add(group);
    const p = {
      item, group, model, pos: group.position, vel: vel ? vel.clone() : new THREE.Vector3(),
      settled: !vel, phase: Math.random() * 10, groundY: pos.y,
    };
    if (!vel) p.groundY = pos.y;
    this.items.push(p);
    return p;
  }

  remove(p) {
    this.game.scene.remove(p.group);
    const i = this.items.indexOf(p);
    if (i >= 0) this.items.splice(i, 1);
  }

  clear() {
    for (const p of this.items) this.game.scene.remove(p.group);
    this.items.length = 0;
  }

  // Lanza varios objetos desde un punto en abanico.
  burst(items, origin, dirYaw = null) {
    items.forEach((it, i) => {
      const a = (dirYaw ?? random.float(0, Math.PI * 2)) + (i - (items.length - 1) / 2) * 0.7;
      const v = new THREE.Vector3(Math.sin(a) * 2.2, 4.5, Math.cos(a) * 2.2);
      this.spawn(it, origin.clone(), v);
    });
  }

  update(dt, time) {
    const world = this.game.world;
    const cam = this.game.camera.position;
    for (const p of this.items) {
      const vis = p.pos.distanceToSquared(cam) < 110 * 110;
      p.group.visible = vis;
      if (!vis && p.settled) continue;
      if (!p.settled) {
        p.vel.y -= 18 * dt;
        p.pos.addScaledVector(p.vel, dt);
        // colisión lateral básica
        const g = world.groundBelow(p.pos.x, p.pos.z, p.pos.y + 0.6);
        if (p.pos.y <= g && p.vel.y < 0) {
          p.pos.y = g;
          p.settled = true;
          p.groundY = g;
        }
      }
      p.model.rotation.y += dt * 1.2;
      p.model.position.y = 0.35 + Math.sin(time * 2 + p.phase) * 0.06;
    }
  }

  findInteract(eye, forward, maxDist = 3) {
    let best = null, bestScore = -Infinity;
    for (const p of this.items) {
      tmp.copy(p.pos).y += 0.35;
      tmp.sub(eye);
      const d = tmp.length();
      if (d > maxDist) continue;
      tmp.divideScalar(d);
      const dot = tmp.dot(forward);
      if (dot < 0.8 && d > 1.4) continue;
      const score = dot * 2 - d * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best ? { pickup: best, score: bestScore } : null;
  }
}

// Cofres y cajas de munición.
export class ContainerManager {
  constructor(game, chestSpots, ammoSpots) {
    this.game = game;
    this.list = [];
    const glowTex = getGlowTexture();
    for (const s of chestSpots) this._create('chest', s, glowTex);
    for (const s of ammoSpots) this._create('ammo', s, glowTex);
  }

  _create(kind, s, glowTex) {
    const model = makeContainerFast(kind);
    model.position.set(s.x, s.y, s.z);
    model.rotation.y = s.rotY;
    this.game.scene.add(model);
    let glow = null;
    if (kind === 'chest') {
      glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, color: 0xffd34d, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.scale.set(1.8, 1.4, 1);
      glow.position.set(s.x, s.y + 0.6, s.z);
      this.game.scene.add(glow);
    }
    const c = { kind, model, glow, pos: model.position, rotY: s.rotY, opened: false, active: true, openT: 0, collider: null };
    this._setCollider(c, true);
    this.list.push(c);
  }

  _setCollider(c, on) {
    const col = this.game.world.collision;
    if (c.collider) col.remove(c.collider);
    c.collider = null;
    if (!on) return;
    const e = c.kind === 'chest' ? 0.5 : 0.42;
    const p = c.pos;
    c.collider = col.add(p.x - e, p.y, p.z - e, p.x + e, p.y + (c.kind === 'chest' ? 0.7 : 0.45), p.z + e, { type: 'chest' });
  }

  // Desactiva al azar parte de los cofres para cada partida.
  reset() {
    for (const c of this.list) {
      c.opened = false;
      c.openT = 0;
      c.pending = null;
      c.active = random.chance(c.kind === 'chest' ? 0.65 : 0.55);
      c.model.visible = c.active;
      this._setCollider(c, c.active);
      c.model.userData.lid.rotation.x = 0;
      if (c.glow) c.glow.visible = c.active;
    }
  }

  // opener: quien lo abre (jugador o bot). El botín sale tras la animación.
  open(c, opener = null) {
    if (c.opened) return;
    c.opened = true;
    if (c.glow) c.glow.visible = false;
    c.pending = c.kind === 'chest' ? lootForChest(random) : lootForAmmoBox(random);
    c.pendingT = 0.22;
    const near = !opener || opener.isPlayer || c.pos.distanceTo(this.game.player.pos) < 25;
    if (!near) return;
    if (c.kind === 'chest') this.game.audio.chest();
    else this.game.audio.pickup();
  }

  update(dt, time) {
    const cam = this.game.camera.position;
    for (const c of this.list) {
      if (!c.active) continue;
      if (c.pending) {
        c.pendingT -= dt;
        if (c.pendingT <= 0) {
          const origin = c.pos.clone();
          origin.y += 0.6;
          origin.x += Math.sin(c.rotY) * 0.5;
          origin.z += Math.cos(c.rotY) * 0.5;
          this.game.pickups.burst(c.pending, origin, c.rotY);
          c.pending = null;
        }
      }
      const vis = c.pos.distanceToSquared(cam) < 160 * 160;
      c.model.visible = vis;
      if (c.glow) c.glow.visible = vis && !c.opened;
      if (!vis) continue;
      if (c.opened && c.openT < 1) {
        c.openT = Math.min(1, c.openT + dt * 4);
        c.model.userData.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.openT, 3));
      }
      if (c.glow && c.glow.visible) c.glow.material.opacity = 0.45 + Math.sin(time * 4 + c.pos.x) * 0.2;
    }
  }

  findInteract(eye, forward, maxDist = 3) {
    let best = null, bestScore = -Infinity;
    for (const c of this.list) {
      if (!c.active || c.opened) continue;
      tmp.copy(c.pos).y += 0.35;
      tmp.sub(eye);
      const d = tmp.length();
      if (d > maxDist) continue;
      tmp.divideScalar(d);
      const dot = tmp.dot(forward);
      if (dot < 0.7 && d > 1.6) continue;
      const score = dot * 2 - d * 0.3 + 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best ? { container: best, score: bestScore } : null;
  }

  nearestChest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.list) {
      if (!c.active || c.opened || c.kind !== 'chest') continue;
      const d = c.pos.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best ? { chest: best, dist: bd } : null;
  }
}

export function spawnFloorLoot(game, spots) {
  for (const s of spots) {
    if (!random.chance(0.6)) continue;
    const items = lootForFloor(random);
    items.forEach((it, i) => {
      game.pickups.spawn(it, new THREE.Vector3(s.x + (i ? 0.6 : 0), s.y, s.z + (i ? 0.3 : 0)));
    });
  }
}

