// Sonidos sintetizados con WebAudio (sin archivos externos).
const SHOTS = {
  ar: { f: 1900, d: 0.2, g: 0.55, low: 110 },
  smg: { f: 2600, d: 0.12, g: 0.4, low: 150 },
  pistol: { f: 2300, d: 0.16, g: 0.45, low: 130 },
  shotgun: { f: 1000, d: 0.5, g: 0.9, low: 70 },
  sniper: { f: 1400, d: 0.9, g: 1.0, low: 55 },
  burst: { f: 2000, d: 0.16, g: 0.5, low: 120 },
  minigun: { f: 2800, d: 0.09, g: 0.32, low: 160 },
  tactical: { f: 1150, d: 0.4, g: 0.8, low: 80 },
  revolver: { f: 1600, d: 0.5, g: 0.85, low: 70 },
  dmr: { f: 1500, d: 0.55, g: 0.85, low: 65 },
  rocket: { f: 600, d: 0.7, g: 0.7, low: 50 },
  glauncher: { f: 500, d: 0.3, g: 0.6, low: 60 },
  plasma: { f: 3200, d: 0.25, g: 0.4, low: 300, zap: true },
  bow: { f: 900, d: 0.12, g: 0.3, low: 200, soft: true },
  heavy: { f: 1500, d: 0.3, g: 0.7, low: 85 },
  handcannon: { f: 1300, d: 0.55, g: 0.9, low: 60 },
};

class AudioSys {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(c.destination);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Viento (caída libre / planeador)
    const wind = c.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    // Zumbido de cofre cercano
    this.chestGain = c.createGain();
    this.chestGain.gain.value = 0;
    this.chestPan = c.createStereoPanner ? c.createStereoPanner() : null;
    const trem = c.createGain();
    trem.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(trem.gain);
    lfo.start();
    for (const f of [880, 1320, 1760]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(trem);
      o.start();
    }
    if (this.chestPan) trem.connect(this.chestGain).connect(this.chestPan).connect(this.master);
    else trem.connect(this.chestGain).connect(this.master);

    // Tormenta
    const storm = c.createBufferSource();
    storm.buffer = this.noise;
    storm.loop = true;
    const sf = c.createBiquadFilter();
    sf.type = 'lowpass';
    sf.frequency.value = 180;
    this.stormGain = c.createGain();
    this.stormGain.gain.value = 0;
    storm.connect(sf).connect(this.stormGain).connect(this.master);
    storm.start();
  }

  get t() {
    return this.ctx.currentTime;
  }

  _env(node, peak, attack, decay, t = this.t) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _tone(freq, dur, { type = 'sine', gain = 0.3, delay = 0, slide = 0 } = {}) {
    const c = this.ctx;
    const t = this.t + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    this._env(g, gain, 0.005, dur, t);
    o.connect(g).connect(this._out || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _burst(dur, { freq = 1000, type = 'lowpass', gain = 0.5, delay = 0, q = 0.7, endFreq } = {}) {
    const c = this.ctx;
    const t = this.t + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = c.createGain();
    this._env(g, gain, 0.003, dur, t);
    s.connect(f).connect(g).connect(this._out || this.master);
    s.start(t, Math.random() * Math.max(0, 1.9 - dur));
    s.stop(t + dur + 0.05);
  }

  // Audio posicional (HRTF): un panner por sonido, sin atenuar por distancia
  // (el volumen ya lo calcula quien llama); sólo da la dirección.
  _at(pos) {
    if (!pos || !this.ctx || this.spatial === false) return null;
    const c = this.ctx;
    const p = c.createPanner();
    // HRTF es caro (una convolución por sonido): en móvil, panorámica simple
    p.panningModel = this.lite ? 'equalpower' : 'HRTF';
    p.distanceModel = 'linear';
    p.rolloffFactor = 0;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    setTimeout(() => p.disconnect(), 2500);
    return p;
  }

  // Oyente = cámara (llamado cada fotograma).
  setListener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const e = cam.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (L.positionX) {
      // Asignación directa: no acumula eventos programados en el hilo de audio
      L.positionX.value = cam.position.x;
      L.positionY.value = cam.position.y;
      L.positionZ.value = cam.position.z;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = ux;
      L.upY.value = uy;
      L.upZ.value = uz;
    } else {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // Límite de sonidos que empiezan a la vez (sobre todo en móvil): con muchos
  // sonando, los flojos (lejanos) se descartan.
  _room(volume) {
    const now = this.ctx.currentTime;
    if (now - (this.winT || 0) > 0.15) {
      this.winT = now;
      this.winN = 0;
    }
    this.winN++;
    return volume > 0.5 || this.winN <= (this.lite ? 8 : 20);
  }

  shot(kind, volume = 1, pos = null) {
    if (!this.ctx || !this._room(volume)) return;
    this._out = this._at(pos);
    this._shot(kind, volume);
    this._out = null;
  }

  _shot(kind, volume = 1) {
    const s = SHOTS[kind] || SHOTS.ar;
    if (s.zap) {
      this._tone(s.f * 0.5, s.d, { type: 'sawtooth', gain: s.g * 0.5 * volume, slide: 0.15 });
      this._tone(s.low * 3, s.d * 0.6, { type: 'square', gain: s.g * 0.25 * volume, slide: 0.4 });
      return;
    }
    if (s.soft) {
      this._burst(s.d, { freq: s.f, type: 'bandpass', gain: s.g * volume, q: 2 });
      this._tone(s.low, 0.12, { type: 'triangle', gain: s.g * 0.6 * volume, slide: 0.6 });
      return;
    }
    this._burst(s.d, { freq: s.f * 2, endFreq: s.f * 0.25, gain: s.g * volume });
    this._tone(s.low * 2, 0.15, { gain: s.g * 0.7 * volume, slide: 0.25 });
  }

  // volume: 0..1 según la distancia. impulse: estallido sin metralla.
  explosion(volume = 1, impulse = false, pos = null) {
    if (!this.ctx || volume < 0.01) return;
    this._out = this._at(pos);
    this._explosion(volume, impulse);
    this._out = null;
  }

  _explosion(volume, impulse) {
    if (impulse) {
      this._burst(0.5, { freq: 2500, endFreq: 200, type: 'bandpass', gain: 0.6 * volume, q: 1.2 });
      this._tone(300, 0.4, { type: 'sine', gain: 0.35 * volume, slide: 0.2 });
      return;
    }
    this._burst(1.4, { freq: 1800, endFreq: 60, gain: 1.1 * volume });
    this._burst(0.25, { freq: 5000, type: 'highpass', gain: 0.25 * volume });
    this._tone(70, 0.9, { type: 'sine', gain: 0.8 * volume, slide: 0.4 });
  }

  throwSound(volume = 1) {
    if (!this.ctx || volume < 0.02) return;
    this._burst(0.18, { freq: 400, endFreq: 1400, type: 'bandpass', gain: 0.2 * volume, q: 1.5 });
  }

  bounce(volume = 1) {
    if (!this.ctx || volume < 0.03) return;
    this._tone(900 + Math.random() * 300, 0.05, { type: 'triangle', gain: 0.1 * volume });
  }

  stick(volume = 1) {
    if (!this.ctx || volume < 0.03) return;
    this._burst(0.06, { freq: 700, type: 'bandpass', gain: 0.25 * volume, q: 4 });
    this._tone(1600, 0.06, { type: 'square', gain: 0.05 * volume, delay: 0.05 });
  }

  smokePop(volume = 1) {
    if (!this.ctx || volume < 0.02) return;
    this._burst(1.2, { freq: 1200, endFreq: 300, type: 'bandpass', gain: 0.35 * volume, q: 0.8 });
  }

  molotov(volume = 1) {
    if (!this.ctx || volume < 0.02) return;
    this._burst(0.08, { freq: 4000, type: 'highpass', gain: 0.35 * volume });
    this._burst(0.9, { freq: 500, endFreq: 1500, gain: 0.45 * volume, delay: 0.05 });
  }

  detonator() {
    if (!this.ctx) return;
    this._tone(1800, 0.05, { type: 'square', gain: 0.08 });
    this._tone(2400, 0.05, { type: 'square', gain: 0.08, delay: 0.06 });
  }

  // Zumbido de la minigun mientras giran los cañones.
  spin(level) {
    if (!this.ctx) return;
    const now = this.t;
    if (this.lastSpin && now - this.lastSpin < 0.06) return;
    this.lastSpin = now;
    this._tone(120 + level * 260, 0.08, { type: 'sawtooth', gain: 0.04 });
  }

  pickaxe() {
    if (!this.ctx) return;
    this._burst(0.15, { freq: 600, type: 'bandpass', gain: 0.25, endFreq: 200 });
  }

  impact() {
    if (!this.ctx) return;
    this._burst(0.05, { freq: 3000, type: 'highpass', gain: 0.08 });
  }

  hit(head) {
    if (!this.ctx) return;
    this._tone(head ? 1800 : 1200, 0.08, { type: 'triangle', gain: 0.25 });
    if (head) this._tone(2600, 0.1, { type: 'sine', gain: 0.2, delay: 0.03 });
  }

  empty() {
    if (!this.ctx) return;
    this._tone(2400, 0.03, { type: 'square', gain: 0.08 });
  }

  reload() {
    if (!this.ctx) return;
    this._burst(0.04, { freq: 2500, type: 'bandpass', gain: 0.2, q: 3 });
    this._burst(0.05, { freq: 1800, type: 'bandpass', gain: 0.2, q: 3, delay: 0.25 });
  }

  pickup() {
    if (!this.ctx) return;
    this._tone(700, 0.08, { gain: 0.15, type: 'triangle' });
    this._tone(1050, 0.1, { gain: 0.15, type: 'triangle', delay: 0.06 });
  }

  chest() {
    if (!this.ctx) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this._tone(f, 0.35, { gain: 0.14, type: 'triangle', delay: i * 0.06 }),
    );
    this._burst(0.3, { freq: 4000, type: 'highpass', gain: 0.06 });
  }

  glider() {
    if (!this.ctx) return;
    this._burst(0.6, { freq: 300, endFreq: 1500, type: 'bandpass', gain: 0.35 });
  }

  busHorn() {
    if (!this.ctx) return;
    this._tone(330, 0.5, { type: 'sawtooth', gain: 0.08 });
    this._tone(415, 0.5, { type: 'sawtooth', gain: 0.08 });
  }

  build() {
    if (!this.ctx) return;
    this._burst(0.08, { freq: 900, type: 'bandpass', gain: 0.25, q: 2 });
    this._tone(260, 0.08, { type: 'square', gain: 0.05 });
  }

  breakPiece() {
    if (!this.ctx) return;
    this._burst(0.35, { freq: 700, endFreq: 150, gain: 0.35 });
  }

  harvest(mat) {
    if (!this.ctx) return;
    const f = mat === 'wood' ? 500 : mat === 'stone' ? 900 : 1600;
    this._burst(0.1, { freq: f, type: 'bandpass', gain: 0.3, q: 3 });
    this._tone(f * 0.5, 0.06, { type: 'triangle', gain: 0.1 });
  }

  engine(on, speed = 0) {
    if (!this.ctx) return;
    if (!this.engineOsc) {
      const c = this.ctx;
      this.engineOsc = c.createOscillator();
      this.engineOsc.type = 'sawtooth';
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400;
      this.engineGain = c.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(f).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    this.engineGain.gain.setTargetAtTime(on ? 0.06 : 0, this.t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(40 + Math.abs(speed) * 4, this.t, 0.1);
  }

  elim() {
    if (!this.ctx) return;
    this._tone(880, 0.12, { type: 'square', gain: 0.08 });
    this._tone(1320, 0.18, { type: 'square', gain: 0.08, delay: 0.1 });
  }

  victory() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.5, { type: 'triangle', gain: 0.15, delay: i * 0.15 }));
  }

  heal() {
    if (!this.ctx) return;
    this._tone(600, 0.25, { gain: 0.15, slide: 2 });
  }

  hurt() {
    if (!this.ctx) return;
    this._tone(180, 0.2, { type: 'sawtooth', gain: 0.12, slide: 0.5 });
  }

  // Pasos según el suelo: hierba, arena, madera, piedra o metal.
  step(mat = 'grass', volume = 1, pos = null) {
    if (!this.ctx || volume < 0.02 || !this._room(volume * 0.5)) return;
    this._out = this._at(pos);
    const v = volume;
    switch (mat) {
      case 'sand':
        this._burst(0.12, { freq: 1400, type: 'bandpass', gain: 0.1 * v, q: 0.8 });
        break;
      case 'wood':
        this._tone(170 + Math.random() * 30, 0.08, { type: 'triangle', gain: 0.12 * v, slide: 0.7 });
        this._burst(0.05, { freq: 900, gain: 0.07 * v });
        break;
      case 'stone':
        this._burst(0.04, { freq: 2600, type: 'highpass', gain: 0.08 * v });
        this._burst(0.06, { freq: 700, gain: 0.07 * v });
        break;
      case 'metal':
        this._tone(520 + Math.random() * 80, 0.12, { type: 'square', gain: 0.035 * v, slide: 0.9 });
        this._burst(0.05, { freq: 3000, type: 'bandpass', gain: 0.06 * v, q: 3 });
        break;
      default:
        this._burst(0.07, { freq: 450, gain: 0.08 * v });
    }
    this._out = null;
  }

  land() {
    if (!this.ctx) return;
    this._burst(0.2, { freq: 300, gain: 0.3 });
  }


  throwItem() {
    if (!this.ctx) return;
    this._burst(0.15, { freq: 1200, endFreq: 400, type: 'bandpass', gain: 0.2 });
  }

  launch() {
    if (!this.ctx) return;
    this._tone(200, 0.6, { type: 'triangle', gain: 0.2, slide: 4 });
    this._burst(0.5, { freq: 400, endFreq: 2400, type: 'bandpass', gain: 0.3 });
  }

  beep(high = false) {
    if (!this.ctx) return;
    this._tone(high ? 1320 : 880, high ? 0.35 : 0.12, { type: 'square', gain: 0.07 });
  }

  thanks() {
    if (!this.ctx) return;
    [660, 880, 990].forEach((f, i) => this._tone(f, 0.18, { type: 'triangle', gain: 0.12, delay: i * 0.08 }));
  }

  editTile() {
    if (!this.ctx) return;
    this._tone(1500, 0.04, { type: 'triangle', gain: 0.06 });
  }

  ping() {
    if (!this.ctx) return;
    this._tone(1200, 0.12, { type: 'sine', gain: 0.15 });
    this._tone(1800, 0.16, { type: 'sine', gain: 0.12, delay: 0.08 });
  }

  door() {
    if (!this.ctx) return;
    this._burst(0.25, { freq: 500, endFreq: 250, type: 'bandpass', gain: 0.25, q: 2 });
  }

  // Tirolesa: chasquido metálico al engancharse/soltarse y zumbido de la polea.
  zipClack() {
    if (!this.ctx) return;
    this._tone(1400, 0.06, { type: 'square', gain: 0.06, slide: 0.6 });
    this._burst(0.08, { freq: 3200, type: 'bandpass', gain: 0.18, q: 4 });
    this._tone(380, 0.12, { type: 'triangle', gain: 0.1, delay: 0.03 });
  }

  setZip(v) {
    if (!this.ctx) return;
    if (!this.zipGain) {
      const c = this.ctx;
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      this.zipFilter = c.createBiquadFilter();
      this.zipFilter.type = 'bandpass';
      this.zipFilter.Q.value = 6;
      this.zipFilter.frequency.value = 1800;
      this.zipOsc = c.createOscillator();
      this.zipOsc.type = 'sawtooth';
      this.zipOsc.frequency.value = 90;
      const og = c.createGain();
      og.gain.value = 0.25;
      this.zipGain = c.createGain();
      this.zipGain.gain.value = 0;
      s.connect(this.zipFilter).connect(this.zipGain);
      this.zipOsc.connect(og).connect(this.zipGain);
      this.zipGain.connect(this.master);
      s.start();
      this.zipOsc.start();
    }
    this.zipGain.gain.setTargetAtTime(v * 0.16, this.t, 0.08);
    this.zipFilter.frequency.setTargetAtTime(1200 + v * 2600, this.t, 0.1);
    this.zipOsc.frequency.setTargetAtTime(60 + v * 140, this.t, 0.1);
  }

  // Deslizarse por el suelo: roce de tierra que se apaga.
  slide(volume = 1) {
    if (!this.ctx) return;
    this._burst(0.55, { freq: 900, endFreq: 260, type: 'lowpass', gain: 0.32 * volume });
    this._burst(0.35, { freq: 2600, endFreq: 1200, type: 'bandpass', gain: 0.08 * volume, q: 1.5 });
  }

  // Bala que pasa rozando: chasquido supersónico + silbido, desde su lado.
  whiz(volume = 1, pos = null) {
    if (!this.ctx || !this._room(volume)) return;
    this._out = this._at(pos);
    this._burst(0.03, { freq: 5200, type: 'highpass', gain: 0.35 * volume });
    this._burst(0.16, { freq: 4200, endFreq: 900, type: 'bandpass', gain: 0.22 * volume, q: 2.5, delay: 0.01 });
    this._out = null;
  }

  // Impacto de bala según el material (tierra, madera, piedra, metal, agua).
  ricochet(mat = 'stone', volume = 1, pos = null) {
    if (!this.ctx || volume < 0.03 || !this._room(volume * 0.6)) return;
    this._out = this._at(pos);
    const v = volume;
    switch (mat) {
      case 'metal':
        this._tone(2400 + Math.random() * 1200, 0.18, { type: 'sine', gain: 0.06 * v, slide: 0.55 });
        this._burst(0.05, { freq: 4200, type: 'highpass', gain: 0.18 * v });
        break;
      case 'wood':
        this._burst(0.07, { freq: 700, type: 'bandpass', gain: 0.25 * v, q: 2 });
        break;
      case 'water':
        this._burst(0.22, { freq: 1400, endFreq: 500, type: 'bandpass', gain: 0.2 * v, q: 1 });
        break;
      case 'dirt':
        this._burst(0.09, { freq: 500, gain: 0.25 * v });
        break;
      default:
        this._burst(0.05, { freq: 2600, type: 'highpass', gain: 0.16 * v });
        if (Math.random() < 0.25) this._tone(3000 + Math.random() * 1500, 0.22, { type: 'sine', gain: 0.035 * v, slide: 0.5, delay: 0.02 });
    }
    this._out = null;
  }

  setWind(v) {
    if (!this.ctx) return;
    this.windGain.gain.setTargetAtTime(v * 0.5, this.t, 0.15);
    this.windFilter.frequency.setTargetAtTime(300 + v * 900, this.t, 0.2);
  }

  setChest(volume, pan) {
    if (!this.ctx) return;
    this.chestGain.gain.setTargetAtTime(volume * 0.05, this.t, 0.1);
    if (this.chestPan) this.chestPan.pan.setTargetAtTime(pan, this.t, 0.1);
  }

  setStorm(v) {
    if (!this.ctx) return;
    this.stormGain.gain.setTargetAtTime(v * 0.6, this.t, 0.3);
  }
}

export const audio = new AudioSys();
