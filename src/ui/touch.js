// Controles táctiles para móviles y tabletas: joystick a la izquierda,
// arrastrar a la derecha para mirar y botones de acción. Escriben en el mismo
// objeto Input que el teclado y el ratón (ver src/core/input.js).

const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const ICONS = {
  fire: svg('<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  aim: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5v4M12 15v4M5 12h4M15 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  jump: svg('<path d="M12 4l7 8h-4.5v7h-5v-7H5z" fill="currentColor"/>'),
  crouch: svg('<path d="M12 20l-7-8h4.5V5h5v7H19z" fill="currentColor"/>'),
  reload: svg('<path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M19.5 3.5v5h-5z" fill="currentColor"/>'),
  build: svg('<path d="M3 20h18v-3H3zM3 15.5h8v-3H3zm10 0h8v-3h-8zM3 11h18V8H3zm4-4.5h10v-3H7z" fill="currentColor"/>'),
  sword: svg('<path d="M14.5 3H21v6.5L10.5 20 8 17.5l-2 2-1.5-1.5 2-2L4 13.5z" fill="currentColor"/>'),
  pause: svg('<path d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z" fill="currentColor"/>'),
  cam: svg('<path d="M12 6C6.5 6 3 12 3 12s3.5 6 9 6 9-6 9-6-3.5-6-9-6zm0 9.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" fill="currentColor"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z" fill="currentColor"/>'),
  mat: svg('<path d="M4 7l8-4 8 4-8 4zm0 5l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  use: svg('<path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10h.5V3a1.5 1.5 0 0 1 3 0v7h.5V5a1.5 1.5 0 0 1 3 0v9c0 4-2.5 7-6.5 7-3 0-4.6-1.6-6-3.7L4 13.5a1.4 1.4 0 0 1 2.2-1.7z" fill="currentColor"/>'),
};

// Botones: acción, icono, texto y qué tecla/botón simulan.
const BUTTONS = [
  { id: 'fire', key: 'mouse0', look: true },
  { id: 'fire2', key: 'mouse0', icon: 'fire', look: true },
  { id: 'aim', key: 'mouse2', toggle: true },
  { id: 'jump', key: 'Space', label: 'SALTAR' },
  { id: 'crouch', key: 'KeyC', toggle: true },
  { id: 'reload', key: 'KeyR' },
  { id: 'build', key: 'KeyQ' },
  { id: 'use', key: 'KeyE', label: 'USAR' },
  { id: 'pause', icon: 'pause' },
  { id: 'cam', key: 'KeyV' },
  { id: 'chat' },
];

export function isTouchDevice() {
  try {
    return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);
  } catch {
    return false;
  }
}

export function isNativeApp() {
  return !!window.Capacitor?.isNativePlatform?.();
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.input.touch = true;
    document.body.classList.add('touch');
    this.ptrs = new Map(); // pointerId -> { kind, ... }
    this.joy = null;
    this.state = {};
    this.toggles = { aim: false, crouch: false };
    this.useHeld = null;

    const root = (this.root = document.createElement('div'));
    root.id = 'touch-ui';
    root.innerHTML = `
      <div class="t-joy"><div class="t-knob"></div></div>
      ${BUTTONS.map((b) => `<button class="t-btn t-${b.id}" data-act="${b.id}">${ICONS[b.icon || b.id] || ''}${b.label ? `<span>${b.label}</span>` : ''}</button>`).join('')}`;
    document.body.appendChild(root);
    this.joyEl = root.querySelector('.t-joy');
    this.knobEl = root.querySelector('.t-knob');
    this.btn = {};
    root.querySelectorAll('[data-act]').forEach((el) => (this.btn[el.dataset.act] = el));

    const opts = { passive: false };
    root.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    root.addEventListener('pointermove', (e) => this.onMove(e), opts);
    root.addEventListener('pointerup', (e) => this.onUp(e), opts);
    root.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // Gestos del navegador (zoom, desplazamiento, menú de pulsación larga) fuera
    root.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    this.bindHud();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.releaseAll();
        const g = this.game;
        if (g.state === 'playing' && !g.spectating) this.input.unlock();
      }
    });
    this.applySettings();
  }

  applySettings() {
    const s = this.game.settings;
    this.root.style.setProperty('--tsz', String(s.touchSize || 1));
    this.root.style.setProperty('--top', String(s.touchOpacity ?? 0.85));
  }

  // Pantalla completa y horizontal (sólo funciona tras un toque del usuario).
  fullscreen() {
    if (isNativeApp() || !this.game.settings.touchFullscreen) return;
    const d = document.documentElement;
    if (!document.fullscreenElement && d.requestFullscreen) {
      d.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
        .catch(() => {});
    }
  }

  vibrate(ms) {
    if (this.game.settings.vibration === false) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* sin vibración */
    }
  }

  // ---------------------------------------------------------- HUD táctil
  // Huecos del inventario, piezas de construcción, minimapa y avisos.
  bindHud() {
    const g = this.game;
    const tapEl = (el, fn) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn(e);
      });
    };
    const slots = document.getElementById('slots');
    let hold = null;
    slots.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.slot');
      if (!el) return;
      e.preventDefault();
      const i = [...slots.children].indexOf(el);
      this.input.tap('Digit' + (i + 1));
      this.setToggle('aim', false);
      clearTimeout(hold);
      // Mantener pulsado: soltar el objeto
      hold = setTimeout(() => {
        if (g.player.selected === i && i > 0) {
          this.input.tap('KeyG');
          this.vibrate(30);
        }
      }, 650);
    });
    const cancel = () => clearTimeout(hold);
    slots.addEventListener('pointerup', cancel);
    slots.addEventListener('pointercancel', cancel);
    slots.addEventListener('pointerleave', cancel);

    const bar = document.getElementById('build-bar');
    bar.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.piece, .piece-mat');
      if (!el) return;
      e.preventDefault();
      if (el.classList.contains('piece-mat')) this.input.tap('mouse2');
      else this.input.tap('Digit' + ([...bar.querySelectorAll('.piece')].indexOf(el) + 1));
    });

    tapEl(document.getElementById('minimap'), () => this.input.tap('KeyM'));
    tapEl(document.getElementById('fullmap'), () => this.input.tap('KeyM'));
    const prompt = document.getElementById('prompt');
    prompt.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.useHeld = e.pointerId;
      this.input.press('KeyE');
    });
    const upUse = (e) => {
      if (this.useHeld === e.pointerId) {
        this.useHeld = null;
        this.input.release('KeyE');
      }
    };
    prompt.addEventListener('pointerup', upUse);
    prompt.addEventListener('pointercancel', upUse);
  }

  // ---------------------------------------------------------- PUNTEROS
  onDown(e) {
    e.preventDefault();
    const g = this.game;
    const input = this.input;
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* puntero ya liberado */
    }
    g.audio.init();
    if (g.spectating) {
      if (!e.target.closest('[data-act="pause"]')) {
        g.nextSpectate();
        return;
      }
    }
    // Primer toque de la partida (o tras volver a la app): empezar a jugar
    if (g.state === 'playing' && !input.locked && !g.paused) input.lock();

    const btnEl = e.target.closest('[data-act]');
    if (btnEl) {
      const act = btnEl.dataset.act;
      const def = BUTTONS.find((b) => b.id === act);
      this.vibrate(8);
      btnEl.classList.add('down');
      const p = { kind: 'btn', act, def, el: btnEl, x: e.clientX, y: e.clientY };
      this.ptrs.set(e.pointerId, p);
      this.pressButton(act, def);
      return;
    }
    // Mitad izquierda: joystick flotante. Derecha: mirar.
    if (e.clientX < innerWidth * 0.42 && !this.joy) {
      const r = this.joyRadius;
      const x = Math.max(r + 8, Math.min(innerWidth * 0.42, e.clientX));
      const y = Math.max(r + 8, Math.min(innerHeight - r - 8, e.clientY));
      this.joy = { id: e.pointerId, cx: x, cy: y };
      this.ptrs.set(e.pointerId, { kind: 'joy' });
      this.joyEl.style.transform = `translate(${x}px, ${y}px)`;
      this.joyEl.classList.add('on');
      this.moveJoy(e.clientX, e.clientY);
      return;
    }
    this.ptrs.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
  }

  onMove(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'joy') return this.moveJoy(e.clientX, e.clientY);
    if (p.kind === 'look' || (p.kind === 'btn' && p.def?.look)) {
      // getCoalescedEvents da más precisión con dedos rápidos
      this.input.lookDX += e.clientX - p.x;
      this.input.lookDY += e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
    }
  }

  onUp(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.kind === 'joy') {
      this.joy = null;
      this.joyEl.classList.remove('on');
      this.knobEl.style.transform = '';
      this.setAxis(0, 0, false);
    } else if (p.kind === 'btn') {
      p.el.classList.remove('down');
      this.releaseButton(p.act, p.def);
    }
  }

  get joyRadius() {
    return 58 * (this.game.settings.touchSize || 1);
  }

  moveJoy(x, y) {
    const j = this.joy;
    const r = this.joyRadius;
    let dx = x - j.cx, dy = y - j.cy;
    const d = Math.hypot(dx, dy);
    if (d > r) {
      // El joystick sigue al dedo si se sale del círculo
      const k = (d - r) / d;
      j.cx += dx * k;
      j.cy += dy * k;
      this.joyEl.style.transform = `translate(${j.cx}px, ${j.cy}px)`;
      dx = x - j.cx;
      dy = y - j.cy;
    }
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    this.setAxis(dx / r, -dy / r, true);
  }

  setAxis(x, y, active) {
    const input = this.input;
    const a = input.axis;
    a.x = x;
    a.y = y;
    a.active = active && Math.hypot(x, y) > 0.12;
    if (!a.active) a.x = a.y = 0;
    const set = (code, on) => {
      if (on && !input.keys.has(code)) input.press(code);
      else if (!on && input.keys.has(code)) input.release(code);
    };
    set('KeyW', a.y > 0.3);
    set('KeyS', a.y < -0.3);
    set('KeyD', a.x > 0.3);
    set('KeyA', a.x < -0.3);
    // Joystick a tope hacia delante = correr
    const sprint = a.active && Math.hypot(a.x, a.y) > 0.92 && a.y > 0.7;
    set('ShiftLeft', sprint);
    this.joyEl.classList.toggle('sprint', sprint);
  }

  pressButton(act, def) {
    const g = this.game;
    const input = this.input;
    if (act === 'pause') {
      if (g.spectating) g.quitToMenu();
      else if (g.hud.mapOpen) g.hud.toggleMap(false);
      else input.unlock();
      return;
    }
    if (act === 'chat') {
      g.menu.online.openChat();
      return;
    }
    if (act === 'aim' && g.build.active) {
      input.tap('mouse2'); // construyendo: cambiar de material
      return;
    }
    if (def.toggle) {
      this.setToggle(act, !this.toggles[act]);
      return;
    }
    if (act === 'build') this.setToggle('aim', false);
    if (def.key) input.press(def.key);
  }

  releaseButton(act, def) {
    if (def?.toggle || !def?.key || act === 'pause' || act === 'chat') return;
    if (act === 'aim' && this.game.build.active) return;
    this.input.release(def.key);
  }

  setToggle(act, on) {
    if (this.toggles[act] === on) return;
    this.toggles[act] = on;
    const def = BUTTONS.find((b) => b.id === act);
    if (on) this.input.press(def.key);
    else this.input.release(def.key);
    this.btn[act].classList.toggle('on', on);
  }

  releaseAll() {
    for (const [, p] of this.ptrs) p.el?.classList.remove('down');
    this.ptrs.clear();
    this.joy = null;
    this.joyEl.classList.remove('on');
    this.setToggle('aim', false);
    this.setToggle('crouch', false);
    this.input.releaseAll();
  }

  // ---------------------------------------------------------- CADA FOTOGRAMA
  update() {
    const g = this.game;
    const p = g.player;
    const playing = g.state === 'playing' && !g.paused && !g.waiting;
    const st = playing
      ? !p.alive ? 'dead'
        : g.spectating ? 'dead'
          : p.mode === 'bus' ? 'bus'
            : p.mode === 'freefall' || p.mode === 'glide' ? 'air'
              : p.vehicle ? 'car'
                : p.knocked ? 'knocked'
                  : g.build.active ? 'building' : 'ground'
      : 'off';
    if (st !== this.state.mode) {
      this.state.mode = st;
      this.root.dataset.mode = st;
      if (st === 'off' || st === 'dead') this.releaseAll();
      if (st !== 'ground') this.setToggle('aim', false);
      if (st !== 'ground' && st !== 'building') this.setToggle('crouch', false);
    }
    // El agacharse se cancela al saltar
    if (this.toggles.crouch && !p.crouching && p.jumped) this.setToggle('crouch', false);
    // Al cambiar de arma o recargar se deja de apuntar
    if (this.toggles.aim && (g.combat.reloading || p.selected !== this.state.sel)) this.setToggle('aim', false);
    this.state.sel = p.selected;
    const online = !!g.net;
    if (online !== this.state.online) {
      this.state.online = online;
      this.root.classList.toggle('online', online);
    }
    const jumpLabel = st === 'bus' ? 'SALTAR' : st === 'air' ? (p.mode === 'glide' ? '' : 'PLANEAR') : st === 'car' ? 'FRENO' : '';
    if (jumpLabel !== this.state.jumpLabel) {
      this.state.jumpLabel = jumpLabel;
      this.btn.jump.querySelector('span').textContent = jumpLabel;
    }
    const buildIcon = st === 'building' ? 'sword' : 'build';
    if (buildIcon !== this.state.buildIcon) {
      this.state.buildIcon = buildIcon;
      this.btn.build.innerHTML = ICONS[buildIcon];
      this.btn.aim.innerHTML = st === 'building' ? ICONS.mat : ICONS.aim;
    }
    const prompt = playing && g.hud.last.promptShow === 'block';
    if (prompt !== this.state.prompt) {
      this.state.prompt = prompt;
      this.root.classList.toggle('has-prompt', prompt);
      if (!prompt && this.input.keys.has('KeyE')) this.input.release('KeyE');
    }
    const noBuild = !g.mode.build;
    if (noBuild !== this.state.noBuild) {
      this.state.noBuild = noBuild;
      this.root.classList.toggle('no-build', noBuild);
    }
  }
}
