import * as THREE from 'three';
import { usesPBR, isMobileQuality } from '../game/models.js';

const tmpColor = new THREE.Color();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vn = new THREE.Vector3();

// Tipos de superficie (se dibujan en el shader con la posición del mundo).
export const PAT = { plain: 0, planks: 1, brick: 2, tiles: 3, concrete: 4, corrugated: 5, stone: 6, siding: 7, panels: 8, metal: 9 };
const BY_COLOR = new Map();
const tag = (pat, list) => list.forEach((c) => BY_COLOR.set(c, pat));
tag(PAT.planks, [0x8a6440, 0x9c7650, 0x7a5a3c, 0x9a7a55, 0x8b6a40, 0x6b4a2b, 0x8a5a32, 0x6b5a45, 0x7a4a24, 0x5a3d22, 0x7a5a38]);
tag(PAT.tiles, [0x8a3b32, 0x4a5a6a, 0x5b4636, 0x2f4f6f, 0x7a2f2f, 0x4a5530, 0x4a3a2a, 0x5a7a92, 0x5a4a8a]);
tag(PAT.concrete, [0x8d8d86, 0x77756f, 0x6e6a64, 0x55575c, 0x7d7a72, 0xbdb6a6, 0xb9b09c, 0xc9c2b2, 0xb2aa98, 0x9a9ea6, 0x8f8f8f]);
tag(PAT.siding, [0xe8d9b5, 0xa9c7d9, 0xf0f0e6, 0xc6d6a0, 0xd4c08a, 0xe8e2d4, 0x6f7a55]);
tag(PAT.brick, [0xd9a07a, 0xe0b5b5, 0x8a5040, 0xb8b2a4]);
tag(PAT.panels, [0x9aa3ad, 0xb7a68c, 0x7f8c99, 0xc9c1b2, 0x8fa1b3, 0xa38f7a]);
tag(PAT.corrugated, [0x8c96a0, 0x6f7f73, 0xa0927d, 0x7d8a99, 0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910, 0x7d3c98]);
tag(PAT.stone, [0x9e9a90, 0xd8cfbd, 0x9a958a, 0x8a857a, 0xece4d2]);
tag(PAT.metal, [0x3a3d42, 0x8a8f96, 0x6f747a, 0x555555, 0x5d5d5d, 0xbfbfbf, 0xe8e8e8, 0xb8bcc0, 0xa8c4d8, 0x2a2c30]);
export function patternOf(hex) {
  return BY_COLOR.get(hex) ?? PAT.plain;
}

// Material compartido de los edificios: color por vértice + dibujo
// procedural (tablones, ladrillo, tejas…) según el atributo `pat`.
let sharedMat = null;
export function buildingMaterial() {
  if (sharedMat) return sharedMat;
  const pbr = usesPBR();
  const m = pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  // Móvil: el dibujo sólo se calcula de cerca (más allá, color liso)
  if (isMobileQuality()) m.defines = { LITE: '' };
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float pat;\nvarying float vPat;\nvarying vec3 vBW;\nvarying vec3 vBN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPat = pat;\nvBW = (modelMatrix * vec4(position, 1.0)).xyz;\nvBN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vPat;
varying vec3 vBW;
varying vec3 vBN;
float bH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bH(i), bH(i + vec2(1.0, 0.0)), u.x), mix(bH(i + vec2(0.0, 1.0)), bH(i + vec2(1.0, 1.0)), u.x), u.y);
}
float bLine(float f, float w) { return smoothstep(0.0, w, f) * smoothstep(1.0, 1.0 - w, f); }
// Devuelve el multiplicador de color (x) y cuánto aclarar (y, juntas).
vec2 surfacePattern(float pat, vec3 p, vec3 n) {
  vec3 an = abs(n);
  bool top = an.y > 0.6;
  vec2 uv = top ? p.xz : (an.x > an.z ? vec2(p.z, p.y) : vec2(p.x, p.y));
  float k = 0.95 + 0.08 * bN(uv * 2.3);
  float lift = 0.0;
  int t = int(pat + 0.5);
  if (top && (t == 2 || t == 5 || t == 7 || t == 8)) t = 4;
  if (t == 1) {
    float row = floor(uv.y / 0.22);
    float f = fract(uv.y / 0.22);
    float seam = fract((uv.x + bH(vec2(row, 3.0)) * 1.8) / 1.8);
    k = mix(0.62, 1.0, bLine(f, 0.07)) * (0.88 + 0.16 * bH(vec2(row, 1.0)));
    k *= 0.92 + 0.08 * bN(vec2(uv.x * 4.0, row * 7.0 + f * 2.0));
    k *= mix(0.72, 1.0, smoothstep(0.0, 0.015, seam));
  } else if (t == 2) {
    float row = floor(uv.y / 0.11);
    float x = uv.x / 0.27 + 0.5 * mod(row, 2.0);
    vec2 cell = vec2(floor(x), row);
    float fx = fract(x), fy = fract(uv.y / 0.11);
    float mortar = 1.0 - bLine(fx, 0.05) * bLine(fy, 0.12);
    k = (0.82 + 0.24 * bH(cell)) * (0.94 + 0.08 * bN(uv * 9.0));
    lift = mortar * 0.35;
  } else if (t == 3) {
    float h = top ? uv.y : p.y;
    float along = an.x > an.z ? p.z : p.x;
    float row = floor(h / 0.16);
    float f = fract(h / 0.16);
    float seam = fract((along + 0.15 * mod(row, 2.0)) / 0.3);
    k = (0.7 + 0.35 * f) * mix(0.75, 1.0, bLine(seam, 0.08)) * (0.9 + 0.15 * bH(vec2(row, floor((along + 0.15 * mod(row, 2.0)) / 0.3))));
  } else if (t == 4) {
    k = (0.9 + 0.1 * bN(uv * 1.3) + 0.05 * bN(uv * 7.0));
    vec2 g = fract(uv / 3.0);
    k *= mix(0.86, 1.0, bLine(g.x, 0.006) * bLine(g.y, 0.006));
  } else if (t == 5) {
    k = 0.84 + 0.16 * (0.5 + 0.5 * sin(uv.x * 6.2832 / 0.17)) ;
    k *= 0.95 + 0.07 * bN(uv * vec2(0.8, 3.0));
  } else if (t == 6) {
    float row = floor(uv.y / 0.38);
    float x = uv.x / 0.7 + bH(vec2(row, 5.0));
    vec2 cell = vec2(floor(x), row);
    float mortar = 1.0 - bLine(fract(x), 0.04) * bLine(fract(uv.y / 0.38), 0.08);
    k = (0.8 + 0.28 * bH(cell)) * (0.9 + 0.14 * bN(uv * 5.0));
    k *= mix(1.0, 0.62, mortar);
  } else if (t == 7) {
    float f = fract(uv.y / 0.24);
    k = (0.8 + 0.2 * smoothstep(0.0, 0.85, f)) * (0.96 + 0.05 * bN(vec2(uv.x * 0.7, uv.y * 4.0)));
  } else if (t == 8) {
    vec2 g = fract(vec2(uv.x / 1.6, uv.y / 1.6));
    k = (0.92 + 0.1 * bN(uv * 1.7)) * mix(0.8, 1.0, bLine(g.x, 0.02) * bLine(g.y, 0.02));
  } else if (t == 9) {
    k = 0.93 + 0.05 * bN(vec2(uv.x * 0.6, uv.y * 14.0)) + 0.04 * bN(uv * 3.0);
  }
  return vec2(k, lift);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float camD = length(cameraPosition - vBW);
#ifdef LITE
  if (camD < 110.0) {
    vec2 sp = surfacePattern(vPat, vBW, normalize(vBN));
    float fade = smoothstep(45.0, 110.0, camD);
    float k = mix(sp.x, 1.0, fade);
    diffuseColor.rgb = mix(diffuseColor.rgb * k, vec3(0.78, 0.76, 0.72), sp.y * (1.0 - fade));
  }
#else
  vec2 sp = surfacePattern(vPat, vBW, normalize(vBN));
  float fade = smoothstep(90.0, 260.0, camD);
  float k = mix(sp.x, 1.0, fade * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb * k, vec3(0.78, 0.76, 0.72), sp.y * (1.0 - fade));
#endif
}`);
  };
  sharedMat = m;
  return m;
}

// Acumula geometría estática (con color por vértice) en un único buffer para
// dibujar todos los edificios en muy pocas draw calls.
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.pat = [];
  }

  _color(hex, jitter = 0) {
    tmpColor.setHex(hex); // convierte sRGB -> lineal
    if (jitter) {
      const j = 1 + (Math.random() - 0.5) * jitter;
      tmpColor.r *= j;
      tmpColor.g *= j;
      tmpColor.b *= j;
    }
    return tmpColor;
  }

  // Polígono convexo (array de [x,y,z]). `inside` = punto interior del sólido
  // para orientar la normal hacia fuera.
  poly(verts, hex, inside, jitter = 0, pat = patternOf(hex)) {
    va.fromArray(verts[0]);
    vb.fromArray(verts[1]);
    vc.fromArray(verts[2]);
    vn.subVectors(vb, va).cross(vc.sub(va)).normalize();
    let order = verts;
    if (inside) {
      const dx = verts[0][0] - inside[0], dy = verts[0][1] - inside[1], dz = verts[0][2] - inside[2];
      if (vn.x * dx + vn.y * dy + vn.z * dz < 0) {
        order = verts.slice().reverse();
        vn.negate();
      }
    }
    const c = this._color(hex, jitter);
    for (let i = 1; i < order.length - 1; i++) {
      for (const v of [order[0], order[i], order[i + 1]]) {
        this.pos.push(v[0], v[1], v[2]);
        this.nor.push(vn.x, vn.y, vn.z);
        this.col.push(c.r, c.g, c.b);
        this.pat.push(pat);
      }
    }
  }

  box(minX, minY, minZ, maxX, maxY, maxZ, hex, jitter = 0.06, pat = patternOf(hex)) {
    const c = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
    const base = this._color(hex);
    const r = base.r * j, g = base.g * j, b = base.b * j;
    // Base de los muros algo más oscura (oclusión aproximada con el suelo)
    const tall = maxY - minY > 1.2;
    const faces = [
      [[maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ]],
      [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]],
      [[minX, maxY, minZ], [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ]],
      [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]],
      [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]],
      [[minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [maxX, minY, minZ]],
    ];
    for (const f of faces) {
      this.poly(f, 0, c, 0, pat);
      // sobrescribe el color del último quad (6 vértices)
      const n = this.col.length;
      for (let k = n - 18, v = this.pos.length - 18; k < n; k += 3, v += 3) {
        const ao = tall && this.pos[v + 1] < minY + 0.01 ? 0.72 : 1;
        this.col[k] = r * ao;
        this.col[k + 1] = g * ao;
        this.col[k + 2] = b * ao;
      }
    }
  }

  // Añade una BufferGeometry arbitraria transformada por `matrix`.
  geometry(geo, hex, matrix, pat = patternOf(hex)) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const c = this._color(hex, 0.05);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nor.push(n[i], n[i + 1], n[i + 2]);
      this.col.push(c.r, c.g, c.b);
      this.pat.push(pat);
    }
    g.dispose();
  }

  build(material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('pat', new THREE.Float32BufferAttribute(this.pat, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material || buildingMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // Como build(), pero repartiendo los triángulos en parcelas de `cell` m
  // (según su centro) para que se puedan descartar por separado. Devuelve un
  // grupo y la lista de parcelas { mesh, cx, cz, r }.
  buildChunks(cell, material) {
    const mat = material || buildingMaterial();
    const cells = new Map();
    const P = this.pos, Nn = this.nor, C = this.col, T = this.pat;
    for (let v = 0; v < P.length; v += 9) {
      const x = (P[v] + P[v + 3] + P[v + 6]) / 3, z = (P[v + 2] + P[v + 5] + P[v + 8]) / 3;
      const key = Math.floor(x / cell) * 1000 + Math.floor(z / cell);
      let c = cells.get(key);
      if (!c) cells.set(key, (c = []));
      c.push(v);
    }
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.material = mat;
    const chunks = [];
    for (const list of cells.values()) {
      const n = list.length * 9;
      const pos = new Float32Array(n), nor = new Float32Array(n), col = new Float32Array(n), pat = new Float32Array(n / 3);
      let k = 0;
      for (const v of list) {
        for (let i = 0; i < 9; i++) {
          pos[k + i] = P[v + i];
          nor[k + i] = Nn[v + i];
          col[k + i] = C[v + i];
        }
        pat[k / 3] = T[v / 3];
        pat[k / 3 + 1] = T[v / 3 + 1];
        pat[k / 3 + 2] = T[v / 3 + 2];
        k += 9;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('pat', new THREE.BufferAttribute(pat, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      const bb = geo.boundingBox;
      chunks.push({ mesh, cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2, r: Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 });
    }
    return { group, chunks };
  }
}
