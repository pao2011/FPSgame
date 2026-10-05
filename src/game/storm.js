import * as THREE from 'three';
import { random } from '../core/rng.js';

const PHASES = [
  // Las dos primeras fases son algo más cortas y cerradas: los jugadores se
  // juntan antes y hay que andar menos para encontrar pelea.
  { wait: 75, shrink: 65, radius: 470, dps: 1 },
  { wait: 60, shrink: 55, radius: 290, dps: 1 },
  { wait: 60, shrink: 50, radius: 190, dps: 2 },
  { wait: 50, shrink: 40, radius: 100, dps: 5 },
  { wait: 40, shrink: 35, radius: 48, dps: 8 },
  // Zona móvil: durante la espera el círculo entero se desplaza
  { wait: 30, shrink: 30, radius: 18, dps: 10, move: true },
  { wait: 20, shrink: 25, radius: 0, dps: 10, move: true },
];

function stormTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a2fd0';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const r = 10 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.1 + Math.random() * 0.25;
    g.addColorStop(0, Math.random() < 0.5 ? `rgba(220,150,255,${a})` : `rgba(40,0,90,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(24, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Duelo por equipos: se cierra una vez y se queda fija.
const RUMBLE = [{ wait: 0, shrink: 0, radius: 450, dps: 2 }];
// 1v1: arena pequeña y fija.
const DUEL = [{ wait: 0, shrink: 0, radius: 55, dps: 5 }];

// Tormenta que se cierra por fases.
export class Storm {
  constructor(scene, world) {
    this.world = world;
    this.tex = stormTexture();
    const geo = new THREE.CylinderGeometry(1, 1, 1, 128, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex, color: 0xd9a6ff, transparent: true, opacity: 0.42, side: THREE.DoubleSide,
      depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.center = new THREE.Vector2();
    this.next = new THREE.Vector2();
    this.from = new THREE.Vector2();
    this.reset();
    this.active = false;
  }

  // rng: en online, la misma semilla para todos para que la zona coincida.
  reset(kind = 'br', rng = random) {
    this.rng = rng;
    // Fases variables: tiempos distintos en cada partida (misma semilla online)
    this.phases = kind === 'rumble' ? RUMBLE : kind === 'duel' ? DUEL
      : PHASES.map((p) => ({ ...p, wait: Math.round(p.wait * rng.float(0.8, 1.25)), shrink: Math.round(p.shrink * rng.float(0.85, 1.2)) }));
    this.drift = null;
    this.phase = 0;
    this.radius = 1300;
    this.center.set(0, 0);
    this.fromRadius = this.radius;
    this.state = 'wait';
    this.timer = this.phases[0].wait;
    this._pickNext();
    if (kind === 'rumble' || kind === 'duel') {
      // Zona fija desde el principio (cerca del centro de la isla)
      const r = this.phases[0].radius;
      if (kind === 'duel') {
        // Arena en terreno firme, mejor si hay estructuras para cubrirse
        for (let i = 0; i < 60; i++) {
          const a = rng.float(0, Math.PI * 2), d = Math.sqrt(rng.next()) * 520;
          const x = Math.cos(a) * d, z = Math.sin(a) * d;
          this.center.set(x, z);
          if (this.landRatio(x, z, r) > 0.92) break;
        }
      } else this.center.set(rng.float(-150, 150), rng.float(-150, 150));
      this.radius = this.nextRadius = r;
      this.next.copy(this.center);
      this.state = 'done';
    }
    this.active = true;
    this._syncMesh();
  }

  // Fracción de tierra firme dentro de un círculo.
  landRatio(x, z, r) {
    let land = 0, n = 0;
    for (let k = 0; k < 3; k++) {
      const rr = r * (k + 1) / 3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        n++;
        if (this.world.isLand(x + Math.cos(a) * rr, z + Math.sin(a) * rr)) land++;
      }
    }
    return land / n;
  }

  _pickNext() {
    const rng = this.rng || random;
    const p = this.phases[this.phase];
    const target = p.radius;
    const curR = Math.min(this.radius, 640);
    const maxOff = Math.max(0, curR - target) * 0.8;
    // Zona móvil: primero se elige hacia dónde se desplaza el círculo
    let cx = this.center.x, cz = this.center.y;
    this.drift = null;
    if (p.move && curR > 1) {
      for (let i = 0; i < 30; i++) {
        const a = rng.float(0, Math.PI * 2), d = curR * rng.float(1.0, 1.8);
        const x = this.center.x + Math.cos(a) * d, z = this.center.y + Math.sin(a) * d;
        if ((this.world.isLand(x, z) && Math.hypot(x, z) < 600) || i === 29) {
          this.drift = { from: this.center.clone(), to: new THREE.Vector2(x, z) };
          cx = x;
          cz = z;
          break;
        }
      }
    }
    for (let i = 0; i < 40; i++) {
      const a = rng.float(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * maxOff;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (this.world.isLand(x, z) || i === 39) {
        this.next.set(x, z);
        break;
      }
    }
    this.nextRadius = target;
  }

  get dps() {
    return this.phases[Math.min(this.phase, this.phases.length - 1)].dps;
  }

  isOutside(x, z) {
    return Math.hypot(x - this.center.x, z - this.center.y) > this.radius;
  }

  distanceOutside(x, z) {
    return Math.hypot(x - this.center.x, z - this.center.y) - this.radius;
  }

  update(dt) {
    if (!this.active) return;
    this.tex.offset.x += dt * 0.01;
    this.tex.offset.y -= dt * 0.03;
    if (this.state === 'done') return;
    this.timer -= dt;
    if (this.state === 'wait') {
      if (this.drift) {
        const k = 1 - Math.max(0, this.timer) / this.phases[this.phase].wait;
        const e = k * k * (3 - 2 * k);
        this.center.lerpVectors(this.drift.from, this.drift.to, e);
      }
      if (this.timer <= 0) {
        this.state = 'shrink';
        this.timer = this.phases[this.phase].shrink;
        this.from.copy(this.center);
        this.fromRadius = this.radius;
      }
    } else if (this.state === 'shrink') {
      const p = this.phases[this.phase];
      const k = 1 - Math.max(0, this.timer) / p.shrink;
      this.center.lerpVectors(this.from, this.next, k);
      this.radius = this.fromRadius + (this.nextRadius - this.fromRadius) * k;
      if (this.timer <= 0) {
        this.phase++;
        if (this.phase >= this.phases.length) {
          this.state = 'done';
          this.phase = this.phases.length - 1;
        } else {
          this.state = 'wait';
          this.timer = this.phases[this.phase].wait;
          this._pickNext();
        }
      }
    }
    this._syncMesh();
  }

  // El muro se difumina cuando está lejos de la cámara (no tapa el horizonte).
  updateVisual(cam) {
    const d = Math.abs(Math.hypot(cam.x - this.center.x, cam.z - this.center.y) - this.radius);
    this.mesh.material.opacity = 0.42 * Math.max(0.1, Math.min(1, 1 - (d - 120) / 420));
  }

  _syncMesh() {
    const r = Math.max(this.radius, 0.5);
    this.mesh.position.set(this.center.x, 150, this.center.y);
    this.mesh.scale.set(r, 700, r);
    this.tex.repeat.x = Math.max(1, Math.round(r / 12));
  }
}
