import * as THREE from 'three';
import { makeWeapon, CONSUMABLES } from './items.js';

// Bóvedas: puertas blindadas que sólo se abren con su tarjeta. La de la isla
// central (id 0) la suelta el Guardián de la Bóveda; las de las ciudades
// (1-3), el jefe de cada ciudad. Las tarjetas son objetos del inventario: se
// pierden (caen al suelo) si te eliminan y, con la tarjeta en la mano, una
// flecha en el HUD señala su bóveda. Dentro hay cofres que siempre aparecen
// y armas legendarias.
const TREASURE = ['heavyar', 'sniper', 'shotgun', 'rocket', 'ar', 'tactical', 'burst', 'handcannon'];

export const cardType = (id) => `card${id}`;

export class Vault {
  constructor(game) {
    this.game = game;
    this.list = [];
    const steel = new THREE.MeshStandardMaterial({ color: 0x8f969e, metalness: 0.7, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.5, roughness: 0.5 });
    for (const v of game.world.vaults || []) {
      const d = v.door;
      const sx = d.maxX - d.minX, sz = d.maxZ - d.minZ, h = d.y1 - d.y0;
      const along = d.alongX; // la hoja es fina en Z (si no, en X)
      const color = CONSUMABLES[cardType(v.id)]?.color ?? 0xe0a020;
      // Hoja de acero con franjas del color de su tarjeta y un volante en cada cara
      const g = new THREE.Group();
      const stripeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.15 });
      // (algo más fina que el muro: al abrirse se esconde dentro sin parpadeos)
      g.add(new THREE.Mesh(new THREE.BoxGeometry(along ? sx : sx * 0.8, h, along ? sz * 0.8 : sz), steel));
      const thin = (along ? sz : sx) * 0.4 + 0.03;
      const wheels = [];
      for (const s of [thin, -thin]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 20), dark);
        if (along) wheel.position.z = s;
        else {
          wheel.rotation.y = Math.PI / 2;
          wheel.position.x = s;
        }
        g.add(wheel);
        wheels.push(wheel);
      }
      for (const y of [-h / 2 + 0.3, h / 2 - 0.3]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(sx + (along ? 0 : 0.08), 0.18, sz + (along ? 0.08 : 0)), stripeMat);
        stripe.position.y = y;
        g.add(stripe);
      }
      g.traverse((o) => (o.castShadow = o.receiveShadow = true));
      const base = new THREE.Vector3((d.minX + d.maxX) / 2, d.y0 + h / 2, (d.minZ + d.maxZ) / 2);
      g.position.copy(base);
      game.scene.add(g);
      this.list.push({
        v, id: v.id, name: v.name, mesh: g, wheels, base, h, open: false, lift: 0, collider: null,
        center: new THREE.Vector3(d.front.x, d.y0 + 1.2, d.front.z),
      });
    }
    // Compatibilidad: la bóveda de la isla central
    this.main = this.list.find((x) => x.id === 0) || null;
    this.v = this.main?.v || null;
    this.reset();
  }

  get open() {
    return !!this.main?.open;
  }

  byId(id) {
    return this.list.find((x) => x.id === id) || null;
  }

  chests(vt) {
    return this.game.containers.list.filter((c) => c.vault && (c.vaultId ?? 0) === vt.id);
  }

  // Nueva partida: puertas cerradas y cofres bloqueados.
  reset() {
    for (const vt of this.list) {
      vt.open = false;
      vt.lift = 0;
      vt.mesh.position.copy(vt.base);
      for (const w of vt.wheels) w.visible = true;
      this.setCollider(vt, true);
      for (const c of this.chests(vt)) c.locked = true;
    }
  }

  setCollider(vt, on) {
    const col = this.game.world.collision;
    if (vt.collider) col.remove(vt.collider);
    vt.collider = null;
    if (!on) return;
    const d = vt.v.door;
    vt.collider = col.add(d.minX, d.y0, d.minZ, d.maxX, d.y1, d.maxZ, { type: 'building' });
  }

  // La tarjeta de la bóveda `id` cae al suelo en `pos` (al morir su jefe).
  dropCard(pos, id = 0) {
    const vt = this.byId(id);
    if (!vt || vt.open) return;
    this.game.pickups.spawn({ kind: 'consumable', type: cardType(id), count: 1 }, pos.clone().setY(pos.y + 0.8), new THREE.Vector3(0, 4, 0));
  }

  // Hueco del inventario del jugador con la tarjeta de esa bóveda (o -1).
  cardSlot(vt) {
    return this.game.player.inventory.findIndex((it) => it && it.kind === 'consumable' && it.type === cardType(vt.id));
  }

  unlock(vt) {
    const g = this.game;
    const p = g.player;
    const slot = this.cardSlot(vt);
    if (slot > 0) {
      p.inventory[slot] = null;
      if (p.selected === slot) g.combat.select(0);
    }
    vt.open = true;
    this.setCollider(vt, false);
    for (const c of this.chests(vt)) c.locked = false;
    // Tesoro: dos armas legendarias en el suelo de la bóveda
    const v = vt.v;
    const inside = new THREE.Vector3(v.x, v.door.y0 + 0.5, v.z);
    const pick = TREASURE.slice().sort(() => Math.random() - 0.5);
    g.pickups.burst([makeWeapon(pick[0], 4), makeWeapon(pick[1], 4), { kind: 'consumable', type: 'chugjug', count: 1 }], inside);
    g.audio.chest?.();
    g.hud.toast(`🔓 ¡Bóveda de ${vt.name} abierta! Dentro hay cofres y armas legendarias`);
    g.hud.killFeed?.(`🔓 <b>Alguien ha abierto la bóveda</b> de ${vt.name}`, false);
  }

  // Interacción con una puerta (E). Devuelve true si la ha gestionado.
  interact(input, E) {
    const p = this.game.player;
    const vt = this.list.find((x) => !x.open && p.pos.distanceTo(x.center) < 3.6);
    if (!vt) return false;
    const card = CONSUMABLES[cardType(vt.id)];
    if (this.cardSlot(vt) > 0) {
      this.game.hud.setPrompt(`${E} Abrir la bóveda con la ${card.name.toLowerCase()}`);
      if (input.hit('interact')) this.unlock(vt);
    } else {
      const who = vt.id === 0 ? 'el Guardián de la isla' : 'el jefe de ' + vt.name;
      this.game.hud.setPrompt(`🔒 Bóveda cerrada · necesitas la ${card.name.toLowerCase()} (la lleva ${who})`);
    }
    return true;
  }

  // Bóveda a la que señalar: la de la tarjeta que llevas en la mano.
  target() {
    const it = this.game.player.item;
    const id = it?.kind === 'consumable' ? CONSUMABLES[it.type]?.card : undefined;
    if (id === undefined) return null;
    const vt = this.byId(id);
    return vt && !vt.open ? vt : null;
  }

  update(dt) {
    for (const vt of this.list) {
      // La puerta se desliza de lado y se esconde dentro del muro
      if (!vt.open || vt.lift >= 1) continue;
      vt.lift = Math.min(1, vt.lift + dt * 0.5);
      const d = vt.v.door;
      const k = (1 - Math.pow(1 - vt.lift, 2)) * ((d.alongX ? d.maxX - d.minX : d.maxZ - d.minZ) + 0.1);
      if (d.alongX) vt.mesh.position.x = vt.base.x + k;
      else vt.mesh.position.z = vt.base.z + k;
      for (const w of vt.wheels) w.visible = vt.lift < 0.3;
    }
  }
}
