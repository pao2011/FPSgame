import * as THREE from 'three';

// Grafitis: dibujos que se pintan con spray en paredes y suelos (rueda de
// gestos). Se dibujan en un canvas y se colocan como una calcomanía.
export const SPRAYS = {
  gg: { name: 'GG', draw: (x, s) => text(x, s, 'GG', '#ffd34d', '#8a2bff') },
  corona: { name: 'Corona', draw: drawCrown },
  llama: { name: 'Llama', draw: drawLlama },
  calavera: { name: 'Calavera', draw: drawSkull },
  isla: { name: 'Isla', draw: drawIsland },
  corazon: { name: 'Corazón', draw: drawHeart },
};

function text(x, s, t, fill, stroke) {
  x.font = `900 ${s * 0.46}px "Lilita One", "Arial Black", sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = s * 0.06;
  x.strokeStyle = stroke;
  x.strokeText(t, s / 2, s / 2);
  x.fillStyle = fill;
  x.fillText(t, s / 2, s / 2);
}

function blob(x, s, color) {
  // Mancha de pintura de fondo con goterones
  x.fillStyle = color;
  x.beginPath();
  x.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
  x.fill();
  for (let i = 0; i < 5; i++) {
    const px = s * (0.25 + i * 0.12);
    x.fillRect(px, s * 0.6, s * 0.03, s * (0.25 + ((i * 37) % 10) / 40));
  }
}

function drawCrown(x, s) {
  blob(x, s, 'rgba(40,20,90,0.85)');
  x.fillStyle = '#ffd34d';
  x.strokeStyle = '#8a5a00';
  x.lineWidth = s * 0.03;
  x.beginPath();
  x.moveTo(s * 0.22, s * 0.68);
  x.lineTo(s * 0.2, s * 0.32);
  x.lineTo(s * 0.36, s * 0.48);
  x.lineTo(s * 0.5, s * 0.26);
  x.lineTo(s * 0.64, s * 0.48);
  x.lineTo(s * 0.8, s * 0.32);
  x.lineTo(s * 0.78, s * 0.68);
  x.closePath();
  x.fill();
  x.stroke();
}

function drawLlama(x, s) {
  blob(x, s, 'rgba(255,90,140,0.85)');
  x.fillStyle = '#c78bff';
  x.fillRect(s * 0.38, s * 0.3, s * 0.24, s * 0.42);
  x.fillRect(s * 0.4, s * 0.2, s * 0.06, s * 0.12);
  x.fillRect(s * 0.54, s * 0.2, s * 0.06, s * 0.12);
  x.fillStyle = '#111';
  x.fillRect(s * 0.43, s * 0.38, s * 0.04, s * 0.04);
  x.fillRect(s * 0.53, s * 0.38, s * 0.04, s * 0.04);
  x.fillStyle = '#ffd34d';
  x.fillRect(s * 0.38, s * 0.6, s * 0.24, s * 0.05);
}

function drawSkull(x, s) {
  blob(x, s, 'rgba(20,20,20,0.85)');
  x.fillStyle = '#f2f2f2';
  x.beginPath();
  x.arc(s * 0.5, s * 0.44, s * 0.2, 0, Math.PI * 2);
  x.fill();
  x.fillRect(s * 0.38, s * 0.52, s * 0.24, s * 0.16);
  x.fillStyle = '#111';
  x.beginPath();
  x.arc(s * 0.43, s * 0.44, s * 0.05, 0, Math.PI * 2);
  x.arc(s * 0.57, s * 0.44, s * 0.05, 0, Math.PI * 2);
  x.fill();
  for (let i = 0; i < 3; i++) x.fillRect(s * (0.41 + i * 0.07), s * 0.6, s * 0.03, s * 0.08);
}

function drawIsland(x, s) {
  blob(x, s, 'rgba(40,140,220,0.85)');
  x.fillStyle = '#ffd34d';
  x.beginPath();
  x.arc(s * 0.62, s * 0.36, s * 0.1, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#e8c07a';
  x.beginPath();
  x.ellipse(s * 0.5, s * 0.66, s * 0.26, s * 0.08, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#5a3a1a';
  x.lineWidth = s * 0.03;
  x.beginPath();
  x.moveTo(s * 0.44, s * 0.64);
  x.quadraticCurveTo(s * 0.4, s * 0.45, s * 0.46, s * 0.32);
  x.stroke();
  x.fillStyle = '#3fbf4a';
  for (const a of [-2.6, -1.9, -1.2, -0.5]) {
    x.beginPath();
    x.ellipse(s * 0.46 + Math.cos(a) * s * 0.08, s * 0.32 + Math.sin(a) * s * 0.04, s * 0.1, s * 0.03, a, 0, Math.PI * 2);
    x.fill();
  }
}

function drawHeart(x, s) {
  blob(x, s, 'rgba(255,255,255,0.8)');
  x.fillStyle = '#e0314a';
  x.beginPath();
  x.moveTo(s * 0.5, s * 0.72);
  x.bezierCurveTo(s * 0.12, s * 0.48, s * 0.28, s * 0.18, s * 0.5, s * 0.36);
  x.bezierCurveTo(s * 0.72, s * 0.18, s * 0.88, s * 0.48, s * 0.5, s * 0.72);
  x.fill();
}

const texCache = new Map();
export function sprayTexture(id) {
  let t = texCache.get(id);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  (SPRAYS[id] || SPRAYS.gg).draw(x, 256);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(id, t);
  return t;
}

// Imagen (dataURL) para la rueda de gestos.
export function sprayIcon(id) {
  return sprayTexture(id).image.toDataURL();
}

const MAX = 14;

export class Sprays {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geo = new THREE.PlaneGeometry(1.7, 1.7);
  }

  // Pinta el grafiti donde mira el jugador (a menos de 6 m).
  spray(id) {
    const g = this.game;
    const p = g.player;
    if (!p.alive || p.mode !== 'ground') return false;
    const hit = g.raycast(g.aimOrigin, g.aimDir, 6 + g.aimSkip, g.aimSkip, p);
    if (!hit || hit.kind === 'character' || hit.kind === 'dummy') {
      g.hud.toast('Acércate a una pared o al suelo para pintar');
      return false;
    }
    const n = hit.normal || new THREE.Vector3(0, 1, 0);
    const m = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({
      map: sprayTexture(id), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    m.position.copy(hit.point).addScaledVector(n, 0.02);
    // En las paredes, derecho; en el suelo, mirando hacia el jugador
    const up = Math.abs(n.y) > 0.8 ? new THREE.Vector3(-g.aimDir.x, 0, -g.aimDir.z).normalize().negate() : new THREE.Vector3(0, 1, 0);
    const z = n.clone().normalize();
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    m.scale.setScalar(0.1);
    m.userData.grow = 0;
    g.scene.add(m);
    this.list.push(m);
    while (this.list.length > MAX) {
      const old = this.list.shift();
      g.scene.remove(old);
      old.material.dispose();
    }
    g.audio.spray?.();
    for (let i = 0; i < 3; i++) g.effects.puff(hit.point.clone().addScaledVector(n, 0.3), 0xdddddd, 0.3, 0.6, null, 0.35);
    return true;
  }

  update(dt) {
    for (const m of this.list) {
      if (m.userData.grow >= 1) continue;
      m.userData.grow = Math.min(1, m.userData.grow + dt * 4);
      m.scale.setScalar(0.1 + 0.9 * (1 - Math.pow(1 - m.userData.grow, 3)));
    }
  }

  clear() {
    for (const m of this.list) {
      this.game.scene.remove(m);
      m.material.dispose();
    }
    this.list = [];
  }
}
