// Definiciones de armas, munición, consumibles y tablas de botín.

export const RARITIES = [
  { name: 'Común', color: '#a8adb4', hex: 0xa8adb4 },
  { name: 'Poco común', color: '#4fc53a', hex: 0x4fc53a },
  { name: 'Raro', color: '#3a9dff', hex: 0x3a9dff },
  { name: 'Épico', color: '#b65cff', hex: 0xb65cff },
  { name: 'Legendario', color: '#ffa22a', hex: 0xffa22a },
];

export const AMMO = {
  light: { name: 'Munición ligera', short: 'Ligera', color: 0x8fd3ff, pickup: 30, max: 999 },
  medium: { name: 'Munición media', short: 'Media', color: 0x7ee07e, pickup: 30, max: 999 },
  heavy: { name: 'Munición pesada', short: 'Pesada', color: 0xff6b6b, pickup: 6, max: 999 },
  shells: { name: 'Cartuchos', short: 'Cartuchos', color: 0xffd34d, pickup: 8, max: 999 },
};

// spread en radianes (semiángulo del cono). reload por rareza.
export const WEAPONS = {
  ar: {
    name: 'Rifle de asalto', ammo: 'medium', mag: 30, rate: 5.5, auto: true,
    damage: [30, 31, 33, 35, 36], headMult: 1.5, range: 320,
    spread: 0.04, adsSpread: 0.006, bloom: 0.007, maxBloom: 0.05,
    recoil: 0.011, reload: [2.7, 2.6, 2.5, 2.3, 2.2], adsFov: 50, sound: 'ar',
  },
  smg: {
    name: 'Subfusil', ammo: 'light', mag: 30, rate: 12, auto: true,
    damage: [16, 17, 18, 19, 20], headMult: 1.75, range: 140,
    spread: 0.045, adsSpread: 0.02, bloom: 0.004, maxBloom: 0.04,
    recoil: 0.006, reload: [2.2, 2.1, 2.0, 1.9, 1.8], adsFov: 62, sound: 'smg',
  },
  shotgun: {
    name: 'Escopeta de corredera', ammo: 'shells', mag: 5, rate: 0.85, auto: false,
    damage: [8, 9, 9.5, 10, 11], headMult: 2, range: 45, pellets: 10, falloff: [8, 40],
    spread: 0.07, adsSpread: 0.055, bloom: 0, maxBloom: 0,
    recoil: 0.06, reload: [0.65, 0.6, 0.56, 0.52, 0.48], shellReload: true, adsFov: 65, sound: 'shotgun',
  },
  sniper: {
    name: 'Rifle de francotirador', ammo: 'heavy', mag: 1, rate: 0.45, auto: false,
    damage: [105, 110, 116, 121, 127], headMult: 2.5, range: 1000,
    spread: 0.08, adsSpread: 0.0, bloom: 0, maxBloom: 0,
    recoil: 0.07, reload: [3.4, 3.2, 3.0, 2.8, 2.6], adsFov: 14, scope: true,
    projectile: { speed: 420, gravity: 9.8 }, sound: 'sniper',
  },
  pistol: {
    name: 'Pistola', ammo: 'light', mag: 16, rate: 6.75, auto: false,
    damage: [23, 24, 25, 26, 28], headMult: 2, range: 160,
    spread: 0.03, adsSpread: 0.012, bloom: 0.008, maxBloom: 0.045,
    recoil: 0.015, reload: [1.5, 1.45, 1.4, 1.35, 1.3], adsFov: 62, sound: 'pistol',
  },
};

export const CONSUMABLES = {
  bandage: { name: 'Vendas', max: 15, pickup: 5, use: 3.5, heal: 15, cap: 75, rarity: 0 },
  medkit: { name: 'Botiquín', max: 3, pickup: 1, use: 10, heal: 100, cap: 100, rarity: 1 },
  smallshield: { name: 'Minipoción de escudo', max: 6, pickup: 3, use: 2, shield: 25, cap: 50, rarity: 1 },
  shieldpot: { name: 'Poción de escudo', max: 3, pickup: 1, use: 5, shield: 50, cap: 100, rarity: 2 },
};

export const PICKAXE = { kind: 'pickaxe', name: 'Pico' };

// Materiales de construcción (se consiguen con el pico).
export const MATERIALS = {
  wood: { name: 'Madera', color: '#d39a5a', hex: 0xb07a40, hp: 150, buildTime: 2.5, max: 999 },
  stone: { name: 'Piedra', color: '#b8bcc2', hex: 0x9a9ea6, hp: 300, buildTime: 5, max: 999 },
  metal: { name: 'Metal', color: '#8fb0d0', hex: 0x7f93a8, hp: 500, buildTime: 9, max: 999 },
};
export const BUILD_COST = 10;

const WEAPON_WEIGHTS = { ar: 30, shotgun: 25, smg: 20, pistol: 15, sniper: 10 };
const FLOOR_RARITY = [42, 30, 17, 8, 3];
const CHEST_RARITY = [12, 34, 32, 16, 6];

export function itemName(item) {
  if (!item) return '';
  if (item.kind === 'weapon') return WEAPONS[item.type].name;
  if (item.kind === 'consumable') return CONSUMABLES[item.type].name;
  if (item.kind === 'ammo') return AMMO[item.ammo].name;
  if (item.kind === 'material') return MATERIALS[item.mat].name;
  return 'Pico';
}

export function itemRarity(item) {
  if (item.kind === 'weapon') return item.rarity;
  if (item.kind === 'consumable') return CONSUMABLES[item.type].rarity;
  return 0;
}

export function makeWeapon(type, rarity) {
  return { kind: 'weapon', type, rarity, mag: WEAPONS[type].mag };
}

function pickKey(rng, weights) {
  const keys = Object.keys(weights);
  return keys[rng.weighted(keys.map((k) => weights[k]))];
}

function rollWeapon(rng, rarityWeights) {
  const type = pickKey(rng, WEAPON_WEIGHTS);
  let rarity = rng.weighted(rarityWeights);
  if (type === 'sniper') rarity = Math.max(rarity, 2);
  return makeWeapon(type, rarity);
}

function ammoFor(type, mult = 1) {
  const a = WEAPONS[type].ammo;
  return { kind: 'ammo', ammo: a, count: Math.round(AMMO[a].pickup * mult) };
}

function rollConsumable(rng) {
  const type = pickKey(rng, { bandage: 35, smallshield: 30, medkit: 15, shieldpot: 20 });
  return { kind: 'consumable', type, count: CONSUMABLES[type].pickup };
}

export function lootForChest(rng) {
  const w = rollWeapon(rng, CHEST_RARITY);
  const out = [w, ammoFor(w.type, 1.5)];
  if (rng.chance(0.75)) out.push(rollConsumable(rng));
  if (rng.chance(0.3)) out.push(ammoFor(pickKey(rng, WEAPON_WEIGHTS)));
  return out;
}

export function lootForFloor(rng) {
  const r = rng.next();
  if (r < 0.55) {
    const w = rollWeapon(rng, FLOOR_RARITY);
    return [w, ammoFor(w.type)];
  }
  if (r < 0.8) return [rollConsumable(rng)];
  return [ammoFor(pickKey(rng, WEAPON_WEIGHTS))];
}

export function lootForAmmoBox(rng) {
  const a = pickKey(rng, WEAPON_WEIGHTS);
  let b = pickKey(rng, WEAPON_WEIGHTS);
  return [ammoFor(a), ammoFor(b)];
}
