import * as THREE from 'three';
import { random } from '../core/rng.js';

// Clima y ciclo de día durante la partida. La hora avanza con el tiempo de
// partida (de media mañana al anochecer) y cada partida tiene un clima:
// despejado, nublado, lluvia o niebla (misma semilla para todos en online).
const DAY = { top: new THREE.Color(0x2a74d8), horizon: new THREE.Color(0xcfe8ff), fog: new THREE.Color(0xcfe8ff) };
const DUSK = { top: new THREE.Color(0x3a4f9a), horizon: new THREE.Color(0xffb27a), fog: new THREE.Color(0xd9a07a) };
const NIGHT = { top: new THREE.Color(0x070d24), horizon: new THREE.Color(0x26345c), fog: new THREE.Color(0x1c2540) };
const GREY = { top: new THREE.Color(0x6f7d8f), horizon: new THREE.Color(0xb6c0ca), fog: new THREE.Color(0xa8b2bc) };

const KINDS = {
  despejado: { label: '', fog: 1, cloud: 0, rain: 0 },
  nublado: { label: '☁ Nublado', fog: 0.8, cloud: 0.6, rain: 0 },
  lluvia: { label: '🌧 Lluvia', fog: 0.55, cloud: 0.9, rain: 1 },
  niebla: { label: '🌫 Niebla', fog: 0.32, cloud: 0.5, rain: 0 },
};

const tmpC = new THREE.Color();
const tmpDir = new THREE.Vector3();

export class Weather {
  constructor(game) {
    this.game = game;
    this.kind = 'despejado';
    this.active = false;
    this.hour = 11;
    this.baseHemi = game.hemi.intensity;
    this.baseSun = game.sun.intensity;
    this.baseEnv = game.scene.environmentIntensity ?? 1;
    this.baseSunDir = game.sunDir.clone();
    // Lluvia: segmentos que caen en una caja alrededor de la cámara. La caída
    // se calcula en la GPU (shader de vértices): la CPU no toca las gotas.
    const low = game.quality === 'baja' || game.quality === 'movil';
    this.N = game.quality === 'movil' ? 700 : low ? 1200 : 3500;
    const drop = new Float32Array(this.N * 8);
    for (let i = 0; i < this.N; i++) {
      const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80;
      drop.set([x, y, z, 0, x, y, z, 1], i * 8);
    }
    const g = new THREE.BufferGeometry();
    const ib = new THREE.InterleavedBuffer(drop, 4);
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    g.setAttribute('aEnd', new THREE.InterleavedBufferAttribute(ib, 1, 3));
    this.rainUniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0xaac4e0) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.rainUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCam;
        attribute float aEnd;
        void main() {
          float y = mod(position.y + 6.0 - uTime * 28.0, 46.0) - 6.0;
          vec3 p = uCam + vec3(position.x, y - 20.0, position.z) + aEnd * vec3(0.08, 0.9, 0.04);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() {
          gl_FragColor = vec4(uColor, 0.45);
          #include <colorspace_fragment>
        }`,
    });
    this.rain = new THREE.LineSegments(g, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    game.scene.add(this.rain);
  }

  get label() {
    if (!this.active) return '';
    const k = KINDS[this.kind].label;
    const h = Math.floor(this.hour), m = Math.floor((this.hour % 1) * 60);
    return `${k ? k + ' · ' : ''}🕒 ${h}:${String(m).padStart(2, '0')}`;
  }

  // Al empezar la partida: clima según la semilla (y opción de desactivarlo).
  start(rng = random, mode = {}) {
    const s = this.game.settings;
    this.active = !mode.creative && s.weather !== false;
    if (!this.active) return this.reset();
    const r = rng.next();
    this.kind = r < 0.55 ? 'despejado' : r < 0.72 ? 'nublado' : r < 0.88 ? 'lluvia' : 'niebla';
    this.startHour = 9.5 + rng.next() * 2.5;
    this.hour = this.startHour;
    this.rain.visible = KINDS[this.kind].rain > 0;
  }

  // Vuelta al día despejado (menú, creativo).
  reset() {
    this.active = false;
    this.kind = 'despejado';
    this.rain.visible = false;
    this.apply(11, KINDS.despejado);
  }

  apply(hour, K) {
    const g = this.game;
    // Sol: sale por el este, se pone por el oeste hacia las 20:30
    const t = (hour - 6.5) / 14; // 0 = amanecer, 1 = anochecer
    const elev = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    const az = Math.PI * (0.15 + t * 0.7);
    const night = THREE.MathUtils.clamp((hour - 20) / 1.5, 0, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(hour - 19.5) / 1.8, 0, 1) * (1 - night);
    // Durante el día el sol se queda donde siempre (buena luz para jugar) y
    // por la tarde baja hacia el oeste; de noche, la luna vuelve arriba.
    const eve = THREE.MathUtils.clamp((hour - 15) / 4.5, 0, 1);
    tmpDir.set(Math.cos(az) * 0.8, Math.max(0.12, elev * 0.95), Math.sin(az) * 0.6).normalize();
    g.sunDir.copy(this.baseSunDir).lerp(tmpDir, eve * (1 - night)).normalize();
    const sky = g.sky.material.uniforms;
    sky.sunDir.value.copy(g.sunDir);
    const cloud = K.cloud;
    sky.top.value.copy(DAY.top).lerp(DUSK.top, dusk).lerp(NIGHT.top, night).lerp(GREY.top, cloud * (1 - night) * 0.8);
    sky.horizon.value.copy(DAY.horizon).lerp(DUSK.horizon, dusk).lerp(NIGHT.horizon, night).lerp(GREY.horizon, cloud * (1 - night) * 0.8);
    tmpC.copy(DAY.fog).lerp(DUSK.fog, dusk).lerp(NIGHT.fog, night).lerp(GREY.fog, cloud * (1 - night) * 0.85);
    g.scene.fog.color.copy(tmpC);
    const light = (1 - night * 0.8) * (1 - cloud * 0.45);
    g.sun.intensity = this.baseSun * light * (0.55 + 0.45 * Math.max(0.2, elev));
    g.sun.color.setHex(night > 0.5 ? 0x9fb4ff : dusk > 0.3 ? 0xffb27a : 0xffefd2);
    g.hemi.intensity = this.baseHemi * (1 - night * 0.55) * (1 - cloud * 0.2);
    if (g.scene.environment) g.scene.environmentIntensity = this.baseEnv * (1 - night * 0.7) * (1 - cloud * 0.3);
  }

  update(dt) {
    const g = this.game;
    if (!this.active) return;
    const K = KINDS[this.kind];
    if (g.phase !== 'lobby') this.hour = Math.min(22, this.startHour + (g.matchTime || 0) / 60 * 0.75);
    // La luz no cambia cada fotograma: basta unas veces por segundo
    this.acc = (this.acc || 0) + dt;
    if (this.acc > 0.25) {
      this.acc = 0;
      this.apply(this.hour, K);
    }
    // Niebla más cerrada con mal tiempo y de noche
    const night = THREE.MathUtils.clamp((this.hour - 20) / 1.5, 0, 1);
    this.fogMul = K.fog * (1 - night * 0.3);
    if (this.rain.visible) {
      // Sin lluvia dentro de cuevas y refugios
      const c = g.camera.position;
      this.rain.material.visible = !g.world.coveredAt?.(c.x, c.y, c.z);
      this.updateRain(dt);
    }
  }

  updateRain(dt) {
    const u = this.rainUniforms;
    u.uTime.value = (u.uTime.value + dt) % 23; // 23 s × 28 m/s = 14 ciclos de 46 m: sin saltos
    u.uCam.value.copy(this.game.camera.position);
  }
}
