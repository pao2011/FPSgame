import * as THREE from 'three';
import { THROWABLES, WEAPONS } from './items.js';
import { makeThrowableModel, makeProjectileModel, getGlowTexture, mergedMesh } from './models.js';

const G_THROW = 20; // gravedad de los objetos lanzados
const MAX_C4 = 10;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

let smokeTex = null;
function getSmokeTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 14 + Math.random() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  smokeTex = new THREE.CanvasTexture(c);
  smokeTex.colorSpace = THREE.SRGBColorSpace;
  return smokeTex;
}

// Granadas, C4, cohetes, flechas explosivas, humo y fuego.
// En online cada lanzamiento se anuncia (m.ex) y todos lo simulan; sólo el
// ordenador de quien lo lanzó aplica el daño (el resto es visual), y cada
// ordenador aplica el empujón a los personajes que controla.
export class Explosives {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.list = [];
    this.zones = [];
    this.fireballs = [];
    this.puffs = [];
    this.puffIdx = 0;
    this.shake = 0;

    const fbGeo = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(fbGeo, new THREE.MeshBasicMaterial({
        color: 0xff8a2a, transparent: true, opacity: 0, depthWrite: false,
      }));
      m.visible = false;
      this.scene.add(m);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(), color: 0xffd080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      flash.visible = false;
      this.scene.add(flash);
      this.fireballs.push({ mesh: m, flash, t: 0, max: 0.45, r: 1 });
    }
    this.fbIdx = 0;
    this.light = new THREE.PointLight(0xffa040, 0, 40, 2);
    this.scene.add(this.light);
    this.lightT = 0;

    const smokeMat = new THREE.SpriteMaterial({ map: getSmokeTexture(), color: 0x777777, transparent: true, depthWrite: false });
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.visible = false;
      this.scene.add(s);
      this.puffs.push({ sprite: s, vel: new THREE.Vector3(), life: 0, max: 1, grow: 1, alpha: 0.6 });
    }

    // Trayectoria prevista al apuntar con un arrojadizo
    const pts = new Float32Array(64 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.arc = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.35, gapSize: 0.2, transparent: true, opacity: 0.85, depthTest: false }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arc.renderOrder = 10;
    this.scene.add(this.arc);
    this.arcEnd = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }),
    );
    this.arcEnd.visible = false;
    this.arcEnd.renderOrder = 10;
    this.scene.add(this.arcEnd);
  }

  reset() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list.length = 0;
    for (const z of this.zones) this._removeZone(z);
    this.zones.length = 0;
    for (const f of this.fireballs) {
      f.t = 0;
      f.mesh.visible = false;
      f.flash.visible = false;
    }
    for (const s of this.puffs) {
      s.life = 0;
      s.sprite.visible = false;
    }
    this.light.intensity = 0;
    this.shake = 0;
    this.hidePreview();
  }

  // ¿Este ordenador decide el daño de lo que lanza `owner`?
  authority(owner) {
    const net = this.game.net;
    return !net || net.isLocal(owner);
  }

  charges(owner) {
    let n = 0;
    for (const p of this.list) if (p.type === 'c4' && p.owner === owner) n++;
    return n;
  }

  // ------------------------------------------------------------ LANZAR
  // Velocidad inicial de un arrojadizo lanzado en la dirección `dir`.
  throwVelocity(owner, dir, def, out = new THREE.Vector3()) {
    out.copy(dir).multiplyScalar(def.speed);
    out.y += 3;
    if (owner) {
      out.x += owner.vel.x * 0.5;
      out.z += owner.vel.z * 0.5;
    }
    return out;
  }

  // Velocidad para que un arrojadizo lanzado por `owner` caiga en `target`.
  aimThrow(owner, target, out = new THREE.Vector3()) {
    const dir = tmpA.copy(target).sub(owner.eye).setY(0).normalize();
    const from = this.throwOrigin(owner, dir, tmpB);
    const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z;
    const T = Math.min(1.7, Math.max(0.45, Math.hypot(dx, dz) / 14));
    return out.set(dx / T, (dy + 0.5 * G_THROW * T * T) / T, dz / T);
  }

  throwOrigin(owner, dir, out = new THREE.Vector3()) {
    out.copy(owner.eye);
    out.x += dir.z * -0.25;
    out.z += dir.x * 0.25;
    out.y -= 0.15;
    return out.addScaledVector(dir, 0.45);
  }

  // Lanza un arrojadizo. Devuelve false si no se puede (p. ej. demasiados C4).
  // vel: velocidad ya calculada (los bots apuntan con una parábola exacta).
  throwItem(owner, type, dir, vel = null) {
    const def = THROWABLES[type];
    if (!def) return false;
    if (def.remote && this.charges(owner) >= MAX_C4) return false;
    const pos = this.throwOrigin(owner, dir);
    if (!vel) vel = this.throwVelocity(owner, dir, def);
    this._spawnThrown(owner, type, pos, vel, this.authority(owner));
    this.game.net?.sendEx(owner, { a: 't', k: type, o: pos, v: vel });
    this.game.audio.throwSound?.(this._vol(pos));
    return true;
  }

  _spawnThrown(owner, type, pos, vel, local) {
    const def = THROWABLES[type];
    const mesh = new THREE.Group();
    mesh.add(mergedMesh('t_' + type, () => makeThrowableModel(type)));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.list.push({
      kind: 'throw', type, def, owner, local, mesh, pos: mesh.position, vel: vel.clone(),
      gravity: G_THROW, fuse: def.fuse ?? Infinity, bounce: def.bounce ?? 0, sticky: !!def.sticky,
      impact: def.impact, impactT: -1, stuck: false, stuckBox: null, stuckTo: null, stuckOff: new THREE.Vector3(),
      resting: false, age: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0),
      damage: def.damage, radius: def.radius, build: def.build, knock: def.knock,
    });
  }

  // Proyectil de un arma explosiva (lanzacohetes, lanzagranadas, arco).
  // power (0..1): tensado del arco.
  launch(owner, weaponType, rarity, origin, dir, power = 1) {
    const w = WEAPONS[weaponType];
    const ex = w.explosive;
    const speed = ex.minSpeed ? ex.minSpeed + (ex.speed - ex.minSpeed) * power : ex.speed;
    const vel = dir.clone().multiplyScalar(speed);
    this._spawnProjectile(owner, weaponType, rarity, origin, vel, this.authority(owner));
    this.game.net?.sendEx(owner, { a: 'l', k: weaponType, r: rarity, o: origin, v: vel });
  }

  _spawnProjectile(owner, weaponType, rarity, origin, vel, local) {
    const w = WEAPONS[weaponType];
    const ex = w.explosive;
    const mesh = new THREE.Group();
    mesh.add(mergedMesh('p_' + ex.kind, () => makeProjectileModel(ex.kind)));
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.list.push({
      kind: ex.kind, type: weaponType, owner, local, mesh, pos: mesh.position, vel: vel.clone(),
      gravity: ex.gravity, fuse: ex.fuse ?? 6, bounce: ex.kind === 'shell' ? 0.35 : 0, sticky: false,
      impact: ex.kind === 'shell' ? undefined : 0, impactT: -1, stuck: false, resting: false, age: 0,
      damage: w.damage[rarity] ?? w.damage[0], radius: ex.radius, build: ex.build, knock: ex.kind === 'rocket' ? 9 : 6,
      trailT: 0,
    });
  }

  // Detona todos los C4 colocados por `owner`.
  detonate(owner, fromNet = false) {
    let n = 0;
    for (const p of this.list.slice()) {
      if (p.type !== 'c4' || p.owner !== owner) continue;
      p.fuse = Math.min(p.fuse, 0.05 + n * 0.06);
      n++;
    }
    if (n && !fromNet) this.game.net?.sendEx(owner, { a: 'd' });
    return n;
  }

  // Mensaje de red: otro jugador (o un bot del anfitrión) lanzó algo.
  onNet(owner, m) {
    if (!owner) return;
    if (m.a === 'd') {
      this.detonate(owner, true);
      return;
    }
    const pos = new THREE.Vector3(m.o[0], m.o[1], m.o[2]);
    const vel = new THREE.Vector3(m.v[0], m.v[1], m.v[2]);
    if (m.a === 't' && THROWABLES[m.k]) {
      this._spawnThrown(owner, m.k, pos, vel, false);
      this.game.audio.throwSound?.(this._vol(pos));
    } else if (m.a === 'l' && WEAPONS[m.k]?.explosive) {
      this._spawnProjectile(owner, m.k, m.r | 0, pos, vel, false);
    }
  }

  // ------------------------------------------------------------ UPDATE
  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      // Los C4 de quien ya no está desaparecen sin explotar
      if (p.type === 'c4' && (!p.owner || !p.owner.alive)) {
        this._remove(i);
        continue;
      }
      this._step(p, dt);
      if (p.impactT >= 0) {
        p.impactT -= dt;
        if (p.impactT < 0) p.fuse = 0;
      }
      p.fuse -= dt;
      if (p.fuse <= 0) {
        this._remove(i);
        this._detonate(p);
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      if (z.kind === 'smoke') this._updateSmoke(z, dt);
      else this._updateFire(z, dt);
      if (z.t >= z.max) {
        this._removeZone(z);
        this.zones.splice(i, 1);
      }
    }
    this._updateFx(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.8);
    g.camShake = this.shake;
  }

  _remove(i) {
    const p = this.list[i];
    this.scene.remove(p.mesh);
    this.list.splice(i, 1);
  }

  _step(p, dt) {
    const g = this.game;
    if (p.stuck) {
      if (p.stuckTo) {
        if (!p.stuckTo.alive) p.stuck = false;
        else p.pos.copy(p.stuckTo.pos).add(p.stuckOff);
      } else if (p.stuckBox && !p.stuckBox._cells.length) {
        p.stuck = false; // se rompió la pieza a la que estaba pegado
        p.vel.set(0, 0, 0);
      }
      if (p.stuck) return;
    }
    if (p.resting) {
      const below = g.raycast(tmpA.copy(p.pos).setY(p.pos.y + 0.05), DOWN, 0.2, 0, p.owner);
      if (below) return;
      p.resting = false;
    }
    p.vel.y -= p.gravity * dt;
    const len = p.vel.length() * dt;
    if (len < 1e-5) return;
    const dir = tmpB.copy(p.vel).divideScalar(p.vel.length());
    const hit = g.raycast(p.pos, dir, len + 0.08, 0, p.owner);
    if (!hit) {
      p.pos.addScaledVector(p.vel, dt);
    } else {
      this._onContact(p, hit, dir);
    }
    // Orientación / giro
    if (p.kind === 'throw') {
      if (!p.stuck && !p.resting) {
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
      }
    } else if (!p.resting) {
      p.mesh.lookAt(tmpA.copy(p.pos).add(p.vel));
    }
    // Estelas
    if (p.kind === 'rocket' || p.kind === 'arrow') {
      p.trailT -= dt;
      if (p.trailT <= 0 && p.pos.distanceToSquared(g.camera.position) < 250 * 250) {
        p.trailT = p.kind === 'rocket' ? 0.025 : 0.05;
        this.puff(p.pos, p.kind === 'rocket' ? 0.5 : 0.25, 0xd8d8d8, 0.7, 0.55, tmpN.set(0, 0.4, 0));
      }
    }
  }

  _onContact(p, hit, dir) {
    const n = hit.normal || tmpN.set(0, 1, 0);
    p.pos.copy(hit.point).addScaledVector(n, hit.kind === 'character' ? 0 : 0.04);
    // Impacto directo (cohete, flecha, molotov) o pegarse
    if (p.impact === 0) {
      p.fuse = 0;
      p.contactNormal = n.clone();
      return;
    }
    if (p.kind === 'shell' && hit.kind === 'character') {
      p.fuse = 0;
      return;
    }
    if (p.sticky) {
      p.stuck = true;
      p.vel.set(0, 0, 0);
      if (hit.kind === 'character') {
        p.stuckTo = hit.entity;
        p.stuckOff.copy(p.pos).sub(hit.entity.pos);
      } else p.stuckBox = hit.box || null;
      if (p.def?.fuse !== undefined && !p.armed) {
        p.armed = true;
        p.fuse = p.def.fuse;
      }
      if (p.type === 'c4') this.game.audio.stick?.(this._vol(p.pos));
      return;
    }
    if (p.impact !== undefined && p.impactT < 0) p.impactT = p.impact;
    // Rebote
    const vn = p.vel.dot(n);
    if (vn < 0) p.vel.addScaledVector(n, -(1 + p.bounce) * vn);
    p.vel.multiplyScalar(0.7);
    if (n.y > 0.6 && p.vel.length() < 2) {
      p.vel.set(0, 0, 0);
      p.resting = true;
    } else if (Math.abs(vn) > 3) this.game.audio.bounce?.(this._vol(p.pos));
  }

  _detonate(p) {
    if (p.kind === 'throw' && p.def.smoke) {
      this.addZone('smoke', p.pos, p.def.radius, p.def.smoke, p.owner, p.local);
      this.game.audio.smokePop?.(this._vol(p.pos));
      return;
    }
    if (p.kind === 'throw' && p.def.fire) {
      // El fuego se extiende por el suelo bajo el punto de impacto
      const g = this.game;
      const below = g.raycast(tmpA.copy(p.pos).setY(p.pos.y + 0.3), DOWN, 6, 0, null);
      const at = below ? below.point : p.pos.clone();
      this.addZone('fire', at, p.def.radius, p.def.fire, p.owner, p.local, p.def.dps);
      g.audio.molotov?.(this._vol(at));
      this.burst(at, 1.2, 0xff7a20);
      return;
    }
    this.explode(p.pos, {
      damage: p.damage, radius: p.radius, build: p.build, knock: p.knock ?? (p.damage > 0 ? 6 : 0),
      owner: p.owner, local: p.local, impulse: p.kind === 'throw' && p.type === 'impulse',
    });
  }

  // ------------------------------------------------------------ EXPLOSIÓN
  explode(pos, o) {
    const g = this.game;
    const r = o.radius;
    const camD = pos.distanceTo(g.camera.position);
    // Efectos
    if (o.impulse) this.burst(pos, r * 0.55, 0x8ad8ff);
    else {
      this.burst(pos, r * 0.6, 0xff8a2a);
      if (camD < 260) {
        for (let i = 0; i < 10; i++) {
          const v = tmpN.set((Math.random() - 0.5) * 3, Math.random() * 2.5 + 0.5, (Math.random() - 0.5) * 3);
          this.puff(pos, r * 0.35, 0x555555, 1.6 + Math.random(), 0.75, v, r * 0.5);
        }
        g.effects.debris(pos, 0x3a3a3a);
      }
    }
    g.audio.explosion?.(this._vol(pos, 420), o.impulse);
    if (camD < r * 6) this.shake = Math.min(1, this.shake + (o.impulse ? 0.35 : 0.9) * (1 - camD / (r * 6)));
    g.noise(pos, 140, o.owner || g.player);

    // Empujón: cada ordenador mueve a los personajes que controla
    if (o.knock > 0) {
      for (const c of g.chars) {
        if (!c.alive || c.mode !== 'ground' || c.vehicle || c.isRemote) continue;
        if (g.net && !g.net.isLocal(c)) continue;
        const d = tmpA.copy(c.pos).setY(c.pos.y + 0.9).distanceTo(pos);
        if (d > r) continue;
        if (!o.impulse && this._blocked(pos, tmpA)) continue;
        const k = o.knock * (1 - 0.5 * (d / r));
        tmpB.copy(tmpA).sub(pos);
        tmpB.y = Math.max(tmpB.y, 0) + 0.6 * Math.max(0.3, tmpB.length());
        tmpB.normalize();
        c.vel.x += tmpB.x * k;
        c.vel.z += tmpB.z * k;
        c.vel.y = Math.max(c.vel.y, tmpB.y * k);
        c.onGround = false;
        c.launched = true;
      }
    }
    if (!o.local || !(o.damage > 0)) return;

    // Daño (sólo el ordenador con autoridad sobre quien lo lanzó)
    const owner = o.owner;
    const byPlayer = owner === g.player;
    for (const c of g.chars) {
      if (!c.alive || c === owner || c.mode === 'bus' || c.mode === 'lobby') continue;
      if (owner && c.team === owner.team) continue;
      const center = tmpA.copy(c.pos).setY(c.pos.y + c.height * 0.5);
      const d = center.distanceTo(pos);
      if (d > r + 0.4) continue;
      if (this._blocked(pos, center)) continue;
      const dmg = o.damage * (1 - 0.6 * Math.min(1, d / r));
      const point = center.clone();
      if (byPlayer) {
        const res = g.combat.damageCharacter(c, dmg, false, point, 'explosion');
        g.player.stats.damage += dmg;
        g.hud.hitMarker(false, res);
        g.audio.hit(false);
      } else c.damage(dmg, 'explosion', owner);
    }
    for (const v of g.vehicles.list) {
      if (v.dead) continue;
      const d = tmpA.copy(v.pos).setY(v.pos.y + 0.8).distanceTo(pos);
      if (d < r + 2) v.damage(o.damage * 2.5 * (1 - 0.6 * Math.min(1, d / (r + 2))));
    }
    for (const dm of g.dummies.list) {
      if (!dm.alive) continue;
      const center = tmpA.copy(dm.pos).setY(dm.pos.y + 1.2);
      const d = center.distanceTo(pos);
      if (d > r + 0.4 || this._blocked(pos, center)) continue;
      const killed = g.dummies.damage(dm, o.damage * (1 - 0.6 * Math.min(1, d / r)), false, center.clone());
      if (byPlayer) g.hud.hitMarker(false, killed);
    }
    if (o.build > 0) {
      for (const piece of [...g.build.pieces.values()]) {
        const d = piece.mesh.position.distanceTo(pos);
        if (d > r + 2) continue;
        g.build.damage(piece, o.build * (1 - 0.5 * Math.min(1, d / (r + 2))));
      }
    }
  }

  // ¿Hay una pared (o construcción) entre la explosión y el objetivo?
  _blocked(from, to) {
    const dir = tmpN.copy(to).sub(from);
    const d = dir.length();
    if (d < 0.5) return false;
    dir.divideScalar(d);
    const col = this.game.world.collision;
    const h = col.raycast(from.x, from.y, from.z, dir.x, dir.y, dir.z, d);
    if (h && h.t < d - 0.6 && h.box?.data?.type !== 'chest' && h.box?.data?.type !== 'dummy') return true;
    const ht = this.game.world.terrain.raycast(from, dir, d);
    return !!ht && ht.t < d - 0.6 && ht.t > 0.3;
  }

  _vol(pos, range = 260) {
    const d = pos.distanceTo(this.game.camera.position);
    const v = Math.max(0, 1 - d / range);
    return v * v;
  }

  // ------------------------------------------------------------ EFECTOS
  burst(pos, r, color) {
    const f = this.fireballs[this.fbIdx++ % this.fireballs.length];
    f.t = f.max = 0.45;
    f.r = r;
    f.mesh.position.copy(pos);
    f.mesh.material.color.setHex(color);
    f.mesh.visible = true;
    f.flash.position.copy(pos);
    f.flash.material.color.setHex(color === 0xff8a2a ? 0xffd080 : color);
    f.flash.visible = true;
    this.light.position.copy(pos);
    this.light.color.setHex(color);
    this.light.intensity = 260;
    this.lightT = 0.35;
  }

  puff(pos, size, color, life, alpha, vel, spread = 0) {
    const s = this.puffs[this.puffIdx++ % this.puffs.length];
    s.sprite.position.copy(pos);
    if (spread) {
      s.sprite.position.x += (Math.random() - 0.5) * spread;
      s.sprite.position.y += (Math.random() - 0.3) * spread;
      s.sprite.position.z += (Math.random() - 0.5) * spread;
    }
    s.sprite.material.color.setHex(color);
    s.sprite.material.rotation = Math.random() * Math.PI * 2;
    s.size = size;
    s.sprite.scale.setScalar(size);
    s.vel.copy(vel);
    s.life = s.max = life;
    s.alpha = alpha;
    s.sprite.visible = true;
  }

  _updateFx(dt) {
    for (const f of this.fireballs) {
      if (f.t <= 0) continue;
      f.t -= dt;
      const k = 1 - Math.max(0, f.t) / f.max;
      f.mesh.scale.setScalar(f.r * (0.35 + 0.65 * Math.sqrt(k)));
      f.mesh.material.opacity = (1 - k) * 0.9;
      f.flash.scale.setScalar(f.r * 5 * (1 - k * 0.6));
      f.flash.material.opacity = 1 - k;
      if (f.t <= 0) {
        f.mesh.visible = false;
        f.flash.visible = false;
      }
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity = Math.max(0, this.lightT / 0.35) * 260;
    }
    for (const s of this.puffs) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = 1 - s.life / s.max;
      s.sprite.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(Math.exp(-dt * 1.5));
      s.sprite.scale.setScalar(s.size * (1 + k * 1.6));
      s.sprite.material.opacity = s.alpha * Math.min(1, (1 - k) * 1.5);
      if (s.life <= 0) s.sprite.visible = false;
    }
  }

  // ------------------------------------------------------------ ZONAS
  addZone(kind, pos, radius, duration, owner, local, dps = 0) {
    const z = { kind, pos: pos.clone(), radius, max: duration, t: 0, owner, local, dps, tick: 0, parts: [] };
    if (kind === 'smoke') {
      const mat = new THREE.SpriteMaterial({ map: getSmokeTexture(), color: 0xc8ccd2, transparent: true, depthWrite: false, opacity: 0 });
      for (let i = 0; i < 16; i++) {
        const s = new THREE.Sprite(mat.clone());
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * radius * 0.75;
        s.userData.base = new THREE.Vector3(Math.cos(a) * rr, 0.6 + Math.random() * 2.8, Math.sin(a) * rr);
        s.userData.size = radius * (0.9 + Math.random() * 0.5);
        s.userData.ph = Math.random() * 6;
        s.position.copy(pos).add(s.userData.base);
        s.material.rotation = Math.random() * Math.PI * 2;
        this.scene.add(s);
        z.parts.push(s);
      }
    } else {
      const flameMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff7a20, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      for (let i = 0; i < 18; i++) {
        const s = new THREE.Sprite(flameMat.clone());
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * radius * 0.85;
        s.userData.base = new THREE.Vector3(Math.cos(a) * rr, 0.35, Math.sin(a) * rr);
        s.userData.ph = Math.random() * 6;
        s.position.copy(pos).add(s.userData.base);
        if (this.game.composer) s.material.color.multiplyScalar(1.8);
        this.scene.add(s);
        z.parts.push(s);
      }
      z.light = new THREE.PointLight(0xff7a20, 60, radius * 4, 2);
      z.light.position.copy(pos).setY(pos.y + 1);
      this.scene.add(z.light);
    }
    this.zones.push(z);
    return z;
  }

  _removeZone(z) {
    for (const s of z.parts) this.scene.remove(s);
    if (z.light) this.scene.remove(z.light);
  }

  _fade(z) {
    return Math.min(1, z.t / 0.8, (z.max - z.t) / 1.5);
  }

  _updateSmoke(z, dt) {
    const a = this._fade(z);
    z.alpha = a;
    for (const s of z.parts) {
      const b = s.userData.base;
      const ph = s.userData.ph + z.t * 0.4;
      s.position.set(z.pos.x + b.x + Math.sin(ph) * 0.5, z.pos.y + b.y + Math.sin(ph * 0.7) * 0.3, z.pos.z + b.z + Math.cos(ph) * 0.5);
      s.scale.setScalar(s.userData.size * (0.6 + 0.4 * Math.min(1, z.t / 1.2)));
      s.material.opacity = 0.92 * a;
      s.material.rotation += dt * 0.05;
    }
  }

  _updateFire(z, dt) {
    const g = this.game;
    const a = this._fade(z);
    for (const s of z.parts) {
      const f = 0.7 + 0.3 * Math.sin(g.time * 13 + s.userData.ph);
      s.scale.set(0.9 * f * a + 0.1, 1.6 * f * a + 0.1, 1);
      s.position.y = z.pos.y + s.userData.base.y + 0.3 * f;
      s.material.opacity = a;
    }
    z.light.intensity = 60 * a * (0.8 + 0.2 * Math.sin(g.time * 20));
    if (Math.random() < dt * 6) this.puff(tmpA.copy(z.pos).setY(z.pos.y + 1), 1.2, 0x333333, 1.4, 0.45, tmpN.set(0, 1.4, 0), z.radius);
    // Daño cada medio segundo (autoridad de quien lo lanzó)
    z.tick -= dt;
    if (z.tick > 0) return;
    z.tick = 0.5;
    if (!z.local) return;
    const owner = z.owner;
    for (const c of g.chars) {
      if (!c.alive || c.mode !== 'ground' || c.vehicle || c === owner) continue;
      if (owner && c.team === owner.team) continue;
      if (Math.hypot(c.pos.x - z.pos.x, c.pos.z - z.pos.z) > z.radius || Math.abs(c.pos.y - z.pos.y) > 2.2) continue;
      const dmg = z.dps * 0.5;
      if (owner === g.player) {
        const res = g.combat.damageCharacter(c, dmg, false, c.pos.clone().setY(c.pos.y + 1), 'fire');
        g.player.stats.damage += dmg;
        g.hud.hitMarker(false, res);
      } else c.damage(dmg, 'fire', owner);
    }
    for (const piece of [...g.build.pieces.values()]) {
      if (piece.mat !== 'wood') continue;
      if (piece.mesh.position.distanceTo(z.pos) < z.radius + 1.5) g.build.damage(piece, 20);
    }
  }

  // ¿El humo tapa la línea entre a y b? (para la visión de los bots)
  smokeBlocks(a, b) {
    for (const z of this.zones) {
      if (z.kind !== 'smoke' || (z.alpha ?? 0) < 0.5) continue;
      const cx = z.pos.x, cy = z.pos.y + 1.6, cz = z.pos.z;
      const r = z.radius * 0.85;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const len2 = dx * dx + dy * dy + dz * dz;
      let t = len2 > 0 ? ((cx - a.x) * dx + (cy - a.y) * dy + (cz - a.z) * dz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t - cx, py = a.y + dy * t - cy, pz = a.z + dz * t - cz;
      if (px * px + py * py * 0.5 + pz * pz < r * r) return true;
    }
    return false;
  }

  inFire(pos) {
    for (const z of this.zones) {
      if (z.kind === 'fire' && Math.hypot(pos.x - z.pos.x, pos.z - z.pos.z) < z.radius + 1) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ PREVISIÓN
  showPreview(owner, type, dir) {
    const def = THROWABLES[type];
    const g = this.game;
    const pos = this.throwOrigin(owner, dir, new THREE.Vector3());
    const vel = this.throwVelocity(owner, dir, def, new THREE.Vector3());
    const arr = this.arc.geometry.attributes.position.array;
    const step = 0.035;
    let n = 0;
    let end = null;
    const d = new THREE.Vector3();
    arr[0] = pos.x; arr[1] = pos.y; arr[2] = pos.z;
    n = 1;
    for (; n < 64; n++) {
      vel.y -= G_THROW * step;
      const len = vel.length() * step;
      d.copy(vel).divideScalar(vel.length());
      const hit = g.raycast(pos, d, len, 0, owner);
      if (hit) {
        pos.copy(hit.point);
        end = hit;
      } else pos.addScaledVector(vel, step);
      arr[n * 3] = pos.x; arr[n * 3 + 1] = pos.y; arr[n * 3 + 2] = pos.z;
      if (end) {
        n++;
        break;
      }
    }
    this.arc.geometry.setDrawRange(0, n);
    this.arc.geometry.attributes.position.needsUpdate = true;
    this.arc.geometry.computeBoundingSphere();
    this.arc.computeLineDistances();
    this.arc.visible = true;
    if (end) {
      this.arcEnd.position.copy(end.point).addScaledVector(end.normal || DOWN, 0.03);
      this.arcEnd.quaternion.setFromUnitVectors(tmpA.set(0, 1, 0), end.normal || tmpB.set(0, 1, 0));
      this.arcEnd.scale.setScalar(def.radius ? Math.max(1, def.radius / 2.5) : 1);
      this.arcEnd.visible = true;
    } else this.arcEnd.visible = false;
  }

  hidePreview() {
    this.arc.visible = false;
    this.arcEnd.visible = false;
  }
}
