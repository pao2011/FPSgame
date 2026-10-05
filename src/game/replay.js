import * as THREE from 'three';
import { heldCode, heldFromCode } from '../net/remote.js';
import { PICKAXE } from './items.js';

// Repeticiones y modo espectador.
// · Durante la partida se graba el estado de todos los personajes 5 veces
//   por segundo (posición, orientación, modo, arma, vivo/derribado) y la
//   tormenta. Al terminar se puede ver la repetición con línea de tiempo,
//   velocidad, seguir a cualquier jugador o cámara libre.
// · Al morir se puede seguir viendo la partida en directo (seguir a otros
//   jugadores o cámara libre).
const MODES = ['lobby', 'bus', 'freefall', 'glide', 'ground'];
const RATE = 0.2;
const STRIDE = 8; // x, y, z, yaw, modo, banderas, arma, (libre)
const F_ALIVE = 1, F_CROUCH = 2, F_KNOCK = 4;
const tmpV = new THREE.Vector3();

export class Replay {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.chars = [];
    this.index = new Map();
    this.codes = [''];
    this.codeIdx = new Map([['', 0]]);
    this.frames = [];
    this.events = [];
    this.acc = 0;
    this.t = 0;
    this.enabled = false;
  }

  start() {
    this.reset();
    this.enabled = !this.game.net && !this.game.mode.creative;
  }

  code(item) {
    const c = heldCode(item);
    let i = this.codeIdx.get(c);
    if (i === undefined) {
      i = this.codes.length;
      this.codes.push(c);
      this.codeIdx.set(c, i);
    }
    return i;
  }

  heldOf(c) {
    if (c.isPlayer) return this.game.build.active ? null : c.item;
    return c.weapon || PICKAXE;
  }

  event(text) {
    if (this.enabled) this.events.push({ t: this.t, text });
  }

  record(dt) {
    const g = this.game;
    if (!this.enabled || g.state !== 'playing' || g.phase === 'lobby') return;
    this.t += dt;
    this.acc += dt;
    if (this.acc < RATE) return;
    this.acc = 0;
    for (const c of g.chars) {
      if (!this.index.has(c)) {
        this.index.set(c, this.chars.length);
        this.chars.push(c);
      }
    }
    const d = new Float32Array(this.chars.length * STRIDE);
    this.chars.forEach((c, i) => {
      const o = i * STRIDE;
      d[o] = c.pos.x;
      d[o + 1] = c.pos.y;
      d[o + 2] = c.pos.z;
      d[o + 3] = c.yaw;
      d[o + 4] = Math.max(0, MODES.indexOf(c.mode));
      d[o + 5] = (c.alive ? F_ALIVE : 0) | (c.crouching ? F_CROUCH : 0) | (c.knocked ? F_KNOCK : 0);
      d[o + 6] = this.code(this.heldOf(c));
    });
    const st = g.storm;
    this.frames.push({ t: this.t, d, storm: [st.center.x, st.center.y, st.radius], n: this.chars.length });
  }

  get duration() {
    return this.frames.length ? this.frames[this.frames.length - 1].t : 0;
  }

  get available() {
    return this.frames.length > 10;
  }

  // Coloca a los personajes en el instante t (interpolando entre fotogramas).
  pose(t, dt) {
    const F = this.frames;
    if (!F.length) return;
    let lo = 0, hi = F.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (F[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = F[lo], b = F[hi];
    const k = b.t > a.t ? THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
    const g = this.game;
    this.chars.forEach((c, i) => {
      const o = i * STRIDE;
      if (i >= a.n) {
        c.model.root.visible = false;
        return;
      }
      const hasB = i < b.n;
      const flags = a.d[o + 5];
      const alive = !!(flags & F_ALIVE);
      const mode = MODES[a.d[o + 4]] || 'ground';
      const vis = alive && mode !== 'bus' && mode !== 'lobby';
      c.model.root.visible = vis;
      c.glider.visible = vis && mode === 'glide';
      if (!vis) return;
      const bx = hasB ? b.d[o] : a.d[o], by = hasB ? b.d[o + 1] : a.d[o + 1], bz = hasB ? b.d[o + 2] : a.d[o + 2];
      const prev = tmpV.copy(c.pos);
      c.pos.set(a.d[o] + (bx - a.d[o]) * k, a.d[o + 1] + (by - a.d[o + 1]) * k, a.d[o + 2] + (bz - a.d[o + 2]) * k);
      let dy = (hasB ? b.d[o + 3] : a.d[o + 3]) - a.d[o + 3];
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw = a.d[o + 3] + dy * k;
      if (dt > 0) c.vel.copy(c.pos).sub(prev).divideScalar(Math.max(dt, 1e-3));
      if (c.vel.lengthSq() > 900) c.vel.set(0, 0, 0);
      c.mode = mode;
      c.alive = alive;
      c.crouching = !!(flags & F_CROUCH);
      c.knocked = !!(flags & F_KNOCK);
      c.onGround = mode === 'ground';
      const item = heldFromCode(this.codes[a.d[o + 6]]);
      c.setHeld(item);
      c.updateModel(Math.max(dt, 0.016), item, 0);
    });
    const st = g.storm;
    st.center.set(a.storm[0] + (b.storm[0] - a.storm[0]) * k, a.storm[1] + (b.storm[1] - a.storm[1]) * k);
    st.radius = a.storm[2] + (b.storm[2] - a.storm[2]) * k;
    st._syncMesh();
  }
}

// Cámara libre (WASD, Espacio/Shift para subir y bajar, arrastrar el ratón
// para girar) y visor de repeticiones / espectador en directo.
export class Viewer {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.kind = null; // 'live' | 'replay'
    this.free = false;
    this.cam = { pos: new THREE.Vector3(), yaw: 0, pitch: -0.3 };
    this.follow = null;
    this.t = 0;
    this.speed = 1;
    this.playing = true;
    this.el = document.createElement('div');
    this.el.id = 'viewer';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => {
      if (e.target.dataset.seek !== undefined) {
        this.t = (Number(e.target.value) / 1000) * this.game.replay.duration;
      }
    });
    let drag = null;
    const canvas = game.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.active && this.free) drag = { x: e.clientX, y: e.clientY };
    });
    addEventListener('pointermove', (e) => {
      if (!drag || !this.active) return;
      this.cam.yaw -= (e.clientX - drag.x) * 0.005;
      this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch - (e.clientY - drag.y) * 0.005, -1.5, 1.5);
      drag = { x: e.clientX, y: e.clientY };
    });
    addEventListener('pointerup', () => (drag = null));
  }

  candidates() {
    const g = this.game;
    if (this.kind === 'photo') return [];
    if (this.kind === 'replay') return g.replay.chars.filter((c) => c.model.root.visible);
    return g.chars.filter((c) => c.alive && c !== g.player && c.mode !== 'bus' && c.mode !== 'lobby');
  }

  open(kind) {
    const g = this.game;
    this.kind = kind;
    this.active = true;
    this.free = false;
    this.prevState = g.state;
    if (kind !== 'photo') document.getElementById('end').style.display = 'none';
    else {
      g.input.unlock();
      g.chatOpen = true; // sin menú de pausa al soltar el ratón
    }
    g.hud.show(false);
    if (kind === 'replay') {
      g.state = 'replay';
      this.t = 0;
      this.speed = 1;
      this.playing = true;
      g.replay.pose(0, 0);
      this.follow = g.player;
    } else {
      this.follow = g.deathInfo?.killer?.alive ? g.deathInfo.killer : this.candidates()[0] || null;
    }
    // Punto de partida de la cámara: sobre el jugador, mirando hacia abajo
    this.cam.pos.copy(g.player.pos).add(new THREE.Vector3(0, 25, 18));
    this.cam.yaw = 0;
    this.cam.pitch = -0.8;
    if (!this.follow || kind === 'photo') this.free = true;
    if (kind === 'photo') {
      this.cam.pos.copy(g.camera.position);
      this.cam.yaw = g.camera.rotation.y;
      this.cam.pitch = g.camera.rotation.x;
    }
    this.el.style.display = 'flex';
    this.render();
  }

  // Cierre sin volver a la pantalla final (nueva partida, menú).
  hide() {
    if (!this.active) return;
    this.active = false;
    this.el.style.display = 'none';
    if (this.kind === 'replay') this.game.state = this.prevState;
  }

  close() {
    const g = this.game;
    if (!this.active) return;
    this.active = false;
    this.el.style.display = 'none';
    if (this.kind === 'replay') g.state = this.prevState;
    if (this.kind === 'photo') {
      g.hud.show(true);
      g.chatOpen = false;
      g.input.lock();
      return;
    }
    document.getElementById('end').style.display = 'flex';
  }

  // Modo foto: guarda la imagen del juego sin interfaz.
  snapshot() {
    const g = this.game;
    g.render();
    const url = g.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `isla-royale-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    a.click();
    g.hud.toast?.('📷 Foto guardada');
  }

  render() {
    const g = this.game;
    const R = g.replay;
    const name = this.free ? 'Cámara libre' : this.follow ? this.follow.name || 'Tú' : '—';
    const time = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const replay = this.kind === 'replay';
    if (this.kind === 'photo') {
      this.el.innerHTML = `<div class="vw-top">📷 MODO FOTO <small>WASD mover · Espacio/Shift subir/bajar · arrastra para girar · H ocultar barra</small></div>
        <div class="vw-bar"><button data-a="shot">📸 Hacer foto</button><button data-a="close" class="exit">Salir del modo foto</button></div>`;
      return;
    }
    this.el.innerHTML = `
      <div class="vw-top">${replay ? '🎬 REPETICIÓN' : '👁 ESPECTADOR'} · <b>${name}</b>
        <small>${this.free ? 'WASD mover · Espacio/Shift subir/bajar · arrastra para girar' : 'Cambia de jugador con las flechas'}</small></div>
      <div class="vw-bar">
        ${replay ? `<button data-a="play">${this.playing ? '⏸' : '▶'}</button>
          <input type="range" min="0" max="1000" value="${R.duration ? Math.round((this.t / R.duration) * 1000) : 0}" data-seek>
          <span class="vw-time">${time(this.t)} / ${time(R.duration)}</span>
          ${[0.5, 1, 2, 4].map((s) => `<button data-speed="${s}" class="${this.speed === s ? 'on' : ''}">${s}×</button>`).join('')}` : ''}
        <button data-a="prev">◀ Jugador</button><button data-a="next">Jugador ▶</button>
        <button data-a="free" class="${this.free ? 'on' : ''}">🎥 Cámara libre</button>
        <button data-a="close" class="exit">${replay ? 'Salir de la repetición' : 'Ver resultados'}</button>
      </div>`;
    this.slider = this.el.querySelector('[data-seek]');
    this.timeEl = this.el.querySelector('.vw-time');
  }

  onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const a = b.dataset.a;
    if (b.dataset.speed) this.speed = Number(b.dataset.speed);
    else if (a === 'play') this.playing = !this.playing;
    else if (a === 'free') this.free = !this.free;
    else if (a === 'prev' || a === 'next') this.cycle(a === 'next' ? 1 : -1);
    else if (a === 'close') return this.close();
    else if (a === 'shot') return this.snapshot();
    this.render();
  }

  cycle(dir) {
    const list = this.candidates();
    if (!list.length) return;
    this.free = false;
    const i = list.indexOf(this.follow);
    this.follow = list[(i + dir + list.length) % list.length];
  }

  // Repetición: avanza el tiempo y coloca a los personajes.
  updateReplay(dt) {
    const g = this.game;
    const R = g.replay;
    const step = this.playing ? dt * this.speed : 0;
    this.t = Math.min(R.duration, this.t + step);
    if (this.t >= R.duration) this.playing = false;
    R.pose(this.t, step);
    this.camera(dt);
    if (this.slider && document.activeElement !== this.slider) this.slider.value = String(R.duration ? Math.round((this.t / R.duration) * 1000) : 0);
    if (this.timeEl) {
      const time = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      this.timeEl.textContent = `${time(this.t)} / ${time(R.duration)}`;
    }
    g.sky.material.uniforms.time.value += dt;
  }

  // Coloca la cámara; devuelve true si se ha encargado de ella.
  camera(dt) {
    if (!this.active) return false;
    const g = this.game;
    const cam = g.camera;
    const input = g.input;
    if (this.kind === 'photo' && input.wasPressed('KeyH')) this.el.style.display = this.el.style.display === 'none' ? 'flex' : 'none';
    if (input.wasPressed('ArrowRight')) this.cycle(1);
    if (input.wasPressed('ArrowLeft')) this.cycle(-1);
    if (input.wasPressed('ArrowRight') || input.wasPressed('ArrowLeft')) this.render();
    const f = this.follow;
    const ok = f && (this.kind === 'replay' ? f.model.root.visible : f.alive && f.mode !== 'bus' && f.mode !== 'lobby');
    if (!this.free && ok) {
      const yaw = f.yaw, pitch = -0.28;
      const dir = tmpV.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const want = f.pos.clone().add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(dir, -5.5);
      if (this.cam.pos.distanceTo(want) > 60) this.cam.pos.copy(want);
      else this.cam.pos.lerp(want, Math.min(1, dt * 6));
      this.cam.yaw = yaw;
      this.cam.pitch = pitch;
    } else {
      // Cámara libre
      const sp = (input.down('ShiftLeft') && input.down('ControlLeft') ? 60 : 22) * dt;
      const fw = tmpV.set(-Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch), Math.sin(this.cam.pitch), -Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch));
      const right = new THREE.Vector3(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw));
      if (input.down('KeyW')) this.cam.pos.addScaledVector(fw, sp);
      if (input.down('KeyS')) this.cam.pos.addScaledVector(fw, -sp);
      if (input.down('KeyD')) this.cam.pos.addScaledVector(right, sp);
      if (input.down('KeyA')) this.cam.pos.addScaledVector(right, -sp);
      if (input.down('Space')) this.cam.pos.y += sp;
      if (input.down('ShiftLeft') && !input.down('ControlLeft')) this.cam.pos.y -= sp;
      const gy = g.world.terrain.heightAt(this.cam.pos.x, this.cam.pos.z) + 0.8;
      if (this.cam.pos.y < gy) this.cam.pos.y = gy;
    }
    cam.position.copy(this.cam.pos);
    cam.rotation.set(this.cam.pitch, this.cam.yaw, 0, 'YXZ');
    cam.fov += (g.baseFov - cam.fov) * Math.min(1, dt * 8);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    g.storm.updateVisual(cam.position);
    g.focusShadow(this.follow && !this.free ? this.follow.pos : this.cam.pos);
    return true;
  }
}
