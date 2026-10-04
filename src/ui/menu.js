import * as THREE from 'three';
import { MODES, DIFFICULTIES } from '../game/modes.js';
import { OnlineUI } from './online.js';
import { makeCharacter } from '../game/models.js';
import { SKINS, SHIRTS, PANTS, HAIR, randomOutfit } from '../game/character.js';

const $ = (id) => document.getElementById(id);

const CONTROLS = [
  ['W A S D', 'Moverse · W/S en una escalera de mano: trepar/bajar'], ['Ratón', 'Mirar'], ['Clic izquierdo', 'Disparar · usar · golpear · colocar pieza'],
  ['Clic derecho', 'Apuntar · (construyendo) cambiar material'], ['Espacio', 'Saltar · salir del bus · planeador · freno de mano'],
  ['Shift', 'Correr'], ['C', 'Agacharse'], ['E', 'Abrir cofre · recoger · coche · (mantener) reanimar'],
  ['R', 'Recargar'], ['1–6 / rueda', 'Inventario · (construyendo) 1–4 pieza'], ['Q', 'Modo construcción'],
  ['G', 'Soltar objeto'], ['V', 'Cámara 1ª / 3ª persona'], ['M', 'Mapa'], ['Esc', 'Pausa'],
  ['Intro', '(online) Chat de la partida · empieza con /e para hablar solo con tu equipo'],
];

const TOUCH_CONTROLS = [
  ['Joystick (izquierda)', 'Moverse · a tope hacia delante: correr · en una escalera: trepar'],
  ['Arrastrar (derecha)', 'Mirar · también arrastrando el botón de disparo'],
  ['◎ Disparar', 'Disparar · usar curas · golpear con el pico · colocar pieza (hay otro a la izquierda)'],
  ['Mira', 'Apuntar (toca para activar/desactivar) · construyendo: cambiar material'],
  ['▲ Saltar', 'Saltar · salir del autobús · abrir el planeador · freno de mano'],
  ['▼', 'Agacharse (activar/desactivar)'], ['↻', 'Recargar'], ['Ladrillos', 'Modo construcción / volver al combate'],
  ['USAR', 'Abrir cofre · recoger · coche · (mantener) reanimar'],
  ['Inventario', 'Toca un hueco para elegir · mantenlo pulsado para soltar el objeto'],
  ['Minimapa', 'Tócalo para abrir el mapa'], ['⏸', 'Pausa'], ['👁', 'Cámara 1ª / 3ª persona'], ['💬', '(online) Chat de la partida'],
];

const OUTFIT_PARTS = [
  ['shirt', 'Camiseta', SHIRTS], ['pants', 'Pantalón', PANTS], ['hair', 'Pelo', HAIR], ['skin', 'Piel', SKINS],
];

// Vista previa 3D del personaje (pantalla Personaje).
class CharacterPreview {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.canvas.width = 320;
    this.canvas.height = 400;
    this.renderer = null;
    this.model = null;
    this.t = 0;
  }

  init() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(320, 400, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x404860, 2.2));
    const key = new THREE.DirectionalLight(0xfff0dd, 2.6);
    key.position.set(2, 3, 3);
    const rim = new THREE.DirectionalLight(0x7ab8ff, 2.2);
    rim.position.set(-3, 2, -3);
    this.scene.add(key, rim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.25 }));
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);
    this.camera = new THREE.PerspectiveCamera(30, 320 / 400, 0.1, 20);
    this.camera.position.set(0, 1.2, 4.6);
    this.camera.lookAt(0, 0.95, 0);
  }

  set(outfit) {
    this.init();
    if (this.model) this.scene.remove(this.model.root);
    this.model = makeCharacter(outfit);
    this.model.armL.rotation.z = -0.12;
    this.model.armR.rotation.z = 0.12;
    this.scene.add(this.model.root);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.canvas.isConnected) {
        this.running = false;
        return;
      }
      this.t += 0.016;
      if (this.model) {
        this.model.root.rotation.y = Math.PI + Math.sin(this.t * 0.6) * 0.6 + 0.3;
        this.model.body.position.y = Math.sin(this.t * 2) * 0.01;
        this.model.armL.rotation.x = Math.sin(this.t * 2) * 0.05;
        this.model.armR.rotation.x = -Math.sin(this.t * 2) * 0.05;
      }
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    tick();
  }
}

const HOWTO = [
  ['Salta del autobús', 'Pulsa Espacio (en el móvil, SALTAR) cuando se abran las puertas. Mira hacia abajo y mantén W o el joystick hacia delante para caer más rápido; el planeador se abre solo.'],
  ['Equípate', 'Abre cofres dorados (E) y recoge armas, curas y munición. El color indica la rareza.'],
  ['Consigue materiales', 'Golpea árboles, rocas y coches abandonados con el pico para conseguir madera, piedra y metal.'],
  ['Construye para cubrirte', 'Q entra en modo construcción: muros, suelos, rampas y techos. Clic derecho cambia el material.'],
  ['Vigila la tormenta', 'El círculo blanco del mapa (M) es la próxima zona segura. Fuera de ella pierdes vida.'],
  ['Juega en equipo', 'En Dúos y Escuadras, si te derriban arrástrate hacia un compañero. Mantén E para reanimar a los tuyos.'],
  ['Sé el último en pie', 'Elimina al resto de jugadores (o equipos) para conseguir la Victoria Magistral.'],
];

export class Menu {
  constructor(game) {
    this.game = game;
    this.root = $('main-menu');
    this.panel = 'play';
    this.preview = new CharacterPreview();
    this.build();
    this.online = new OnlineUI(game, this);
  }

  get s() {
    return this.game.settings;
  }

  build() {
    const g = this.game;
    this.root.innerHTML = `
      <div class="mm-left">
        <div class="logo">ISLA<span>ROYALE</span></div>
        <div class="tagline">Battle royale en 3D en tu navegador</div>
        <nav class="mm-nav">
          <button data-panel="online" class="nav-btn online">🌐 ONLINE <span class="badge" id="online-badge"></span></button>
          <button data-panel="play" class="nav-btn">▶ JUGAR CON BOTS</button>
          <button data-panel="locker" class="nav-btn">PERSONAJE</button>
          <button data-panel="modes" class="nav-btn">MODOS DE JUEGO</button>
          <button data-panel="options" class="nav-btn">OPCIONES</button>
          <button data-panel="controls" class="nav-btn">CONTROLES</button>
          <button data-panel="howto" class="nav-btn">CÓMO JUGAR</button>
        </nav>
        <div class="island-row">
          <span>Isla #${g.seed}</span>
          <button id="new-island" class="small-btn">Nueva isla</button>
        </div>
        <div class="net-pill" id="net-pill"></div>
      </div>
      <div class="mm-right"><div id="mm-panel" class="mm-panel"></div></div>`;
    this.root.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.panel)));
    $('new-island').addEventListener('click', () => {
      const q = new URLSearchParams(location.search);
      q.set('seed', Math.floor(Math.random() * 1e9));
      location.search = q.toString();
    });

    $('pause').innerHTML = `
      <div class="menu-card pause-card">
        <div class="logo small">PAUSA</div>
        <div class="pause-online" id="pause-online">Partida online: el juego sigue en marcha mientras estás en pausa.</div>
        <div class="pause-buttons">
          <button id="resume-btn">CONTINUAR</button>
          <button id="pause-options-btn" class="secondary">OPCIONES</button>
          <button id="quit-btn" class="danger">ABANDONAR PARTIDA</button>
        </div>
        <div id="pause-options"></div>
      </div>`;
    $('resume-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.resume();
    });
    $('pause-options-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const box = $('pause-options');
      box.innerHTML = box.innerHTML ? '' : this.optionsHTML();
      if (box.innerHTML) this.bindOptions(box);
    });
    $('quit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.quitToMenu();
    });

    $('end').innerHTML = `
      <div class="menu-card">
        <div id="end-title" class="logo small"></div>
        <div id="end-cause" class="subtitle"></div>
        <div id="end-stats" class="stats-grid"></div>
        <div class="pause-buttons row">
          <button id="again-btn">JUGAR OTRA VEZ</button>
          <button id="menu-btn" class="secondary">MENÚ PRINCIPAL</button>
        </div>
        <div class="end-hint" id="end-hint"></div>
      </div>`;
    $('again-btn').addEventListener('click', () => {
      if (this.endOnline) this.game.quitToMenu();
      else this.game.startMatch(this.s.mode);
    });
    $('menu-btn').addEventListener('click', () => this.game.quitToMenu());
    this.show('play');
  }

  // Indicador de conexión y solicitudes pendientes en el menú.
  updateBadge() {
    const n = this.game.netClient;
    const o = this.online;
    const badge = $('online-badge');
    const pill = $('net-pill');
    if (!badge || !o) return;
    const reqs = n.authed ? o.social.incoming.length : 0;
    badge.textContent = reqs ? String(reqs) : '';
    badge.className = 'badge' + (reqs ? ' on' : n.authed ? ' dot' : '');
    pill.innerHTML = n.authed ? `<span class="dot on"></span> Conectado como <b>${n.user.name}</b>` : '';
  }

  show(panel) {
    this.panel = panel;
    this.root.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.panel === panel));
    const el = $('mm-panel');
    el.classList.remove('wide');
    el.classList.remove('anim');
    void el.offsetWidth;
    el.classList.add('anim');
    if (panel === 'online') return this.online.render(el);
    if (panel === 'locker') return this.renderLocker(el);
    if (panel === 'play') el.innerHTML = this.playHTML();
    else if (panel === 'modes') el.innerHTML = this.modesHTML();
    else if (panel === 'options') el.innerHTML = this.optionsHTML();
    else if (panel === 'controls') {
      const table = (list) => `<table class="ctrl-table">${list.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table>`;
      el.innerHTML = this.game.touch
        ? `<h2>Controles táctiles</h2>${table(TOUCH_CONTROLS)}<h3>Con teclado y ratón</h3>${table(CONTROLS)}`
        : `<h2>Controles</h2>${table(CONTROLS)}`;
    }
    else el.innerHTML = `<h2>Cómo jugar</h2><ol class="howto">${HOWTO.map(([t, d]) => `<li><b>${t}.</b> ${d}</li>`).join('')}</ol>`;
    if (panel === 'play') this.bindPlay(el);
    if (panel === 'modes') this.bindModes(el);
    if (panel === 'options') this.bindOptions(el);
  }

  playHTML() {
    const m = MODES[this.s.mode] || MODES.solo;
    const players = m.noBots ? 1 : m.id === 'duel' ? 2 : this.s.players;
    const teams = m.teams ? '2 equipos' : m.id === 'duel' ? 'contra un bot · primero a 5' : m.teamSize > 1 ? `equipos de ${m.teamSize}` : 'individual';
    return `
      <h2>Jugar contra bots</h2>
      <div class="tip">🌐 ¿Quieres jugar con tus amigos? Entra en <a href="#" data-go="online">ONLINE</a>.</div>
      <div class="mode-hero">
        <div class="mode-icon">${m.icon}</div>
        <div>
          <div class="mode-name">${m.name}</div>
          <div class="mode-desc">${m.desc}</div>
          <div class="mode-meta">${players} jugador${players > 1 ? 'es' : ''} · ${teams}${m.build ? '' : ' · sin construcción'}${m.respawn ? ' · reaparición' : ''}</div>
        </div>
        <button class="small-btn" data-go="modes">Cambiar modo</button>
      </div>
      <div class="opt-row">
        <label>Dificultad de los bots</label>
        <div class="seg" id="diff-seg">${Object.entries(DIFFICULTIES).map(([k, d]) => `<button data-v="${k}" class="${this.s.difficulty === k ? 'on' : ''}">${d.name}</button>`).join('')}</div>
      </div>
      <div class="opt-row ${m.noBots || m.id === 'duel' ? 'disabled' : ''}">
        <label>Jugadores por partida <b id="players-val">${this.s.players}</b></label>
        <input id="players-range" type="range" min="4" max="50" step="2" value="${this.s.players}" ${m.noBots || m.id === 'duel' ? 'disabled' : ''}>
      </div>
      <button id="start-btn" class="big-play">¡A LA ISLA!</button>`;
  }

  bindPlay(el) {
    el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      this.show(b.dataset.go);
    }));
    el.querySelectorAll('#diff-seg button').forEach((b) => b.addEventListener('click', () => {
      this.s.difficulty = b.dataset.v;
      this.game.applySettings();
      this.show('play');
    }));
    const r = el.querySelector('#players-range');
    r.addEventListener('input', () => {
      this.s.players = Number(r.value);
      el.querySelector('#players-val').textContent = r.value;
      this.game.applySettings();
    });
    el.querySelector('#start-btn').addEventListener('click', () => this.game.startMatch(this.s.mode));
  }

  modesHTML() {
    return `<h2>Modos de juego</h2><div class="mode-grid">${Object.values(MODES).map((m) => `
      <button class="mode-card ${this.s.mode === m.id ? 'on' : ''}" data-mode="${m.id}">
        <div class="mode-icon">${m.icon}</div>
        <div class="mode-name">${m.name}</div>
        <div class="mode-desc">${m.desc}</div>
      </button>`).join('')}</div>`;
  }

  bindModes(el) {
    el.querySelectorAll('.mode-card').forEach((b) => b.addEventListener('click', () => {
      this.s.mode = b.dataset.mode;
      this.game.applySettings();
      this.show('play');
    }));
  }

  optionsHTML() {
    const s = this.s;
    const touch = !!this.game.touch;
    const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, label]) => `<button data-v="${v}" class="${String(s[k]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
    const touchHTML = `
      <h3>Móvil y pantalla táctil</h3>
      <div class="opt-row"><label>Controles táctiles</label>${seg('touchControls', [['auto', 'Automático'], ['on', 'Siempre'], ['off', 'Nunca']])}
        <small class="hint" data-hint="touchControls"></small></div>
      ${touch ? `
      <div class="opt-row"><label>Sensibilidad táctil <b data-out="touchSens">${s.touchSens.toFixed(2)}</b></label>
        <input data-k="touchSens" type="range" min="0.3" max="3" step="0.05" value="${s.touchSens}"></div>
      <div class="opt-row"><label>Tamaño de los botones <b data-out="touchSize">${Math.round(s.touchSize * 100)}%</b></label>
        <input data-k="touchSize" type="range" min="0.7" max="1.4" step="0.05" value="${s.touchSize}"></div>
      <div class="opt-row"><label>Opacidad de los botones <b data-out="touchOpacity">${Math.round(s.touchOpacity * 100)}%</b></label>
        <input data-k="touchOpacity" type="range" min="0.3" max="1" step="0.05" value="${s.touchOpacity}"></div>
      <div class="opt-row check"><label><input data-k="vibration" type="checkbox" ${s.vibration ? 'checked' : ''}> Vibración</label></div>
      <div class="opt-row check"><label><input data-k="touchFullscreen" type="checkbox" ${s.touchFullscreen ? 'checked' : ''}> Pantalla completa al jugar (navegador)</label></div>` : ''}`;
    const mobileHTML = `
      <div class="opt-row"><label>Resolución (calidad Móvil) <b data-out="resScale">${s.resScale}%</b></label>
        <input data-k="resScale" type="range" min="40" max="100" step="5" value="${s.resScale}"></div>
      <div class="opt-row check"><label><input data-k="autoRes" type="checkbox" ${s.autoRes ? 'checked' : ''}> Resolución dinámica (baja la resolución si van lentos los FPS)</label></div>`;
    return `
      <h2>Opciones</h2>
      <div class="opt-row"><label>Sensibilidad del ratón <b data-out="sensitivity">${s.sensitivity.toFixed(2)}</b></label>
        <input data-k="sensitivity" type="range" min="0.2" max="3" step="0.05" value="${s.sensitivity}"></div>
      <div class="opt-row"><label>Campo de visión <b data-out="fov">${s.fov}°</b></label>
        <input data-k="fov" type="range" min="65" max="100" step="1" value="${s.fov}"></div>
      <div class="opt-row"><label>Volumen <b data-out="volume">${s.volume}%</b></label>
        <input data-k="volume" type="range" min="0" max="100" step="5" value="${s.volume}"></div>
      <div class="opt-row check"><label><input data-k="invertY" type="checkbox" ${s.invertY ? 'checked' : ''}> Invertir eje vertical</label></div>
      <div class="opt-row check"><label><input data-k="showFps" type="checkbox" ${s.showFps ? 'checked' : ''}> Mostrar FPS</label></div>
      <div class="opt-row"><label>Calidad gráfica</label>
        <div class="seg" data-seg="quality">
          <button data-v="alta" class="${s.quality === 'alta' ? 'on' : ''}">Alta</button>
          <button data-v="normal" class="${s.quality === 'normal' ? 'on' : ''}">Normal</button>
          <button data-v="baja" class="${s.quality === 'baja' ? 'on' : ''}">Baja (PCs modestos)</button>
          <button data-v="movil" class="${s.quality === 'movil' ? 'on' : ''}">Móvil</button>
        </div>
        <small class="hint" data-hint="quality"></small>
      </div>
      ${s.quality === 'movil' ? mobileHTML : ''}
      <div class="opt-row"><label>Límite de FPS</label>${seg('fpsCap', [[0, 'Sin límite'], [30, '30 FPS (ahorra batería)']])}</div>
      ${touchHTML}`;
  }

  bindOptions(el) {
    const s = this.s;
    el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      s[k] = Number(inp.value);
      const out = el.querySelector(`[data-out="${k}"]`);
      const pct = k === 'touchSize' || k === 'touchOpacity';
      if (out) out.textContent = k === 'fov' ? `${s[k]}°` : k === 'volume' || k === 'resScale' ? `${s[k]}%` : pct ? `${Math.round(s[k] * 100)}%` : s[k].toFixed(2);
      this.game.applySettings();
    }));
    el.querySelectorAll('input[type=checkbox]').forEach((inp) => inp.addEventListener('change', () => {
      s[inp.dataset.k] = inp.checked;
      this.game.applySettings();
    }));
    // Ajustes que necesitan recargar la página: calidad y controles táctiles
    for (const k of ['quality', 'touchControls']) {
      el.querySelectorAll(`[data-seg="${k}"] button`).forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (s[k] === b.dataset.v) return;
        s[k] = b.dataset.v;
        this.game.applySettings();
        el.querySelectorAll(`[data-seg="${k}"] button`).forEach((x) => x.classList.toggle('on', x === b));
        const hint = el.querySelector(`[data-hint="${k}"]`);
        hint.innerHTML = 'Se aplicará al recargar. <a href="#" class="reload-now">Recargar ahora</a>';
        hint.querySelector('.reload-now').addEventListener('click', (ev) => {
          ev.preventDefault();
          const q = new URLSearchParams(location.search);
          q.delete('calidad');
          q.set('seed', this.game.seed);
          location.search = q.toString();
        });
      }));
    }
    el.querySelectorAll('[data-seg="fpsCap"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.fpsCap = Number(b.dataset.v);
      this.game.applySettings();
      el.querySelectorAll('[data-seg="fpsCap"] button').forEach((x) => x.classList.toggle('on', x === b));
    }));
  }

  // ---------------------------------------------------------- PERSONAJE
  renderLocker(el) {
    const o = { ...(this.s.outfit || this.game.player.outfit || randomOutfit()) };
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    el.innerHTML = `
      <h2>Personaje</h2>
      <p class="lead">Elige tu aspecto. En las partidas online los demás jugadores te verán así.</p>
      <div class="locker">
        <div class="preview-box" id="preview-box"></div>
        <div class="swatches">${OUTFIT_PARTS.map(([k, label, list]) => `
          <div class="sw-row"><label>${label}</label><div class="sw">${list.map((c) => `<button data-k="${k}" data-c="${c}" class="${o[k] === c ? 'on' : ''}" style="--c:${hex(c)}"></button>`).join('')}</div></div>`).join('')}
          <button class="small-btn" id="outfit-random">🎲 Aleatorio</button>
        </div>
      </div>`;
    el.querySelector('#preview-box').appendChild(this.preview.canvas);
    this.preview.set(o);
    this.preview.start();
    const save = () => {
      this.s.outfit = { ...o };
      this.game.applySettings();
      this.game.player.setOutfit(o);
      this.game.combat.modelKey = null;
      const n = this.game.netClient;
      if (n.authed) {
        n.user.outfit = { ...o };
        n.send('outfit', { outfit: o });
      }
      this.preview.set(o);
    };
    el.querySelectorAll('.sw button').forEach((b) => b.addEventListener('click', () => {
      o[b.dataset.k] = Number(b.dataset.c);
      el.querySelectorAll(`.sw button[data-k="${b.dataset.k}"]`).forEach((x) => x.classList.toggle('on', x === b));
      save();
    }));
    el.querySelector('#outfit-random').addEventListener('click', () => {
      Object.assign(o, randomOutfit());
      save();
      this.renderLocker(el);
    });
  }

  showMain(panel = null) {
    this.hideAll();
    this.root.style.display = 'flex';
    this.show(panel || (this.panel === 'online' ? 'online' : 'play'));
    this.updateBadge();
  }

  hideAll() {
    for (const id of ['main-menu', 'pause', 'end']) $(id).style.display = 'none';
    $('pause-options').innerHTML = '';
  }

  showPause(on) {
    $('pause').style.display = on ? 'flex' : 'none';
    $('pause-online').style.display = this.game.net ? '' : 'none';
    if (!on) $('pause-options').innerHTML = '';
  }

  showEnd(win, cause, stats, online = false) {
    this.endOnline = online;
    $('again-btn').textContent = online ? 'VOLVER AL GRUPO' : 'JUGAR OTRA VEZ';
    $('menu-btn').style.display = online ? 'none' : '';
    $('end-hint').textContent = online ? 'Volverás al lobby online con tu grupo para buscar otra partida.' : '';
    $('end-title').textContent = win ? '¡VICTORIA MAGISTRAL!' : 'ELIMINADO';
    $('end-title').className = 'logo small ' + (win ? 'gold' : 'red');
    const m = this.game.mode;
    $('end-cause').textContent = win ? (m.arena ? '¡Has ganado el 1v1!' : m.respawn ? '¡Tu equipo ha ganado el duelo!' : (m.teamSize || 1) > 1 ? 'Tu equipo es el último en pie' : 'Eres el último superviviente de la isla') : cause;
    $('end-stats').innerHTML = stats;
    $('end').style.display = 'flex';
    $('end').classList.toggle('win', win);
  }
}
