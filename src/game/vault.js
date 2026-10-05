import * as THREE from 'three';
import { makeWeapon } from './items.js';
import { getGlowTexture } from './models.js';

// Bóveda de la isla central: puerta blindada que sólo se abre con la
// tarjeta que suelta el Guardián de la Bóveda al morir. Quien lleva la
// tarjeta la pierde (cae al suelo) si lo eliminan. Dentro hay cofres que
// siempre aparecen y armas legendarias.
const TREASURE = ['heavyar', 'sniper', 'shotgun', 'rocket', 'ar', 'tactical'];

export class Vault {
  constructor(game) {
    this.game = game;
    const v = game.world.vault;
    this.v = v;
    this.open = false;
    this.lift = 0;
    this.card = null;
    if (!v) return;
    const d = v.door;
    const sx = d.maxX - d.minX, sz = d.maxZ - d.minZ, h = d.y1 - d.y0;
    const along = d.alongX; // la hoja es fina en Z (si no, en X)
    // Hoja de acero con franjas amarillas y un volante en cada cara
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x8f969e, metalness: 0.7, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.5, roughness: 0.5 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.6 });
    // (algo más fina que el muro: al abrirse se esconde dentro sin parpadeos)
    g.add(new THREE.Mesh(new THREE.BoxGeometry(along ? sx : sx * 0.8, h, along ? sz * 0.8 : sz), steel));
    const thin = (along ? sz : sx) * 0.4 + 0.03;
    for (const s of [thin, -thin]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 20), dark);
      if (along) wheel.position.z = s;
      else {
        wheel.rotation.y = Math.PI / 2;
        wheel.position.x = s;
      }
      g.add(wheel);
      (this.wheels ||= []).push(wheel);
    }
    for (const y of [-h / 2 + 0.3, h / 2 - 0.3]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(sx + (along ? 0 : 0.08), 0.18, sz + (along ? 0.08 : 0)), yellow);
      stripe.position.y = y;
      g.add(stripe);
    }
    g.traverse((o) => (o.castShadow = o.receiveShadow = true));
    this.base = new THREE.Vector3((d.minX + d.maxX) / 2, d.y0 + h / 2, (d.minZ + d.maxZ) / 2);
    g.position.copy(this.base);
    game.scene.add(g);
    this.mesh = g;
    this.h = h;
    this.center = new THREE.Vector3(d.front.x, d.y0 + 1.2, d.front.z);
    // Tarjeta: rectángulo dorado brillante con halo
    const cg = new THREE.Group();
    cg.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.04), new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0xb07000, emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 })));
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: 0xd63a2f, emissive: 0x801010 }));
    chip.position.set(-0.12, 0.04, 0);
    cg.add(chip);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffd34d, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.6, 1.6, 1);
    cg.add(glow);
    cg.visible = false;
    game.scene.add(cg);
    this.cardMesh = cg;
    this.reset();
  }

  get chests() {
    return this.game.containers.list.filter((c) => c.vault);
  }

  // Nueva partida: puerta cerrada, cofres bloqueados y sin tarjeta.
  reset() {
    const g = this.game;
    g.player.vaultCard = false;
    if (!this.v) return;
    this.open = false;
    this.lift = 0;
    this.mesh.position.copy(this.base);
    for (const w of this.wheels) w.visible = true;
    this.setCollider(true);
    for (const c of this.chests) c.locked = true;
    this.card = null;
    this.cardMesh.visible = false;
  }

  setCollider(on) {
    const col = this.game.world.collision;
    if (this.collider) col.remove(this.collider);
    this.collider = null;
    if (!on) return;
    const d = this.v.door;
    this.collider = col.add(d.minX, d.y0, d.minZ, d.maxX, d.y1, d.maxZ, { type: 'building' });
  }

  // La tarjeta cae en `pos` (al morir el Guardián o quien la llevaba).
  dropCard(pos) {
    if (!this.v || this.open) return;
    const y = this.game.world.groundBelow(pos.x, pos.z, pos.y + 1.5);
    this.card = { pos: new THREE.Vector3(pos.x, Math.max(y, this.game.world.waterLevelAt(pos.x, pos.z)) + 0.9, pos.z) };
    this.cardMesh.position.copy(this.card.pos);
    this.cardMesh.visible = true;
  }

  unlock() {
    const g = this.game;
    this.open = true;
    g.player.vaultCard = false;
    this.setCollider(false);
    for (const c of this.chests) c.locked = false;
    // Tesoro: dos armas legendarias en el suelo de la bóveda
    const v = this.v;
    const inside = new THREE.Vector3(v.x, v.door.y0 + 0.5, v.z);
    const pick = TREASURE.slice().sort(() => Math.random() - 0.5);
    g.pickups.burst([makeWeapon(pick[0], 4), makeWeapon(pick[1], 4), { kind: 'consumable', type: 'chugjug', count: 1 }], inside);
    g.audio.chest?.();
    g.hud.toast('🔓 ¡Bóveda abierta! Dentro hay cofres y armas legendarias');
    g.hud.killFeed?.('🔓 <b>Alguien ha abierto la bóveda</b> de la isla central', false);
  }

  // Interacción con la puerta (E). Devuelve true si la ha gestionado.
  interact(input, E) {
    if (!this.v || this.open) return false;
    const p = this.game.player;
    if (p.pos.distanceTo(this.center) > 3.6) return false;
    if (p.vaultCard) {
      this.game.hud.setPrompt(`${E} Abrir la bóveda con la tarjeta`);
      if (input.hit('interact')) this.unlock();
    } else this.game.hud.setPrompt('🔒 Bóveda cerrada · necesitas la tarjeta del Guardián de la isla');
    return true;
  }

  update(dt, time) {
    if (!this.v) return;
    const g = this.game;
    const p = g.player;
    // La puerta se desliza de lado y se esconde dentro del muro
    if (this.open && this.lift < 1) {
      this.lift = Math.min(1, this.lift + dt * 0.5);
      const d = this.v.door;
      const k = (1 - Math.pow(1 - this.lift, 2)) * ((d.alongX ? d.maxX - d.minX : d.maxZ - d.minZ) + 0.1);
      if (d.alongX) this.mesh.position.x = this.base.x + k;
      else this.mesh.position.z = this.base.z + k;
      for (const w of this.wheels) w.visible = this.lift < 0.3;
    }
    // Si eliminan al jugador con la tarjeta, la suelta
    if (p.vaultCard && !p.alive) {
      p.vaultCard = false;
      this.dropCard(p.pos);
    }
    const c = this.card;
    if (!c) return;
    this.cardMesh.rotation.y += dt * 2;
    this.cardMesh.position.y = c.pos.y + Math.sin(time * 3) * 0.08;
    if (p.alive && p.mode === 'ground' && !p.knocked && p.pos.distanceTo(c.pos) < 2) {
      this.card = null;
      this.cardMesh.visible = false;
      p.vaultCard = true;
      g.audio.pickup?.();
      g.hud.toast('💳 ¡Tarjeta de la bóveda! Llévala a la puerta blindada de la isla central');
    }
  }
}
