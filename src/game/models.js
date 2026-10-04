import * as THREE from 'three';
import { RARITIES, AMMO } from './items.js';


// Modelos low-poly construidos con primitivas.

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    const Ctor = opts.phong ? THREE.MeshPhongMaterial : THREE.MeshLambertMaterial;
    const o = { color, ...opts };
    delete o.phong;
    m = new Ctor(o);
    matCache.set(key, m);
  }
  return m;
}

const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w},${h},${d}`;
  let g = boxGeoCache.get(k);
  if (!g) boxGeoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}

function box(parent, w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
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
export function makeWeaponModel(type, rarity = 0) {
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
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 8), mat(0x6b4a2b));
      handle.position.set(0, 0.2, 0);
      g.add(handle);
      const head = box(g, 0.05, 0.06, 0.46, 0x9aa5b1, 0, 0.52, -0.05, METAL);
      head.rotation.x = 0.1;
      box(g, 0.055, 0.04, 0.1, 0x3fa9ff, 0, 0.52, 0.2, METAL);
      muzzle.position.set(0, 0.52, -0.28);
      sightY = 0.1;
      break;
    }
  }
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.sightY = sightY;
  return g;
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
  }
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

export function makeItemModel(item) {
  if (item.kind === 'weapon') return makeWeaponModel(item.type, item.rarity);
  if (item.kind === 'consumable') return makeConsumableModel(item.type);
  if (item.kind === 'throwable') return makeThrowableModel(item.type);
  if (item.kind === 'ammo') return makeAmmoModel(item.ammo);
  if (item.kind === 'material') return makeMaterialModel(item.mat);
  return makeWeaponModel('pickaxe');
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
export function makeCharacter(c = {}) {
  const skin = c.skin ?? 0xe0b48a;
  const shirt = c.shirt ?? 0x2f6fd6;
  const pants = c.pants ?? 0x2b2b38;
  const hair = c.hair ?? 0x3a2a1a;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mkLimb = (x, y, w, h, color, color2) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = box(pivot, w, h, w, color, 0, -h / 2, 0);
    m.castShadow = true;
    if (color2) box(pivot, w + 0.01, 0.12, w + 0.01, color2, 0, -h + 0.06, 0);
    body.add(pivot);
    return pivot;
  };
  const legL = mkLimb(-0.12, 0.92, 0.17, 0.9, pants, 0x222222);
  const legR = mkLimb(0.12, 0.92, 0.17, 0.9, pants, 0x222222);
  const torso = box(body, 0.48, 0.62, 0.26, shirt, 0, 1.23, 0);
  torso.castShadow = true;
  box(body, 0.5, 0.1, 0.28, 0x1d1d1d, 0, 0.95, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.56, 0);
  body.add(head);
  box(head, 0.3, 0.32, 0.3, skin, 0, 0.17, 0).castShadow = true;
  box(head, 0.32, 0.1, 0.32, hair, 0, 0.36, 0.0);
  box(head, 0.32, 0.18, 0.06, hair, 0, 0.26, 0.15);
  box(head, 0.05, 0.05, 0.02, 0x111111, -0.07, 0.2, -0.155);
  box(head, 0.05, 0.05, 0.02, 0x111111, 0.07, 0.2, -0.155);
  const armL = mkLimb(-0.32, 1.5, 0.14, 0.62, shirt, skin);
  const armR = mkLimb(0.32, 1.5, 0.14, 0.62, shirt, skin);
  box(body, 0.36, 0.4, 0.16, 0x6b4a2b, 0, 1.25, 0.2).castShadow = true; // mochila
  const hand = new THREE.Group();
  hand.position.set(0, -0.6, 0);
  armR.add(hand);
  return { root, body, legL, legR, armL, armR, head, torso, hand };
}

// --------------------------------------------------------------- PLANEADOR ---
export function makeGlider() {
  const g = new THREE.Group();
  const colors = [0xff5a3c, 0xffffff, 0xffc23c, 0x3cb6ff];
  const segs = 8;
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

// ---------------------------------------------------------------- AUTOBÚS ---
export function makeBus() {
  const g = new THREE.Group();
  const blue = 0x2f7de1;
  const body = new THREE.Group();
  g.add(body);
  box(body, 3.2, 3.0, 10, blue, 0, 0, 0, { phong: true, shininess: 50 });
  box(body, 3.22, 0.5, 10.02, 0xffffff, 0, 0.6, 0);
  box(body, 3.25, 0.25, 10.05, 0xf2c230, 0, -1.2, 0);
  for (let i = -4; i <= 3; i++) {
    box(body, 3.26, 0.9, 0.9, 0x1c2a3a, 0, 0.6, i * 1.15 + 0.3, { phong: true, shininess: 100 });
  }
  box(body, 2.8, 1.1, 0.1, 0x1c2a3a, 0, 0.6, -5.02, { phong: true, shininess: 100 });
  box(body, 2.0, 0.5, 0.1, 0xdddddd, 0, -0.8, -5.04);
  for (const x of [-1.6, 1.6]) {
    for (const z of [-3.5, 3.5]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 14).rotateZ(Math.PI / 2), mat(0x1a1a1a));
      w.position.set(x, -1.5, z);
      body.add(w);
    }
  }
  // Globo
  const balloon = new THREE.Group();
  balloon.position.y = 11;
  g.add(balloon);
  const bcol = [0x2f7de1, 0xffffff];
  for (let i = 0; i < 12; i++) {
    const geo = new THREE.SphereGeometry(6, 3, 14, (i / 12) * Math.PI * 2, (Math.PI * 2) / 12);
    balloon.add(new THREE.Mesh(geo, mat(bcol[i % 2], { phong: true, shininess: 30 })));
  }
  balloon.scale.set(1, 1.15, 1);
  const ropePts = [];
  for (const [x, z] of [[-1.5, -4.5], [1.5, -4.5], [-1.5, 4.5], [1.5, 4.5]]) {
    ropePts.push(new THREE.Vector3(x, 1.5, z), new THREE.Vector3(x * 1.8, 7, z * 0.6));
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ropePts), new THREE.LineBasicMaterial({ color: 0x222222 })));
  // Hélice
  const prop = new THREE.Group();
  prop.position.set(0, 0, 5.2);
  g.add(prop);
  box(prop, 0.3, 2.6, 0.08, 0x333333);
  box(prop, 2.6, 0.3, 0.08, 0x333333);
  g.userData.prop = prop;
  g.userData.balloon = balloon;
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
const vcMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
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
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]);
      nor.push(n[i], n[i + 1], n[i + 2]);
      col.push(Math.min(1, c.r + e.r), Math.min(1, c.g + e.g), Math.min(1, c.b + e.b));
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
  const m = new THREE.Mesh(geo, vcMaterial);
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
  const body = new THREE.Mesh(entry.body, vcMaterial);
  body.castShadow = true;
  g.add(body);
  const pivot = new THREE.Group();
  pivot.position.copy(entry.lidPos);
  const lid = new THREE.Mesh(entry.lid, vcMaterial);
  lid.castShadow = true;
  pivot.add(lid);
  g.add(pivot);
  g.userData.lid = pivot;
  return g;
}

// Fusiona las mallas directas de cada parte del personaje (cuerpo, cabeza,
// extremidades) para dibujarlo con ~6 draw calls en lugar de ~25.
export function optimizeCharacter(c) {
  for (const g of [c.body, c.head, c.legL, c.legR, c.armL, c.armR]) {
    const meshes = g.children.filter((o) => o.isMesh);
    if (meshes.length < 2) continue;
    const tmp = new THREE.Group();
    for (const m of meshes) {
      g.remove(m);
      tmp.add(m);
    }
    const merged = new THREE.Mesh(mergeGroupGeometry(tmp), vcMaterial);
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
