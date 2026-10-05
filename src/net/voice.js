// Chat de voz en partidas online (WebRTC, de igual a igual). El servidor
// sólo reenvía la señalización (m.rtc). La voz de los rivales se oye por
// proximidad (sonido 3D que se atenúa con la distancia, hasta ~50 m); la de
// los compañeros, siempre. Pulsar para hablar (tecla «Hablar») o micrófono
// abierto, según las opciones.
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

export class VoiceChat {
  constructor(game, match) {
    this.game = game;
    this.match = match;
    this.peers = new Map(); // id -> { pc, audio, panner, gain, analyser, level }
    this.stream = null;
    this.enabled = false;
    this.talking = false;
    this.off = [];
    this.indicator = document.createElement('div');
    this.indicator.id = 'voice-ind';
    document.getElementById('hud')?.appendChild(this.indicator);
  }

  async start() {
    const s = this.game.settings;
    if (!s.voice || this.enabled) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      this.game.hud.toast('Chat de voz no disponible en este navegador');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      this.game.hud.toast('Chat de voz: no hay permiso para usar el micrófono');
      return;
    }
    this.enabled = true;
    this.setMic(s.voiceMode === 'open');
    this.off.push(this.match.net.on('m.rtc', (m) => this.onSignal(m)));
    // Llama a los jugadores con id mayor (evita que dos llamen a la vez)
    for (const r of this.match.remotes) if (r.isHuman && r.netId > this.match.you) this.call(r.netId);
    this.game.hud.toast(s.voiceMode === 'open' ? '🎙 Chat de voz activo (micrófono abierto)' : `🎙 Chat de voz activo · mantén ${this.game.key('voice')} para hablar`);
  }

  stop() {
    for (const f of this.off) f();
    this.off = [];
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.enabled = false;
    this.indicator.remove();
  }

  setMic(on) {
    this.talking = on;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  send(to, data) {
    this.match.net.send('m.rtc', { to, ...data });
  }

  peer(id) {
    let p = this.peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    p = { pc, id, level: 0 };
    this.peers.set(id, p);
    for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
    pc.onicecandidate = (e) => e.candidate && this.send(id, { ice: e.candidate });
    pc.ontrack = (e) => this.attach(p, e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(id);
    };
    return p;
  }

  async call(id) {
    const p = this.peer(id);
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    this.send(id, { sdp: p.pc.localDescription });
  }

  async onSignal(m) {
    if (!this.enabled || !m.from) return;
    const p = this.peer(m.from);
    try {
      if (m.sdp) {
        await p.pc.setRemoteDescription(m.sdp);
        if (m.sdp.type === 'offer') {
          const ans = await p.pc.createAnswer();
          await p.pc.setLocalDescription(ans);
          this.send(m.from, { sdp: p.pc.localDescription });
        }
      } else if (m.ice) await p.pc.addIceCandidate(m.ice);
    } catch {
      /* señal fuera de orden: se ignora */
    }
  }

  // Audio remoto → panner 3D (proximidad) → altavoces.
  attach(p, stream) {
    const a = this.game.audio;
    a.init();
    const c = a.ctx;
    if (!c || p.src) return;
    // Chrome necesita que el stream esté «sonando» en un elemento para enviarlo a WebAudio
    p.el = new Audio();
    p.el.muted = true;
    p.el.srcObject = stream;
    p.el.play().catch(() => {});
    p.src = c.createMediaStreamSource(stream);
    p.panner = c.createPanner();
    p.panner.panningModel = 'HRTF';
    p.panner.distanceModel = 'linear';
    p.panner.refDistance = 4;
    p.panner.maxDistance = 50;
    p.panner.rolloffFactor = 1;
    p.gain = c.createGain();
    p.gain.gain.value = (this.game.settings.voiceVolume ?? 80) / 100;
    p.analyser = c.createAnalyser();
    p.analyser.fftSize = 256;
    p.buf = new Uint8Array(p.analyser.frequencyBinCount);
    p.src.connect(p.analyser);
    p.src.connect(p.panner).connect(p.gain).connect(c.destination);
  }

  drop(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try {
      p.pc.close();
    } catch {
      /* ya cerrada */
    }
    p.src?.disconnect();
    p.gain?.disconnect();
    if (p.el) p.el.srcObject = null;
    this.peers.delete(id);
  }

  update(dt, input) {
    if (!this.enabled) return;
    const g = this.game;
    if (g.settings.voiceMode !== 'open') {
      const want = input.held('voice');
      if (want !== this.talking) this.setMic(want);
    }
    let html = this.talking ? '<span class="me">🎙 Hablando</span>' : '';
    for (const p of this.peers.values()) {
      const who = this.match.ents.get(p.id);
      if (!p.panner || !who) continue;
      // Compañeros: siempre se oyen (sin distancia); rivales: por proximidad
      const mate = who.team === this.match.myTeam;
      const pos = mate ? g.camera.position : who.pos;
      if (p.panner.positionX) {
        p.panner.positionX.value = pos.x;
        p.panner.positionY.value = pos.y + 1.6;
        p.panner.positionZ.value = pos.z;
      } else p.panner.setPosition(pos.x, pos.y + 1.6, pos.z);
      p.analyser.getByteTimeDomainData(p.buf);
      let peak = 0;
      for (const v of p.buf) peak = Math.max(peak, Math.abs(v - 128));
      p.level = Math.max(peak / 128, p.level - dt * 2);
      if (p.level > 0.08) html += `<span class="${mate ? 'mate' : ''}">🔊 ${who.name}</span>`;
    }
    if (html !== this.html) {
      this.html = html;
      this.indicator.innerHTML = html;
    }
  }
}
