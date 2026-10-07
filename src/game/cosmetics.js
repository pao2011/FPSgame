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

// Picos (herramienta de recolección): colores y forma de la cabeza.
export const PICKAXES = {
  piolet: { name: 'Piolet Ártico', rarity: 'comun', desc: 'Frío al tacto, rompe el hielo… y las paredes.', head: 0xd8f0ff, handle: 0x3a5f8a, accent: 0xffffff, shape: 'pick' },
  hacha: { name: 'Hacha Leñadora', rarity: 'raro', desc: 'La favorita de los que talan medio bosque.', head: 0x9aa5b1, handle: 0x8a5a32, accent: 0xc0302a, shape: 'axe' },
  piruleta: { name: 'Piruleta Gigante', rarity: 'raro', desc: 'Dulce por fuera, dura por dentro.', head: 0xff5aa8, handle: 0xffffff, accent: 0x5ad1ff, shape: 'lolly' },
  martillo: { name: 'Martillo Pesado', rarity: 'epico', desc: 'Cada golpe retumba en toda la isla.', head: 0x4b4f57, handle: 0x2b2f36, accent: 0xff9a3c, shape: 'hammer' },
  dorado: { name: 'Pico Dorado', rarity: 'legendario', desc: 'Brilla tanto que los bots se distraen.', head: 0xffd23f, handle: 0x5a3a1a, accent: 0xfff0a0, shape: 'pick', shiny: true },
  guadana: { name: 'Guadaña Lunar', rarity: 'mitico', desc: 'Forjada con polvo de luna.', head: 0xb8e0ff, handle: 0x1d1f2a, accent: 0x7a5cff, shape: 'scythe', glow: true },
};

// Planeadores: colores de los gajos y forma (cometa o ala).
export const GLIDERS = {
  nube: { name: 'Nube', rarity: 'comun', desc: 'Suave y esponjoso.', colors: [0xffffff, 0xdfefff] },
  arcoiris_p: { name: 'Arco Iris', rarity: 'raro', desc: 'Siete colores para aterrizar con estilo.', colors: [0xff4040, 0xffa040, 0xffff40, 0x40ff60, 0x40a0ff, 0xa040ff] },
  noche: { name: 'Noche Estrellada', rarity: 'epico', desc: 'Para los saltos nocturnos.', colors: [0x1a2050, 0x3a3f8a, 0xffd34d, 0x1a2050] },
  tiburon: { name: 'Tiburón Volador', rarity: 'epico', desc: 'Aletas incluidas.', colors: [0x5a7a9a, 0xe8eef2], shape: 'wing' },
  dragon: { name: 'Ala de Dragón', rarity: 'legendario', desc: 'Escamas rojas y mucho fuego.', colors: [0xc0302a, 0x5a1208], shape: 'wing' },
};

// Mochilas (sustituyen a la mochila de serie).
export const BAGS = {
  tanque: { name: 'Tanque de Oxígeno', rarity: 'comun', desc: 'Por si la tormenta te deja sin aire.', color: 0x3fa9ff, accent: 0x2a2c30, style: 'tank' },
  osito: { name: 'Osito Viajero', rarity: 'raro', desc: 'Siempre a tu espalda.', color: 0xa0703a, accent: 0x6a4520, style: 'bear' },
  escudo: { name: 'Escudo Vikingo', rarity: 'raro', desc: 'De madera y hierro.', color: 0x8a5a32, accent: 0xc0c6ce, style: 'shield' },
  cohete: { name: 'Mochila Cohete', rarity: 'epico', desc: 'No vuela, pero hace ruido.', color: 0xd0d6de, accent: 0xff6a2a, style: 'rocket' },
  mecanica: { name: 'Alas Mecánicas', rarity: 'legendario', desc: 'Tecnología de otra temporada.', color: 0x2a2c30, accent: 0x3ff0e0, style: 'wings' },
};

// Estelas al caer y planear.
export const TRAILS = {
  chispas: { name: 'Chispas', rarity: 'comun', desc: 'Una lluvia de chispas doradas.', color: 0xffd34d },
  corazones: { name: 'Corazones', rarity: 'raro', desc: 'Lleno de amor desde el cielo.', color: 0xff5a8a },
  humo: { name: 'Humo de Colores', rarity: 'raro', desc: 'Como en las exhibiciones aéreas.', color: 0x9b5cff, smoke: true },
  arcoiris_e: { name: 'Estela Arco Iris', rarity: 'epico', desc: 'Todos los colores a la vez.', rainbow: true },
  fuego: { name: 'Fuego', rarity: 'legendario', desc: 'Entra en la isla como un meteorito.', color: 0xff7a1a },
};

// Gestos (bailes). Los marcados como `free` los tiene todo el mundo.
export const EMOTES = {
  saludo: { name: 'Saludo', rarity: 'comun', desc: '¡Hola!', anim: 'wave', free: true },
  baile: { name: 'Baile Isleño', rarity: 'comun', desc: 'El baile de la Isla de Inicio.', anim: 'dance', free: true },
  aplauso: { name: 'Aplausos', rarity: 'comun', desc: 'Buen tiro.', anim: 'clap' },
  robot: { name: 'El Robot', rarity: 'raro', desc: 'Bip, bup.', anim: 'robot' },
  flexiones: { name: 'Flexiones', rarity: 'raro', desc: 'Entrena entre partida y partida.', anim: 'pushups' },
  giro: { name: 'Giro Loco', rarity: 'epico', desc: 'Da vueltas hasta marearte.', anim: 'spin' },
  victoria: { name: 'Pose de Campeón', rarity: 'legendario', desc: 'Para después de la Victoria Magistral.', anim: 'flex' },
  risa: { name: 'Carcajada', rarity: 'comun', desc: '¡Ja, ja, ja!', anim: 'laugh', free: true },
  sentarse: { name: 'A Descansar', rarity: 'comun', desc: 'Siéntate a esperar a la tormenta.', anim: 'sit', free: true },
  militar: { name: 'Saludo Militar', rarity: 'comun', desc: '¡A sus órdenes!', anim: 'salute', free: true },
  hilo: { name: 'Hilo Dental', rarity: 'raro', desc: 'El clásico de los bailes.', anim: 'floss' },
  guitarra: { name: 'Guitarra Invisible', rarity: 'epico', desc: 'Un solo legendario sin guitarra.', anim: 'guitar' },
  dab: { name: 'Dab', rarity: 'raro', desc: 'Para rematar una buena jugada.', anim: 'dab' },
};

// Pantallas de carga (fondo de la espera de las partidas).
export const SCREENS = {
  atardecer: { name: 'Atardecer en la Isla', rarity: 'comun', desc: 'El sol se pone sobre la costa.', icon: '🌅', bg: 'linear-gradient(160deg,#ff9a3c,#d6455e 45%,#3a1d5c)', free: true },
  autobus: { name: 'El Autobús', rarity: 'raro', desc: '¿Le has dado las gracias al conductor?', icon: '🚌', bg: 'linear-gradient(160deg,#5ad1ff,#2d6fd6 55%,#152a5c)' },
  tormenta: { name: 'Ojo de la Tormenta', rarity: 'epico', desc: 'Morada y llena de rayos.', icon: '🌀', bg: 'radial-gradient(circle at 40% 40%,#c25bff,#4a1a7a 50%,#120724)' },
  castillo: { name: 'Castillo Corona', rarity: 'epico', desc: 'El lugar más disputado del mapa.', icon: '🏰', bg: 'linear-gradient(160deg,#ffe28a,#c99200 50%,#4a3200)' },
  neon: { name: 'Noche de Neón', rarity: 'legendario', desc: 'La isla nunca duerme.', icon: '🌃', bg: 'linear-gradient(160deg,#ff2bd6,#8a2bff 45%,#0d0730)' },
};

export const COSMETIC_TYPES = {
  suit: { list: SUITS, name: 'Skin', plural: 'Skins' },
  acc: { list: ACCESSORIES, name: 'Accesorio', plural: 'Accesorios' },
  camo: { list: CAMOS, name: 'Camuflaje', plural: 'Camuflajes' },
  pick: { list: PICKAXES, name: 'Pico', plural: 'Picos' },
  glider: { list: GLIDERS, name: 'Planeador', plural: 'Planeadores' },
  bag: { list: BAGS, name: 'Mochila', plural: 'Mochilas' },
  trail: { list: TRAILS, name: 'Estela', plural: 'Estelas' },
  emote: { list: EMOTES, name: 'Gesto', plural: 'Gestos' },
  screen: { list: SCREENS, name: 'Pantalla de carga', plural: 'Pantallas de carga' },
};
export const COSMETIC_KEYS = Object.keys(COSMETIC_TYPES);

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
// Taquilla ampliada (picos, planeadores, mochilas, estelas, gestos, pantallas)
Object.assign(FREE, {
  2: { type: 'emote', id: 'aplauso' }, 4: { type: 'pick', id: 'piolet' }, 6: { type: 'glider', id: 'nube' },
  8: { type: 'trail', id: 'chispas' }, 12: { type: 'bag', id: 'tanque' }, 16: { type: 'screen', id: 'autobus' },
  18: { type: 'emote', id: 'robot' }, 24: { type: 'pick', id: 'hacha' }, 28: { type: 'trail', id: 'corazones' },
  33: { type: 'bag', id: 'escudo' }, 36: { type: 'glider', id: 'arcoiris_p' },
});
Object.assign(PREMIUM, {
  4: { type: 'pick', id: 'martillo' }, 6: { type: 'trail', id: 'humo' }, 10: { type: 'glider', id: 'noche' },
  12: { type: 'emote', id: 'flexiones' }, 16: { type: 'bag', id: 'cohete' }, 18: { type: 'screen', id: 'tormenta' },
  24: { type: 'emote', id: 'giro' }, 28: { type: 'glider', id: 'tiburon' }, 30: { type: 'trail', id: 'arcoiris_e' },
  34: { type: 'pick', id: 'dorado' }, 36: { type: 'bag', id: 'mecanica' }, 37: { type: 'screen', id: 'neon' },
});

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
  { type: 'pick', id: 'guadana', price: 1000 },
  { type: 'pick', id: 'piruleta', price: 500 },
  { type: 'glider', id: 'dragon', price: 900 },
  { type: 'bag', id: 'osito', price: 400 },
  { type: 'trail', id: 'fuego', price: 700 },
  { type: 'emote', id: 'victoria', price: 800 },
  { type: 'emote', id: 'robot', price: 400 },
  { type: 'emote', id: 'hilo', price: 500 },
  { type: 'emote', id: 'guitarra', price: 600 },
  { type: 'emote', id: 'dab', price: 300 },
  { type: 'screen', id: 'castillo', price: 300 },
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
  for (const k of COSMETIC_KEYS) if (typeof o[k] === 'string' && Object.hasOwn(COSMETIC_TYPES[k].list, o[k])) out[k] = o[k];
  return out;
}

// ¿Lo tiene todo el mundo sin conseguirlo? (gestos y pantalla de serie)
export function isFreeCosmetic(type, id) {
  return !!cosmetic(type, id)?.free;
}
