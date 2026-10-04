import * as THREE from 'three';
import { random } from '../core/rng.js';

const PHASES = [
  { wait: 90, shrink: 70, radius: 520, dps: 1 },
  { wait: 70, shrink: 60, radius: 320, dps: 1 },
  { wait: 60, shrink: 50, radius: 190, dps: 2 },
  { wait: 50, shrink: 40, radius: 100, dps: 5 },
  { wait: 40, shrink: 35, radius: 48, dps: 8 },
  { wait: 30, shrink: 30, radius: 18, dps: 10 },
  { wait: 20, shrink: 25, radius: 0, dps: 10 },
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

  reset(kind = 'br') {
    this.phases = kind === 'rumble' ? RUMBLE : PHASES;
    this.phase = 0;
    this.radius = 1300;
    this.center.set(0, 0);
    this.fromRadius = this.radius;
    this.state = 'wait';
    this.timer = this.phases[0].wait;
    this._pickNext();
    if (kind === 'rumble') {
      // Zona fija desde el principio (cerca del centro de la isla)
      this.center.set(random.float(-150, 150), random.float(-150, 150));
      this.radius = this.nextRadius = 450;
      this.next.copy(this.center);
      this.state = 'done';
    }
    this.active = true;
    this._syncMesh();
  }

  _pickNext() {
    const p = this.phases[this.phase];
    const target = p.radius;
    const curR = Math.min(this.radius, 640);
    const maxOff = Math.max(0, curR - target) * 0.8;
    for (let i = 0; i < 40; i++) {
      const a = random.float(0, Math.PI * 2);
      const r = Math.sqrt(random.next()) * maxOff;
      const x = this.center.x + Math.cos(a) * r, z = this.center.y + Math.sin(a) * r;
      if (this.world.terrain.heightAt(x, z) > 1.5 || i === 39) {
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

  _syncMesh() {
    const r = Math.max(this.radius, 0.5);
    this.mesh.position.set(this.center.x, 150, this.center.y);
    this.mesh.scale.set(r, 700, r);
    this.tex.repeat.x = Math.max(1, Math.round(r / 12));
  }
}
