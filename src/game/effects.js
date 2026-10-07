import * as THREE from 'three';
import { getGlowTexture } from './models.js';

// Texturas procedurales (canvas) compartidas por los efectos.
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Fogonazo: estrella de puntas irregulares con núcleo brillante.
function starTexture() {
  return canvasTex(128, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,240,200,0.95)');
    g.addColorStop(0.45, 'rgba(255,190,90,0.35)');
    g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    const spikes = 7;
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 ? c * 0.22 : c * (0.7 + ((i * 37) % 10) / 34);
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    const g2 = ctx.createRadialGradient(c, c, 0, c, c, c * 0.35);
    g2.addColorStop(0, 'rgba(255,255,255,1)');
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, s, s);
  });
}

// Humo/polvo: bola suave con grumos.
function smokeTexture() {
  return canvasTex(64, (ctx, s) => {
    const c = s / 2;
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = i ? c * 0.32 : 0;
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, c * 0.55);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  });
}

// Agujero de bala: centro negro, borde astillado y grietas.
function holeTexture() {
  return canvasTex(64, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.95);
    g.addColorStop(0, 'rgba(10,10,10,1)');
    g.addColorStop(0.22, 'rgba(15,14,12,1)');
    g.addColorStop(0.32, 'rgba(60,55,50,0.85)');
    g.addColorStop(0.6, 'rgba(40,36,32,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(20,18,16,0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.3;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 7, c + Math.sin(a) * 7);
      ctx.lineTo(c + Math.cos(a + 0.2) * 16, c + Math.sin(a + 0.2) * 16);
      ctx.lineTo(c + Math.cos(a - 0.1) * (22 + (i % 3) * 3), c + Math.sin(a - 0.1) * (22 + (i % 3) * 3));
      ctx.stroke();
    }
  });
}

const UP = new THREE.Vector3(0, 1, 0);

// Trazadoras, impactos, chispas, casquillos, humo, fogonazo y números de daño.
export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    const hdr = game.composer ? 3.2 : 1;
    this.hdr = hdr;

    // Trazadoras: estela afilada (cola fina, cabeza gruesa) + halo suave.
    // Viajan desde el cañón al impacto en lugar de aparecer de golpe.
    this.tracers = [];
    const streak = new THREE.CylinderGeometry(1, 0.15, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    for (let i = 0; i < 96; i++) {
      const core = new THREE.Mesh(streak, new THREE.MeshBasicMaterial({
        color: 0xfff1b0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const halo = new THREE.Mesh(streak, new THREE.MeshBasicMaterial({
        color: 0xffc870, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      for (const m of [core, halo]) {
        m.visible = false;
        m.frustumCulled = false;
        this.scene.add(m);
      }
      this.tracers.push({ core, halo, life: 0, max: 1, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, head: 0, speed: 0, width: 0, beam: false });
    }
    this.tracerIdx = 0;

    // Agujeros de bala con textura
    const decalGeo = new THREE.PlaneGeometry(0.16, 0.16);
    const decalMat = new THREE.MeshBasicMaterial({
      map: holeTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.decals = [];
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      this.decals.push(m);
    }
    this.decalIdx = 0;

    // Chispas: estelas alargadas que se orientan según su velocidad.
    this.sparks = [];
    const sparkGeo = new THREE.BoxGeometry(0.018, 0.018, 0.14);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      this.sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
    this.sparkIdx = 0;

    // Escombros (iluminados y girando)
    this.chunks = [];
    const chunkGeo = new THREE.BoxGeometry(0.15, 0.1, 0.13);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(chunkGeo, new THREE.MeshLambertMaterial({ color: 0x888888 }));
      m.visible = false;
      m.castShadow = false;
      this.scene.add(m);
      this.chunks.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    this.chunkIdx = 0;

    // Casquillos de latón (y cartuchos rojos de escopeta)
    this.shells = [];
    const shellGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8).rotateZ(Math.PI / 2);
    const shotGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.07, 8).rotateZ(Math.PI / 2);
    const pbr = game.quality !== 'baja' && game.quality !== 'movil';
    const brass = pbr ? new THREE.MeshStandardMaterial({ color: 0xd9a440, metalness: 0.85, roughness: 0.3 }) : new THREE.MeshLambertMaterial({ color: 0xd9a440 });
    const red = pbr ? new THREE.MeshStandardMaterial({ color: 0xc0302a, metalness: 0.1, roughness: 0.5 }) : new THREE.MeshLambertMaterial({ color: 0xc0302a });
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(shellGeo, brass);
      m.visible = false;
      this.scene.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, bounces: 0 });
    }
    this.shellGeo = shellGeo;
    this.shotGeo = shotGeo;
    this.brass = brass;
    this.red = red;
    this.shellIdx = 0;

    // Humo y polvo
    this.puffs = [];
    const smoke = smokeTexture();
    for (let i = 0; i < 50; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, transparent: true, depthWrite: false, color: 0xcccccc }));
      s.visible = false;
      this.scene.add(s);
      this.puffs.push({ sprite: s, vel: new THREE.Vector3(), life: 0, max: 1, size: 1, grow: 1, alpha: 1 });
    }
    this.puffIdx = 0;

    // Fogonazo (luz + estrella)
    this.flashLight = new THREE.PointLight(0xffc870, 0, 12, 2);
    // Luz virtual: la escena tiene un número fijo de luces (ver lightpool.js)
    game.lights.add(this.flashLight, 2);
    this.flashT = 0;
    const star = starTexture();
    this.flashSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: star, color: 0xffd090, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    if (game.composer) this.flashSprite.material.color.multiplyScalar(2.2);
    this.flashSprite.scale.setScalar(0.5);
    this.flashSprite.visible = false;
    this.game.viewScene.add(this.flashSprite);
    this.worldFlash = this.flashSprite.clone();
    this.worldFlash.material = this.flashSprite.material.clone();
    this.worldFlash.scale.setScalar(0.9);
    this.scene.add(this.worldFlash);
    this.glowTex = getGlowTexture();

    // Números de daño (DOM)
    this.numLayer = document.getElementById('damage-numbers');
    this.numbers = [];
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.q = new THREE.Quaternion();
  }

  tracer(from, to, color = 0xfff1b0, width = 0.025, life = 0.07) {
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    t.from.copy(from);
    t.dir.copy(to).sub(from).divideScalar(len);
    t.len = len;
    t.beam = width >= 0.04; // rayos (plasma, arco): línea completa que se desvanece
    t.width = width;
    t.head = t.beam ? len : Math.min(len, 2.5);
    t.speed = 560;
    t.life = t.beam ? life : len / t.speed + 0.06;
    t.max = t.life;
    t.core.material.color.setHex(color).multiplyScalar(this.hdr);
    t.halo.material.color.setHex(color).multiplyScalar(this.hdr * 0.6);
    t.core.visible = t.halo.visible = true;
    this.placeTracer(t);
  }

  placeTracer(t) {
    const streakLen = t.beam ? t.len : Math.min(9, t.len * 0.6);
    const head = Math.min(t.head, t.len);
    const tail = Math.max(0, head - streakLen);
    const L = head - tail;
    if (L < 0.05) {
      t.core.visible = t.halo.visible = false;
      return;
    }
    const k = t.beam ? Math.max(0, t.life / t.max) : 1;
    // De lejos la trazadora no se queda en menos de ~1 píxel: se ensancha
    // con la distancia a la cámara (si no, las balas lejanas no se ven)
    const cam = this.game.camera.position;
    this.v2.copy(t.from).addScaledVector(t.dir, (head + tail) * 0.5);
    const far = Math.max(1, this.v2.distanceTo(cam) * 0.0016 / Math.max(t.width, 0.01));
    for (const [m, w] of [[t.core, t.width * 0.8 * far], [t.halo, t.width * 3.2 * Math.sqrt(far)]]) {
      m.position.copy(t.from).addScaledVector(t.dir, tail);
      m.lookAt(this.v.copy(t.from).addScaledVector(t.dir, head));
      m.scale.set(w, w, L);
    }
    t.core.material.opacity = k;
    t.halo.material.opacity = 0.28 * k;
  }

  puff(pos, color, size = 0.5, life = 0.8, vel = null, alpha = 0.6) {
    const p = this.puffs[this.puffIdx++ % this.puffs.length];
    p.sprite.position.copy(pos);
    p.sprite.material.color.setHex(color);
    p.sprite.material.rotation = Math.random() * Math.PI * 2;
    p.sprite.visible = true;
    p.vel.set((Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4);
    if (vel) p.vel.add(vel);
    p.life = p.max = life;
    p.size = size;
    p.grow = size * 1.8;
    p.alpha = alpha;
    p.sprite.scale.setScalar(size);
    p.sprite.material.opacity = alpha;
  }

  impact(point, normal, color = 0xffd27a, mat = 'stone') {
    if (mat !== 'water') {
      const d = this.decals[this.decalIdx++ % this.decals.length];
      d.position.copy(point).addScaledVector(normal, 0.01);
      d.lookAt(this.v.copy(point).add(normal));
      d.rotateZ(Math.random() * Math.PI * 2);
      d.scale.setScalar((0.75 + Math.random() * 0.6) * (mat === 'dirt' ? 1.4 : 1));
      d.updateMatrix();
      d.visible = true;
    } else {
      this.splash(point, 0.6);
      return;
    }
    // Chispas: muchas y brillantes en metal, pocas en piedra, ninguna en tierra/madera
    const nSpark = mat === 'metal' ? 10 : mat === 'stone' ? 5 : 0;
    for (let i = 0; i < nSpark; i++) {
      const s = this.sparks[this.sparkIdx++ % this.sparks.length];
      s.mesh.position.copy(point);
      s.mesh.material.color.setHex(mat === 'metal' ? 0xffe6a8 : 0xffd27a).multiplyScalar(this.hdr * (mat === 'metal' ? 1.1 : 0.7));
      s.vel.copy(normal).multiplyScalar(3 + Math.random() * (mat === 'metal' ? 7 : 4));
      s.vel.x += (Math.random() - 0.5) * 5;
      s.vel.y += Math.random() * 3;
      s.vel.z += (Math.random() - 0.5) * 5;
      s.life = 0.15 + Math.random() * (mat === 'metal' ? 0.35 : 0.2);
      s.mesh.visible = true;
    }
    // Trocitos del material y nube de polvo de su color
    const nChunk = mat === 'wood' ? 5 : mat === 'dirt' ? 4 : 3;
    for (let i = 0; i < nChunk; i++) this.chunk(point, color, mat === 'wood' ? 0.45 : 0.35, normal, mat === 'dirt' ? 4 : 3);
    this.v2.copy(normal).multiplyScalar(mat === 'dirt' ? 1.6 : 0.8);
    if (mat === 'dirt') this.v2.y += 0.8;
    this.puff(this.v.copy(point).addScaledVector(normal, 0.15), color, mat === 'dirt' ? 0.55 : 0.35, mat === 'dirt' ? 1.0 : 0.7, this.v2, mat === 'metal' ? 0.3 : 0.6);
  }

  // Material de lo que ha golpeado una bala (para el efecto y el sonido).
  materialOf(hit) {
    if (hit.kind === 'terrain') {
      const w = this.game.world.waterLevelAt?.(hit.point.x, hit.point.z) ?? 0;
      if (hit.point.y < w - 0.05) return 'water';
      return hit.normal && hit.normal.y < 0.72 ? 'stone' : 'dirt';
    }
    const data = hit.box?.data;
    if (!data) return 'stone';
    if (data.type === 'build') return data.piece?.mat === 'wood' ? 'wood' : data.piece?.mat === 'metal' ? 'metal' : 'stone';
    if (data.type === 'car' || data.type === 'wreck') return 'metal';
    if (data.ref?.mat) return data.ref.mat === 'wood' ? 'wood' : data.ref.mat === 'metal' ? 'metal' : 'stone';
    if (data.type === 'chest' || data.type === 'bridge') return 'wood';
    return 'stone';
  }

  // Impacto de una bala en el mundo con el efecto de su material, y
  // salpicadura si antes cruza la superficie del agua.
  bulletImpact(origin, hit) {
    const mat = this.materialOf(hit);
    const color = mat === 'dirt' ? 0x8a7350 : mat === 'wood' ? 0xa07a48 : mat === 'metal' ? 0xb8c0c8 : mat === 'water' ? 0xffffff : 0xb0aca4;
    if (mat === 'water') {
      // Punto donde la trayectoria corta el agua
      const w = this.game.world.waterLevelAt?.(hit.point.x, hit.point.z) ?? 0;
      const dy = hit.point.y - origin.y;
      const k = Math.abs(dy) > 1e-3 ? Math.min(1, Math.max(0, (w - origin.y) / dy)) : 1;
      this.v.copy(origin).lerp(hit.point, k);
      this.v.y = w;
      this.splash(this.v, 0.6);
      const dc = this.v.distanceTo(this.game.camera.position);
      if (dc < 45) this.game.audio.ricochet?.('water', Math.pow(1 - dc / 45, 1.5), this.v);
      return;
    }
    this.impact(hit.point, hit.normal, color, mat);
    // Sonido del impacto (cerca de la cámara)
    const dc = hit.point.distanceTo(this.game.camera.position);
    if (dc < 45) this.game.audio.ricochet?.(mat, Math.pow(1 - dc / 45, 1.5), hit.point);
  }

  // Salpicadura de agua (balas, caídas).
  splash(point, size = 1) {
    for (let i = 0; i < 4; i++) {
      this.v2.set((Math.random() - 0.5) * 1.2, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2).multiplyScalar(size);
      this.puff(this.v.copy(point).add(this.v2.clone().multiplyScalar(0.05)), 0xe8f4ff, 0.25 * size + Math.random() * 0.2, 0.7, this.v2, 0.7);
    }
    for (let i = 0; i < 4; i++) this.chunk(point, 0xcfe8ff, 0.25 * size, UP, 4);
  }

  // Acierto en un personaje: destello azul (escudo) o blanco (salud).
  hitSpark(point, shield = false, head = false) {
    const col = shield ? 0x6fd0ff : head ? 0xffe36b : 0xffffff;
    for (let i = 0; i < (head ? 9 : 6); i++) {
      const s = this.sparks[this.sparkIdx++ % this.sparks.length];
      s.mesh.position.copy(point);
      s.mesh.material.color.setHex(col).multiplyScalar(this.hdr);
      s.vel.set((Math.random() - 0.5) * 7, Math.random() * 4, (Math.random() - 0.5) * 7);
      s.life = 0.12 + Math.random() * 0.16;
      s.mesh.visible = true;
    }
    this.puff(point, shield ? 0x9fe0ff : 0xf0f0f0, 0.3, 0.35, null, 0.45);
  }

  // Polvo levantado al deslizarse (dir: hacia dónde va).
  dust(pos, dir, n = 1) {
    if (!this.game.world) return;
    const mat = this.game.groundMaterial?.(this.game.player) || 'grass';
    const col = mat === 'sand' ? 0xd8c89a : mat === 'grass' ? 0x9a8a62 : mat === 'wood' ? 0xa08060 : 0xa8a49c;
    for (let i = 0; i < n; i++) {
      this.v2.set(-dir.x * 1.5 + (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.8, -dir.z * 1.5 + (Math.random() - 0.5) * 1.2);
      this.v.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 0.12, pos.z + (Math.random() - 0.5) * 0.5);
      this.puff(this.v, col, 0.35 + Math.random() * 0.25, 0.8, this.v2, 0.45);
    }
  }

  // Bala enemiga que pasa cerca de la cámara: silbido y un leve temblor.
  // from→to es el recorrido de la bala.
  nearMiss(from, to, shooter) {
    const g = this.game;
    const p = g.player;
    if (!p.alive || shooter === p || (shooter && shooter.team === p.team && shooter !== p)) return;
    const cam = g.camera.position;
    const abx = to.x - from.x, aby = to.y - from.y, abz = to.z - from.z;
    const l2 = abx * abx + aby * aby + abz * abz;
    if (l2 < 1) return;
    let t = ((cam.x - from.x) * abx + (cam.y - from.y) * aby + (cam.z - from.z) * abz) / l2;
    if (t <= 0.02 || t >= 1) return; // la bala no llega hasta aquí (o impacta antes)
    const x = from.x + abx * t, y = from.y + aby * t, z = from.z + abz * t;
    const d = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
    if (d > 3.2) return;
    const now = g.time;
    if (now - (this.lastWhiz || 0) < 0.07) return;
    this.lastWhiz = now;
    g.audio.whiz?.(Math.min(1, 1.25 - d / 3.2), this.v.set(x, y, z));
    if (g.explosives) g.explosives.shake = Math.max(g.explosives.shake, 0.45 * (1 - d / 3.2));
  }

  chunk(point, color, scale, dir, speed) {
    const c = this.chunks[this.chunkIdx++ % this.chunks.length];
    c.mesh.position.copy(point);
    c.mesh.material.color.setHex(color);
    c.mesh.scale.setScalar(scale * (0.6 + Math.random() * 0.8));
    c.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    if (dir) c.vel.copy(dir).multiplyScalar(speed * (0.5 + Math.random()));
    else c.vel.set(0, 0, 0);
    c.vel.x += (Math.random() - 0.5) * speed;
    c.vel.y += Math.random() * speed;
    c.vel.z += (Math.random() - 0.5) * speed;
    c.spin.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
    c.life = 0.5 + Math.random() * 0.5;
    c.mesh.visible = true;
  }

  // Trozos que salen despedidos al romper algo.
  debris(point, color) {
    for (let i = 0; i < 14; i++) {
      this.v.set(point.x + (Math.random() - 0.5) * 1.5, point.y + (Math.random() - 0.5) * 1.5, point.z + (Math.random() - 0.5) * 1.5);
      this.chunk(this.v, color, 1.6, null, 6);
    }
    this.puff(point, color, 1.4, 1.1, null, 0.5);
  }

  // Casquillo expulsado hacia la derecha del arma.
  shell(pos, yaw, shotgun = false) {
    const s = this.shells[this.shellIdx++ % this.shells.length];
    s.mesh.geometry = shotgun ? this.shotGeo : this.shellGeo;
    s.mesh.material = shotgun ? this.red : this.brass;
    s.mesh.position.copy(pos);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    s.vel.set(rx * (1.8 + Math.random()), 2 + Math.random() * 1.2, rz * (1.8 + Math.random()));
    s.vel.x += Math.sin(yaw) * 0.6;
    s.vel.z += Math.cos(yaw) * 0.6;
    s.spin.set(Math.random() * 20, Math.random() * 30, Math.random() * 10);
    s.mesh.rotation.set(0, yaw, 0);
    s.life = 2.2;
    s.bounces = 0;
    s.mesh.visible = true;
  }

  muzzleFlash(viewPos, worldPos) {
    this.flashT = 0.05;
    this.flashLight.position.copy(worldPos);
    this.flashLight.intensity = 30;
    this.flashLight.distance = 12;
    const sc = 0.75 + Math.random() * 0.5;
    if (viewPos) {
      this.flashSprite.position.copy(viewPos);
      this.flashSprite.visible = true;
      this.flashSprite.scale.setScalar(0.42 * sc);
      this.flashSprite.material.rotation = Math.random() * Math.PI;
    } else {
      this.worldFlash.position.copy(worldPos);
      this.worldFlash.visible = true;
      this.worldFlash.scale.setScalar(0.85 * sc);
      this.worldFlash.material.rotation = Math.random() * Math.PI;
    }
    if (worldPos.distanceToSquared(this.game.camera.position) < 60 * 60) this.puff(worldPos, 0xd8d8d8, 0.25, 0.6, null, 0.28);
  }

  // Explosión: bola de fuego (sprite), destello, humo y escombros.
  explosion(pos, radius = 5, impulse = false) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex, color: impulse ? 0x7fe0ff : 0xffa040, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true,
      }),
    );
    if (this.game.composer) sprite.material.color.multiplyScalar(2);
    sprite.position.copy(pos);
    sprite.scale.setScalar(radius * 0.6);
    this.scene.add(sprite);
    this.booms = this.booms || [];
    this.booms.push({ sprite, life: 0.55, max: 0.55, size: radius * (impulse ? 2.4 : 2.0) });
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = impulse ? 40 : 120;
    this.flashLight.distance = radius * 6;
    this.flashT = 0.15;
    if (!impulse) {
      this.debris(pos, 0x3a3530);
      this.debris(pos, 0xff8a30);
      for (let i = 0; i < 6; i++) {
        this.v.set(pos.x + (Math.random() - 0.5) * radius * 0.6, pos.y + Math.random() * radius * 0.3, pos.z + (Math.random() - 0.5) * radius * 0.6);
        this.v2.set(0, 1.2, 0);
        this.puff(this.v, i % 2 ? 0x555048 : 0x3a3631, radius * 0.4, 2.2, this.v2, 0.7);
      }
    } else {
      this.puff(pos, 0xbfefff, radius * 0.5, 0.8, null, 0.4);
    }
  }

  damageNumber(pos, amount, kind) {
    if (this.game.settings && this.game.settings.damageNumbers === false && kind !== 'mat') return;
    const el = document.createElement('div');
    el.className = 'dmg-num ' + kind;
    el.textContent = typeof amount === 'number' ? Math.round(amount) : amount;
    this.numLayer.appendChild(el);
    this.numbers.push({
      el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3, 0)), life: 1.0,
    });
  }

  update(dt) {
    if (this.booms?.length) {
      for (let i = this.booms.length - 1; i >= 0; i--) {
        const b = this.booms[i];
        b.life -= dt;
        const k = 1 - b.life / b.max;
        b.sprite.scale.setScalar(b.size * (0.3 + 0.7 * Math.sqrt(k)));
        b.sprite.material.opacity = Math.max(0, 1 - k);
        if (b.life <= 0) {
          this.scene.remove(b.sprite);
          b.sprite.material.dispose();
          this.booms.splice(i, 1);
        }
      }
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.core.visible = t.halo.visible = false;
        continue;
      }
      if (!t.beam) t.head += t.speed * dt;
      // Cuando la cabeza llega al final, la cola sigue avanzando hasta el impacto
      if (!t.beam && t.head >= t.len) {
        const streakLen = Math.min(9, t.len * 0.6);
        if (t.head - streakLen >= t.len) {
          t.life = 0;
          t.core.visible = t.halo.visible = false;
          continue;
        }
      }
      this.placeTracer(t);
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.lookAt(this.v.copy(s.mesh.position).add(s.vel));
      s.mesh.material.opacity = Math.min(1, s.life * 6);
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const c of this.chunks) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vel.y -= 16 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.life < 0.2) c.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 8));
      if (c.life <= 0) c.mesh.visible = false;
    }
    const world = this.game.world;
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const m = s.mesh;
      if (s.bounces < 3) {
        s.vel.y -= 14 * dt;
        m.position.addScaledVector(s.vel, dt);
        m.rotation.x += s.spin.x * dt;
        m.rotation.y += s.spin.y * dt;
        const gy = (world.groundBelow ? world.groundBelow(m.position.x, m.position.z, m.position.y + 0.3) : world.terrain.heightAt(m.position.x, m.position.z)) + 0.012;
        if (m.position.y < gy && s.vel.y < 0) {
          m.position.y = gy;
          s.vel.y *= -0.35;
          s.vel.x *= 0.5;
          s.vel.z *= 0.5;
          s.spin.multiplyScalar(0.5);
          if (++s.bounces >= 3) m.rotation.x = 0;
        }
      }
      if (s.life < 0.3) m.scale.setScalar(Math.max(0.01, s.life / 0.3));
      else m.scale.setScalar(1);
      if (s.life <= 0) m.visible = false;
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = 1 - p.life / p.max;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      p.sprite.scale.setScalar(p.size + p.grow * Math.sqrt(k));
      p.sprite.material.opacity = p.alpha * (1 - k) * Math.min(1, k * 8 + 0.3);
      if (p.life <= 0) p.sprite.visible = false;
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
    for (const s of this.shells) {
      s.life = 0;
      s.mesh.visible = false;
    }
  }
}
