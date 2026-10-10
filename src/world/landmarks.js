import * as THREE from 'three';
import { GeoBuilder } from './geobuilder.js';
import { genHouse } from './buildings.js';
import { Site, CELL, SOLID, OPEN, ROOM, RAMP } from './underground.js';
import { ISLAND_RADIUS, HALF } from './constants.js';
import { usesPBR, isMobileQuality } from '../game/models.js';

// Lugares únicos del mapa (estilo Fortnite): Feria Feliz, Templo Olvidado,
// Observatorio Estelar, Mina del Eco y Villa Millonaria. Aquí está su
// colocación en la isla, el reparto de piezas dentro de cada zona y los
// generadores (BuildingCtx, coordenadas locales con el frente hacia +Z).
// Lo que no cabe en el material de los edificios (cristal, agua de las
// piscinas, bombillas, carteles con texto y atracciones que giran) va en
// mallas aparte por zona, con su distancia de dibujado (LodSet).

// ------------------------------------------------------------ COLORES
// (los que tienen dibujo en geobuilder.js: tablones, piedra, metal…)
const WOOD = 0x8a6440, WOOD_D = 0x6b4a2b, WOOD_L = 0x9c7650, TIMBER = 0x7a5a38, PLANK = 0x8a5a32;
const STONE = 0x9a958a, STONE_D = 0x8a857a, STONE_L = 0xd8cfbd, STONE_G = 0x9e9a90;
const CONC = 0xbdb6a6, CONC_L = 0xc9c2b2, CONC_D = 0x8f8f8f, CONC_G = 0x9a9ea6;
const STEEL = 0x8a8f96, STEEL_L = 0xe8e8e8, STEEL_W = 0xbfbfbf, DARK = 0x3a3d42, BLACK = 0x2a2c30;
const WHITE = 0xf3f1ec, RED = 0xd8322a, YEL = 0xf6c22c, BLUE = 0x2f7de1, PURP = 0x8a3fd6, TEAL = 0x2fb5a8, PINK = 0xff7ab8, ORANGE = 0xf08a24;
const GOLD = 0xd9b44a, MOSS = 0x5d7d36, MOSS_D = 0x4a6a2a, LEAF = [0x2f6b2a, 0x3a7d32, 0x2a5e26, 0x4a8a3a, 0x356f2c];
const GLASS = 0x9fd8f0;
const BULBS = [0xffd34d, 0xff5a5a, 0x5ad1ff, 0x9dff6b, 0xff8de0, 0xffffff];

export const LANDMARK_KINDS = {
  // (se pican y se rompen como las casas; el resto son monumentos)
  destructible: ['fairbooth', 'templehut', 'obslab', 'mineshed', 'hoist', 'scaffold', 'tipple', 'mansion', 'garage', 'hedge', 'cabana'],
};

// Rotación (múltiplo de 90°) que hace mirar la puerta (+Z local) hacia (dx, dz).
function rotFacing(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 3 : 1;
  return dz > 0 ? 0 : 2;
}

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------------------------------------ GEOMETRÍA
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const GEO = {};
function geo(name) {
  if (GEO[name]) return GEO[name];
  let g;
  const n = parseInt(name.replace(/\D+/g, ''), 10) || 8;
  if (name === 'box') g = new THREE.BoxGeometry(1, 1, 1);
  else if (name.startsWith('rod')) g = new THREE.CylinderGeometry(1, 1, 1, n, 1, true).rotateX(Math.PI / 2); // eje Z, sin tapas
  else if (name.startsWith('disc')) g = new THREE.CylinderGeometry(1, 1, 1, n).rotateX(Math.PI / 2); // eje Z, con tapas
  else if (name.startsWith('cyl')) g = new THREE.CylinderGeometry(1, 1, 1, n);
  else if (name.startsWith('trunk')) g = new THREE.CylinderGeometry(0.62, 1, 1, n);
  else if (name.startsWith('cone')) g = new THREE.ConeGeometry(1, 1, n);
  else if (name === 'ico0') g = new THREE.IcosahedronGeometry(1, 0);
  else if (name === 'ico1') g = new THREE.IcosahedronGeometry(1, 1);
  else if (name.startsWith('sph')) g = new THREE.SphereGeometry(1, n, Math.max(4, n >> 1));
  else if (name.startsWith('hemi')) g = new THREE.SphereGeometry(1, n, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  else if (name === 'torus') g = new THREE.TorusGeometry(1, 0.28, 6, 16);
  return (GEO[name] = g);
}

// Matriz local: posición, giro (Euler YXZ) y escala.
function M(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );
}

// Matriz que estira una pieza de eje Z (caja o 'rod') entre dos puntos.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _sc = new THREE.Vector3();
function seg(a, b, sx, sy) {
  _a.set(a[0], a[1], a[2]);
  _b.set(b[0], b[1], b[2]);
  const L = Math.max(1e-3, _a.distanceTo(_b));
  _d.subVectors(_b, _a).normalize();
  const m = new THREE.Matrix4().lookAt(_a, _b, Math.abs(_d.y) > 0.98 ? X_AXIS : UP);
  m.scale(_sc.set(sx, sy, L));
  m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return m;
}

// Matriz local -> mundo de un BuildingCtx.
function worldMat(ctx) {
  const p = ctx.tp(0, 0, 0);
  return new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromAxisAngle(UP, ctx.yaw(0)), new THREE.Vector3(1, 1, 1));
}

// Destino de la geometría con la misma interfaz para un edificio (BuildingCtx,
// los detalles se pegan a la pieza destructible que tocan) o para un
// GeoBuilder suelto (piezas que giran, en coordenadas de su pivote).
const _tm = new THREE.Matrix4();
function sinkCtx(ctx) {
  const W = worldMat(ctx);
  return {
    put(g, hex, m) {
      const t0 = ctx.geo.own.length;
      ctx.geo.geometry(g, hex, _tm.multiplyMatrices(W, m));
      ctx.dest?.decorFrom(t0);
    },
    box(x0, y0, z0, x1, y1, z1, hex) {
      ctx.box(x0, y0, z0, x1, y1, z1, hex, false);
    },
    poly(v, hex, inside) {
      ctx.poly(v, hex, inside);
    },
  };
}
function sinkGeo(gb) {
  return {
    put: (g, hex, m) => gb.geometry(g, hex, m),
    box: (x0, y0, z0, x1, y1, z1, hex) => gb.box(x0, y0, z0, x1, y1, z1, hex, 0.04),
    poly: (v, hex, inside) => gb.poly(v, hex, inside),
  };
}

const rod = (S, a, b, r, hex, n = 6) => S.put(geo('rod' + n), hex, seg(a, b, r, r));
const beam = (S, a, b, w, h, hex) => S.put(geo('box'), hex, seg(a, b, w, h));
const cyl = (S, x, y, z, r, h, hex, n = 12) => S.put(geo('cyl' + n), hex, M(x, y + h / 2, z, 0, 0, 0, r, h, r));
const cone = (S, x, y, z, r, h, hex, n = 8) => S.put(geo('cone' + n), hex, M(x, y + h / 2, z, 0, 0, 0, r, h, r));
const ball = (S, x, y, z, r, hex, n = 8) => S.put(geo('sph' + n), hex, M(x, y, z, 0, 0, 0, r, r, r));
const blob = (S, x, y, z, sx, sy, sz, hex, ry = 0) => S.put(geo('ico0'), hex, M(x, y, z, 0, ry, 0, sx, sy, sz));
// Polígono de dos caras (hojas, toldos, banderines).
function poly2(S, v, hex, hex2 = hex) {
  const c = v.reduce((s, p) => [s[0] + p[0] / v.length, s[1] + p[1] / v.length, s[2] + p[2] / v.length], [0, 0, 0]);
  _a.set(v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]);
  _b.set(v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]);
  _d.crossVectors(_a, _b).normalize().multiplyScalar(0.05);
  S.poly(v, hex, [c[0] - _d.x, c[1] - _d.y, c[2] - _d.z]);
  S.poly(v, hex2, [c[0] + _d.x, c[1] + _d.y, c[2] + _d.z]);
}

// Bombillas y llamas (sin iluminar, más brillantes que 1: el bloom de la
// calidad alta las hace resplandecer).
function glowPut(ctx, g, hex, m, boost = 2) {
  const gb = ctx.fx.glow;
  const n0 = gb.col.length;
  gb.geometry(g, hex, worldMat(ctx).multiply(m));
  if (boost !== 1) for (let i = n0; i < gb.col.length; i++) gb.col[i] *= boost;
}
function glowBox(ctx, x0, y0, z0, x1, y1, z1, hex, boost = 2) {
  const a = ctx.tp(x0, y0, z0), b = ctx.tp(x1, y1, z1);
  const gb = ctx.fx.glow;
  const n0 = gb.col.length;
  gb.box(Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2]), Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2]), hex, 0);
  if (boost !== 1) for (let i = n0; i < gb.col.length; i++) gb.col[i] *= boost;
}
const bulb = (ctx, x, y, z, hex, s = 0.1) => glowBox(ctx, x - s, y - s, z - s, x + s, y + s, z + s, hex);

// Cristal (malla transparente aparte). Si el edificio es destructible, cada
// hoja es una pieza más que se rompe (sus triángulos se colapsan con ella).
function glassBox(ctx, x0, y0, z0, x1, y1, z1, collide = true, hex = GLASS) {
  const a = ctx.tp(x0, y0, z0), b = ctx.tp(x1, y1, z1);
  const bb = [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2]), Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2])];
  const piece = collide && ctx.dest ? ctx.dest.add(bb, hex) : null;
  if (piece) {
    piece.hp = piece.maxHp = 60;
    piece.mat = 'metal';
  }
  const G = ctx.fx.glass;
  G.owner = piece ? piece.id : -1;
  G.box(bb[0], bb[1], bb[2], bb[3], bb[4], bb[5], hex, 0);
  G.owner = -1;
  if (collide) {
    const c = ctx.collision.add(bb[0], bb[1], bb[2], bb[3], bb[4], bb[5], piece ? { type: 'building', ref: piece } : { type: 'building' });
    if (piece) piece.colliders.push(c);
  }
}

// Lámina de agua (piscinas, estanques) a la altura local y.
function waterRect(ctx, x0, z0, x1, z1, y, hex = 0x1f9fd0) {
  const a = ctx.tp(x0, y, z0), b = ctx.tp(x1, y, z1);
  const X0 = Math.min(a[0], b[0]), X1 = Math.max(a[0], b[0]), Z0 = Math.min(a[2], b[2]), Z1 = Math.max(a[2], b[2]);
  ctx.fx.water.poly([[X0, a[1], Z0], [X1, a[1], Z0], [X1, a[1], Z1], [X0, a[1], Z1]], hex, [(X0 + X1) / 2, a[1] - 1, (Z0 + Z1) / 2], 0, 0);
}

// Cartel con texto en el plano z local (mirando a +z).
function sign(ctx, text, style, x0, y0, x1, y1, z) {
  const v = [ctx.tp(x0, y0, z), ctx.tp(x1, y0, z), ctx.tp(x1, y1, z), ctx.tp(x0, y1, z)];
  ctx.fx.signs.push({ text, style, v, aspect: (x1 - x0) / (y1 - y0) });
}

// Muro circular para las colisiones (cajas pequeñas a lo largo del arco).
// gaps: [[ángulo, semiancho]] (ángulo 0 = +z local).
function ringWall(ctx, cx, cz, r, y0, y1, gaps = [], th = 0.5) {
  const n = Math.ceil((Math.PI * 2 * r) / 0.9);
  const half = (Math.PI * r) / n + 0.02;
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * Math.PI * 2;
    if (gaps.some(([g, w]) => Math.abs(angDiff(a, g)) < w)) continue;
    const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
    const hx = Math.abs(Math.cos(a)) * half + Math.abs(Math.sin(a)) * th * 0.5;
    const hz = Math.abs(Math.sin(a)) * half + Math.abs(Math.cos(a)) * th * 0.5;
    ctx.colliderOnly(x - hx, y0, z - hz, x + hx, y1, z + hz);
  }
}

// Resta huecos (cajas) a una caja: devuelve las cajas que quedan.
function subtract(box, holes) {
  let parts = [box];
  for (const h of holes) {
    const next = [];
    for (const b of parts) {
      if (h[0] >= b[3] || h[3] <= b[0] || h[1] >= b[4] || h[4] <= b[1] || h[2] >= b[5] || h[5] <= b[2]) {
        next.push(b);
        continue;
      }
      const [x0, y0, z0, x1, y1, z1] = b;
      const hx0 = Math.max(x0, h[0]), hx1 = Math.min(x1, h[3]);
      const hy0 = Math.max(y0, h[1]), hy1 = Math.min(y1, h[4]);
      const hz0 = Math.max(z0, h[2]), hz1 = Math.min(z1, h[5]);
      if (hx0 > x0) next.push([x0, y0, z0, hx0, y1, z1]);
      if (hx1 < x1) next.push([hx1, y0, z0, x1, y1, z1]);
      if (hy0 > y0) next.push([hx0, y0, z0, hx1, hy0, z1]);
      if (hy1 < y1) next.push([hx0, hy1, z0, hx1, y1, z1]);
      if (hz0 > z0) next.push([hx0, hy0, z0, hx1, hy1, hz0]);
      if (hz1 < z1) next.push([hx0, hy0, hz1, hx1, hy1, z1]);
    }
    parts = next;
  }
  return parts;
}

// Barandilla de postes y pasamanos (sin colisión salvo `solid`).
function railing(ctx, S, x0, z0, x1, z1, y, hex = DARK, solid = true, h = 1.05) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.4));
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
    S.box(x - 0.05, y, z - 0.05, x + 0.05, y + h, z + 0.05, hex);
  }
  beam(S, [x0, y + h, z0], [x1, y + h, z1], 0.09, 0.09, hex);
  beam(S, [x0, y + h * 0.5, z0], [x1, y + h * 0.5, z1], 0.05, 0.05, hex);
  if (solid) ctx.colliderOnly(Math.min(x0, x1) - 0.05, y, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, y + h, Math.max(z0, z1) + 0.05);
}

// ------------------------------------------------------------ EFECTOS
let glowMat = null, glassMat = null, waterMat = null;
function materials() {
  if (glowMat) return;
  glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  glassMat = usesPBR()
    ? new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.34, roughness: 0.05, metalness: 0.55, envMapIntensity: 1.4, depthWrite: false })
    : new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.42, shininess: 110, specular: 0x777777, depthWrite: false });
  // Agua de piscina: ondas, cáusticas, reflejo del cielo y brillo del sol
  waterMat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    vertexColors: true,
    depthWrite: false,
    defines: isMobileQuality() ? { LITE: '' } : {},
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, sunDir: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      varying vec3 vC;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vC = color;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float time;
      uniform vec3 sunDir;
      varying vec3 vW;
      varying vec3 vC;
      float wv(vec2 p) {
        float h = sin(p.x * 1.7 + time * 1.6) * 0.5 + sin(p.y * 2.3 - time * 1.3) * 0.4;
      #ifndef LITE
        h += sin((p.x + p.y) * 3.9 + time * 2.2) * 0.22 + sin((p.x - p.y) * 5.3 - time * 2.7) * 0.12;
      #endif
        return h * 0.06;
      }
      void main() {
        vec2 p = vW.xz;
        float e = 0.12;
        float h0 = wv(p);
        vec3 n = normalize(vec3(h0 - wv(p + vec2(e, 0.0)), e, h0 - wv(p + vec2(0.0, e))));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col = vC;
        // Cáusticas: redes de luz que se mueven por el fondo
        float c = sin(p.x * 2.6 + sin(p.y * 1.9 + time * 0.9) * 1.4 + time * 1.1) * sin(p.y * 2.9 + sin(p.x * 1.6 - time * 0.8) * 1.4 - time);
        col += vec3(0.25, 0.4, 0.42) * smoothstep(0.55, 1.0, c);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(vec3(0.8, 0.9, 1.0), vec3(0.35, 0.6, 0.95), clamp(R.y, 0.0, 1.0));
        col = mix(col, sky, 0.1 + fres * 0.6);
        col += vec3(1.0, 0.95, 0.85) * pow(max(dot(R, sunDir), 0.0), 140.0) * 2.5;
        gl_FragColor = vec4(col, 0.72 + fres * 0.25);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// Reloj de las animaciones: el tiempo del juego (el mismo del agua).
function clockOf(world) {
  return () => world.water?.material?.uniforms?.time?.value ?? performance.now() / 1000;
}

// Material de los modelos que se mueven (cabinas, vagones): color por vértice.
function movingMat() {
  return usesPBR() ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
}

// Una pieza animada (grupo): a la escena y a la distancia de dibujado.
function addAnimated(ctx, group, r) {
  const w = ctx.fx.world;
  w.scene.add(group);
  w.lod.add(group, 'building', group.position.x, group.position.z, r);
}

// Atlas de carteles: cada cartel ocupa una franja de 1024×128.
function drawSign(g, s, y, W, Hh) {
  const pad = 8;
  const st = s.style;
  const bg = {
    fair: ['#e8322a', '#ff8a1c', '#ffd34d'], mine: ['#7a4a24', '#5a3416', '#d9b06a'], mansion: ['#141414', '#262626', '#e7c46a'],
    obs: ['#0d1f4a', '#1d3f8a', '#ffffff'], ride: ['#2f7de1', '#8a3fd6', '#ffffff'], temple: ['#6b6556', '#4f4a3e', '#e8dcb0'],
  }[st] || ['#333', '#111', '#fff'];
  const gr = g.createLinearGradient(0, y, 0, y + Hh);
  gr.addColorStop(0, bg[0]);
  gr.addColorStop(1, bg[1]);
  g.fillStyle = gr;
  g.fillRect(0, y, W, Hh);
  if (st === 'mine') {
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.moveTo(0, y + (Hh * k) / 4);
      g.lineTo(W, y + (Hh * k) / 4);
      g.stroke();
    }
  }
  if (st === 'obs') {
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 40; k++) g.fillRect(((k * 97) % W), y + ((k * 53) % Hh), 2, 2);
  }
  g.strokeStyle = bg[2];
  g.lineWidth = 7;
  g.strokeRect(pad, y + pad, W - pad * 2, Hh - pad * 2);
  if (st === 'fair' || st === 'ride') {
    g.fillStyle = '#fff6b0';
    for (let x = 22; x < W - 10; x += 34) {
      g.beginPath();
      g.arc(x, y + 16, 5, 0, Math.PI * 2);
      g.arc(x, y + Hh - 16, 5, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const font = st === 'mansion' ? 'Georgia, "Times New Roman", serif' : '"Lilita One", "Arial Black", sans-serif';
  let size = Hh * 0.62;
  g.font = `bold ${size}px ${font}`;
  const maxW = W - pad * 6;
  const tw = g.measureText(s.text).width;
  if (tw > maxW) size *= maxW / tw;
  g.font = `bold ${size}px ${font}`;
  g.lineJoin = 'round';
  g.lineWidth = Math.max(4, size * 0.14);
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.strokeText(s.text, W / 2, y + Hh / 2 + 3);
  g.fillStyle = bg[2];
  g.fillText(s.text, W / 2, y + Hh / 2 + 3);
}

function buildSigns(list) {
  const rows = list.length;
  const H = 128 * rows;
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = H;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    const g = cv.getContext('2d');
    list.forEach((s, i) => {
      const w = Math.min(1024, Math.round(128 * s.aspect));
      s.uw = w / 1024;
      drawSign(g, s, i * 128, w, 128);
    });
    tex.needsUpdate = true;
  };
  draw();
  // (con la fuente del juego ya cargada se vuelve a dibujar)
  document.fonts?.ready?.then(draw).catch(() => {});
  const pos = [], uv = [];
  list.forEach((s, i) => {
    const v0 = 1 - ((i + 1) * 128) / H, v1 = 1 - (i * 128) / H;
    const u1 = Math.min(1, s.aspect * 128 / 1024);
    const [bl, br, tr, tl] = s.v;
    for (const [p, t] of [[bl, [0, v0]], [br, [u1, v0]], [tr, [u1, v1]], [bl, [0, v0]], [tr, [u1, v1]], [tl, [0, v1]]]) {
      pos.push(p[0], p[1], p[2]);
      uv.push(t[0], t[1]);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, color: 0xf2f2f2 }));
  m.matrixAutoUpdate = false;
  return m;
}

// Mallas extra (cristal, agua, bombillas, carteles), una tanda por zona.
export class LandmarkFx {
  constructor(world) {
    this.world = world;
    this.buckets = new Map();
    materials();
  }

  bucket(poi, x, z) {
    const key = poi ? poi.name : `${Math.round(x / 160)},${Math.round(z / 160)}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = {
        world: this.world, glow: new GeoBuilder(), glass: new GeoBuilder(), water: new GeoBuilder(), signs: [],
        x: poi ? poi.x : x, z: poi ? poi.z : z, r: poi ? poi.radius * 1.3 : 90,
      };
      this.buckets.set(key, b);
    }
    return b;
  }

  finish() {
    const w = this.world;
    const add = (mesh, b, name) => {
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      w.scene.add(mesh);
      w.lod.add(mesh, 'building', b.x, b.z, b.r);
      return mesh;
    };
    const clock = clockOf(w);
    for (const b of this.buckets.values()) {
      if (b.glow.pos.length) {
        const m = add(b.glow.build(glowMat), b, 'landmark-glow');
        m.castShadow = m.receiveShadow = false;
      }
      if (b.glass.pos.length) {
        const m = add(b.glass.build(glassMat), b, 'landmark-glass');
        m.castShadow = m.receiveShadow = false;
        m.renderOrder = 2;
        // Hojas de cristal destructibles: sus triángulos van con su pieza
        const own = b.glass.own;
        let cur = null;
        for (let t = 0; t < own.length; t++) {
          const o = own[t];
          if (o < 0) {
            cur = null;
            continue;
          }
          if (cur && cur.owner === o && cur.start + cur.count === t * 3) cur.count += 3;
          else {
            cur = { owner: o, mesh: m, start: t * 3, count: 3 };
            w.destructibles[o]?.ranges.push(cur);
          }
        }
      }
      if (b.water.pos.length) {
        const m = add(b.water.build(waterMat), b, 'landmark-water');
        m.castShadow = m.receiveShadow = false;
        m.renderOrder = 1;
        m.onBeforeRender = () => {
          waterMat.uniforms.time.value = clock();
        };
      }
      if (b.signs.length) add(buildSigns(b.signs), b, 'landmark-signs');
    }
  }
}

// ------------------------------------------------------------ COLOCACIÓN
// Sitio para un lugar único en los huecos que dejan las demás zonas. Entre
// varios candidatos válidos se queda con el que mejor le va a cada uno
// (la mina, entre colinas; el templo, en la selva; la mansión, con vistas…).
// El observatorio busca la cima libre más alta.
export function findSpecialSpot(world, spec, rng) {
  const t = world.terrain, H = world.hydro;
  const clearance = (x, z, r) => {
    let c = Infinity;
    for (const p of world.pois) c = Math.min(c, Math.hypot(p.x - x, p.z - z) - p.radius - r);
    return c;
  };
  const ring = (x, z, r, n = 12) => {
    let min = Infinity, max = -Infinity, sum = 0;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const h = t.rawHeight(x + Math.cos(a) * r, z + Math.sin(a) * r);
      min = Math.min(min, h);
      max = Math.max(max, h);
      sum += h;
    }
    return { min, max, avg: sum / n };
  };
  if (spec.high) {
    let best = null;
    const fr = spec.flatR * 0.85;
    for (let i = 0; i < 3500; i++) {
      const [x, z] = world.randomLand(rng, ISLAND_RADIUS * 0.8);
      const h = t.rawHeight(x, z);
      if (h < 32 || h > 92) continue;
      if (clearance(x, z, spec.radius) < 6) continue;
      if (H.distanceTo(x, z) < spec.radius + 15) continue;
      const a = ring(x, z, fr), b = ring(x, z, fr * 0.5, 8);
      const lo = Math.min(a.min, b.min, h), hi = Math.max(a.max, b.max, h);
      if (hi - lo > 26) continue;
      const height = (a.avg * 2 + b.avg + h) / 4;
      const out = ring(x, z, spec.flatR * 1.9, 10);
      const score = height - (hi - lo) * 0.6 + Math.min(20, height - out.avg) * 0.8;
      if (!best || score > best.score) best = { x, z, height, score, radius: spec.radius };
    }
    if (best) return best;
  }
  const r0 = spec.radius;
  const score = (c) => {
    const { x, z, height } = c;
    const rg = ring(x, z, r0 * 0.8);
    let s = -(rg.max - rg.min) * 0.35 + Math.min(30, clearance(x, z, r0)) * 0.25;
    if (spec.type === 'mine') s += Math.max(-5, Math.min(18, ring(x, z, r0 * 1.7).avg - height)) * 1.0;
    else if (spec.type === 'temple') s += world.noise(x * 0.006 + 300, z * 0.006) * 22;
    else if (spec.type === 'fair') s -= Math.hypot(x, z) * 0.02;
    else if (spec.type === 'mansion') s += Math.min(40, height) * 0.2;
    return s;
  };
  const cands = [];
  for (let attempt = 0; attempt < 2600 && cands.length < 8; attempt++) {
    const [x, z] = world.randomLand(rng, ISLAND_RADIUS * (attempt < 1300 ? 0.78 : 0.84));
    const gap = attempt < 700 ? 18 : attempt < 1600 ? 9 : 3;
    if (clearance(x, z, r0) < gap) continue;
    if (H.distanceTo(x, z) < r0 * (attempt < 1300 ? 1.15 : 1.0) + 10) continue;
    const f = world.isFlatEnough(x, z, r0 * 0.9, attempt < 900 ? 16 : attempt < 1800 ? 26 : 36);
    if (!f.ok || f.avg > (attempt < 1300 ? 42 : 50)) continue;
    cands.push({ x, z, height: Math.max(3.5, f.avg), radius: r0 });
  }
  if (cands.length) {
    let best = cands[0], bs = -Infinity;
    for (const c of cands) {
      const s = score(c);
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    return best;
  }
  // Último recurso: barrido en rejilla, achicando la zona si hace falta
  for (let r = r0; r >= 40; r -= 4) {
    let best = null;
    for (let gx = -ISLAND_RADIUS; gx <= ISLAND_RADIUS; gx += 8) {
      for (let gz = -ISLAND_RADIUS; gz <= ISLAND_RADIUS; gz += 8) {
        if (Math.hypot(gx, gz) > ISLAND_RADIUS * 0.86) continue;
        const c = clearance(gx, gz, r);
        if (c < 2 || H.distanceTo(gx, gz) < r + 6) continue;
        const f = world.isFlatEnough(gx, gz, r * 0.9, 48);
        if (!f.ok || f.avg > 56) continue;
        const s = Math.min(20, c) - (f.avg - f.min) * 0.3;
        if (!best || s > best.s) best = { x: gx, z: gz, height: Math.max(3.5, f.avg), radius: r, s };
      }
    }
    if (best) return best;
  }
  return null;
}

// ------------------------------------------------------------ REPARTO
// Planos de cada lugar. at(u, v): u a lo largo del eje de la zona.
export function layoutSpecialPOI(w, poi, rng, at) {
  const A = poi.axis;
  const L = {
    w, poi, rng, at, A, R: poi.radius * 0.9,
    du: (s) => (A === 'x' ? [s, 0] : [0, s]),
    dv: (s) => (A === 'x' ? [0, s] : [s, 0]),
    // giro para que el frente (+Z local) mire en la dirección (du, dv)
    face: (du, dv) => (A === 'x' ? rotFacing(du, dv) : rotFacing(dv, du)),
    put(kind, u, v, rot, W, D, extra = {}, margin = 1.5) {
      const [x, z] = this.at(u, v);
      const p = w.plan(kind, x, z, rot, W, D, { poi, ...extra });
      return w.tryPlan(p, margin) ? p : null;
    },
    // Calle recta a lo largo de u (de u0 a u1) con puerta en u0.
    path(u0, u1, v, width = 6) {
      const pts = [];
      const n = Math.max(1, Math.round(Math.abs(u1 - u0) / 6));
      for (let k = 0; k <= n; k++) pts.push(this.at(u0 + ((u1 - u0) * k) / n, v));
      w.roads.add(pts, width, 'street');
      poi.gates.push({ x: pts[0][0], z: pts[0][1], dir: this.du(Math.sign(u0)), poi });
    },
  };
  switch (poi.type) {
    case 'fair': layoutFair(L); break;
    case 'temple': layoutTemple(L); break;
    case 'observatory': layoutObservatory(L); break;
    case 'mine': layoutMine(L); break;
    case 'mansion': layoutMansion(L); break;
  }
}

function layoutFair(L) {
  const { w, poi, rng, R } = L;
  w.gatesFrom(poi, w.street(poi, L.A, 0, R, 8));
  // Arco de entrada sobre la calle, mirando hacia fuera
  L.put('fairarch', -R + 13, 0, L.face(-1, 0), 22, 3, { onRoad: true, chests: 1, chestChance: 0.6 }, 0.3);
  L.put('ferriswheel', 16, 25, L.face(0, -1), 20, 10, { chests: 1, chestChance: 0.8 }, 1);
  L.put('coaster', -6, -26, L.face(0, 1), 44, 20, { chests: 2, chestChance: 0.85 }, 1);
  L.put('carousel', -25, 22, L.face(0, -1), 14, 14, { chests: 1, chestChance: 0.7 }, 1);
  L.put('bigtop', 29, -25, L.face(0, 1), 19, 19, { chests: 2, chestChance: 0.9 }, 1);
  L.put('bumpers', 33, 11, L.face(0, -1), 12, 9, { chests: 1, chestChance: 0.7 }, 1);
  const goods = rng.shuffle(['icecream', 'hotdog', 'popcorn', 'prizes', 'soda', 'candy']);
  let k = 0;
  for (const u of [-14, -2, 10]) {
    for (const s of [-1, 1]) L.put('fairbooth', u, s * 9.5, L.face(0, -s), 4.4, 3.6, { goods: goods[k++ % goods.length], chests: 1, chestChance: 0.45 }, 0.6);
  }
  // Farolas con guirnaldas de bombillas a lo largo del paseo
  const poles = [];
  for (let u = -R + 20; u <= R - 9; u += 11) {
    const pair = [L.at(u, -4.9), L.at(u, 4.9)];
    if (pair.some(([x, z]) => w.occupied(x, z, 0.5))) continue;
    poles.push(pair);
  }
  w.plans.push({ kind: 'fairlights', x: poi.x, z: poi.z, rot: 0, fw: 0, fd: 0, poi, noMap: true, poles });
  for (const s of [-1, 1]) w.addCar(...L.at(-R + 4, s * 7), L.A === 'x' ? Math.PI / 2 : 0, false);
}

function layoutTemple(L) {
  const { w, poi, rng, R } = L;
  // Caminos de tierra hasta la pirámide (delante y detrás)
  L.path(-R, -27, 0, 6);
  L.path(R, 19, 0, 6);
  L.put('pyramid', -4, 0, L.face(-1, 0), 28, 36, { chests: 3, chestChance: 1 }, 0.5);
  // Avenida de columnas rotas, cabezas colosales y estanques
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const h = rng.float(1.4, 6.6);
      L.put('column', -44 + i * 5.5, s * 6.2, 0, 1.8, 1.8, { h, broken: h < 5.6 || rng.chance(0.3) }, 0.3);
    }
  }
  for (const s of [-1, 1]) {
    L.put('idol', -28, s * 13, L.face(0, -s), 5, 5, {}, 0.5);
    L.put('templepool', -38, s * 16, L.face(0, -s), 8, 4.5, {}, 0.5);
    L.put('templehut', 4, s * 28, L.face(0, -s), 10, 8, { chests: 1, chestChance: 0.9 }, 1);
    L.put('stela', 20, s * 19, L.face(0, -s), 2, 2, { chests: 1, chestChance: 0.35 }, 0.5);
    L.put('stela', -13, s * 20, L.face(0, -s), 2, 2, {}, 0.5);
  }
  // Selva: árboles gigantes, palmeras, helechos y arbustos
  const trees = [];
  for (let i = 0; i < 1400 && trees.length < 70; i++) {
    const a = rng.float(0, Math.PI * 2), d = Math.sqrt(rng.float(0.1, 1)) * poi.radius;
    const x = poi.x + Math.cos(a) * d, z = poi.z + Math.sin(a) * d;
    const big = rng.chance(0.55);
    const r = big ? 1.6 : 0.9;
    const kind = big ? (rng.chance(0.3) ? 'palm' : 'tree') : rng.chance(0.55) ? 'fern' : 'bush';
    const s = rng.float(0.8, 1.25), rot = rng.float(0, Math.PI * 2);
    if (!w.free(x - r, z - r, x + r, z + r)) continue;
    if (w.roads.edgeDistance(x, z, 12) < (big ? 2.5 : 1)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < (big && t.big ? 6 : 3))) continue;
    trees.push({ x, z, kind, s, rot, big });
    if (big) w.occ.add(x - 0.6, z - 0.6, x + 0.6, z + 0.6, { tree: true });
  }
  w.plans.push({ kind: 'jungle', x: poi.x, z: poi.z, rot: 0, fw: 0, fd: 0, poi, noMap: true, trees });
}

function layoutObservatory(L) {
  const { w, poi } = L;
  // Calle de acceso hacia la zona más cercana (por ahí baja el camino)
  let best = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let near = Infinity;
    for (const q of w.pois) if (q !== poi) near = Math.min(near, Math.hypot(q.x - (poi.x + dx * 40), q.z - (poi.z + dz * 40)));
    const drop = poi.height - w.terrain.rawHeight(poi.x + dx * 45, poi.z + dz * 45);
    const s = near * 0.05 + Math.max(0, drop) * 0.6;
    if (!best || s < best.s) best = { dx, dz, s };
  }
  const { dx, dz } = best;
  // Ejes propios (u hacia la calle); giro, no simetría
  const at2 = (u, v) => [poi.x + dx * u - dz * v, poi.z + dz * u + dx * v];
  const face2 = (du, dv) => rotFacing(dx * du - dz * dv, dz * du + dx * dv);
  const put = (kind, u, v, rot, W, D, extra = {}, margin = 1.5) => {
    const [x, z] = at2(u, v);
    const p = w.plan(kind, x, z, rot, W, D, { poi, ...extra });
    return w.tryPlan(p, margin) ? p : null;
  };
  const pts = [];
  for (let u = 9; u <= 27.1; u += 6) pts.push(at2(u, 0));
  w.roads.add(pts, 6, 'street');
  poi.gates.push({ x: pts[pts.length - 1][0], z: pts[pts.length - 1][1], dir: [dx, dz], poi });
  put('observatory', -3, 0, face2(1, 0), 16, 16, { chests: 2, chestChance: 1 }, 1);
  put('obslab', 2, -16, face2(0, 1), 12, 9, { chests: 2, chestChance: 0.85 }, 1);
  put('dish', 13, 13, 0, 8, 8, {}, 0.5);
  put('dish', -13, 14.5, 0, 8, 8, {}, 0.5);
  put('mast', -16, -12, face2(1, 0), 5, 5, { chests: 1, chestChance: 0.8 }, 0.5);
  put('quonset', 1, 17, face2(0, -1), 6.4, 9.4, { chests: 1, chestChance: 0.7 }, 1);
  put('quonset', 15, -13, face2(-1, 0), 6.4, 9.4, { chests: 1, chestChance: 0.7 }, 1);
  put('overlook', -21, 0, face2(-1, 0), 8, 4, {}, 0.5);
  for (const s of [-1, 1]) put('lamp', 14, s * 4.6, face2(0, -s), 0.6, 0.6, { noMap: true }, 0.2);
}

function layoutMine(L) {
  const { w, poi, A } = L;
  // Galerías bajo tierra en la rejilla de 4 m de las cuevas, bajo un cerro
  // rocoso (a: celdas a lo largo de u, b: a lo largo de v; +v mira al centro)
  const NA = 10, NB = 8;
  const nx = A === 'x' ? NA : NB, nz = A === 'x' ? NB : NA;
  const [cx, cz] = L.at(-2, -15);
  const ox = -HALF + CELL * Math.round((cx - (nx * CELL) / 2 + HALF) / CELL);
  const oz = -HALF + CELL * Math.round((cz - (nz * CELL) / 2 + HALF) / CELL);
  const site = new Site('cave', 'Mina del Eco', ox, oz, nx, nz, poi.height);
  site.mine = true;
  const ij = (a, b) => (A === 'x' ? [a, b] : [b, a]);
  const set = (a, b, t) => site.set(...ij(a, b), t);
  const center = (a, b) => {
    const [i, j] = ij(a, b);
    return [ox + (i + 0.5) * CELL, oz + (j + 0.5) * CELL];
  };
  // Bocas: la principal en la cara del cerro (hacia el centro de la zona) y
  // otra en un costado
  const sideB = A === 'x' ? 3 : 1, sideA = A === 'x' ? 1 : 3;
  site.addRamp(sideB, 5);
  site.addRamp(sideA, 2);
  for (let a = 1; a <= 6; a++) set(a, 2, ROOM); // galería
  set(5, 3, ROOM);
  set(5, 4, ROOM); // túnel de la boca principal
  for (let a = 2; a <= 4; a++) for (let b = 3; b <= 4; b++) set(a, b, ROOM); // sala del eco
  for (let a = 6; a <= 8; a++) for (let b = 0; b <= 1; b++) set(a, b, ROOM); // sala del mineral
  for (const [a, b] of [[0, 1], [1, 1], [0, 2], [0, 3], [1, 3]]) set(a, b, ROOM); // sala del pozo
  set(1, 2, OPEN); // pozo bajo el castillete
  const chamber = (a0, b0, wa, hb, sa, sb, sky) => {
    const [i0, j0] = ij(a0, b0);
    const [w2, h2] = A === 'x' ? [wa, hb] : [hb, wa];
    const [ci, cj] = ij(sa, sb);
    return { i0, j0, w: w2, h: h2, ci, cj, sky };
  };
  site.chambers = [chamber(0, 1, 2, 3, 1, 2, true), chamber(2, 3, 3, 2, 3, 3, false), chamber(6, 0, 3, 2, 7, 0, false)];
  // Faroles colgados en la galería (su luz se hornea en las paredes)
  site.lanterns = [];
  for (const [a, b] of [[5, 3], [3, 2], [7, 1]]) {
    const [x, z] = center(a, b);
    site.addLight(x, site.floor + 2.5, z, 0xffb35a, { bake: 1.5, range: 9, power: 13, flicker: true });
    site.lanterns.push([x, z]);
  }
  site.mineRamps = [{ side: sideB, pos: 5, main: true }, { side: sideA, pos: 2 }];
  const r1 = rampEnds(site, sideB, 5), r2 = rampEnds(site, sideA, 2);
  site.railPath = [r1.o, r1.inner, center(5, 2), r2.inner, r2.o];
  site.finalize();
  w.sites.push(site);
  w.occ.add(ox - 1, oz - 1, ox + site.w + 1, oz + site.d + 1, { site });
  w.plans.push({ kind: 'site', site, x: site.x, z: site.z, rot: 0, fw: site.w, fd: site.d, noMap: true, chests: 6, chestChance: 1 });
  // Cerro sobre las galerías (de a = 2.6 a 10 y de b = 0 a 5)
  const ab = (a, b) => (A === 'x' ? [ox + a * CELL, oz + b * CELL] : [ox + b * CELL, oz + a * CELL]);
  w.plans.push({ kind: 'minehill', x: site.x, z: site.z, rot: 0, fw: 0, fd: 0, poi, noMap: true, y0: site.H, site, ab, notch: [6.9, 1.9, 10.2, 3.1] });
  // Castillete sobre el pozo y casa de máquinas al lado
  const [sx, sz] = center(1, 2);
  const [hx, hz] = L.at(-29, 0);
  const hoistV = (A === 'x' ? sz - poi.z : sx - poi.x);
  w.plans.push({ kind: 'headframe', x: sx, z: sz, rot: L.face(-1, 0), fw: 6, fd: 6, poi, y0: site.H, depth: site.D, chests: 1, chestChance: 0.8, hoist: Math.abs((A === 'x' ? sx - hx : sz - hz)) });
  L.put('hoist', -29, hoistV, L.face(1, 0), 9, 7, { chests: 1, chestChance: 0.7 }, 1);
  // En superficie: calle, cobertizos, tolva, andamios y montones de mineral
  w.gatesFrom(poi, w.street(poi, A, 17, L.R * 0.95, 7));
  L.put('tipple', 12, 28, L.face(0, -1), 8, 8, { chests: 1, chestChance: 0.8 }, 1);
  L.put('mineshed', -22, 28, L.face(0, -1), 9, 7, { chests: 1, chestChance: 0.7 }, 1);
  L.put('mineshed', -6, 29, L.face(0, -1), 7, 6, { chests: 1, chestChance: 0.6, small: true }, 1);
  L.put('scaffold', 28, 4, L.face(-1, 0), 6, 8, { chests: 1, chestChance: 0.8 }, 1);
  L.put('orepile', -30, 6, 0, 7, 7, {}, 1);
  L.put('orepile', 27, -14, 0, 7, 7, {}, 1);
  L.put('watertower', 30, 28, 0, 9, 9, { chests: 1, chestChance: 0.6 }, 1);
  // Vías de vagonetas desde la boca de la mina hasta la tolva
  const toPOI = (x, z) => (A === 'x' ? [x - poi.x, z - poi.z] : [z - poi.z, x - poi.x]); // -> (u, v)
  const [eu, ev] = toPOI(r1.o[0], r1.o[1]);
  const rails = [[eu, ev], [eu, ev + 6], [eu + 3, ev + 9.5], [10, ev + 9.5], [12, 18], [12, 23]].map(([u, v]) => L.at(u, v));
  const lamps = [[eu - 3.2, ev + 4], [eu + 3.2, ev + 4], [2, ev + 12.5], [-16, 20.8], [20, 20.8], [-30, 13], [24, -4]].map(([u, v]) => L.at(u, v)).filter(([x, z]) => !w.occupied(x, z, 0.6));
  w.plans.push({ kind: 'minerails', x: poi.x, z: poi.z, rot: 0, fw: 0, fd: 0, poi, noMap: true, rails, lamps, site });
  w.addCar(...L.at(22, 13), L.A === 'x' ? Math.PI / 2 : 0, true);
}

function layoutMansion(L) {
  const { w, poi, rng } = L;
  w.gatesFrom(poi, w.street(poi, L.A, -30, L.R, 7));
  // Camino de entrada desde la calle
  const drive = [];
  for (let v = -30; v <= -12.9; v += 5.6) drive.push(L.at(0, v));
  w.roads.add(drive, 6, 'street');
  L.put('mansiongate', 0, -22, L.face(0, -1), 14, 2, { onRoad: true }, 0.2);
  L.put('mansion', 0, 2, L.face(0, 1), 26, 16, { chests: 3, chestChance: 0.95 }, 1);
  L.put('garage', -20, -8, L.face(1, 0), 10, 8, { chests: 1, chestChance: 0.7 }, 1);
  L.put('pool', 0, 19.5, L.face(0, -1), 22, 11, { chests: 1, chestChance: 0.7 }, 1);
  L.put('helipad', 22, 16, L.face(-1, 0), 12, 12, { chests: 1, chestChance: 0.8 }, 1);
  L.put('cabana', -21, 21, L.face(1, 0), 6, 5, { chests: 1, chestChance: 0.5 }, 1);
  L.put('fountain', -21, 8, 0, 7, 7, { noMap: true }, 1);
  for (const s of [-1, 1]) w.addCar(...L.at(s * 8.5, -15.5), L.A === 'x' ? 0 : Math.PI / 2, false);
  // Seto alrededor de la finca (con la verja delante y pasos a los lados)
  const U = 31, V0 = -22, V1 = 28;
  const hedge = (u0, v0, u1, v1) => {
    const [x0, z0] = L.at(u0, v0), [x1, z1] = L.at(u1, v1);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    w.plans.push({ kind: 'hedge', x: mx, z: mz, rot: 0, fw: 0.2, fd: 0.2, noMap: true, poi, a: [x0 - mx, z0 - mz], b: [x1 - mx, z1 - mz] });
  };
  hedge(-U, V0, -7.2, V0);
  hedge(7.2, V0, U, V0);
  hedge(-U, V1, -2, V1);
  hedge(2, V1, U, V1);
  for (const s of [-1, 1]) {
    hedge(s * U, V0, s * U, -2);
    hedge(s * U, 2.5, s * U, V1);
  }
  // Palmeras y jardín
  const palms = [];
  for (const [u, v] of [[-5.5, -17], [5.5, -17], [-27, 25], [27, 25], [-27, -18], [27, -18], [-13.5, 26], [13.5, 26], [-27, 3], [27, 2], [-14, -11], [14, -10]]) {
    const [x, z] = L.at(u + rng.float(-0.6, 0.6), v + rng.float(-0.6, 0.6));
    if (w.occupied(x, z, 1.2) || w.roads.edgeDistance(x, z, 10) < 1.5) continue;
    palms.push({ x, z, s: rng.float(0.9, 1.2), rot: rng.float(0, Math.PI * 2) });
    w.occ.add(x - 0.5, z - 0.5, x + 0.5, z + 0.5, { tree: true });
  }
  const beds = [];
  for (const [u, v, wu, wv] of [[-25, -6, 6, 2.2], [-25, -12, 6, 2.2], [25, -8, 6, 2.2], [9, -18.5, 5, 1.6], [-9, -18.5, 5, 1.6], [24, 26, 8, 1.6], [-8, 26.3, 9, 1.4]]) {
    const [x, z] = L.at(u, v);
    const [hw, hd] = L.A === 'x' ? [wu / 2, wv / 2] : [wv / 2, wu / 2];
    if (!w.free(x - hw, z - hd, x + hw, z + hd) || w.roads.edgeDistance(x, z, 10) < Math.max(hw, hd)) continue;
    beds.push({ x, z, hw, hd });
    w.occ.add(x - hw, z - hd, x + hw, z + hd, { bed: true });
  }
  w.plans.push({ kind: 'garden', x: poi.x, z: poi.z, rot: 0, fw: 0, fd: 0, poi, noMap: true, palms, beds });
}

// ------------------------------------------------------------ CAMINO DE MONTAÑA
// Del observatorio (en la cima) baja una carretera serpenteante hasta la red:
// búsqueda de camino (Dijkstra) que castiga mucho las pendientes, así el
// trazado bordea la ladera siguiendo las curvas de nivel.
export function planAccessRoad(w, poi) {
  const g = poi.gates[0];
  if (!g || !w.roads.roads.some((r) => r.hs)) return;
  const t = w.terrain;
  const others = w.pois.filter((p) => p !== poi);
  // Altura del terreno con la cima ya allanada (igual que Terrain.shapedHeight)
  const summitH = (x, z) => {
    const raw = t.rawHeight(x, z);
    const d = Math.hypot(x - poi.x, z - poi.z), r = poi.flatR;
    const u = Math.min(1, Math.max(0, (d - r * 0.85) / (r * 0.75)));
    return raw + (poi.height - raw) * (1 - u * u * (3 - 2 * u));
  };
  const dPoi = (x, z) => Math.hypot(x - poi.x, z - poi.z);
  const blocked = (x, z) =>
    Math.hypot(x, z) > ISLAND_RADIUS * 0.9 || t.rawHeight(x, z) < 1.5 ||
    others.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius * 1.03) ||
    w.hydro.distanceTo(x, z) < 10 ||
    (dPoi(x, z) > poi.flatR && w.occ.hit(x - 3, z - 3, x + 3, z + 3));

  // Rejilla de 4 m con 16 direcciones (también «saltos de caballo»): así el
  // camino puede seguir las curvas de nivel con poca pendiente.
  const C = 4, N = 170;
  const x0 = g.x - (N * C) / 2, z0 = g.z - (N * C) / 2;
  const NN = N * N;
  const H = new Float32Array(NN), block = new Uint8Array(NN), goal = new Uint8Array(NN);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const cx = x0 + (i + 0.5) * C, cz = z0 + (j + 0.5) * C;
      H[k] = summitH(cx, cz);
      if (blocked(cx, cz) || dPoi(cx, cz) < poi.flatR) block[k] = 1;
      else if (dPoi(cx, cz) > poi.radius * 0.8 && w.roads.profileNear(cx, cz, 4)) goal[k] = 1;
    }
  }
  const start = Math.floor((g.z - z0) / C) * N + Math.floor((g.x - x0) / C);
  block[start] = 0;
  const dist = new Float32Array(NN).fill(Infinity);
  const prev = new Int32Array(NN).fill(-1);
  // Montículo binario sencillo
  const heap = [];
  const push = (k, d) => {
    heap.push([d, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  dist[start] = 0;
  push(start, 0);
  let end = -1;
  const DIRS = [];
  for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) if ((di || dj) && Math.abs(di) + Math.abs(dj) !== 4 && !(Math.abs(di) === 2 && dj === 0) && !(Math.abs(dj) === 2 && di === 0)) DIRS.push([di, dj, C * Math.hypot(di, dj)]);
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist[k]) continue;
    if (goal[k]) {
      end = k;
      break;
    }
    const i = k % N, j = (k / N) | 0;
    for (const [di, dj, len] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const q = nj * N + ni;
      if (block[q] && !goal[q]) continue;
      // (los saltos largos no pueden atravesar celdas bloqueadas)
      if (len > C * 1.5 && block[(j + Math.round(dj / 2)) * N + i + Math.round(di / 2)]) continue;
      const grade = Math.abs(H[q] - H[k]) / len;
      if (grade > 1.2) continue;
      // más del 11 % sale caro y más del 30 %, carísimo: el camino serpentea
      const c = len * (1 + Math.max(0, grade - 0.11) * 30 + Math.max(0, grade - 0.3) * 90);
      if (d + c < dist[q]) {
        dist[q] = d + c;
        prev[q] = k;
        push(q, d + c);
      }
    }
  }
  if (end < 0) return;
  const cells = [];
  for (let k = end; k >= 0; k = prev[k]) cells.push(k);
  cells.reverse();
  const raw = [[g.x, g.z]];
  cells.forEach((k, n) => {
    if (n === 0 || (n % 2 && n !== cells.length - 1)) return;
    raw.push([x0 + ((k % N) + 0.5) * C, z0 + (((k / N) | 0) + 0.5) * C]);
  });
  const last = raw[raw.length - 1];
  const near = w.roads.nearest(last[0], last[1], 20);
  if (near) raw.push([near.x, near.z]);
  if (raw.length < 3) return;
  const curve = new THREE.CatmullRomCurve3(raw.map(([px, pz]) => new THREE.Vector3(px, 0, pz)), false, 'centripetal');
  const pts = curve.getSpacedPoints(Math.max(4, Math.round(curve.getLength() / 5))).map((v) => [v.x, v.z]);
  // Perfil: arriba la altura de la cima, abajo la de la carretera; en medio
  // el terreno suavizado, con un máximo de pendiente
  const n = pts.length;
  let hs = pts.map(([px, pz]) => Math.max(1.5, summitH(px, pz)));
  const smooth = (arr, R) => arr.map((_, k) => {
    let s = 0, c = 0;
    for (let q = Math.max(0, k - R); q <= Math.min(n - 1, k + R); q++) {
      s += arr[q];
      c++;
    }
    return s / c;
  });
  hs = smooth(smooth(hs, 3), 3);
  const anchors = [[0, poi.height - hs[0]]];
  pts.forEach(([px, pz], k) => {
    if (k > n - 4) {
      const pn = w.roads.profileNear(px, pz, 9);
      if (pn) anchors.push([k, pn.hp - hs[k]]);
    }
  });
  let ai = 0;
  hs = hs.map((v, j) => {
    while (ai < anchors.length - 1 && anchors[ai + 1][0] <= j) ai++;
    const [k0, r0] = anchors[ai];
    if (j <= k0 || ai === anchors.length - 1) return v + r0;
    const [k1, r1] = anchors[ai + 1];
    return v + r0 + ((r1 - r0) * (j - k0)) / (k1 - k0);
  });
  const fixed = new Set(anchors.map(([k]) => k));
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 1; j < n; j++) if (!fixed.has(j)) hs[j] = Math.min(hs[j - 1] + 0.8, Math.max(hs[j - 1] - 0.8, hs[j]));
    for (let j = n - 2; j >= 0; j--) if (!fixed.has(j)) hs[j] = Math.min(hs[j + 1] + 0.8, Math.max(hs[j + 1] - 0.8, hs[j]));
  }
  w.roads.add(pts, 6, 'road', hs);
  poi.accessRoad = pts;
  poi.accessHs = hs;
}

// Contexto hijo que conserva las mallas extra (cristal, bombillas…).
function subFx(ctx, lx, lz, dRot = 0, dy = 0) {
  const c = ctx.sub(lx, lz, dRot, dy);
  c.fx = ctx.fx;
  return c;
}

// Guirnalda colgante entre dos puntos: bombillas o banderines.
const FLAGS = [RED, YEL, BLUE, 0x2fa84f, PURP, ORANGE, WHITE];
function garland(ctx, S, a, b, sag, kind) {
  const n = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.9));
  let prev = a;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    rod(S, prev, p, 0.022, DARK, 3);
    if (kind === 'bulbs' && k < n) bulb(ctx, p[0], p[1] - 0.09, p[2], BULBS[k % BULBS.length], 0.085);
    else if (kind === 'flags') poly2(S, [prev, p, [(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2 - 0.5, (prev[2] + p[2]) / 2]], FLAGS[k % FLAGS.length]);
    prev = p;
  }
}

// ============================================================ FERIA FELIZ
// Arco de entrada con el cartel y las taquillas a los lados.
function genFairArch(ctx, rng) {
  const S = sinkCtx(ctx);
  for (const sx of [-1, 1]) {
    const x = sx * 5.6;
    ctx.box(x - 0.85, -0.5, -0.85, x + 0.85, 0.4, 0.85, CONC);
    for (let k = 0; k < 8; k++) {
      ctx.box(x - 0.6, 0.4 + k, -0.6, x + 0.6, 1.4 + k, 0.6, k % 2 ? WHITE : RED, false);
      for (const cz of [-0.63, 0.63]) bulb(ctx, x - sx * 0.63, 0.9 + k, cz, BULBS[k % BULBS.length], 0.09);
    }
    ctx.colliderOnly(x - 0.6, 0.4, -0.6, x + 0.6, 8.4, 0.6);
    ctx.box(x - 0.78, 8.4, -0.78, x + 0.78, 8.7, 0.78, YEL, false);
    cone(S, x, 8.7, 0, 1.0, 1.9, RED, 8);
    ball(S, x, 10.8, 0, 0.28, GOLD);
    rod(S, [x, 10.9, 0], [x, 12.3, 0], 0.04, DARK, 4);
    poly2(S, [[x, 12.25, 0], [x, 11.6, 0], [x + sx * 1.35, 11.92, 0]], sx < 0 ? BLUE : YEL);
  }
  // Cartel: tablero con marco, arco de bombillas y estrella
  ctx.box(-4.9, 6.3, -0.3, 4.9, 8.6, 0.3, 0x1d3f8a, false);
  for (const [y0, y1] of [[6.1, 6.35], [8.55, 8.8]]) ctx.box(-5.0, y0, -0.36, 5.0, y1, 0.36, YEL, false);
  for (const sz of [-1, 1]) {
    for (let x = -4.7; x <= 4.71; x += 0.47) {
      bulb(ctx, x, 6.22, sz * 0.4, BULBS[Math.round((x + 5) * 2) % BULBS.length], 0.08);
      bulb(ctx, x, 8.68, sz * 0.4, BULBS[Math.round((x + 5) * 2 + 3) % BULBS.length], 0.08);
    }
  }
  let prev = null;
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * Math.PI;
    const p = [Math.cos(a) * 5.0, 8.75 + Math.sin(a) * 1.8, 0];
    if (prev) rod(S, prev, p, 0.13, YEL, 6);
    if (k % 2 === 0) for (const sz of [-1, 1]) bulb(ctx, p[0], p[1] + 0.05, sz * 0.18, BULBS[k % BULBS.length], 0.11);
    prev = p;
  }
  for (const x of [-2.4, 0, 2.4]) rod(S, [x, 8.8, 0], [x * 0.92, 8.75 + Math.sqrt(Math.max(0, 1 - (x / 5) ** 2)) * 1.8, 0], 0.06, YEL, 4);
  glowPut(ctx, geo('ico0'), YEL, M(0, 11.0, 0, 0, 0, 0.4, 0.6, 0.6, 0.2), 1.8);
  sign(ctx, 'FERIA FELIZ', 'fair', -4.6, 6.5, 4.6, 8.4, 0.32);
  sign(subFx(ctx, 0, 0, 2), '¡VUELVE PRONTO!', 'fair', -4.6, 6.5, 4.6, 8.4, 0.32);
  // Taquillas
  for (const sx of [-1, 1]) {
    const b = subFx(ctx, sx * 9.3, 0, 0);
    const col = sx < 0 ? BLUE : PURP;
    b.box(-1.6, -0.5, -1.3, 1.6, 0.15, 1.3, CONC);
    b.wall('x', -1.5, 1.5, -1.3, -1.1, 0.15, 2.7, [], WHITE);
    b.wall('x', -1.5, 1.5, 1.1, 1.3, 0.15, 2.7, [{ a: -1.0, b: 1.0, bottom: 1.15, top: 2.25 }], col);
    const xi = -sx * 1.5, xo = sx * 1.5;
    b.wall('z', -1.1, 1.1, Math.min(xi, xi + sx * 0.2), Math.max(xi, xi + sx * 0.2), 0.15, 2.7, [{ a: -0.55, b: 0.55, bottom: 0.15, top: 2.25 }], col);
    b.wall('z', -1.1, 1.1, Math.min(xo, xo - sx * 0.2), Math.max(xo, xo - sx * 0.2), 0.15, 2.7, [], col);
    b.box(-1.3, 0.15, 0.6, 1.3, 1.05, 1.1, WOOD);
    b.gableRoof(1.85, 1.6, 2.7, 0.9, RED, YEL);
    for (let x = -1.6; x <= 1.61; x += 0.4) bulb(b, x, 2.68, 1.64, BULBS[Math.round(x * 2.5 + 4) % BULBS.length], 0.07);
    b.box(-1.25, 2.28, 1.3, 1.25, 2.66, 1.36, 0x1d3f8a, false);
    sign(b, 'TAQUILLA', 'ride', -1.2, 2.3, 1.2, 2.64, 1.37);
    b.spot(b.chestSpots, sx * 0.7, 0.15, -0.55, 0, 0.6);
  }
  ctx.spot(ctx.lootSpots, 0, 0.05, -2.2);
}

// Noria: plataforma, dos caballetes de acero y la rueda que gira (malla
// aparte, sin colisión) con cabinas que se mantienen derechas.
function genFerrisWheel(ctx, rng) {
  const S = sinkCtx(ctx);
  const AY = 17, WR = 13, N = 16;
  ctx.box(-9.5, -1, -4.6, 9.5, 0.5, 4.6, CONC);
  for (let k = 0; k < 10; k++) {
    const x = -9.5 + k * 1.9;
    for (const z of [-4.75, 4.6]) ctx.box(x, 0.28, z, x + 1.9, 0.52, z + 0.15, k % 2 ? WHITE : RED, false);
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (const sz of [-1, 1]) {
    const z = sz * 2.5;
    const feet = [];
    for (const sx of [-1, 1]) {
      const foot = [sx * 7.4, 0.5, z], top = [sx * 0.5, AY, sz * 1.75];
      feet.push([foot, top]);
      rod(S, foot, top, 0.34, STEEL_L, 8);
      ctx.box(foot[0] - 0.6, 0.5, z - 0.6, foot[0] + 0.6, 1.1, z + 0.6, DARK);
      for (let k = 0; k < 4; k++) {
        const p0 = lerp(foot, top, k / 4), p1 = lerp(foot, top, (k + 1) / 4);
        ctx.colliderOnly(Math.min(p0[0], p1[0]) - 0.3, p0[1], Math.min(p0[2], p1[2]) - 0.3, Math.max(p0[0], p1[0]) + 0.3, p1[1], Math.max(p0[2], p1[2]) + 0.3);
      }
    }
    for (const t of [0.3, 0.62]) beam(S, lerp(feet[0][0], feet[0][1], t), lerp(feet[1][0], feet[1][1], t), 0.22, 0.22, STEEL_L);
    beam(S, lerp(feet[0][0], feet[0][1], 0.3), lerp(feet[1][0], feet[1][1], 0.62), 0.14, 0.14, STEEL_W);
    beam(S, lerp(feet[1][0], feet[1][1], 0.3), lerp(feet[0][0], feet[0][1], 0.62), 0.14, 0.14, STEEL_W);
  }
  for (const sx of [-1, 1]) {
    for (const t of [0.3, 0.62]) beam(S, lerp([sx * 7.4, 0.5, -2.5], [sx * 0.5, AY, -1.75], t), lerp([sx * 7.4, 0.5, 2.5], [sx * 0.5, AY, 1.75], t), 0.16, 0.16, STEEL_W);
  }
  rod(S, [0, AY, -2.4], [0, AY, 2.4], 0.5, DARK, 12);
  ctx.colliderOnly(-0.6, AY - 0.6, -2.4, 0.6, AY + 0.6, 2.4);
  // Taquilla y vallas de la cola
  const k = subFx(ctx, -7.4, 3.0, 0, 0.5);
  k.box(-0.9, 0, -0.7, 0.9, 2.2, 0.7, PURP);
  k.box(-1.1, 2.2, -0.9, 1.1, 2.4, 0.9, YEL, false);
  k.box(-0.7, 1.0, 0.7, 0.7, 1.7, 0.75, 0x1d3f8a, false);
  sign(k, 'NORIA', 'ride', -0.68, 1.02, 0.68, 1.68, 0.76);
  for (const x of [-4.5, -1.5]) railing(ctx, S, x, 4.2, x + 2.4, 4.2, 0.5, RED, false, 0.9);
  ctx.spot(ctx.chestSpots, 7.6, 0.5, 3.4, 7.6, 0);
  ctx.spot(ctx.lootSpots, -3, 0.5, 3.4);
  ctx.spot(ctx.ammoSpots, 3, 0.5, -3.4, 3, 0);

  // Rueda (gira alrededor del eje Z local)
  const wb = new GeoBuilder(), wg = new GeoBuilder();
  const SW = sinkGeo(wb);
  const P = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
  const gbulb = (p, hex, s) => {
    const n0 = wg.col.length;
    wg.box(p[0] - s, p[1] - s, p[2] - s, p[0] + s, p[1] + s, p[2] + s, hex, 0);
    for (let i = n0; i < wg.col.length; i++) wg.col[i] *= 2;
  };
  const NR = 32;
  for (const z of [-1.3, 1.3]) {
    for (let i = 0; i < NR; i++) {
      const a0 = (i / NR) * Math.PI * 2, a1 = ((i + 1) / NR) * Math.PI * 2;
      rod(SW, P(a0, WR, z), P(a1, WR, z), 0.2, STEEL_L, 6);
      rod(SW, P(a0, WR * 0.66, z), P(a1, WR * 0.66, z), 0.13, RED, 6);
      gbulb(P(a0, WR + 0.24, z * 1.07), BULBS[i % BULBS.length], 0.13);
    }
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      rod(SW, P(a, 1.4, z * 0.5), P(a, WR, z), 0.09, STEEL_L, 4);
      rod(SW, P(a, WR * 0.66, z), P(a + Math.PI / N, WR, z), 0.07, STEEL_W, 4);
      rod(SW, P(a, WR * 0.66, z), P(a - Math.PI / N, WR, z), 0.07, STEEL_W, 4);
      for (const f of [0.3, 0.5, 0.82]) gbulb(P(a, WR * f, z * 1.1), BULBS[(i + Math.round(f * 10)) % BULBS.length], 0.09);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    rod(SW, P(a, WR, -1.35), P(a, WR, 1.35), 0.15, DARK, 6);
    rod(SW, P(a, WR, -1.3), P(a + (Math.PI * 2) / N, WR, 1.3), 0.06, STEEL_W, 4);
  }
  SW.put(geo('disc16'), DARK, M(0, 0, 0, 0, 0, 0, 1.6, 1.6, 1.1));
  for (const z of [-0.6, 0.6]) SW.put(geo('disc16'), YEL, M(0, 0, z, 0, 0, 0, 1.15, 1.15, 0.12));
  for (const z of [-0.7, 0.7]) {
    const n0 = wg.col.length;
    wg.geometry(geo('ico0'), YEL, M(0, 0, z, 0, 0, 0.3, 0.7, 0.7, 0.16));
    for (let i = n0; i < wg.col.length; i++) wg.col[i] *= 1.8;
  }
  const wheel = wb.build();
  const lights = wg.build(glowMat);
  lights.castShadow = lights.receiveShadow = false;
  // Cabinas (instancias de un mismo modelo, cada una de un color)
  const gbd = new GeoBuilder();
  const SC = sinkGeo(gbd);
  beam(SC, [0, 0.15, 0], [0, -0.75, 0], 0.12, 0.12, DARK);
  SC.put(geo('cyl8'), WHITE, M(0, -2.2, 0, 0, Math.PI / 8, 0, 0.98, 0.9, 0.98));
  SC.put(geo('cyl8'), BLACK, M(0, -1.42, 0, 0, Math.PI / 8, 0, 0.93, 0.62, 0.93));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    SC.box(Math.cos(a) * 0.92 - 0.05, -1.75, Math.sin(a) * 0.92 - 0.05, Math.cos(a) * 0.92 + 0.05, -1.1, Math.sin(a) * 0.92 + 0.05, WHITE);
  }
  SC.put(geo('cone8'), WHITE, M(0, -0.85, 0, 0, Math.PI / 8, 0, 1.12, 0.55, 1.12));
  SC.put(geo('sph8'), GOLD, M(0, -0.55, 0, 0, 0, 0, 0.16, 0.16, 0.16));
  const gm = new THREE.InstancedMesh(gbd.build().geometry, movingMat(), N);
  const pal = [RED, BLUE, YEL, TEAL, PURP, ORANGE, PINK, 0x2fa84f];
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) gm.setColorAt(i, c.setHex(pal[i % pal.length]));
  gm.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WR + 3.5);
  gm.castShadow = true;
  const outer = new THREE.Group();
  const p = ctx.tp(0, AY, 0);
  outer.position.set(p[0], p[1], p[2]);
  outer.rotation.y = ctx.yaw(0);
  const spin = new THREE.Group();
  spin.add(wheel, lights);
  outer.add(spin, gm);
  addAnimated(ctx, outer, WR + 6);
  const clock = clockOf(ctx.fx.world);
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), Z = new THREE.Vector3(0, 0, 1);
  const update = () => {
    const t = clock();
    const a = t * 0.1;
    spin.rotation.z = a;
    for (let i = 0; i < N; i++) {
      const th = a + (i / N) * Math.PI * 2;
      tv.set(Math.cos(th) * WR, Math.sin(th) * WR, 0);
      tq.setFromAxisAngle(Z, Math.sin(t * 0.8 + i * 1.7) * 0.05);
      gm.setMatrixAt(i, tm.compose(tv, tq, one));
    }
    gm.instanceMatrix.needsUpdate = true;
  };
  update();
  wheel.onBeforeRender = update;
}

// Caballito de tiovivo (piezas de caja), mirando hacia `yaw`.
function horse(S, x, y, z, yaw, hex, saddle) {
  const P = (lx, ly, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, y + ly, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  const part = (lx, ly, lz, rx, sx, sy, sz, c) => {
    const p = P(lx, ly, lz);
    S.put(geo('box'), c, M(p[0], p[1], p[2], rx, yaw, 0, sx, sy, sz));
  };
  part(0, 0, 0, 0, 0.44, 0.46, 1.25, hex);
  part(0, 0.38, 0.55, -0.55, 0.3, 0.62, 0.32, hex);
  part(0, 0.7, 0.85, 0.25, 0.26, 0.3, 0.56, hex);
  part(0, 0.55, 0.62, -0.55, 0.08, 0.55, 0.36, GOLD);
  part(0, 0.26, -0.05, 0, 0.47, 0.08, 0.42, saddle);
  part(0, 0.02, -0.68, 0.7, 0.1, 0.5, 0.12, GOLD);
  for (const sx of [-0.14, 0.14]) {
    part(sx, -0.45, 0.45, -0.6, 0.12, 0.62, 0.12, hex);
    part(sx, -0.45, -0.45, 0.6, 0.12, 0.62, 0.12, hex);
  }
}

// Tiovivo: plataforma y columna fijas; techo, barras y caballos giran.
function genCarousel(ctx, rng) {
  const S = sinkCtx(ctx);
  const R0 = 6.2;
  cyl(S, 0, 0, 0, R0 + 0.15, 0.32, RED, 24);
  cyl(S, 0, 0.32, 0, R0, 0.13, WOOD_L, 24);
  for (let k = 0; k < 24; k++) {
    const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2;
    rod(S, [Math.sin(a0) * (R0 + 0.17), 0.3, Math.cos(a0) * (R0 + 0.17)], [Math.sin(a1) * (R0 + 0.17), 0.3, Math.cos(a1) * (R0 + 0.17)], 0.06, GOLD, 4);
  }
  ctx.colliderOnly(-R0 * 0.92, 0, -R0 * 0.38, R0 * 0.92, 0.45, R0 * 0.38);
  ctx.colliderOnly(-R0 * 0.38, 0, -R0 * 0.92, R0 * 0.38, 0.45, R0 * 0.92);
  ctx.colliderOnly(-R0 * 0.68, 0, -R0 * 0.68, R0 * 0.68, 0.45, R0 * 0.68);
  cyl(S, 0, 0.45, 0, 1.25, 4.8, STEEL_W, 12);
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2;
    S.put(geo('box'), 0xa8c4d8, M(Math.sin(a) * 1.22, 2.6, Math.cos(a) * 1.22, 0, a, 0, 0.8, 3.2, 0.06));
  }
  for (const y of [0.45, 4.1]) cyl(S, 0, y, 0, 1.35, 0.35, GOLD, 12);
  ctx.colliderOnly(-1.1, 0.45, -1.1, 1.1, 5.25, 1.1);
  // Caseta de la entrada
  const k = subFx(ctx, 5.6, 5.6, 0);
  k.box(-0.6, 0, -0.5, 0.6, 1.9, 0.5, BLUE);
  k.box(-0.75, 1.9, -0.65, 0.75, 2.05, 0.65, YEL, false);
  ctx.spot(ctx.chestSpots, -5.6, 0, 6.1, -5.6, 0);
  ctx.spot(ctx.lootSpots, 0, 0.45, 2.2);

  // Parte giratoria
  const sb = new GeoBuilder(), sg = new GeoBuilder();
  const SB = sinkGeo(sb);
  const gbulb = (p, hex, s) => {
    const n0 = sg.col.length;
    sg.box(p[0] - s, p[1] - s, p[2] - s, p[0] + s, p[1] + s, p[2] + s, hex, 0);
    for (let i = n0; i < sg.col.length; i++) sg.col[i] *= 2;
  };
  const NS = 16, RC = 6.8, YC = 5.25, AP = 8.1;
  const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
  for (let i = 0; i < NS; i++) {
    const a0 = (i / NS) * Math.PI * 2, a1 = ((i + 1) / NS) * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = P(a0, RC, YC), p1 = P(a1, RC, YC);
    SB.poly([[0, AP, 0], p0, p1], i % 2 ? WHITE : RED, [0, YC - 1, 0]);
    SB.poly([[0, YC + 0.5, 0], p0, p1], i % 2 ? GOLD : BLUE, [0, YC + 3, 0]);
    const q0 = [p0[0], YC - 0.75, p0[2]], q1 = [p1[0], YC - 0.75, p1[2]];
    SB.poly([p0, p1, q1, q0], i % 2 ? RED : YEL, [0, YC - 0.4, 0]);
    SB.poly([p0, p1, q1, q0], i % 2 ? RED : YEL, [Math.sin(am) * RC * 2, YC - 0.4, Math.cos(am) * RC * 2]);
    poly2(SB, [q0, q1, P(am, RC, YC - 1.15)], i % 2 ? WHITE : BLUE);
    gbulb(P(a0, RC + 0.06, YC + 0.02), BULBS[i % BULBS.length], 0.12);
    gbulb(P(am, RC + 0.06, YC - 0.5), BULBS[(i + 3) % BULBS.length], 0.1);
    for (const f of [0.35, 0.65]) gbulb(P(a0, RC * (1 - f), YC + (AP - YC) * f + 0.08), BULBS[(i + 1) % BULBS.length], 0.09);
  }
  SB.put(geo('sph8'), GOLD, M(0, AP + 0.25, 0, 0, 0, 0, 0.38, 0.38, 0.38));
  rod(SB, [0, AP + 0.5, 0], [0, AP + 1.7, 0], 0.04, DARK, 4);
  poly2(SB, [[0, AP + 1.65, 0], [0, AP + 1.15, 0], [1.1, AP + 1.4, 0]], RED);
  const HC = [WHITE, 0x3a2a22, 0xb0703a, 0xe6dccb, 0x2a2a2a, 0xc9a0dc];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (const [r, outer] of [[4.6, true], [3.0, false]]) {
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      rod(SB, [x, 0.45, z], [x, YC - 0.6, z], 0.055, GOLD, 6);
      if (outer || i % 2 === 0) horse(SB, x, 1.35 + ((i * 7 + r * 3) % 5) * 0.12, z, a + Math.PI / 2, HC[(i + (outer ? 0 : 3)) % HC.length], FLAGS[i % FLAGS.length]);
      else {
        SB.put(geo('box'), FLAGS[(i + 2) % FLAGS.length], M(x, 0.75, z, 0, a, 0, 1.3, 0.55, 0.7));
        SB.put(geo('box'), FLAGS[(i + 2) % FLAGS.length], M(x - Math.sin(a) * 0.3, 1.2, z - Math.cos(a) * 0.3, 0, a, 0, 1.3, 0.6, 0.12));
      }
    }
  }
  const spinMesh = sb.build();
  const lights = sg.build(glowMat);
  lights.castShadow = lights.receiveShadow = false;
  const outer = new THREE.Group();
  const p = ctx.tp(0, 0, 0);
  outer.position.set(p[0], p[1], p[2]);
  outer.rotation.y = ctx.yaw(0);
  const spin = new THREE.Group();
  spin.add(spinMesh, lights);
  outer.add(spin);
  addAnimated(ctx, outer, RC + 3);
  const clock = clockOf(ctx.fx.world);
  spinMesh.onBeforeRender = () => {
    spin.rotation.y = -clock() * 0.45;
  };
}

// Montaña rusa: circuito cerrado con subida, caída, curvas peraltadas y
// estación cubierta. Los vagones recorren la vía (malla instanciada).
function genCoaster(ctx, rng) {
  const S = sinkCtx(ctx);
  const CP = [
    [10, 1.8, 6.2], [0, 1.8, 6.2], [-10, 1.8, 6.2], [-16.5, 2.4, 5.0], [-20, 4.2, 0.5], [-17.5, 7.5, -5],
    [-11, 11.5, -7.2], [-4, 14.2, -7.4], [1.5, 13.6, -7.2], [8, 5.0, -7.0], [13, 2.6, -6.4], [18, 5.4, -3.5],
    [20, 8.2, 0.8], [17.5, 7.2, 5.0], [13.5, 3.4, 6.4],
  ];
  const curve = new THREE.CatmullRomCurve3(CP.map((q) => new THREE.Vector3(q[0], q[1], q[2])), true, 'catmullrom', 0.5);
  const len = curve.getLength();
  const n = Math.round(len / 0.8);
  const P = curve.getSpacedPoints(n);
  P.pop();
  const T = [], LT = [], U = [];
  for (let i = 0; i < n; i++) T.push(new THREE.Vector3().subVectors(P[(i + 1) % n], P[(i - 1 + n) % n]).normalize());
  for (let i = 0; i < n; i++) {
    const t0 = T[(i - 3 + n) % n], t1 = T[(i + 3) % n];
    const turn = t0.x * t1.z - t0.z * t1.x;
    const roll = Math.max(-0.5, Math.min(0.5, -turn * 1.4));
    const lat = new THREE.Vector3().crossVectors(UP, T[i]).normalize().applyAxisAngle(T[i], roll);
    LT.push(lat);
    U.push(new THREE.Vector3().crossVectors(T[i], lat).normalize());
  }
  const off = (i, l, u) => {
    const v = P[i].clone().addScaledVector(LT[i], l).addScaledVector(U[i], u);
    return [v.x, v.y, v.z];
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    rod(S, off(i, 0.55, 0.05), off(j, 0.55, 0.05), 0.075, STEEL_L, 6);
    rod(S, off(i, -0.55, 0.05), off(j, -0.55, 0.05), 0.075, STEEL_L, 6);
    rod(S, off(i, 0, -0.42), off(j, 0, -0.42), 0.2, RED, 6);
    if (i % 2 === 0) {
      beam(S, off(i, 0.7, -0.08), off(i, -0.7, -0.08), 0.12, 0.14, DARK);
      beam(S, off(i, 0.55, 0), off(i, 0, -0.42), 0.06, 0.06, DARK);
      beam(S, off(i, -0.55, 0), off(i, 0, -0.42), 0.06, 0.06, DARK);
    }
  }
  // Pilares
  let acc = 99;
  for (let i = 0; i < n; i++) {
    acc += P[i].distanceTo(P[(i - 1 + n) % n]);
    const p = P[i];
    if (acc < 5.2) continue;
    if (p.z > 3.8 && Math.abs(p.x) < 12 && p.y < 2.2) continue; // estación
    acc = 0;
    const sp = off(i, 0, -0.6);
    const top = sp[1] - 0.15;
    ctx.box(p.x - 0.5, -0.3, p.z - 0.5, p.x + 0.5, 0.22, p.z + 0.5, CONC, false);
    rod(S, [p.x, 0, p.z], [p.x, top, p.z], top > 6 ? 0.26 : 0.2, BLUE, 8);
    beam(S, [p.x, top, p.z], sp, 0.2, 0.2, BLUE);
    if (top > 6) {
      const lx = LT[i].x * 2.2, lz = LT[i].z * 2.2;
      rod(S, [p.x + lx, 0, p.z + lz], [p.x, top * 0.62, p.z], 0.12, BLUE, 6);
      rod(S, [p.x - lx, 0, p.z - lz], [p.x, top * 0.62, p.z], 0.12, BLUE, 6);
      for (const s of [1, -1]) ctx.colliderOnly(p.x + s * lx - 0.15, 0, p.z + s * lz - 0.15, p.x + s * lx + 0.15, 1.2, p.z + s * lz + 0.15);
    }
    ctx.colliderOnly(p.x - 0.25, 0, p.z - 0.25, p.x + 0.25, top, p.z + 0.25);
  }
  // Estación: andén con escalones, tejado a rayas y cartel
  ctx.box(-11, -0.5, 7.2, 9, 1.25, 9.6, CONC);
  ctx.box(9, -0.5, 7.2, 9.6, 0.83, 9.6, CONC);
  ctx.box(9.6, -0.5, 7.2, 10.2, 0.42, 9.6, CONC);
  ctx.box(-11.6, -0.5, 7.2, -11, 0.83, 9.6, CONC);
  ctx.box(-12.2, -0.5, 7.2, -11.6, 0.42, 9.6, CONC);
  for (const x of [-10.5, -3.5, 3.5, 8.5]) {
    ctx.box(x - 0.14, 1.25, 9.25, x + 0.14, 5.0, 9.53, WHITE);
    ctx.box(x - 0.14, 0, 4.3, x + 0.14, 5.0, 4.58, WHITE);
  }
  ctx.box(-11.6, 5.0, 3.9, 9.6, 5.25, 10.0, WHITE);
  for (let i = 0; i < 21; i++) {
    const x = -11.6 + i * 1.01;
    ctx.box(x, 4.65, 9.98, x + 1.01, 5.4, 10.1, i % 2 ? YEL : RED, false);
    ctx.box(x, 4.65, 3.78, x + 1.01, 5.4, 3.9, i % 2 ? YEL : RED, false);
    bulb(ctx, x + 0.5, 4.6, 10.12, BULBS[i % BULBS.length], 0.08);
    bulb(ctx, x + 0.5, 4.6, 3.76, BULBS[(i + 2) % BULBS.length], 0.08);
  }
  ctx.box(-5.2, 5.4, 9.8, 3.2, 6.6, 9.95, 0x1d3f8a, false);
  sign(ctx, 'MONTAÑA RUSA', 'ride', -5.1, 5.45, 3.1, 6.55, 9.96);
  railing(ctx, S, -10.8, 7.3, -1.5, 7.3, 1.25, YEL, false, 0.95);
  ctx.spot(ctx.chestSpots, -9.6, 1.25, 9.0, -9.6, 6);
  ctx.spot(ctx.chestSpots, 7.2, 1.25, 9.0, 7.2, 6);
  ctx.spot(ctx.lootSpots, -2, 1.25, 8.5);
  ctx.spot(ctx.ammoSpots, 3, 0, 9.85, 3, 12);
  ctx.spot(ctx.lootSpots, 0, 0, -1);

  // Tren de cuatro vagones
  const cb = new GeoBuilder();
  cb.box(-0.62, 0.12, -0.95, 0.62, 0.45, 0.95, DARK, 0);
  cb.box(-0.68, 0.45, -0.92, 0.68, 0.98, 0.92, WHITE, 0);
  cb.box(-0.56, 0.62, -0.7, 0.56, 0.98, -0.12, BLACK, 0);
  cb.box(-0.56, 0.62, 0.12, 0.56, 0.98, 0.7, BLACK, 0);
  cb.box(-0.56, 0.98, -0.72, 0.56, 1.32, -0.56, BLACK, 0);
  cb.box(-0.56, 0.98, 0.1, 0.56, 1.32, 0.26, BLACK, 0);
  cb.box(-0.6, 1.18, -0.2, 0.6, 1.26, -0.12, GOLD, 0);
  cb.box(-0.6, 1.18, 0.62, 0.6, 1.26, 0.7, GOLD, 0);
  cb.box(-0.5, 0.98, 0.86, 0.5, 1.12, 0.94, WHITE, 0);
  for (const x of [-0.6, 0.6]) for (const z of [-0.6, 0.6]) cb.box(x - 0.08, -0.05, z - 0.18, x + 0.08, 0.25, z + 0.18, DARK, 0);
  const train = new THREE.InstancedMesh(cb.build().geometry, movingMat(), 4);
  const tc = new THREE.Color();
  [RED, YEL, BLUE, TEAL].forEach((h, i) => train.setColorAt(i, tc.setHex(h)));
  train.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 7, 0), 27);
  train.castShadow = true;
  const g = new THREE.Group();
  const o = ctx.tp(0, 0, 0);
  g.position.set(o[0], o[1], o[2]);
  g.rotation.y = ctx.yaw(0);
  g.add(train);
  addAnimated(ctx, g, 28);
  const nearest = (q) => {
    const v = new THREE.Vector3(q[0], q[1], q[2]);
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = P[i].distanceToSquared(v);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  };
  const liftA = nearest(CP[3]), liftB = nearest(CP[7]);
  const inLift = (i) => (liftA <= liftB ? i >= liftA && i <= liftB : i >= liftA || i <= liftB);
  const hTop = Math.max(...P.map((q) => q.y));
  const ds = len / n;
  const clock = clockOf(ctx.fx.world);
  const pv = new THREE.Vector3(), tv = new THREE.Vector3(), uv = new THREE.Vector3(), lv = new THREE.Vector3(), m = new THREE.Matrix4();
  let s = 0, v = 3, last = null;
  const update = () => {
    const t = clock();
    const dt = last === null ? 0 : Math.max(0, Math.min(0.1, t - last));
    last = t;
    const i = Math.floor(s) % n;
    const station = P[i].z > 5 && Math.abs(P[i].x) < 12 && P[i].y < 2.3;
    const target = inLift(i) && T[i].y > 0.03 ? 3.2 : station ? 3.0 : Math.sqrt(Math.max(10, 2 * 9.8 * (hTop + 0.5 - P[i].y)));
    v += (target - v) * Math.min(1, dt * (station ? 1.4 : 3));
    s = (s + (v * dt) / ds) % n;
    for (let c = 0; c < 4; c++) {
      const u = (s - (c * 2.2) / ds + n * 8) % n;
      const i0 = Math.floor(u) % n, i1 = (i0 + 1) % n, f = u - Math.floor(u);
      pv.lerpVectors(P[i0], P[i1], f);
      tv.lerpVectors(T[i0], T[i1], f).normalize();
      lv.lerpVectors(LT[i0], LT[i1], f);
      uv.crossVectors(tv, lv).normalize();
      lv.crossVectors(uv, tv).normalize();
      pv.addScaledVector(uv, 0.08);
      m.makeBasis(lv, uv, tv).setPosition(pv);
      train.setMatrixAt(c, m);
    }
    train.instanceMatrix.needsUpdate = true;
  };
  update();
  train.onBeforeRender = update;
}

// Carpa de circo: techo a rayas con comba, pared redonda con dos entradas,
// gradas, trapecio con plataforma (y cofre) y pista.
function genBigTop(ctx, rng) {
  const S = sinkCtx(ctx);
  const RW = 8.2, HW = 4.4, NS = 20;
  const gaps = [[0, 0.34], [Math.PI / 2, 0.34]];
  const inGap = (a) => gaps.some(([gc, gw]) => Math.abs(angDiff(a, gc)) < gw);
  const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
  cyl(S, 0, -0.2, 0, RW, 0.27, 0xc8b48a, 24);
  cyl(S, 0, 0.07, 0, 4.0, 0.02, 0xd8c49a, 24);
  for (let k = 0; k < 24; k++) {
    const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2;
    rod(S, P(a0, 4.2, 0.2), P(a1, 4.2, 0.2), 0.18, k % 2 ? WHITE : RED, 6);
  }
  const r1 = 0.9, y1 = 11.0, r2 = 4.3, y2 = 7.4, r3 = RW + 0.5, y3 = HW;
  for (let k = 0; k < NS; k++) {
    const a0 = (k / NS) * Math.PI * 2, a1 = ((k + 1) / NS) * Math.PI * 2, am = (a0 + a1) / 2;
    const c = k % 2 ? WHITE : RED, ci = k % 2 ? 0xd8d0c0 : 0xa82a24;
    const up = [P(a0, r1, y1), P(a1, r1, y1), P(a1, r2, y2), P(a0, r2, y2)];
    const lo = [P(a0, r2, y2), P(a1, r2, y2), P(a1, r3, y3), P(a0, r3, y3)];
    S.poly(up, c, [0, 0, 0]);
    S.poly(lo, c, [0, 0, 0]);
    S.poly(up, ci, [0, 30, 0]);
    S.poly(lo, ci, [0, 30, 0]);
    if (!inGap(am)) {
      const wv = [P(a0, RW, 0.05), P(a1, RW, 0.05), P(a1, RW, HW), P(a0, RW, HW)];
      S.poly(wv, k % 2 ? YEL : RED, [0, 2, 0]);
      S.poly(wv, k % 2 ? 0xd8a82a : 0xa82a24, [Math.sin(am) * RW * 2, 2, Math.cos(am) * RW * 2]);
    }
    poly2(S, [P(a0, r3, y3), P(a1, r3, y3), P(am, r3, y3 - 0.6)], k % 2 ? BLUE : YEL);
    bulb(ctx, ...P(a0, r3 + 0.05, y3 - 0.05), BULBS[k % BULBS.length], 0.12);
    if (k % 5 === 2) {
      // vientos con estacas
      const st = P(am, RW + 3.0, 0);
      rod(S, P(am, r3, y3), [st[0], 0.1, st[2]], 0.025, 0xd8d0c0, 3);
      ctx.box(st[0] - 0.08, 0, st[2] - 0.08, st[0] + 0.08, 0.35, st[2] + 0.08, WOOD_D, false);
    }
  }
  cone(S, 0, 10.85, 0, 1.05, 0.7, RED, 10);
  cyl(S, 0, 0, 0, 0.18, 12.4, WHITE, 8);
  ball(S, 0, 12.5, 0, 0.3, GOLD);
  poly2(S, [[0, 13.6, 0], [0, 12.7, 0], [1.6, 13.15, 0]], RED);
  rod(S, [0, 12.6, 0], [0, 13.7, 0], 0.04, DARK, 4);
  for (const a of [0.6, 2.2, 3.8, 5.4]) garland(ctx, S, [0, 11.2, 0], P(a, r2 + 0.6, y2 - 0.2), 0.6, 'flags');
  ringWall(ctx, 0, 0, RW, 0, HW, gaps, 0.5);
  ctx.colliderOnly(-0.25, 0, -0.25, 0.25, 12.4, 0.25);
  // Toldos de las entradas
  for (const [ga] of gaps) {
    const R = (lx, y, lz) => [Math.cos(ga) * lx + Math.sin(ga) * lz, y, -Math.sin(ga) * lx + Math.cos(ga) * lz];
    for (const sx of [-1, 1]) {
      const p0 = R(sx * 1.7, 0, RW + 2.0);
      rod(S, [p0[0], 0, p0[2]], [p0[0], 3.3, p0[2]], 0.08, GOLD, 6);
      ctx.colliderOnly(p0[0] - 0.1, 0, p0[2] - 0.1, p0[0] + 0.1, 3.3, p0[2] + 0.1);
    }
    for (let k = 0; k < 4; k++) {
      const x0 = -1.9 + k * 0.95, x1 = x0 + 0.95;
      poly2(S, [R(x0, 3.9, RW - 0.4), R(x1, 3.9, RW - 0.4), R(x1, 3.3, RW + 2.2), R(x0, 3.3, RW + 2.2)], k % 2 ? WHITE : RED);
    }
  }
  // Gradas
  for (const [x0, z0, x1, z1, h, c] of [[-3, -6.2, 3, -5.4, 0.45, BLUE], [-3, -7.0, 3, -6.2, 0.9, RED], [-2.6, -7.6, 2.6, -7.0, 1.35, YEL]]) ctx.box(x0, 0, z0, x1, h, z1, c);
  // Trapecio
  for (const z of [-1.6, 1.6]) {
    cyl(S, -5.4, 0, z, 0.1, 6.0, WHITE, 8);
    ctx.colliderOnly(-5.5, 0, z - 0.1, -5.3, 6.0, z + 0.1);
  }
  ctx.box(-6.2, 4.2, -1.0, -4.6, 4.45, 1.0, WOOD);
  ctx.ladderVisual(-4.4, 0, 0.07, 4.45, 'z');
  rod(S, [-1.0, 7.0, -0.6], [-1.0, 4.6, -0.6], 0.025, DARK, 3);
  rod(S, [-1.0, 7.0, 0.6], [-1.0, 4.6, 0.6], 0.025, DARK, 3);
  rod(S, [-1.0, 4.6, -0.65], [-1.0, 4.6, 0.65], 0.05, GOLD, 4);
  // Accesorios de la pista: pedestales, pelota y cañón
  for (const [x, z, c] of [[2, 1.2, RED], [-1.6, 2.2, BLUE], [1.2, -2.4, YEL]]) {
    cyl(S, x, 0.07, z, 0.55, 0.7, c, 12);
    cyl(S, x, 0.77, z, 0.62, 0.08, GOLD, 12);
  }
  ball(S, -2.4, 0.7, -1.2, 0.62, BLUE, 12);
  ctx.box(2.6, 0.07, -0.5, 4.0, 0.6, 0.5, RED);
  rod(S, [3.3, 0.8, 0], [4.6, 2.6, 0], 0.42, DARK, 10);
  rod(S, [4.55, 2.53, 0], [4.65, 2.67, 0], 0.5, GOLD, 10);
  ctx.spot(ctx.chestSpots, 0, 1.35, -7.3, 0, 0);
  ctx.spot(ctx.chestSpots, -5.4, 4.45, 0, 0, 0);
  ctx.spot(ctx.lootSpots, 0, 0.07, 0);
  ctx.spot(ctx.ammoSpots, 2, 0.07, 3, 0, 0);
}

// Producto gigante encima de cada puesto de comida.
function product(S, kind, x, y, z) {
  switch (kind) {
    case 'icecream':
      S.put(geo('cone8'), 0xd9a45a, M(x, y + 0.7, z, Math.PI, 0, 0, 0.42, 1.4, 0.42));
      ball(S, x, y + 1.55, z, 0.48, PINK, 10);
      ball(S, x + 0.05, y + 1.95, z, 0.4, 0xfff2d0, 10);
      ball(S, x - 0.03, y + 2.27, z, 0.3, 0x8a4a2a, 10);
      ball(S, x, y + 2.62, z, 0.11, RED, 8);
      break;
    case 'hotdog':
      for (const dz of [-0.2, 0.2]) S.put(geo('sph10'), 0xe0a050, M(x, y + 0.42, z + dz, 0, 0, 0, 1.3, 0.34, 0.32));
      S.put(geo('cyl8'), 0xb8402a, M(x, y + 0.6, z, 0, 0, Math.PI / 2, 0.21, 2.8, 0.21));
      for (let k = 0; k < 5; k++) S.put(geo('box'), YEL, M(x - 1.0 + k * 0.5, y + 0.82, z, 0, k % 2 ? 0.5 : -0.5, 0, 0.42, 0.05, 0.08));
      break;
    case 'popcorn':
      for (let k = 0; k < 4; k++) S.box(x - 0.55 + k * 0.275, y, z - 0.5, x - 0.275 + k * 0.275, y + 1.1, z + 0.5, k % 2 ? WHITE : RED);
      for (let k = 0; k < 9; k++) ball(S, x + Math.cos(k * 2.4) * 0.35 * (k % 3) * 0.6, y + 1.18 + (k % 3) * 0.12, z + Math.sin(k * 2.4) * 0.3, 0.2, k % 2 ? 0xfff6d8 : 0xf6e2a0, 6);
      break;
    case 'prizes':
      ball(S, x, y + 0.55, z, 0.5, 0xa0703a, 10);
      ball(S, x, y + 1.25, z, 0.38, 0xa0703a, 10);
      for (const s of [-1, 1]) {
        ball(S, x + s * 0.3, y + 1.58, z, 0.13, 0x8a5a2a, 8);
        ball(S, x + s * 0.42, y + 0.6, z + 0.15, 0.17, 0xa0703a, 8);
      }
      ball(S, x, y + 1.18, z + 0.3, 0.14, 0xe6c8a0, 8);
      S.box(x - 0.25, y + 0.85, z + 0.25, x + 0.25, y + 0.98, z + 0.45, RED);
      break;
    case 'soda':
      cyl(S, x, y, z, 0.42, 1.25, RED, 12);
      cyl(S, x, y + 0.45, z, 0.43, 0.3, WHITE, 12);
      cyl(S, x, y + 1.25, z, 0.47, 0.08, WHITE, 12);
      rod(S, [x + 0.1, y + 1.3, z], [x + 0.3, y + 2.1, z + 0.1], 0.05, YEL, 6);
      break;
    default:
      rod(S, [x, y, z], [x, y + 1.1, z], 0.05, WHITE, 4);
      S.put(geo('ico1'), PINK, M(x, y + 1.55, z, 0, 0.4, 0, 0.62, 0.55, 0.6));
      S.put(geo('ico1'), 0x9ad8ff, M(x + 0.35, y + 1.35, z + 0.2, 0, 0.9, 0, 0.32, 0.3, 0.32));
  }
}

// Puesto de comida o de premios (destructible).
function genFairBooth(ctx, rng, p) {
  const S = sinkCtx(ctx);
  const C = { icecream: PINK, hotdog: ORANGE, popcorn: RED, prizes: PURP, soda: BLUE, candy: TEAL }[p.goods] || RED;
  ctx.box(-2.2, -0.5, -1.8, 2.2, 0.12, 1.8, WOOD_L);
  ctx.box(-2.2, 0.12, -1.8, 2.2, 2.9, -1.55, WHITE);
  ctx.box(-2.2, 0.12, -1.55, -1.95, 2.9, 1.6, C);
  ctx.box(1.95, 0.12, -1.55, 2.2, 2.9, -0.7, C);
  ctx.box(-1.95, 0.12, 1.15, 0.45, 1.1, 1.6, C);
  ctx.box(-2.05, 1.1, 1.05, 0.55, 1.18, 1.7, WOOD_L, false);
  for (let x = -1.7; x < 0.3; x += 0.5) ctx.box(x, 0.3, 1.6, x + 0.25, 0.95, 1.63, WHITE, false);
  ctx.box(-2.3, 2.9, -1.9, 2.3, 3.05, 1.65, C);
  for (let k = 0; k < 6; k++) {
    const x0 = -2.3 + k * 0.7667, x1 = x0 + 0.7667;
    poly2(S, [[x0, 2.95, 1.62], [x1, 2.95, 1.62], [x1, 2.45, 2.55], [x0, 2.45, 2.55]], k % 2 ? WHITE : C);
    poly2(S, [[x0, 2.45, 2.55], [x1, 2.45, 2.55], [(x0 + x1) / 2, 2.15, 2.6]], k % 2 ? WHITE : C);
  }
  ctx.box(-2.0, 3.05, 1.2, 2.0, 3.12, 1.55, YEL, false);
  product(S, p.goods, 0, 3.05, 0.2);
  // Estante con género y premios colgados
  ctx.box(-1.9, 1.25, -1.55, 1.9, 1.33, -1.2, WOOD, false);
  for (let k = 0; k < 7; k++) {
    const x = -1.7 + k * 0.55;
    S.box(x, 1.33, -1.5, x + 0.35, 1.33 + 0.2 + (k % 3) * 0.12, -1.25, FLAGS[(k + 2) % FLAGS.length]);
    if (p.goods === 'prizes') ball(S, x + 0.17, 2.3, -1.0, 0.16, FLAGS[k % FLAGS.length], 6);
  }
  ctx.spot(ctx.chestSpots, -1.1, 0.12, -0.9, -1.1, 1);
  ctx.spot(ctx.ammoSpots, 1.4, 0.05, 2.5, 1.4, 4);
}

// Farolas del paseo con guirnaldas de bombillas y banderines.
function genFairLights(ctx, rng, p) {
  const S = sinkCtx(ctx);
  const loc = ([x, z]) => [x - p.x, z - p.z];
  const tops = [];
  for (const pair of p.poles) {
    const ends = pair.map(loc);
    for (const [x, z] of ends) {
      cyl(S, x, 0, z, 0.3, 0.25, CONC_D, 8);
      cyl(S, x, 0.25, z, 0.1, 6.0, DARK, 8);
      ball(S, x, 6.35, z, 0.22, GOLD);
      S.box(x - 0.2, 5.5, z - 0.2, x + 0.2, 5.95, z + 0.2, DARK);
      bulb(ctx, x, 5.72, z, 0xfff1c0, 0.15);
      ctx.colliderOnly(x - 0.15, 0, z - 0.15, x + 0.15, 6.2, z + 0.15);
    }
    tops.push(ends);
    garland(ctx, S, [ends[0][0], 5.95, ends[0][1]], [ends[1][0], 5.95, ends[1][1]], 1.0, 'bulbs');
  }
  for (let i = 0; i + 1 < tops.length; i++) {
    for (const s of [0, 1]) garland(ctx, S, [tops[i][s][0], 5.5, tops[i][s][1]], [tops[i + 1][s][0], 5.5, tops[i + 1][s][1]], 0.8, 'flags');
  }
}

// Autos de choque: pista cubierta con coches de colores.
function genBumperCars(ctx, rng) {
  const S = sinkCtx(ctx);
  const hw = 6, hd = 4.5, H = 4.2;
  ctx.box(-hw, -0.5, -hd, hw, 0.2, hd, 0x55575c);
  for (const z of [-hd, hd - 0.3]) {
    ctx.box(-hw, 0.2, z, -1.3, 0.75, z + 0.3, BLACK);
    ctx.box(1.3, 0.2, z, hw, 0.75, z + 0.3, BLACK);
  }
  for (const x of [-hw, hw - 0.3]) ctx.box(x, 0.2, -hd + 0.3, x + 0.3, 0.75, hd - 0.3, BLACK);
  for (const x of [-hw + 0.2, -3, 3, hw - 0.2]) for (const z of [-hd + 0.2, hd - 0.2]) ctx.box(x - 0.14, 0.75, z - 0.14, x + 0.14, H, z + 0.14, STEEL_W);
  ctx.box(-hw - 0.3, H, -hd - 0.3, hw + 0.3, H + 0.3, hd + 0.3, WHITE);
  const fascia = (x0, z0, x1, z1, n) => {
    const alongX = z0 === z1;
    for (let k = 0; k < n; k++) {
      const a = k / n, b = (k + 1) / n;
      const xa = x0 + (x1 - x0) * a, xb = x0 + (x1 - x0) * b, za = z0 + (z1 - z0) * a, zb = z0 + (z1 - z0) * b;
      ctx.box(Math.min(xa, xb) - (alongX ? 0 : 0.06), H - 0.45, Math.min(za, zb) - (alongX ? 0.06 : 0), Math.max(xa, xb) + (alongX ? 0 : 0.06), H + 0.45, Math.max(za, zb) + (alongX ? 0.06 : 0), FLAGS[k % FLAGS.length], false);
      bulb(ctx, (xa + xb) / 2, H - 0.5, (za + zb) / 2, BULBS[k % BULBS.length], 0.08);
    }
  };
  fascia(-hw - 0.3, hd + 0.36, hw + 0.3, hd + 0.36, 13);
  fascia(-hw - 0.3, -hd - 0.36, hw + 0.3, -hd - 0.36, 13);
  fascia(-hw - 0.36, -hd - 0.3, -hw - 0.36, hd + 0.3, 9);
  fascia(hw + 0.36, -hd - 0.3, hw + 0.36, hd + 0.3, 9);
  for (let x = -hw + 1; x < hw; x += 1) ctx.box(x - 0.02, H - 0.1, -hd, x + 0.02, H - 0.03, hd, DARK, false);
  ctx.box(-4.1, H + 0.45, hd + 0.2, 4.1, H + 1.6, hd + 0.32, 0x1d3f8a, false);
  sign(ctx, 'AUTOS DE CHOQUE', 'ride', -4.0, H + 0.5, 4.0, H + 1.55, hd + 0.33);
  const cols = [RED, BLUE, YEL, 0x2fa84f, PURP, ORANGE];
  const cars = [];
  for (let i = 0; i < 120 && cars.length < 6; i++) {
    const x = rng.float(-hw + 1.4, hw - 1.4), z = rng.float(-hd + 1.3, hd - 1.3), yaw = rng.float(0, Math.PI * 2);
    if (Math.abs(x) < 2.3 || cars.some((c) => Math.hypot(c[0] - x, c[1] - z) < 2)) continue;
    cars.push([x, z, yaw]);
  }
  cars.forEach(([x, z, yaw], i) => {
    const P = (lx, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
    S.put(geo('box'), BLACK, M(x, 0.4, z, 0, yaw, 0, 1.2, 0.3, 1.6));
    S.put(geo('box'), cols[i], M(x, 0.7, z, 0, yaw, 0, 1.05, 0.4, 1.4));
    const [sx, sz] = P(0, -0.35);
    S.put(geo('box'), BLACK, M(sx, 1.05, sz, 0, yaw, 0, 0.8, 0.45, 0.22));
    const [wx, wz] = P(0, 0.35);
    S.put(geo('disc12'), DARK, M(wx, 1.05, wz, -0.6, yaw, 0, 0.18, 0.18, 0.05));
    const [px, pz] = P(0, -0.6);
    rod(S, [px, 0.9, pz], [px, H - 0.08, pz], 0.03, DARK, 4);
    ctx.colliderOnly(x - 0.65, 0.2, z - 0.65, x + 0.65, 0.75, z + 0.65);
  });
  ctx.spot(ctx.chestSpots, -5.1, 0.2, -3.6, 0, 0);
  ctx.spot(ctx.lootSpots, 0, 0.2, 0);
}

// ============================================================ TEMPLO OLVIDADO
const STONES = [STONE, STONE_D, STONE_G];

// Manchas de musgo sobre una superficie horizontal.
function mossTop(S, rng, x0, z0, x1, z1, y, n) {
  for (let k = 0; k < n; k++) {
    const w = rng.float(0.6, 1.8), d = rng.float(0.5, 1.4);
    const x = rng.float(x0, Math.max(x0, x1 - w)), z = rng.float(z0, Math.max(z0, z1 - d));
    S.box(x, y, z, x + w, y + rng.float(0.05, 0.14), z + d, rng.chance(0.5) ? MOSS : MOSS_D);
  }
}

// Liana que cuelga de (x, y, z) pegada a una pared que mira a (nx, nz).
function vine(S, rng, x, y, z, nx, nz, len) {
  const w = rng.float(0.18, 0.32);
  const ox = nx * 0.07, oz = nz * 0.07;
  const hx = nz ? w / 2 : 0.05, hz = nx ? w / 2 : 0.05;
  S.box(x - hx + ox, y - len, z - hz + oz, x + hx + ox, y, z + hz + oz, MOSS_D);
  for (let t = 0.35; t < len; t += rng.float(0.5, 0.9)) {
    const lx = x + ox * 2 + (nz ? rng.float(-0.15, 0.15) : 0), lz = z + oz * 2 + (nx ? rng.float(-0.15, 0.15) : 0);
    S.box(lx - 0.14, y - t - 0.1, lz - 0.14, lx + 0.14, y - t + 0.08, lz + 0.14, MOSS);
  }
}

// Brasero con fuego (sin colisión salvo el pie).
function brazier(ctx, S, x, y, z, s = 1) {
  cyl(S, x, y, z, 0.18 * s, 0.8 * s, DARK, 6);
  cyl(S, x, y + 0.8 * s, z, 0.45 * s, 0.3 * s, BLACK, 10);
  glowPut(ctx, geo('cone6'), 0xff8a2a, M(x, y + 1.3 * s, z, 0, 0.3, 0, 0.35 * s, 0.75 * s, 0.35 * s), 2.2);
  glowPut(ctx, geo('cone6'), 0xffd24a, M(x + 0.06, y + 1.22 * s, z - 0.05, 0, 1.1, 0, 0.2 * s, 0.5 * s, 0.2 * s), 2.4);
  ctx.colliderOnly(x - 0.3 * s, y, z - 0.3 * s, x + 0.3 * s, y + 1.1 * s, z + 0.3 * s);
}

// Pirámide escalonada: escalinata hasta el santuario de la cima, cámara
// interior con tesoros (tres pasillos a ras de suelo) y un pozo con escalera
// de mano que baja del santuario a la cámara.
function genPyramid(ctx, rng) {
  const S = sinkCtx(ctx);
  const cz = -4, TH = 2.6, T0 = 13, STEP = 2.2, NT = 5, Y0 = 0.15;
  const TOP = Y0 + NT * TH;
  ctx.box(-T0 - 0.6, -3, cz - T0 - 0.6, T0 + 0.6, Y0, cz + T0 + 0.6, STONE_D);
  const holes = [
    [-5, Y0, cz - 5, 5, 4.4, cz + 5],
    [-1.4, Y0, cz - T0 - 1, 1.4, 3.3, cz - 4.9],
    [4.9, Y0, cz - 1.4, T0 + 1, 3.3, cz + 1.4],
    [-T0 - 1, Y0, cz - 1.4, -4.9, 3.3, cz + 1.4],
    [-2.7, 4.3, cz - 2.7, -0.9, TOP + 0.5, cz - 0.9],
  ];
  const faces = ['+z', '-z', '+x', '-x'];
  // caja pegada a una cara: t a lo largo, d hacia fuera
  const box2 = (n, s, t0, t1, d0, d1, y0, y1, hex) => {
    if (n === '+z') S.box(t0, y0, cz + s + d0, t1, y1, cz + s + d1, hex);
    else if (n === '-z') S.box(t0, y0, cz - s - d1, t1, y1, cz - s - d0, hex);
    else if (n === '+x') S.box(s + d0, y0, cz + t0, s + d1, y1, cz + t1, hex);
    else S.box(-s - d1, y0, cz + t0, -s - d0, y1, cz + t1, hex);
  };
  const skip = (n, t, k, w = 0) => (n === '+z' && Math.abs(t) < 2.7 + w) || (k <= 1 && n !== '+z' && Math.abs(t) < 1.9 + w);
  for (let k = 0; k < NT; k++) {
    const s = T0 - k * STEP, y0 = Y0 + k * TH, y1 = y0 + TH;
    for (const b of subtract([-s, y0, cz - s, s, y1, cz + s], holes)) ctx.box(b[0], b[1], b[2], b[3], b[4], b[5], STONES[k % 3]);
    for (const n of faces) {
      // cornisa (partida por la escalinata) y friso con relieves
      const cut = n === '+z' ? 2.4 : -1;
      if (cut > 0) {
        box2(n, s, -s - 0.16, -cut, -0.3, 0.16, y1 - 0.3, y1, STONE_L);
        box2(n, s, cut, s + 0.16, -0.3, 0.16, y1 - 0.3, y1, STONE_L);
      } else box2(n, s, -s - 0.16, s + 0.16, -0.3, 0.16, y1 - 0.3, y1, STONE_L);
      const nCh = Math.floor((2 * s - 0.6) / 1.6);
      for (let c = 0; c < nCh; c++) {
        const t = -s + 0.3 + (c + 0.5) * ((2 * s - 0.6) / nCh);
        if (skip(n, t, k, 0.8)) continue;
        box2(n, s, t - 0.7, t + 0.7, -0.02, 0.06, y0 + 0.75, y0 + 1.75, STONE_D);
        box2(n, s, t - 0.28, t + 0.28, 0.06, 0.14, y0 + 0.98, y0 + 1.52, (c + k) % 3 ? STONE_L : STONE_G);
      }
      // lianas que cuelgan del borde
      for (let v = 0; v < 3; v++) {
        const t = rng.float(-s + 0.5, s - 0.5);
        const len = rng.float(0.8, 2.3);
        if (skip(n, t, k, 0.3)) continue;
        if (n === '+z') vine(S, rng, t, y1, cz + s + 0.16, 0, 1, len);
        else if (n === '-z') vine(S, rng, t, y1, cz - s - 0.16, 0, -1, len);
        else if (n === '+x') vine(S, rng, s + 0.16, y1, cz + t, 1, 0, len);
        else vine(S, rng, -s - 0.16, y1, cz + t, -1, 0, len);
      }
    }
    // musgo en la repisa que queda de cada piso
    if (k < NT - 1) {
      const s2 = s - STEP;
      mossTop(S, rng, -s, cz - s, s, cz - s2, y1, 3);
      mossTop(S, rng, -s, cz - s2, -s2, cz + s2, y1, 2);
      mossTop(S, rng, s2, cz - s2, s, cz + s2, y1, 2);
      mossTop(S, rng, -s, cz + s2, -2.6, cz + s, y1, 1);
      mossTop(S, rng, 2.6, cz + s2, s, cz + s, y1, 1);
    }
  }
  // Escalinata (31 escalones de 0.42 m) con alfardas
  const NSTEP = 31, RUN = 0.55, zf = cz + 4.2 + NSTEP * RUN;
  for (let k = 0; k < NSTEP; k++) {
    const za = zf - (k + 1) * RUN, zb = zf - k * RUN;
    ctx.box(-2.3, 0, za, 2.3, ((k + 1) * TOP) / NSTEP, zb, k % 2 ? STONE_G : STONE, true, 0.03);
  }
  for (const sx of [-1, 1]) {
    const x0 = sx * 2.3, x1 = sx * 3.0, zm = (zf + cz + 4.2) / 2;
    const a = [zf + 0.3, 0.9], b = [cz + 4.2, TOP + 0.6];
    S.poly([[x0, a[1], a[0]], [x1, a[1], a[0]], [x1, b[1], b[0]], [x0, b[1], b[0]]], STONE_L, [sx * 2.65, 0, zm]);
    S.poly([[x1, 0, a[0]], [x1, 0, b[0]], [x1, b[1], b[0]], [x1, a[1], a[0]]], STONE_D, [sx * 2.3, 1, zm]);
    S.poly([[x0, 0, a[0]], [x1, 0, a[0]], [x1, a[1], a[0]], [x0, a[1], a[0]]], STONE_D, [sx * 2.65, 0.4, a[0] - 1]);
    // cabeza de serpiente al pie de cada alfarda
    const hx = sx * 2.65, hz = zf + 0.95;
    ctx.box(hx - 0.55, 0, hz - 0.7, hx + 0.55, 1.0, hz + 0.6, STONE);
    S.box(hx - 0.62, 1.0, hz - 0.75, hx + 0.62, 1.28, hz + 0.75, STONE_G);
    S.box(hx - 0.55, 0.62, hz + 0.55, hx + 0.55, 1.12, hz + 1.15, STONE);
    S.box(hx - 0.48, 0.02, hz + 0.55, hx + 0.48, 0.32, hz + 1.1, STONE_D);
    for (const fx of [-0.32, -0.12, 0.12, 0.32]) S.box(hx + fx - 0.05, 0.32, hz + 0.95, hx + fx + 0.05, 0.62, hz + 1.05, 0xece4d2);
    for (const ex of [-0.38, 0.38]) glowBox(ctx, hx + ex - 0.1, 1.02, hz + 0.25, hx + ex + 0.1, 1.2, hz + 0.6, 0x5dff8a, 1.8);
    for (let r = 0; r < 3; r++) S.box(hx - 0.5, 1.28, hz - 0.6 + r * 0.45, hx + 0.5, 1.42, hz - 0.35 + r * 0.45, STONE_D);
  }
  // Santuario de la cima con el ídolo de oro
  const sy = TOP;
  const sh = (x0, z0, x1, z1, y0, y1, c = STONE_G) => ctx.box(x0, sy + y0, cz + z0, x1, sy + y1, cz + z1, c);
  sh(-3.4, -3.4, 3.4, -2.9, 0, 3.6);
  sh(-3.4, -2.9, -2.9, 2.5, 0, 3.6);
  sh(2.9, -2.9, 3.4, 2.5, 0, 3.6);
  sh(-3.4, 2.5, -1.1, 3.0, 0, 3.6);
  sh(1.1, 2.5, 3.4, 3.0, 0, 3.6);
  sh(-1.1, 2.5, 1.1, 3.0, 2.8, 3.6);
  sh(-3.9, -3.9, 3.9, 3.5, 3.6, 4.1, STONE_D);
  sh(-3.5, -3.5, 3.5, 3.1, 4.1, 4.35, STONE);
  for (const [x0, x1] of [[-2.7, -1.95], [-0.35, 0.35], [1.95, 2.7]]) S.box(x0, sy + 4.35, cz - 0.35, x1, sy + 6.1, cz + 0.35, STONE_G);
  S.box(-2.7, sy + 5.6, cz - 0.35, 2.7, sy + 6.1, cz + 0.35, STONE_G);
  S.box(-2.7, sy + 4.35, cz - 0.35, 2.7, sy + 4.75, cz + 0.35, STONE_G);
  for (const x of [-2.4, 0, 2.4]) cone(S, x, sy + 6.1, cz, 0.3, 0.6, STONE_L, 4);
  for (const x of [-1.7, 1.7]) glowBox(ctx, x - 0.25, sy + 3.0, cz + 3.0, x + 0.25, sy + 3.4, cz + 3.04, 0x5dfff0, 1.6);
  for (let k = 0; k < 6; k++) vine(S, rng, rng.float(-3.6, 3.6), sy + 3.6, cz + 3.5, 0, 1, rng.float(0.8, 2.6));
  mossTop(S, rng, -3.5, cz - 3.5, 3.5, cz + 3.1, sy + 4.35, 5);
  // ídolo
  sh(0.3, -2.9, 2.3, -1.9, 0, 0.9, STONE_D);
  S.box(0.8, sy + 0.9, cz - 2.7, 1.8, sy + 2.1, cz - 2.1, GOLD);
  S.box(0.9, sy + 2.1, cz - 2.65, 1.7, sy + 2.75, cz - 2.15, GOLD);
  for (let i = -3; i <= 3; i++) S.put(geo('box'), FLAGS[(i + 3) % 5], M(1.3 + i * 0.16, sy + 3.0, cz - 2.55, 0, 0, i * 0.24, 0.12, 0.9, 0.05));
  for (const ex of [1.1, 1.5]) glowBox(ctx, ex - 0.08, sy + 2.4, cz - 2.15, ex + 0.08, sy + 2.52, cz - 2.11, 0xff3a2a, 2.2);
  glowBox(ctx, 1.2, sy + 1.5, cz - 2.11, 1.4, sy + 1.7, cz - 2.07, 0x3affd8, 2);
  for (const x of [-2.4, 2.4]) brazier(ctx, S, x, sy, cz + 3.7, 0.9);
  ctx.ladderVisual(-1.8, cz - 2.55, Y0, TOP, 'x');
  ctx.spot(ctx.chestSpots, 2.2, sy, cz + 1.6, 0, cz);
  ctx.spot(ctx.lootSpots, -0.2, sy, cz + 1.0);
  // Cámara: altar, braseros, glifos que brillan y cofres en las esquinas
  ctx.box(-1.0, Y0, cz - 0.6, 1.0, Y0 + 0.9, cz + 0.6, STONE_D);
  S.box(-1.1, Y0 + 0.9, cz - 0.7, 1.1, Y0 + 1.05, cz + 0.7, STONE_L);
  S.box(-0.25, Y0 + 1.05, cz - 0.25, 0.25, Y0 + 1.45, cz + 0.25, GOLD);
  for (const [x, z] of [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3]]) brazier(ctx, S, x, Y0, cz + z, 0.8);
  for (const s of [-1, 1]) {
    for (const zz of [-3.2, 3.2]) {
      for (let g = 0; g < 3; g++) {
        const y = Y0 + 1.4 + g * 0.65;
        glowBox(ctx, s * 5 - (s > 0 ? 0.04 : 0), y, cz + zz - 0.3 + (g % 2) * 0.2, s * 5 + (s > 0 ? 0 : 0.04), y + 0.35, cz + zz + 0.1 + (g % 2) * 0.2, 0x3affd8, 1.6);
      }
    }
    for (const xx of [-3.2, 3.2]) glowBox(ctx, xx - 0.4, Y0 + 2.2, cz + s * 5 - (s > 0 ? 0.04 : 0), xx + 0.4, Y0 + 2.6, cz + s * 5 + (s > 0 ? 0 : 0.04), 0x3affd8, 1.6);
  }
  ctx.spot(ctx.chestSpots, -4.2, Y0, cz + 4.2, 0, cz);
  ctx.spot(ctx.chestSpots, 4.2, Y0, cz + 4.2, 0, cz);
  ctx.spot(ctx.chestSpots, 4.2, Y0, cz - 4.2, 0, cz);
  ctx.spot(ctx.lootSpots, 0, Y0 + 0.9, cz);
  ctx.spot(ctx.ammoSpots, -3, Y0, cz + 1.8, 0, cz);
  // Marcos de piedra y braseros en las tres entradas
  for (const [ex, ez, along] of [[0, cz - T0, 'x'], [T0, cz, 'z'], [-T0, cz, 'z']]) {
    if (along === 'x') {
      for (const s of [-1, 1]) S.box(s * 1.4 - (s > 0 ? 0 : 0.5), Y0, ez - 0.35, s * 1.4 + (s > 0 ? 0.5 : 0), 3.6, ez + 0.1, STONE_L);
      S.box(-2.0, 3.3, ez - 0.35, 2.0, 3.85, ez + 0.1, STONE_L);
      for (const s of [-1, 1]) brazier(ctx, S, s * 2.6, 0, ez - 1.2);
    } else {
      const o = Math.sign(ex);
      const fx0 = o > 0 ? ex - 0.1 : ex - 0.35, fx1 = o > 0 ? ex + 0.35 : ex + 0.1;
      for (const s of [-1, 1]) S.box(fx0, Y0, cz + s * 1.4 - (s > 0 ? 0 : 0.5), fx1, 3.6, cz + s * 1.4 + (s > 0 ? 0.5 : 0), STONE_L);
      S.box(fx0, 3.3, cz - 2.0, fx1, 3.85, cz + 2.0, STONE_L);
      for (const s of [-1, 1]) brazier(ctx, S, ex + o * 1.2, 0, cz + s * 2.6);
    }
  }
  // Bloques caídos alrededor
  for (let k = 0; k < 7; k++) {
    const a = rng.float(0, Math.PI * 2), d = T0 + rng.float(1.6, 3.2);
    const x = Math.sin(a) * d, z = cz + Math.cos(a) * d;
    if (Math.abs(x) < 3.6 && z > cz) continue;
    if (Math.abs(x) < 3.2 || Math.abs(z - cz) < 3.2) continue;
    const s = rng.float(0.45, 0.9);
    ctx.box(x - s, 0, z - s * 0.8, x + s, s * 1.1, z + s * 0.8, rng.pick(STONES));
    if (rng.chance(0.6)) S.box(x - s * 0.8, s * 1.1, z - s * 0.6, x + s * 0.5, s * 1.1 + 0.08, z + s * 0.5, MOSS);
  }
}

// Columna (entera o rota, con un tambor caído al lado).
function genColumn(ctx, rng, p) {
  const S = sinkCtx(ctx);
  ctx.box(-0.85, -0.5, -0.85, 0.85, 0.35, 0.85, STONE_D);
  ctx.box(-0.7, 0.35, -0.7, 0.7, 0.6, 0.7, STONE);
  const h = p.h;
  cyl(S, 0, 0.6, 0, 0.52, h, STONE_L, 12);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    S.box(Math.cos(a) * 0.5 - 0.05, 0.6, Math.sin(a) * 0.5 - 0.05, Math.cos(a) * 0.5 + 0.05, 0.6 + h * 0.97, Math.sin(a) * 0.5 + 0.05, STONE_G);
  }
  ctx.colliderOnly(-0.5, 0.6, -0.5, 0.5, 0.6 + h, 0.5);
  if (!p.broken) {
    ctx.box(-0.75, 0.6 + h, -0.75, 0.75, 0.9 + h, 0.75, STONE);
    ctx.box(-0.88, 0.9 + h, -0.88, 0.88, 1.15 + h, 0.88, STONE_G);
    mossTop(S, rng, -0.85, -0.85, 0.85, 0.85, 1.15 + h, 2);
  } else {
    S.put(geo('cyl12'), STONE_L, M(0.08, 0.75 + h, 0, 0.35, 0, 0.25, 0.46, 0.35, 0.46));
    const side = rng.chance(0.5) ? 1 : -1, fl = rng.float(1.2, 2.4), yaw = rng.float(-0.5, 0.5);
    S.put(geo('cyl12'), STONE_L, M(side * 1.9, 0.5, 0.3, 0, yaw, Math.PI / 2, 0.5, fl, 0.5));
    ctx.colliderOnly(side * 1.9 - fl * 0.45, 0, -0.3, side * 1.9 + fl * 0.45, 0.95, 0.9);
    if (rng.chance(0.6)) S.box(side * 1.9 - 0.5, 0.98, 0.0, side * 1.9 + 0.4, 1.04, 0.6, MOSS);
  }
  mossTop(S, rng, -0.85, -0.85, 0.85, 0.85, 0.35, 2);
  if (rng.chance(0.7)) vine(S, rng, 0, 0.6 + h * 0.95, 0.52, 0, 1, rng.float(0.8, h * 0.8));
}

// Cabeza colosal de piedra con ojos que brillan.
function genIdol(ctx, rng) {
  const S = sinkCtx(ctx);
  ctx.box(-2.2, -0.5, -2.2, 2.2, 0.6, 2.2, STONE_D);
  ctx.box(-1.6, 0.6, -1.4, 1.6, 4.4, 1.4, STONE_D);
  S.box(-1.75, 3.4, -1.55, 1.75, 4.75, 1.55, STONE);
  S.box(-1.8, 3.3, 1.45, 1.8, 3.6, 1.65, STONE_G);
  S.box(-1.4, 2.95, 1.38, 1.4, 3.3, 1.6, STONE);
  for (const s of [-1, 1]) {
    S.box(s * 0.35 - (s > 0 ? 0 : 0.75), 2.35, 1.38, s * 0.35 + (s > 0 ? 0.75 : 0), 2.85, 1.47, BLACK);
    glowBox(ctx, s * 0.72 - 0.12, 2.48, 1.46, s * 0.72 + 0.12, 2.7, 1.5, 0x5dff8a, 2);
    S.box(s * 1.55 - (s > 0 ? 0 : 0.32), 1.5, -0.45, s * 1.55 + (s > 0 ? 0.32 : 0), 2.95, 0.45, STONE);
    S.box(s * 1.62 - 0.12, 1.85, 0.05, s * 1.62 + 0.12, 2.3, 0.55, 0xece4d2);
  }
  S.box(-0.38, 1.65, 1.38, 0.38, 2.7, 1.9, STONE);
  S.box(-0.95, 1.12, 1.38, 0.95, 1.48, 1.78, STONE_G);
  S.box(-0.8, 0.85, 1.38, 0.8, 1.12, 1.7, STONE);
  mossTop(S, rng, -1.75, -1.55, 1.75, 1.55, 4.75, 4);
  for (let k = 0; k < 3; k++) vine(S, rng, rng.float(-1.5, 1.5), 4.7, 1.56, 0, 1, rng.float(0.8, 2.2));
  for (let k = 0; k < 2; k++) vine(S, rng, rng.float(-1.5, 1.5), 4.7, -1.56, 0, -1, rng.float(1, 3));
}

// Estanque de piedra con nenúfares.
function genTemplePool(ctx, rng) {
  const S = sinkCtx(ctx);
  ctx.box(-4, -0.4, -2.25, 4, 0.5, -1.8, STONE);
  ctx.box(-4, -0.4, 1.8, 4, 0.5, 2.25, STONE);
  ctx.box(-4, -0.4, -1.8, -3.55, 0.5, 1.8, STONE);
  ctx.box(3.55, -0.4, -1.8, 4, 0.5, 1.8, STONE);
  S.box(-3.55, 0.0, -1.8, 3.55, 0.04, 1.8, 0x3d5a3a);
  waterRect(ctx, -3.55, -1.8, 3.55, 1.8, 0.36, 0x237a62);
  for (let k = 0; k < 7; k++) {
    const x = rng.float(-3.1, 3.1), z = rng.float(-1.4, 1.4);
    cyl(S, x, 0.37, z, rng.float(0.25, 0.45), 0.02, 0x4f8f3a, 8);
    if (k % 3 === 0) ball(S, x + 0.1, 0.45, z, 0.1, PINK, 6);
  }
  for (const sx of [-1, 1]) {
    ctx.box(sx * 3.75 - 0.35, 0.5, 1.65, sx * 3.75 + 0.35, 1.1, 2.3, STONE_G);
    S.box(sx * 3.75 - 0.3, 1.1, 1.7, sx * 3.75 + 0.3, 1.45, 2.2, STONE_G);
    for (const ex of [-0.15, 0.15]) S.box(sx * 3.75 + ex - 0.05, 1.3, 2.2, sx * 3.75 + ex + 0.05, 1.38, 2.24, BLACK);
  }
  mossTop(S, rng, -4, 1.8, 4, 2.25, 0.5, 3);
  mossTop(S, rng, -4, -2.25, 4, -1.8, 0.5, 3);
}

// Templete en ruinas (destructible): muros rotos, medio tejado y altar.
function genTempleHut(ctx, rng) {
  const S = sinkCtx(ctx);
  const hw = 5, hd = 4, t = 0.6;
  ctx.box(-hw - 0.3, -2, -hd - 0.3, hw + 0.3, 0.15, hd + 0.3, STONE_D);
  ctx.box(-hw, 0.15, -hd, hw, 3.6, -hd + t, STONE);
  ctx.box(-hw, 0.15, -hd + t, -hw + t, 3.6, hd, STONE);
  for (let z = -hd + t; z < hd - 0.01; z += 1.85) ctx.box(hw - t, 0.15, z, hw, rng.float(1.2, 3.2), Math.min(hd, z + 1.85), STONE_G);
  ctx.box(-hw + t, 0.15, hd - t, -1.1, 3.6, hd, STONE);
  ctx.box(1.1, 0.15, hd - t, 3.0, 3.6, hd, STONE);
  ctx.box(3.0, 0.15, hd - t, hw - t, rng.float(1.0, 2.6), hd, STONE_G);
  ctx.box(-1.6, 2.7, hd - t, 1.6, 3.6, hd, STONE_L);
  S.box(-1.25, 2.45, hd - t + 0.05, 1.25, 2.7, hd - 0.05, STONE_L);
  ctx.box(-hw, 3.6, -hd, 0.6, 3.95, hd, STONE_D);
  S.put(geo('box'), STONE_D, M(2.6, 0.55, -0.6, 0.18, 0.4, 0.35, 3.2, 0.32, 2.4));
  ctx.colliderOnly(1.4, 0.15, -1.6, 3.8, 0.9, 0.4);
  ctx.box(-3.6, 0.15, -hd + t, -1.8, 1.0, -hd + t + 1.0, STONE_L);
  glowBox(ctx, -2.9, 1.0, -hd + t + 0.3, -2.5, 1.35, -hd + t + 0.7, 0x3affd8, 1.6);
  mossTop(S, rng, -hw, -hd, 0.6, hd, 3.95, 5);
  for (let k = 0; k < 5; k++) vine(S, rng, rng.float(-hw + 0.3, 0.3), 3.9, hd + 0.05, 0, 1, rng.float(0.8, 2.4));
  for (let k = 0; k < 3; k++) vine(S, rng, -hw - 0.05, 3.5, rng.float(-hd + 0.5, hd - 0.5), -1, 0, rng.float(1, 2.8));
  ctx.spot(ctx.chestSpots, 3.6, 0.15, -2.8, 0, 0);
  ctx.spot(ctx.chestSpots, -3.8, 0.15, 2.6, 0, 0);
  ctx.spot(ctx.lootSpots, -0.5, 0.15, 0.5);
}

// Estela tallada con un glifo brillante.
function genStela(ctx, rng) {
  const S = sinkCtx(ctx);
  ctx.box(-0.9, -0.3, -0.9, 0.9, 0.3, 0.9, STONE_D);
  ctx.box(-0.55, 0.3, -0.3, 0.55, 3.8, 0.3, STONE);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 2; c++) S.box(-0.42 + c * 0.45, 0.8 + r * 0.62, 0.3, -0.03 + c * 0.45, 1.25 + r * 0.62, 0.36, (r + c) % 2 ? STONE_L : STONE_G);
  }
  S.box(-0.65, 3.8, -0.38, 0.65, 4.05, 0.38, STONE_G);
  glowBox(ctx, -0.18, 3.35, 0.31, 0.18, 3.65, 0.35, 0x3affd8, 1.8);
  mossTop(S, rng, -0.65, -0.38, 0.65, 0.38, 4.05, 1);
  if (rng.chance(0.6)) vine(S, rng, rng.float(-0.4, 0.4), 4.0, 0.38, 0, 1, rng.float(1, 2.6));
  ctx.spot(ctx.chestSpots, 0, 0.3, 1.1, 0, 3);
}

// Árbol de la selva: raíces de contrafuerte, ramas, copa enorme y lianas.
function jungleTree(S, rng, x, y, z, s) {
  const h = rng.float(9, 13) * s, r = 0.42 * s;
  S.put(geo('trunk8'), 0x6b5236, M(x, y + h / 2, z, 0, rng.float(0, 3), 0, r, h, r));
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + rng.float(-0.3, 0.3);
    S.put(geo('box'), 0x5e4630, M(x + Math.sin(a) * r * 1.3, y + 0.5 * s, z + Math.cos(a) * r * 1.3, -0.45, a, 0, 0.18 * s, 1.2 * s, 1.5 * s));
  }
  const top = y + h;
  for (let k = 0; k < 3; k++) {
    const a = rng.float(0, Math.PI * 2), L = rng.float(2, 3.5) * s;
    rod(S, [x, top - rng.float(1, 2.5) * s, z], [x + Math.sin(a) * L, top + rng.float(0, 1) * s, z + Math.cos(a) * L], 0.14 * s, 0x6b5236, 5);
  }
  const nb = rng.int(4, 6);
  for (let k = 0; k < nb; k++) {
    const a = rng.float(0, Math.PI * 2), d = k === 0 ? 0 : rng.float(1.5, 3.2) * s;
    const R = rng.float(2.2, 3.4) * s;
    blob(S, x + Math.sin(a) * d, top + rng.float(-0.6, 1.2) * s, z + Math.cos(a) * d, R, R * 0.55, R, rng.pick(LEAF), rng.float(0, 3));
  }
  for (let k = 0; k < 3; k++) {
    const a = rng.float(0, Math.PI * 2), d = rng.float(1.5, 3) * s;
    const lx = x + Math.sin(a) * d, lz = z + Math.cos(a) * d;
    rod(S, [lx, top - 0.5, lz], [lx + rng.float(-0.3, 0.3), top - rng.float(3, 6) * s, lz + rng.float(-0.3, 0.3)], 0.045, MOSS_D, 3);
  }
}

// Palmera con el tronco curvado, hojas que caen y cocos.
function palm(S, rng, x, y, z, s, rot) {
  const sl = 1.25 * s;
  let px = x, py = y, pz = z;
  const bx = Math.sin(rot) * 0.24, bz = Math.cos(rot) * 0.24;
  for (let k = 0; k < 6; k++) {
    const nx = px + bx * (k / 6 + 0.3), nz = pz + bz * (k / 6 + 0.3), ny = py + sl;
    rod(S, [px, py, pz], [nx, ny, nz], (0.3 - k * 0.025) * s, k % 2 ? 0x8a6a48 : 0x7a5a3a, 7);
    px = nx;
    py = ny;
    pz = nz;
  }
  for (let k = 0; k < 8; k++) {
    const a = rot + (k / 8) * Math.PI * 2 + rng.float(-0.2, 0.2);
    const dx = Math.sin(a), dz = Math.cos(a), L = rng.float(3.2, 4.2) * s;
    let prev = [px, py, pz], pw = 0.12 * s;
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      const q = [px + dx * L * t, py + (0.3 + 0.9 * t - 1.9 * t * t) * s, pz + dz * L * t];
      const w = (0.75 - 0.6 * t) * s;
      poly2(S, [[prev[0] - dz * pw, prev[1], prev[2] + dx * pw], [prev[0] + dz * pw, prev[1], prev[2] - dx * pw], [q[0] + dz * w, q[1], q[2] - dx * w], [q[0] - dz * w, q[1], q[2] + dx * w]], k % 2 ? 0x3f8a3a : 0x4f9a42, 0x2f6a2a);
      prev = q;
      pw = w;
    }
  }
  for (let k = 0; k < 3; k++) ball(S, px + Math.sin(k * 2.1) * 0.32, py - 0.25, pz + Math.cos(k * 2.1) * 0.32, 0.19 * s, 0x6b4a2b, 6);
}

function fern(S, rng, x, y, z, s) {
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rng.float(-0.3, 0.3);
    const dx = Math.sin(a), dz = Math.cos(a), L = rng.float(1.2, 1.9) * s;
    const mid = [x + dx * L * 0.5, y + 0.75 * s, z + dz * L * 0.5], tip = [x + dx * L, y + 0.3 * s, z + dz * L];
    const w = 0.3 * s;
    poly2(S, [[x, y + 0.05, z], [mid[0] + dz * w, mid[1], mid[2] - dx * w], tip, [mid[0] - dz * w, mid[1], mid[2] + dx * w]], k % 2 ? 0x3f7a2e : 0x4a8a36, 0x2f5f24);
  }
}

// Vegetación de la selva del templo (y de otros lugares).
function genJungle(ctx, rng, p) {
  const S = sinkCtx(ctx);
  const T = ctx.fx.world.terrain;
  for (const t of p.trees) {
    const x = t.x - p.x, z = t.z - p.z, y = T.heightAt(t.x, t.z) - ctx.cy;
    if (t.kind === 'tree') {
      jungleTree(S, rng, x, y, z, t.s);
      ctx.colliderOnly(x - 0.4 * t.s, y, z - 0.4 * t.s, x + 0.4 * t.s, y + 8 * t.s, z + 0.4 * t.s);
    } else if (t.kind === 'palm') {
      palm(S, rng, x, y, z, t.s, t.rot);
      ctx.colliderOnly(x - 0.3, y, z - 0.3, x + 0.3, y + 6 * t.s, z + 0.3);
    } else if (t.kind === 'fern') fern(S, rng, x, y, z, t.s);
    else for (let k = 0; k < 3; k++) blob(S, x + rng.float(-0.6, 0.6), y + 0.5 * t.s, z + rng.float(-0.6, 0.6), 0.9 * t.s, 0.7 * t.s, 0.9 * t.s, rng.pick(LEAF), rng.float(0, 3));
  }
}

// ============================================================ OBSERVATORIO ESTELAR
// Edificio de la cúpula: tambor redondo (se entra), cúpula con la rendija
// abierta y el gran telescopio asomando por ella.
function genObservatory(ctx, rng) {
  const S = sinkCtx(ctx);
  const RD = 6.2, WH = 4.6, Y0 = 0.5, N = 28;
  const DOOR = 0.24;
  ctx.box(-7.6, -2, -7.6, 7.6, Y0, 7.6, CONC);
  for (const s of [-1, 1]) {
    S.box(-7.7, Y0 - 0.12, s * 7.6 - 0.1, 7.7, Y0 + 0.04, s * 7.6 + 0.1, CONC_L);
    S.box(s * 7.6 - 0.1, Y0 - 0.12, -7.7, s * 7.6 + 0.1, Y0 + 0.04, 7.7, CONC_L);
  }
  ctx.box(-2.2, -0.5, 7.6, 2.2, 0.25, 8.4, CONC);
  const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
  // Tambor: caras por fuera y por dentro
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    const door = Math.abs(angDiff(am, 0)) < DOOR;
    const yb = door ? Y0 + 3.0 : Y0;
    const v = [P(a0, RD, yb), P(a1, RD, yb), P(a1, RD, Y0 + WH), P(a0, RD, Y0 + WH)];
    S.poly(v, WHITE, [0, Y0 + 2, 0]);
    S.poly(v, 0xe2dfd6, [Math.sin(am) * RD * 3, Y0 + 2, Math.cos(am) * RD * 3]);
    if (!door) {
      const vb = [P(a0, RD + 0.04, Y0), P(a1, RD + 0.04, Y0), P(a1, RD + 0.04, Y0 + 0.5), P(a0, RD + 0.04, Y0 + 0.5)];
      S.poly(vb, 0x55575c, [0, Y0 + 2, 0]);
      if (k % 4 === 2) {
        const w = [P(am - 0.07, RD + 0.05, Y0 + 2.0), P(am + 0.07, RD + 0.05, Y0 + 2.0), P(am + 0.07, RD + 0.05, Y0 + 3.4), P(am - 0.07, RD + 0.05, Y0 + 3.4)];
        S.poly(w, 0x1d2a44, [0, Y0 + 2, 0]);
        glowPut(ctx, geo('box'), 0xffe7a8, M(...P(am, RD + 0.06, Y0 + 2.7), 0, am, 0, 0.5, 1.2, 0.02), 1.2);
      }
    }
    rod(S, P(a0, RD + 0.12, Y0 + WH), P(a1, RD + 0.12, Y0 + WH), 0.22, CONC_G, 6);
  }
  ringWall(ctx, 0, 0, RD - 0.05, Y0, Y0 + WH, [[0, DOOR + 0.02]], 0.5);
  // Puerta: marco, tejadillo y cartel
  for (const s of [-1, 1]) ctx.box(s * 1.45 - 0.2, Y0, RD - 0.6, s * 1.45 + 0.2, Y0 + 3.2, RD + 0.35, CONC_G);
  ctx.box(-1.9, Y0 + 3.0, RD - 0.4, 1.9, Y0 + 3.25, RD + 2.0, DARK);
  for (const s of [-1, 1]) ctx.box(s * 1.75 - 0.08, 0.25, RD + 1.8, s * 1.75 + 0.08, Y0 + 3.0, RD + 1.96, STEEL_W);
  ctx.box(-3.1, Y0 + 3.3, RD + 0.15, 3.1, Y0 + 4.35, RD + 0.35, 0x0d1f4a, false);
  for (const s of [-1, 1]) ctx.box(s * 2.4 - 0.08, Y0 + 3.3, RD - 0.6, s * 2.4 + 0.08, Y0 + 4.3, RD + 0.2, DARK, false);
  sign(ctx, 'OBSERVATORIO ESTELAR', 'obs', -3.0, Y0 + 3.35, 3.0, Y0 + 4.3, RD + 0.36);
  for (const s of [-1, 1]) bulb(ctx, s * 1.45, Y0 + 2.9, RD + 0.45, 0xfff1c0, 0.12);
  // Cúpula con rendija
  const DC = Y0 + WH, RDm = RD + 0.2;
  const SA = rng.float(2.3, 4.0), SW = 0.17;
  const NL = 7, NA = 28;
  const D = (az, el, r = RDm) => [Math.sin(az) * Math.cos(el) * r, DC + Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r];
  for (let i = 0; i < NL; i++) {
    const e0 = (i / NL) * (Math.PI / 2), e1 = ((i + 1) / NL) * (Math.PI / 2);
    for (let k = 0; k < NA; k++) {
      const a0 = (k / NA) * Math.PI * 2, a1 = ((k + 1) / NA) * Math.PI * 2;
      if (Math.abs(angDiff((a0 + a1) / 2, SA)) < SW + 0.01 && i < NL - 1) continue;
      const v = i === NL - 1 ? [D(a0, e0), D(a1, e0), [0, DC + RDm, 0]] : [D(a0, e0), D(a1, e0), D(a1, e1), D(a0, e1)];
      S.poly(v, (k + i) % 2 ? STEEL_L : 0xdde2e8, [0, DC, 0]);
      S.poly(v, 0x6f747a, D((a0 + a1) / 2, (e0 + e1) / 2, RDm * 3));
    }
  }
  for (let k = 0; k < NA; k += 4) {
    if (Math.abs(angDiff((k / NA) * Math.PI * 2, SA)) < SW + 0.05) continue;
    for (let i = 0; i < NL; i++) rod(S, D((k / NA) * Math.PI * 2, (i / NL) * (Math.PI / 2), RDm + 0.06), D((k / NA) * Math.PI * 2, ((i + 1) / NL) * (Math.PI / 2), RDm + 0.06), 0.06, STEEL_W, 4);
  }
  for (const s of [-1, 1]) {
    const az = SA + s * (SW + 0.02);
    for (let i = 0; i < NL - 1; i++) rod(S, D(az, (i / NL) * (Math.PI / 2), RDm + 0.1), D(az, ((i + 1) / NL) * (Math.PI / 2), RDm + 0.1), 0.12, DARK, 6);
  }
  // persiana abierta, desplazada a un lado de la rendija
  for (let i = 0; i < NL - 1; i++) {
    const e0 = (i / NL) * (Math.PI / 2), e1 = ((i + 1) / NL) * (Math.PI / 2);
    const az0 = SA + SW + 0.08, az1 = SA + SW * 3 + 0.1;
    const v = [D(az0, e0, RDm + 0.18), D(az1, e0, RDm + 0.18), D(az1, e1, RDm + 0.18), D(az0, e1, RDm + 0.18)];
    poly2(S, v, 0xc9ced6, 0x55575c);
  }
  ctx.colliderOnly(-4.4, DC, -4.4, 4.4, DC + 3.4, 4.4);
  ctx.colliderOnly(-2.6, DC + 3.4, -2.6, 2.6, DC + 5.6, 2.6);
  // Telescopio sobre su pilar, apuntando por la rendija
  cyl(S, 0, Y0, 0, 0.95, 1.7, CONC_G, 12);
  cyl(S, 0, Y0 + 1.7, 0, 1.15, 0.3, DARK, 16);
  const EL = 0.72;
  const dir = [Math.sin(SA) * Math.cos(EL), Math.sin(EL), Math.cos(SA) * Math.cos(EL)];
  const pv = [0, Y0 + 3.0, 0];
  const at = (d) => [pv[0] + dir[0] * d, pv[1] + dir[1] * d, pv[2] + dir[2] * d];
  for (const s of [-1, 1]) {
    const ox = Math.cos(SA) * s * 1.0, oz = -Math.sin(SA) * s * 1.0;
    beam(S, [ox, Y0 + 2.0, oz], [ox, pv[1], oz], 0.3, 0.3, 0x2f7de1);
  }
  rod(S, at(-2.6), at(5.6), 0.8, WHITE, 16);
  for (const d of [-2.2, 0.2, 2.6, 5.0]) rod(S, at(d), at(d + 0.35), 0.86, d === 5.0 ? BLACK : 0x2f7de1, 16);
  rod(S, at(5.55), at(5.62), 0.7, 0x123050, 16);
  glowPut(ctx, geo('disc16'), 0x7ad8ff, seg(at(5.6), at(5.66), 0.66, 0.66), 0.9);
  rod(S, at(-2.9), at(-2.6), 0.35, DARK, 8);
  rod(S, at(1.6), [at(1.6)[0], at(1.6)[1] + 0.55, at(1.6)[2]], 0.18, DARK, 8);
  ctx.colliderOnly(-0.9, Y0, -0.9, 0.9, Y0 + 2.0, 0.9);
  // Mesas de control con pantallas, sillas y mapa estelar
  for (const [x, z, yaw] of [[-3.15, -3.35, 0.75], [3.15, -3.35, -0.75]]) {
    S.put(geo('box'), 0x55575c, M(x, Y0 + 0.45, z, 0, yaw, 0, 1.8, 0.9, 0.8));
    for (const o of [-0.45, 0.45]) {
      const px = x + Math.cos(yaw) * o, pz = z - Math.sin(yaw) * o;
      S.put(geo('box'), BLACK, M(px - Math.sin(yaw) * 0.2, Y0 + 1.25, pz - Math.cos(yaw) * 0.2, -0.2, yaw, 0, 0.7, 0.5, 0.06));
      glowPut(ctx, geo('box'), o < 0 ? 0x3aa8ff : 0x5dffb0, M(px - Math.sin(yaw) * 0.17, Y0 + 1.25, pz - Math.cos(yaw) * 0.17, -0.2, yaw, 0, 0.62, 0.42, 0.02), 1.3);
    }
    S.put(geo('box'), 0x2a2c30, M(x + Math.sin(yaw) * 0.9, Y0 + 0.5, z + Math.cos(yaw) * 0.9, 0, yaw, 0, 0.55, 0.1, 0.55));
    ctx.colliderOnly(x - 0.85, Y0, z - 0.85, x + 0.85, Y0 + 0.9, z + 0.85);
  }
  // mapa estelar en la pared del fondo
  const back = Math.PI;
  for (let k = 0; k < 18; k++) {
    const a = back + (rng.next() - 0.5) * 0.7, y = Y0 + 1.4 + rng.next() * 2.4;
    glowPut(ctx, geo('box'), k % 5 ? 0xffffff : 0xffd34d, M(...P(a, RD - 0.12, y), 0, a, 0, 0.09, 0.09, 0.02), 1.6);
  }
  S.poly([P(back - 0.4, RD - 0.1, Y0 + 1.2), P(back + 0.4, RD - 0.1, Y0 + 1.2), P(back + 0.4, RD - 0.1, Y0 + 4.0), P(back - 0.4, RD - 0.1, Y0 + 4.0)], 0x0d1f4a, P(back, RD * 3, Y0 + 2));
  ctx.spot(ctx.chestSpots, -3.8, Y0, 1.6, 0, 0);
  ctx.spot(ctx.chestSpots, 3.8, Y0, 1.6, 0, 0);
  ctx.spot(ctx.lootSpots, 0, Y0, 2.6);
  ctx.spot(ctx.ammoSpots, 0, Y0, -3.6, 0, 0);
}

// Laboratorio de dos plantas (destructible) con placas solares y antenas.
function genObsLab(ctx, rng) {
  const S = sinkCtx(ctx);
  genHouse(ctx, rng, { W: 12, D: 9, floors: 2, roof: 'flat', roofAccess: true, bigWindows: true, wallColor: 0xe8e2d4 });
  const top = 0.15 + 2 * 3.2;
  for (let k = 0; k < 3; k++) {
    const x = -4.4 + k * 1.9;
    S.put(geo('box'), 0x1d3a6a, M(x, top + 0.7, -2.6, -0.5, 0, 0, 1.7, 0.06, 1.3));
    S.box(x - 0.05, top, -2.7, x + 0.05, top + 0.55, -2.5, STEEL);
  }
  rod(S, [3.8, top, -2.8], [3.8, top + 3.4, -2.8], 0.05, STEEL, 4);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    rod(S, [3.8, top + 3.3, -2.8], [3.8 + Math.sin(a) * 0.5, top + 3.3, -2.8 + Math.cos(a) * 0.5], 0.02, STEEL, 3);
    S.put(geo('hemi8'), WHITE, M(3.8 + Math.sin(a) * 0.5, top + 3.3, -2.8 + Math.cos(a) * 0.5, Math.PI / 2, a, 0, 0.14, 0.14, 0.14));
  }
  S.put(geo('hemi12'), STEEL_L, M(1.5, top + 1.2, -2.6, -2.2, 0.8, 0, 0.9, 0.35, 0.9));
  rod(S, [1.5, top, -2.6], [1.5, top + 1.1, -2.6], 0.06, STEEL, 4);
  rod(S, [-1.5, top, 2.8], [-1.5, top + 2.6, 2.8], 0.04, STEEL, 4);
  bulb(ctx, -1.5, top + 2.65, 2.8, 0xff3030, 0.08);
}

// Radiotelescopio: base, pedestal, horquilla y antena parabólica.
function genDish(ctx, rng) {
  const S = sinkCtx(ctx);
  ctx.box(-1.8, -1, -1.8, 1.8, 0.8, 1.8, CONC);
  cyl(S, 0, 0.8, 0, 0.75, 3.4, STEEL_L, 12);
  ctx.colliderOnly(-0.7, 0.8, -0.7, 0.7, 4.2, 0.7);
  cyl(S, 0, 4.2, 0, 1.1, 0.4, DARK, 12);
  const AZ = rng.float(0, Math.PI * 2), EL = rng.float(0.65, 1.05);
  const aim = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
  const e1 = new THREE.Vector3().crossVectors(aim, UP).normalize();
  const e2 = new THREE.Vector3().crossVectors(e1, aim).normalize();
  const C = new THREE.Vector3(0, 5.6, 0).addScaledVector(aim, 0.5);
  for (const s of [-1, 1]) beam(S, [e1.x * s * 1.0, 4.6, e1.z * s * 1.0], [e1.x * s * 1.0, 5.7, e1.z * s * 1.0], 0.25, 0.25, STEEL_L);
  rod(S, [-e1.x * 1.1, 5.6, -e1.z * 1.1], [e1.x * 1.1, 5.6, e1.z * 1.1], 0.18, DARK, 8);
  const DR = 4.2, DD = 1.1, NR = 5, NA = 20;
  const Pd = (r, a) => {
    const v = C.clone().addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r).addScaledVector(aim, DD * (r / DR) ** 2);
    return [v.x, v.y, v.z];
  };
  const back = C.clone().addScaledVector(aim, -2), front = C.clone().addScaledVector(aim, 4);
  for (let i = 0; i < NR; i++) {
    const r0 = (DR * i) / NR, r1 = (DR * (i + 1)) / NR;
    for (let k = 0; k < NA; k++) {
      const a0 = (k / NA) * Math.PI * 2, a1 = ((k + 1) / NA) * Math.PI * 2;
      const v = i === 0 ? [Pd(0, 0), Pd(r1, a0), Pd(r1, a1)] : [Pd(r0, a0), Pd(r1, a0), Pd(r1, a1), Pd(r0, a1)];
      S.poly(v, (i + k) % 2 ? WHITE : 0xe6e9ee, [back.x, back.y, back.z]);
      S.poly(v, STEEL_W, [front.x, front.y, front.z]);
    }
  }
  for (let k = 0; k < NA; k++) rod(S, Pd(DR, (k / NA) * Math.PI * 2), Pd(DR, ((k + 1) / NA) * Math.PI * 2), 0.08, STEEL_L, 4);
  const F = C.clone().addScaledVector(aim, (DR * DR) / (4 * DD));
  const Fa = [F.x, F.y, F.z];
  for (let k = 0; k < 4; k++) rod(S, Pd(DR * 0.97, (k / 4) * Math.PI * 2 + 0.4), Fa, 0.05, STEEL_W, 4);
  S.put(geo('disc8'), DARK, seg(Fa, [F.x - aim.x * 0.6, F.y - aim.y * 0.6, F.z - aim.z * 0.6], 0.3, 0.3));
  bulb(ctx, F.x + aim.x * 0.1, F.y + aim.y * 0.1, F.z + aim.z * 0.1, 0xff3030, 0.1);
  for (let k = 0; k < 4; k++) rod(S, Pd(DR * 0.5, (k / 4) * Math.PI * 2), [0, 5.6, 0], 0.08, STEEL, 4);
  ctx.spot(ctx.lootSpots, 2.6, 0, 0);
}

// Mástil de antenas con plataforma (escalera de mano) y luces rojas.
function genMast(ctx, rng) {
  const S = sinkCtx(ctx);
  const H = 26, a = 0.9, PL = 14;
  ctx.box(-1.4, -1, -1.4, 1.4, 0.4, 1.4, CONC);
  const w = (y) => a * (1 - (0.6 * (y - 0.4)) / H);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let y = 0.4, k = 0; y < H - 0.1; y += 2.6, k++) {
    const y1 = Math.min(H, y + 2.6), c = k % 2 ? WHITE : RED;
    for (const [sx, sz] of corners) beam(S, [sx * w(y), y, sz * w(y)], [sx * w(y1), y1, sz * w(y1)], 0.12, 0.12, c);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      beam(S, [ax * w(y1), y1, az * w(y1)], [bx * w(y1), y1, bz * w(y1)], 0.07, 0.07, c);
      beam(S, [ax * w(y), y, az * w(y)], [bx * w(y1), y1, bz * w(y1)], 0.05, 0.05, STEEL);
    }
  }
  ctx.colliderOnly(-a, 0.4, -a, a, H, a);
  for (let i = 0; i < 4; i++) rod(S, [corners[i][0] * 0.2, H, corners[i][1] * 0.2], [corners[i][0] * 0.2, H + 3 + i, corners[i][1] * 0.2], 0.04, STEEL, 4);
  for (const y of [H + 0.2, PL + 4, H + 6.5]) bulb(ctx, 0, y, 0, 0xff2a2a, 0.18);
  // plataforma con hueco para la escalera
  ctx.box(-2.2, PL, -2.2, 2.2, PL + 0.25, 0.7, 0x6f747a);
  ctx.box(-2.2, PL, 0.7, -0.65, PL + 0.25, 2.2, 0x6f747a);
  ctx.box(0.65, PL, 0.7, 2.2, PL + 0.25, 2.2, 0x6f747a);
  ctx.box(-0.65, PL, 1.6, 0.65, PL + 0.25, 2.2, 0x6f747a);
  railing(ctx, S, -2.2, -2.2, 2.2, -2.2, PL + 0.25, DARK);
  railing(ctx, S, -2.2, -2.2, -2.2, 2.2, PL + 0.25, DARK);
  railing(ctx, S, 2.2, -2.2, 2.2, 2.2, PL + 0.25, DARK);
  railing(ctx, S, -2.2, 2.2, -0.7, 2.2, PL + 0.25, DARK);
  railing(ctx, S, 0.7, 2.2, 2.2, 2.2, PL + 0.25, DARK);
  ctx.ladderVisual(0, 1.15, 0.4, PL + 0.25, 'x');
  S.box(-1.8, PL + 0.25, -1.9, -0.9, PL + 1.3, -1.2, 0xd8d4c8);
  ctx.spot(ctx.chestSpots, 1.4, PL + 0.25, -1.4, 0, 0);
}

// Barracón semicilíndrico de chapa con puerta en un extremo.
function genQuonset(ctx, rng) {
  const S = sinkCtx(ctx);
  const R = 3.0, L = 4.5, N = 12, Y = 0.15, DW = 1.25, DH = 2.5;
  ctx.box(-R - 0.2, -0.6, -L - 0.2, R + 0.2, Y, L + 0.2, CONC);
  const p = (a, z, r = R) => [Math.cos(a) * r, Y + Math.sin(a) * r, z];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI, a1 = ((k + 1) / N) * Math.PI;
    const v = [p(a0, -L), p(a1, -L), p(a1, L), p(a0, L)];
    S.poly(v, 0x8c96a0, [0, 0.5, 0]);
    S.poly(v, 0x9aa3ad, [Math.cos((a0 + a1) / 2) * R * 3, Y + Math.sin((a0 + a1) / 2) * R * 3, 0]);
  }
  for (let z = -L; z <= L + 0.01; z += 1.5) {
    for (let k = 0; k < N; k++) rod(S, p((k / N) * Math.PI, z, R + 0.05), p(((k + 1) / N) * Math.PI, z, R + 0.05), 0.05, STEEL, 4);
  }
  // fachadas: la del fondo entera, la de delante con puerta
  const arc = (z, x0, x1) => {
    const v = [];
    for (let k = 0; k <= 8; k++) {
      const x = x0 + ((x1 - x0) * k) / 8;
      v.push([x, Y + Math.sqrt(Math.max(0, R * R - x * x)), z]);
    }
    return v;
  };
  const both = (v, z) => {
    S.poly(v, 0xd8d4c8, [0, 1, z - Math.sign(z)]);
    S.poly(v, 0xd8d4c8, [0, 1, z + Math.sign(z)]);
  };
  both([[R, Y, -L], ...arc(-L, R, -R).slice(1, -1), [-R, Y, -L]], -L);
  for (const [x0, x1] of [[-R, -DW], [DW, R]]) both([[x0, Y, L], [x1, Y, L], ...arc(L, x1, x0)], L);
  both([[-DW, Y + DH, L], [DW, Y + DH, L], ...arc(L, DW, -DW)], L);
  for (const s of [-1, 1]) ctx.box(s * DW - 0.1, Y, L - 0.05, s * DW + 0.1, Y + DH, L + 0.14, DARK, false);
  ctx.box(-DW - 0.1, Y + DH, L - 0.05, DW + 0.1, Y + DH + 0.12, L + 0.14, DARK, false);
  ctx.box(-1.4, Y + DH + 0.12, L, 1.4, Y + DH + 0.22, L + 0.9, DARK, false);
  bulb(ctx, 0, Y + DH + 0.05, L + 0.4, 0xfff1c0, 0.1);
  // Colisiones que siguen el arco (por dentro se anda de pie)
  for (const s of [-1, 1]) {
    ctx.colliderOnly(s > 0 ? R - 0.6 : -R, Y, -L, s > 0 ? R : -R + 0.6, Y + 1.8, L);
    ctx.colliderOnly(s > 0 ? 1.6 : -R + 0.6, Y + 1.8, -L, s > 0 ? R - 0.6 : -1.6, Y + 2.55, L);
  }
  ctx.colliderOnly(-1.6, Y + 2.55, -L, 1.6, Y + R, L);
  ctx.colliderOnly(-R, Y, -L - 0.1, R, Y + R, -L + 0.1);
  ctx.colliderOnly(-R, Y, L - 0.1, -DW, Y + R, L + 0.1);
  ctx.colliderOnly(DW, Y, L - 0.1, R, Y + R, L + 0.1);
  ctx.colliderOnly(-DW, Y + DH, L - 0.1, DW, Y + R, L + 0.1);
  // dentro: literas, mesa con radio y cajas
  ctx.box(-2.35, Y, -3.9, -1.35, Y + 0.55, -1.5, 0x6f7a55);
  ctx.box(-2.35, Y + 1.35, -3.9, -1.35, Y + 1.5, -1.5, 0x6f7a55, false);
  for (const z of [-3.85, -1.55]) S.box(-1.42, Y + 0.55, z - 0.04, -1.36, Y + 1.5, z + 0.04, STEEL);
  ctx.box(1.2, Y, -2.6, 2.2, Y + 0.8, -1.2, WOOD);
  S.box(1.4, Y + 0.8, -2.3, 1.9, Y + 1.1, -1.6, DARK);
  glowBox(ctx, 1.45, Y + 0.9, -1.62, 1.8, Y + 1.03, -1.58, 0x5dffb0, 1.4);
  rod(S, [0.4, Y + R, -2], [0.4, Y + R + 1.6, -2], 0.04, STEEL, 4);
  ctx.box(-2.3, Y, 2.4, -1.4, Y + 0.8, 3.4, 0x8b6a40);
  ctx.spot(ctx.chestSpots, 1.6, Y, -3.8, 0, 0);
  ctx.spot(ctx.lootSpots, 0, Y, 1);
}

// Mirador al borde de la cima con prismáticos de monedas.
function genOverlook(ctx, rng) {
  const S = sinkCtx(ctx);
  ctx.box(-4, -0.8, -2, 4, 0.3, 2, WOOD);
  railing(ctx, S, -4, 1.95, 4, 1.95, 0.3, WOOD_D);
  railing(ctx, S, -3.95, -2, -3.95, 1.95, 0.3, WOOD_D);
  railing(ctx, S, 3.95, -2, 3.95, 1.95, 0.3, WOOD_D);
  for (const x of [-1.6, 1.6]) {
    cyl(S, x, 0.3, 1.3, 0.08, 1.1, BLUE, 6);
    S.box(x - 0.3, 1.35, 1.15, x + 0.3, 1.65, 1.5, BLUE);
    for (const o of [-0.13, 0.13]) rod(S, [x + o, 1.5, 1.5], [x + o, 1.5, 1.75], 0.08, DARK, 8);
    ctx.colliderOnly(x - 0.15, 0.3, 1.15, x + 0.15, 1.5, 1.5);
  }
  ctx.box(-1.2, 0.3, -1.7, 1.2, 0.75, -1.3, WOOD_D);
  ctx.spot(ctx.lootSpots, 0, 0.3, 0);
}

// ============================================================ MINA DEL ECO
// Extremos de una rampa de cueva: borde exterior (a ras de suelo), dirección
// hacia dentro y punto donde empieza la galería cubierta.
export function rampEnds(site, side, pos) {
  const C = CELL, { ox, oz, nx, nz } = site;
  let o, d;
  if (side === 0) [o, d] = [[ox, oz + (pos + 0.5) * C], [1, 0]];
  else if (side === 1) [o, d] = [[ox + nx * C, oz + (pos + 0.5) * C], [-1, 0]];
  else if (side === 2) [o, d] = [[ox + (pos + 0.5) * C, oz], [0, 1]];
  else [o, d] = [[ox + (pos + 0.5) * C, oz + nz * C], [0, -1]];
  return { o, d, inner: [o[0] + d[0] * site.L * C, o[1] + d[1] * site.L * C] };
}

// Vagoneta (con mineral que brilla) sobre las vías.
function mineCart(ctx, S, x, y, z, yaw, pitch = 0) {
  const R = (lx, ly, lz) => {
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    const ly2 = ly * cy + lz * sy, lz2 = -ly * sy + lz * cy;
    return [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz2, y + ly2, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz2];
  };
  const part = (lx, ly, lz, sx, sy, sz, c) => S.put(geo('box'), c, M(...R(lx, ly, lz), -pitch, yaw, 0, sx, sy, sz));
  part(0, 0.62, 0, 1.15, 0.7, 1.6, 0x6b5a45);
  part(0, 0.98, 0, 1.25, 0.08, 1.7, DARK);
  for (const lz of [-0.55, 0, 0.55]) part(0, 0.62, lz, 1.2, 0.72, 0.08, DARK);
  part(0, 0.28, 0, 0.9, 0.12, 1.3, DARK);
  for (const lx of [-0.5, 0.5]) for (const lz of [-0.5, 0.5]) S.put(geo('disc8'), BLACK, M(...R(lx, 0.22, lz), 0, yaw + Math.PI / 2, 0, 0.2, 0.2, 0.08));
  for (let k = 0; k < 5; k++) S.put(geo('ico0'), k % 2 ? 0x4f4a44 : 0x6e6a64, M(...R((k % 3) * 0.3 - 0.3, 1.02, (k - 2) * 0.28), 0, k, 0, 0.32, 0.22, 0.3));
  for (let k = 0; k < 2; k++) glowPut(ctx, geo('cone6'), k ? 0xffb347 : 0x5ff2ff, M(...R(k ? 0.25 : -0.2, 1.15, k ? -0.3 : 0.35), 0.3, k, 0.2, 0.09, 0.32, 0.09), 1.8);
}

// Vías de vagonetas a lo largo de una polilínea; yAt da la altura del suelo.
function railTrack(S, path, yAt) {
  const pts = [];
  for (let k = 0; k < path.length - 1; k++) {
    const [ax, az] = path[k], [bx, bz] = path[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.7));
    for (let q = 0; q < n; q++) pts.push([ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n]);
  }
  pts.push(path[path.length - 1]);
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const lx = -(bz - az) / L, lz = (bx - ax) / L;
    const ya = yAt(ax, az), yb = yAt(bx, bz);
    for (const s of [-0.5, 0.5]) beam(S, [ax + lx * s, ya + 0.14, az + lz * s], [bx + lx * s, yb + 0.14, bz + lz * s], 0.08, 0.1, STEEL);
    beam(S, [ax + lx * 0.75, ya + 0.05, az + lz * 0.75], [ax - lx * 0.75, ya + 0.05, az - lz * 0.75], 0.18, 0.08, WOOD_D);
  }
}

// Farol de mina colgado (sin colisión).
function lantern(ctx, S, x, y, z) {
  rod(S, [x, y + 0.55, z], [x, y + 0.2, z], 0.02, DARK, 3);
  S.box(x - 0.14, y - 0.18, z - 0.14, x + 0.14, y - 0.14, z + 0.14, DARK);
  S.box(x - 0.12, y + 0.14, z - 0.12, x + 0.12, y + 0.2, z + 0.12, DARK);
  glowBox(ctx, x - 0.1, y - 0.14, z - 0.1, x + 0.1, y + 0.14, z + 0.1, 0xffb35a, 2.2);
}

// Entibado, vías, vagonetas y faroles dentro de la mina (después de
// construir la cueva: se les hornea la misma luz que a las paredes).
export function decorateMine(site, ctx, glow, rng) {
  const from = ctx.geo.pos.length;
  ctx.fx = { glow };
  const S = sinkCtx(ctx);
  const { ox, oz, nx, nz, floor: F } = site;
  const C = CELL, yc = F + site.clear;
  const get = (i, j) => site.get(i, j);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (get(i, j) !== ROOM) continue;
      const cx = ox + (i + 0.5) * C, cz = oz + (j + 0.5) * C;
      const alongX = get(i, j - 1) === SOLID && get(i, j + 1) === SOLID;
      const alongZ = get(i - 1, j) === SOLID && get(i + 1, j) === SOLID;
      if (alongX) {
        for (const s of [-1, 1]) S.box(cx - 0.18, F, cz + s * 1.75 - 0.18, cx + 0.18, yc, cz + s * 1.75 + 0.18, TIMBER);
        S.box(cx - 0.22, yc - 0.4, cz - 2, cx + 0.22, yc, cz + 2, WOOD_D);
      } else if (alongZ) {
        for (const s of [-1, 1]) S.box(cx + s * 1.75 - 0.18, F, cz - 0.18, cx + s * 1.75 + 0.18, yc, cz + 0.18, TIMBER);
        S.box(cx - 2, yc - 0.4, cz - 0.22, cx + 2, yc, cz + 0.22, WOOD_D);
      } else {
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (get(i + di, j + dj) !== SOLID) continue;
          const wx = cx + di * 1.8, wz = cz + dj * 1.8;
          S.box(wx - 0.17, F, wz - 0.17, wx + 0.17, yc, wz + 0.17, TIMBER);
          if (di) S.box(wx - 0.2, yc - 0.35, cz - 2, wx + 0.2, yc, cz + 2, WOOD_D);
          else S.box(cx - 2, yc - 0.35, wz - 0.2, cx + 2, yc, wz + 0.2, WOOD_D);
        }
      }
    }
  }
  // Marcos gruesos donde cada rampa entra en la galería
  for (const r of site.mineRamps) {
    const { d, inner } = rampEnds(site, r.side, r.pos);
    const lx = -d[1], lz = d[0];
    for (const s of [-1, 1]) {
      const px = inner[0] + lx * s * 1.8, pz = inner[1] + lz * s * 1.8;
      ctx.box(px - 0.25, F, pz - 0.25, px + 0.25, yc, pz + 0.25, TIMBER);
    }
    const a = [inner[0] + lx * 2.1, yc - 0.25, inner[1] + lz * 2.1], b = [inner[0] - lx * 2.1, yc - 0.25, inner[1] - lz * 2.1];
    beam(S, a, b, 0.5, 0.5, WOOD_D);
  }
  railTrack(S, site.railPath, (x, z) => site.vertexHeight(x, z));
  const [c0, c1] = [site.railPath[2], site.railPath[3]];
  S.put(geo('cyl16'), DARK, M(c0[0], F + 0.02, c0[1], 0, 0, 0, 1.0, 0.1, 1.0));
  const gy = Math.atan2(c1[0] - c0[0], c1[1] - c0[1]);
  const gx = c0[0] + (c1[0] - c0[0]) * 0.6, gz = c0[1] + (c1[1] - c0[1]) * 0.6;
  mineCart(ctx, S, gx, F + 0.1, gz, gy);
  ctx.colliderOnly(gx - 0.8, F, gz - 0.8, gx + 0.8, F + 1.05, gz + 0.8);
  // otra vagoneta a medio subir la rampa lateral
  const r2 = rampEnds(site, site.mineRamps[1].side, site.mineRamps[1].pos);
  const rx = r2.inner[0] - r2.d[0] * 3, rz = r2.inner[1] - r2.d[1] * 3;
  const pitch = Math.atan2(site.D, site.L * C);
  mineCart(ctx, S, rx, site.vertexHeight(rx, rz) + 0.1, rz, Math.atan2(-r2.d[0], -r2.d[1]), pitch);
  for (const [x, z] of site.lanterns) lantern(ctx, S, x, yc - 0.75, z);
  // barriles y cajas en la sala del mineral
  site.bake(ctx.geo, from);
  ctx.fx = null;
}

// Castillete de madera sobre el pozo: poleas, cables, jaula y escaleras.
function genHeadframe(ctx, rng, p) {
  const S = sinkCtx(ctx);
  const D = p.depth, TY = 14;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const legs = corners.map(([sx, sz]) => [[sx * 2.25, 0, sz * 2.25], [sx * 1.1, TY, sz * 1.1]]);
  for (const [a, b] of legs) {
    beam(S, a, b, 0.42, 0.42, WOOD_D);
    ctx.box(a[0] - 0.4, -0.2, a[2] - 0.4, a[0] + 0.4, 0.45, a[2] + 0.4, CONC);
    for (let k = 0; k < 3; k++) {
      const p0 = lerp(a, b, k / 3), p1 = lerp(a, b, (k + 1) / 3);
      ctx.colliderOnly(Math.min(p0[0], p1[0]) - 0.22, p0[1], Math.min(p0[2], p1[2]) - 0.22, Math.max(p0[0], p1[0]) + 0.22, p1[1], Math.max(p0[2], p1[2]) + 0.22);
    }
  }
  for (const t of [0.25, 0.5, 0.75]) {
    for (let i = 0; i < 4; i++) {
      const A = lerp(legs[i][0], legs[i][1], t), B = lerp(legs[(i + 1) % 4][0], legs[(i + 1) % 4][1], t);
      beam(S, A, B, 0.22, 0.22, TIMBER);
      const A2 = lerp(legs[i][0], legs[i][1], t - 0.25), B2 = lerp(legs[(i + 1) % 4][0], legs[(i + 1) % 4][1], t);
      beam(S, A2, B2, 0.14, 0.14, TIMBER);
    }
  }
  ctx.box(-1.7, TY, -1.7, 1.7, TY + 0.3, 1.7, WOOD);
  railing(ctx, S, -1.7, -1.7, 1.7, -1.7, TY + 0.3, WOOD_D);
  railing(ctx, S, -1.7, -1.7, -1.7, 1.7, TY + 0.3, WOOD_D);
  railing(ctx, S, -1.7, 1.7, 1.7, 1.7, TY + 0.3, WOOD_D);
  // poleas (en el plano y-z)
  const WY = TY + 1.9, WR = 1.35;
  for (const x of [-0.55, 0.55]) {
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
      rod(S, [x, WY + Math.sin(a0) * WR, Math.cos(a0) * WR], [x, WY + Math.sin(a1) * WR, Math.cos(a1) * WR], 0.09, 0x9a3030, 5);
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      rod(S, [x, WY, 0], [x, WY + Math.sin(a) * WR, Math.cos(a) * WR], 0.04, 0x9a3030, 4);
    }
    beam(S, [x * 2.2, TY + 0.3, -0.9], [x * 1.4, WY, 0], 0.18, 0.18, TIMBER);
    beam(S, [x * 2.2, TY + 0.3, 0.9], [x * 1.4, WY, 0], 0.18, 0.18, TIMBER);
  }
  rod(S, [-0.9, WY, 0], [0.9, WY, 0], 0.12, DARK, 8);
  // tirantes hacia la casa de máquinas
  const back = Math.min(Math.max(4, (p.hoist || 12) - 5), 9);
  for (const sx of [-1, 1]) {
    beam(S, [sx * 1.1, TY - 0.4, 1.1], [sx * 2.0, 0, back], 0.36, 0.36, WOOD_D);
    ctx.box(sx * 2.0 - 0.4, -0.2, back - 0.4, sx * 2.0 + 0.4, 0.4, back + 0.4, CONC);
    ctx.colliderOnly(sx * 2.0 - 0.25, 0, back - 0.25, sx * 2.0 + 0.25, 2.5, back + 0.25);
  }
  // cables: a la jaula del pozo y hacia el tambor de la casa de máquinas
  for (const x of [-0.55, 0.55]) {
    rod(S, [x, WY, -WR], [x * 0.5, 10.05, -0.6], 0.03, DARK, 3);
    rod(S, [x, WY + WR, 0], [x * 0.6, 1.8, (p.hoist || 12) - 3.4], 0.03, DARK, 3);
  }
  const cg = (x0, y0, z0, x1, y1, z1) => S.box(x0, y0, z0, x1, y1, z1, DARK);
  cg(-0.75, 7.5, -1.35, 0.75, 7.62, 0.15);
  cg(-0.75, 9.9, -1.35, 0.75, 10.02, 0.15);
  for (const [x, z] of [[-0.75, -1.35], [0.69, -1.35], [-0.75, 0.09], [0.69, 0.09]]) cg(x, 7.5, z, x + 0.06, 10.0, z + 0.06);
  for (let k = 1; k < 6; k++) {
    cg(-0.75 + k * 0.25, 7.6, -1.37, -0.72 + k * 0.25, 9.9, -1.33);
    cg(-0.75 + k * 0.25, 7.6, 0.11, -0.72 + k * 0.25, 9.9, 0.15);
  }
  // brocal de madera alrededor del pozo y escaleras de mano
  for (const s of [-1, 1]) {
    S.box(-2.25, -0.05, s * 2.05 - 0.17, 2.25, 0.25, s * 2.05 + 0.17, WOOD_D);
    S.box(s * 2.05 - 0.17, -0.05, -2.25, s * 2.05 + 0.17, 0.25, 2.25, WOOD_D);
  }
  ctx.ladderVisual(0, -1.85, -D, 0, 'x');
  ctx.ladderVisual(2.2, 0, 0, TY + 0.3, 'z');
  bulb(ctx, 0, WY + WR + 0.35, 0, 0xff3030, 0.15);
  for (const [sx, sz] of corners) lantern(ctx, S, sx * 1.8, 4.2, sz * 1.8);
  ctx.spot(ctx.chestSpots, -0.9, TY + 0.3, -0.9, 0, 0);
}

// Casa de máquinas (destructible): tambor del cable, motor y chimenea.
function genHoist(ctx, rng) {
  const S = sinkCtx(ctx);
  const hw = 4.5, hd = 3.5, H = 4.2, t = 0.25, COR = 0xa0927d;
  ctx.box(-hw - 0.3, -1.5, -hd - 0.3, hw + 0.3, 0.15, hd + 0.3, CONC);
  ctx.wall('x', -hw, hw, -hd, -hd + t, 0.15, H, [{ a: -2.6, b: -1.2, bottom: 1.4, top: 2.6 }, { a: 1.2, b: 2.6, bottom: 1.4, top: 2.6 }], COR);
  ctx.wall('x', -hw, hw, hd - t, hd, 0.15, H, [{ a: -1.6, b: 1.6, bottom: 0.15, top: 3.2 }], COR);
  ctx.wall('z', -hd + t, hd - t, -hw, -hw + t, 0.15, H, [{ a: -0.75, b: 0.75, bottom: 0.15, top: 2.4 }], COR);
  ctx.door(-0.75, 0.75, -hw, -hw + t, 0.15, 2.4);
  ctx.wall('z', -hd + t, hd - t, hw - t, hw, 0.15, H, [{ a: -0.7, b: 0.7, bottom: 1.4, top: 2.6 }], COR);
  ctx.slab(-hw + t, -hd + t, hw - t, hd - t, H - 0.2, H, null, WOOD);
  ctx.gableRoof(hw + 0.4, hd + 0.4, H, 2.1, 0x7a2f2f, COR);
  // tambor y motor
  for (const x of [-1.9, 1.9]) ctx.box(x - 0.3, 0.15, -0.9, x + 0.3, 1.6, -0.1, DARK);
  S.put(geo('disc16'), 0x5a3d22, seg([-1.6, 1.6, -0.5], [1.6, 1.6, -0.5], 0.95, 0.95));
  for (const x of [-1.6, 1.6]) S.put(geo('disc16'), 0x9a3030, seg([x - 0.06, 1.6, -0.5], [x + 0.06, 1.6, -0.5], 1.25, 1.25));
  ctx.box(-1.2, 0.15, -3.1, 1.6, 1.3, -2.0, 0x55575c);
  S.put(geo('disc16'), DARK, seg([1.75, 1.5, -2.6], [1.95, 1.5, -2.6], 1.0, 1.0));
  rod(S, [-0.8, 0.15, 1.4], [-0.6, 1.3, 1.6], 0.04, DARK, 4);
  for (let k = 0; k < 2; k++) rod(S, [-0.3 + k * 0.6, 2.4, -0.5], [-0.3 + k * 0.6, 1.9, hd + 0.3], 0.03, DARK, 3);
  cyl(S, 3.0, H - 0.5, -2.2, 0.32, 4.8, DARK, 10);
  cyl(S, 3.0, H + 4.2, -2.2, 0.42, 0.25, BLACK, 10);
  ctx.spot(ctx.chestSpots, -3.6, 0.15, -2.6, 0, 0);
  ctx.spot(ctx.lootSpots, 2.6, 0.15, 1.2);
}

// Cobertizo de madera (destructible).
function genMineShed(ctx, rng, p) {
  const S = sinkCtx(ctx);
  const hw = p.W / 2, hd = p.D / 2, H = 3.0, t = 0.2;
  ctx.box(-hw - 0.2, -1, -hd - 0.2, hw + 0.2, 0.15, hd + 0.2, WOOD_L);
  ctx.wall('x', -hw, hw, -hd, -hd + t, 0.15, H, [], PLANK);
  ctx.wall('x', -hw, hw, hd - t, hd, 0.15, H, [{ a: -0.8, b: 0.8, bottom: 0.15, top: 2.3 }, { a: hw - 2.0, b: hw - 0.9, bottom: 1.1, top: 2.1 }], PLANK);
  ctx.door(-0.8, 0.8, hd - t, hd, 0.15, 2.3);
  for (const s of [-1, 1]) ctx.wall('z', -hd + t, hd - t, s > 0 ? hw - t : -hw, s > 0 ? hw : -hw + t, 0.15, H, [{ a: -0.6, b: 0.6, bottom: 1.1, top: 2.0 }], PLANK);
  ctx.slab(-hw + t, -hd + t, hw - t, hd - t, H - 0.2, H, null, WOOD);
  ctx.gableRoof(hw + 0.4, hd + 0.4, H, Math.min(p.W, p.D) * 0.3, 0x5b4636, PLANK);
  ctx.box(-hw + t, 0.15, -hd + t, -hw + t + 0.6, 2.0, hd - t - 1.2, WOOD);
  for (let k = 0; k < 3; k++) S.box(-hw + t + 0.05, 0.6 + k * 0.55, -hd + 0.5, -hw + t + 0.55, 0.85 + k * 0.55, -hd + 1.0 + k * 0.4, FLAGS[k]);
  ctx.box(hw - 1.8, 0.15, -hd + t + 0.2, hw - t - 0.1, 0.95, -hd + t + 1.2, WOOD_D);
  for (let k = 0; k < 2; k++) {
    rod(S, [hw - 1.5 + k * 0.6, 0.95, -hd + 0.6], [hw - 1.3 + k * 0.6, 1.9, -hd + 0.5], 0.035, WOOD, 4);
    S.box(hw - 1.65 + k * 0.6, 1.8, -hd + 0.4, hw - 1.15 + k * 0.6, 1.95, -hd + 0.6, STEEL);
  }
  for (let k = 0; k < 2; k++) cyl(S, -hw + 0.9 + k * 0.85, 0.15, hd + 0.7, 0.38, 1.0, k ? 0x8a5040 : WOOD_D, 10);
  ctx.colliderOnly(-hw + 0.5, 0.15, hd + 0.3, -hw + 2.1, 1.15, hd + 1.1);
  if (!p.small) {
    for (let k = 0; k < 4; k++) rod(S, [hw + 0.5, 0.35 + k * 0.32, -hd + 0.6], [hw + 0.5, 0.35 + k * 0.32, hd - 0.6], 0.16, k % 2 ? 0x8a6a48 : 0x7a5a3a, 6);
    ctx.colliderOnly(hw + 0.3, 0.15, -hd + 0.6, hw + 0.7, 1.4, hd - 0.6);
  }
  ctx.spot(ctx.chestSpots, hw - t - 0.7, 0.15, hd - t - 0.7, 0, 0);
  ctx.spot(ctx.lootSpots, 0, 0.15, -0.4);
}

// Estructura de madera de varios pisos (tolva y andamios).
function timberTower(ctx, S, hw, hd, levels) {
  const H = levels[levels.length - 1] + 1.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ctx.box(sx * hw - 0.2, 0, sz * hd - 0.2, sx * hw + 0.2, H, sz * hd + 0.2, TIMBER);
  let y0 = 0;
  for (const y of levels) {
    for (const s of [-1, 1]) {
      beam(S, [-hw, y0 + 0.2, s * hd], [hw, y - 0.2, s * hd], 0.14, 0.14, WOOD_D);
      beam(S, [s * hw, y0 + 0.2, -hd], [s * hw, y - 0.2, hd], 0.14, 0.14, WOOD_D);
    }
    y0 = y;
  }
}

// Tolva de carga (destructible): dos pisos, escaleras, tolva y rampa.
function genTipple(ctx, rng) {
  const S = sinkCtx(ctx);
  const hw = 3.4, hd = 3.4;
  timberTower(ctx, S, hw, hd, [4, 8]);
  ctx.slab(-hw - 0.3, -hd - 0.3, hw + 0.3, hd + 0.3, 3.8, 4.0, { x0: 2.3, z0: -0.6, x1: 3.3, z1: 0.6 }, WOOD_L);
  ctx.slab(-hw - 0.3, -hd - 0.3, hw + 0.3, hd + 0.3, 7.8, 8.0, { x0: -3.3, z0: -0.6, x1: -2.3, z1: 0.6 }, WOOD_L);
  ctx.ladderVisual(2.8, 0, 0, 4.0, 'z');
  ctx.ladderVisual(-2.8, 0, 4.0, 8.0, 'z');
  railing(ctx, S, -hw - 0.3, -hd - 0.3, hw + 0.3, -hd - 0.3, 8.0, WOOD_D);
  railing(ctx, S, hw + 0.3, -hd - 0.3, hw + 0.3, hd + 0.3, 8.0, WOOD_D);
  railing(ctx, S, -hw - 0.3, hd + 0.3, hw + 0.3, hd + 0.3, 8.0, WOOD_D);
  railing(ctx, S, -hw - 0.3, -hd - 0.3, -hw - 0.3, -1.0, 8.0, WOOD_D);
  // tolva sobre la mitad trasera del piso de arriba
  const hy0 = 8.0, hy1 = 10.6, a = 2.3, b = 0.7, zc = -1.6;
  const q = (x, y, z) => [x, y, zc + z];
  const sides = [
    [q(-b, hy0 + 0.6, -b), q(b, hy0 + 0.6, -b), q(a, hy1, -a * 0.6), q(-a, hy1, -a * 0.6)],
    [q(-b, hy0 + 0.6, b), q(b, hy0 + 0.6, b), q(a, hy1, a * 0.6), q(-a, hy1, a * 0.6)],
    [q(-b, hy0 + 0.6, -b), q(-b, hy0 + 0.6, b), q(-a, hy1, a * 0.6), q(-a, hy1, -a * 0.6)],
    [q(b, hy0 + 0.6, -b), q(b, hy0 + 0.6, b), q(a, hy1, a * 0.6), q(a, hy1, -a * 0.6)],
  ];
  for (const v of sides) poly2(S, v, PLANK, WOOD_D);
  for (const [x, z] of [[-1.6, -1.4], [1.6, -1.4], [-1.6, 1.4], [1.6, 1.4]]) beam(S, [x * 0.8, hy0, zc + z * 0.8], [x, hy1, zc + z], 0.16, 0.16, TIMBER);
  for (let k = 0; k < 6; k++) S.put(geo('ico0'), k % 2 ? 0x4f4a44 : 0x6e6a64, M((k % 3) * 0.9 - 0.9, hy1 - 0.25, zc + (k < 3 ? -0.4 : 0.5), 0, k, 0, 0.6, 0.35, 0.5));
  glowPut(ctx, geo('cone6'), 0x5ff2ff, M(0.3, hy1 - 0.05, zc, 0.3, 0, 0.2, 0.12, 0.45, 0.12), 1.8);
  ctx.colliderOnly(-a * 0.7, hy0, zc - 1.2, a * 0.7, hy1, zc + 1.2);
  // rampa de descarga
  beam(S, [0, 7.6, hd - 0.4], [0, 2.0, hd + 2.6], 1.2, 0.12, PLANK);
  for (const s of [-1, 1]) beam(S, [s * 0.62, 7.9, hd - 0.4], [s * 0.62, 2.3, hd + 2.6], 0.1, 0.5, WOOD_D);
  mineCart(ctx, S, 0, 0, hd + 2.8, 0);
  ctx.colliderOnly(-0.7, 0, hd + 2.0, 0.7, 1.05, hd + 3.6);
  ctx.spot(ctx.chestSpots, 2.4, 8.0, 2.4, 0, 0);
  ctx.spot(ctx.lootSpots, -1.5, 4.0, 1.5);
  ctx.spot(ctx.ammoSpots, -2, 0, 2, 0, 0);
}

// Andamios de madera (destructible) con cajas y barriles.
function genScaffold(ctx, rng) {
  const S = sinkCtx(ctx);
  const hw = 2.7, hd = 3.7;
  timberTower(ctx, S, hw, hd, [3, 6]);
  ctx.slab(-hw - 0.2, -hd - 0.2, hw + 0.2, hd + 0.2, 2.8, 3.0, { x0: 1.6, z0: -3.6, x1: 2.6, z1: -2.6 }, WOOD_L);
  ctx.slab(-hw - 0.2, -hd - 0.2, hw + 0.2, hd + 0.2, 5.8, 6.0, { x0: -2.6, z0: 2.6, x1: -1.6, z1: 3.6 }, WOOD_L);
  ctx.ladderVisual(2.1, -3.1, 0, 3.0, 'x');
  ctx.ladderVisual(-2.1, 3.1, 3.0, 6.0, 'x');
  for (const y of [3.0, 6.0]) {
    railing(ctx, S, -hw - 0.2, hd + 0.2, y === 6 ? -2.7 : hw + 0.2, hd + 0.2, y, WOOD_D);
    railing(ctx, S, hw + 0.2, -hd - 0.2, hw + 0.2, hd + 0.2, y, WOOD_D);
  }
  ctx.box(-2.2, 3.0, -0.4, -1.0, 4.2, 0.8, 0x8b6a40);
  ctx.box(-1.0, 3.0, -0.2, 0.0, 3.9, 0.8, 0x9a7240);
  ctx.box(0.6, 6.0, -1.0, 1.8, 7.2, 0.2, 0x8b6a40);
  ctx.box(-0.8, 6.0, -2.4, 0.4, 6.9, -1.2, 0xc0392b);
  for (let k = 0; k < 3; k++) cyl(S, 1.8 - k * 0.8, 0, 2.8, 0.36, 1.0, k % 2 ? 0x8a5040 : WOOD_D, 10);
  ctx.colliderOnly(-0.6, 0, 2.4, 2.2, 1.0, 3.2);
  ctx.spot(ctx.chestSpots, -1.6, 6.0, -1.8, 0, 0);
  ctx.spot(ctx.lootSpots, 1.0, 3.0, 1.5);
}

// Montones de mineral con cristales y un pico clavado.
function genOrePile(ctx, rng) {
  const S = sinkCtx(ctx);
  const piles = [[0, 0, 2.6, 2.4], [rng.float(1.6, 2.2), rng.float(-1.5, 1.5), 1.5, 1.4], [rng.float(-2.2, -1.6), rng.float(-1.0, 1.5), 1.7, 1.6]];
  for (const [x, z, r, h] of piles) {
    S.put(geo('cone8'), 0x5a4f45, M(x, h / 2, z, 0, rng.float(0, 3), 0, r, h, r));
    for (let k = 0; k < 5; k++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(0.3, 0.9);
      blob(S, x + Math.cos(a) * r * d, h * (1 - d) * 0.8, z + Math.sin(a) * r * d, 0.35, 0.26, 0.35, rng.pick([0x6e6a64, 0x4f4a44, 0x7d776c]), rng.float(0, 3));
    }
    for (let k = 0; k < 3; k++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(0.3, 0.75);
      glowPut(ctx, geo('cone6'), k % 2 ? 0xffb347 : 0x5ff2ff, M(x + Math.cos(a) * r * d, h * (1 - d) + 0.15, z + Math.sin(a) * r * d, rng.float(-0.5, 0.5), 0, rng.float(-0.5, 0.5), 0.1, 0.45, 0.1), 1.8);
    }
    ctx.colliderOnly(x - r * 0.7, 0, z - r * 0.7, x + r * 0.7, h * 0.45, z + r * 0.7);
    ctx.colliderOnly(x - r * 0.35, 0, z - r * 0.35, x + r * 0.35, h * 0.85, z + r * 0.35);
  }
  rod(S, [0.4, 1.7, 0.6], [0.65, 2.9, 0.75], 0.04, WOOD, 4);
  S.put(geo('box'), STEEL, M(0.66, 2.92, 0.76, 0, 0.3, 1.2, 0.08, 0.9, 0.1));
  S.put(geo('box'), 0x6f747a, M(2.4, 0.55, -2.6, 0.3, 0.6, 0, 0.9, 0.35, 1.3));
  S.put(geo('disc8'), BLACK, M(2.4 + Math.sin(0.6) * 0.75, 0.25, -2.6 + Math.cos(0.6) * 0.75, 0, 0.6 + Math.PI / 2, 0, 0.25, 0.25, 0.08));
  ctx.spot(ctx.ammoSpots, -2.6, 0, -2.6, 0, 0);
  ctx.spot(ctx.lootSpots, 2.8, 0, 2.8);
}

// Cerro rocoso sobre las galerías: malla de alturas (hierba arriba, roca en
// las laderas) con paredes verticales donde se abren las bocas, rocas y
// pinos; las colisiones son columnas de 1 m (sólo se sube escalando).
const _hc = new THREE.Color(), _hr = new THREE.Color(0.47, 0.44, 0.38), _hn = new THREE.Vector3(), _ha = new THREE.Vector3(), _hb = new THREE.Vector3();
function genMineHill(ctx, rng, p) {
  const S = sinkCtx(ctx);
  const w = ctx.fx.world, T = w.terrain, nz = w.noise;
  const H = p.site.H;
  const [na0, nb0, na1, nb1] = p.notch;
  const sm = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const A0 = 2.6, A1 = 10, B1 = 5, D = 0.25; // (en celdas de 4 m; D = 1 m)
  const NI = Math.round((A1 - A0) / D), NJ = Math.round(B1 / D);
  // Frente irregular salvo junto a la boca principal (a = 5..6)
  const front = (a) => (a > 4.55 && a < 6.45 ? B1 : B1 - 0.25 - (nz(a * 0.8 + 17, 3.1) > 0 ? 0.25 : 0));
  const cellIn = (i, j) => {
    if (i < 0 || j < 0 || i >= NI || j >= NJ) return false;
    const a = A0 + (i + 0.5) * D, b = (j + 0.5) * D;
    return b <= front(a) && !(a >= na0 && a <= na1 && b >= nb0 && b <= nb1);
  };
  const L = (a, b) => {
    const [x, z] = p.ab(a, b);
    return [x - p.x, z - p.z];
  };
  const hv = [];
  for (let i = 0; i <= NI; i++) {
    hv.push([]);
    for (let j = 0; j <= NJ; j++) {
      const a = A0 + i * D, b = j * D;
      const [x, z] = p.ab(a, b);
      const f = sm(A0, A0 + 2.4, a) * (1 - sm(8.3, A1, a)) * sm(0, 2.8, b) * (1 - 0.34 * sm(2.8, B1, b));
      const n = nz(x * 0.08, z * 0.08) * 1.1 + nz(x * 0.21 + 40, z * 0.21) * 0.5;
      hv[i].push(Math.max(0, 10 * f + n * Math.min(1, f * 3)));
    }
  }
  const P = (i, j) => {
    const [x, z] = L(A0 + i * D, j * D);
    return [x, hv[i][j], z];
  };
  const ROCKS = [0x8b8579, 0x7d776c, 0x948e82, 0x6e6a64];
  const rockHex = (x, z) => ROCKS[Math.floor((nz(x * 0.3 + 9, z * 0.3) * 0.5 + 0.5) * 3.99)];
  const tri = (a, b, c) => {
    _ha.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _hb.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _hn.crossVectors(_ha, _hb).normalize();
    if (_hn.y < 0) _hn.negate();
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    let hex;
    if (_hn.y < 0.74) hex = rockHex(cx + p.x, cz + p.z);
    else {
      T.colorAt(cx + p.x, cz + p.z, H + cy, 0, _hc, true);
      if (_hn.y < 0.86) _hc.lerp(_hr, (0.86 - _hn.y) * 5);
      hex = _hc.getHex();
    }
    S.poly([a, b, c], hex, [cx, cy - 1, cz]);
  };
  for (let i = 0; i < NI; i++) {
    for (let j = 0; j < NJ; j++) {
      if (!cellIn(i, j)) continue;
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      tri(a, b, c);
      tri(a, c, d);
      // Paredes verticales en el borde (si el cerro ya es alto ahí)
      for (const [di, dj, e0, e1] of [[-1, 0, a, d], [1, 0, b, c], [0, -1, a, b], [0, 1, d, c]]) {
        if (cellIn(i + di, j + dj) || (e0[1] < 0.06 && e1[1] < 0.06)) continue;
        const cx = (a[0] + c[0]) / 2, cz = (a[2] + c[2]) / 2;
        S.poly([[e0[0], -0.5, e0[2]], [e1[0], -0.5, e1[2]], [e1[0], e1[1], e1[2]], [e0[0], e0[1], e0[2]]], rockHex(e0[0] + p.x, e0[2] + p.z), [cx, 0, cz]);
      }
    }
  }
  // Colisiones: columnas de 1 m con la altura media (unidas por filas)
  for (let j = 0; j < NJ; j++) {
    let i = 0;
    while (i < NI) {
      const q = (k) => (cellIn(k, j) ? Math.round(((hv[k][j] + hv[k + 1][j] + hv[k][j + 1] + hv[k + 1][j + 1]) / 4) * 4) / 4 : 0);
      const h = q(i);
      if (h < 0.4) {
        i++;
        continue;
      }
      let e = i;
      while (e + 1 < NI && q(e + 1) === h) e++;
      const [x0, z0] = L(A0 + i * D, j * D), [x1, z1] = L(A0 + (e + 1) * D, (j + 1) * D);
      ctx.colliderOnly(Math.min(x0, x1), -0.2, Math.min(z0, z1), Math.max(x0, x1), h, Math.max(z0, z1));
      i = e + 1;
    }
  }
  // Rocas y pinos
  const spots = [];
  for (let k = 0; k < 260 && spots.length < 22; k++) {
    const i = rng.int(1, NI - 2), j = rng.int(1, NJ - 2);
    if (!cellIn(i, j) || !cellIn(i - 1, j) || !cellIn(i + 1, j) || !cellIn(i, j - 1) || !cellIn(i, j + 1)) continue;
    if (spots.some(([si, sj]) => Math.abs(si - i) + Math.abs(sj - j) < 4)) continue;
    const h = hv[i][j];
    const slope = Math.max(Math.abs(hv[i + 1][j] - hv[i - 1][j]), Math.abs(hv[i][j + 1] - hv[i][j - 1])) / (2 * D * CELL);
    spots.push([i, j]);
    const [x, y, z] = P(i, j);
    if (spots.length % 3 && slope < 0.5 && h > 1.5) {
      // pino
      const s = rng.float(0.8, 1.25);
      cyl(S, x, y - 0.3, z, 0.22 * s, 1.6 * s, 0x6b4a2b, 6);
      for (let t = 0; t < 3; t++) cone(S, x, y + (1.0 + t * 1.15) * s, z, (1.7 - t * 0.42) * s, (2.0 - t * 0.3) * s, t % 2 ? 0x2f5f3a : 0x356b40, 7);
      ctx.colliderOnly(x - 0.25, y, z - 0.25, x + 0.25, y + 3 * s, z + 0.25);
    } else {
      const s = rng.float(0.7, 1.9);
      blob(S, x, y + s * 0.15, z, s * 1.2, s * 0.8, s, rng.pick(ROCKS), rng.float(0, 6));
    }
  }
  // Fachadas de madera con el cartel sobre cada boca
  for (const r of p.site.mineRamps) {
    const { d, inner } = rampEnds(p.site, r.side, r.pos);
    const f = subFx(ctx, inner[0] - p.x, inner[1] - p.z, rotFacing(-d[0], -d[1]));
    const SF = sinkCtx(f);
    const F0 = -p.site.D, top = 1.9;
    for (const s of [-1, 1]) {
      f.box(s * 2.3 - 0.3, F0, -0.3, s * 2.3 + 0.3, top + 0.4, 0.3, TIMBER);
      beam(SF, [s * 2.3, top - 0.3, 0.25], [s * 1.4, top + 0.2, 0.25], 0.2, 0.2, WOOD_D);
      lantern(ctx, SF, s * 2.3, 1.1, 0.5);
    }
    f.box(-2.8, -1.0, -0.05, 2.8, top, 0.22, PLANK);
    f.box(-3.0, top, -0.2, 3.0, top + 0.45, 0.45, WOOD_D);
    poly2(SF, [[-3.2, top + 0.45, -0.1], [3.2, top + 0.45, -0.1], [3.2, top + 0.1, 1.1], [-3.2, top + 0.1, 1.1]], PLANK, WOOD_D);
    f.box(-2.25, 0.05, 0.22, 2.25, 1.35, 0.32, WOOD, false);
    sign(f, r.main ? 'MINA DEL ECO' : 'GALERÍA 2', 'mine', -2.15, 0.1, 2.15, 1.3, 0.33);
  }
}

// Superficie de la mina: vías hasta la tolva, vagoneta, faroles y rocas.
function genMineRails(ctx, rng, p) {
  const S = sinkCtx(ctx);
  const T = ctx.fx.world.terrain;
  const loc = ([x, z]) => [x - p.x, z - p.z];
  const site = p.site;
  railTrack(S, p.rails.map(loc), (x, z) => T.heightAt(x + p.x, z + p.z) - ctx.cy);
  const last = loc(p.rails[p.rails.length - 2]), end = loc(p.rails[p.rails.length - 1]);
  const yaw = Math.atan2(end[0] - last[0], end[1] - last[1]);
  const cx = last[0] + (end[0] - last[0]) * 0.3, cz = last[1] + (end[1] - last[1]) * 0.3;
  mineCart(ctx, S, cx, T.heightAt(cx + p.x, cz + p.z) - ctx.cy, cz, yaw);
  ctx.colliderOnly(cx - 0.8, T.heightAt(cx + p.x, cz + p.z) - ctx.cy, cz - 0.8, cx + 0.8, T.heightAt(cx + p.x, cz + p.z) - ctx.cy + 1.05, cz + 0.8);
  for (const [wx, wz] of p.lamps) {
    const [x, z] = loc([wx, wz]);
    const y = T.heightAt(wx, wz) - ctx.cy;
    S.box(x - 0.12, y, z - 0.12, x + 0.12, y + 3.0, z + 0.12, TIMBER);
    beam(S, [x, y + 2.9, z], [x + 0.7, y + 2.9, z], 0.1, 0.1, TIMBER);
    lantern(ctx, S, x + 0.62, y + 2.3, z);
    ctx.colliderOnly(x - 0.12, y, z - 0.12, x + 0.12, y + 3.0, z + 0.12);
  }
  // Barandilla de troncos y rocas a los lados de la rampa principal
  const main = site.mineRamps.find((r) => r.main);
  const { o, d } = rampEnds(site, main.side, main.pos);
  const a = subFx(ctx, o[0] - p.x, o[1] - p.z, rotFacing(-d[0], -d[1]), site.H - ctx.cy);
  const SA = sinkCtx(a);
  for (const s of [-1, 1]) {
    for (let z = -0.4; z > -11; z -= 2.6) a.box(s * 2.25 - 0.1, 0, z - 0.1, s * 2.25 + 0.1, 1.1, z + 0.1, TIMBER, false);
    beam(SA, [s * 2.25, 1.0, -0.4], [s * 2.25, 1.0, -10.8], 0.12, 0.12, WOOD_D);
    beam(SA, [s * 2.25, 0.55, -0.4], [s * 2.25, 0.55, -10.8], 0.08, 0.08, WOOD_D);
    a.colliderOnly(s * 2.25 - 0.1, 0, -10.8, s * 2.25 + 0.1, 1.1, -0.4);
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const lx = s * rng.float(3.6, 5.6), lz = -rng.float(1.5, 9), r = rng.float(1.4, 2.6);
      a.geometry(geo('ico0'), rng.pick([0x8b8579, 0x9b968b, 0x7d776c]), lx, r * 0.45, lz, r * 1.2, r * 0.9, r, rng.float(0, 6));
      a.colliderOnly(lx - r * 0.8, 0, lz - r * 0.7, lx + r * 0.8, r * 1.1, lz + r * 0.7);
    }
  }
  a.box(-2.4, 0, 0.6, -1.6, 1.0, 1.4, 0xc0392b);
  a.box(-2.45, 1.0, 0.65, -1.55, 1.08, 1.35, WHITE, false);
}

// ============================================================ VILLA MILLONARIA
const WALLW = 0xf6f4ef, FLOORL = 0xc9c2b2, FASCIA = 0x2a2c30;

// Barandilla de cristal (hojas con pasamanos de acero).
function glassRail(ctx, S, x0, z0, x1, z1, y, h = 1.05) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  if (alongX) glassBox(ctx, Math.min(x0, x1), y, z0 - 0.03, Math.max(x0, x1), y + h, z0 + 0.03);
  else glassBox(ctx, x0 - 0.03, y, Math.min(z0, z1), x0 + 0.03, y + h, Math.max(z0, z1));
  beam(S, [x0, y + h + 0.03, z0], [x1, y + h + 0.03, z1], 0.07, 0.07, STEEL_W);
}

// Mansión moderna de dos plantas con terrazas, mucho cristal y escaleras
// hasta la azotea (destructible: cada hoja de cristal es una pieza).
function genMansion(ctx, rng) {
  const S = sinkCtx(ctx);
  const t = 0.3, Y0 = 0.15, G1 = 3.75, F1 = 7.15;
  ctx.box(-11.3, -3, -7.3, 11.3, Y0, 7.3, STONE_L);
  S.box(-10.7, Y0, -6.7, 10.7, Y0 + 0.02, 6.7, FLOORL);
  // --- Planta baja
  const back = [{ a: -1.3, b: 1.3, bottom: Y0, top: Y0 + 2.8 }, { a: 3.5, b: 9.5, bottom: Y0 + 0.9, top: Y0 + 3.1 }, { a: -9.5, b: -4.0, bottom: Y0 + 0.9, top: Y0 + 3.1 }];
  ctx.wall('x', -11, 11, -7, -7 + t, Y0, G1, back, WALLW);
  ctx.door(-1.3, 1.3, -7, -7 + t, Y0, Y0 + 2.8);
  glassBox(ctx, 3.5, Y0 + 0.9, -6.9, 9.5, Y0 + 3.1, -6.8);
  glassBox(ctx, -9.5, Y0 + 0.9, -6.9, -4.0, Y0 + 3.1, -6.8);
  for (let x = 3.9; x < 9.5; x += 0.8) S.box(x - 0.05, Y0 + 0.85, -7.25, x + 0.05, Y0 + 3.15, -7.0, WOOD);
  for (const s of [-1, 1]) {
    ctx.wall('z', -7 + t, 7, s > 0 ? 11 - t : -11, s > 0 ? 11 : -11 + t, Y0, G1, [{ a: -2.5, b: 2.5, bottom: Y0 + 0.9, top: Y0 + 3.1 }], WALLW);
    glassBox(ctx, s * 10.85 - 0.05, Y0 + 0.9, -2.5, s * 10.85 + 0.05, Y0 + 3.1, 2.5);
  }
  // fachada del jardín: pilares finos y cristal de suelo a techo
  const cols = [-11, -6.65, -2.2, 2.2, 6.65, 11];
  for (const x of cols) ctx.box(x - 0.15, Y0, 6.7, x + 0.15, G1, 7, FASCIA);
  ctx.box(-11, G1 - 0.3, 6.7, 11, G1, 7, FASCIA);
  for (let i = 0; i < cols.length - 1; i++) {
    if (i === 2) continue; // puerta corredera abierta
    glassBox(ctx, cols[i] + 0.15, Y0, 6.8, cols[i + 1] - 0.15, G1 - 0.3, 6.9);
  }
  // escalera a la primera planta
  ctx.stairs(-10.6, -9.2, -6.0, 1, Y0, G1 - Y0, 9, FLOORL);
  ctx.slab(-11, -7, 11, 7, G1 - 0.25, G1, { x0: -10.65, z0: -6.05, x1: -9.15, z1: -2.4 }, FLOORL);
  ctx.box(-13, G1 - 0.35, -8, -11, G1, 6, FLOORL);
  ctx.box(-11, G1 - 0.35, -8, 6, G1, -7, FLOORL);
  // muebles: sofá, mesa, cocina, comedor, tele y plantas
  ctx.box(2.5, Y0, 1.6, 7.5, Y0 + 0.45, 2.5, 0x8c867c);
  S.box(2.5, Y0 + 0.45, 1.6, 7.5, Y0 + 1.0, 1.9, 0x8c867c);
  ctx.box(2.5, Y0, 2.5, 3.4, Y0 + 0.45, 4.8, 0x8c867c);
  for (let k = 0; k < 3; k++) S.box(3.6 + k * 1.3, Y0 + 0.45, 1.95, 4.5 + k * 1.3, Y0 + 0.75, 2.2, FLAGS[k + 1]);
  S.box(2.2, Y0 + 0.02, 1.2, 8.2, Y0 + 0.04, 5.6, 0xb8a67a);
  ctx.box(4.4, Y0, 3.4, 6.6, Y0 + 0.42, 4.6, WOOD_D);
  S.box(10.55, Y0 + 1.0, 1.0, 10.68, Y0 + 2.4, 4.4, BLACK);
  S.box(10.5, Y0 + 1.08, 1.1, 10.55, Y0 + 2.32, 4.3, 0x2f6fd6);
  ctx.box(10.0, Y0, 1.0, 10.7, Y0 + 0.5, 4.4, WHITE);
  ctx.box(-8.6, Y0, -6.7, -3.0, Y0 + 0.95, -6.0, WHITE);
  S.box(-8.65, Y0 + 0.95, -6.72, -2.95, Y0 + 1.01, -5.95, BLACK);
  S.box(-8.6, Y0 + 2.0, -6.7, -3.0, Y0 + 2.8, -6.35, WHITE);
  ctx.box(-6.0, Y0, 0.4, -2.6, Y0 + 0.95, 1.6, WHITE);
  S.box(-6.05, Y0 + 0.95, 0.35, -2.55, Y0 + 1.01, 1.65, BLACK);
  ctx.box(-7.5, Y0, 3.6, -3.8, Y0 + 0.78, 5.0, WOOD);
  for (const x of [-7.0, -5.6, -4.3]) for (const z of [3.1, 5.5]) S.box(x - 0.22, Y0, z - 0.22, x + 0.22, Y0 + 0.9, z + 0.22, BLACK);
  for (const [x, z] of [[-10.2, 6.0], [10.2, -6.1], [1.6, -6.2]]) {
    cyl(S, x, Y0, z, 0.32, 0.6, 0xd8cfbd, 10);
    blob(S, x, Y0 + 1.1, z, 0.55, 0.7, 0.55, LEAF[1], 0.3);
  }
  // --- Primera planta (voladiza a la izquierda y atrás)
  ctx.wall('x', -13, 6, -8, -8 + t, G1, F1, [{ a: -7, b: 2, bottom: G1 + 0.6, top: G1 + 2.7 }], WOOD);
  glassBox(ctx, -7, G1 + 0.6, -7.9, 2, G1 + 2.7, -7.8);
  ctx.wall('z', -8 + t, 6, -13, -13 + t, G1, F1, [{ a: -3, b: 3, bottom: G1 + 0.3, top: G1 + 3.0 }], WOOD);
  glassBox(ctx, -12.9, G1 + 0.3, -3, -12.8, G1 + 3.0, 3);
  ctx.wall('z', -8 + t, 6, 6 - t, 6, G1, F1, [{ a: 1.0, b: 2.8, bottom: G1, top: G1 + 2.6 }, { a: -5.5, b: -2.5, bottom: G1 + 0.9, top: G1 + 2.8 }], WALLW);
  glassBox(ctx, 5.8, G1 + 0.9, -5.5, 5.9, G1 + 2.8, -2.5);
  const c1 = [-13, -8.2, -3.4, 1.4, 6];
  for (const x of c1) ctx.box(x - 0.15, G1, 5.7, x + 0.15, F1, 6, FASCIA);
  for (let i = 0; i < c1.length - 1; i++) glassBox(ctx, c1[i] + 0.15, G1, 5.8, c1[i + 1] - 0.15, F1 - 0.3, 5.9);
  ctx.box(-13, F1 - 0.3, 5.7, 6, F1, 6, FASCIA);
  ctx.stairs(-12.5, -11.1, -0.5, -1, G1, F1 - G1, 9, FLOORL);
  ctx.slab(-13, -8, 6, 6, F1 - 0.25, F1, { x0: -12.55, z0: -4.15, x1: -11.05, z1: -0.5 }, FLOORL);
  ctx.box(-4.5, G1, -6.5, -0.5, G1 + 0.6, -4.0, 0xe8e2d4);
  S.box(-4.5, G1 + 0.6, -6.6, -0.5, G1 + 1.3, -6.35, WOOD_D);
  S.box(-4.2, G1 + 0.6, -6.2, -3.2, G1 + 0.8, -5.6, WHITE);
  S.box(-1.8, G1 + 0.6, -6.2, -0.8, G1 + 0.8, -5.6, WHITE);
  ctx.box(2.0, G1, -7.6, 5.6, G1 + 2.2, -6.9, WOOD_L);
  ctx.box(-9.5, G1, 3.0, -7.5, G1 + 0.75, 4.2, WOOD_D);
  S.box(-9.0, G1 + 0.75, 3.3, -8.4, G1 + 1.2, 3.35, BLACK);
  ctx.box(1.5, G1, 2.6, 3.2, G1 + 0.45, 4.2, 0xb0a28c);
  S.box(-6.0, G1 + 0.01, 0.0, 2.0, G1 + 0.03, 4.4, 0x9a3030);
  // --- Terrazas con barandilla de cristal
  glassRail(ctx, S, -11, 6.95, 11, 6.95, G1);
  glassRail(ctx, S, 10.95, -7, 10.95, 7, G1);
  glassRail(ctx, S, 6, -6.95, 11, -6.95, G1);
  glassRail(ctx, S, -12.95, -7.95, -12.95, 5.95, F1);
  glassRail(ctx, S, 5.95, -7.95, 5.95, 5.95, F1);
  glassRail(ctx, S, -13, 5.95, 6, 5.95, F1);
  glassRail(ctx, S, -13, -7.95, 6, -7.95, F1);
  railing(ctx, S, -12.55, -4.2, -11.05, -4.2, F1, STEEL_W, false);
  railing(ctx, S, -11.05, -4.2, -11.05, -0.5, F1, STEEL_W, false);
  for (const [x, z] of [[8.2, -3.5], [8.2, -1.2]]) {
    S.box(x - 0.4, G1, z - 1.0, x + 0.4, G1 + 0.35, z + 1.0, WHITE);
    S.put(geo('box'), WHITE, M(x, G1 + 0.6, z - 1.0, 0.7, 0, 0, 0.8, 0.08, 0.7));
  }
  cyl(S, 8.5, G1, 3.2, 0.5, 0.75, WHITE, 12);
  rod(S, [8.5, G1, 3.2], [8.5, G1 + 2.6, 3.2], 0.04, STEEL_W, 4);
  cone(S, 8.5, G1 + 2.2, 3.2, 1.6, 0.6, RED, 8);
  // azotea: jacuzzi, tumbonas, sombrilla y jardineras
  ctx.box(0.0, F1, -6.6, 3.6, F1 + 0.75, -3.4, WHITE);
  waterRect(ctx, 0.25, -6.35, 3.35, -3.65, F1 + 0.66, 0x2ab8d8);
  for (const [x, z] of [[-6.5, 2.2], [-4.2, 2.2]]) {
    S.box(x - 0.45, F1, z - 1.0, x + 0.45, F1 + 0.35, z + 1.0, WHITE);
    S.put(geo('box'), WHITE, M(x, F1 + 0.6, z - 1.0, 0.7, 0, 0, 0.9, 0.08, 0.7));
  }
  rod(S, [-1.8, F1, 2.4], [-1.8, F1 + 2.5, 2.4], 0.04, STEEL_W, 4);
  cone(S, -1.8, F1 + 2.1, 2.4, 1.8, 0.65, YEL, 8);
  for (const x of [-12, -9, 4.5]) {
    S.box(x - 0.5, F1, -7.6, x + 0.5, F1 + 0.5, -6.8, STONE_L);
    blob(S, x, F1 + 0.8, -7.2, 0.6, 0.5, 0.5, LEAF[0], x);
  }
  // detalles de fachada: marquesina, apliques, impostas y número
  ctx.box(-2.8, Y0 + 2.95, -9.6, 2.8, Y0 + 3.15, -7, FASCIA);
  for (const s of [-1, 1]) ctx.box(s * 2.5 - 0.08, Y0, -9.4, s * 2.5 + 0.08, Y0 + 2.95, -9.24, STEEL_W);
  for (const s of [-1, 1]) S.box(s * 1.75 - 0.12, Y0 + 1.9, -7.12, s * 1.75 + 0.12, Y0 + 2.3, -7.0, 0xfff1c0);
  S.box(1.9, Y0 + 2.4, -7.08, 2.5, Y0 + 2.6, -7.0, GOLD);
  S.box(-13.05, G1 - 0.45, -8.05, 6.05, G1 - 0.3, 6.05, FASCIA);
  for (const x of [-9, -5, 5, 9]) {
    S.box(x - 0.9, Y0, -8.1, x + 0.9, Y0 + 0.55, -7.3, STONE_L);
    blob(S, x, Y0 + 0.75, -7.7, 0.8, 0.4, 0.4, LEAF[2], x);
  }
  ctx.spot(ctx.chestSpots, -10.2, Y0, 5.8, 0, 0);
  ctx.spot(ctx.chestSpots, 10.2, Y0, -5.4, 0, 0);
  ctx.spot(ctx.chestSpots, 5.0, G1, -6.4, 0, 0);
  ctx.spot(ctx.chestSpots, -12.2, G1, 5.0, 0, 0);
  ctx.spot(ctx.chestSpots, 5.0, F1, 5.0, 0, 0);
  ctx.spot(ctx.chestSpots, 10.2, G1, -6.2, 0, 0);
  ctx.spot(ctx.lootSpots, 0, Y0, 3.5);
  ctx.spot(ctx.lootSpots, -4, G1, 1.5);
  ctx.spot(ctx.lootSpots, -3, F1, -1.5);
  ctx.spot(ctx.ammoSpots, 1.5, Y0, -5.5, 0, 0);
}

// Garaje con un deportivo dentro (destructible).
function genGarage(ctx, rng) {
  const S = sinkCtx(ctx);
  const hw = 5, hd = 4, H = 3.4, t = 0.3;
  ctx.box(-hw - 0.2, -1.5, -hd - 0.2, hw + 0.2, 0.12, hd + 0.2, CONC);
  ctx.wall('x', -hw, hw, -hd, -hd + t, 0.12, H, [], WALLW);
  for (const s of [-1, 1]) ctx.wall('z', -hd + t, hd, s > 0 ? hw - t : -hw, s > 0 ? hw : -hw + t, 0.12, H, s > 0 ? [{ a: -1.2, b: 1.2, bottom: 1.2, top: 2.4 }] : [], WALLW);
  glassBox(ctx, hw - 0.2, 1.2, -1.2, hw - 0.1, 2.4, 1.2);
  ctx.box(-hw, 2.9, hd - t, hw, H, hd, WALLW);
  ctx.box(-hw, H - 0.2, -hd, hw, H, hd, FLOORL);
  ctx.box(-hw - 0.15, H, -hd - 0.15, hw + 0.15, H + 0.35, hd + 0.15, FASCIA);
  S.box(-4.3, 2.55, hd - 0.6, 4.3, 2.9, hd - 0.25, 0x9a9ea6);
  // deportivo
  const car = [0, 0.12, -0.3];
  S.box(car[0] - 0.95, car[1] + 0.3, car[2] - 2.1, car[0] + 0.95, car[1] + 0.85, car[2] + 2.1, RED);
  S.box(car[0] - 0.8, car[1] + 0.85, car[2] - 0.9, car[0] + 0.8, car[1] + 1.25, car[2] + 0.7, BLACK);
  S.put(geo('box'), RED, M(car[0], car[1] + 0.75, car[2] + 1.6, -0.35, 0, 0, 1.85, 0.12, 1.2));
  for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) S.put(geo('disc12'), BLACK, M(car[0] + sx * 0.92, car[1] + 0.34, car[2] + sz, 0, Math.PI / 2, 0, 0.34, 0.34, 0.22));
  for (const sx of [-0.6, 0.6]) S.box(car[0] + sx - 0.18, car[1] + 0.55, car[2] + 2.08, car[0] + sx + 0.18, car[1] + 0.7, car[2] + 2.12, 0xfff1c0);
  ctx.colliderOnly(-1.0, 0.12, -2.4, 1.0, 1.3, 1.8);
  // banco de trabajo y herramientas
  ctx.box(-4.6, 0.12, -3.6, -2.2, 1.0, -2.9, WOOD);
  S.box(-4.6, 1.3, -3.72, -2.2, 2.6, -3.68, 0xc9c2b2);
  for (let k = 0; k < 5; k++) S.box(-4.4 + k * 0.45, 1.6, -3.68, -4.3 + k * 0.45, 2.3, -3.62, k % 2 ? RED : STEEL);
  ctx.box(2.6, 0.12, -3.6, 4.6, 2.2, -3.1, STEEL);
  ctx.spot(ctx.chestSpots, 3.6, 0.12, -2.6, 0, 0);
  ctx.spot(ctx.lootSpots, -3, 0.12, 1.5);
}

// Piscina con agua animada, tarima, trampolín y tumbonas.
function genPool(ctx, rng) {
  const S = sinkCtx(ctx);
  // Terraza de un escalón (se sube andando) y lámina de agua poco honda:
  // nadie se queda atrapado dentro
  const DY = 0.5, PX = 9, PZ = 3.5;
  const deck = STONE_L;
  ctx.box(-11, -0.5, -5.5, 11, DY, -PZ, deck);
  ctx.box(-11, -0.5, PZ, 11, DY, 5.5, deck);
  ctx.box(PX, -0.5, -PZ, 11, DY, PZ, deck);
  ctx.box(-11, -0.5, -PZ, -PX, DY, PZ, deck);
  // juntas de la tarima de madera alrededor
  for (let x = -10.5; x <= 10.5; x += 1.5) {
    S.box(x - 0.02, DY, 3.75, x + 0.02, DY + 0.01, 5.45, 0xb8a080);
    S.box(x - 0.02, DY, -5.45, x + 0.02, DY + 0.01, -3.75, 0xb8a080);
  }
  // borde, azulejos, fondo y agua
  for (const s of [-1, 1]) {
    S.box(-PX - 0.25, DY - 0.02, s * PZ - 0.25, PX + 0.25, DY + 0.07, s * PZ + 0.25, WHITE);
    S.box(s * PX - 0.25, DY - 0.02, -PZ, s * PX + 0.25, DY + 0.07, PZ, WHITE);
    S.box(-PX, 0.05, s * PZ - (s > 0 ? 0.04 : 0), PX, DY - 0.06, s * PZ + (s > 0 ? 0 : 0.04), 0x5cc8e0);
    S.box(s * PX - (s > 0 ? 0.04 : 0), 0.05, -PZ, s * PX + (s > 0 ? 0 : 0.04), DY - 0.06, PZ, 0x5cc8e0);
    S.box(-PX, DY - 0.2, s * PZ - (s > 0 ? 0.05 : 0), PX, DY - 0.1, s * PZ + (s > 0 ? 0 : 0.05), 0x1f5f8a);
  }
  S.box(-PX, -0.05, -PZ, PX, 0.04, PZ, 0x4fb8d8);
  for (let x = -6; x <= 6; x += 3) S.box(x - 0.12, 0.04, -2.6, x + 0.12, 0.06, 2.6, 0x1f5f8a);
  waterRect(ctx, -PX, -PZ, PX, PZ, DY - 0.1, 0x1a98cc);
  for (const x of [-5, 0, 5]) for (const s of [-1, 1]) glowBox(ctx, x - 0.25, 0.12, s * PZ - (s > 0 ? 0.06 : -0.02), x + 0.25, 0.3, s * PZ - (s > 0 ? 0.02 : -0.06), 0x9af4ff, 1.6);
  // trampolín
  ctx.box(9.3, DY, -1.2, 10.6, DY + 0.5, 1.2, WHITE);
  S.box(6.4, DY + 0.45, -0.4, 10.0, DY + 0.55, 0.4, 0x2f7de1);
  // tumbonas y sombrillas en el borde de atrás
  for (const x of [-7, -3.5, 0, 3.5]) {
    S.box(x - 0.95, DY, -5.2, x + 0.95, DY + 0.32, -4.5, WHITE);
    S.put(geo('box'), WHITE, M(x - 0.95, DY + 0.55, -4.85, 0, 0, -0.7, 0.75, 0.08, 0.7));
    S.box(x - 0.75, DY + 0.32, -5.15, x + 0.75, DY + 0.36, -4.55, x > 0 ? 0x2fb5a8 : 0xff7ab8);
  }
  for (const x of [-5.2, 1.8]) {
    rod(S, [x, DY, -5.0], [x, DY + 2.6, -5.0], 0.04, STEEL_W, 4);
    cone(S, x, DY + 2.2, -5.0, 1.7, 0.6, x < 0 ? 0xff7ab8 : 0x2fb5a8, 8);
  }
  // flotadores
  ball(S, 2.5, DY - 0.05, 1.2, 0.35, RED, 10);
  S.put(geo('torus'), 0xff7ab8, M(-4, DY - 0.08, -1, Math.PI / 2, 0, 0, 0.55, 0.55, 0.55));
  S.put(geo('torus'), YEL, M(5.5, DY - 0.08, 1.6, Math.PI / 2, 0, 0, 0.5, 0.5, 0.5));
  ctx.spot(ctx.chestSpots, 10.2, DY, -4.6, 0, 0);
  ctx.spot(ctx.lootSpots, -6, 0.05, 0);
  ctx.spot(ctx.ammoSpots, -9.5, DY, 4.6, 0, 0);
}

// Helipuerto con helicóptero.
function genHelipad(ctx, rng) {
  const S = sinkCtx(ctx);
  ctx.box(-6, -0.6, -6, 6, 0.3, 6, CONC_D);
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    S.put(geo('box'), WHITE, M(Math.sin(a) * 4.6, 0.31, Math.cos(a) * 4.6, 0, a, 0, 0.92, 0.03, 0.3));
  }
  for (const s of [-1, 1]) S.box(s * 1.3 - 0.3, 0.3, -2.0, s * 1.3 + 0.3, 0.33, 2.0, YEL);
  S.box(-1.0, 0.3, -0.3, 1.0, 0.33, 0.3, YEL);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = Math.max(-5.7, Math.min(5.7, Math.sin(a) * 8)), z = Math.max(-5.7, Math.min(5.7, Math.cos(a) * 8));
    glowBox(ctx, x - 0.1, 0.3, z - 0.1, x + 0.1, 0.45, z + 0.1, k % 2 ? 0x5dff8a : 0xffffff, 1.8);
  }
  // helicóptero (negro y oro)
  const hy = 0.3;
  for (const s of [-1, 1]) {
    rod(S, [s * 1.1, hy + 0.12, -2.2], [s * 1.1, hy + 0.12, 2.5], 0.07, DARK, 6);
    for (const z of [-1.2, 1.3]) beam(S, [s * 1.1, hy + 0.12, z], [s * 0.7, hy + 0.9, z], 0.08, 0.08, DARK);
  }
  ctx.box(-1.1, hy + 0.8, -1.3, 1.1, hy + 2.7, 1.6, BLACK);
  S.put(geo('box'), BLACK, M(0, hy + 1.55, 2.05, 0.3, 0, 0, 2.0, 1.5, 1.2));
  S.box(-1.12, hy + 1.45, -1.3, 1.12, hy + 1.6, 1.6, GOLD);
  glassBox(ctx, -0.95, hy + 1.65, 1.62, 0.95, hy + 2.5, 1.7, false, 0x6fb8e0);
  for (const s of [-1, 1]) glassBox(ctx, s * 1.12 - 0.04, hy + 1.65, 0.0, s * 1.12 + 0.04, hy + 2.45, 1.4, false, 0x6fb8e0);
  ctx.box(-0.3, hy + 1.9, -6.0, 0.3, hy + 2.4, -1.3, BLACK);
  S.box(-0.08, hy + 2.3, -6.0, 0.08, hy + 3.5, -5.2, BLACK);
  S.box(-0.08, hy + 2.6, -5.9, 0.08, hy + 2.75, -5.3, GOLD);
  S.put(geo('box'), DARK, M(0.2, hy + 2.6, -5.6, 0, 0, 0.6, 0.03, 1.4, 0.15));
  cyl(S, 0, hy + 2.7, 0.1, 0.35, 0.45, DARK, 8);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    S.put(geo('box'), DARK, M(Math.sin(a) * 2.9, hy + 3.18, 0.1 + Math.cos(a) * 2.9, 0, a, 0, 0.32, 0.05, 5.6));
  }
  ctx.colliderOnly(-1.1, hy, -1.3, 1.1, hy + 0.8, 1.6);
  // manga de viento
  rod(S, [5.3, 0.3, 5.3], [5.3, 4.2, 5.3], 0.05, STEEL_W, 4);
  S.put(geo('cone8'), ORANGE, M(5.3, 4.0, 4.6, Math.PI / 2 + 0.2, 0, 0, 0.3, 1.3, 0.3));
  ctx.colliderOnly(5.2, 0.3, 5.2, 5.4, 4.2, 5.4);
  ctx.spot(ctx.chestSpots, 3.6, 0.3, -3.6, 0, 0);
  ctx.spot(ctx.lootSpots, -3.6, 0.3, 3.0);
}

// Pérgola junto a la piscina (destructible): barra, taburetes y tumbonas.
function genCabana(ctx, rng) {
  const S = sinkCtx(ctx);
  ctx.box(-3, -0.5, -2.5, 3, 0.2, 2.5, WOOD_L);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ctx.box(sx * 2.8 - 0.12, 0.2, sz * 2.3 - 0.12, sx * 2.8 + 0.12, 2.9, sz * 2.3 + 0.12, WOOD_D);
  for (let x = -2.9; x <= 2.9; x += 0.45) S.box(x - 0.06, 2.9, -2.5, x + 0.06, 3.1, 2.5, WOOD);
  for (const s of [-1, 1]) S.box(-3.0, 2.75, s * 2.3 - 0.1, 3.0, 2.92, s * 2.3 + 0.1, WOOD_D);
  ctx.box(-2.4, 0.2, -2.2, 2.4, 1.15, -1.5, WOOD);
  S.box(-2.5, 1.15, -2.3, 2.5, 1.22, -1.35, WHITE);
  for (let k = 0; k < 6; k++) S.box(-2.0 + k * 0.7, 1.22, -2.1, -1.8 + k * 0.7, 1.55, -1.9, FLAGS[k]);
  for (const x of [-1.5, 0, 1.5]) {
    cyl(S, x, 0.2, -0.9, 0.05, 0.7, STEEL_W, 6);
    cyl(S, x, 0.9, -0.9, 0.24, 0.08, BLACK, 10);
  }
  for (const x of [-1.6, 1.6]) {
    S.box(x - 0.42, 0.2, 0.4, x + 0.42, 0.5, 2.2, WHITE);
    S.put(geo('box'), WHITE, M(x, 0.75, 0.45, 0.7, 0, 0, 0.84, 0.08, 0.6));
  }
  ctx.spot(ctx.chestSpots, 2.0, 0.2, -1.0, 0, 2);
}

// Jardín de la mansión: palmeras y parterres de flores.
function genGarden(ctx, rng, p) {
  const S = sinkCtx(ctx);
  const T = ctx.fx.world.terrain;
  for (const t of p.palms) {
    const x = t.x - p.x, z = t.z - p.z, y = T.heightAt(t.x, t.z) - ctx.cy;
    palm(S, rng, x, y, z, t.s, t.rot);
    ctx.colliderOnly(x - 0.3, y, z - 0.3, x + 0.3, y + 6 * t.s, z + 0.3);
  }
  const FL = [0xff5a7a, 0xffd34d, 0xffffff, 0xc86bff, 0xff8a3a];
  for (const b of p.beds) {
    const x = b.x - p.x, z = b.z - p.z, y = T.heightAt(b.x, b.z) - ctx.cy;
    S.box(x - b.hw, y - 0.1, z - b.hd, x + b.hw, y + 0.28, z + b.hd, STONE_L);
    S.box(x - b.hw + 0.12, y + 0.28, z - b.hd + 0.12, x + b.hw - 0.12, y + 0.32, z + b.hd - 0.12, 0x5a3d22);
    const n = Math.round(b.hw * b.hd * 3);
    for (let k = 0; k < n; k++) {
      const fx = x + rng.float(-b.hw + 0.25, b.hw - 0.25), fz = z + rng.float(-b.hd + 0.25, b.hd - 0.25);
      blob(S, fx, y + 0.45, fz, 0.22, 0.2, 0.22, LEAF[k % LEAF.length], k);
      if (k % 2 === 0) ball(S, fx, y + 0.62, fz, 0.11, FL[k % FL.length], 6);
    }
  }
}

// Seto recortado (destructible), en tramos.
function genHedge(ctx, rng, p) {
  const S = sinkCtx(ctx);
  const [x0, z0] = p.a, [x1, z1] = p.b;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const c = alongX ? z0 : x0;
  for (let a = a0; a < a1 - 0.01; a += 2) {
    const b = Math.min(a1, a + 2);
    if (alongX) {
      ctx.box(a, 0, c - 0.5, b, 1.8, c + 0.5, 0x3f6f2f);
      S.box(a + 0.05, 1.8, c - 0.42, b - 0.05, 1.95, c + 0.42, 0x4f8a3a);
    } else {
      ctx.box(c - 0.5, 0, a, c + 0.5, 1.8, b, 0x3f6f2f);
      S.box(c - 0.42, 1.8, a + 0.05, c + 0.42, 1.95, b - 0.05, 0x4f8a3a);
    }
  }
}

// Verja de entrada: pilares con farolas, puertas abiertas y cartel dorado.
function genMansionGate(ctx, rng) {
  const S = sinkCtx(ctx);
  for (const s of [-1, 1]) {
    const x = s * 4.6;
    ctx.box(x - 0.6, -0.3, -0.6, x + 0.6, 3.2, 0.6, STONE_L);
    S.box(x - 0.72, 3.2, -0.72, x + 0.72, 3.42, 0.72, WHITE);
    S.box(x - 0.18, 3.42, -0.18, x + 0.18, 3.62, 0.18, DARK);
    S.box(x - 0.24, 3.62, -0.24, x + 0.24, 4.2, 0.24, DARK);
    bulb(ctx, x, 3.9, 0, 0xfff1c0, 0.16);
    ctx.box(x + s * 0.6, -0.3, -0.35, x + s * 2.4, 2.1, 0.35, STONE_L);
    S.box(x + s * 0.6 - 0.05, 2.1, -0.42, x + s * 2.4 + 0.05, 2.25, 0.42, WHITE);
    // hoja de la puerta, abierta hacia dentro
    const hx = x - s * 0.6;
    for (let k = 0; k <= 8; k++) {
      const d = (k / 8) * 3.9;
      const px = hx - s * Math.cos(1.25) * d, pz = -Math.sin(1.25) * d;
      S.box(px - 0.03, 0.1, pz - 0.03, px + 0.03, 2.4 + Math.sin((k / 8) * Math.PI) * 0.4, pz + 0.03, BLACK);
    }
    for (const y of [0.3, 1.2, 2.3]) beam(S, [hx, y, 0], [hx - s * Math.cos(1.25) * 3.9, y, -Math.sin(1.25) * 3.9], 0.06, 0.06, BLACK);
  }
  // arco con el cartel
  let prev = null;
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI;
    const p = [Math.cos(a) * 4.0, 4.3 + Math.sin(a) * 1.0, 0];
    if (prev) rod(S, prev, p, 0.07, BLACK, 6);
    prev = p;
  }
  for (const s of [-1, 1]) rod(S, [s * 4.0, 3.42, 0], [s * 4.0, 4.3, 0], 0.07, BLACK, 6);
  S.box(-3.3, 4.0, -0.08, 3.3, 4.95, 0.08, BLACK);
  S.box(-3.35, 3.95, -0.1, 3.35, 4.02, 0.1, GOLD);
  S.box(-3.35, 4.93, -0.1, 3.35, 5.0, 0.1, GOLD);
  sign(ctx, 'VILLA MILLONARIA', 'mansion', -3.25, 4.05, 3.25, 4.9, 0.09);
  ball(S, 0, 5.45, 0, 0.22, GOLD);
}

// ------------------------------------------------------------ TABLA
export const LANDMARK_GEN = {
  fairarch: genFairArch, ferriswheel: genFerrisWheel, carousel: genCarousel, coaster: genCoaster, bigtop: genBigTop,
  fairbooth: genFairBooth, fairlights: genFairLights, bumpers: genBumperCars,
  pyramid: genPyramid, column: genColumn, idol: genIdol, templepool: genTemplePool, templehut: genTempleHut, stela: genStela, jungle: genJungle,
  observatory: genObservatory, obslab: genObsLab, dish: genDish, mast: genMast, quonset: genQuonset, overlook: genOverlook,
  headframe: genHeadframe, minehill: genMineHill, hoist: genHoist, mineshed: genMineShed, tipple: genTipple, scaffold: genScaffold, orepile: genOrePile, minerails: genMineRails,
  mansion: genMansion, garage: genGarage, pool: genPool, helipad: genHelipad, cabana: genCabana, garden: genGarden, hedge: genHedge, mansiongate: genMansionGate,
};
