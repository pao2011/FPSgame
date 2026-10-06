import * as THREE from 'three';
import { mat } from './models.js';
import { PICKAXE, makeWeapon } from './items.js';

// Furgonetas de reaparición (dúos, tríos y escuadras contra bots): al caer
// un compañero suelta su tarjeta; quien la recoja puede llevarla a una
// furgoneta y mantener E 5 s para que vuelva desde el cielo. Si el que cae
// eres tú, un compañero bot recoge tu tarjeta y te reaparece al rato.
const HOLD = 5;
const CARD_LIFE = 90;
const VAN_CD = 60;

function makeVan() {
  const g = new THREE.Group();
  const box = (w, h, d, c, x, y, z, o) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  box(2.3, 1.9, 4.6, 0xe8ecef, 0, 1.45, 0, { phong: true, shininess: 50 });
  box(2.32, 0.35, 4.62, 0x2f6fd6, 0, 0.75, 0);
  box(2.0, 0.9, 1.2, 0x29445e, 0, 1.9, -1.8, { phong: true, shininess: 120 });
  box(0.9, 1.2, 0.05, 0x2f6fd6, 0, 1.4, 2.32);
  // Antena parabólica y luces
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.5), mat(0xcfd6dd, { side: THREE.DoubleSide }));
  dish.rotation.x = -0.9;
  dish.position.set(0, 2.75, 0.8);
  g.add(dish);
  const light = box(0.5, 0.18, 0.3, 0x3fa9ff, 0, 2.5, -1.2, { emissive: 0x1a5aff });
  for (const x of [-0.95, 0.95]) for (const z of [-1.5, 1.5]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12).rotateZ(Math.PI / 2), mat(0x1b1f26));
    w.position.set(x, 0.38, z);
    g.add(w);
  }
  // Panel con el símbolo de reaparición
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#0d2a5c';
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#5ad1ff';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(32, 32, 18, 0.6, Math.PI * 2 - 0.2);
  x.stroke();
  x.fillStyle = '#5ad1ff';
  x.beginPath();
  x.moveTo(50, 22);
  x.lineTo(56, 36);
  x.lineTo(42, 34);
  x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: tex }));
    p.position.set(sx * 1.17, 1.5, 0.4);
    p.rotation.y = (sx * Math.PI) / 2;
    g.add(p);
  }
  g.userData.light = light;
  return g;
}

export class RebootVans {
  constructor(game) {
    this.game = game;
    this.vans = [];
    this.cards = [];
    this.carried = []; // tarjetas que lleva el jugador
    this.hold = 0;
    this.pending = null; // reaparición del jugador por un compañero bot
    if (game.world.creative) return;
    const w = game.world;
    const pois = w.pois.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < pois.length && this.vans.length < 6; i += 2) {
      const poi = pois[i];
      for (let k = 0; k < 30; k++) {
        const a = i * 1.9 + k * 0.6, r = poi.radius * 0.8 + k * 1.5;
        const x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r;
        if (w.occupied(x, z, 3)) continue;
        const y = w.groundBelow(x, z, 200);
        if (y < 1 || Math.abs(w.groundBelow(x + 2, z + 2, 200) - y) > 0.8) continue;
        const m = makeVan();
        m.position.set(x, y, z);
        m.rotation.y = a;
        game.scene.add(m);
        this.vans.push({ pos: m.position, mesh: m, cd: 0, name: poi.name });
        break;
      }
    }
    this.cardGeo = new THREE.BoxGeometry(0.42, 0.6, 0.04);
    this.cardMat = new THREE.MeshStandardMaterial({ color: 0x3fa9ff, emissive: 0x1a6aff, emissiveIntensity: 1.2, roughness: 0.4 });
  }

  get enabled() {
    const g = this.game;
    return this.vans.length > 0 && !g.net && (g.mode.teamSize || 1) > 1 && !g.mode.respawn && !g.mode.creative;
  }

  reset() {
    for (const c of this.cards) this.game.scene.remove(c.mesh);
    this.cards = [];
    this.carried = [];
    this.hold = 0;
    this.pending = null;
    for (const v of this.vans) v.cd = 0;
  }

  // Alguien del equipo del jugador ha caído: tarjeta en el suelo.
  onElim(victim) {
    const g = this.game;
    if (!this.enabled || victim.team !== g.player.team || victim.boss) return;
    if (victim === g.player) {
      // Un compañero bot vivo irá a por tu tarjeta
      const mate = g.teamMembers(g.player.team).find((c) => c !== g.player && c.alive);
      if (!mate) return;
      const van = this.nearestVan(g.player.pos);
      const dist = mate.pos.distanceTo(g.player.pos) + g.player.pos.distanceTo(van.pos);
      this.pending = { mate, t: 12 + Math.min(40, dist / 9), van };
      g.hud.toast(`${mate.name} va a por tu tarjeta de reaparición`);
      return;
    }
    const mesh = new THREE.Mesh(this.cardGeo, this.cardMat);
    mesh.position.copy(victim.pos).setY(victim.pos.y + 1);
    g.scene.add(mesh);
    this.cards.push({ who: victim, mesh, t: CARD_LIFE });
    g.hud.toast(`💳 Recoge la tarjeta de ${victim.name} y llévala a una furgoneta de reaparición`);
  }

  nearestVan(pos) {
    let best = this.vans[0], bd = Infinity;
    for (const v of this.vans) {
      const d = v.pos.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  // Interacción del jugador con una furgoneta (llamado desde updateInteraction).
  interact(input, dt, E) {
    const g = this.game;
    const p = g.player;
    if (!this.enabled || !this.carried.length || !p.alive) return false;
    const van = this.vans.find((v) => v.pos.distanceTo(p.pos) < 4.5);
    if (!van) return false;
    if (van.cd > 0) {
      g.hud.setPrompt(`Furgoneta recargando · ${Math.ceil(van.cd)} s`);
      return true;
    }
    const names = this.carried.map((c) => c.who.name).join(', ');
    if (input.held('interact')) {
      this.hold += dt;
      g.hud.setPrompt(`Reapareciendo a ${names}… ${Math.ceil(HOLD - this.hold)} s`);
      g.hud.setProgress?.(this.hold / HOLD, 'Reaparición');
      if (this.hold >= HOLD) {
        this.hold = 0;
        g.hud.setProgress?.(null);
        for (const c of this.carried) this.rebootBot(c.who, van);
        this.carried = [];
        van.cd = VAN_CD;
      }
    } else {
      if (this.hold > 0) g.hud.setProgress?.(null);
      this.hold = 0;
      g.hud.setPrompt(`${E} Mantener: reaparecer a ${names}`);
    }
    return true;
  }

  rebootBot(b, van) {
    const g = this.game;
    if (b.alive) return;
    b.respawnAt(van.pos.x, van.pos.z, { weapons: [makeWeapon('pistol', 0), null, null], heals: {} }, van.pos.y + 110);
    if (!g.chars.includes(b)) g.chars.push(b);
    g.hud.killFeed(`🚐 <b>${b.name}</b> ha vuelto gracias a la furgoneta de reaparición`, true);
    g.audio.launch?.();
  }

  rebootPlayer(van) {
    const g = this.game;
    const p = g.player;
    p.resetBody();
    p.inventory = [PICKAXE, makeWeapon('pistol', 0), null, null, null, null];
    p.ammo = { light: 30, medium: 0, heavy: 0, shells: 0, rockets: 0 };
    p.mats = { wood: 0, stone: 0, metal: 0 };
    p.selected = 0;
    p.pos.set(van.pos.x, van.pos.y + 110, van.pos.z);
    p.vel.set(0, -10, 0);
    p.mode = 'freefall';
    p.model.root.visible = g.camMode !== 'fp';
    g.combat.modelKey = null;
    g.combat.select(0);
    g.spectating = null;
    g.deathInfo = null;
    g.hud.toast('🚐 ¡Has vuelto a la partida! Planea hasta el suelo');
    g.input.lock();
  }

  update(dt) {
    const g = this.game;
    if (!this.vans.length) return;
    const p = g.player;
    const t = g.time;
    const cam = g.camera.position;
    const d2 = g.propDist(320) ** 2;
    for (const v of this.vans) {
      v.mesh.visible = v.pos.distanceToSquared(cam) < d2;
      if (v.cd > 0) v.cd -= dt;
      v.mesh.userData.light.material.emissiveIntensity = v.cd > 0 ? 0.2 : 0.6 + Math.sin(t * 6) * 0.4;
    }
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      c.t -= dt;
      c.mesh.rotation.y += dt * 2;
      if (c.t <= 0 || c.who.alive) {
        g.scene.remove(c.mesh);
        this.cards.splice(i, 1);
        continue;
      }
      if (p.alive && c.mesh.position.distanceTo(p.pos.clone().setY(p.pos.y + 1)) < 2) {
        g.scene.remove(c.mesh);
        this.cards.splice(i, 1);
        this.carried.push(c);
        g.audio.pickup?.();
        g.hud.toast(`💳 Tienes la tarjeta de ${c.who.name}: llévala a una furgoneta (🚐 en el mapa)`);
      }
    }
    // Tu compañero bot te reaparece
    const pd = this.pending;
    if (pd && !p.alive && g.state === 'playing') {
      if (!pd.mate.alive) {
        this.pending = null;
        g.hud.toast('Tu compañero ha caído antes de llegar a la furgoneta');
        return;
      }
      pd.t -= dt;
      if (pd.t <= 0) {
        this.pending = null;
        this.rebootPlayer(pd.van);
      }
    }
  }
}
