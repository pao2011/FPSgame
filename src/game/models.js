import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RARITIES, AMMO } from './items.js';
import { CAMOS, PICKAXES, GLIDERS, BAGS } from './cosmetics.js';

// Modelos low-poly construidos con primitivas. En calidad normal/alta se usan
// materiales PBR (MeshStandardMaterial) con iluminación de entorno y piezas
// con las aristas redondeadas; en calidad baja/móvil, Lambert y cajas.

let PBR = true;
let QUALITY = 'normal';
let LITE = false;
// lite: versión ligera de sombreados y modelos (calidad Móvil, y Normal/Baja
// en móviles y tabletas).
export function setModelQuality(q, lite = q === 'movil') {
  QUALITY = q;
  PBR = q !== 'baja' && q !== 'movil';
  LITE = lite;
}
export const usesPBR = () => PBR;
export const modelQuality = () => QUALITY;
export const isMobileQuality = () => LITE;

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + '|' + PBR + '|' + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    const o = { color, ...opts };
    const metal = !!o.phong;
    const shin = o.shininess ?? 30;
    delete o.phong;
    if (PBR) {
      delete o.shininess;
      delete o.specular;
      const rough = o.roughness ?? (metal ? Math.max(0.18, Math.min(0.55, 1 - shin / 140)) : 0.72);
      m = new THREE.MeshStandardMaterial({ ...o, roughness: rough, metalness: o.metalness ?? (metal ? 0.55 : 0.04) });
    } else {
      delete o.roughness;
      delete o.metalness;
      if (!metal) {
        delete o.shininess;
        delete o.specular;
      }
      m = new (metal ? THREE.MeshPhongMaterial : THREE.MeshLambertMaterial)(o);
    }
    matCache.set(key, m);
  }
  return m;
}

// Cajas con las aristas suavizadas (radio proporcional al tamaño).
const boxGeoCache = new Map();
function boxGeo(w, h, d, sharp = false) {
  const k = `${w},${h},${d},${PBR && !sharp}`;
  let g = boxGeoCache.get(k);
  if (!g) {
    const r = Math.min(w, h, d) * 0.22;
    g = PBR && !sharp && r > 0.004 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, 0.06)) : new THREE.BoxGeometry(w, h, d);
    boxGeoCache.set(k, g);
  }
  return g;
}

function box(parent, w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const sharp = opts?.sharp;
  let o = opts;
  if (sharp) {
    o = { ...opts };
    delete o.sharp;
  }
  const m = new THREE.Mesh(boxGeo(w, h, d, sharp), mat(color, o));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Cápsula orientada en Y (extremidades redondeadas).
const capCache = new Map();
function capsule(parent, r, len, color, x = 0, y = 0, z = 0, opts) {
  const k = `${r},${len}`;
  let g = capCache.get(k);
  if (!g) capCache.set(k, (g = PBR ? new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 10) : new THREE.CylinderGeometry(r, r, len, 8)));
  const m = new THREE.Mesh(g, mat(color, opts));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function sphere(parent, r, color, x = 0, y = 0, z = 0, opts, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, PBR ? 14 : 8, PBR ? 10 : 6), mat(color, opts));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

function cylZ(parent, r, len, color, x, y, z, seg = 10, opts) {
  const g = new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat(color, opts));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const METAL = { phong: true, shininess: 60, specular: 0x444444 };

// ---------------------------------------------------------------- ARMAS ---
// El cañón apunta hacia -Z. El origen está aproximadamente en la empuñadura.
export function makeWeaponModel(type, rarity = 0, camo = null, pick = null) {
  const g = new THREE.Group();
  const accent = RARITIES[rarity]?.hex ?? 0xaaaaaa;
  // Mítico y exótico: el color de la rareza brilla un poco
  const AC = RARITIES[rarity]?.glow ? { ...METAL, emissive: new THREE.Color(accent).multiplyScalar(0.45).getHex() } : METAL;
  const dark = 0x2a2c30;
  const mid = 0x4b4f57;
  const wood = 0x8a5a32;
  const muzzle = new THREE.Object3D();
  let sightY = 0.08;

  switch (type) {
    case 'ar': {
      box(g, 0.07, 0.1, 0.44, mid, 0, 0.0, -0.06, METAL);
      box(g, 0.074, 0.035, 0.3, accent, 0, 0.04, -0.1, AC);
      box(g, 0.06, 0.075, 0.22, dark, 0, -0.005, -0.38, METAL);
      cylZ(g, 0.014, 0.24, dark, 0, 0.01, -0.58, 8, METAL);
      box(g, 0.05, 0.15, 0.065, dark, 0, -0.11, -0.1).rotation.x = 0.25;
      box(g, 0.045, 0.11, 0.05, dark, 0, -0.08, 0.08).rotation.x = -0.35;
      box(g, 0.05, 0.09, 0.22, accent, 0, -0.02, 0.26, AC);
      box(g, 0.035, 0.05, 0.12, dark, 0, 0.075, -0.06, METAL);
      box(g, 0.012, 0.02, 0.012, 0xff3030, 0, 0.105, -0.06, { emissive: 0xff2020 });
      muzzle.position.set(0, 0.01, -0.72);
      sightY = 0.105;
      break;
    }
    case 'smg': {
      box(g, 0.07, 0.11, 0.32, mid, 0, 0, -0.04, METAL);
      box(g, 0.074, 0.04, 0.22, accent, 0, 0.045, -0.06, AC);
      cylZ(g, 0.018, 0.16, dark, 0, 0.015, -0.27, 8, METAL);
      box(g, 0.045, 0.22, 0.05, dark, 0, -0.15, -0.06);
      box(g, 0.045, 0.1, 0.05, dark, 0, -0.08, 0.07).rotation.x = -0.3;
      box(g, 0.03, 0.04, 0.16, dark, 0, -0.01, 0.2);
      box(g, 0.025, 0.03, 0.05, dark, 0, 0.075, 0.0);
      muzzle.position.set(0, 0.015, -0.36);
      sightY = 0.09;
      break;
    }
    case 'shotgun': {
      box(g, 0.075, 0.1, 0.32, mid, 0, 0, -0.02, METAL);
      cylZ(g, 0.022, 0.55, dark, 0, 0.025, -0.42, 10, METAL);
      cylZ(g, 0.018, 0.45, dark, 0, -0.025, -0.38, 10, METAL);
      box(g, 0.07, 0.07, 0.2, wood, 0, -0.035, -0.36);
      box(g, 0.075, 0.03, 0.2, accent, 0, 0.055, -0.04, AC);
      box(g, 0.045, 0.11, 0.05, wood, 0, -0.08, 0.1).rotation.x = -0.35;
      box(g, 0.06, 0.1, 0.26, wood, 0, -0.03, 0.27);
      muzzle.position.set(0, 0.025, -0.7);
      sightY = 0.075;
      break;
    }
    case 'sniper': {
      box(g, 0.07, 0.1, 0.5, mid, 0, 0, -0.05, METAL);
      cylZ(g, 0.016, 0.6, dark, 0, 0.01, -0.6, 8, METAL);
      cylZ(g, 0.035, 0.3, 0x15171a, 0, 0.1, -0.06, 12, METAL);
      cylZ(g, 0.042, 0.04, 0x15171a, 0, 0.1, -0.22, 12, METAL);
      box(g, 0.075, 0.035, 0.34, accent, 0, 0.045, -0.12, AC);
      box(g, 0.045, 0.11, 0.05, dark, 0, -0.08, 0.09).rotation.x = -0.35;
      box(g, 0.06, 0.12, 0.3, wood, 0, -0.03, 0.33);
      box(g, 0.04, 0.08, 0.05, dark, 0, -0.08, -0.12);
      muzzle.position.set(0, 0.01, -0.92);
      sightY = 0.1;
      break;
    }
    case 'pistol': {
      box(g, 0.05, 0.06, 0.22, mid, 0, 0.03, -0.06, METAL);
      box(g, 0.052, 0.02, 0.18, accent, 0, 0.065, -0.06, AC);
      box(g, 0.045, 0.13, 0.06, dark, 0, -0.05, 0.02).rotation.x = -0.25;
      muzzle.position.set(0, 0.035, -0.18);
      sightY = 0.08;
      break;
    }
    case 'burst': {
      box(g, 0.07, 0.1, 0.5, 0x3a3f46, 0, 0.0, -0.08, METAL);
      box(g, 0.074, 0.03, 0.36, accent, 0, 0.045, -0.12, AC);
      box(g, 0.065, 0.08, 0.2, dark, 0, -0.005, -0.42, METAL);
      cylZ(g, 0.015, 0.2, dark, 0, 0.01, -0.6, 8, METAL);
      cylZ(g, 0.024, 0.06, 0x111111, 0, 0.01, -0.72, 8, METAL);
      box(g, 0.05, 0.16, 0.06, dark, 0, -0.12, -0.14).rotation.x = 0.1;
      box(g, 0.045, 0.11, 0.05, dark, 0, -0.08, 0.06).rotation.x = -0.35;
      box(g, 0.055, 0.1, 0.24, 0x3a3f46, 0, -0.02, 0.27);
      box(g, 0.02, 0.06, 0.22, dark, 0, 0.09, -0.1, METAL);
      box(g, 0.05, 0.02, 0.05, dark, 0, 0.12, -0.02, METAL);
      muzzle.position.set(0, 0.01, -0.76);
      sightY = 0.13;
      break;
    }
    case 'heavyar': {
      box(g, 0.08, 0.11, 0.46, 0x3d3a33, 0, 0.0, -0.06, METAL);
      box(g, 0.084, 0.04, 0.32, accent, 0, 0.05, -0.1, METAL);
      box(g, 0.075, 0.09, 0.26, dark, 0, -0.005, -0.4, METAL);
      cylZ(g, 0.02, 0.24, dark, 0, 0.01, -0.62, 8, METAL);
      box(g, 0.06, 0.17, 0.08, dark, 0, -0.12, -0.12).rotation.x = 0.1;
      box(g, 0.05, 0.11, 0.05, dark, 0, -0.08, 0.08).rotation.x = -0.35;
      box(g, 0.06, 0.1, 0.24, 0x3d3a33, 0, -0.02, 0.27);
      box(g, 0.04, 0.05, 0.14, dark, 0, 0.085, -0.08, METAL);
      muzzle.position.set(0, 0.01, -0.76);
      sightY = 0.115;
      break;
    }
    case 'doublebarrel': {
      box(g, 0.08, 0.09, 0.2, mid, 0, 0, 0, METAL);
      cylZ(g, 0.022, 0.5, dark, -0.022, 0.02, -0.35, 10, METAL);
      cylZ(g, 0.022, 0.5, dark, 0.022, 0.02, -0.35, 10, METAL);
      box(g, 0.085, 0.03, 0.12, accent, 0, 0.055, -0.02, METAL);
      box(g, 0.07, 0.06, 0.22, wood, 0, -0.03, -0.25);
      box(g, 0.05, 0.12, 0.05, wood, 0, -0.08, 0.1).rotation.x = -0.4;
      box(g, 0.065, 0.11, 0.26, wood, 0, -0.04, 0.24);
      muzzle.position.set(0, 0.02, -0.6);
      sightY = 0.07;
      break;
    }
    case 'hunting': {
      box(g, 0.065, 0.09, 0.42, wood, 0, 0, -0.04);
      cylZ(g, 0.016, 0.62, dark, 0, 0.03, -0.55, 8, METAL);
      box(g, 0.07, 0.03, 0.26, accent, 0, 0.05, -0.08, METAL);
      box(g, 0.04, 0.1, 0.05, dark, 0, -0.07, 0.08).rotation.x = -0.35;
      box(g, 0.06, 0.12, 0.3, wood, 0, -0.03, 0.3);
      box(g, 0.02, 0.03, 0.02, dark, 0, 0.075, -0.8, METAL);
      muzzle.position.set(0, 0.03, -0.87);
      sightY = 0.075;
      break;
    }
    case 'handcannon': {
      box(g, 0.06, 0.08, 0.28, 0x1b1b22, 0, 0.04, -0.08, METAL);
      box(g, 0.062, 0.025, 0.24, accent, 0, 0.085, -0.08, METAL);
      box(g, 0.05, 0.14, 0.065, dark, 0, -0.05, 0.03).rotation.x = -0.25;
      muzzle.position.set(0, 0.045, -0.23);
      sightY = 0.1;
      break;
    }
    case 'minigun': {
      box(g, 0.16, 0.16, 0.36, mid, 0, 0, 0.02, METAL);
      box(g, 0.165, 0.05, 0.3, accent, 0, 0.07, 0.02, AC);
      const barrels = new THREE.Group();
      barrels.position.set(0, 0, -0.35);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cylZ(barrels, 0.014, 0.6, dark, Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.12, 6, METAL);
      }
      cylZ(barrels, 0.07, 0.04, 0x15171a, 0, 0, 0.12, 12, METAL);
      cylZ(barrels, 0.065, 0.03, 0x15171a, 0, 0, -0.38, 12, METAL);
      g.add(barrels);
      g.userData.spin = barrels;
      box(g, 0.05, 0.14, 0.06, dark, 0, -0.14, 0.04).rotation.x = -0.3;
      box(g, 0.04, 0.04, 0.22, dark, 0, 0.13, -0.05, METAL);
      box(g, 0.12, 0.1, 0.14, 0x4b5320, 0.12, -0.04, 0.05);
      muzzle.position.set(0, 0, -0.95);
      sightY = 0.15;
      break;
    }
    case 'tactical': {
      box(g, 0.075, 0.1, 0.3, 0x24262b, 0, 0, -0.02, METAL);
      cylZ(g, 0.024, 0.42, dark, 0, 0.025, -0.36, 10, METAL);
      cylZ(g, 0.02, 0.34, dark, 0, -0.025, -0.32, 10, METAL);
      box(g, 0.075, 0.075, 0.16, 0x24262b, 0, -0.035, -0.3, METAL);
      box(g, 0.077, 0.03, 0.22, accent, 0, 0.055, -0.06, AC);
      box(g, 0.045, 0.12, 0.05, dark, 0, -0.09, 0.08).rotation.x = -0.3;
      box(g, 0.05, 0.06, 0.2, dark, 0, -0.02, 0.22);
      box(g, 0.02, 0.04, 0.02, 0xff3030, 0, 0.08, -0.5, { emissive: 0xff2020 });
      muzzle.position.set(0, 0.025, -0.58);
      sightY = 0.085;
      break;
    }
    case 'revolver': {
      cylZ(g, 0.02, 0.24, mid, 0, 0.045, -0.2, 8, METAL);
      const drum = cylZ(g, 0.042, 0.08, accent, 0, 0.03, -0.05, 6, AC);
      drum.rotation.z = Math.PI / 6;
      box(g, 0.05, 0.06, 0.12, mid, 0, 0.03, -0.04, METAL);
      box(g, 0.048, 0.14, 0.06, wood, 0, -0.06, 0.04).rotation.x = -0.35;
      box(g, 0.012, 0.025, 0.012, dark, 0, 0.075, -0.3, METAL);
      muzzle.position.set(0, 0.045, -0.33);
      sightY = 0.085;
      break;
    }
    case 'dmr': {
      box(g, 0.07, 0.1, 0.52, 0x5a5048, 0, 0, -0.06, METAL);
      box(g, 0.074, 0.03, 0.36, accent, 0, 0.045, -0.1, AC);
      cylZ(g, 0.016, 0.42, dark, 0, 0.01, -0.5, 8, METAL);
      cylZ(g, 0.024, 0.08, 0x15171a, 0, 0.01, -0.72, 8, METAL);
      cylZ(g, 0.028, 0.22, 0x15171a, 0, 0.095, -0.06, 10, METAL);
      box(g, 0.05, 0.12, 0.06, dark, 0, -0.1, -0.14);
      box(g, 0.045, 0.11, 0.05, dark, 0, -0.08, 0.08).rotation.x = -0.35;
      box(g, 0.06, 0.11, 0.26, 0x5a5048, 0, -0.03, 0.3);
      muzzle.position.set(0, 0.01, -0.77);
      sightY = 0.095;
      break;
    }
    case 'rocket': {
      cylZ(g, 0.075, 0.95, 0x3d4a2e, 0, 0.06, -0.15, 12);
      cylZ(g, 0.085, 0.08, accent, 0, 0.06, -0.6, 12, AC);
      cylZ(g, 0.085, 0.1, dark, 0, 0.06, 0.32, 12, METAL);
      box(g, 0.05, 0.14, 0.06, dark, 0, -0.06, 0.02).rotation.x = -0.3;
      box(g, 0.05, 0.12, 0.06, dark, 0, -0.05, -0.25);
      box(g, 0.04, 0.07, 0.1, dark, -0.09, 0.12, -0.1, METAL);
      muzzle.position.set(0, 0.06, -0.64);
      sightY = 0.15;
      break;
    }
    case 'glauncher': {
      box(g, 0.08, 0.1, 0.3, mid, 0, 0, 0, METAL);
      const drum = cylZ(g, 0.075, 0.14, accent, 0, -0.01, -0.12, 8, AC);
      drum.rotation.z = Math.PI / 8;
      cylZ(g, 0.035, 0.32, dark, 0, 0.02, -0.34, 10, METAL);
      box(g, 0.045, 0.13, 0.05, dark, 0, -0.1, 0.08).rotation.x = -0.35;
      box(g, 0.05, 0.08, 0.22, dark, 0, -0.01, 0.24);
      box(g, 0.03, 0.05, 0.06, dark, 0, 0.08, -0.04, METAL);
      muzzle.position.set(0, 0.02, -0.52);
      sightY = 0.11;
      break;
    }
    case 'plasma': {
      const glow = { emissive: 0x1fa8a0, phong: true, shininess: 90 };
      box(g, 0.08, 0.11, 0.46, 0xeef3f6, 0, 0, -0.06, METAL);
      box(g, 0.084, 0.035, 0.34, accent, 0, 0.05, -0.1, AC);
      for (let i = 0; i < 4; i++) cylZ(g, 0.035, 0.03, accent, 0, 0.0, -0.36 - i * 0.07, 10, glow);
      cylZ(g, 0.018, 0.34, 0x2a3138, 0, 0.0, -0.46, 8, METAL);
      box(g, 0.05, 0.14, 0.06, 0x2a3138, 0, -0.11, -0.08).rotation.x = 0.2;
      box(g, 0.045, 0.11, 0.05, 0x2a3138, 0, -0.08, 0.08).rotation.x = -0.35;
      box(g, 0.06, 0.1, 0.22, 0xeef3f6, 0, -0.02, 0.26, METAL);
      box(g, 0.03, 0.05, 0.12, 0x2a3138, 0, 0.09, -0.06, METAL);
      box(g, 0.012, 0.012, 0.03, accent, 0, 0.12, -0.06, glow);
      muzzle.position.set(0, 0.0, -0.66);
      sightY = 0.12;
      break;
    }
    case 'boombow': {
      const r = 0.42;
      const limb = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 5, 14, 2).rotateZ(-1).rotateY(Math.PI / 2).translate(0, 0, r - 0.05), mat(accent, AC));
      g.add(limb);
      const ends = r * Math.sin(1);
      const sz = r * (1 - Math.cos(1)) - 0.05;
      box(g, 0.006, ends * 2, 0.006, 0xeeeeee, 0, 0, sz);
      box(g, 0.035, 0.12, 0.05, wood, 0, 0, -0.05);
      cylZ(g, 0.008, 0.62, 0x6b4a2b, 0, 0.0, -0.06, 6);
      cylZ(g, 0.02, 0.06, 0xff6a2a, 0, 0.0, -0.38, 8, { emissive: 0x902000 });
      muzzle.position.set(0, 0, -0.42);
      sightY = 0.06;
      break;
    }
    case 'pickaxe': {
      const P = PICKAXES[pick] || null;
      const headC = P?.head ?? 0x9aa5b1, handleC = P?.handle ?? 0x6b4a2b, accC = P?.accent ?? 0x3fa9ff;
      const HM = P?.glow ? { ...METAL, emissive: new THREE.Color(accC).multiplyScalar(0.5).getHex() } : P?.shiny ? { phong: true, shininess: 120, metalness: 0.9, roughness: 0.2 } : METAL;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 10), mat(handleC));
      handle.position.set(0, 0.2, 0);
      g.add(handle);
      // Empuñadura con cinta y pomo
      for (let i = 0; i < 5; i++) {
        const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.03, 10), mat(i % 2 ? 0x2b2f36 : accC));
        wrap.position.set(0, -0.08 + i * 0.032, 0);
        wrap.rotation.z = 0.08;
        g.add(wrap);
      }
      sphere(g, 0.032, 0x2b2f36, 0, -0.15, 0, METAL);
      const headG = new THREE.Group();
      headG.position.set(0, 0.52, 0);
      g.add(headG);
      const shape = P?.shape || 'pick';
      if (shape === 'axe') {
        box(headG, 0.06, 0.1, 0.1, 0x3a3f46, 0, 0, 0, METAL);
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 16, 1, false, Math.PI * 0.15, Math.PI * 0.7).rotateZ(Math.PI / 2), mat(headC, HM));
        blade.position.set(0, -0.02, -0.1);
        headG.add(blade);
        box(headG, 0.03, 0.05, 0.08, accC, 0, 0, 0.08, METAL);
      } else if (shape === 'hammer') {
        box(headG, 0.16, 0.16, 0.3, headC, 0, 0, -0.02, HM);
        for (const z of [-0.17, 0.13]) box(headG, 0.18, 0.18, 0.03, accC, 0, 0, z, METAL);
      } else if (shape === 'scythe') {
        box(headG, 0.05, 0.08, 0.08, handleC, 0, 0, 0, METAL);
        const blade = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 6, 20, Math.PI * 0.75).rotateY(Math.PI / 2), mat(headC, HM));
        blade.position.set(0, -0.28, 0.02);
        blade.rotation.x = Math.PI * 0.55;
        headG.add(blade);
        sphere(headG, 0.035, accC, 0, 0.05, 0, { emissive: accC });
      } else if (shape === 'lolly') {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24).rotateZ(Math.PI / 2), mat(headC, { roughness: 0.3 }));
        headG.add(disc);
        for (let k = 0; k < 3; k++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05 + k * 0.045, 0.012, 6, 24).rotateY(Math.PI / 2), mat(k % 2 ? accC : 0xffffff));
          ring.position.x = 0.026;
          headG.add(ring);
        }
      } else {
        box(headG, 0.07, 0.09, 0.12, 0x5d6670, 0, 0, 0, METAL);
        const front = box(headG, 0.05, 0.055, 0.24, headC, 0, -0.02, -0.16, HM);
        front.rotation.x = 0.22;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4).rotateX(-Math.PI / 2), mat(P ? headC : 0xe4ebf2, HM));
        tip.position.set(0, -0.06, -0.32);
        tip.rotation.x = 0.4;
        headG.add(tip);
        const back = box(headG, 0.055, 0.05, 0.12, accC, 0, -0.01, 0.11, METAL);
        back.rotation.x = -0.25;
        box(headG, 0.075, 0.02, 0.13, 0x2b2f36, 0, 0.05, 0, METAL);
      }
      muzzle.position.set(0, 0.52, -0.28);
      sightY = 0.1;
      break;
    }
  }
  if (PBR && type !== 'pickaxe' && type !== 'boombow') weaponDetails(g, type, muzzle, sightY);
  if (camo && CAMOS[camo] && type !== 'pickaxe') applyCamo(g, CAMOS[camo], [mid, dark, wood]);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.sightY = sightY;
  return g;
}

// Detalles comunes que dan volumen a las armas (sólo en calidad normal/alta):
// guardamonte y gatillo, ventana de expulsión, pasadores, raíl superior y
// bocacha. Se colocan a partir de la caja de la primera pieza (el cajón).
const RAILED = new Set(['ar', 'smg', 'burst', 'heavyar', 'dmr', 'tactical', 'plasma', 'glauncher']);
const BRAKE = new Set(['ar', 'smg', 'burst', 'heavyar', 'sniper', 'hunting', 'dmr']);
const PISTOLS = new Set(['pistol', 'handcannon', 'revolver']);
function weaponDetails(g, type, muzzle, sightY) {
  const first = g.children[0];
  if (!first) return;
  const bb = new THREE.Box3().setFromObject(first);
  const w = bb.max.x - bb.min.x;
  const steel = 0x1d1f23;
  const pistol = PISTOLS.has(type);
  // Guardamonte (medio aro) y gatillo, justo delante de la empuñadura
  const gz = pistol ? -0.025 : 0.0;
  const gy = pistol ? -0.005 : bb.min.y - 0.002;
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0055, 6, 12, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), mat(steel, METAL));
  guard.position.set(0, gy, gz);
  g.add(guard);
  box(g, 0.008, 0.03, 0.01, 0x101010, 0, gy - 0.016, gz + 0.004, METAL).rotation.x = 0.3;
  if (type === 'minigun' || type === 'rocket') return;
  // Ventana de expulsión y pasadores en el lado derecho del cajón
  if (!pistol) {
    box(g, 0.006, Math.min(0.035, (bb.max.y - bb.min.y) * 0.4), 0.07, 0x0c0c0e, bb.max.x + 0.001, (bb.max.y + bb.min.y) / 2 + 0.008, bb.min.z + (bb.max.z - bb.min.z) * 0.62, { sharp: true });
    for (const k of [0.25, 0.85]) {
      for (const side of [-1, 1]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8).rotateZ(Math.PI / 2), mat(0x9aa0a8, METAL));
        pin.position.set(side * (w / 2 + 0.002), bb.min.y + 0.025, bb.min.z + (bb.max.z - bb.min.z) * k);
        g.add(pin);
      }
    }
  } else {
    // Estrías de la corredera
    for (let i = 0; i < 4; i++) box(g, w + 0.004, 0.025, 0.005, 0x15161a, 0, bb.max.y - 0.025, bb.max.z - 0.02 - i * 0.012, { sharp: true });
  }
  // Raíl superior con ranuras
  if (RAILED.has(type)) {
    const top = Math.max(bb.max.y, sightY - 0.035);
    const z0 = bb.min.z + 0.04, z1 = Math.min(bb.max.z - 0.04, z0 + 0.3);
    box(g, 0.026, 0.008, z1 - z0, steel, 0, top + 0.004, (z0 + z1) / 2, { ...METAL, sharp: true });
    for (let z = z0 + 0.015; z < z1 - 0.01; z += 0.025) box(g, 0.03, 0.007, 0.01, steel, 0, top + 0.011, z, { ...METAL, sharp: true });
  }
  // Bocacha / apagallamas
  if (BRAKE.has(type)) {
    const r = type === 'heavyar' ? 0.026 : 0.022;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.07, 8).rotateX(Math.PI / 2), mat(0x141518, METAL));
    m.position.set(muzzle.position.x, muzzle.position.y, muzzle.position.z + 0.04);
    g.add(m);
    for (const s of [-1, 1]) box(g, 0.004, 0.012, 0.035, 0x050505, s * r * 0.95, muzzle.position.y, muzzle.position.z + 0.04, { sharp: true });
  }
  // Escopetas: estrías del guardamanos y cartuchos de repuesto en el lateral
  if (type === 'shotgun' || type === 'tactical') {
    for (let i = 0; i < 5; i++) box(g, 0.078, 0.006, 0.012, 0x3a2412, 0, -0.035 + 0.036, -0.29 - i * 0.033, { sharp: true });
    for (let i = 0; i < 4; i++) {
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8), mat(0xc0302a));
      sh.position.set(-0.042, -0.005, 0.03 + i * 0.026);
      g.add(sh);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.012, 8), mat(0xd9a440, METAL));
      cap.position.set(-0.042, -0.03, 0.03 + i * 0.026);
      g.add(cap);
    }
  }
}

// Mano enguantada para la vista en primera persona: palma, dedos cerrados
// sobre la empuñadura, pulgar, puño de la manga y antebrazo.
export function makeViewHand(skin, sleeve) {
  const g = new THREE.Group();
  box(g, 0.075, 0.07, 0.09, skin, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const f = box(g, 0.017, 0.022, 0.05, skin, -0.028 + i * 0.019, -0.03, -0.045 + (i === 0 || i === 3 ? 0.006 : 0));
    f.rotation.x = 0.5;
  }
  box(g, 0.02, 0.022, 0.05, skin, 0.042, 0.018, -0.03).rotation.set(0.2, -0.4, 0);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2), mat(sleeve));
  cuff.position.z = 0.065;
  cuff.material = mat(new THREE.Color(sleeve).multiplyScalar(0.75).getHex());
  g.add(cuff);
  const arm = capsule(g, 0.046, 0.36, sleeve, 0, 0, 0.24);
  arm.rotation.x = Math.PI / 2;
  return g;
}

// Camuflaje: las piezas del cuerpo del arma (no el color de rareza ni la mira)
// toman colores de la paleta del camuflaje, pieza a pieza.
function applyCamo(g, camo, recolor) {
  const cols = camo.colors;
  let i = 0;
  g.traverse((o) => {
    if (!o.isMesh || !recolor.includes(o.material.color.getHex())) return;
    const c = cols[(i * 7 + 3) % cols.length];
    i++;
    const opts = camo.shiny ? { phong: true, shininess: 90, specular: 0x888888 } : camo.glow ? { emissive: c, emissiveIntensity: 0.35 } : {};
    o.material = mat(c, opts);
  });
}

// ----------------------------------------------------------- CONSUMIBLES ---
function makeConsumableModel(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'bandage': {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 14), mat(0xf4f1ea));
      roll.rotation.z = Math.PI / 2;
      g.add(roll);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.03, 14), mat(0xd23c3c));
      band.rotation.z = Math.PI / 2;
      g.add(band);
      break;
    }
    case 'medkit': {
      box(g, 0.34, 0.22, 0.14, 0xf2f2f2);
      box(g, 0.2, 0.06, 0.15, 0xd62828);
      box(g, 0.06, 0.16, 0.15, 0xd62828);
      box(g, 0.12, 0.03, 0.03, 0x555555, 0, 0.13, 0);
      break;
    }
    case 'smallshield': {
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 14, 10),
        mat(0x3fa9ff, { emissive: 0x0b3a77, transparent: true, opacity: 0.9, phong: true, shininess: 90 }),
      );
      g.add(b);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 8), mat(0xe8f4ff));
      neck.position.y = 0.1;
      g.add(neck);
      break;
    }
    case 'chugjug': {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.14, 0.3, 14),
        mat(0x3f7bff, { emissive: 0x12307a, phong: true, shininess: 90 }),
      );
      g.add(b);
      for (const y of [-0.1, 0.1]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.03, 14), mat(0x8a5a2b));
        ring.position.y = y;
        g.add(ring);
      }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.07, 10), mat(0xffd34d, { emissive: 0x5a4400 }));
      cap.position.y = 0.18;
      g.add(cap);
      break;
    }
    case 'shieldpot': {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.1, 0.24, 14),
        mat(0x3fa9ff, { emissive: 0x0b3a77, transparent: true, opacity: 0.9, phong: true, shininess: 90 }),
      );
      g.add(b);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.07, 10), mat(0xdddddd));
      cap.position.y = 0.15;
      g.add(cap);
      break;
    }
    case 'flopper': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), mat(0x3fa9ff, { phong: true, shininess: 80 }));
      body.scale.set(0.7, 0.8, 1.5);
      g.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 4), mat(0x2f6fd6));
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = 0.18;
      g.add(tail);
      box(g, 0.02, 0.02, 0.02, 0x111111, 0.05, 0.03, -0.1);
      box(g, 0.02, 0.02, 0.02, 0x111111, -0.05, 0.03, -0.1);
      break;
    }
    case 'slurp': {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.09, 0.26, 12),
        mat(0x6a3fd6, { emissive: 0x2a0b77, transparent: true, opacity: 0.9, phong: true, shininess: 90 }),
      );
      g.add(b);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 12), mat(0x3fd6c9));
      lid.position.y = 0.15;
      g.add(lid);
      box(g, 0.01, 0.12, 0.01, 0xffffff, 0.03, 0.22, 0);
      break;
    }
    case 'launchpad': {
      box(g, 0.34, 0.06, 0.34, 0x2a2c30);
      box(g, 0.26, 0.04, 0.26, 0xf2c230, 0, 0.05, 0);
      box(g, 0.08, 0.05, 0.14, 0x2a2c30, 0, 0.08, 0.02);
      box(g, 0.16, 0.05, 0.05, 0x2a2c30, 0, 0.08, -0.06);
      break;
    }
  }
  return g;
}

// Plataforma de salto colocada en el suelo (2,4 × 2,4 m).
export function makeLaunchPad() {
  const g = new THREE.Group();
  box(g, 2.4, 0.3, 2.4, 0x2a2c30, 0, 0.15, 0);
  box(g, 2.0, 0.08, 2.0, 0xf2c230, 0, 0.33, 0, { emissive: 0x332200 });
  // flecha
  box(g, 0.5, 0.06, 1.0, 0x2a2c30, 0, 0.4, 0.2);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.6, 3).rotateX(-Math.PI / 2), mat(0x2a2c30));
  tip.position.set(0, 0.4, -0.5);
  tip.scale.y = 0.15;
  g.add(tip);
  return g;
}


function makeAmmoModel(ammo) {
  const g = new THREE.Group();
  const c = AMMO[ammo]?.color ?? 0xffffff;
  box(g, 0.32, 0.18, 0.2, 0x4b5320);
  box(g, 0.33, 0.04, 0.21, c, 0, 0.06, 0);
  return g;
}

// ------------------------------------------------------------ ARROJADIZOS
export function makeThrowableModel(type) {
  const g = new THREE.Group();
  const sphere = (r, color, opts, y = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat(color, opts));
    m.position.y = y;
    g.add(m);
    return m;
  };
  switch (type) {
    case 'grenade': {
      sphere(0.075, 0x4f6a2e, { phong: true, shininess: 30 });
      box(g, 0.03, 0.04, 0.03, 0x888888, 0, 0.08, 0, METAL);
      box(g, 0.012, 0.09, 0.025, 0xaaaaaa, 0.03, 0.06, 0, METAL).rotation.z = -0.4;
      box(g, 0.152, 0.012, 0.152, 0x3a4f22, 0, 0, 0);
      break;
    }
    case 'sticky': {
      sphere(0.07, 0x2a6fd6, { phong: true, shininess: 50 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(g, 0.035, 0.035, 0.035, 0x9de05a, Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07, { emissive: 0x2a5a10 });
      }
      box(g, 0.03, 0.03, 0.03, 0x9de05a, 0, 0.075, 0, { emissive: 0x2a5a10 });
      break;
    }
    case 'impulse': {
      sphere(0.075, 0x6a3fd6, { phong: true, shininess: 70 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.03, 14), mat(0x7ad0ff, { emissive: 0x2a7aaa }));
      g.add(band);
      box(g, 0.03, 0.03, 0.03, 0xdddddd, 0, 0.08, 0, METAL);
      break;
    }
    case 'c4': {
      box(g, 0.2, 0.07, 0.13, 0xd8c48a);
      box(g, 0.21, 0.02, 0.135, 0x333333, 0, 0, 0);
      box(g, 0.06, 0.03, 0.05, 0x222222, 0.05, 0.045, 0);
      box(g, 0.015, 0.015, 0.015, 0xff2020, 0.05, 0.065, 0, { emissive: 0xff0000 });
      box(g, 0.008, 0.02, 0.1, 0xd03030, -0.04, 0.04, 0);
      break;
    }
    case 'smoke': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12), mat(0x8a9099));
      g.add(c);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.057, 0.03, 12), mat(0xdddddd));
      t.position.y = 0.05;
      g.add(t);
      box(g, 0.02, 0.03, 0.02, 0x666666, 0, 0.095, 0, METAL);
      break;
    }
    case 'molotov': {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 10), mat(0x6a8a3a, { transparent: true, opacity: 0.9, phong: true, shininess: 100 }));
      g.add(b);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 8), mat(0x6a8a3a, { phong: true, shininess: 100 }));
      neck.position.y = 0.12;
      g.add(neck);
      box(g, 0.03, 0.06, 0.03, 0xe8dcc0, 0, 0.18, 0);
      box(g, 0.02, 0.025, 0.02, 0xff8a2a, 0, 0.22, 0, { emissive: 0xff5a00 });
      break;
    }
  }
  return g;
}

// Proyectiles de las armas explosivas (apuntan hacia -Z).
export function makeProjectileModel(kind) {
  const g = new THREE.Group();
  if (kind === 'rocket') {
    cylZ(g, 0.06, 0.45, 0x5a6a4a, 0, 0, 0, 10);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 10).rotateX(-Math.PI / 2), mat(0xd04030));
    tip.position.z = -0.3;
    g.add(tip);
    for (let i = 0; i < 4; i++) {
      const f = box(g, 0.01, 0.12, 0.12, 0x333333, 0, 0, 0.2);
      f.rotation.z = (i * Math.PI) / 2;
    }
  } else if (kind === 'arrow') {
    cylZ(g, 0.01, 0.7, 0x6b4a2b, 0, 0, 0, 6);
    cylZ(g, 0.025, 0.07, 0xff6a2a, 0, 0, -0.33, 8, { emissive: 0x902000 });
    box(g, 0.004, 0.05, 0.1, 0xeeeeee, 0, 0, 0.3);
  } else {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(0x4f5a3a, { phong: true, shininess: 40 }));
    s.scale.z = 1.4;
    g.add(s);
    box(g, 0.1, 0.02, 0.02, 0xffa22a, 0, 0, 0, { emissive: 0x7a3a00 });
  }
  return g;
}

export function makeItemModel(item, camo = null, pick = null) {
  if (item.kind === 'weapon') return makeWeaponModel(item.type, item.rarity, camo);
  if (item.kind === 'consumable') return makeConsumableModel(item.type);
  if (item.kind === 'throwable') return makeThrowableModel(item.type);
  if (item.kind === 'ammo') return makeAmmoModel(item.ammo);
  if (item.kind === 'material') return makeMaterialModel(item.mat);
  return makeWeaponModel('pickaxe', 0, null, pick);
}

// ------------------------------------------------------------------ COFRE ---
// Frente hacia +Z, bisagra atrás.
function makeChest() {
  const g = new THREE.Group();
  const wood = 0x8a5a2b;
  const gold = 0xf2c230;
  const goldMat = { emissive: 0x6b4a00, phong: true, shininess: 80 };
  box(g, 1.0, 0.5, 0.6, wood, 0, 0.25, 0);
  box(g, 1.03, 0.08, 0.63, gold, 0, 0.04, 0, goldMat);
  box(g, 1.03, 0.06, 0.63, gold, 0, 0.47, 0, goldMat);
  box(g, 0.08, 0.5, 0.63, gold, -0.46, 0.25, 0, goldMat);
  box(g, 0.08, 0.5, 0.63, gold, 0.46, 0.25, 0, goldMat);
  const lid = new THREE.Group();
  lid.position.set(0, 0.5, -0.3);
  g.add(lid);
  box(lid, 1.02, 0.2, 0.62, wood, 0, 0.1, 0.31);
  box(lid, 1.04, 0.06, 0.64, gold, 0, 0.18, 0.31, goldMat);
  box(lid, 0.12, 0.14, 0.04, gold, 0, 0.0, 0.63, goldMat);
  g.userData.lid = lid;
  return g;
}

function makeAmmoBox() {
  const g = new THREE.Group();
  box(g, 0.8, 0.35, 0.45, 0x4b5320, 0, 0.175, 0);
  box(g, 0.82, 0.05, 0.47, 0x6b7a2a, 0, 0.3, 0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.35, -0.22);
  g.add(lid);
  box(lid, 0.82, 0.08, 0.46, 0x5b6a26, 0, 0.04, 0.23);
  box(lid, 0.12, 0.04, 0.04, 0xcccccc, 0, 0.0, 0.46);
  g.userData.lid = lid;
  return g;
}

// ------------------------------------------------------------- PERSONAJE ---
// Colores base de cada skin (los detalles se añaden en addSuitParts).
const SUIT_LOOK = {
  banana: { skin: 0xffe135, shirt: 0xffe135, pants: 0xf2cf1d, hair: 0xffe135, pack: false },
  astronauta: { skin: 0xf1c9a5, shirt: 0xf2f4f7, pants: 0xdfe3ea, hair: 0x3a2a1a, pack: false },
  robot: { skin: 0x9aa5b1, shirt: 0x6b7684, pants: 0x4b5563, hair: 0x9aa5b1, pack: false },
  pirata: { skin: 0xe0b48a, shirt: 0xf2f2f2, pants: 0x2b2b38, hair: 0x1b1b1b, pack: true },
  ninja: { skin: 0x1b1b22, shirt: 0x1b1b22, pants: 0x1b1b22, hair: 0x1b1b22, pack: false },
  dino: { skin: 0x4fbf4a, shirt: 0x4fbf4a, pants: 0x3a9a3a, hair: 0x4fbf4a, pack: false },
};

// Colores efectivos de un aspecto (la skin manda sobre los colores elegidos).
export function outfitColors(c = {}) {
  const look = SUIT_LOOK[c.suit];
  return { skin: look?.skin ?? c.skin ?? 0xe0b48a, shirt: look?.shirt ?? c.shirt ?? 0x2f6fd6 };
}

export function makeCharacter(c = {}) {
  const look = SUIT_LOOK[c.suit] || null;
  const skin = look?.skin ?? c.skin ?? 0xe0b48a;
  const shirt = look?.shirt ?? c.shirt ?? 0x2f6fd6;
  const pants = look?.pants ?? c.pants ?? 0x2b2b38;
  const hair = look?.hair ?? c.hair ?? 0x3a2a1a;
  const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Piernas: cadera → muslo → rodilla → espinilla → zapatilla
  const mkLeg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.92, 0);
    capsule(hip, 0.09, 0.47, pants, 0, -0.22, 0).castShadow = true;
    box(hip, 0.05, 0.09, 0.02, shade(pants, 0.75), x > 0 ? 0.06 : -0.06, -0.12, -0.085); // bolsillo
    const knee = new THREE.Group();
    knee.position.y = -0.45;
    hip.add(knee);
    capsule(knee, 0.08, 0.42, pants, 0, -0.2, 0).castShadow = true;
    box(knee, 0.16, 0.06, 0.18, shade(pants, 0.85), 0, -0.3, 0); // bajo del pantalón
    box(knee, 0.15, 0.11, 0.27, 0x2a2d33, 0, -0.39, -0.04).castShadow = true; // zapatilla
    box(knee, 0.155, 0.035, 0.28, 0xf2f2f2, 0, -0.455, -0.04); // suela
    box(knee, 0.1, 0.02, 0.06, 0xf2f2f2, 0, -0.34, -0.13); // cordones
    body.add(hip);
    hip.userData.knee = knee;
    return hip;
  };
  const legL = mkLeg(-0.12);
  const legR = mkLeg(0.12);
  // Torso: pecho, cintura, cinturón y cuello
  box(body, 0.38, 0.13, 0.23, pants, 0, 0.93, 0);
  const torso = box(body, 0.47, 0.36, 0.27, shirt, 0, 1.36, 0);
  torso.castShadow = true;
  box(body, 0.41, 0.25, 0.24, shade(shirt, 0.88), 0, 1.09, 0).castShadow = true;
  box(body, 0.43, 0.07, 0.26, 0x1d1d1d, 0, 0.98, 0);
  box(body, 0.07, 0.05, 0.02, 0xc9a050, 0, 0.98, -0.135, { phong: true, shininess: 90 });
  box(body, 0.2, 0.04, 0.28, shade(shirt, 0.7), 0, 1.53, 0); // cuello de la camiseta
  box(body, 0.012, 0.3, 0.012, shade(shirt, 0.65), 0, 1.3, -0.137); // cremallera
  capsule(body, 0.065, 0.14, skin, 0, 1.56, 0);
  // Cabeza con cara
  const head = new THREE.Group();
  head.position.set(0, 1.56, 0);
  body.add(head);
  box(head, 0.32, 0.33, 0.31, skin, 0, 0.17, 0).castShadow = true;
  for (const x of [-1, 1]) {
    box(head, 0.035, 0.08, 0.06, shade(skin, 0.92), 0.165 * x, 0.17, 0.01); // orejas
    box(head, 0.075, 0.06, 0.02, 0xffffff, 0.07 * x, 0.2, -0.157, { sharp: true });
    box(head, 0.036, 0.045, 0.02, 0x2a1d14, 0.068 * x, 0.198, -0.166, { sharp: true });
    box(head, 0.012, 0.012, 0.01, 0xffffff, 0.06 * x, 0.212, -0.177, { sharp: true });
    box(head, 0.085, 0.02, 0.02, hair, 0.072 * x, 0.255, -0.16, { sharp: true }); // cejas
  }
  box(head, 0.045, 0.06, 0.05, shade(skin, 0.9), 0, 0.15, -0.165); // nariz
  box(head, 0.09, 0.016, 0.012, 0x8a3a32, 0, 0.085, -0.157, { sharp: true }); // boca
  // Pelo con volumen
  box(head, 0.345, 0.1, 0.34, hair, 0, 0.35, 0.005);
  box(head, 0.34, 0.24, 0.08, hair, 0, 0.24, 0.135);
  for (const x of [-1, 1]) box(head, 0.05, 0.16, 0.27, hair, 0.162 * x, 0.27, 0.03);
  for (const [x, w] of [[-0.09, 0.12], [0.03, 0.14], [0.12, 0.08]]) box(head, w, 0.07, 0.06, hair, x, 0.31, -0.145);
  // Brazos: hombro → brazo → codo → antebrazo → mano
  const mkArm = (x) => {
    const sh = new THREE.Group();
    sh.position.set(x, 1.5, 0);
    sphere(sh, 0.09, shirt, 0, -0.02, 0);
    capsule(sh, 0.072, 0.34, shirt, 0, -0.16, 0).castShadow = true;
    const elbow = new THREE.Group();
    elbow.position.y = -0.31;
    sh.add(elbow);
    capsule(elbow, 0.062, 0.26, skin, 0, -0.12, 0).castShadow = true;
    box(elbow, 0.13, 0.05, 0.13, shade(shirt, 0.85), 0, -0.01, 0); // puño de la manga
    box(elbow, 0.09, 0.1, 0.085, skin, 0, -0.27, -0.005); // mano
    box(elbow, 0.03, 0.05, 0.03, skin, x > 0 ? -0.045 : 0.045, -0.25, -0.04); // pulgar
    body.add(sh);
    sh.userData.elbow = elbow;
    return sh;
  };
  const armL = mkArm(-0.32);
  const armR = mkArm(0.32);
  if (c.bag && BAGS[c.bag]) addBag(body, c.bag);
  else if (!look || look.pack) {
    box(body, 0.34, 0.4, 0.15, 0x6b4a2b, 0, 1.27, 0.21).castShadow = true; // mochila
    box(body, 0.3, 0.12, 0.17, 0x5a3d22, 0, 1.43, 0.215);
    box(body, 0.2, 0.12, 0.05, 0x7a5a38, 0, 1.15, 0.3);
    for (const x of [-0.13, 0.13]) box(body, 0.045, 0.36, 0.02, 0x4a3420, x, 1.34, -0.14); // correas
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.29, 0);
  armR.userData.elbow.add(hand);
  const parts = {
    root, body, legL, legR, armL, armR, head, torso, hand,
    kneeL: legL.userData.knee, kneeR: legR.userData.knee, elbowL: armL.userData.elbow, elbowR: armR.userData.elbow,
  };
  if (look) addSuitParts(parts, c.suit);
  if (c.acc) addAccessory(parts, c.acc);
  return parts;
}

const GOLD = { emissive: 0x6a4a00 };

function addSuitParts({ body, head, armL, armR }, suit) {
  switch (suit) {
    case 'banana':
      box(head, 0.27, 0.3, 0.27, 0xffe135, 0, 0.46, 0.02);
      box(head, 0.2, 0.2, 0.2, 0xf7d82a, 0, 0.68, 0.07);
      box(head, 0.08, 0.12, 0.08, 0x5a3a1a, 0, 0.83, 0.12);
      box(head, 0.12, 0.025, 0.02, 0x111111, 0, 0.1, -0.155);
      for (const [x, y] of [[-0.12, 1.36], [0.14, 1.12], [-0.05, 1.02], [0.08, 1.45]]) box(body, 0.06, 0.06, 0.02, 0x7a5a20, x, y, -0.135);
      break;
    case 'astronauta':
      box(head, 0.44, 0.06, 0.44, 0xf2f4f7, 0, 0.38, 0);
      box(head, 0.06, 0.42, 0.44, 0xf2f4f7, -0.22, 0.17, 0);
      box(head, 0.06, 0.42, 0.44, 0xf2f4f7, 0.22, 0.17, 0);
      box(head, 0.44, 0.42, 0.06, 0xf2f4f7, 0, 0.17, 0.22);
      box(head, 0.38, 0.07, 0.04, 0xffb43c, 0, 0.32, -0.21, { emissive: 0x553300 });
      box(body, 0.44, 0.56, 0.22, 0xe6e9ee, 0, 1.25, 0.24).castShadow = true;
      box(body, 0.1, 0.1, 0.02, 0x2f6fd6, -0.12, 1.38, -0.135);
      box(body, 0.1, 0.1, 0.02, 0xd63a2f, 0.12, 1.38, -0.135);
      box(body, 0.2, 0.06, 0.02, 0x8a93a0, 0, 1.18, -0.135);
      break;
    case 'robot':
      box(head, 0.26, 0.07, 0.04, 0xff3030, 0, 0.2, -0.16, { emissive: 0xff2020 });
      box(head, 0.03, 0.2, 0.03, 0x333a44, 0, 0.44, 0);
      box(head, 0.08, 0.08, 0.08, 0xff3030, 0, 0.56, 0, { emissive: 0xaa1010 });
      box(body, 0.3, 0.22, 0.03, 0x2b323c, 0, 1.3, -0.14);
      box(body, 0.05, 0.05, 0.02, 0x40ff80, -0.08, 1.33, -0.16, { emissive: 0x20a040 });
      box(body, 0.05, 0.05, 0.02, 0xffd23f, 0, 1.33, -0.16, { emissive: 0x806010 });
      box(body, 0.05, 0.05, 0.02, 0x3fa9ff, 0.08, 1.33, -0.16, { emissive: 0x1050a0 });
      box(armL, 0.2, 0.14, 0.2, 0x4b5563, 0, -0.05, 0);
      box(armR, 0.2, 0.14, 0.2, 0x4b5563, 0, -0.05, 0);
      break;
    case 'pirata':
      box(head, 0.48, 0.05, 0.42, 0x1b1b1b, 0, 0.36, 0);
      box(head, 0.34, 0.16, 0.32, 0x1b1b1b, 0, 0.45, 0);
      box(head, 0.07, 0.07, 0.02, 0xf2f2f2, 0, 0.46, -0.165);
      box(head, 0.09, 0.08, 0.03, 0x111111, -0.07, 0.2, -0.165);
      box(head, 0.32, 0.02, 0.02, 0x111111, 0, 0.27, -0.155);
      for (const y of [1.04, 1.16, 1.28, 1.4]) box(body, 0.49, 0.05, 0.27, 0xd63a2f, 0, y, 0);
      box(body, 0.5, 0.08, 0.28, 0x6b4a2b, 0, 0.98, 0);
      box(body, 0.08, 0.08, 0.02, 0xffd23f, 0, 0.98, -0.145, GOLD);
      break;
    case 'ninja':
      box(head, 0.24, 0.06, 0.02, 0xe0b48a, 0, 0.2, -0.15);
      box(head, 0.33, 0.06, 0.33, 0xd63a2f, 0, 0.3, 0);
      box(head, 0.05, 0.05, 0.2, 0xd63a2f, 0.06, 0.29, 0.25);
      box(head, 0.05, 0.05, 0.18, 0xd63a2f, -0.04, 0.27, 0.24);
      {
        const k = box(body, 0.04, 0.8, 0.04, 0xc0c6cc, 0.12, 1.35, 0.17, METAL);
        k.rotation.z = 0.55;
        const hdl = box(body, 0.05, 0.22, 0.05, 0xd63a2f, -0.12, 1.66, 0.17);
        hdl.rotation.z = 0.55;
      }
      box(body, 0.5, 0.06, 0.28, 0xd63a2f, 0, 0.98, 0);
      break;
    case 'dino':
      box(head, 0.28, 0.16, 0.24, 0x4fbf4a, 0, 0.11, -0.25);
      box(head, 0.24, 0.03, 0.02, 0xf2f2f2, 0, 0.05, -0.37);
      box(head, 0.08, 0.06, 0.04, 0x111111, -0.08, 0.27, -0.13);
      box(head, 0.08, 0.06, 0.04, 0x111111, 0.08, 0.27, -0.13);
      for (const [y, s] of [[0.56, 0.1], [0.42, 0.13]]) box(head, 0.05, s, 0.1, 0x2f8a2f, 0, y - 0.1, 0.1);
      for (const y of [1.52, 1.36, 1.2, 1.04]) box(body, 0.06, 0.12, 0.1, 0x2f8a2f, 0, y, 0.17);
      box(body, 0.2, 0.18, 0.5, 0x4fbf4a, 0, 0.95, 0.38).castShadow = true;
      box(body, 0.12, 0.12, 0.34, 0x4fbf4a, 0, 0.88, 0.78);
      box(body, 0.32, 0.4, 0.03, 0xc8e86a, 0, 1.2, -0.13);
      break;
  }
}

function addAccessory({ body, head }, acc) {
  switch (acc) {
    case 'corona':
      box(head, 0.32, 0.07, 0.32, 0xffd23f, 0, 0.44, 0, GOLD);
      for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12], [0, -0.13]]) box(head, 0.06, 0.1, 0.06, 0xffd23f, x, 0.52, z, GOLD);
      box(head, 0.05, 0.05, 0.02, 0xff2d55, 0, 0.45, -0.165, { emissive: 0x801020 });
      break;
    case 'gorra':
      box(head, 0.33, 0.09, 0.33, 0xd63a2f, 0, 0.38, 0);
      box(head, 0.3, 0.03, 0.16, 0xd63a2f, 0, 0.35, -0.22);
      box(head, 0.06, 0.04, 0.06, 0xf2f2f2, 0, 0.44, 0);
      break;
    case 'gafas':
      box(head, 0.32, 0.03, 0.03, 0x111111, 0, 0.23, -0.17);
      box(head, 0.11, 0.07, 0.03, 0x1a2a3a, -0.07, 0.2, -0.175);
      box(head, 0.11, 0.07, 0.03, 0x1a2a3a, 0.07, 0.2, -0.175);
      break;
    case 'auriculares':
      box(head, 0.37, 0.04, 0.07, 0x222222, 0, 0.4, 0);
      box(head, 0.06, 0.15, 0.13, 0x2bfff1, -0.18, 0.2, 0, { emissive: 0x0a5a55 });
      box(head, 0.06, 0.15, 0.13, 0x2bfff1, 0.18, 0.2, 0, { emissive: 0x0a5a55 });
      break;
    case 'vikingo':
      box(head, 0.35, 0.13, 0.35, 0x8a93a0, 0, 0.38, 0, METAL);
      box(head, 0.06, 0.05, 0.36, 0x6b4a2b, 0, 0.42, 0);
      for (const x of [-1, 1]) {
        box(head, 0.07, 0.07, 0.07, 0xf2ead2, 0.21 * x, 0.42, 0);
        box(head, 0.06, 0.14, 0.06, 0xf2ead2, 0.25 * x, 0.52, 0);
      }
      break;
    case 'vaquero':
      box(head, 0.6, 0.03, 0.56, 0x7a4a24, 0, 0.36, 0);
      box(head, 0.32, 0.18, 0.3, 0x7a4a24, 0, 0.46, 0);
      box(head, 0.33, 0.04, 0.31, 0x2b1d10, 0, 0.39, 0);
      break;
    case 'capa': {
      const cape = box(body, 0.52, 1.0, 0.04, 0xb01c2e, 0, 0.98, 0.3);
      cape.rotation.x = 0.12;
      box(body, 0.5, 0.06, 0.06, 0xffd23f, 0, 1.5, 0.18, GOLD);
      break;
    }
    case 'aureola':
      for (const [w, d, x, z] of [[0.3, 0.04, 0, -0.14], [0.3, 0.04, 0, 0.14], [0.04, 0.3, -0.14, 0], [0.04, 0.3, 0.14, 0]]) {
        box(head, w, 0.03, d, 0xfff3a0, x, 0.62, z, { emissive: 0xb09a30 });
      }
      break;
    case 'alas':
      for (const x of [-1, 1]) {
        const w = box(body, 0.5, 0.7, 0.04, 0xf7f7ff, 0.32 * x, 1.32, 0.3);
        w.rotation.z = -0.35 * x;
        w.rotation.y = 0.35 * x;
        const w2 = box(body, 0.34, 0.4, 0.05, 0xe2e6f5, 0.5 * x, 1.12, 0.32);
        w2.rotation.z = -0.5 * x;
      }
      break;
  }
}

// --------------------------------------------------------------- PLANEADOR ---
export function makeGlider(skin = null) {
  const G = GLIDERS[skin] || null;
  if (G?.shape === 'wing') return makeWingGlider(G);
  const g = new THREE.Group();
  const colors = G?.colors || [0xff5a3c, 0xffffff, 0xffc23c, 0x3cb6ff];
  const segs = colors.length > 4 ? colors.length * 2 : 8;
  for (let i = 0; i < segs; i++) {
    const geo = new THREE.SphereGeometry(2.2, 4, 6, (i / segs) * Math.PI * 2, (Math.PI * 2) / segs, 0, Math.PI / 2.6);
    const m = new THREE.Mesh(geo, mat(colors[i % colors.length], { side: THREE.DoubleSide }));
    m.castShadow = true;
    g.add(m);
  }
  g.scale.set(1.35, 0.55, 1.0);
  g.position.y = 2.2;
  const lines = [];
  const rimY = Math.cos(Math.PI / 2.6) * 2.2;
  const rimR = Math.sin(Math.PI / 2.6) * 2.2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    lines.push(new THREE.Vector3(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR));
    lines.push(new THREE.Vector3(0, -2.2 / 0.55 + 1.6, 0));
  }
  const lg = new THREE.BufferGeometry().setFromPoints(lines);
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x333333 })));
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

// Planeador en forma de ala (tiburón, dragón): ala delta con costillas.
function makeWingGlider(G) {
  const g = new THREE.Group();
  const [c1, c2] = G.colors;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.6);
  shape.lineTo(2.6, -0.5);
  shape.quadraticCurveTo(1.3, -0.1, 0, -0.7);
  shape.quadraticCurveTo(-1.3, -0.1, -2.6, -0.5);
  shape.lineTo(0, 0.6);
  const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8).rotateX(-Math.PI / 2), mat(c1, { side: THREE.DoubleSide }));
  wing.castShadow = true;
  g.add(wing);
  for (const x of [-1.7, -0.9, 0, 0.9, 1.7]) {
    const rib = box(g, 0.05, 0.05, 1.1 - Math.abs(x) * 0.3, c2, x, 0.03, 0.05 + Math.abs(x) * 0.2);
    rib.rotation.y = -x * 0.12;
  }
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 3).rotateX(Math.PI / 2), mat(c2));
  fin.scale.set(0.3, 1, 1);
  fin.position.set(0, 0.3, 0.3);
  g.add(fin);
  g.position.y = 2.6;
  const lines = [];
  for (const x of [-2, -1, 1, 2]) {
    lines.push(new THREE.Vector3(x, 2.6, -0.1));
    lines.push(new THREE.Vector3(0, 1.6, 0));
  }
  const wrap = new THREE.Group();
  wrap.add(g);
  wrap.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x333333 })));
  return wrap;
}

// Mochilas de la taquilla (sustituyen a la de serie).
function addBag(body, id) {
  const B = BAGS[id];
  const { color: c, accent: a } = B;
  for (const x of [-0.13, 0.13]) box(body, 0.045, 0.36, 0.02, 0x2b2b2b, x, 1.34, -0.14); // correas
  if (B.style === 'tank') {
    for (const x of [-0.08, 0.08]) {
      capsule(body, 0.075, 0.46, c, x, 1.3, 0.23, METAL);
      capsule(body, 0.03, 0.08, a, x, 1.56, 0.23, METAL);
    }
    box(body, 0.3, 0.05, 0.05, a, 0, 1.2, 0.2);
  } else if (B.style === 'bear') {
    sphere(body, 0.17, c, 0, 1.26, 0.25, null, 1, 1.1, 0.8);
    sphere(body, 0.13, c, 0, 1.5, 0.25);
    for (const x of [-0.09, 0.09]) sphere(body, 0.05, a, x, 1.62, 0.25);
    sphere(body, 0.05, 0xe8d0b0, 0, 1.48, 0.36);
    for (const x of [-0.045, 0.045]) sphere(body, 0.018, 0x111111, x, 1.53, 0.355);
  } else if (B.style === 'shield') {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 20).rotateX(Math.PI / 2), mat(c));
    sh.position.set(0, 1.3, 0.24);
    body.add(sh);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 20), mat(a, METAL));
    rim.position.set(0, 1.3, 0.265);
    body.add(rim);
    sphere(body, 0.06, a, 0, 1.3, 0.28, METAL);
  } else if (B.style === 'rocket') {
    capsule(body, 0.13, 0.5, c, 0, 1.32, 0.25, METAL);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.18, 12), mat(a));
    nose.position.set(0, 1.66, 0.25);
    body.add(nose);
    for (const x of [-1, 1]) box(body, 0.1, 0.16, 0.03, a, x * 0.15, 1.1, 0.25).rotation.z = x * 0.4;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 10).rotateX(Math.PI), mat(0xffb03a, { emissive: 0xff6a00 }));
    flame.position.set(0, 1.0, 0.25);
    body.add(flame);
  } else if (B.style === 'wings') {
    box(body, 0.22, 0.3, 0.1, c, 0, 1.32, 0.22, METAL);
    for (const x of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const f = box(body, 0.36 - k * 0.07, 0.05, 0.03, k === 0 ? a : c, x * (0.25 + k * 0.02), 1.42 - k * 0.1, 0.25, k === 0 ? { emissive: a } : METAL);
        f.rotation.z = x * (0.35 + k * 0.25);
      }
    }
  }
}

// ---------------------------------------------------------------- AUTOBÚS ---
// Autobús de batalla detallado: carrocería con franjas, ventanillas con
// asientos y pasajeros, conductor, puertas, faros, retrovisores, parrilla,
// matrícula, techo con barandilla y equipaje, globo aerostático con quemador
// y llama, cuerdas, hélice trasera y banderines.
export function makeBus() {
  const g = new THREE.Group();
  const blue = 0x2f7de1;
  const shiny = { phong: true, shininess: 60 };
  const glass = { phong: true, shininess: 120, transparent: true, opacity: 0.55 };
  const body = new THREE.Group();
  g.add(body);
  // Carrocería
  box(body, 3.2, 2.6, 10, blue, 0, 0.2, 0, shiny);
  box(body, 3.0, 0.4, 9.8, 0x2563c4, 0, 1.7, 0, shiny); // techo
  box(body, 3.22, 0.35, 10.02, 0xffffff, 0, -0.55, 0);
  box(body, 3.25, 0.22, 10.05, 0xf2c230, 0, -0.85, 0);
  box(body, 3.26, 0.45, 10.06, 0x1d4f9e, 0, -1.2, 0); // faldón
  // Ventanillas laterales (cristal + marco) y asientos/pasajeros
  for (let i = -3; i <= 3; i++) {
    const z = i * 1.25 + 0.4;
    for (const sx of [-1, 1]) {
      box(body, 0.06, 0.95, 1.0, 0x9fd3ff, sx * 1.62, 0.65, z, glass);
      box(body, 0.08, 0.08, 1.12, 0xf2f2f2, sx * 1.63, 1.16, z);
      box(body, 0.08, 0.08, 1.12, 0xf2f2f2, sx * 1.63, 0.14, z);
      // asiento + pasajero (silueta)
      box(body, 0.6, 0.5, 0.5, 0xd63a2f, sx * 0.9, -0.1, z + 0.2);
      box(body, 0.6, 0.8, 0.12, 0xb02a22, sx * 0.9, 0.35, z + 0.45);
      if ((i + sx * 2) % 3 !== 0) {
        box(body, 0.32, 0.45, 0.25, [0x2fa84f, 0xe0a020, 0x8a3fd6, 0x1fb5b0][(i + 4) % 4], sx * 0.9, 0.4, z + 0.15);
        box(body, 0.24, 0.24, 0.24, 0xe0b48a, sx * 0.9, 0.78, z + 0.15);
      }
    }
  }
  // Parabrisas, conductor y volante
  box(body, 2.8, 1.25, 0.08, 0x9fd3ff, 0, 0.75, -5.02, glass);
  box(body, 3.0, 0.1, 0.1, 0xf2f2f2, 0, 1.4, -5.03);
  box(body, 0.1, 1.3, 0.1, 0xf2f2f2, 0, 0.75, -5.03);
  box(body, 0.5, 0.55, 0.4, 0xf2f2f2, -0.8, 0.35, -4.2); // conductor (camisa)
  box(body, 0.32, 0.32, 0.32, 0xe0b48a, -0.8, 0.85, -4.2);
  box(body, 0.36, 0.12, 0.36, 0x2f2f2f, -0.8, 1.06, -4.2); // gorra
  box(body, 0.42, 0.04, 0.2, 0x2f2f2f, -0.8, 1.02, -4.42);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 14), mat(0x222222));
  wheel.position.set(-0.8, 0.45, -4.6);
  wheel.rotation.x = -0.6;
  body.add(wheel);
  // Frontal: parrilla, faros, matrícula, parachoques, retrovisores
  box(body, 2.2, 0.55, 0.1, 0x333840, 0, -0.45, -5.04, METAL);
  for (let k = -3; k <= 3; k++) box(body, 0.06, 0.45, 0.12, 0x8a8f96, k * 0.3, -0.45, -5.06, METAL);
  for (const sx of [-1, 1]) {
    box(body, 0.45, 0.32, 0.1, 0xfff6c8, sx * 1.25, -0.42, -5.06, { emissive: 0xfff0a0 });
    box(body, 0.3, 0.16, 0.08, 0xff8a1a, sx * 1.25, -0.72, -5.05, { emissive: 0x803000 });
    box(body, 0.08, 0.5, 0.08, 0x222222, sx * 1.75, 0.8, -4.7);
    box(body, 0.12, 0.35, 0.25, 0x222222, sx * 1.8, 1.0, -4.85);
  }
  box(body, 0.9, 0.22, 0.04, 0xf2f2f2, 0, -0.95, -5.08);
  box(body, 3.3, 0.22, 0.25, 0x555b63, 0, -1.25, -5.05, METAL);
  // Trasera: pilotos y parachoques
  for (const sx of [-1, 1]) box(body, 0.35, 0.5, 0.08, 0xff2a2a, sx * 1.25, -0.2, 5.03, { emissive: 0x801010 });
  box(body, 3.3, 0.22, 0.25, 0x555b63, 0, -1.25, 5.05, METAL);
  box(body, 2.4, 1.0, 0.06, 0x9fd3ff, 0, 0.85, 5.02, glass);
  // Puertas (lado derecho)
  box(body, 0.07, 2.0, 1.2, 0x9fd3ff, 1.62, -0.05, -3.7, glass);
  box(body, 0.09, 2.1, 0.06, 0xf2f2f2, 1.63, -0.05, -3.1);
  box(body, 0.09, 2.1, 0.06, 0xf2f2f2, 1.63, -0.05, -4.3);
  // Logo en los laterales (círculo amarillo con franja)
  for (const sx of [-1, 1]) {
    const logo = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20).rotateZ(Math.PI / 2), mat(0xf2c230));
    logo.position.set(sx * 1.63, -0.55, 3.6);
    body.add(logo);
    box(body, 0.07, 0.12, 0.62, 0x1d4f9e, sx * 1.64, -0.55, 3.6);
  }
  // Ruedas con llantas
  for (const x of [-1.55, 1.55]) {
    for (const z of [-3.4, 3.4]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 16).rotateZ(Math.PI / 2), mat(0x1a1a1a));
      w.position.set(x, -1.5, z);
      body.add(w);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.44, 10).rotateZ(Math.PI / 2), mat(0xc0c4cc, METAL));
      rim.position.set(x, -1.5, z);
      body.add(rim);
    }
  }
  // Techo: barandilla y equipaje
  for (const sx of [-1, 1]) box(body, 0.08, 0.08, 7.5, 0x8a8f96, sx * 1.35, 2.15, 0.5, METAL);
  for (let k = -3; k <= 4; k++) box(body, 2.7, 0.06, 0.06, 0x8a8f96, 0, 2.15, k * 1.0 + 0.5, METAL);
  box(body, 1.1, 0.6, 0.8, 0x8a5a32, -0.5, 2.3, -1.5);
  box(body, 0.9, 0.5, 1.2, 0x5a4632, 0.6, 2.25, 1.0);
  box(body, 0.7, 0.45, 0.7, 0xd6a03a, -0.3, 2.22, 2.8);
  // Globo aerostático con gajos de colores
  const balloon = new THREE.Group();
  balloon.position.y = 12;
  g.add(balloon);
  const bcol = [0x2f7de1, 0xffffff, 0xf2c230, 0xffffff];
  for (let i = 0; i < 16; i++) {
    const geo = new THREE.SphereGeometry(6.2, 3, 16, (i / 16) * Math.PI * 2, (Math.PI * 2) / 16);
    balloon.add(new THREE.Mesh(geo, mat(bcol[i % 4], { phong: true, shininess: 30 })));
  }
  balloon.scale.set(1, 1.18, 1);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.6, 2.2, 16, 1, true), mat(0x2f7de1, { side: THREE.DoubleSide }));
  skirt.position.y = -7.3;
  balloon.add(skirt);
  // Quemador con llama animada
  const burner = new THREE.Group();
  burner.position.y = 4.4;
  g.add(burner);
  box(burner, 1.0, 0.4, 1.0, 0x3a3d42, 0, 0, 0, METAL);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
  flame.position.y = 1.0;
  burner.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.0, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
  core.position.y = 0.75;
  burner.add(core);
  // Cuerdas del globo al techo y al quemador
  const ropePts = [];
  for (const [x, z] of [[-1.5, -4.5], [1.5, -4.5], [-1.5, 4.5], [1.5, 4.5], [-1.5, 0], [1.5, 0]]) {
    ropePts.push(new THREE.Vector3(x, 1.9, z), new THREE.Vector3(x * 1.4, 5.4, z * 0.35));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ropePts.push(new THREE.Vector3(Math.cos(a) * 0.5, 4.6, Math.sin(a) * 0.5), new THREE.Vector3(Math.cos(a) * 1.7, 5.4, Math.sin(a) * 1.7));
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ropePts), new THREE.LineBasicMaterial({ color: 0x222222 })));
  // Banderines a lo largo de una cuerda
  for (let k = 0; k < 6; k++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 3), mat([0xd63a2f, 0xf2c230, 0x2fa84f][k % 3]));
    f.position.set(1.6 + k * 0.05, 2.5 + k * 0.45, -4.5 + k * 0.5);
    f.rotation.z = Math.PI;
    g.add(f);
  }
  // Hélice trasera con soporte
  box(g, 0.25, 0.25, 0.8, 0x3a3d42, 0, 0, 5.4, METAL);
  const prop = new THREE.Group();
  prop.position.set(0, 0, 5.85);
  g.add(prop);
  box(prop, 0.3, 2.8, 0.08, 0x333333);
  box(prop, 2.8, 0.3, 0.08, 0x333333);
  box(prop, 0.4, 0.4, 0.15, 0xf2c230);
  g.userData.prop = prop;
  g.userData.balloon = balloon;
  g.userData.flame = flame;
  g.userData.flameCore = core;
  return g;
}

// ----------------------------------------------------------- MUÑECO DIANA ---
export function makeDummy() {
  const g = new THREE.Group();
  box(g, 0.6, 0.12, 0.6, 0x555555, 0, 0.06, 0);
  box(g, 0.12, 0.9, 0.12, 0x8a6a40, 0, 0.5, 0);
  const upper = new THREE.Group();
  upper.position.y = 0.9;
  g.add(upper);
  box(upper, 0.6, 0.7, 0.3, 0xe8823a, 0, 0.35, 0).castShadow = true;
  box(upper, 0.32, 0.32, 0.04, 0xffffff, 0, 0.4, -0.16);
  box(upper, 0.18, 0.18, 0.05, 0xd62828, 0, 0.4, -0.17);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mat(0xe8c48a));
  head.position.y = 0.88;
  head.castShadow = true;
  upper.add(head);
  box(upper, 0.9, 0.08, 0.08, 0x8a6a40, 0, 0.55, 0);
  g.userData.upper = upper;
  return g;
}

// ---------------------------------------------------------------- TEXTURAS ---
let glowTex = null;
export function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// ------------------------------------------------------------ FUSIÓN ---
// Convierte un grupo de mallas (cada una con su color) en una sola geometría
// con color por vértice: 1 draw call por objeto en lugar de ~10.
let vcCache = null;
function vcMat() {
  if (!vcCache || vcCache.userData.pbr !== PBR) {
    vcCache = PBR ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.06 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
    vcCache.userData.pbr = PBR;
  }
  return vcCache;
}
const mergedCache = new Map();
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();

export function mergeGroupGeometry(root) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const pos = [];
  const nor = [];
  const col = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    _m.multiplyMatrices(_inv, o.matrixWorld);
    g.applyMatrix4(_m);
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const c = o.material.color;
    const e = o.material.emissive || { r: 0, g: 0, b: 0 };
    // Oclusión aproximada: las caras que miran hacia abajo, algo más oscuras
    const glow = e.r + e.g + e.b > 0.05;
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]);
      nor.push(n[i], n[i + 1], n[i + 2]);
      const ao = glow ? 1 : 0.8 + 0.2 * (n[i + 1] * 0.5 + 0.5);
      col.push(Math.min(1, c.r * ao + e.r), Math.min(1, c.g * ao + e.g), Math.min(1, c.b * ao + e.b));
    }
    g.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

export function mergedMesh(key, build) {
  let geo = mergedCache.get(key);
  if (!geo) mergedCache.set(key, (geo = mergeGroupGeometry(build())));
  const m = new THREE.Mesh(geo, vcMat());
  m.castShadow = true;
  return m;
}

export function itemKey(item) {
  if (item.kind === 'weapon') return `w_${item.type}_${item.rarity}`;
  if (item.kind === 'consumable') return `c_${item.type}`;
  if (item.kind === 'throwable') return `t_${item.type}`;
  if (item.kind === 'ammo') return `a_${item.ammo}`;
  if (item.kind === 'material') return `m_${item.mat}`;
  return 'pickaxe';
}

// Cofre / caja de munición con 2 mallas fusionadas (cuerpo + tapa).
export function makeContainerFast(kind) {
  const key = kind === 'chest' ? 'chest' : 'ammobox';
  let entry = mergedCache.get(key);
  if (!entry) {
    const proto = kind === 'chest' ? makeChest() : makeAmmoBox();
    const lid = proto.userData.lid;
    const lidPos = lid.position.clone();
    proto.remove(lid);
    lid.position.set(0, 0, 0);
    entry = { body: mergeGroupGeometry(proto), lid: mergeGroupGeometry(lid), lidPos };
    mergedCache.set(key, entry);
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(entry.body, vcMat());
  body.castShadow = true;
  g.add(body);
  const pivot = new THREE.Group();
  pivot.position.copy(entry.lidPos);
  const lid = new THREE.Mesh(entry.lid, vcMat());
  lid.castShadow = true;
  pivot.add(lid);
  g.add(pivot);
  g.userData.lid = pivot;
  return g;
}

// Fusiona las mallas directas de cada parte del personaje (cuerpo, cabeza,
// extremidades) para dibujarlo con ~6 draw calls en lugar de ~25.
export function optimizeCharacter(c) {
  for (const g of [c.body, c.head, c.legL, c.legR, c.armL, c.armR, c.kneeL, c.kneeR, c.elbowL, c.elbowR]) {
    if (!g) continue;
    const meshes = g.children.filter((o) => o.isMesh);
    if (meshes.length < 2) continue;
    const tmp = new THREE.Group();
    for (const m of meshes) {
      g.remove(m);
      tmp.add(m);
    }
    const merged = new THREE.Mesh(mergeGroupGeometry(tmp), vcMat());
    merged.castShadow = true;
    g.add(merged);
  }
  return c;
}

// ------------------------------------------------------------------ COCHE ---
// Frente hacia -Z. wrecked = coche abandonado (oxidado, sin ruedas).
export function makeCarModel(color = 0xd63a2f, wrecked = false) {
  const g = new THREE.Group();
  const body = wrecked ? 0x7a5a44 : color;
  const dark = 0x1b1f26;
  const glass = wrecked ? 0x2a2e33 : 0x29445e;
  box(g, 2.0, 0.6, 4.3, body, 0, 0.7, 0, { phong: !wrecked, shininess: 60 });
  box(g, 1.8, 0.75, 2.2, body, 0, 1.35, 0.25, { phong: !wrecked, shininess: 60 });
  box(g, 1.82, 0.55, 2.0, glass, 0, 1.38, 0.25, { phong: true, shininess: 120 });
  box(g, 1.6, 0.5, 0.06, glass, 0, 1.38, -0.88, { phong: true, shininess: 120 });
  box(g, 2.05, 0.2, 0.25, 0x333333, 0, 0.45, -2.15);
  box(g, 2.05, 0.2, 0.25, 0x333333, 0, 0.45, 2.15);
  box(g, 0.35, 0.15, 0.05, wrecked ? 0x555555 : 0xfff6c0, -0.7, 0.75, -2.16, wrecked ? {} : { emissive: 0x777755 });
  box(g, 0.35, 0.15, 0.05, wrecked ? 0x555555 : 0xfff6c0, 0.7, 0.75, -2.16, wrecked ? {} : { emissive: 0x777755 });
  box(g, 0.35, 0.15, 0.05, 0xb01010, -0.7, 0.75, 2.16);
  box(g, 0.35, 0.15, 0.05, 0xb01010, 0.7, 0.75, 2.16);
  if (!wrecked) {
    box(g, 2.02, 0.12, 4.32, 0xffffff, 0, 0.92, 0);
  }
  const wheels = [];
  for (const x of [-0.98, 0.98]) {
    for (const z of [-1.35, 1.4]) {
      const w = new THREE.Group();
      w.position.set(x, wrecked ? 0.22 : 0.4, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 14).rotateZ(Math.PI / 2), mat(dark));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8).rotateZ(Math.PI / 2), mat(0xbbbbbb));
      w.add(tire, hub);
      g.add(w);
      wheels.push(w);
    }
  }
  g.userData.wheels = wheels;
  return g;
}

// Quad: chasis bajo, guardabarros, manillar y ruedas grandes de tacos.
export function makeQuadModel(color = 0xf07a1a) {
  const g = new THREE.Group();
  const dark = 0x1b1f26;
  box(g, 1.0, 0.35, 2.0, 0x2a2c30, 0, 0.6, 0, METAL); // chasis
  box(g, 1.2, 0.25, 0.8, color, 0, 0.95, -0.65, { phong: true, shininess: 60 }); // capó
  box(g, 1.2, 0.25, 0.7, color, 0, 0.92, 0.7, { phong: true, shininess: 60 }); // trasera
  box(g, 0.55, 0.22, 0.9, 0x1e1e1e, 0, 1.08, 0.1); // asiento
  for (const x of [-0.62, 0.62]) for (const z of [-0.7, 0.75]) box(g, 0.32, 0.08, 0.7, color, x, 1.08, z, { phong: true, shininess: 60 }); // guardabarros
  box(g, 0.08, 0.45, 0.08, 0x333333, 0, 1.25, -0.7, METAL); // columna
  cylZ(g, 0.03, 0.8, 0x222222, 0, 1.48, -0.72, 8, METAL).rotation.y = Math.PI / 2; // manillar
  for (const x of [-0.42, 0.42]) box(g, 0.07, 0.07, 0.12, 0x111111, x, 1.48, -0.72);
  box(g, 0.5, 0.14, 0.05, 0xfff6c0, 0, 0.98, -1.06, { emissive: 0x777755 }); // faro
  box(g, 0.9, 0.1, 0.4, 0x3a3a3a, 0, 1.12, 1.05, METAL); // portabultos
  const wheels = [];
  for (const x of [-0.72, 0.72]) {
    for (const z of [-0.72, 0.78]) {
      const w = new THREE.Group();
      w.position.set(x, 0.42, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.38, 12).rotateZ(Math.PI / 2), mat(dark));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 8).rotateZ(Math.PI / 2), mat(color));
      w.add(tire, hub);
      for (let k = 0; k < 8; k++) {
        const lug = box(w, 0.4, 0.07, 0.1, 0x111111, 0, Math.cos((k / 8) * Math.PI * 2) * 0.42, Math.sin((k / 8) * Math.PI * 2) * 0.42);
        lug.rotation.x = (k / 8) * Math.PI * 2;
      }
      g.add(w);
      wheels.push(w);
    }
  }
  g.userData.wheels = wheels;
  return g;
}

// Lancha: casco en V, cabina con parabrisas, asiento y motor fueraborda.
export function makeBoatModel(color = 0x2f6fd6) {
  const g = new THREE.Group();
  const hull = new THREE.Shape();
  hull.moveTo(-1.0, 1.6);
  hull.lineTo(1.0, 1.6);
  hull.lineTo(1.05, -0.6);
  hull.quadraticCurveTo(0.8, -2.0, 0, -2.5);
  hull.quadraticCurveTo(-0.8, -2.0, -1.05, -0.6);
  hull.lineTo(-1.0, 1.6);
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 0.75, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }).rotateX(Math.PI / 2).translate(0, 0.85, 0);
  const hm = new THREE.Mesh(hg, mat(0xf2f2f2, { phong: true, shininess: 60 }));
  g.add(hm);
  box(g, 2.12, 0.18, 3.6, color, 0, 0.45, -0.1, { phong: true, shininess: 60, sharp: true }); // franja
  box(g, 1.8, 0.08, 3.4, 0x8a5a32, 0, 0.82, 0.1); // cubierta
  box(g, 1.5, 0.5, 0.9, color, 0, 1.1, -0.6, { phong: true, shininess: 60 }); // consola
  box(g, 1.45, 0.45, 0.05, 0x29445e, 0, 1.55, -0.95, { phong: true, shininess: 120 }).rotation.x = -0.4; // parabrisas
  cylZ(g, 0.12, 0.05, 0x222222, -0.3, 1.4, -0.45, 12, METAL); // volante
  box(g, 0.6, 0.35, 0.5, 0x1e1e1e, -0.3, 1.0, 0.3); // asiento
  box(g, 0.6, 0.35, 0.5, 0x1e1e1e, 0.35, 1.0, 0.9);
  box(g, 0.5, 0.9, 0.45, 0x2a2c30, 0, 0.75, 1.75, METAL); // motor
  box(g, 0.56, 0.3, 0.5, color, 0, 1.25, 1.75, { phong: true, shininess: 60 });
  for (const x of [-1, 1]) box(g, 0.05, 0.08, 2.4, 0xc0c6ce, x * 0.98, 1.0, 0.2, METAL); // barandillas
  g.userData.wheels = [];
  return g;
}

function makeMaterialModel(m) {
  const g = new THREE.Group();
  if (m === 'wood') {
    for (let i = 0; i < 3; i++) box(g, 0.45, 0.07, 0.14, i % 2 ? 0xb07a40 : 0x9a6a36, 0, i * 0.075, 0).rotation.y = i * 0.5;
  } else if (m === 'stone') {
    for (let i = 0; i < 3; i++) box(g, 0.22, 0.12, 0.16, 0x9a9ea6, (i - 1) * 0.12, (i % 2) * 0.12, 0);
  } else {
    for (let i = 0; i < 3; i++) box(g, 0.4, 0.04, 0.3, 0x7f93a8, 0, i * 0.05, 0, METAL).rotation.y = i * 0.3;
  }
  return g;
}
