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
  rockets: { name: 'Cohetes', short: 'Cohetes', color: 0xd8d8d8, pickup: 4, max: 99 },
};

// spread en radianes (semiángulo del cono). reload por rareza.
// cat: familia (la usan los bots y el HUD). minRarity/maxRarity: rarezas en
// las que puede aparecer. explosive: daño en área (personajes y estructuras).
export const WEAPONS = {
  ar: {
    name: 'Rifle de asalto', cat: 'ar', ammo: 'medium', mag: 30, rate: 5.5, auto: true,
    damage: [30, 31, 33, 35, 36], headMult: 1.5, range: 320,
    spread: 0.04, adsSpread: 0.006, bloom: 0.007, maxBloom: 0.05,
    recoil: 0.011, reload: [2.7, 2.6, 2.5, 2.3, 2.2], adsFov: 50, sound: 'ar', weight: 22,
  },
  burst: {
    name: 'Fusil de ráfagas', cat: 'ar', ammo: 'medium', mag: 27, rate: 2.4, auto: false, burst: 3, burstRate: 13,
    damage: [27, 29, 30, 32, 33], headMult: 1.5, range: 320,
    spread: 0.035, adsSpread: 0.004, bloom: 0.006, maxBloom: 0.04,
    recoil: 0.009, reload: [2.9, 2.8, 2.6, 2.5, 2.4], adsFov: 48, sound: 'ar', weight: 12,
  },
  heavyar: {
    name: 'Fusil de asalto pesado', cat: 'ar', ammo: 'medium', mag: 25, rate: 3.75, auto: true,
    damage: [40, 42, 44, 46, 48], headMult: 1.5, range: 320, minRarity: 1,
    spread: 0.045, adsSpread: 0.008, bloom: 0.012, maxBloom: 0.06,
    recoil: 0.02, reload: [3.0, 2.9, 2.8, 2.6, 2.5], adsFov: 50, sound: 'heavy', weight: 9,
  },
  smg: {
    name: 'Subfusil', cat: 'smg', ammo: 'light', mag: 30, rate: 12, auto: true,
    damage: [16, 17, 18, 19, 20], headMult: 1.75, range: 140,
    spread: 0.045, adsSpread: 0.02, bloom: 0.004, maxBloom: 0.04,
    recoil: 0.006, reload: [2.2, 2.1, 2.0, 1.9, 1.8], adsFov: 62, sound: 'smg', weight: 16,
  },
  minigun: {
    name: 'Minigun', cat: 'smg', ammo: 'light', mag: 120, rate: 13, auto: true, spinUp: 0.7,
    damage: [15, 15, 16, 17, 18], headMult: 1.5, range: 200, minRarity: 3,
    spread: 0.06, adsSpread: 0.04, bloom: 0.002, maxBloom: 0.03,
    recoil: 0.003, reload: [5, 5, 4.8, 4.6, 4.4], adsFov: 66, sound: 'smg', weight: 3,
  },
  shotgun: {
    name: 'Escopeta de corredera', cat: 'shotgun', ammo: 'shells', mag: 5, rate: 0.85, auto: false,
    damage: [8, 9, 9.5, 10, 11], headMult: 2, range: 45, pellets: 10, falloff: [8, 40],
    spread: 0.07, adsSpread: 0.055, bloom: 0, maxBloom: 0,
    recoil: 0.06, reload: [0.65, 0.6, 0.56, 0.52, 0.48], shellReload: true, adsFov: 65, sound: 'shotgun', weight: 18,
  },
  tactical: {
    name: 'Escopeta táctica', cat: 'shotgun', ammo: 'shells', mag: 8, rate: 1.5, auto: false,
    damage: [6.5, 7, 7.4, 7.8, 8.2], headMult: 2, range: 40, pellets: 10, falloff: [7, 36],
    spread: 0.08, adsSpread: 0.065, bloom: 0, maxBloom: 0,
    recoil: 0.045, reload: [0.55, 0.52, 0.5, 0.47, 0.44], shellReload: true, adsFov: 65, sound: 'shotgun', weight: 13,
  },
  doublebarrel: {
    name: 'Escopeta de dos cañones', cat: 'shotgun', ammo: 'shells', mag: 2, rate: 3.2, auto: false,
    damage: [10, 10.5, 11, 11.5, 12], headMult: 1.75, range: 30, pellets: 10, falloff: [5, 26], minRarity: 2,
    spread: 0.09, adsSpread: 0.075, bloom: 0, maxBloom: 0,
    recoil: 0.08, reload: [2.1, 2.0, 1.9, 1.8, 1.7], adsFov: 66, sound: 'shotgun', weight: 6,
  },
  sniper: {
    name: 'Rifle de francotirador', cat: 'sniper', ammo: 'heavy', mag: 1, rate: 0.45, auto: false,
    damage: [105, 110, 116, 121, 127], headMult: 2.5, range: 1000, minRarity: 2,
    spread: 0.08, adsSpread: 0.0, bloom: 0, maxBloom: 0,
    recoil: 0.07, reload: [3.4, 3.2, 3.0, 2.8, 2.6], adsFov: 14, scope: true,
    projectile: { speed: 420, gravity: 9.8 }, sound: 'sniper', weight: 7,
  },
  hunting: {
    name: 'Rifle de caza', cat: 'sniper', ammo: 'heavy', mag: 1, rate: 0.7, auto: false,
    damage: [86, 90, 94, 99, 104], headMult: 2.5, range: 700, maxRarity: 3,
    spread: 0.05, adsSpread: 0.0, bloom: 0, maxBloom: 0,
    recoil: 0.06, reload: [1.9, 1.8, 1.7, 1.6, 1.5], adsFov: 38,
    projectile: { speed: 300, gravity: 12 }, sound: 'sniper', weight: 7,
  },
  pistol: {
    name: 'Pistola', cat: 'pistol', ammo: 'light', mag: 16, rate: 6.75, auto: false,
    damage: [23, 24, 25, 26, 28], headMult: 2, range: 160, maxRarity: 3,
    spread: 0.03, adsSpread: 0.012, bloom: 0.008, maxBloom: 0.045,
    recoil: 0.015, reload: [1.5, 1.45, 1.4, 1.35, 1.3], adsFov: 62, sound: 'pistol', weight: 12,
  },
  revolver: {
    name: 'Revólver', cat: 'pistol', ammo: 'medium', mag: 6, rate: 1.6, auto: false,
    damage: [54, 57, 60, 63, 66], headMult: 2, range: 180,
    spread: 0.035, adsSpread: 0.006, bloom: 0.03, maxBloom: 0.06,
    recoil: 0.05, reload: [2.2, 2.1, 2.0, 1.9, 1.8], adsFov: 58, sound: 'revolver', weight: 7,
  },
  handcannon: {
    name: 'Cañón de mano', cat: 'pistol', ammo: 'heavy', mag: 7, rate: 1.2, auto: false,
    damage: [67, 70, 73, 75, 78], headMult: 2, range: 200, minRarity: 3,
    spread: 0.04, adsSpread: 0.008, bloom: 0.035, maxBloom: 0.07,
    recoil: 0.07, reload: [2.0, 2.0, 1.95, 1.9, 1.85], adsFov: 58, sound: 'revolver', weight: 3,
  },
  rocket: {
    name: 'Lanzacohetes', cat: 'explosive', ammo: 'rockets', mag: 1, rate: 0.75, auto: false,
    damage: [100, 105, 110, 115, 121], headMult: 1, range: 600, minRarity: 2,
    spread: 0.01, adsSpread: 0.0, bloom: 0, maxBloom: 0,
    recoil: 0.06, reload: [3.0, 2.9, 2.8, 2.7, 2.5], adsFov: 55,
    projectile: { speed: 75, gravity: 1.5, model: 'rocket' }, explosive: { radius: 6, build: 450 }, sound: 'rocket', weight: 4,
  },
  grenadelauncher: {
    name: 'Lanzagranadas', cat: 'explosive', ammo: 'rockets', mag: 6, rate: 1.3, auto: false,
    damage: [70, 74, 78, 82, 86], headMult: 1, range: 400, minRarity: 2,
    spread: 0.015, adsSpread: 0.005, bloom: 0, maxBloom: 0,
    recoil: 0.05, reload: [3.2, 3.1, 3.0, 2.8, 2.6], adsFov: 58,
    projectile: { speed: 48, gravity: 16, model: 'grenade', fuse: 2.2, bounce: true }, explosive: { radius: 5, build: 300 }, sound: 'launcher', weight: 4,
  },
};

// heal/shield: instantáneo al terminar de usar. over: curación progresiva
// (vida y después escudo). throw: objeto arrojadizo. deploy: se coloca.
export const CONSUMABLES = {
  bandage: { name: 'Vendas', max: 15, pickup: 5, use: 3.5, heal: 15, cap: 75, rarity: 0, weight: 30 },
  medkit: { name: 'Botiquín', max: 3, pickup: 1, use: 10, heal: 100, cap: 100, rarity: 1, weight: 14 },
  smallshield: { name: 'Minipoción de escudo', max: 6, pickup: 3, use: 2, shield: 25, cap: 50, rarity: 1, weight: 26 },
  shieldpot: { name: 'Poción de escudo', max: 3, pickup: 1, use: 5, shield: 50, cap: 100, rarity: 2, weight: 16 },
  flopper: { name: 'Pez saltarín', max: 4, pickup: 1, use: 1, heal: 40, cap: 100, rarity: 2, weight: 9 },
  slurp: { name: 'Zumo Slurp', max: 2, pickup: 1, use: 2, over: { total: 75, rate: 15 }, cap: 100, rarity: 3, weight: 6 },
  chug: { name: 'Jarra Chug', max: 1, pickup: 1, use: 15, heal: 100, shield: 100, cap: 100, rarity: 4, weight: 2 },
  grenade: { name: 'Granada', max: 6, pickup: 3, use: 0, throw: { speed: 20, fuse: 2.2, radius: 5, damage: 70, build: 260 }, rarity: 1, weight: 12 },
  impulse: { name: 'Granada de impulso', max: 6, pickup: 2, use: 0, throw: { speed: 18, fuse: 1.0, radius: 6, knock: 26 }, rarity: 2, weight: 7 },
  launchpad: { name: 'Plataforma de salto', max: 1, pickup: 1, use: 0, deploy: true, rarity: 3, weight: 3 },
};

export const PICKAXE = { kind: 'pickaxe', name: 'Pico' };

// Materiales de construcción (se consiguen con el pico).
export const MATERIALS = {
  wood: { name: 'Madera', color: '#d39a5a', hex: 0xb07a40, hp: 150, buildTime: 2.5, max: 999 },
  stone: { name: 'Piedra', color: '#b8bcc2', hex: 0x9a9ea6, hp: 300, buildTime: 5, max: 999 },
  metal: { name: 'Metal', color: '#8fb0d0', hex: 0x7f93a8, hp: 500, buildTime: 9, max: 999 },
};
export const BUILD_COST = 10;

const WEAPON_WEIGHTS = Object.fromEntries(Object.entries(WEAPONS).map(([k, w]) => [k, w.weight]));
const CONSUMABLE_WEIGHTS = Object.fromEntries(Object.entries(CONSUMABLES).map(([k, c]) => [k, c.weight]));
// Armas que usan los bots (no las explosivas).
export const BOT_WEAPONS = Object.keys(WEAPONS).filter((k) => !WEAPONS[k].explosive);
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
  if (!item) return 0;
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

export function clampRarity(type, rarity) {
  const w = WEAPONS[type];
  return Math.min(w.maxRarity ?? 4, Math.max(w.minRarity ?? 0, rarity));
}

function rollWeapon(rng, rarityWeights) {
  const type = pickKey(rng, WEAPON_WEIGHTS);
  return makeWeapon(type, clampRarity(type, rng.weighted(rarityWeights)));
}

function ammoFor(type, mult = 1) {
  const a = WEAPONS[type].ammo;
  return { kind: 'ammo', ammo: a, count: Math.round(AMMO[a].pickup * mult) };
}

function rollConsumable(rng) {
  const type = pickKey(rng, CONSUMABLE_WEIGHTS);
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
  const b = pickKey(rng, WEAPON_WEIGHTS);
  return [ammoFor(a), ammoFor(b)];
}

// Catálogo completo (modo creativo).
export function catalog() {
  const out = [];
  for (const type in WEAPONS) {
    const w = WEAPONS[type];
    for (let r = w.minRarity ?? 0; r <= (w.maxRarity ?? 4); r++) out.push(makeWeapon(type, r));
  }
  for (const type in CONSUMABLES) out.push({ kind: 'consumable', type, count: CONSUMABLES[type].max });
  for (const a in AMMO) out.push({ kind: 'ammo', ammo: a, count: a === 'rockets' ? 20 : 120 });
  for (const m in MATERIALS) out.push({ kind: 'material', mat: m, count: 500 });
  return out;
}
