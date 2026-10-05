// Música dinámica sintetizada (WebAudio, sin archivos): cambia según el
// momento de la partida.
//  · menú: acordes suaves
//  · isla de inicio / autobús: arpegio animado
//  · combate (disparos o daño recientes): bajo y batería
//  · final (pocos jugadores o tormenta pequeña): más tensión y tempo
const CHORDS = [
  [57, 60, 64], // La menor
  [53, 57, 60], // Fa
  [48, 52, 55], // Do
  [55, 59, 62], // Sol
];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.state = 'off';
    this.beat = 0;
    this.next = 0;
    this.gain = null;
    this.level = { pad: 0, arp: 0, drums: 0, bass: 0 };
    this.target = { pad: 0, arp: 0, drums: 0, bass: 0 };
    this.volume = 0.4;
  }

  ensure() {
    const a = this.audio;
    if (!a.ctx || this.gain) return !!this.gain;
    this.gain = a.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(a.ctx.destination);
    return true;
  }

  setVolume(v) {
    this.volume = v;
  }

  // Elige el estado musical según la partida.
  pick(g) {
    if (g.state === 'menu') return 'menu';
    if (g.state === 'replay') return 'menu';
    if (g.state !== 'playing') return 'end';
    const p = g.player;
    const now = g.time;
    if (g.phase === 'lobby' || p.mode === 'bus') return 'bus';
    const fight = now - (g.lastCombat || -99) < 7;
    const late = !g.mode.respawn && !g.mode.noBots && (g.aliveCount <= 5 || (g.storm.active && g.storm.radius < 60));
    if (late) return 'final';
    if (fight) return 'combat';
    if (p.mode === 'freefall' || p.mode === 'glide') return 'bus';
    return 'explore';
  }

  update(g) {
    const a = this.audio;
    if (!a.ctx || !this.ensure()) return;
    const st = this.pick(g);
    this.state = st;
    const T = {
      menu: { pad: 1, arp: 0.3, drums: 0, bass: 0, bpm: 84 },
      bus: { pad: 0.6, arp: 1, drums: 0.4, bass: 0.5, bpm: 112 },
      explore: { pad: 0.5, arp: 0.25, drums: 0, bass: 0.3, bpm: 92 },
      combat: { pad: 0.4, arp: 0.5, drums: 1, bass: 1, bpm: 124 },
      final: { pad: 0.6, arp: 0.8, drums: 1, bass: 1, bpm: 134 },
      end: { pad: 0.8, arp: 0, drums: 0, bass: 0, bpm: 80 },
    }[st];
    this.target = T;
    for (const k of ['pad', 'arp', 'drums', 'bass']) this.level[k] += (T[k] - this.level[k]) * 0.02;
    const t = a.ctx.currentTime;
    this.gain.gain.setTargetAtTime(this.volume * 0.35, t, 0.5);
    if (this.volume <= 0) return;
    // Programación con antelación (pasos de corchea)
    const spb = 60 / T.bpm / 2;
    if (this.next < t) this.next = t + 0.05;
    while (this.next < t + 0.25) {
      this.play(this.beat, this.next, spb);
      this.beat++;
      this.next += spb;
    }
  }

  note(freq, t, dur, type, gain) {
    const c = this.audio.ctx;
    if (gain < 0.003) return;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.gain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(t, dur, freq, gain, type = 'highpass') {
    const a = this.audio;
    const c = a.ctx;
    if (gain < 0.003) return;
    const s = c.createBufferSource();
    s.buffer = a.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.gain);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  play(beat, t, spb) {
    const L = this.level;
    const bar = Math.floor(beat / 8);
    const chord = CHORDS[bar % 4];
    const step = beat % 8;
    // Pad: acorde largo al principio de cada compás
    if (step === 0) for (const n of chord) this.note(midi(n), t, spb * 8, 'triangle', 0.05 * L.pad);
    // Arpegio
    if (L.arp > 0.02) this.note(midi(chord[step % 3] + 12 + (step >= 6 ? 12 : 0)), t, spb * 0.9, 'square', 0.025 * L.arp);
    // Bajo
    if (L.bass > 0.02 && (step % 2 === 0)) this.note(midi(chord[0] - 24), t, spb * 1.6, 'sawtooth', 0.05 * L.bass);
    // Batería: bombo, caja y charles
    if (L.drums > 0.02) {
      if (step === 0 || step === 4 || (step === 6 && this.state === 'final')) {
        this.note(110, t, 0.18, 'sine', 0.25 * L.drums);
        this.note(55, t, 0.22, 'sine', 0.2 * L.drums);
      }
      if (step === 2 || step === 6) this.noise(t, 0.16, 1500, 0.12 * L.drums, 'bandpass');
      this.noise(t, 0.04, 7000, 0.04 * L.drums);
    }
  }
}
