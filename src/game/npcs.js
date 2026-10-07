import * as THREE from 'three';
import { makeCharacter, optimizeCharacter } from './models.js';
import { WEAPONS, RARITIES, CONSUMABLES, makeWeapon, itemName, stackDef } from './items.js';

// PNJ de los pueblos: comerciantes que venden armas por oro y personajes
// con misiones (buscar reliquias, eliminar rivales, abrir cofres). En el
// Castillo Corona espera un jefe con botín mítico (partidas contra bots).
// Los PNJ son iguales en todas las partidas y para todos en online; el oro,
// las compras y las misiones son de cada jugador.
const NAMES = [
  ['Marta la Mercader', 'merchant'],
  ['Viejo Tomás', 'quest'],
  ['Capitana Brisa', 'merchant'],
  ['Lola Rastreadora', 'quest'],
  ['Doctor Pepe', 'quest'],
  ['Herrero Bruno', 'merchant'],
];
const OUTFITS = [
  { skin: 0xc8925f, shirt: 0x7a3fd6, pants: 0x2b2b38, hair: 0x2a1a10, acc: 'gorra' },
  { skin: 0xe0b48a, shirt: 0x6b4a2b, pants: 0x3a3a2a, hair: 0xdddddd, acc: 'vaquero' },
  { skin: 0x8a5a3a, shirt: 0x2f6fd6, pants: 0x1e2a40, hair: 0x1a1a1a, acc: 'vikingo' },
  { skin: 0xf0c8a0, shirt: 0x2fa84f, pants: 0x4a3a2a, hair: 0xb04a20, acc: 'gafas' },
  { skin: 0xd8a070, shirt: 0xeeeeee, pants: 0x2b2b38, hair: 0x6a6a6a, acc: 'auriculares' },
  { skin: 0xb07a50, shirt: 0x5a5a5a, pants: 0x2a2a2a, hair: 0x3a2a1a, acc: 'corona' },
];
const STOCK = [
  [['ar', 4, 400], ['shotgun', 4, 380], ['smg', 3, 250]],
  [['sniper', 4, 450], ['burst', 3, 260], ['pistol', 4, 150]],
  [['heavyar', 4, 420], ['tactical', 3, 280], ['revolver', 3, 180]],
];
// Jefes de las ciudades con bóveda (world.bossPois): cada uno suelta un
// arma mítica, una cura, la tarjeta de su bóveda y un medallón de batalla.
export const CITY_BOSSES = {
  1: {
    name: '👠 Reina del Asfalto', mythic: ['burst', 'Rifle de ráfagas'], heal: { type: 'slurp', count: 2 }, medal: 'medal_speed',
    outfit: { skin: 0xf0c8a0, shirt: 0xd6206a, pants: 0x1b1b22, hair: 0xf2f2f2, acc: 'gafas' },
    weapons: [['burst', 5], ['smg', 4], ['shotgun', 4]],
  },
  2: {
    name: '🎖️ Capitán Tormenta', mythic: ['heavyar', 'Fusil pesado'], heal: { type: 'medkit', count: 3 }, medal: 'medal_armor',
    outfit: { skin: 0xa86f48, shirt: 0x4a5a2a, pants: 0x3a4a22, hair: 0x1a1a1a, acc: 'vikingo' },
    weapons: [['heavyar', 5], ['tactical', 4], ['rocket', 3]],
  },
  3: {
    name: '🔧 El Ingeniero', mythic: ['tactical', 'Escopeta táctica'], heal: { type: 'chugjug', count: 1 }, medal: 'medal_fury',
    outfit: { skin: 0xe0b48a, shirt: 0xff7a1a, pants: 0x2b3a5a, hair: 0x7a3a1a, acc: 'auriculares' },
    weapons: [['tactical', 5], ['minigun', 4], ['glauncher', 3]],
  },
};

const QUESTS = [
  { kind: 'relics', goal: 3, gold: 300, text: 'Encuentra 3 fragmentos de reliquia en' },
  { kind: 'kills', goal: 2, gold: 250, text: 'Elimina a 2 rivales' },
  { kind: 'chests', goal: 3, gold: 200, text: 'Abre 3 cofres' },
];

function iconTexture(txt, bg) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.beginPath();
  x.arc(32, 32, 28, 0, Math.PI * 2);
  x.fill();
  x.lineWidth = 4;
  x.strokeStyle = '#fff';
  x.stroke();
  x.fillStyle = '#fff';
  x.font = 'bold 36px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(txt, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class NPCs {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.relics = [];
    this.quests = [];
    this.boss = null;
    if (game.world.creative) return;
    const w = game.world;
    const pois = w.pois.filter((p) => p.type !== 'castle').slice().sort((a, b) => a.name.localeCompare(b.name));
    const icons = { merchant: iconTexture('$', '#2fa84f'), quest: iconTexture('!', '#f5b800') };
    let stock = 0, quest = 0;
    for (let i = 0; i < Math.min(NAMES.length, pois.length); i++) {
      const poi = pois[(i * 3) % pois.length];
      if (this.list.some((n) => n.poi === poi)) continue;
      const [name, role] = NAMES[i];
      const spot = this.findSpot(poi, i);
      if (!spot) continue;
      const model = optimizeCharacter(makeCharacter(OUTFITS[i % OUTFITS.length]));
      model.root.position.copy(spot);
      model.root.rotation.y = (i * 1.3) % (Math.PI * 2);
      game.scene.add(model.root);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: icons[role], depthTest: false, transparent: true }));
      icon.scale.setScalar(0.6);
      icon.position.y = 2.45;
      icon.renderOrder = 5;
      model.root.add(icon);
      const npc = { name, role, poi, pos: spot, model, icon, phase: i * 1.7 };
      if (role === 'merchant') npc.stock = STOCK[stock++ % STOCK.length];
      else npc.quest = { ...QUESTS[quest++ % QUESTS.length] };
      this.list.push(npc);
    }
    this.relicGeo = new THREE.OctahedronGeometry(0.28, 0);
    this.relicMat = new THREE.MeshStandardMaterial({ color: 0x5ad1ff, emissive: 0x1a6aff, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.4 });
  }

  // Un hueco libre y en el suelo cerca del centro del pueblo.
  findSpot(poi, k) {
    const w = this.game.world;
    for (let i = 0; i < 40; i++) {
      const a = k * 2.1 + i * 0.7, r = 6 + i * 0.8;
      const x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r;
      if (w.occupied(x, z, 1.2)) continue;
      if (w.roads?.edgeDistance(x, z, 6) < 0.5) continue;
      const y = w.groundBelow(x, z, 200);
      if (y < 1) continue;
      return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  // Nueva partida: misiones sin empezar, sin oro y (contra bots) el jefe.
  reset(mode, online) {
    const g = this.game;
    g.player.gold = 0;
    for (const r of this.relics) g.scene.remove(r.mesh);
    this.relics = [];
    this.quests = [];
    for (const n of this.list) {
      if (n.quest) {
        n.quest.state = 'new';
        n.quest.v = 0;
      }
      n.icon.visible = true;
    }
    this.boss = null;
    this.guardian = null;
  }

  // Al despegar el autobús (sólo contra bots, battle royale). Antes se
  // creaban al empezar la partida y la Isla de Inicio se los llevaba con el
  // resto de bots (por eso el Guardián de la Bóveda no aparecía).
  startBoss(mode) {
    if (this.game.net || mode.respawn || mode.creative || mode.noBots) return;
    if (this.list.length) this.spawnBoss();
    this.spawnGuardian();
    this.spawnCityBosses();
  }

  // Coloca un jefe o secuaz de pie en (x, z), quieto en su zona.
  addBoss(x, z, diff, loadout, home, extra) {
    const g = this.game;
    const b = g.bots.spawnExtra(99, diff, x, z, loadout);
    b.pos.set(x, g.world.groundBelow(x, z, 200) + 1, z);
    b.vel.set(0, 0, 0);
    b.mode = 'ground';
    b.boss = true; // no cuenta para el recuento de supervivientes
    b.home = home;
    b.bold = 1; // no acuden a tiroteos lejanos
    b.model.root.visible = true;
    Object.assign(b, extra);
    if (extra.outfit) {
      b.setOutfit(extra.outfit);
      b.bossOutfit = true;
    }
    if (!g.chars.includes(b)) g.chars.push(b);
    return b;
  }

  // Jefe delante de la bóveda de su ciudad, con tres secuaces.
  spawnCityBosses() {
    const g = this.game;
    this.cityBosses = [];
    for (const { vaultId, poi } of g.world.bossPois) {
      const def = CITY_BOSSES[vaultId];
      const vt = g.vault.byId(vaultId);
      if (!def || !vt) continue;
      const f = vt.v.door.front;
      const dx = f.x - vt.v.x, dz = f.z - vt.v.z, dl = Math.hypot(dx, dz) || 1;
      const bx = f.x + (dx / dl) * 5, bz = f.z + (dz / dl) * 5;
      const home = { x: bx, z: bz, r: 30 };
      const boss = this.addBoss(bx, bz, 'dificil', {
        weapons: def.weapons.map(([t, r]) => makeWeapon(t, r)),
        heals: { shieldpot: 2, medkit: 1 },
      }, home, { bossKind: 'city', bossDef: def, vaultId, name: def.name, dmgTaken: 0.4, shield: 100, outfit: def.outfit });
      this.cityBosses.push(boss);
      const pool = ['ar', 'smg', 'shotgun', 'pistol'];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        this.addBoss(bx + Math.cos(a) * 9, bz + Math.sin(a) * 9, 'normal', {
          weapons: [makeWeapon(pool[(i + vaultId) % pool.length], 1 + (i % 3))],
          heals: { bandage: 2, smallshield: 1 },
        }, home, { bossKind: 'minion', name: `Escolta de ${poi.name}` });
      }
    }
  }

  // Guardián de la Bóveda (isla del lago central) con sus secuaces. Al morir
  // suelta la tarjeta que abre la bóveda.
  spawnGuardian() {
    const g = this.game;
    const I = g.world.island;
    if (!I?.boss) return;
    const add = (x, z, diff, loadout, extra) => this.addBoss(x, z, diff, loadout, { x: I.x, z: I.z, r: I.R * 0.8 }, extra);
    this.guardian = add(I.boss.x, I.boss.z, 'dificil', {
      weapons: [makeWeapon('heavyar', 5), makeWeapon('tactical', 4), makeWeapon('glauncher', 4)],
      heals: { shieldpot: 2, medkit: 2 },
    }, { bossKind: 'guardian', name: '💀 Guardián de la Bóveda', dmgTaken: 0.4, shield: 100 });
    const pool = ['ar', 'smg', 'shotgun', 'burst', 'pistol'];
    I.minions.forEach((m, i) => add(m.x, m.z, 'normal', {
      weapons: [makeWeapon(pool[i % pool.length], 1 + (i % 3))],
      heals: { bandage: 2, smallshield: 1 },
    }, { bossKind: 'minion', name: `Secuaz ${i + 1}` }));
  }

  spawnBoss() {
    const g = this.game;
    const castle = g.world.landmarks.find((l) => l.name === 'Castillo Corona');
    if (!castle) return;
    const b = g.bots.spawnExtra(99, 'dificil', castle.x, castle.z, {
      weapons: [makeWeapon('heavyar', 5), makeWeapon('shotgun', 5), makeWeapon('rocket', 4)],
      heals: { shieldpot: 2, medkit: 2 },
    });
    b.pos.y = g.world.groundBelow(castle.x, castle.z, 200) + 1;
    b.boss = true;
    b.bossKind = 'king';
    b.dmgTaken = 0.35;
    b.shield = 100;
    b.name = '👑 Rey del Castillo';
    b.home = { x: castle.x, z: castle.z, r: 45 };
    if (!g.chars.includes(b)) g.chars.push(b);
    this.boss = b;
  }

  get gold() {
    return this.game.player.gold || 0;
  }

  addGold(n, why = '') {
    const p = this.game.player;
    p.gold = (p.gold || 0) + n;
    if (why) this.game.hud.toast(`💰 +${n} de oro${why ? ' · ' + why : ''}`);
  }

  findNear(pos, maxDist = 3) {
    let best = null, bd = maxDist;
    for (const n of this.list) {
      const d = n.pos.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ MISIONES
  accept(n) {
    const q = n.quest;
    if (!q || q.state !== 'new') return;
    q.state = 'active';
    q.v = 0;
    q.npc = n;
    this.quests.push(q);
    n.icon.visible = false;
    if (q.kind === 'relics') {
      // Fragmentos en otro pueblo (el siguiente por orden)
      const others = this.game.world.pois.filter((p) => p !== n.poi && p.type !== 'castle');
      const poi = others[(this.list.indexOf(n) * 2 + 1) % others.length];
      q.where = poi.name;
      for (let i = 0; i < q.goal; i++) {
        const a = i * 2.2 + 0.5, r = 8 + i * 6;
        const x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r;
        const y = this.game.world.groundBelow(x, z, 200) + 1.1;
        const mesh = new THREE.Mesh(this.relicGeo, this.relicMat);
        mesh.position.set(x, y, z);
        this.game.scene.add(mesh);
        this.relics.push({ mesh, q });
      }
    }
    this.game.audio.pickup?.();
  }

  progress(kind, n = 1) {
    for (const q of this.quests) {
      if (q.state !== 'active' || q.kind !== kind) continue;
      q.v = Math.min(q.goal, q.v + n);
      if (q.v >= q.goal) this.complete(q);
    }
  }

  complete(q) {
    const g = this.game;
    q.state = 'done';
    this.addGold(q.gold);
    g.player.stats.quests = (g.player.stats.quests || 0) + 1;
    g.hud.toast(`✅ Misión completada: ${this.questText(q)} · +${q.gold} de oro`);
    g.audio.chest?.();
  }

  questText(q) {
    return q.kind === 'relics' ? `${q.text} ${q.where || 'otro pueblo'}` : q.text;
  }

  // ------------------------------------------------------------ COMPRAS
  buy(n, k) {
    const g = this.game;
    const p = g.player;
    const it = n.stock?.[k];
    if (!it) return 'Ese objeto no está a la venta';
    const [type, rarity, price] = it;
    if (this.gold < price) return `Te faltan ${price - this.gold} de oro`;
    const item = WEAPONS[type] ? makeWeapon(type, rarity) : { kind: 'consumable', type, count: 1 };
    p.gold -= price;
    const free = p.inventory.findIndex((s, i) => i > 0 && !s);
    if (free > 0) {
      p.inventory[free] = item;
      g.combat.select(free);
    } else g.pickups.spawn(item, p.pos.clone().setY(p.pos.y + 0.5), null, null);
    g.audio.pickup?.();
    return '';
  }

  // ------------------------------------------------------------ EVENTOS
  onChest() {
    this.addGold(15 + Math.floor(Math.random() * 30));
    this.progress('chests');
  }

  onElim(victim, killer) {
    const g = this.game;
    if (killer === g.player && victim !== g.player) {
      this.addGold(victim.boss ? 0 : 40);
      this.progress('kills');
    }
    if (victim.bossKind === 'guardian') {
      // Suelta la tarjeta de la bóveda (y algo de botín)
      g.vault?.dropCard(victim.pos, 0);
      g.pickups.spawn({ kind: 'consumable', type: 'shieldpot', count: 2 }, victim.pos.clone().setY(victim.pos.y + 0.8), new THREE.Vector3(1.5, 4, 0));
      g.pickups.spawn({ kind: 'consumable', type: 'medal_vigor', count: 1 }, victim.pos.clone().setY(victim.pos.y + 0.8), new THREE.Vector3(-1.5, 4, 1));
      if (killer === g.player) this.addGold(400, '¡Has derrotado al Guardián de la Bóveda!');
      g.hud.killFeed('💀 <b>El Guardián de la Bóveda</b> ha caído: ¡ha soltado la tarjeta!', false);
      this.guardian = null;
    }
    if (victim.bossKind === 'city') {
      // Arma mítica, cura, tarjeta de su bóveda y medallón de batalla
      const def = victim.bossDef;
      const at = victim.pos.clone().setY(victim.pos.y + 0.8);
      g.pickups.burst([
        makeWeapon(def.mythic[0], 5),
        { ...def.heal, kind: 'consumable' },
        { kind: 'consumable', type: `card${victim.vaultId}`, count: 1 },
        { kind: 'consumable', type: def.medal, count: 1 },
      ], at);
      if (killer === g.player) this.addGold(450, `¡Has derrotado a ${def.name}!`);
      g.hud.killFeed(`${def.name.split(' ')[0]} <b>${def.name.slice(def.name.indexOf(' ') + 1)}</b> ha caído: ¡suelta un arma mítica, su tarjeta y un medallón!`, false);
    }
    if (victim.bossKind === 'king') {
      // Botín del jefe: arma mítica y un saco de oro
      const at = victim.pos.clone().setY(victim.pos.y + 0.8);
      g.pickups.spawn(makeWeapon('heavyar', 5), at.clone(), new THREE.Vector3(1.5, 4, 0));
      g.pickups.spawn({ kind: 'consumable', type: 'chugjug', count: 1 }, at.clone(), new THREE.Vector3(-1.5, 4, 0));
      if (killer === g.player) this.addGold(500, '¡Has derrotado al Rey del Castillo!');
      g.hud.killFeed('👑 <b>El Rey del Castillo</b> ha caído', false);
      this.boss = null;
    }
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const t = g.time;
    const cam = g.camera.position;
    const d2 = g.propDist(220) ** 2;
    for (const n of this.list) {
      const m = n.model;
      m.root.visible = n.pos.distanceToSquared(cam) < d2;
      if (!m.root.visible) continue;
      const near = n.pos.distanceToSquared(p.pos) < 12 * 12;
      // Mira al jugador cuando está cerca y respira
      if (near) {
        const want = Math.atan2(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
        let d = want - m.root.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        m.root.rotation.y += d * Math.min(1, dt * 4);
      }
      m.body.position.y = Math.sin(t * 2 + n.phase) * 0.01;
      m.armL.rotation.z = -0.08 - Math.sin(t * 2 + n.phase) * 0.03;
      m.armR.rotation.z = 0.08 + Math.sin(t * 2 + n.phase) * 0.03;
      if (n.role === 'merchant' && near) m.armR.rotation.set(-0.3 + Math.sin(t * 6) * 0.2, 0, 0.6);
      n.icon.position.y = 2.45 + Math.sin(t * 3 + n.phase) * 0.06;
    }
    // Fragmentos de reliquia: giran y se recogen al pasar
    for (let i = this.relics.length - 1; i >= 0; i--) {
      const r = this.relics[i];
      r.mesh.rotation.y += dt * 2;
      r.mesh.position.y += Math.sin(t * 3 + i) * 0.003;
      if (r.q.state === 'active' && p.alive && r.mesh.position.distanceTo(p.pos.clone().setY(p.pos.y + 1)) < 1.8) {
        g.scene.remove(r.mesh);
        this.relics.splice(i, 1);
        g.audio.pickup?.();
        this.progress('relics');
        if (r.q.state === 'active') g.hud.toast(`💎 Fragmento de reliquia ${r.q.v}/${r.q.goal}`);
      }
    }
    // Los jefes y los secuaces no se alejan de su sitio (castillo, isla,
    // bóveda): si persiguen a alguien demasiado lejos, lo dejan y vuelven
    for (const b of g.bots.list) {
      if (!b.home || !b.alive || b.mode !== 'ground') continue;
      const d = Math.hypot(b.pos.x - b.home.x, b.pos.z - b.home.z);
      const leash = b.home.r * 1.8;
      if (b.target && d > leash) {
        const td = Math.hypot(b.target.pos.x - b.home.x, b.target.pos.z - b.home.z);
        if (td > leash) {
          b.memory.delete(b.target);
          b.target = null;
          b.targetVisible = false;
        }
      }
      if (!b.target && d > b.home.r) {
        b.goal = new THREE.Vector3(b.home.x, b.pos.y, b.home.z);
        b.task = 'rotate';
        b.rumor = null;
      }
    }
  }
}

// Texto corto de un objeto de la tienda de un PNJ.
export function offerLabel([type, rarity, price]) {
  const item = WEAPONS[type] ? makeWeapon(type, rarity) : { kind: 'consumable', type, count: 1 };
  const r = WEAPONS[type] ? RARITIES[item.rarity] : RARITIES[CONSUMABLES[type]?.rarity || 0];
  return { item, name: itemName(item), rarity: r, price, stack: !!stackDef(item) };
}
