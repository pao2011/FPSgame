import * as THREE from 'three';
import { getGlowTexture } from './models.js';

// Trazadoras, impactos, chispas, fogonazo y números de daño.
export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;

    // Trazadoras
    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xfff1b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tracerGeo, this.tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 1 });
    }
    this.tracerIdx = 0;

    // Agujeros de bala
    const decalGeo = new THREE.PlaneGeometry(0.12, 0.12);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x111111, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.decals = [];
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      this.scene.add(m);
      this.decals.push(m);
    }
    this.decalIdx = 0;

    // Chispas
    this.sparks = [];
    const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      m.visible = false;
      this.scene.add(m);
      this.sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
    this.sparkIdx = 0;

    // Fogonazo (luz + sprite)
    this.flashLight = new THREE.PointLight(0xffc870, 0, 12, 2);
    this.scene.add(this.flashLight);
    this.flashT = 0;
    this.flashSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(), color: 0xffd080, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true,
      }),
    );
    this.flashSprite.scale.setScalar(0.5);
    this.flashSprite.visible = false;
    this.game.viewScene.add(this.flashSprite);
    this.worldFlash = this.flashSprite.clone();
    this.worldFlash.material = this.flashSprite.material.clone();
    this.worldFlash.scale.setScalar(0.8);
    this.scene.add(this.worldFlash);

    // Números de daño (DOM)
    this.numLayer = document.getElementById('damage-numbers');
    this.numbers = [];
    this.v = new THREE.Vector3();
  }

  tracer(from, to, color = 0xfff1b0, width = 0.025, life = 0.07) {
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(width, width, len);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = life;
    t.max = life;
  }

  impact(point, normal, color = 0xffd27a) {
    const d = this.decals[this.decalIdx++ % this.decals.length];
    d.position.copy(point).addScaledVector(normal, 0.01);
    d.lookAt(this.v.copy(point).add(normal));
    d.visible = true;
    for (let i = 0; i < 5; i++) {
      const s = this.sparks[this.sparkIdx++ % this.sparks.length];
      s.mesh.position.copy(point);
      s.mesh.material.color.setHex(color);
      s.vel.copy(normal).multiplyScalar(2 + Math.random() * 3);
      s.vel.x += (Math.random() - 0.5) * 4;
      s.vel.y += Math.random() * 3;
      s.vel.z += (Math.random() - 0.5) * 4;
      s.life = 0.25 + Math.random() * 0.2;
      s.mesh.scale.setScalar(1);
      s.mesh.visible = true;
    }
  }

  // Trozos que salen despedidos al romper algo.
  debris(point, color) {
    for (let i = 0; i < 14; i++) {
      const s = this.sparks[this.sparkIdx++ % this.sparks.length];
      s.mesh.position.copy(point);
      s.mesh.position.x += (Math.random() - 0.5) * 1.5;
      s.mesh.position.y += (Math.random() - 0.5) * 1.5;
      s.mesh.position.z += (Math.random() - 0.5) * 1.5;
      s.mesh.material.color.setHex(color);
      s.mesh.scale.setScalar(3);
      s.vel.set((Math.random() - 0.5) * 6, Math.random() * 6 + 1, (Math.random() - 0.5) * 6);
      s.life = 0.5 + Math.random() * 0.4;
      s.mesh.visible = true;
    }
  }

  muzzleFlash(viewPos, worldPos) {
    this.flashT = 0.05;
    this.flashLight.position.copy(worldPos);
    this.flashLight.intensity = 30;
    if (viewPos) {
      this.flashSprite.position.copy(viewPos);
      this.flashSprite.visible = true;
      this.flashSprite.material.rotation = Math.random() * Math.PI;
    } else {
      this.worldFlash.position.copy(worldPos);
      this.worldFlash.visible = true;
    }
  }

  damageNumber(pos, amount, kind) {
    const el = document.createElement('div');
    el.className = 'dmg-num ' + kind;
    el.textContent = typeof amount === 'number' ? Math.round(amount) : amount;
    this.numLayer.appendChild(el);
    this.numbers.push({
      el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3, 0)), life: 1.0,
    });
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 15 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.life <= 0) s.mesh.visible = false;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flashLight.intensity = 0;
        this.flashSprite.visible = false;
        this.worldFlash.visible = false;
      }
    }
    const cam = this.game.camera;
    const w = innerWidth, h = innerHeight;
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      n.pos.y += dt * 0.8;
      if (n.life <= 0) {
        n.el.remove();
        this.numbers.splice(i, 1);
        continue;
      }
      this.v.copy(n.pos).project(cam);
      if (this.v.z > 1) {
        n.el.style.display = 'none';
        continue;
      }
      n.el.style.display = '';
      n.el.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * w}px, ${(-this.v.y * 0.5 + 0.5) * h}px) translate(-50%,-50%) scale(${0.8 + n.life * 0.4})`;
      n.el.style.opacity = Math.min(1, n.life * 2);
    }
  }

  clear() {
    for (const n of this.numbers) n.el.remove();
    this.numbers.length = 0;
    for (const d of this.decals) d.visible = false;
  }
}
