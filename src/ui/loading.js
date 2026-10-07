// Pantallas de carga ilustradas (al abrir el juego y antes de cada partida)
// y animación de inicio: vuelo de cámara sobre la isla con el logo.
import { SCREENS } from '../game/cosmetics.js';
import { randomTip } from './tips.js';

// Escena animada en SVG: sol, montañas lejanas, la isla con palmeras, el mar
// con olas, nubes y el autobús de batalla cruzando el cielo. Todo en siluetas
// semitransparentes, así combina con el fondo de cualquier pantalla de carga.
export function loadingScene() {
  const palm = (x, y, s, flip = 1) => `<g transform="translate(${x} ${y}) scale(${s * flip} ${s})">
      <path d="M0 0 C 6 -60 -4 -120 10 -170" stroke="currentColor" stroke-width="9" fill="none" stroke-linecap="round"/>
      <g transform="translate(10 -170)"><g class="ls-fronds">
        <path d="M0 0 C 30 -30 70 -20 95 10 C 60 -5 30 0 0 0Z"/>
        <path d="M0 0 C -30 -30 -70 -20 -95 10 C -60 -5 -30 0 0 0Z"/>
        <path d="M0 0 C 20 -45 55 -60 80 -50 C 50 -40 25 -25 0 0Z"/>
        <path d="M0 0 C -20 -45 -55 -60 -80 -50 C -50 -40 -25 -25 0 0Z"/>
        <path d="M0 0 C 10 -40 0 -70 -10 -85 C 0 -60 -2 -30 0 0Z"/>
      </g></g></g>`;
  const cloud = (x, y, s, cls) => `<g class="ls-cloud ${cls}" transform="translate(${x} ${y}) scale(${s})">
      <ellipse cx="0" cy="0" rx="90" ry="34"/><ellipse cx="-55" cy="10" rx="60" ry="26"/><ellipse cx="60" cy="8" rx="70" ry="28"/><ellipse cx="10" cy="-22" rx="55" ry="30"/></g>`;
  return `<svg class="ls-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="lsSun" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.25" stop-color="#fff6d8" stop-opacity="0.7"/>
        <stop offset="1" stop-color="#fff0c0" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="lsSea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0a1438" stop-opacity="0.35"/><stop offset="1" stop-color="#050a20" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <circle class="ls-sun" cx="1120" cy="330" r="260" fill="url(#lsSun)"/>
    <g class="ls-clouds-far">${cloud(200, 170, 0.8, 'c1')}${cloud(900, 120, 0.6, 'c2')}${cloud(1450, 210, 0.7, 'c3')}</g>
    <path class="ls-far" d="M0 640 L120 560 L210 600 L330 480 L420 540 L520 470 L640 590 L760 520 L880 600 L1000 540 L1130 610 L1260 500 L1380 570 L1500 520 L1600 580 L1600 700 L0 700Z"/>
    <g class="ls-bus">
      <g transform="translate(0 0)">
        <path d="M40 -120 C 0 -120 -10 -60 40 -40 C 90 -60 80 -120 40 -120Z" class="ls-balloon"/>
        <path d="M28 -44 L10 0 M52 -44 L70 0" stroke="currentColor" stroke-width="2" fill="none"/>
        <rect x="-20" y="0" width="120" height="40" rx="8"/><rect x="-14" y="6" width="22" height="14" rx="2" class="ls-win"/>
        <rect x="14" y="6" width="22" height="14" rx="2" class="ls-win"/><rect x="42" y="6" width="22" height="14" rx="2" class="ls-win"/>
        <rect x="70" y="6" width="22" height="14" rx="2" class="ls-win"/>
      </g>
    </g>
    <path class="ls-island" d="M180 760 C 300 700 380 690 470 640 C 560 590 600 520 660 450 C 700 400 730 380 760 400 L800 360 C 820 340 840 345 860 370 C 920 440 960 520 1060 590 C 1150 650 1300 690 1440 760 Z"/>
    <path class="ls-snow" d="M742 410 L760 400 L800 360 C 820 340 840 345 860 370 L838 382 L820 370 L806 390 L784 384 L766 410Z"/>
    <g class="ls-palms">${palm(380, 712, 0.75)}${palm(450, 690, 0.95, -1)}${palm(1160, 690, 0.85)}${palm(1240, 712, 0.65, -1)}</g>
    <rect x="0" y="740" width="1600" height="160" fill="url(#lsSea)"/>
    <g class="ls-waves">
      <path d="M0 770 q 40 -12 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0"/>
      <path d="M-40 815 q 40 -12 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0"/>
    </g>
    <g class="ls-clouds-near">${cloud(-60, 300, 1.2, 'c4')}${cloud(1300, 380, 1.0, 'c5')}</g>
  </svg>`;
}

export function screenBackground(id) {
  return (SCREENS[id] || SCREENS.atardecer).bg;
}

// Pantalla de carga del arranque (#loading de index.html) con progreso real.
export class BootLoader {
  constructor(el) {
    this.el = el;
    this.shown = 0; // progreso mostrado (avanza suave hacia el real)
    this.target = 0;
    if (!el) return;
    el.querySelector('.ld-art').innerHTML = loadingScene();
    this.fill = el.querySelector('.bar div');
    this.pct = el.querySelector('.ld-pct');
    this.text = el.querySelector('.loading-text');
    const tip = el.querySelector('.loading-tip');
    if (tip) {
      tip.textContent = randomTip();
      this.tipTimer = setInterval(() => {
        tip.classList.add('swap');
        setTimeout(() => {
          tip.textContent = randomTip(tip.textContent);
          tip.classList.remove('swap');
        }, 250);
      }, 5000);
    }
    el.classList.add('ready');
  }

  progress(text, f) {
    if (!this.el) return;
    this.target = Math.max(this.target, Math.min(1, f));
    if (text) this.text.textContent = text;
    this.shown = this.target;
    this.fill.style.width = `${(this.shown * 100).toFixed(1)}%`;
    this.pct.textContent = `${Math.round(this.shown * 100)}%`;
  }

  error(msg) {
    if (!this.el) return;
    this.text.textContent = msg;
    this.el.classList.add('error');
  }

  hide() {
    clearInterval(this.tipTimer);
    if (!this.el) return Promise.resolve();
    this.progress('¡Listo!', 1);
    this.el.classList.add('out');
    return new Promise((r) =>
      setTimeout(() => {
        this.el.style.display = 'none';
        r();
      }, 600),
    );
  }
}

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// Animación de inicio: la cámara llega volando desde el mar, rodea la isla
// y se queda en la vista del menú mientras aparece el logo. Se salta con
// cualquier tecla, clic o toque.
export class Intro {
  constructor(game, onDone) {
    this.game = game;
    this.onDone = onDone;
    this.t = 0;
    this.T = 5.6;
    this.active = true;
    const el = (this.el = document.createElement('div'));
    el.id = 'intro';
    el.innerHTML = `<div class="bar-top"></div><div class="bar-bot"></div>
      <div class="intro-center">
        <div class="intro-logo"><span class="l1">ISLA</span><span class="l2">ROYALE</span><i class="shine"></i></div>
        <div class="intro-sub">SALTA · SAQUEA · CONSTRUYE · SOBREVIVE</div>
      </div>
      <div class="intro-skip">Pulsa cualquier tecla para saltar</div>`;
    document.body.appendChild(el);
    this.skip = () => this.finish();
    setTimeout(() => {
      // (un poco después: el clic que cierra la carga no la salta)
      addEventListener('keydown', this.skip);
      addEventListener('pointerdown', this.skip);
    }, 250);
    game.intro = this;
  }

  // Pose de la cámara del menú en el instante t (ver Game.updateMenuCamera).
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const g = this.game;
    const cam = g.camera;
    const k = Math.min(1, this.t / this.T);
    const e = ease(k);
    const menu = g.menuCameraPose(g.time);
    const a0 = menu.a - 1.6;
    const a = a0 + (menu.a - a0) * e;
    const r = 1150 + (menu.r - 1150) * (1 - Math.pow(1 - k, 2.2));
    const y = 22 + (menu.y - 22) * e + Math.sin(k * Math.PI) * 35;
    cam.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const ty = 60 * (1 - e) + menu.ty * e;
    cam.lookAt(0, ty, 0);
    if (this.t >= this.T + 0.8) this.finish();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    removeEventListener('keydown', this.skip);
    removeEventListener('pointerdown', this.skip);
    this.game.intro = null;
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 700);
    this.onDone?.();
  }
}
