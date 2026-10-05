import * as THREE from 'three';
import { MODES, DIFFICULTIES } from '../game/modes.js';
import { OnlineUI } from './online.js';
import { ProgressionUI } from './progression.js';
import { makeCharacter } from '../game/models.js';
import { ACTIONS, keyName, defaultBinds } from '../core/binds.js';
import { MAP_NAME } from '../world/constants.js';

const $ = (id) => document.getElementById(id);

// Controles fijos (no reasignables); el resto sale de Opciones → Controles.
const FIXED_CONTROLS = [
  ['Ratón', 'Mirar'], ['Rueda', 'Cambiar de objeto · (construyendo) cambiar de pieza'],
  ['Editando: 1–8', 'Piezas reales: puerta, ventana, arco, arco grande, media pared, valla, puerta lateral, ventana doble'],
  ['Esc', 'Pausa · cerrar paneles'], ['Intro', '(online) Chat de la partida · empieza con /e para hablar solo con tu equipo'],
];

const num = (v) => Number(v).toFixed(2);
const pct = (v) => `${v}%`;
const deg = (v) => `${v}°`;
const mult = (v) => `${Number(v).toFixed(2)}×`;
const ms = (v) => `${Math.round(v * 1000)} ms`;
const pct100 = (v) => `${Math.round(v * 100)}%`;
const FMT = { num, pct, pct100, deg, mult, ms };
// Teclas que pueden repetirse sin problema (se usan en contextos distintos).
const SHARED = new Set(['Mouse2', 'Mouse0', 'KeyB']);

const TOUCH_CONTROLS = [
  ['Joystick (izquierda)', 'Moverse · a tope hacia delante: correr · en una escalera: trepar'],
  ['Arrastrar (derecha)', 'Mirar · también arrastrando el botón de disparo'],
  ['◎ Disparar', 'Disparar · usar curas · golpear con el pico · colocar pieza (hay otro a la izquierda)'],
  ['Mira', 'Apuntar (toca para activar/desactivar) · construyendo: cambiar material'],
  ['▲ Saltar', 'Saltar · salir del autobús · abrir el planeador · freno de mano'],
  ['▼', 'Agacharse (activar/desactivar)'], ['↻', 'Recargar'], ['Ladrillos', 'Modo construcción / volver al combate'],
  ['USAR', 'Abrir cofre · recoger · coche · (mantener) reanimar'],
  ['✎', 'Editar la construcción a la que miras (otra vez: confirmar) · Mira: reiniciar'],
  ['🏠', '(creativo) Catálogo de edificios · ↻ girar · ✕ cancelar · doble SALTAR: volar'],
  ['Inventario', 'Toca un hueco para elegir · mantenlo pulsado para soltar el objeto'],
  ['Minimapa', 'Tócalo para abrir el mapa'], ['⏸', 'Pausa'], ['👁', 'Cámara 1ª / 3ª persona'], ['💬', '(online) Chat de la partida'],
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
  ['Isla de Inicio', 'Antes de cada partida apareces en la Isla de Inicio con el resto de jugadores. Practica con las armas de las mesas y construye; cuando estéis todos empieza una cuenta atrás de 10 s y subís al autobús.'],
  ['Salta del autobús', 'Pulsa Espacio (en el móvil, SALTAR) cuando se abran las puertas. Mira hacia abajo y mantén W o el joystick hacia delante para caer más rápido; el planeador se abre solo.'],
  ['Equípate', 'Abre cofres dorados (E) y recoge armas, curas, munición y granadas. El color indica la rareza: gris, verde, azul, morado, naranja, dorado (Mítico) y turquesa (Exótico).'],
  ['Explosivos', 'Granadas, granadas lapa, molotov, humo, C4 y granadas de impulso: clic para lanzar (verás la trayectoria). El C4 se detona con clic derecho (en el móvil, con el botón de apuntar) y el impulso te lanza por los aires sin daño por caída.'],
  ['Consigue materiales', 'Golpea árboles, rocas y coches abandonados con el pico para conseguir madera, piedra y metal.'],
  ['Construye para cubrirte', 'Q entra en modo construcción: muros, suelos, rampas y techos. Clic derecho cambia el material y R gira la pieza.'],
  ['Edita tus piezas', 'Apunta a una construcción de tu equipo y pulsa F: haz clic (o arrastra) sobre las casillas y vuelve a pulsar F. Con 1–8 aplicas piezas reales: puerta (se abre con E), ventana, arco, media pared, valla…'],
  ['Cofres', 'Los cofres no están siempre en el mismo sitio: en cada partida cada cofre tiene una probabilidad de aparecer. ¡Escucha su zumbido!'],
  ['Sube el pase de batalla', 'Cada partida da XP (eliminaciones, daño, cofres, puesto…) y los logros dan más. Cada nivel desbloquea camuflajes, accesorios, skins o tokens para la Tienda.'],
  ['Vigila la tormenta', 'El círculo blanco del mapa (M) es la próxima zona segura. Fuera de ella pierdes vida.'],
  ['Juega en equipo', 'En Dúos y Escuadras, si te derriban arrástrate hacia un compañero. Mantén E para reanimar a los tuyos.'],
  ['Sé el último en pie', 'Elimina al resto de jugadores (o equipos) para conseguir la Victoria Magistral.'],
];

const NEWS = [
  ['Mapa renovado', 'Las carreteras ya no las atraviesan las montañas (firme con pendiente suave, taludes y pasos entre rocas), ríos y lagos en los que se puede nadar y navegar, puentes, dos cuevas iluminadas con antorchas y cristales, dos redes de trincheras con refugios y faroles, y más zonas, más juntas.'],
  ['Más acción', 'Los bots acuden a los tiroteos que oyen a lo lejos, más de ellos aterrizan en zonas con nombre y las dos primeras fases de la tormenta son algo más cortas.'],
  ['Gráficos renovados', 'Materiales PBR con iluminación de entorno, oclusión ambiental (calidad alta), personajes con rodillas y codos, fachadas con textura, asfalto con grietas, césped que se mece, armas detalladas, trazadoras que viajan, casquillos, polvo de impacto y construcciones con relieve.'],
  ['Clima y ciclo de día', 'Cada partida tiene su clima (despejado, nublado, lluvia o niebla) y la hora avanza hasta el anochecer.'],
  ['Tormenta mejorada', 'Fases con tiempos distintos, zona final que se desplaza y ruta a la zona segura en el mapa.'],
  ['Inventario nuevo', 'Tab: arrastra para reordenar o juntar pilas, divide pilas y suelta cantidades de munición y materiales.'],
  ['Taquilla ampliada', 'Picos, planeadores, mochilas, estelas, gestos (tecla N) y pantallas de carga, en el pase y en la tienda.'],
  ['Desafíos', 'Tres desafíos diarios y cuatro semanales con XP y tokens, y estadísticas por modo.'],
  ['PNJ y oro', 'Comerciantes que venden armas por oro, misiones en los pueblos y un jefe en el Castillo Corona con botín mítico.'],
  ['Vehículos', 'Quads, lanchas, gasolina (reposta en las gasolineras) y vehículos que se dañan y explotan.'],
  ['Furgonetas de reaparición', 'En equipos, recoge la tarjeta de un compañero caído y llévala a una furgoneta para que vuelva.'],
  ['Repeticiones y espectador', 'Al terminar: repetición de la partida con cámara libre, espectar en directo y mapa de calor.'],
  ['Modos temporales y Arena', 'Sólo francotiradores, tiroteo de escopetas, lluvia de cohetes, equipos de 20, práctica de edición y Arena con divisiones y Copa semanal.'],
  ['Online', 'Reconexión a la partida (45 s), anti-trampas en el servidor, chat de voz por proximidad, plataformas y puertas sincronizadas y pantalla de emparejamiento.'],
  ['Accesibilidad y mando', 'Modo daltónico, sonidos visualizados y subtítulos, mando con asistencia de apuntado y botones táctiles personalizables.'],
  ['Sonido', 'Música dinámica, sonido 3D (HRTF) y pasos distintos según el suelo.'],
  ['Idiomas', 'Interfaz en español, inglés y portugués.'],
  ['IA más lista', 'Los bots hacen «90s», abren ventanas desde su caja para disparar, celebran con gestos y acuden a tus marcadores.'],
  ['Creativo', 'Códigos para compartir islas y modo foto.'],
];

const NEXT = [
  'Construcciones instanciadas y navegación de los bots en un worker',
  'Sombras en cascada',
  'Bots que conducen vehículos',
  'Torneos online con clasificación entre jugadores',
];

export class Menu {
  constructor(game) {
    this.game = game;
    this.root = $('main-menu');
    this.panel = 'play';
    this.preview = new CharacterPreview();
    this.build();
    this.online = new OnlineUI(game, this);
    this.prog = new ProgressionUI(game, this);
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
        <button class="pass-pill" id="pass-pill" data-panel="pass"></button>
        <nav class="mm-nav">
          <button data-panel="online" class="nav-btn online">🌐 ONLINE <span class="badge" id="online-badge"></span></button>
          <button data-panel="play" class="nav-btn">▶ JUGAR CON BOTS</button>
          <button data-panel="pass" class="nav-btn pass">⭐ PASE DE BATALLA</button>
          <button data-panel="shop" class="nav-btn">🛒 TIENDA</button>
          <button data-panel="locker" class="nav-btn">PERSONAJE</button>
          <button data-panel="modes" class="nav-btn">MODOS DE JUEGO</button>
          <button data-panel="options" class="nav-btn">OPCIONES</button>
          <button data-panel="controls" class="nav-btn">CONTROLES</button>
          <button data-panel="howto" class="nav-btn">CÓMO JUGAR</button>
          <button data-panel="news" class="nav-btn">NOVEDADES</button>
        </nav>
        <div class="island-row">
          <span>🗺️ Mapa: <b>${MAP_NAME}</b> · siempre el mismo</span>
        </div>
        <div class="net-pill" id="net-pill"></div>
      </div>
      <div class="mm-right"><div id="mm-panel" class="mm-panel"></div></div>`;
    this.root.querySelectorAll('.nav-btn, .pass-pill').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.panel)));

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
        <div id="end-xp"></div>
        <div class="pause-buttons row">
          <button id="again-btn">JUGAR OTRA VEZ</button>
          <button id="menu-btn" class="secondary">MENÚ PRINCIPAL</button>
        </div>
        <div class="pause-buttons row">
          <button id="spectate-btn" class="secondary">👁 ESPECTAR</button>
          <button id="replay-btn" class="secondary">🎬 VER REPETICIÓN</button>
          <button id="heat-btn" class="secondary">🗺 MAPA DE CALOR</button>
        </div>
        <div id="heat-box" style="display:none"><canvas id="heat-canvas" width="320" height="320"></canvas>
          <div class="heat-legend"><span><i style="background:#5ad1ff"></i>Aterrizajes</span><span><i style="background:#ff5a4a"></i>Eliminaciones</span></div></div>
        <div class="end-hint" id="end-hint"></div>
      </div>`;
    $('again-btn').addEventListener('click', () => {
      if (this.endOnline) this.game.quitToMenu();
      else this.game.startMatch(this.s.mode);
    });
    $('menu-btn').addEventListener('click', () => this.game.quitToMenu());
    $('spectate-btn').addEventListener('click', () => this.game.viewer.open('live'));
    $('replay-btn').addEventListener('click', () => this.game.viewer.open('replay'));
    $('heat-btn').addEventListener('click', () => {
      const box = $('heat-box');
      box.style.display = box.style.display === 'none' ? '' : 'none';
      if (box.style.display === '') this.drawHeat($('heat-canvas'));
    });
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
    if (panel === 'locker') return this.prog.renderLocker(el);
    if (panel === 'pass') return this.prog.renderPass(el);
    if (panel === 'shop') return this.prog.renderShop(el);
    if (panel === 'play') el.innerHTML = this.playHTML();
    else if (panel === 'modes') el.innerHTML = this.modesHTML();
    else if (panel === 'options') el.innerHTML = this.optionsHTML();
    else if (panel === 'controls') {
      const table = (list) => `<table class="ctrl-table">${list.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table>`;
      el.innerHTML = this.game.touch ? `<h2>Controles táctiles</h2>${table(TOUCH_CONTROLS)}${this.controlsHTML().replace('<h2>Controles</h2>', '<h3>Con teclado y ratón</h3>')}` : this.controlsHTML();
      el.querySelector('[data-go-binds]')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.optTab = 'binds';
        this.show('options');
      });
    }
    else if (panel === 'news') el.innerHTML = `<h2>Novedades</h2><ul class="howto roadmap-list">${NEWS.map(([t, d]) => `<li><b>${t}.</b> ${d}</li>`).join('')}</ul>
      <h2>Próximamente</h2><ul class="howto roadmap-list">${NEXT.map((t) => `<li>${t}</li>`).join('')}</ul>
      <p class="hint">El plan completo está en <code>ROADMAP.md</code>.</p>`;
    else el.innerHTML = `<h2>Cómo jugar</h2><ol class="howto">${HOWTO.map(([t, d]) => `<li><b>${t}.</b> ${d}</li>`).join('')}</ol>`;
    if (panel === 'play') this.bindPlay(el);
    if (panel === 'modes') this.bindModes(el);
    if (panel === 'options') this.bindOptions(el);
  }

  controlsHTML() {
    const b = this.s.binds || defaultBinds();
    const rows = ACTIONS.map((a) => {
      const keys = (b[a.id] || []).filter(Boolean).map((k) => `<kbd>${keyName(k)}</kbd>`).join(' / ') || '<i>sin asignar</i>';
      return `<tr><td>${keys}</td><td>${a.name}</td></tr>`;
    }).join('');
    return `<h2>Controles</h2>
      <p class="lead">Puedes cambiar cualquier tecla en <a href="#" data-go-binds>Opciones → Controles</a>.</p>
      <table class="ctrl-table">${rows}${FIXED_CONTROLS.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table>`;
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
      <button class="mode-card ${this.s.mode === m.id ? 'on' : ''}" data-mode="${m.id}" style="position:relative">
        ${m.ltm ? '<span class="ltm-badge">TEMPORAL</span>' : m.ranked ? '<span class="ltm-badge" style="background:#c99200">CLASIFICATORIA</span>' : ''}
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
    const tab = this.optTab || 'game';
    const tabs = [['game', 'Juego'], ['sens', 'Sensibilidad'], ['build', 'Construcción y edición'], ['binds', 'Controles'], ['hud', 'Interfaz'], ['a11y', 'Accesibilidad'], ['pad', 'Mando'], ['video', 'Vídeo y sonido'], ['mobile', 'Móvil y táctil']];
    const range = (k, label, min, max, step, fmt = (v) => v) =>
      `<div class="opt-row"><label>${label} <b data-out="${k}">${fmt(s[k])}</b></label><input data-k="${k}" data-fmt="${fmt === pct ? 'pct' : fmt === pct100 ? 'pct100' : fmt === deg ? 'deg' : fmt === mult ? 'mult' : fmt === ms ? 'ms' : 'num'}" type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}"></div>`;
    const check = (k, label, hint = '') => `<div class="opt-row check"><label><input data-k="${k}" type="checkbox" ${s[k] ? 'checked' : ''}> ${label}</label>${hint ? `<small class="hint">${hint}</small>` : ''}</div>`;
    let body = '';
    if (tab === 'game') {
      body = `
        ${check('autoPickupWeapons', 'Recoger armas y curas automáticamente', 'Al pasar por encima, si tienes un hueco libre.')}
        ${check('autoSortConsumables', 'Ordenar las curas a la derecha del inventario')}
        ${check('autoReload', 'Recargar automáticamente al vaciar el cargador')}
        ${check('toggleAds', 'Apuntar: alternar (en vez de mantener)')}
        ${check('toggleCrouch', 'Agacharse: alternar (en vez de mantener)')}
        ${check('sprintDefault', 'Correr por defecto (Shift para andar)')}
        ${check('skipLobby', 'Saltar la Isla de Inicio en partidas contra bots')}
        ${check('showHints', 'Mostrar consejos en pantalla')}`;
    } else if (tab === 'sens') {
      body = `
        ${range('sensitivity', 'Sensibilidad del ratón', 0.2, 3, 0.05, num)}
        ${range('adsSensitivity', 'Multiplicador al apuntar', 0.2, 1.5, 0.05, mult)}
        ${range('scopeSensitivity', 'Multiplicador con mira telescópica', 0.2, 1.5, 0.05, mult)}
        ${range('buildSensitivity', 'Multiplicador en modo construcción', 0.2, 2, 0.05, mult)}
        ${range('editSensitivity', 'Multiplicador en modo edición', 0.2, 2, 0.05, mult)}
        ${check('invertY', 'Invertir eje vertical')}`;
    } else if (tab === 'build') {
      body = `
        ${check('turboBuild', 'Construcción turbo', 'Mantén el clic para colocar piezas sin parar.')}
        ${range('turboDelay', 'Retardo de la construcción turbo', 0.03, 0.25, 0.01, ms)}
        ${check('autoMaterial', 'Cambio automático de material', 'Si se acaba el material elegido, usa otro.')}
        ${check('buildPreview', 'Mostrar la silueta de la pieza')}
        ${check('editConfirmOnRelease', 'Confirmar la edición al soltar la tecla de editar')}
        ${check('editDragSelect', 'Seleccionar casillas arrastrando al editar')}`;
    } else if (tab === 'binds') {
      const b = s.binds || defaultBinds();
      const used = new Map();
      for (const a of ACTIONS) for (const k of b[a.id] || []) if (k) used.set(k, (used.get(k) || 0) + 1);
      let last = '';
      const rows = ACTIONS.map((a) => {
        const head = a.group !== last ? `<tr><th colspan="3">${a.group}</th></tr>` : '';
        last = a.group;
        const btn = (i) => {
          const k = b[a.id]?.[i] || '';
          const dup = k && used.get(k) > 1 && !SHARED.has(k) ? ' dup' : '';
          return `<button class="bind-btn${dup}" data-bind="${a.id}" data-i="${i}">${keyName(k)}</button>`;
        };
        return `${head}<tr><td>${a.name}</td><td>${btn(0)}</td><td>${btn(1)}</td></tr>`;
      }).join('');
      body = `<p class="lead">Haz clic en una tecla y pulsa la nueva (o un botón del ratón). Esc borra la asignación. En rojo: teclas repetidas.</p>
        <table class="bind-table">${rows}</table>
        <button class="small-btn" id="binds-reset">Restablecer controles</button>`;
    } else if (tab === 'hud') {
      body = `
        <div class="opt-row"><label>Idioma</label><div class="seg" data-seg="lang">${[['es', 'Español'], ['en', 'English'], ['pt', 'Português']].map(([v, n]) => `<button data-v="${v}" class="${(s.lang || 'es') === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        ${check('damageNumbers', 'Mostrar números de daño')}
        ${range('hudScale', 'Tamaño de la interfaz', 0.7, 1.4, 0.05, mult)}
        <div class="opt-row"><label>Color de la mira</label><input type="color" data-k="crosshairColor" value="${s.crosshairColor || '#ffffff'}"></div>
        ${check('showFps', 'Mostrar FPS')}`;
    } else if (tab === 'pad') {
      const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, label]) => `<button data-v="${v}" class="${String(s[k]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
      const scheme = s.padScheme === 'pro'
        ? 'Combate: RT disparar · LT apuntar · A saltar · B construir · X recargar/usar · Y pico · R3 agacharse · L3 correr.<br>Construcción: <b>RT muro · RB suelo · LT rampa · LB techo</b> · L3 editar.'
        : 'Combate: RT disparar · LT apuntar · LB/RB arma anterior/siguiente · A saltar · B agacharse · X recargar/usar · Y pico · R3 construir · L3 correr.<br>Construcción: RT colocar · LB/RB cambiar pieza · B editar.';
      body = `
        <p class="lead">Conecta un mando (Xbox, PlayStation o compatible) y pulsa cualquier botón. Cruceta: ↑ marcar · ↓ inventario · ← curación rápida · → cámara. Menú: pausa · Vista: mapa.</p>
        <div class="opt-row"><label>Esquema de botones</label>${seg('padScheme', [['clasico', 'Clásico'], ['pro', 'Constructor pro']])}
          <small class="hint">${scheme}</small></div>
        ${range('padSens', 'Sensibilidad del stick', 0.3, 3, 0.05, num)}
        ${check('padAimAssist', 'Asistencia de apuntado', 'Frena la cámara sobre los enemigos y ajusta la mira al apuntar.')}
        ${range('padAssistStrength', 'Intensidad de la asistencia', 0.2, 1.5, 0.05, pct100)}`;
    } else if (tab === 'a11y') {
      const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, label]) => `<button data-v="${v}" class="${String(s[k]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
      body = `
        <div class="opt-row"><label>Modo daltónico</label>${seg('colorblind', [['none', 'Desactivado'], ['protanopia', 'Protanopía'], ['deuteranopia', 'Deuteranopía'], ['tritanopia', 'Tritanopía']])}
          <small class="hint">Corrige los colores para distinguir mejor rarezas, equipos y la tormenta.</small></div>
        ${range('colorblindStrength', 'Intensidad de la corrección', 0.2, 1.5, 0.05, pct100)}
        ${check('soundViz', 'Visualizar efectos de sonido', 'Iconos alrededor de la mira: disparos, explosiones, pasos, cofres, vehículos y planeadores.')}
        ${check('compassSounds', 'Disparos y pasos cercanos en la brújula')}
        ${check('subtitles', 'Subtítulos de los sonidos', 'Por ejemplo: [Disparos cerca a la izquierda].')}`;
    } else if (tab === 'mobile') {
      const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, label]) => `<button data-v="${v}" class="${String(s[k]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
      body = `
        <div class="opt-row"><label>Controles táctiles</label>${seg('touchControls', [['auto', 'Automático'], ['on', 'Siempre'], ['off', 'Nunca']])}
          <small class="hint" data-hint="touchControls"></small></div>
        ${range('touchSens', 'Sensibilidad táctil', 0.3, 3, 0.05, num)}
        ${range('touchSize', 'Tamaño de los botones', 0.7, 1.4, 0.05, pct100)}
        ${range('touchOpacity', 'Opacidad de los botones', 0.3, 1, 0.05, pct100)}
        <div class="opt-row"><label>Disposición de los botones</label><button class="small-btn" id="touch-layout" ${this.game.touch ? '' : 'disabled'}>Personalizar botones</button>
          <small class="hint">${this.game.touch ? 'Arrastra los botones donde quieras y cambia su tamaño.' : 'Disponible con los controles táctiles activos.'}</small></div>
        ${check('vibration', 'Vibración')}
        ${check('touchFullscreen', 'Pantalla completa al jugar (navegador)')}
        ${range('resScale', 'Resolución (calidad Móvil)', 40, 100, 5, pct)}
        ${check('autoRes', 'Resolución dinámica (baja la resolución si van lentos los FPS)')}
        <div class="opt-row"><label>Ahorro de batería</label>${seg('fpsCap', [[0, 'Sin límite'], [30, '30 FPS']])}</div>`;
    } else {
      body = `
        ${range('fov', 'Campo de visión', 65, 100, 1, deg)}
        ${check('weather', 'Clima y ciclo de día en las partidas', 'Lluvia, niebla o nubes y la hora avanzando hasta el anochecer.')}
        ${range('volume', 'Volumen', 0, 100, 5, pct)}
        ${range('music', 'Música dinámica', 0, 100, 5, pct)}
        ${check('voice', 'Chat de voz en partidas online', 'Rivales por proximidad y compañeros siempre. Pide permiso para el micrófono.')}
        <div class="opt-row"><label>Micrófono</label><div class="seg" data-seg="voiceMode"><button data-v="ptt" class="${s.voiceMode !== 'open' ? 'on' : ''}">Pulsar para hablar</button><button data-v="open" class="${s.voiceMode === 'open' ? 'on' : ''}">Abierto</button></div></div>
        ${range('voiceVolume', 'Volumen de la voz', 0, 100, 5, pct)}
        ${check('spatialAudio', 'Sonido 3D (HRTF)', 'Oye de qué dirección vienen los disparos y los pasos (mejor con auriculares).')}
        <div class="opt-row"><label>Límite de FPS</label>
          <select data-k="fpsLimit">${[0, 30, 60, 120, 144, 240].map((v) => `<option value="${v}" ${Number(s.fpsLimit) === v ? 'selected' : ''}>${v ? v + ' FPS' : 'Sin límite'}</option>`).join('')}</select></div>
        <div class="opt-row"><label>Calidad gráfica</label>
          <div class="seg" data-seg="quality">
            <button data-v="alta" class="${s.quality === 'alta' ? 'on' : ''}">Alta</button>
            <button data-v="normal" class="${s.quality === 'normal' ? 'on' : ''}">Normal</button>
            <button data-v="baja" class="${s.quality === 'baja' ? 'on' : ''}">Baja (PCs modestos)</button>
            <button data-v="movil" class="${s.quality === 'movil' ? 'on' : ''}">Móvil</button>
          </div>
          <small class="hint" data-hint="quality"></small>
        </div>`;
    }
    return `
      <h2>Opciones</h2>
      <div class="opt-tabs">${tabs.map(([k, n]) => `<button data-opt-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="opt-body">${body}</div>`;
  }

  bindOptions(el) {
    const s = this.s;
    const rerender = () => {
      el.innerHTML = this.optionsHTML();
      this.bindOptions(el);
    };
    el.querySelectorAll('[data-opt-tab]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.optTab = b.dataset.optTab;
      rerender();
    }));
    el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      s[k] = Number(inp.value);
      const out = el.querySelector(`[data-out="${k}"]`);
      if (out) out.textContent = FMT[inp.dataset.fmt](s[k]);
      this.game.applySettings();
    }));
    el.querySelectorAll('input[type=checkbox]').forEach((inp) => inp.addEventListener('change', () => {
      s[inp.dataset.k] = inp.checked;
      this.game.applySettings();
    }));
    el.querySelectorAll('input[type=color]').forEach((inp) => inp.addEventListener('input', () => {
      s[inp.dataset.k] = inp.value;
      this.game.applySettings();
    }));
    el.querySelectorAll('select[data-k]').forEach((sel) => sel.addEventListener('change', () => {
      s[sel.dataset.k] = Number(sel.value);
      this.game.applySettings();
    }));
    // Reasignar teclas
    el.querySelectorAll('.bind-btn').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      b.classList.add('wait');
      b.textContent = 'Pulsa una tecla…';
      const input = this.game.input;
      // el clic que abre la captura no debe contar como tecla
      setTimeout(() => {
        input.capture = (code) => {
          input.capture = null;
          s.binds[b.dataset.bind][Number(b.dataset.i)] = code || '';
          this.game.applySettings();
          rerender();
        };
      }, 0);
    }));
    el.querySelector('#binds-reset')?.addEventListener('click', (e) => {
      e.stopPropagation();
      s.binds = defaultBinds();
      this.game.applySettings();
      rerender();
    });
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
          location.search = q.toString();
        });
      }));
    }
    el.querySelector('#touch-layout')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const g = this.game;
      if (!g.touch) return;
      const inMenu = g.state === 'menu';
      const ui = inMenu ? $('main-menu') : $('pause');
      ui.style.display = 'none';
      g.touch.editLayout(() => {
        if (inMenu) this.showMain('options');
        else ui.style.display = 'flex';
      });
    });
    el.querySelectorAll('[data-seg="lang"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.lang = b.dataset.v;
      this.game.applySettings();
      rerender();
    }));
    el.querySelectorAll('[data-seg="voiceMode"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.voiceMode = b.dataset.v;
      this.game.applySettings();
      el.querySelectorAll('[data-seg="voiceMode"] button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelectorAll('[data-seg="padScheme"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.padScheme = b.dataset.v;
      this.game.applySettings();
      rerender();
    }));
    el.querySelectorAll('[data-seg="colorblind"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.colorblind = b.dataset.v;
      this.game.applySettings();
      el.querySelector('#touch-layout')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const g = this.game;
      if (!g.touch) return;
      const inMenu = g.state === 'menu';
      const ui = inMenu ? $('main-menu') : $('pause');
      ui.style.display = 'none';
      g.touch.editLayout(() => {
        if (inMenu) this.showMain('options');
        else ui.style.display = 'flex';
      });
    });
    el.querySelectorAll('[data-seg="padScheme"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.padScheme = b.dataset.v;
      this.game.applySettings();
      rerender();
    }));
    el.querySelectorAll('[data-seg="colorblind"] button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelectorAll('[data-seg="fpsCap"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.fpsCap = Number(b.dataset.v);
      this.game.applySettings();
      el.querySelector('#touch-layout')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const g = this.game;
      if (!g.touch) return;
      const inMenu = g.state === 'menu';
      const ui = inMenu ? $('main-menu') : $('pause');
      ui.style.display = 'none';
      g.touch.editLayout(() => {
        if (inMenu) this.showMain('options');
        else ui.style.display = 'flex';
      });
    });
    el.querySelectorAll('[data-seg="padScheme"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.padScheme = b.dataset.v;
      this.game.applySettings();
      rerender();
    }));
    el.querySelectorAll('[data-seg="colorblind"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.colorblind = b.dataset.v;
      this.game.applySettings();
      el.querySelector('#touch-layout')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const g = this.game;
      if (!g.touch) return;
      const inMenu = g.state === 'menu';
      const ui = inMenu ? $('main-menu') : $('pause');
      ui.style.display = 'none';
      g.touch.editLayout(() => {
        if (inMenu) this.showMain('options');
        else ui.style.display = 'flex';
      });
    });
    el.querySelectorAll('[data-seg="padScheme"] button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.padScheme = b.dataset.v;
      this.game.applySettings();
      rerender();
    }));
    el.querySelectorAll('[data-seg="colorblind"] button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelectorAll('[data-seg="fpsCap"] button').forEach((x) => x.classList.toggle('on', x === b));
    }));
  }

  showMain(panel = null) {
    this.hideAll();
    this.root.style.display = 'flex';
    this.show(panel || (this.panel === 'online' ? 'online' : 'play'));
    this.updateBadge();
    this.prog.updatePill();
  }

  // Mapa de calor de la partida: aterrizajes (azul) y eliminaciones (rojo).
  drawHeat(cv) {
    const g = this.game;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.drawImage(g.mapRenderer.base, 0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);
    const toPx = (x, z) => [((x + 800) / 1600) * w, ((z + 800) / 1600) * h];
    ctx.globalCompositeOperation = 'lighter';
    const blob = (x, z, col, r) => {
      const [px, py] = toPx(x, z);
      const gr = ctx.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    };
    for (const [x, z] of g.heat.land) blob(x, z, 'rgba(90,209,255,0.55)', 16);
    for (const [x, z] of g.heat.elim) blob(x, z, 'rgba(255,90,74,0.7)', 12);
    ctx.globalCompositeOperation = 'source-over';
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

  showEnd(win, cause, stats, online = false, xp = null) {
    $('end-xp').innerHTML = this.prog.endHTML(xp);
    this.endOnline = online;
    $('again-btn').textContent = online ? 'VOLVER AL GRUPO' : 'JUGAR OTRA VEZ';
    $('menu-btn').style.display = online ? 'none' : '';
    $('end-hint').textContent = online ? 'Volverás al lobby online con tu grupo para buscar otra partida.' : '';
    $('end-title').textContent = win ? '¡VICTORIA MAGISTRAL!' : 'ELIMINADO';
    $('end-title').className = 'logo small ' + (win ? 'gold' : 'red');
    const m = this.game.mode;
    $('end-cause').textContent = win ? (m.arena ? '¡Has ganado el 1v1!' : m.respawn ? '¡Tu equipo ha ganado el duelo!' : (m.teamSize || 1) > 1 ? 'Tu equipo es el último en pie' : 'Eres el último superviviente de la isla') : cause;
    $('end-stats').innerHTML = stats;
    const g = this.game;
    $('replay-btn').style.display = g.replay.available ? '' : 'none';
    $('heat-btn').style.display = g.heat && (g.heat.land.length || g.heat.elim.length) ? '' : 'none';
    $('heat-box').style.display = 'none';
    $('spectate-btn').style.display = !win && g.chars.some((c) => c.alive && c !== g.player) ? '' : 'none';
    $('end').style.display = 'flex';
    $('end').classList.toggle('win', win);
  }
}
