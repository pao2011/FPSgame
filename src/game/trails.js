import * as THREE from 'three';
import { TRAILS } from './cosmetics.js';
import { getGlowTexture } from './models.js';

// Estelas de la taquilla: partículas que dejan los personajes al caer en
// caída libre y al planear (chispas, corazones, humo, arco iris, fuego).
const RAINBOW = [0xff4040, 0xffa040, 0xffff40, 0x40ff60, 0x40a0ff, 0xa040ff];

function heartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.beginPath();
  x.moveTo(32, 54);
  x.bezierCurveTo(4, 36, 6, 10, 22, 10);
  x.bezierCurveTo(28, 10, 32, 15, 32, 19);
  x.bezierCurveTo(32, 15, 36, 10, 42, 10);
  x.bezierCurveTo(58, 10, 60, 36, 32, 54);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Trails {
  constructor(game) {
    this.game = game;
    this.pool = [];
    this.idx = 0;
    this.glow = getGlowTexture();
    this.heart = heartTexture();
    const n = game.quality === 'movil' || game.quality === 'baja' || game.liteCpu ? 90 : 220;
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.visible = false;
      game.scene.add(sp);
      this.pool.push({ sp, life: 0, max: 1, vel: new THREE.Vector3(), size: 1 });
    }
    this.acc = new Map();
    this.hue = 0;
  }

  emit(pos, def, speed) {
    const p = this.pool[this.idx++ % this.pool.length];
    const m = p.sp.material;
    const smoke = !!def.smoke;
    const heart = def.color === 0xff5a8a;
    m.map = heart ? this.heart : this.glow;
    m.blending = smoke || heart ? THREE.NormalBlending : THREE.AdditiveBlending;
    const col = def.rainbow ? RAINBOW[this.hue++ % RAINBOW.length] : def.color;
    m.color.setHex(col);
    if (!smoke && !heart && this.game.composer) m.color.multiplyScalar(1.8);
    p.sp.position.copy(pos);
    p.sp.position.x += (Math.random() - 0.5) * 0.5;
    p.sp.position.y += (Math.random() - 0.5) * 0.5;
    p.sp.position.z += (Math.random() - 0.5) * 0.5;
    p.vel.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5 + (def.color === 0xff7a1a ? 1.5 : 0), (Math.random() - 0.5) * 1.5);
    p.max = p.life = smoke ? 1.6 : 0.9 + Math.random() * 0.4;
    p.size = smoke ? 1.1 : heart ? 0.45 : 0.6;
    p.grow = smoke ? 2.5 : 0;
    p.sp.visible = true;
  }

  update(dt) {
    const g = this.game;
    const cam = g.camera.position;
    for (const c of g.chars) {
      const id = c.outfit?.trail;
      if (!id || !c.alive || (c.mode !== 'freefall' && c.mode !== 'glide') || !c.model.root.visible) continue;
      if (c.pos.distanceToSquared(cam) > 220 * 220) continue;
      const def = TRAILS[id];
      if (!def) continue;
      const rate = def.smoke ? 18 : 40;
      let a = (this.acc.get(c) || 0) + dt * rate;
      while (a >= 1) {
        a -= 1;
        this.emit(c.pos, def, c.vel);
      }
      this.acc.set(c, a);
    }
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = 1 - p.life / p.max;
      p.sp.position.addScaledVector(p.vel, dt);
      p.sp.scale.setScalar(p.size * (1 + p.grow * k) * (p.grow ? 1 : 1 - k * 0.6));
      p.sp.material.opacity = (1 - k) * (p.grow ? 0.55 : 1);
      if (p.life <= 0) p.sp.visible = false;
    }
  }
}
