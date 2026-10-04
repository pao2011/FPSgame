// Sonidos sintetizados con WebAudio (sin archivos externos).
const SHOTS = {
  ar: { f: 1900, d: 0.2, g: 0.55, low: 110 },
  smg: { f: 2600, d: 0.12, g: 0.4, low: 150 },
  pistol: { f: 2300, d: 0.16, g: 0.45, low: 130 },
  shotgun: { f: 1000, d: 0.5, g: 0.9, low: 70 },
  sniper: { f: 1400, d: 0.9, g: 1.0, low: 55 },
};

export class AudioSys {
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
    o.connect(g).connect(this.master);
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
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  shot(kind, volume = 1) {
    if (!this.ctx) return;
    const s = SHOTS[kind] || SHOTS.ar;
    this._burst(s.d, { freq: s.f * 2, endFreq: s.f * 0.25, gain: s.g * volume });
    this._tone(s.low * 2, 0.15, { gain: s.g * 0.7 * volume, slide: 0.25 });
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

  heal() {
    if (!this.ctx) return;
    this._tone(600, 0.25, { gain: 0.15, slide: 2 });
  }

  hurt() {
    if (!this.ctx) return;
    this._tone(180, 0.2, { type: 'sawtooth', gain: 0.12, slide: 0.5 });
  }

  step() {
    if (!this.ctx) return;
    this._burst(0.06, { freq: 400, gain: 0.08 });
  }

  land() {
    if (!this.ctx) return;
    this._burst(0.2, { freq: 300, gain: 0.3 });
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
