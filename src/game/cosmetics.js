// Catálogo de cosméticos, pase de batalla, tienda y logros.
// Este archivo también lo usa el servidor (para validar el aspecto), así que
// no debe depender del navegador al importarse.

export const RARITY_COLORS = { comun: '#b4b4b4', raro: '#3fa9ff', epico: '#c25bff', legendario: '#ffb02e', mitico: '#ff4d6d' };
export const RARITY_NAMES = { comun: 'Común', raro: 'Raro', epico: 'Épico', legendario: 'Legendario', mitico: 'Mítico' };

// Skins (trajes completos)
export const SUITS = {
  banana: { name: 'Banana Agente', rarity: 'legendario', desc: 'Pelada, peligrosa y muy amarilla.' },
  astronauta: { name: 'Astronauta', rarity: 'epico', desc: 'Recién llegado de la órbita para saltar del autobús.' },
  robot: { name: 'Robo-Royale', rarity: 'mitico', desc: 'Chapa, tuercas y un visor rojo que no parpadea.' },
  pirata: { name: 'Capitana Pirata', rarity: 'raro', desc: 'Busca el tesoro… en los cofres dorados.' },
  ninja: { name: 'Sombra Ninja', rarity: 'raro', desc: 'Silencioso, rápido y siempre de negro.' },
  dino: { name: 'Dino Rex', rarity: 'legendario', desc: 'Brazos cortos, mordisco enorme. Solo en la Tienda.' },
};

// Accesorios (sombreros, gafas, mochilas…)
export const ACCESSORIES = {
  gorra: { name: 'Gorra Isleña', rarity: 'comun', desc: 'Protege del sol de la isla.' },
  gafas: { name: 'Gafas de Sol', rarity: 'comun', desc: 'Para mirar la tormenta con estilo.' },
  auriculares: { name: 'Auriculares Pro', rarity: 'raro', desc: 'Oyes los pasos antes que nadie.' },
  vikingo: { name: 'Casco Vikingo', rarity: 'raro', desc: 'Cuernos incluidos.' },
  vaquero: { name: 'Sombrero Vaquero', rarity: 'raro', desc: 'Yija.' },
  capa: { name: 'Capa de Héroe', rarity: 'epico', desc: 'Ondea mientras planeas.' },
  aureola: { name: 'Aureola', rarity: 'epico', desc: 'Para los que nunca abandonan a un compañero.' },
  alas: { name: 'Alas de Ángel', rarity: 'legendario', desc: 'No vuelan, pero lo parece.' },
  corona: { name: 'Corona Real', rarity: 'legendario', desc: 'Para quien consigue la Victoria Magistral.' },
};

// Camuflajes de armas: paleta de colores por pieza del arma.
export const CAMOS = {
  bosque: { name: 'Bosque', rarity: 'comun', colors: [0x4a5d23, 0x6b7f3a, 0x3b2f1e, 0x8a9a5b] },
  desierto: { name: 'Desierto', rarity: 'comun', colors: [0xc8a46a, 0xa98552, 0xe0c89a, 0x7a5f3a] },
  artico: { name: 'Ártico', rarity: 'raro', colors: [0xe8eef2, 0xb8c4cc, 0x8a9aa6, 0xffffff] },
  carbono: { name: 'Fibra de Carbono', rarity: 'raro', colors: [0x1a1a1a, 0x2c2c2c, 0x3d3d3d, 0x151515], shiny: true },
  lava: { name: 'Lava', rarity: 'epico', colors: [0x2a0a05, 0xff4a1a, 0xffa21a, 0x5a1208], glow: true },
  neon: { name: 'Neón', rarity: 'epico', colors: [0xff2bd6, 0x2bfff1, 0x8a2bff, 0x161616], glow: true },
  arcoiris: { name: 'Arcoíris', rarity: 'legendario', colors: [0xff4040, 0xffa040, 0xffff40, 0x40ff60, 0x40a0ff, 0xa040ff] },
  diamante: { name: 'Diamante', rarity: 'legendario', colors: [0x9ef0ff, 0xd8fbff, 0x5ad1ff, 0xbff6ff], shiny: true },
  oro: { name: 'Oro', rarity: 'mitico', colors: [0xffd23f, 0xe0a800, 0xfff0a0, 0xc99200], shiny: true },
};

export const COSMETIC_TYPES = {
  suit: { list: SUITS, name: 'Skin', plural: 'Skins' },
  acc: { list: ACCESSORIES, name: 'Accesorio', plural: 'Accesorios' },
  camo: { list: CAMOS, name: 'Camuflaje', plural: 'Camuflajes' },
};

export function cosmetic(type, id) {
  return COSMETIC_TYPES[type]?.list[id] || null;
}

// --------------------------------------------------------- PASE DE BATALLA
export const PASS = {
  season: 1,
  name: 'Temporada 1 · Isla Tropical',
  tiers: 40,
  xpPerTier: 1000,
  price: 800, // tokens
  extraTokens: 25, // por cada nivel extra al completar el pase
};

// Recompensas: { type: 'tokens', amount } o { type: 'suit'|'acc'|'camo', id }
const FREE = {
  1: { type: 'camo', id: 'bosque' },
  5: { type: 'acc', id: 'gorra' },
  9: { type: 'camo', id: 'desierto' },
  10: { type: 'suit', id: 'ninja' },
  13: { type: 'acc', id: 'gafas' },
  17: { type: 'camo', id: 'artico' },
  21: { type: 'acc', id: 'auriculares' },
  25: { type: 'camo', id: 'carbono' },
  29: { type: 'acc', id: 'vikingo' },
  30: { type: 'suit', id: 'pirata' },
  37: { type: 'acc', id: 'capa' },
};
// 10 recompensas de 45 tokens = 450 tokens en el pase gratuito
for (const t of [3, 7, 11, 15, 19, 23, 27, 31, 35, 39]) FREE[t] = { type: 'tokens', amount: 45 };

const PREMIUM = {
  1: { type: 'suit', id: 'banana' },
  2: { type: 'camo', id: 'neon' },
  8: { type: 'acc', id: 'aureola' },
  14: { type: 'acc', id: 'vaquero' },
  20: { type: 'suit', id: 'astronauta' },
  22: { type: 'camo', id: 'arcoiris' },
  26: { type: 'acc', id: 'alas' },
  32: { type: 'camo', id: 'lava' },
  38: { type: 'camo', id: 'diamante' },
  39: { type: 'camo', id: 'oro' },
  40: { type: 'suit', id: 'robot' },
};
FREE[40] = { type: 'acc', id: 'corona' };

export const PASS_REWARDS = [];
for (let t = 1; t <= PASS.tiers; t++) {
  PASS_REWARDS.push({
    tier: t,
    free: FREE[t] || null,
    premium: PREMIUM[t] || { type: 'tokens', amount: 25 },
  });
}

// ----------------------------------------------------------------- TIENDA
export const SHOP = [
  { type: 'pass', price: PASS.price },
  { type: 'suit', id: 'dino', price: 1200 },
  { type: 'suit', id: 'ninja', price: 800 },
  { type: 'suit', id: 'pirata', price: 800 },
  { type: 'acc', id: 'corona', price: 600 },
  { type: 'acc', id: 'capa', price: 500 },
  { type: 'acc', id: 'vikingo', price: 400 },
  { type: 'acc', id: 'auriculares', price: 300 },
  { type: 'acc', id: 'gorra', price: 200 },
  { type: 'acc', id: 'gafas', price: 200 },
];

export const WELCOME_TOKENS = 200;

// ----------------------------------------------------------------- LOGROS
// stat: estadística acumulada que se compara con `goal`.
export const ACHIEVEMENTS = [
  { id: 'kill1', name: 'Primera sangre', desc: 'Elimina a 1 rival', stat: 'kills', goal: 1, xp: 300 },
  { id: 'kill25', name: 'Cazador', desc: 'Elimina a 25 rivales', stat: 'kills', goal: 25, xp: 800 },
  { id: 'kill100', name: 'Leyenda de la isla', desc: 'Elimina a 100 rivales', stat: 'kills', goal: 100, xp: 2500 },
  { id: 'win1', name: 'Victoria Magistral', desc: 'Gana una partida', stat: 'wins', goal: 1, xp: 1000 },
  { id: 'win5', name: 'Imparable', desc: 'Gana 5 partidas', stat: 'wins', goal: 5, xp: 2500 },
  { id: 'top10', name: 'Superviviente', desc: 'Queda entre los 10 mejores 10 veces', stat: 'top10', goal: 10, xp: 800 },
  { id: 'head10', name: 'Ojo de halcón', desc: 'Acierta 50 disparos a la cabeza', stat: 'heads', goal: 50, xp: 700 },
  { id: 'chest25', name: 'Saqueador', desc: 'Abre 25 cofres', stat: 'chests', goal: 25, xp: 500 },
  { id: 'build200', name: 'Arquitecto', desc: 'Construye 200 piezas', stat: 'built', goal: 200, xp: 600 },
  { id: 'edit25', name: 'Manos rápidas', desc: 'Edita 25 construcciones', stat: 'edits', goal: 25, xp: 500 },
  { id: 'match10', name: 'Habitual', desc: 'Juega 10 partidas', stat: 'matches', goal: 10, xp: 600 },
  { id: 'match50', name: 'Veterano', desc: 'Juega 50 partidas', stat: 'matches', goal: 50, xp: 2000 },
  { id: 'online5', name: 'En equipo', desc: 'Juega 5 partidas online', stat: 'online', goal: 5, xp: 700 },
  { id: 'creative20', name: 'Creativo', desc: 'Coloca 20 edificios en el modo creativo', stat: 'prefabs', goal: 20, xp: 400 },
  { id: 'damage5k', name: 'Artillero', desc: 'Causa 5.000 de daño', stat: 'damage', goal: 5000, xp: 800 },
];

// Valida un aspecto recibido por red (lo usa también el servidor).
export function cleanCosmetics(o = {}) {
  const out = {};
  if (typeof o.suit === 'string' && SUITS[o.suit]) out.suit = o.suit;
  if (typeof o.acc === 'string' && ACCESSORIES[o.acc]) out.acc = o.acc;
  if (typeof o.camo === 'string' && CAMOS[o.camo]) out.camo = o.camo;
  return out;
}
