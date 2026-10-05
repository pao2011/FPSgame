// Definiciones de armas, munición, consumibles y tablas de botín.

export const RARITIES = [
  { name: 'Común', color: '#a8adb4', hex: 0xa8adb4 },
  { name: 'Poco común', color: '#4fc53a', hex: 0x4fc53a },
  { name: 'Raro', color: '#3a9dff', hex: 0x3a9dff },
  { name: 'Épico', color: '#b65cff', hex: 0xb65cff },
  { name: 'Legendario', color: '#ffa22a', hex: 0xffa22a },
  { name: 'Mítico', color: '#ffe04a', hex: 0xffe04a, glow: true },
  { name: 'Exótico', color: '#3ff0e0', hex: 0x3ff0e0, glow: true },
];
export const MYTHIC = 5;
export const EXOTIC = 6;

export const AMMO = {
  light: { name: 'Munición ligera', short: 'Ligera', color: 0x8fd3ff, pickup: 30, max: 999 },
  medium: { name: 'Munición media', short: 'Media', color: 0x7ee07e, pickup: 30, max: 999 },
  heavy: { name: 'Munición pesada', short: 'Pesada', color: 0xff6b6b, pickup: 6, max: 999 },
  shells: { name: 'Cartuchos', short: 'Cartuchos', color: 0xffd34d, pickup: 8, max: 999 },
  rockets: { name: 'Cohetes', short: 'Cohetes', color: 0xff9a3c, pickup: 4, max: 60 },
};

// spread en radianes (semiángulo del cono). damage y reload por rareza
// (índices 0-6: común … exótico). minR/maxR: rarezas en las que aparece.
// burst: disparos por ráfaga · spinUp: s hasta disparar (minigun) ·
// charge: s para tensar del todo (arco) · pierce: atraviesa construcciones
// y personajes · explosive: proyectil que explota (cohete, granada, flecha).
export const WEAPONS = {
  ar: {
    name: 'Rifle de asalto', ammo: 'medium', mag: 30, rate: 5.5, auto: true,
    damage: [30, 31, 33, 35, 36, 39, 39], headMult: 1.5, range: 320,
    spread: 0.04, adsSpread: 0.006, bloom: 0.007, maxBloom: 0.05,
    recoil: 0.011, reload: [2.7, 2.6, 2.5, 2.3, 2.2, 2.0, 2.0], adsFov: 50, sound: 'ar',
  },
  burst: {
    name: 'Rifle de ráfagas', ammo: 'medium', mag: 27, rate: 2.3, auto: false, burst: 3, burstDelay: 0.07,
    damage: [26, 27, 29, 31, 33, 36, 36], headMult: 1.5, range: 300,
    spread: 0.035, adsSpread: 0.004, bloom: 0.006, maxBloom: 0.035,
    recoil: 0.008, reload: [2.9, 2.8, 2.7, 2.6, 2.5, 2.3, 2.3], adsFov: 48, sound: 'burst',
  },
  smg: {
    name: 'Subfusil', ammo: 'light', mag: 30, rate: 12, auto: true,
    damage: [16, 17, 18, 19, 20, 22, 22], headMult: 1.75, range: 140,
    spread: 0.045, adsSpread: 0.02, bloom: 0.004, maxBloom: 0.04,
    recoil: 0.006, reload: [2.2, 2.1, 2.0, 1.9, 1.8, 1.6, 1.6], adsFov: 62, sound: 'smg',
  },
  minigun: {
    name: 'Minigun', ammo: 'light', mag: 100, rate: 14, auto: true, spinUp: 0.6, minR: 3,
    damage: [15, 15, 16, 17, 18, 20, 20], headMult: 1.5, range: 170,
    spread: 0.055, adsSpread: 0.04, bloom: 0.002, maxBloom: 0.03,
    recoil: 0.004, reload: [4.8, 4.8, 4.8, 4.6, 4.4, 4.0, 4.0], adsFov: 64, sound: 'minigun',
  },
  shotgun: {
    name: 'Escopeta de corredera', ammo: 'shells', mag: 5, rate: 0.85, auto: false,
    damage: [8, 9, 9.5, 10, 11, 12, 12], headMult: 2, range: 45, pellets: 10, falloff: [8, 40],
    spread: 0.07, adsSpread: 0.055, bloom: 0, maxBloom: 0,
    recoil: 0.06, reload: [0.65, 0.6, 0.56, 0.52, 0.48, 0.44, 0.44], shellReload: true, adsFov: 65, sound: 'shotgun',
  },
  tactical: {
    name: 'Escopeta táctica', ammo: 'shells', mag: 8, rate: 1.5, auto: false,
    damage: [6.5, 7, 7.5, 8, 8.5, 9.3, 9.3], headMult: 1.75, range: 40, pellets: 8, falloff: [6, 34],
    spread: 0.075, adsSpread: 0.06, bloom: 0, maxBloom: 0,
    recoil: 0.045, reload: [0.55, 0.52, 0.5, 0.47, 0.44, 0.4, 0.4], shellReload: true, adsFov: 66, sound: 'tactical',
  },
  pistol: {
    name: 'Pistola', ammo: 'light', mag: 16, rate: 6.75, auto: false,
    damage: [23, 24, 25, 26, 28, 31, 31], headMult: 2, range: 160,
    spread: 0.03, adsSpread: 0.012, bloom: 0.008, maxBloom: 0.045,
    recoil: 0.015, reload: [1.5, 1.45, 1.4, 1.35, 1.3, 1.2, 1.2], adsFov: 62, sound: 'pistol',
  },
  revolver: {
    name: 'Revólver', ammo: 'medium', mag: 6, rate: 1.6, auto: false,
    damage: [50, 53, 56, 59, 63, 68, 68], headMult: 2, range: 220,
    spread: 0.035, adsSpread: 0.006, bloom: 0.02, maxBloom: 0.05,
    recoil: 0.045, reload: [2.3, 2.2, 2.1, 2.0, 1.9, 1.7, 1.7], adsFov: 56, sound: 'revolver',
  },
  dmr: {
    name: 'Rifle de tirador', ammo: 'heavy', mag: 10, rate: 2.2, auto: false, minR: 1,
    damage: [52, 52, 55, 58, 62, 67, 67], headMult: 2, range: 520,
    spread: 0.05, adsSpread: 0.0015, bloom: 0.015, maxBloom: 0.05,
    recoil: 0.03, reload: [2.6, 2.6, 2.5, 2.4, 2.3, 2.1, 2.1], adsFov: 30, sound: 'dmr',
  },
  sniper: {
    name: 'Rifle de francotirador', ammo: 'heavy', mag: 1, rate: 0.45, auto: false, minR: 2,
    damage: [105, 110, 116, 121, 127, 135, 135], headMult: 2.5, range: 1000,
    spread: 0.08, adsSpread: 0.0, bloom: 0, maxBloom: 0,
    recoil: 0.07, reload: [3.4, 3.2, 3.0, 2.8, 2.6, 2.4, 2.4], adsFov: 14, scope: true,
    projectile: { speed: 420, gravity: 9.8 }, sound: 'sniper',
  },
  heavyar: {
    name: 'Fusil de asalto pesado', ammo: 'medium', mag: 25, rate: 3.75, auto: true, minR: 1,
    damage: [40, 42, 44, 46, 48, 52, 52], headMult: 1.5, range: 320,
    spread: 0.045, adsSpread: 0.008, bloom: 0.012, maxBloom: 0.06,
    recoil: 0.02, reload: [3.0, 2.9, 2.8, 2.6, 2.5, 2.3, 2.3], adsFov: 50, sound: 'heavy',
  },
  doublebarrel: {
    name: 'Escopeta de dos cañones', ammo: 'shells', mag: 2, rate: 3.2, auto: false, minR: 2,
    damage: [10, 10.5, 11, 11.5, 12, 13, 13], headMult: 1.75, range: 30, pellets: 10, falloff: [5, 26],
    spread: 0.09, adsSpread: 0.075, bloom: 0, maxBloom: 0,
    recoil: 0.08, reload: [2.1, 2.0, 1.9, 1.8, 1.7, 1.5, 1.5], adsFov: 66, sound: 'shotgun',
  },
  hunting: {
    name: 'Rifle de caza', ammo: 'heavy', mag: 1, rate: 0.7, auto: false, maxR: 3,
    damage: [86, 90, 94, 99, 104, 110, 110], headMult: 2.5, range: 700,
    spread: 0.05, adsSpread: 0.0, bloom: 0, maxBloom: 0,
    recoil: 0.06, reload: [1.9, 1.8, 1.7, 1.6, 1.5, 1.4, 1.4], adsFov: 38,
    projectile: { speed: 300, gravity: 12 }, sound: 'sniper',
  },
  handcannon: {
    name: 'Cañón de mano', ammo: 'heavy', mag: 7, rate: 1.2, auto: false, minR: 3,
    damage: [67, 70, 73, 75, 78, 84, 84], headMult: 2, range: 200,
    spread: 0.04, adsSpread: 0.008, bloom: 0.035, maxBloom: 0.07,
    recoil: 0.07, reload: [2.0, 2.0, 1.95, 1.9, 1.85, 1.7, 1.7], adsFov: 58, sound: 'handcannon',
  },
  rocket: {
    name: 'Lanzacohetes', ammo: 'rockets', mag: 1, rate: 0.9, auto: false, minR: 2,
    damage: [80, 80, 85, 90, 95, 105, 105], headMult: 1, range: 400,
    spread: 0.02, adsSpread: 0.002, bloom: 0, maxBloom: 0,
    recoil: 0.06, reload: [3.4, 3.4, 3.3, 3.1, 2.9, 2.6, 2.6], adsFov: 55, sound: 'rocket',
    explosive: { kind: 'rocket', speed: 60, gravity: 1.5, radius: 5.5, build: 450 },
  },
  glauncher: {
    name: 'Lanzagranadas', ammo: 'rockets', mag: 6, rate: 1.3, auto: false, minR: 2,
    damage: [65, 65, 70, 75, 80, 88, 88], headMult: 1, range: 300,
    spread: 0.02, adsSpread: 0.006, bloom: 0, maxBloom: 0,
    recoil: 0.05, reload: [3.0, 3.0, 2.9, 2.7, 2.5, 2.3, 2.3], adsFov: 58, sound: 'glauncher',
    explosive: { kind: 'shell', speed: 34, gravity: 18, radius: 4.5, build: 300, fuse: 2.2 },
  },
  plasma: {
    name: 'Rifle de plasma', ammo: 'medium', mag: 20, rate: 4, auto: true, minR: 6, maxR: 6,
    damage: [42, 42, 42, 42, 42, 42, 42], headMult: 1.6, range: 360, pierce: 3, beam: 0x3ff0e0,
    spread: 0.03, adsSpread: 0.003, bloom: 0.006, maxBloom: 0.03,
    recoil: 0.012, reload: [2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4], adsFov: 46, sound: 'plasma',
  },
  boombow: {
    name: 'Arco explosivo', ammo: 'heavy', mag: 1, rate: 1.4, auto: false, minR: 6, maxR: 6, charge: 0.9,
    damage: [85, 85, 85, 85, 85, 85, 85], headMult: 1, range: 400,
    spread: 0.01, adsSpread: 0.0, bloom: 0, maxBloom: 0,
    recoil: 0.02, reload: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], adsFov: 50, sound: 'bow',
    explosive: { kind: 'arrow', speed: 95, minSpeed: 30, gravity: 12, radius: 4.5, build: 320 },
  },
};

// Familia de cada arma (la usan los bots, el HUD y el catálogo creativo).
const CATS = {
  ar: 'ar', burst: 'ar', heavyar: 'ar', smg: 'smg', minigun: 'smg', shotgun: 'shotgun', tactical: 'shotgun', doublebarrel: 'shotgun',
  pistol: 'pistol', revolver: 'pistol', handcannon: 'pistol', dmr: 'sniper', sniper: 'sniper', hunting: 'sniper',
  rocket: 'explosive', glauncher: 'explosive', plasma: 'ar', boombow: 'explosive',
};
for (const k in WEAPONS) WEAPONS[k].cat = CATS[k] || 'ar';

// heal/shield: al terminar de usar. over: curación progresiva (vida y luego
// escudo). deploy: se coloca en el suelo (plataforma de salto).
export const CONSUMABLES = {
  bandage: { name: 'Vendas', max: 15, pickup: 5, use: 3.5, heal: 15, cap: 75, rarity: 0 },
  medkit: { name: 'Botiquín', max: 3, pickup: 1, use: 10, heal: 100, cap: 100, rarity: 1 },
  smallshield: { name: 'Minipoción de escudo', max: 6, pickup: 3, use: 2, shield: 25, cap: 50, rarity: 1 },
  shieldpot: { name: 'Poción de escudo', max: 3, pickup: 1, use: 5, shield: 50, cap: 100, rarity: 2 },
  chugjug: { name: 'Barril de poción', max: 1, pickup: 1, use: 15, heal: 100, shield: 100, cap: 100, rarity: 4 },
  flopper: { name: 'Pez saltarín', max: 4, pickup: 1, use: 1, heal: 40, cap: 100, rarity: 2 },
  slurp: { name: 'Zumo Slurp', max: 2, pickup: 1, use: 2, over: { total: 75, rate: 15 }, cap: 100, rarity: 3 },
  launchpad: { name: 'Plataforma de salto', max: 1, pickup: 1, use: 0, deploy: true, rarity: 3 },
};

// Objetos arrojadizos (se lanzan con clic izquierdo; el C4 se detona con el
// derecho). fuse: s hasta explotar (desde que se lanza o desde que se pega).
export const THROWABLES = {
  grenade: { name: 'Granada', max: 6, pickup: 3, rarity: 1, speed: 24, fuse: 2.4, bounce: 0.4, damage: 100, radius: 6, build: 375 },
  sticky: { name: 'Granada lapa', max: 6, pickup: 3, rarity: 2, speed: 24, fuse: 2.0, sticky: true, damage: 90, radius: 5, build: 300 },
  impulse: { name: 'Granada de impulso', max: 9, pickup: 3, rarity: 2, speed: 26, fuse: 2.5, bounce: 0.5, impact: 0.12, damage: 0, radius: 6.5, knock: 26, build: 0 },
  c4: { name: 'C4', max: 10, pickup: 3, rarity: 3, speed: 15, sticky: true, remote: true, damage: 105, radius: 6.5, build: 600 },
  smoke: { name: 'Granada de humo', max: 6, pickup: 2, rarity: 1, speed: 22, fuse: 1.6, bounce: 0.3, damage: 0, radius: 6, smoke: 14, build: 0 },
  molotov: { name: 'Molotov', max: 6, pickup: 2, rarity: 2, speed: 22, impact: 0, damage: 0, radius: 4.5, fire: 7, dps: 14, build: 0 },
};

export const PICKAXE = { kind: 'pickaxe', name: 'Pico' };

// Materiales de construcción (se consiguen con el pico).
export const MATERIALS = {
  wood: { name: 'Madera', color: '#d39a5a', hex: 0xb07a40, hp: 150, buildTime: 2.5, max: 999 },
  stone: { name: 'Piedra', color: '#b8bcc2', hex: 0x9a9ea6, hp: 300, buildTime: 5, max: 999 },
  metal: { name: 'Metal', color: '#8fb0d0', hex: 0x7f93a8, hp: 500, buildTime: 9, max: 999 },
};
export const BUILD_COST = 10;

const WEAPON_WEIGHTS = {
  ar: 22, burst: 12, heavyar: 8, shotgun: 18, tactical: 12, doublebarrel: 5, smg: 15, minigun: 4, pistol: 10, revolver: 8,
  handcannon: 3, dmr: 7, sniper: 7, hunting: 6, rocket: 4, glauncher: 4, plasma: 0.8, boombow: 0.8,
};
// Armas que usan los bots (no las explosivas).
export const BOT_WEAPONS = Object.keys(WEAPONS).filter((k) => !WEAPONS[k].explosive);
const THROWABLE_WEIGHTS = { grenade: 30, sticky: 14, impulse: 18, c4: 8, smoke: 14, molotov: 14 };
const FLOOR_RARITY = [42, 30, 17, 8, 2.6, 0.4, 0];
const CHEST_RARITY = [12, 34, 32, 16, 5, 1, 0];

export function itemName(item) {
  if (!item) return '';
  if (item.kind === 'weapon') return WEAPONS[item.type].name;
  if (item.kind === 'consumable') return CONSUMABLES[item.type].name;
  if (item.kind === 'throwable') return THROWABLES[item.type].name;
  if (item.kind === 'ammo') return AMMO[item.ammo].name;
  if (item.kind === 'material') return MATERIALS[item.mat].name;
  return 'Pico';
}

export function itemRarity(item) {
  if (item.kind === 'weapon') return item.rarity;
  if (item.kind === 'consumable') return CONSUMABLES[item.type].rarity;
  if (item.kind === 'throwable') return THROWABLES[item.type].rarity;
  return 0;
}

// Definición de los objetos que se apilan en una casilla (curas y arrojadizos).
export function stackDef(item) {
  if (!item) return null;
  if (item.kind === 'consumable') return CONSUMABLES[item.type];
  if (item.kind === 'throwable') return THROWABLES[item.type];
  return null;
}

export function clampRarity(type, rarity) {
  const d = WEAPONS[type];
  return Math.max(d.minR ?? 0, Math.min(d.maxR ?? MYTHIC, rarity));
}

export function makeWeapon(type, rarity) {
  return { kind: 'weapon', type, rarity: clampRarity(type, rarity), mag: WEAPONS[type].mag };
}

// Modos temporales: armas permitidas (null = todas, con sus pesos normales).
let POOL = null;
export function setLootPool(weights) {
  POOL = weights || null;
}
const weaponWeights = () => POOL || WEAPON_WEIGHTS;

function pickKey(rng, weights) {
  const keys = Object.keys(weights);
  return keys[rng.weighted(keys.map((k) => weights[k]))];
}

function rollWeapon(rng, rarityWeights) {
  const type = pickKey(rng, weaponWeights());
  return makeWeapon(type, rng.weighted(rarityWeights));
}

function ammoFor(type, mult = 1) {
  const a = WEAPONS[type].ammo;
  return { kind: 'ammo', ammo: a, count: Math.max(1, Math.round(AMMO[a].pickup * mult)) };
}

function rollConsumable(rng) {
  const type = pickKey(rng, { bandage: 35, smallshield: 30, medkit: 15, shieldpot: 20, chugjug: 3, flopper: 9, slurp: 6, launchpad: 3 });
  return { kind: 'consumable', type, count: CONSUMABLES[type].pickup };
}

function rollThrowable(rng) {
  const type = pickKey(rng, THROWABLE_WEIGHTS);
  return { kind: 'throwable', type, count: THROWABLES[type].pickup };
}

export function lootForChest(rng) {
  const w = rollWeapon(rng, CHEST_RARITY);
  const out = [w, ammoFor(w.type, 1.5)];
  if (rng.chance(0.7)) out.push(rollConsumable(rng));
  if (rng.chance(0.4)) out.push(rollThrowable(rng));
  if (rng.chance(0.3)) out.push(ammoFor(pickKey(rng, weaponWeights())));
  return out;
}

export function lootForFloor(rng) {
  const r = rng.next();
  if (r < 0.5) {
    const w = rollWeapon(rng, FLOOR_RARITY);
    return [w, ammoFor(w.type)];
  }
  if (r < 0.72) return [rollConsumable(rng)];
  if (r < 0.85) return [rollThrowable(rng)];
  return [ammoFor(pickKey(rng, weaponWeights()))];
}

export function lootForAmmoBox(rng) {
  const a = pickKey(rng, weaponWeights());
  const b = pickKey(rng, weaponWeights());
  const out = [ammoFor(a), ammoFor(b)];
  if (rng.chance(0.35)) out.push(rollThrowable(rng));
  return out;
}

// Catálogo completo (modo creativo): todas las armas en todas sus rarezas,
// curas, arrojadizos, munición y materiales.
export function catalog() {
  const out = [];
  for (const type in WEAPONS) {
    const w = WEAPONS[type];
    for (let r = w.minR ?? 0; r <= (w.maxR ?? MYTHIC); r++) out.push(makeWeapon(type, r));
  }
  for (const type in CONSUMABLES) out.push({ kind: 'consumable', type, count: CONSUMABLES[type].max });
  for (const type in THROWABLES) out.push({ kind: 'throwable', type, count: THROWABLES[type].max });
  for (const a in AMMO) out.push({ kind: 'ammo', ammo: a, count: a === 'rockets' ? 20 : 120 });
  for (const m in MATERIALS) out.push({ kind: 'material', mat: m, count: 500 });
  return out;
}
