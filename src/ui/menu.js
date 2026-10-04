import { MODES, DIFFICULTIES } from '../game/modes.js';

const $ = (id) => document.getElementById(id);

const CONTROLS = [
  ['W A S D', 'Moverse'], ['Ratón', 'Mirar'], ['Clic izquierdo', 'Disparar · usar · golpear · colocar pieza'],
  ['Clic derecho', 'Apuntar · (construyendo) cambiar material'], ['Espacio', 'Saltar · salir del bus · planeador · freno de mano'],
  ['Shift', 'Correr'], ['C', 'Agacharse'], ['E', 'Abrir cofre · recoger · coche · (mantener) reanimar'],
  ['R', 'Recargar'], ['1–6 / rueda', 'Inventario · (construyendo) 1–4 pieza'], ['Q', 'Modo construcción'],
  ['G', 'Soltar objeto'], ['V', 'Cámara 1ª / 3ª persona'], ['M', 'Mapa'], ['Esc', 'Pausa'],
];

const HOWTO = [
  ['Salta del autobús', 'Pulsa Espacio cuando se abran las puertas. Mira hacia abajo y mantén W para caer más rápido; el planeador se abre solo.'],
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
    this.build();
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
          <button data-panel="play" class="nav-btn">▶ JUGAR</button>
          <button data-panel="modes" class="nav-btn">MODOS DE JUEGO</button>
          <button data-panel="options" class="nav-btn">OPCIONES</button>
          <button data-panel="controls" class="nav-btn">CONTROLES</button>
          <button data-panel="howto" class="nav-btn">CÓMO JUGAR</button>
        </nav>
        <div class="island-row">
          <span>Isla #${g.seed}</span>
          <button id="new-island" class="small-btn">Nueva isla</button>
        </div>
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
      </div>`;
    $('again-btn').addEventListener('click', () => this.game.startMatch(this.s.mode));
    $('menu-btn').addEventListener('click', () => this.game.quitToMenu());
    this.show('play');
  }

  show(panel) {
    this.panel = panel;
    this.root.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.panel === panel));
    const el = $('mm-panel');
    if (panel === 'play') el.innerHTML = this.playHTML();
    else if (panel === 'modes') el.innerHTML = this.modesHTML();
    else if (panel === 'options') el.innerHTML = this.optionsHTML();
    else if (panel === 'controls') el.innerHTML = `<h2>Controles</h2><table class="ctrl-table">${CONTROLS.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table>`;
    else el.innerHTML = `<h2>Cómo jugar</h2><ol class="howto">${HOWTO.map(([t, d]) => `<li><b>${t}.</b> ${d}</li>`).join('')}</ol>`;
    if (panel === 'play') this.bindPlay(el);
    if (panel === 'modes') this.bindModes(el);
    if (panel === 'options') this.bindOptions(el);
  }

  playHTML() {
    const m = MODES[this.s.mode] || MODES.solo;
    const players = m.noBots ? 1 : this.s.players;
    const teams = m.teams ? '2 equipos' : m.teamSize > 1 ? `equipos de ${m.teamSize}` : 'individual';
    return `
      <h2>Jugar</h2>
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
      <div class="opt-row ${m.noBots ? 'disabled' : ''}">
        <label>Jugadores por partida <b id="players-val">${this.s.players}</b></label>
        <input id="players-range" type="range" min="4" max="50" step="2" value="${this.s.players}" ${m.noBots ? 'disabled' : ''}>
      </div>
      <button id="start-btn" class="big-play">¡A LA ISLA!</button>`;
  }

  bindPlay(el) {
    el.querySelector('[data-go]').addEventListener('click', () => this.show('modes'));
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
          <button data-v="normal" class="${s.quality !== 'baja' ? 'on' : ''}">Normal</button>
          <button data-v="baja" class="${s.quality === 'baja' ? 'on' : ''}">Baja (PCs modestos)</button>
        </div>
        <small class="hint" id="quality-hint"></small>
      </div>`;
  }

  bindOptions(el) {
    const s = this.s;
    el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      s[k] = Number(inp.value);
      const out = el.querySelector(`[data-out="${k}"]`);
      if (out) out.textContent = k === 'fov' ? `${s[k]}°` : k === 'volume' ? `${s[k]}%` : s[k].toFixed(2);
      this.game.applySettings();
    }));
    el.querySelectorAll('input[type=checkbox]').forEach((inp) => inp.addEventListener('change', () => {
      s[inp.dataset.k] = inp.checked;
      this.game.applySettings();
    }));
    el.querySelectorAll('[data-seg="quality"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (s.quality === b.dataset.v) return;
      s.quality = b.dataset.v;
      this.game.applySettings();
      el.querySelectorAll('[data-seg="quality"] button').forEach((x) => x.classList.toggle('on', x === b));
      const hint = el.querySelector('#quality-hint');
      hint.innerHTML = 'Se aplicará al recargar. <a href="#" id="reload-now">Recargar ahora</a>';
      hint.querySelector('#reload-now').addEventListener('click', (ev) => {
        ev.preventDefault();
        const q = new URLSearchParams(location.search);
        q.delete('calidad');
        q.set('seed', this.game.seed);
        location.search = q.toString();
      });
    }));
  }

  showMain() {
    this.hideAll();
    this.root.style.display = 'flex';
    this.show('play');
  }

  hideAll() {
    for (const id of ['main-menu', 'pause', 'end']) $(id).style.display = 'none';
    $('pause-options').innerHTML = '';
  }

  showPause(on) {
    $('pause').style.display = on ? 'flex' : 'none';
    if (!on) $('pause-options').innerHTML = '';
  }

  showEnd(win, cause, stats) {
    $('end-title').textContent = win ? '¡VICTORIA MAGISTRAL!' : 'ELIMINADO';
    $('end-title').className = 'logo small ' + (win ? 'gold' : 'red');
    $('end-cause').textContent = win ? (this.game.mode.respawn ? '¡Tu equipo ha ganado el duelo!' : 'Eres el último superviviente de la isla') : cause;
    $('end-stats').innerHTML = stats;
    $('end').style.display = 'flex';
    $('end').classList.toggle('win', win);
  }
}
