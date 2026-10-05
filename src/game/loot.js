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
    this.byNid = new Map(); // id de red -> objeto (partidas online)
    this.ringGeo = new THREE.RingGeometry(0.25, 0.45, 24).rotateX(-Math.PI / 2);
    this.beamGeo = new THREE.CylinderGeometry(0.05, 0.12, 4, 8, 1, true).translate(0, 2, 0);
  }

  // nid: identificador de red. En una partida online, lo que se suelta
  // localmente (sin nid) se anuncia a los demás jugadores.
  spawn(item, pos, vel = null, nid = undefined) {
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
    const net = this.game.net;
    if (net && nid === undefined) {
      p.nid = net.dropId();
      net.sendDrop(p);
    } else p.nid = nid ?? null;
    if (p.nid) this.byNid.set(p.nid, p);
    return p;
  }

  remove(p) {
    this.game.scene.remove(p.group);
    if (p.nid) this.byNid.delete(p.nid);
    const i = this.items.indexOf(p);
    if (i >= 0) this.items.splice(i, 1);
  }

  clear() {
    for (const p of this.items) this.game.scene.remove(p.group);
    this.items.length = 0;
    this.byNid.clear();
  }

  // Lanza varios objetos desde un punto en abanico.
  burst(items, origin, dirYaw = null, ids = null) {
    const base = dirYaw ?? random.float(0, Math.PI * 2);
    items.forEach((it, i) => {
      const a = base + (i - (items.length - 1) / 2) * 0.7;
      const v = new THREE.Vector3(Math.sin(a) * 2.2, 4.5, Math.cos(a) * 2.2);
      this.spawn(it, origin.clone(), v, ids ? ids[i] : undefined);
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
    const c = {
      kind, model, glow, pos: model.position, rotY: s.rotY, opened: false, active: true, openT: 0, collider: null,
      index: this.list.length, chance: s.chance, forced: !!s.forced, vault: !!s.vault, locked: false,
    };
    this._setCollider(c, true);
    this.list.push(c);
  }

  // Cofre o caja de munición extra (modo creativo).
  add(kind, s) {
    this._create(kind, { ...s, forced: true }, getGlowTexture());
    const c = this.list[this.list.length - 1];
    c.extra = true;
    return c;
  }

  clearExtra() {
    for (const c of this.list.filter((x) => x.extra)) {
      this.game.scene.remove(c.model);
      if (c.glow) this.game.scene.remove(c.glow);
      this._setCollider(c, false);
      this.list.splice(this.list.indexOf(c), 1);
    }
    this.list.forEach((c, i) => (c.index = i));
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

  // Desactiva al azar parte de los cofres para cada partida (con la misma
  // semilla en todos los jugadores de una partida online).
  reset(rng = random) {
    for (const c of this.list) {
      c.opened = false;
      c.openT = 0;
      c.pending = null;
      c.pendingIds = null;
      c.requested = false;
      c.active = c.forced || rng.chance(c.chance ?? (c.kind === 'chest' ? 0.5 : 0.55));
      c.model.visible = c.active;
      this._setCollider(c, c.active);
      c.model.userData.lid.rotation.x = 0;
      if (c.glow) c.glow.visible = c.active;
    }
  }

  // opener: quien lo abre (jugador o bot). El botín sale tras la animación.
  // En online se pide al servidor, que decide quién lo abre y qué contiene.
  open(c, opener = null) {
    if (c.opened) return;
    if (this.game.net) {
      this.game.net.requestChest(c, opener);
      return;
    }
    this._open(c, c.kind === 'chest' ? lootForChest(random) : lootForAmmoBox(random), null, opener);
  }

  openNet(c, items, opener) {
    if (c.opened) return;
    this._open(c, items.map((x) => x[1]), items.map((x) => x[0]), opener);
  }

  _open(c, loot, ids, opener) {
    c.opened = true;
    if (c.glow) c.glow.visible = false;
    c.pending = loot;
    c.pendingIds = ids;
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
          this.game.pickups.burst(c.pending, origin, c.rotY, c.pendingIds);
          c.pending = null;
          c.pendingIds = null;
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
      if (!c.active || c.opened || c.locked) continue;
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
      if (!c.active || c.opened || c.locked || c.kind !== 'chest') continue;
      const d = c.pos.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best ? { chest: best, dist: bd } : null;
  }
}

// online = true: botín idéntico para todos (misma semilla) con ids de red.
export function spawnFloorLoot(game, spots, rng = random, online = false) {
  spots.forEach((s, si) => {
    if (!rng.chance(0.6)) return;
    const items = lootForFloor(rng);
    items.forEach((it, i) => {
      game.pickups.spawn(it, new THREE.Vector3(s.x + (i ? 0.6 : 0), s.y, s.z + (i ? 0.3 : 0)), null, online ? `f${si}_${i}` : null);
    });
  });
}

