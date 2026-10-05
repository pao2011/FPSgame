import * as THREE from 'three';
import { genHouse, genWarehouse, windowsFor } from './buildings.js';

// Estructuras variadas (además de casas y naves). Igual que en buildings.js,
// todo se define en coordenadas locales con el frente hacia +Z.

const BASE = 0.15;
const CONCRETE = 0x8d8d86;
const DARK = 0x3a3d42;
const WOOD = 0x8a6440;
const WHITE = 0xf0eee8;

function foundation(ctx, hw, hd, color = CONCRETE) {
  ctx.box(-hw - 0.3, -3, -hd - 0.3, hw + 0.3, BASE, hd + 0.3, color);
}

// Barandilla perimetral de una plataforma cuadrada con un hueco en +Z.
function railing(ctx, hw, hd, y, gap = 0.7, color = DARK) {
  const h = 1.05, t = 0.08;
  ctx.box(-hw, y, -hd, hw, y + h, -hd + t, color);
  ctx.box(-hw, y, -hd, -hw + t, y + h, hd, color);
  ctx.box(hw - t, y, -hd, hw, y + h, hd, color);
  ctx.box(-hw, y, hd - t, -gap, y + h, hd, color);
  ctx.box(gap, y, hd - t, hw, y + h, hd, color);
}

// ------------------------------------------------------------------ TIENDA
export function genShop(ctx, rng, o) {
  const W = o.W, D = o.D, H = 4.2, t = 0.3, hw = W / 2, hd = D / 2;
  const y0 = BASE, y1 = BASE + H;
  const col = o.wallColor ?? 0xe8e2d4;
  foundation(ctx, hw, hd);
  const front = [
    { a: -0.9, b: 0.9, bottom: y0, top: y0 + 2.6 },
    { a: -hw + 0.8, b: -1.3, bottom: y0 + 0.9, top: y0 + 3.3 },
    { a: 1.3, b: hw - 0.8, bottom: y0 + 0.9, top: y0 + 3.3 },
  ];
  ctx.wall('x', -hw, hw, hd - t, hd, y0, y1, front, col);
  ctx.wall('x', -hw, hw, -hd, -hd + t, y0, y1, [{ a: hw * 0.4 - 0.75, b: hw * 0.4 + 0.75, bottom: y0, top: y0 + 2.5 }], col);
  ctx.wall('z', -hd + t, hd - t, -hw, -hw + t, y0, y1, windowsFor(-hd + t, hd - t, y0, rng), col);
  ctx.wall('z', -hd + t, hd - t, hw - t, hw, y0, y1, windowsFor(-hd + t, hd - t, y0, rng), col);
  ctx.box(-hw + t, y1 - 0.25, -hd + t, hw - t, y1, hd - t, 0x77756f);
  ctx.box(-hw, y1, hd - 0.25, hw, y1 + 0.7, hd, col);
  ctx.box(-hw, y1, -hd, hw, y1 + 0.7, -hd + 0.25, col);
  ctx.box(-hw, y1, -hd, -hw + 0.25, y1 + 0.7, hd, col);
  ctx.box(hw - 0.25, y1, -hd, hw, y1 + 0.7, hd, col);
  // Letrero y toldo
  const sign = o.sign ?? 0xd63a2f;
  ctx.box(-hw * 0.7, y1 + 0.2, hd, hw * 0.7, y1 + 1.4, hd + 0.2, sign, false);
  ctx.box(-hw * 0.65, y1 + 0.5, hd + 0.2, hw * 0.65, y1 + 1.1, hd + 0.25, WHITE, false);
  ctx.box(-hw + 0.3, y0 + 3.3, hd, hw - 0.3, y0 + 3.45, hd + 1.3, sign, false);
  // Estanterías y mostrador
  if (D >= 8) {
    for (const z of [-hd * 0.15, -hd * 0.55]) ctx.box(-hw + 1.6, y0, z - 0.3, hw - 2.2, y0 + 1.7, z + 0.3, 0x9aa0a8);
    ctx.box(hw - 2.6, y0, hd - 2.6, hw - 0.6, y0 + 1.0, hd - 1.8, WOOD);
  }
  ctx.spot(ctx.chestSpots, -hw + t + 0.7, y0, -hd + t + 0.6, 0, 0);
  ctx.spot(ctx.chestSpots, hw - t - 0.7, y0, -hd + t + 0.6, 0, 0);
  ctx.spot(ctx.lootSpots, 0, y0, hd * 0.35);
  if (D >= 8) ctx.spot(ctx.lootSpots, -hw * 0.3, y0, -hd * 0.35);
}

// -------------------------------------------------------------- GASOLINERA
export function genGasStation(ctx, rng) {
  // Marquesina
  for (const x of [-5.5, 5.5]) for (const z of [0.5, 6.5]) ctx.box(x - 0.25, 0, z - 0.25, x + 0.25, 4.8, z + 0.25, WHITE);
  ctx.box(-7.5, 4.8, -1, 7.5, 5.3, 8, 0xd63a2f);
  ctx.box(-7.6, 5.0, -1.1, 7.6, 5.2, 8.1, WHITE, false);
  ctx.box(-8, -0.5, -1.5, 8, 0.08, 8.5, 0x55575c, false);
  // Surtidores
  for (const x of [-2.6, 2.6]) {
    ctx.box(x - 0.6, 0, 1.5, x + 0.6, 0.25, 5.5, 0xbfbfbf);
    for (const z of [2.5, 4.5]) {
      ctx.box(x - 0.35, 0.25, z - 0.25, x + 0.35, 1.8, z + 0.25, 0xe8e8e8);
      ctx.box(x - 0.36, 1.2, z - 0.26, x + 0.36, 1.6, z + 0.26, 0x2f6fd6, false);
    }
  }
  // Poste con precios
  ctx.box(7.5, 0, 9, 7.8, 7, 9.3, DARK);
  ctx.box(6.4, 6, 9.0, 8.9, 8, 9.3, 0xd63a2f, false);
  ctx.box(6.6, 6.3, 9.3, 8.7, 7.7, 9.35, 0xf2c230, false);
  // Tienda detrás
  genShop(ctx.sub(0, -6.5), rng, { W: 11, D: 8, sign: 0xd63a2f });
  ctx.spot(ctx.ammoSpots, 6.5, 0.1, 3, 0, 3);
}

// ----------------------------------------------------------------- IGLESIA
export function genChurch(outer, rng) {
  // Desplazado para que nave + campanario queden centrados en la parcela
  const ctx = outer.sub(3.4, 0);
  const W = 10, D = 17, H = 7.5, t = 0.35, hw = W / 2, hd = D / 2;
  const y0 = BASE, y1 = BASE + H;
  const col = 0xece4d2;
  foundation(ctx, hw, hd);
  const tall = (a0, a1) => {
    const ops = [];
    for (let c = a0 + 2; c < a1 - 1.5; c += 3.2) ops.push({ a: c - 0.55, b: c + 0.55, bottom: y0 + 2.2, top: y0 + 5.6 });
    return ops;
  };
  ctx.wall('x', -hw, hw, hd - t, hd, y0, y1, [{ a: -1.2, b: 1.2, bottom: y0, top: y0 + 3.8 }], col);
  ctx.wall('x', -hw, hw, -hd, -hd + t, y0, y1, [], col);
  ctx.wall('z', -hd + t, hd - t, -hw, -hw + t, y0, y1, tall(-hd + t, hd - t), col);
  ctx.wall('z', -hd + t, hd - t, hw - t, hw, y0, y1, [...tall(-hd + t, hd - t), { a: -hd + 2, b: -hd + 3.4, bottom: y0, top: y0 + 2.5 }], col);
  ctx.box(-hw + t, y1 - 0.25, -hd + t, hw - t, y1, hd - t, 0x77756f);
  ctx.gableRoof(hw + 0.5, hd + 0.5, y1, 4.2, 0x5b4636, col);
  // Bancos y altar
  for (let z = -hd + 4.5; z < hd - 3; z += 1.6) {
    ctx.box(-hw + 0.8, y0, z, -0.9, y0 + 0.45, z + 0.5, WOOD);
    ctx.box(0.9, y0, z, hw - 0.8, y0 + 0.45, z + 0.5, WOOD);
  }
  ctx.box(-1.5, y0, -hd + 1.0, 1.5, y0 + 1.0, -hd + 2.2, 0xd8c8a0);
  ctx.spot(ctx.chestSpots, -hw + t + 0.7, y0, -hd + t + 0.7, 0, 0);
  ctx.spot(ctx.lootSpots, 0, y0, 0);
  // Campanario con aguja
  const tw = ctx.sub(-hw - 3.6, -hd + 3.6);
  genHouse(tw, rng, { W: 7, D: 7, floors: 3, roof: 'flat', wallColor: col });
  const top = BASE + 3 * 3.2;
  tw.geometry(new THREE.ConeGeometry(4.6, 7, 4, 1).rotateY(Math.PI / 4), 0x5b4636, 0, top + 4.5, 0);
  tw.colliderOnly(-2.4, top + 1, -2.4, 2.4, top + 4, 2.4);
  tw.box(-0.15, top + 8, -0.1, 0.15, top + 10, 0.1, 0xd9b44a, false);
  tw.box(-0.7, top + 9.1, -0.1, 0.7, top + 9.4, 0.1, 0xd9b44a, false);
}

// --------------------------------------------------------- DEPÓSITO DE AGUA
export function genWaterTower(ctx) {
  const H = 12;
  for (const x of [-3, 3]) for (const z of [-3, 3]) ctx.box(x - 0.2, 0, z - 0.2, x + 0.2, H, z + 0.2, 0x8a8f96);
  for (const y of [4, 8]) {
    ctx.box(-3, y, -3.05, 3, y + 0.12, -2.95, 0x8a8f96, false);
    ctx.box(-3, y, 2.95, 3, y + 0.12, 3.05, 0x8a8f96, false);
    ctx.box(-3.05, y, -3, -2.95, y + 0.12, 3, 0x8a8f96, false);
    ctx.box(2.95, y, -3, 3.05, y + 0.12, 3, 0x8a8f96, false);
  }
  ctx.box(-4, H, -4, 4, H + 0.3, 4, 0x6f747a);
  railing(ctx, 4, 4, H + 0.3);
  ctx.geometry(new THREE.CylinderGeometry(2.4, 2.4, 5, 18), 0xa8c4d8, 0, H + 2.8, 0);
  ctx.geometry(new THREE.ConeGeometry(2.6, 1.5, 18), 0x5a7a92, 0, H + 6.05, 0);
  ctx.colliderOnly(-1.9, H + 0.3, -1.9, 1.9, H + 6.5, 1.9);
  ctx.ladderVisual(0, 4.15, 0, H + 0.3, 'x');
  ctx.spot(ctx.chestSpots, 2.9, H + 0.3, -2.9, 0, 0);
}

// ----------------------------------------------------------- ANTENA DE RADIO
export function genRadioTower(ctx, rng) {
  const H = 38;
  for (const x of [-1.5, 1.5]) for (const z of [-1.5, 1.5]) ctx.box(x - 0.15, 0, z - 0.15, x + 0.15, H, z + 0.15, 0xc0392b, false);
  for (let y = 3; y < H; y += 3) {
    const c = (y / 3) % 2 ? 0xffffff : 0xc0392b;
    ctx.box(-1.6, y, -1.6, 1.6, y + 0.15, 1.6, c, false);
  }
  ctx.colliderOnly(-1.6, 0, -1.6, 1.6, H, 1.6);
  ctx.box(-0.4, H, -0.4, 0.4, H + 0.6, 0.4, 0xff2020, false);
  // Plataforma a media altura con escalera de mano
  const P = 20;
  ctx.box(-2.6, P, 1.6, 2.6, P + 0.25, 4.6, 0x6f747a);
  ctx.box(-2.6, P + 0.25, 1.6, -2.5, P + 1.3, 4.6, DARK);
  ctx.box(2.5, P + 0.25, 1.6, 2.6, P + 1.3, 4.6, DARK);
  ctx.box(-2.6, P + 0.25, 4.5, -0.7, P + 1.3, 4.6, DARK);
  ctx.box(0.7, P + 0.25, 4.5, 2.6, P + 1.3, 4.6, DARK);
  ctx.ladderVisual(0, 4.75, 0, P + 0.25, 'x');
  ctx.spot(ctx.chestSpots, 1.9, P + 0.25, 2.3, 0, 0);
  // Caseta
  genShop(ctx.sub(7, 0, 1), rng, { W: 7, D: 6, sign: 0x2f6fd6, wallColor: 0xd8d4c8 });
}

// -------------------------------------------------------------------- FARO
export function genLighthouse(ctx, rng) {
  const H = 24;
  for (let i = 0; i < 4; i++) {
    const y = (i * H) / 4;
    ctx.geometry(new THREE.CylinderGeometry(3.0 - i * 0.2, 3.2 - i * 0.2, H / 4, 18), i % 2 ? 0xd63a2f : WHITE, 0, y + H / 8, 0);
  }
  ctx.colliderOnly(-2.4, 0, -2.4, 2.4, H, 2.4);
  ctx.box(-4.5, H, -4.5, 4.5, H + 0.3, 4.5, DARK);
  railing(ctx, 4.5, 4.5, H + 0.3);
  ctx.box(-1.6, H + 0.3, -1.6, 1.6, H + 3.2, 1.6, 0xfff1a0, true);
  ctx.geometry(new THREE.ConeGeometry(2.3, 2, 8), 0xd63a2f, 0, H + 4.2, 0);
  ctx.ladderVisual(0, 4.65, 0, H + 0.3, 'x');
  ctx.spot(ctx.chestSpots, -3.6, H + 0.3, -3.6, 0, 0);
  ctx.spot(ctx.chestSpots, 3.6, H + 0.3, -3.6, 0, 0);
  genHouse(ctx.sub(10, -2, 1), rng, { W: 8, D: 7, floors: 1, roof: 'gable', wallColor: 0xf0f0e6, roofColor: 0x2f4f6f });
}

// ------------------------------------------------------------------ BÚNKER
export function genBunker(ctx, rng) {
  const W = 14, D = 10, H = 3.2, t = 0.6, hw = W / 2, hd = D / 2;
  const y0 = BASE, y1 = BASE + H;
  const col = 0x7d8079;
  foundation(ctx, hw, hd, 0x6d706a);
  const slits = (a0, a1) => {
    const ops = [];
    for (let c = a0 + 2; c < a1 - 1; c += 3.5) ops.push({ a: c - 0.6, b: c + 0.6, bottom: y0 + 1.6, top: y0 + 2.0 });
    return ops;
  };
  ctx.wall('x', -hw, hw, hd - t, hd, y0, y1, [...slits(-hw, -1.5), ...slits(1.5, hw), { a: -1, b: 1, bottom: y0, top: y0 + 2.4 }], col);
  ctx.wall('x', -hw, hw, -hd, -hd + t, y0, y1, slits(-hw, hw), col);
  ctx.wall('z', -hd + t, hd - t, -hw, -hw + t, y0, y1, slits(-hd, hd), col);
  ctx.wall('z', -hd + t, hd - t, hw - t, hw, y0, y1, slits(-hd, hd), col);
  ctx.box(-hw - 0.3, y1, -hd - 0.3, hw + 0.3, y1 + 0.6, hd + 0.3, col);
  for (let i = 0; i < 3; i++) ctx.box(-hw + 1.2 + i * 1.6, y0, -hd + 1, -hw + 2.4 + i * 1.6, y0 + 1.2, -hd + 2.2, 0x5b6a3a);
  ctx.spot(ctx.chestSpots, hw - t - 0.8, y0, -hd + t + 0.7, 0, 0);
  ctx.spot(ctx.chestSpots, -hw + t + 0.8, y0, hd - t - 0.8, 0, 0);
  ctx.spot(ctx.lootSpots, 2, y0, 0);
  // Sacos terreros delante
  genSandbags(ctx, -5, hd + 3, -1.6, hd + 3.6);
  genSandbags(ctx, 1.6, hd + 3, 5, hd + 3.6);
}

export function genSandbags(ctx, x0, z0, x1, z1) {
  ctx.box(x0, 0, z0, x1, 1.0, z1, 0xb8a67a);
  ctx.box(x0 + 0.1, 1.0, z0 + 0.05, x1 - 0.1, 1.15, z1 - 0.05, 0xa8966a, false);
}

// --------------------------------------------------- TORRE DE VIGILANCIA
export function genWatchtower(ctx) {
  const P = 6;
  for (const x of [-1.8, 1.8]) for (const z of [-1.8, 1.8]) ctx.box(x - 0.15, 0, z - 0.15, x + 0.15, P + 3, z + 0.15, WOOD);
  ctx.box(-2.2, P, -2.2, 2.2, P + 0.25, 2.2, 0x7a5a3c);
  const y = P + 0.25;
  ctx.box(-2.2, y, -2.2, 2.2, y + 1.1, -2.1, WOOD);
  ctx.box(-2.2, y, -2.2, -2.1, y + 1.1, 2.2, WOOD);
  ctx.box(2.1, y, -2.2, 2.2, y + 1.1, 2.2, WOOD);
  ctx.box(-2.2, y, 2.1, -0.6, y + 1.1, 2.2, WOOD);
  ctx.box(0.6, y, 2.1, 2.2, y + 1.1, 2.2, WOOD);
  ctx.box(-2.5, P + 3, -2.5, 2.5, P + 3.2, 2.5, 0x5b4636);
  ctx.ladderVisual(0, 2.35, 0, P + 0.25, 'x');
  ctx.spot(ctx.chestSpots, -1.3, y, -1.3, 0, 0);
}

// --------------------------------------------------------- TIENDA DE CAMPAÑA
export function genTent(ctx, rng) {
  ctx.gableRoof(1.6, 2.3, 0, 2.0, rng.pick([0x5b6a3a, 0x8a7a50, 0x2f6fd6, 0xc0392b]), 0x4a5530);
  ctx.spot(ctx.ammoSpots, 0, 0.05, 3.0, 0, 6);
}

// ----------------------------------------------------------------- FÁBRICA
export function genFactory(ctx, rng, o) {
  genWarehouse(ctx, rng, o);
  const hd = o.D / 2;
  for (const x of [-o.W * 0.3, o.W * 0.15]) {
    ctx.geometry(new THREE.CylinderGeometry(1.1, 1.5, 26, 14), 0x8a5040, x, 13, -hd - 2.4);
    ctx.geometry(new THREE.CylinderGeometry(1.18, 1.18, 1.2, 14), WHITE, x, 23, -hd - 2.4);
    ctx.colliderOnly(x - 1.2, 0, -hd - 3.6, x + 1.2, 26, -hd - 1.2);
  }
  ctx.box(-o.W * 0.3 - 0.4, 4, -hd - 1.6, o.W * 0.15 + 0.4, 4.8, -hd - 0.8, 0x777b80, false);
}

// ------------------------------------------------------------------ ESTADIO
export function genStadium(ctx, rng) {
  ctx.box(-21, -0.4, -13, 21, 0.06, 13, 0x3f9a3a, false, 0);
  ctx.box(-20, 0.06, -0.08, 20, 0.08, 0.08, WHITE, false, 0);
  for (const s of [-1, 1]) {
    ctx.box(-20 * s - 0.08, 0.06, -12, -20 * s + 0.08, 0.08, 12, WHITE, false, 0);
    // Porterías
    const gx = 20 * s;
    ctx.box(gx - 0.1, 0, -3.6, gx + 0.1, 2.4, -3.4, WHITE);
    ctx.box(gx - 0.1, 0, 3.4, gx + 0.1, 2.4, 3.6, WHITE);
    ctx.box(gx - 0.1, 2.3, -3.6, gx + 0.1, 2.5, 3.6, WHITE, false);
    // Gradas escalonadas (se suben andando)
    for (let k = 0; k < 8; k++) {
      const z0 = 14 + k, z1 = z0 + 1;
      if (s > 0) ctx.box(-22, 0, z0, 22, (k + 1) * 0.5, z1, k % 2 ? 0x9aa3ad : 0x2f6fd6);
      else ctx.box(-22, 0, -z1, 22, (k + 1) * 0.5, -z0, k % 2 ? 0x9aa3ad : 0xd63a2f);
    }
    const zb = s * 22.2;
    ctx.box(-22, 4, Math.min(zb, zb + s * 0.2), 22, 5.2, Math.max(zb, zb + s * 0.2), DARK);
    for (const x of [-21, -7, 7, 21]) ctx.box(x - 0.2, 4, s > 0 ? 21.6 : -21.8, x + 0.2, 9, s > 0 ? 21.8 : -21.6, 0xb8bcc0);
    ctx.box(-22.5, 9, s > 0 ? 15 : -22.4, 22.5, 9.3, s > 0 ? 22.4 : -15, 0xe8e8e8);
    ctx.spot(ctx.chestSpots, s * 12, 4, s * 21.3, 0, 0);
  }
  ctx.spot(ctx.lootSpots, 0, 0.1, 0);
  ctx.spot(ctx.lootSpots, -10, 0.1, 5);
  ctx.spot(ctx.lootSpots, 10, 0.1, -5);
}

// ------------------------------------------------------------------ MUELLE
// Se extiende hacia +Z (el mar). deckLocal = altura local de la pasarela.
export function genPier(ctx, rng, o) {
  const L = o.length, w = 3, y = o.deckLocal;
  ctx.box(-w, y - 0.3, -2, w, y, L, 0x8a6a48);
  for (let z = 0; z <= L; z += 4) for (const x of [-w + 0.2, w - 0.2]) ctx.box(x - 0.2, y - 9, z - 0.2, x + 0.2, y - 0.3, z + 0.2, 0x5a4632);
  ctx.box(-w, y, 0, -w + 0.1, y + 1, L, 0x5a4632);
  ctx.box(w - 0.1, y, 0, w, y + 1, L, 0x5a4632);
  // Caseta al final
  ctx.box(-w - 3, y - 0.3, L, w + 3, y, L + 8, 0x8a6a48);
  for (const x of [-w - 2.8, w + 2.8]) for (const z of [L + 0.2, L + 7.8]) ctx.box(x - 0.2, y - 9, z - 0.2, x + 0.2, y - 0.3, z + 0.2, 0x5a4632);
  genShop(ctx.sub(0, L + 4.5, 2, y - BASE), rng, { W: 7, D: 6, sign: 0x2f6fd6, wallColor: 0xd9d2c0 });
  ctx.spot(ctx.ammoSpots, 2, y, L * 0.5, 0, 0);
}

// -------------------------------------------------------------------- GRÚA
export function genCrane(ctx) {
  ctx.box(-1, 0, -1, 1, 26, 1, 0xf2c230);
  for (let y = 2; y < 26; y += 2.5) ctx.box(-1.05, y, -1.05, 1.05, y + 0.15, 1.05, 0x333333, false);
  ctx.box(-1, 26, -6, 1, 27.5, 18, 0xf2c230);
  ctx.box(-1.5, 24, -7.5, 1.5, 27.5, -5, 0x666666);
  ctx.box(-0.05, 12, 15, 0.05, 26, 15.1, 0x222222, false);
  ctx.box(-1, 11, 14, 1, 12, 16, 0x444444, false);
}

// ------------------------------------------------------------------ RUINAS
export function genRuins(ctx, rng) {
  const hw = 6, hd = 4.5, t = 0.45, col = 0x9a958a;
  ctx.box(-hw - 0.3, -2, -hd - 0.3, hw + 0.3, 0.12, hd + 0.3, 0x7d7a72);
  const seg = (axis, a0, a1, c0, c1) => {
    for (let a = a0; a < a1; a += 2) {
      if (rng.chance(0.25)) continue;
      const h = rng.float(0.8, 3.2);
      const b = Math.min(a1, a + 2);
      if (axis === 'x') ctx.box(a, 0, c0, b, h, c1, col);
      else ctx.box(c0, 0, a, c1, h, b, col);
    }
  };
  seg('x', -hw, hw, hd - t, hd);
  seg('x', -hw, hw, -hd, -hd + t);
  seg('z', -hd, hd, -hw, -hw + t);
  seg('z', -hd, hd, hw - t, hw);
  for (let i = 0; i < 5; i++) {
    const x = rng.float(-hw + 1, hw - 1), z = rng.float(-hd + 1, hd - 1), s = rng.float(0.4, 0.9);
    ctx.box(x - s, 0, z - s, x + s, s * 0.8, z + s, 0x8a857a);
  }
  ctx.spot(ctx.chestSpots, 0, 0.12, 0, 0, 3);
}

// ------------------------------------------------------- PROPS DE PUEBLO
export function genFountain(ctx) {
  ctx.geometry(new THREE.CylinderGeometry(3.2, 3.4, 0.6, 20), 0xbdb6a6, 0, 0.3, 0);
  ctx.geometry(new THREE.CylinderGeometry(2.9, 2.9, 0.1, 20), 0x4aa3d8, 0, 0.5, 0);
  ctx.geometry(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 10), 0xbdb6a6, 0, 1.4, 0);
  ctx.geometry(new THREE.CylinderGeometry(1.2, 0.5, 0.4, 14), 0xbdb6a6, 0, 2.5, 0);
  ctx.colliderOnly(-2.6, 0, -2.6, 2.6, 0.6, 2.6);
  ctx.colliderOnly(-0.4, 0, -0.4, 0.4, 2.7, 0.4);
}

export function genLamp(ctx) {
  ctx.box(-0.08, 0, -0.08, 0.08, 5, 0.08, DARK);
  ctx.box(-0.05, 4.8, 0, 0.05, 4.9, 1.0, DARK, false);
  ctx.box(-0.2, 4.6, 0.8, 0.2, 4.8, 1.2, 0xfff1b0, false);
}

export function genBench(ctx) {
  ctx.box(-0.9, 0, -0.25, 0.9, 0.45, 0.25, WOOD);
  ctx.box(-0.9, 0.45, -0.3, 0.9, 0.95, -0.22, WOOD, false);
}

// Valla recta entre dos puntos alineados a un eje, con huecos [[a,b],...]
export function genFence(ctx, x0, z0, x1, z1, gaps = [], color = 0xd8d0c0) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const c = alongX ? z0 : x0;
  const pieces = [];
  let cur = a0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) {
    if (g0 > cur) pieces.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < a1) pieces.push([cur, a1]);
  for (const [p0, p1] of pieces) {
    const B = (q0, y0, q1, y1, collide) => {
      if (alongX) ctx.box(q0, y0, c - 0.06, q1, y1, c + 0.06, color, collide);
      else ctx.box(c - 0.06, y0, q0, c + 0.06, y1, q1, color, collide);
    };
    B(p0, 0.35, p1, 0.5, false);
    B(p0, 0.85, p1, 1.0, false);
    for (let a = p0; a <= p1 + 0.01; a += 2.5) B(a - 0.06, 0, Math.min(a + 0.06, p1 + 0.06), 1.15, false);
    if (alongX) ctx.colliderOnly(p0, 0, c - 0.06, p1, 1.1, c + 0.06);
    else ctx.colliderOnly(c - 0.06, 0, p0, c + 0.06, 1.1, p1);
  }
}

// ------------------------------------------------------------ MOLINO
// Torre de piedra con puerta, escalera de mano hasta el mirador y aspas.
export function genWindmill(ctx, rng) {
  const hw = 3.2, H = 11, t = 0.4, y0 = BASE;
  const stone = 0xd8cfbd;
  foundation(ctx, hw, hw, 0x9a958a);
  ctx.wall('x', -hw, hw, hw - t, hw, y0, H, [{ a: -0.8, b: 0.8, bottom: y0, top: y0 + 2.4 }], stone);
  ctx.wall('x', -hw, hw, -hw, -hw + t, y0, H, [{ a: -0.6, b: 0.6, bottom: 5, top: 6.2 }], stone);
  ctx.wall('z', -hw + t, hw - t, -hw, -hw + t, y0, H, [{ a: -0.6, b: 0.6, bottom: 5, top: 6.2 }], stone);
  ctx.wall('z', -hw + t, hw - t, hw - t, hw, y0, H, [], stone);
  // planta intermedia con hueco y mirador arriba
  ctx.slab(-hw + t, -hw + t, hw - t, hw - t, 5.3, 5.55, { x0: -hw + t, z0: -hw + t, x1: -hw + 1.6, z1: -hw + 1.6 }, WOOD);
  ctx.box(-hw - 0.6, H, -hw - 0.6, hw + 0.6, H + 0.3, hw + 0.6, WOOD);
  railing(ctx, hw + 0.6, hw + 0.6, H + 0.3, 0.7, WOOD);
  ctx.geometry(new THREE.ConeGeometry(hw * 1.25, 3.2, 4, 1).rotateY(Math.PI / 4), 0x8a3b32, 0, H + 3.2, 0);
  ctx.colliderOnly(-1.6, H + 1.6, -1.6, 1.6, H + 3.5, 1.6);
  ctx.ladderVisual(-hw + 0.9, -hw + 0.9 + 0.1, y0, 5.55, 'x');
  ctx.ladderVisual(-hw + 0.9, -hw + 0.9 + 0.1, 5.55, H + 0.3, 'x');
  // aspas (decorativas) en la fachada trasera
  const hub = ctx.sub(0, -hw - 0.5, 0, 0);
  hub.geometry(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 10).rotateX(Math.PI / 2), DARK, 0, 8.5, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + 0.4;
    const len = 6;
    const geo = new THREE.BoxGeometry(0.9, len, 0.12).translate(0, len / 2 + 0.4, 0).rotateZ(a);
    hub.geometry(geo, 0xf0eee8, 0, 8.5, -0.5);
  }
  ctx.spot(ctx.chestSpots, hw - t - 0.8, y0, -hw + t + 0.8, 0, 0);
  ctx.spot(ctx.chestSpots, 1.2, 5.55, 1.2, 0, 0);
  ctx.spot(ctx.chestSpots, hw - 0.4, H + 0.3, -hw + 0.4, 0, 0);
  ctx.spot(ctx.lootSpots, 0.5, y0, 0.5);
}

// ----------------------------------------------------------- CASTILLO
// Muralla con puerta, cuatro torres con escaleras, adarve y torre del
// homenaje de dos plantas en el centro.
export function genCastle(ctx, rng) {
  const hw = 13, H = 6, t = 1.0, y0 = BASE;
  const stone = 0x9e9a90, dark = 0x7d7a72;
  ctx.box(-hw - 0.5, -3, -hw - 0.5, hw + 0.5, y0, hw + 0.5, dark);
  // murallas (puerta en +Z)
  ctx.wall('x', -hw, hw, hw - t, hw, y0, H, [{ a: -2, b: 2, bottom: y0, top: y0 + 4 }], stone);
  ctx.wall('x', -hw, hw, -hw, -hw + t, y0, H, [], stone);
  ctx.wall('z', -hw + t, hw - t, -hw, -hw + t, y0, H, [], stone);
  ctx.wall('z', -hw + t, hw - t, hw - t, hw, y0, H, [], stone);
  // almenas
  for (let a = -hw; a < hw; a += 2) {
    ctx.box(a, H, hw - t, a + 1, H + 0.8, hw - t + 0.3, stone);
    ctx.box(a, H, -hw + t - 0.3, a + 1, H + 0.8, -hw + t, stone);
    ctx.box(-hw + t - 0.3, H, a, -hw + t, H + 0.8, a + 1, stone);
    ctx.box(hw - t, H, a, hw - t + 0.3, H + 0.8, a + 1, stone);
  }
  // adarve (pasarela interior sobre la muralla)
  ctx.box(-hw + t, H - 0.3, -hw + t, hw - t, H, -hw + t + 1.6, WOOD);
  ctx.box(-hw + t, H - 0.3, hw - t - 1.6, -2.2, H, hw - t, WOOD);
  ctx.box(2.2, H - 0.3, hw - t - 1.6, hw - t, H, hw - t, WOOD);
  ctx.box(-hw + t, H - 0.3, -hw + t, -hw + t + 1.6, H, hw - t, WOOD);
  ctx.box(hw - t - 1.6, H - 0.3, -hw + t, hw - t, H, hw - t, WOOD);
  // escaleras al adarve
  ctx.stairs(-hw + t + 1.6, -hw + t + 3.2, hw - t - 1.6, -1, y0, H - 0.3 - y0, 14, dark);
  ctx.stairs(hw - t - 3.2, hw - t - 1.6, -hw + t + 1.6, 1, y0, H - 0.3 - y0, 14, dark);
  // torres en las esquinas
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tw = ctx.sub(sx * (hw - 1.5), sz * (hw - 1.5));
    tw.box(-2.5, y0, -2.5, 2.5, H + 3.5, 2.5, stone);
    tw.box(-2.8, H + 3.5, -2.8, 2.8, H + 3.8, 2.8, dark);
    railing(tw, 2.8, 2.8, H + 3.8, 0.01, stone);
    tw.geometry(new THREE.ConeGeometry(2.4, 3, 8), 0x5a4a8a, 0, H + 7, 0);
    tw.colliderOnly(-1.2, H + 5.5, -1.2, 1.2, H + 8.5, 1.2);
    tw.box(-0.3, H + 8.4, -0.05, 0.3, H + 9.6, 0.05, 0xd63a2f, false);
    tw.ladderVisual(sx > 0 ? -2.6 : 2.6, 0, H, H + 3.8, 'z');
  }
  // torre del homenaje
  genHouse(ctx.sub(0, -4), rng, { W: 10, D: 9, floors: 2, roof: 'flat', roofAccess: true, wallColor: 0xb8b2a4 });
  // patio: barriles y carro
  for (let i = 0; i < 4; i++) ctx.geometry(new THREE.CylinderGeometry(0.45, 0.45, 1, 10), WOOD, -8 + i * 1.1, y0 + 0.5, 6.5);
  ctx.colliderOnly(-8.5, y0, 6, -4.2, y0 + 1, 7);
  ctx.box(5, y0, 5, 8, y0 + 1.1, 7, WOOD);
  ctx.spot(ctx.chestSpots, -hw + t + 1.0, H, -hw + t + 0.8, 0, 0);
  ctx.spot(ctx.chestSpots, hw - t - 1.0, H, hw - t - 0.8, 0, 0);
  ctx.spot(ctx.chestSpots, 6.5, y0, -hw + t + 0.8, 0, 0);
  ctx.spot(ctx.lootSpots, 0, y0, 6);
  ctx.spot(ctx.lootSpots, -6, y0, 0);
  ctx.spot(ctx.ammoSpots, 6.5, y0 + 1.1, 6, 0, 0);
}

// --------------------------------------------------------- MERCADILLO
// Puestos con toldos de colores, cajas y mostradores.
export function genMarket(ctx, rng) {
  const colors = [0xd63a2f, 0x2f6fd6, 0x2fa84f, 0xe0a020, 0x8a3fd6, 0x1fb5b0];
  ctx.box(-9, -0.5, -7, 9, 0.08, 7, 0xb9b09c, false);
  const stalls = [[-6, -3.5], [0, -3.5], [6, -3.5], [-6, 3.5], [0, 3.5], [6, 3.5]];
  stalls.forEach(([x, z], i) => {
    const s = ctx.sub(x, z, z < 0 ? 0 : 2);
    const c = colors[i % colors.length];
    for (const px of [-2, 2]) for (const pz of [-1.2, 1.2]) s.box(px - 0.08, 0, pz - 0.08, px + 0.08, 2.6, pz + 0.08, WOOD);
    s.box(-2.2, 2.6, -1.4, 2.2, 2.75, 1.4, c, false);
    s.box(-2.2, 2.4, 1.3, 2.2, 2.6, 1.5, WHITE, false);
    s.box(-1.8, 0, 0.3, 1.8, 1.0, 1.0, WOOD);
    s.box(-1.8, 1.0, 0.3, 1.8, 1.08, 1.0, 0xe8e2d4, false);
    if (rng.chance(0.6)) s.box(-1.5, 0, -1.0, -0.6, 0.8, -0.2, 0x8a6440);
    if (rng.chance(0.6)) s.box(0.6, 0, -1.0, 1.5, 0.8, -0.2, 0x8a6440);
  });
  ctx.spot(ctx.chestSpots, -6, 0.1, 0, 0, 3);
  ctx.spot(ctx.chestSpots, 6, 0.1, 0, 0, -3);
  ctx.spot(ctx.lootSpots, 0, 0.1, 0);
  ctx.spot(ctx.lootSpots, -3, 0.1, 0);
  ctx.spot(ctx.ammoSpots, 3, 0.1, 0, 0, 3);
}

// ------------------------------------------------------------- BÓVEDA
// Búnker blindado de la isla central. La puerta (en el hueco del frente,
// +Z) la gestiona game/vault.js: sólo se abre con la tarjeta del Guardián.
// Devuelve el hueco de la puerta en coordenadas del mundo.
export function genVault(ctx) {
  const W = 12, D = 10, H = 4.2, t = 0.6, hw = W / 2, hd = D / 2;
  const y0 = BASE, y1 = BASE + H;
  const wall = 0x6f747a, trim = 0xe0a020, black = 0x2a2c30;
  foundation(ctx, hw, hd, 0x55575c);
  const door = { a: -1.6, b: 1.6, bottom: y0, top: y0 + 3.0 };
  ctx.wall('x', -hw, hw, hd - t, hd, y0, y1, [door], wall);
  ctx.wall('x', -hw, hw, -hd, -hd + t, y0, y1, [], wall);
  ctx.wall('z', -hd + t, hd - t, -hw, -hw + t, y0, y1, [], wall);
  ctx.wall('z', -hd + t, hd - t, hw - t, hw, y0, y1, [], wall);
  ctx.box(-hw - 0.4, y1, -hd - 0.4, hw + 0.4, y1 + 0.7, hd + 0.4, 0x55575c);
  // Marco de la puerta con franjas de peligro
  ctx.box(-2.2, y0, hd - 0.05, -1.6, y0 + 3.6, hd + 0.35, black);
  ctx.box(1.6, y0, hd - 0.05, 2.2, y0 + 3.6, hd + 0.35, black);
  ctx.box(-2.2, y0 + 3.0, hd - 0.05, 2.2, y0 + 3.6, hd + 0.35, black);
  for (let i = 0; i < 6; i++) ctx.box(-2.15 + i * 0.75, y0 + 3.62, hd + 0.05, -1.85 + i * 0.75, y0 + 3.7, hd + 0.3, trim, false);
  // Lector de tarjetas junto a la puerta
  ctx.box(2.35, y0 + 1.2, hd, 2.75, y0 + 1.8, hd + 0.18, black);
  ctx.box(2.42, y0 + 1.5, hd + 0.17, 2.68, y0 + 1.7, hd + 0.2, 0xd63a2f, false);
  // Dentro: estanterías con lingotes y luces
  for (const x of [-hw + t + 0.4, hw - t - 1.2]) {
    ctx.box(x, y0, -hd + t + 1, x + 0.8, y0 + 2.2, hd - t - 2, 0x3a3d42);
    for (let k = 0; k < 3; k++) {
      const z = -hd + t + 1.5 + k * 1.8;
      ctx.box(x + 0.1, y0 + 1.0, z, x + 0.7, y0 + 1.25, z + 0.9, trim, false);
      ctx.box(x + 0.1, y0 + 1.9, z, x + 0.7, y0 + 2.15, z + 0.9, trim, false);
    }
  }
  for (const x of [-3, 3]) ctx.box(x - 0.4, y1 - 0.12, -0.4, x + 0.4, y1, 0.4, 0xfff1b0, false);
  ctx.spot(ctx.chestSpots, -3, y0, -hd + t + 0.8, -3, 0);
  ctx.spot(ctx.chestSpots, 0, y0, -hd + t + 0.8, 0, 0);
  ctx.spot(ctx.chestSpots, 3, y0, -hd + t + 0.8, 3, 0);
  // Sacos terreros delante
  genSandbags(ctx, -6, hd + 4, -3, hd + 4.6);
  genSandbags(ctx, 3, hd + 4, 6, hd + 4.6);
  const a = ctx.tp(-1.6, y0, hd - t), b = ctx.tp(1.6, door.top, hd);
  const out = ctx.tp(0, y0, hd + 3);
  return {
    minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[2], b[2]), maxZ: Math.max(a[2], b[2]),
    y0: a[1], y1: b[1], alongX: ctx.rot % 2 === 0, front: { x: out[0], z: out[2] },
  };
}
