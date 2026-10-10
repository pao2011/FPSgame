import * as THREE from 'three';
import { makeItemModel, makeContainerFast, getGlowTexture, mergedMesh, itemKey, setChestShading } from './models.js';
import { itemRarity, RARITIES, lootForTier, lootForFloor, lootForAmmoBox, chestTier } from './items.js';
import { ChestFx, TIER_FX } from './chestfx.js';
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
    const pd2 = this.game.propDist(110) ** 2;
    for (const p of this.items) {
      const vis = p.pos.distanceToSquared(cam) < pd2;
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

// Cofres y cajas de munición. Los cofres tienen nivel (c.tier): 0 normal,
// 1 épico, 2 legendario; cambia en cada partida (ver chestTier en items.js).
const TIER_HP = [150, 200, 250];

export class ContainerManager {
  constructor(game, chestSpots, ammoSpots) {
    this.game = game;
    this.list = [];
    this.special = []; // cofres épicos y legendarios de esta partida
    this.fx = new ChestFx(game);
    const glowTex = getGlowTexture();
    // Primero los cofres de las bóvedas: el servidor los reconoce por el
    // índice (ver chestTier en items.js).
    for (const s of chestSpots) if (s.vault) this._create('chest', s, glowTex);
    for (const s of chestSpots) if (!s.vault) this._create('chest', s, glowTex);
    for (const s of ammoSpots) this._create('ammo', s, glowTex);
  }

  _create(kind, s, glowTex) {
    const tier = kind === 'chest' ? s.tier | 0 : 0;
    const model = makeContainerFast(kind);
    model.position.set(s.x, s.y, s.z);
    model.rotation.y = s.rotY;
    this.game.scene.add(model);
    let glow = null;
    if (kind === 'chest') {
      glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, color: 0xffd34d, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.position.set(s.x, s.y + 0.6, s.z);
      this.game.scene.add(glow);
    }
    const c = {
      kind, model, glow, pos: model.position, rotY: s.rotY, opened: false, active: true, openT: 0, collider: null, tier: 0,
      index: this.list.length, chance: s.chance, forced: !!s.forced, vault: !!s.vault, vaultId: s.vaultId ?? 0, locked: false,
    };
    this._setCollider(c, true);
    this.list.push(c);
    this._styleGlow(c);
    if (tier) this.setTier(c, tier);
  }

  // Cofre o caja de munición extra (modo creativo). s.tier: nivel del cofre.
  add(kind, s) {
    this._create(kind, { ...s, forced: true }, getGlowTexture());
    const c = this.list[this.list.length - 1];
    c.extra = true;
    if (c.glow) this.fx.noAO.add(c.glow); // (los del mapa ya los ve la AO al recorrer la escena)
    return c;
  }

  clearExtra() {
    for (const c of this.list.filter((x) => x.extra)) {
      this.game.scene.remove(c.model);
      if (c.glow) {
        this.game.scene.remove(c.glow);
        this.fx.noAO.delete(c.glow);
      }
      this.fx.detach(c);
      this._setCollider(c, false);
      this.list.splice(this.list.indexOf(c), 1);
    }
    this.list.forEach((c, i) => (c.index = i));
    this.special = this.list.filter((c) => c.tier);
  }

  // Cambia el nivel de un cofre: modelo, halo, efectos y lista de especiales.
  setTier(c, tier) {
    tier |= 0;
    if (c.kind !== 'chest' || c.tier === tier) return;
    const old = c.model;
    const m = makeContainerFast('chest', tier);
    m.position.copy(old.position);
    m.rotation.copy(old.rotation);
    m.visible = old.visible;
    m.userData.lid.rotation.x = old.userData.lid.rotation.x;
    const scene = this.game.scene;
    scene.remove(old);
    scene.add(m);
    c.model = m;
    c.tier = tier;
    this._styleGlow(c);
    this.fx.attach(c);
    const i = this.special.indexOf(c);
    if (tier && i < 0) this.special.push(c);
    else if (!tier && i >= 0) this.special.splice(i, 1);
  }

  _styleGlow(c) {
    if (!c.glow) return;
    const f = TIER_FX[c.tier || 0];
    c.glow.material.color.setHex(f.glow);
    c.glow.scale.set(f.glowS[0], f.glowS[1], 1);
    c.glow.position.y = c.pos.y + [0.6, 0.8, 0.95][c.tier || 0];
  }

  _setCollider(c, on) {
    const col = this.game.world.collision;
    if (c.collider) col.remove(c.collider);
    c.collider = null;
    if (!on) return;
    const chest = c.kind === 'chest';
    // los cofres épicos y legendarios son algo más grandes
    const e = chest ? 0.5 + (c.tier || 0) * 0.05 : 0.42;
    const p = c.pos;
    c.collider = col.add(p.x - e, p.y, p.z - e, p.x + e, p.y + (chest ? 0.7 + (c.tier || 0) * 0.08 : 0.45), p.z + e, { type: 'chest', ref: c });
  }

  // Golpe (pico): al romperse se abre de golpe y suelta el botín.
  damage(c, dmg, who = null) {
    if (!c.active || c.opened || c.locked || c.broken) return false;
    c.hp = (c.hp ?? (c.kind === 'chest' ? TIER_HP[c.tier || 0] : 100)) - dmg;
    c.shakeT = 0.25;
    if (c.hp <= 0) this.smash(c, who);
    return true;
  }

  // Botín de un cofre o caja (partidas sin servidor).
  _loot(c) {
    return c.kind === 'chest' ? lootForTier(random, c.tier || 0) : lootForAmmoBox(random);
  }

  // Romper un cofre o caja (pico, una construcción encima o el suelo que se
  // hunde): se abre y desaparece. En online lo arbitra el servidor como una
  // apertura normal y avisa a todos de que se ha roto.
  smash(c, who = null) {
    if (!c.active || c.opened || c.locked || c.broken) return;
    if (this.game.net) {
      this.game.net.requestChest(c, who, true);
      return;
    }
    this._open(c, this._loot(c), null, who);
    this.breakVisual(c);
  }

  breakVisual(c) {
    if (c.broken) return;
    c.broken = true;
    c.model.visible = false;
    if (c.glow) c.glow.visible = false;
    this._setCollider(c, false);
    c.pendingT = 0; // el botín sale ya
    const g = this.game;
    if (c.pos.distanceTo(g.camera.position) < 60) {
      const col = c.kind !== 'chest' ? 0x5d6b3a : [0xc8902e, 0x7a35c4, 0xffc23a][c.tier || 0];
      g.effects.debris(c.pos.clone().setY(c.pos.y + 0.4), col);
      g.audio.breakPiece?.(0.7);
    }
  }

  // Desactiva al azar parte de los cofres para cada partida (con la misma
  // semilla en todos los jugadores de una partida online) y reparte los
  // niveles: tierSeed es la semilla del botín de la partida (la conoce
  // también el servidor); sin ella (partida local) se elige una al azar.
  reset(rng = random, tierSeed = null) {
    const seed = tierSeed ?? ((random.next() * 2 ** 32) >>> 0);
    this.tierSeed = seed;
    this.fx.clearBursts();
    for (const c of this.list) {
      c.opened = false;
      c.openT = 0;
      c.pending = null;
      c.pendingIds = null;
      c.requested = false;
      c.broken = false;
      c.hp = undefined;
      c.active = c.forced || rng.chance(c.chance ?? (c.kind === 'chest' ? 0.5 : 0.55));
      if (c.kind === 'chest') {
        this.fx.reset(c);
        if (!c.extra) this.setTier(c, chestTier(seed, c.index, c.vault));
      }
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
    this._open(c, this._loot(c), null, opener);
  }

  // tier: nivel que dice el servidor (manda sobre el calculado aquí).
  openNet(c, items, opener, brk = false, tier = undefined) {
    if (c.opened) return;
    if (tier !== undefined && c.kind === 'chest') this.setTier(c, tier);
    this._open(c, items.map((x) => x[1]), items.map((x) => x[0]), opener);
    if (brk) this.breakVisual(c);
  }

  _open(c, loot, ids, opener) {
    c.opened = true;
    if (c.glow) c.glow.visible = false;
    c.pending = loot;
    c.pendingIds = ids;
    // los cofres buenos tardan un poco más: primero el destello
    c.pendingT = 0.22 + (c.tier || 0) * 0.1;
    const g = this.game;
    const near = !opener || opener.isPlayer || c.pos.distanceTo(g.player.pos) < 25;
    if (c.kind === 'chest') this.fx.open(c, near && c.pos.distanceTo(g.camera.position) < 120);
    if (!near) return;
    if (c.kind !== 'chest') g.audio.pickup();
    else if (c.tier === 2) g.audio.chestLegendary();
    else if (c.tier === 1) g.audio.chestEpic();
    else g.audio.chest();
    if (c.tier === 2 && opener?.isPlayer) g.hud.toast?.('✨ ¡Cofre legendario!');
  }

  update(dt, time) {
    const g = this.game;
    const cam = g.camera.position;
    const cd2 = g.propDist(160) ** 2;
    setChestShading(g.composer ? 2.2 : 1, time);
    for (const c of this.list) {
      if (!c.active) continue;
      if (c.pending) {
        c.pendingT -= dt;
        if (c.pendingT <= 0) {
          const origin = c.pos.clone();
          origin.y += 0.6;
          origin.x += Math.sin(c.rotY) * 0.5;
          origin.z += Math.cos(c.rotY) * 0.5;
          g.pickups.burst(c.pending, origin, c.rotY, c.pendingIds);
          c.pending = null;
          c.pendingIds = null;
        }
      }
      if (c.broken) continue;
      const vis = c.pos.distanceToSquared(cam) < cd2;
      c.model.visible = vis;
      if (c.shakeT > 0) {
        c.shakeT -= dt;
        c.model.rotation.z = Math.sin(c.shakeT * 60) * 0.06 * (c.shakeT / 0.25);
        if (c.shakeT <= 0) c.model.rotation.z = 0;
      }
      if (c.glow) c.glow.visible = vis && !c.opened;
      if (!vis) continue;
      if (c.opened && c.openT < 1) {
        // los cofres buenos se abren con un pequeño salto de la tapa
        c.openT = Math.min(1, c.openT + dt * (c.tier ? 3 : 4));
        const k = 1 - Math.pow(1 - c.openT, 3);
        const pop = c.tier ? Math.sin(c.openT * Math.PI) * 0.25 : 0;
        c.model.userData.lid.rotation.x = -1.9 * k - pop;
      }
      if (c.glow && c.glow.visible) {
        const t = c.tier || 0;
        c.glow.material.opacity = [0.45, 0.5, 0.42][t] + Math.sin(time * (4 + t) + c.pos.x) * (t ? 0.16 : 0.2);
      }
    }
    this.fx.update(dt, time, cam, g.propDist(95));
  }

  findInteract(eye, forward, maxDist = 3) {
    let best = null, bestScore = -Infinity;
    for (const c of this.list) {
      if (!c.active || c.opened || c.locked || c.broken) continue;
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

  // Cofre más interesante cerca: los épicos y legendarios «pesan» más que la
  // distancia (dist es la distancia real).
  nearestChest(pos, maxDist) {
    let best = null, bd = Infinity, dist = 0;
    for (const c of this.list) {
      if (!c.active || c.opened || c.locked || c.kind !== 'chest' || c.broken) continue;
      const d = c.pos.distanceTo(pos);
      if (d >= maxDist) continue;
      const score = d / (1 + 0.6 * (c.tier || 0));
      if (score < bd) {
        bd = score;
        best = c;
        dist = d;
      }
    }
    return best ? { chest: best, dist } : null;
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

