import { MODES, DIFFICULTIES, partyLimit } from '../game/modes.js';
import { serverUrl, needsServerAddress } from '../net/client.js';
import { scanLan, canScan } from '../net/discover.js';

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hex = (n) => '#' + (n ?? 0x888888).toString(16).padStart(6, '0');
const ONLINE_MODES = Object.values(MODES).filter((m) => m.online);
const ST_DOT = { menu: 'on', party: 'on', queue: 'busy', match: 'busy', offline: 'off' };

function avatar(outfit, size = 40) {
  const o = outfit || {};
  return `<span class="avatar" style="--s:${size}px;--skin:${hex(o.skin ?? 0xe0b48a)};--shirt:${hex(o.shirt ?? 0x2f6fd6)};--hair:${hex(o.hair ?? 0x3a2a1a)}"><i class="hair"></i><i class="face"></i><i class="body"></i></span>`;
}

// Interfaz del modo online: sesión, grupo, emparejamiento, amigos y chat.
export class OnlineUI {
  constructor(game, menu) {
    this.game = game;
    this.menu = menu;
    this.net = game.netClient;
    this.social = { friends: [], incoming: [], outgoing: [], online: 0 };
    this.party = null;
    this.partyChat = [];
    this.tab = 'login';
    this.error = '';
    this.busy = false;
    this.editServer = false;
    this.chatOpen = false;

    this.notify = document.createElement('div');
    this.notify.id = 'notify';
    document.body.appendChild(this.notify);
    this.chatBox = document.createElement('div');
    this.chatBox.id = 'match-chat';
    this.chatBox.innerHTML = '<div class="lines"></div><input maxlength="160" placeholder="Escribe y pulsa Intro · Esc para cancelar">';
    document.body.appendChild(this.chatBox);
    this.chatLines = this.chatBox.querySelector('.lines');
    this.chatInput = this.chatBox.querySelector('input');
    this.bindNet();
    this.bindChat();

    // Reconexión automática si hay sesión guardada
    const params = new URLSearchParams(location.search);
    if (this.net.token) this.connect();
    this.autoOpen = params.get('online') === '1';
    this.autoJoin = params.get('join');
  }

  get authed() {
    return this.net.authed;
  }

  get url() {
    return serverUrl(this.game.settings.server);
  }

  connect() {
    if (this.url) this.net.connect(this.url);
  }

  // Guarda la dirección del servidor y se conecta a él.
  setServer(addr) {
    this.game.settings.server = String(addr || '').trim();
    this.game.applySettings();
    this.editServer = false;
    this.error = '';
    this.net.close();
    this.net.url = this.url;
    if (this.net.token) this.connect();
  }

  // «Buscar en mi Wi-Fi»: encuentra el servidor de un amigo en la red local.
  startScan() {
    if (this.scan) return;
    const hints = [this.game.settings.server, location.hostname];
    const job = scanLan({
      hints,
      onProgress: (done, total, net) => {
        this.scanText = `Buscando en ${net}.x … ${Math.round((done / total) * 100)}%`;
        const el = document.getElementById('ol-scan-status');
        if (el) el.textContent = this.scanText;
      },
    });
    this.scan = job;
    this.scanFound = null;
    this.scanText = 'Buscando…';
    this.refresh();
    job.promise.then((found) => {
      if (this.scan !== job) return;
      this.scan = null;
      this.scanFound = found;
      if (found.length === 1) {
        this.setServer(found[0].host);
        this.toast(`Servidor encontrado: ${found[0].host}`);
      }
      this.refresh();
    });
  }

  stopScan() {
    this.scan?.stop();
    this.scan = null;
    this.scanText = '';
    this.refresh();
  }

  serverSetupHTML() {
    const s = this.game.settings.server;
    const scanning = !!this.scan;
    const found = this.scanFound;
    return `
      <form id="ol-server" class="server-form">
        <input name="server" value="${esc(s)}" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"
          placeholder="${needsServerAddress() ? 'ej. 192.168.1.20:8080 o mi-isla.onrender.com' : 'Vacío = este mismo servidor · ej. 192.168.1.20:8080 o mi-isla.onrender.com'}">
        <button class="small-btn" type="submit">Guardar</button>
      </form>
      ${canScan() ? `<div class="scan-row">
        ${scanning ? `<div class="spinner small"></div><span id="ol-scan-status">${esc(this.scanText)}</span><button class="small-btn" id="ol-scan-stop" type="button">Parar</button>`
          : `<button class="small-btn ok" id="ol-scan" type="button">🔍 Buscar en mi Wi-Fi</button>`}
      </div>` : ''}
      ${found && !scanning ? (found.length ? `<div class="scan-found">${found.map((f) => `<button class="small-btn" data-server="${esc(f.host)}">${esc(f.host)} · ${f.online} conectado${f.online === 1 ? '' : 's'}</button>`).join('')}</div>`
        : '<div class="form-error">No se ha encontrado ningún servidor en esta Wi-Fi. Comprueba que tu amigo tiene el servidor en marcha (npm run dev) y que estáis en la misma red; si no, escribe la dirección que le sale en la terminal.</div>') : ''}
      <small class="hint">Para jugar con un amigo de PC: él arranca el juego con <b>npm run dev</b> (o <b>npm start</b>) y en su terminal y en su pantalla ONLINE aparece la dirección (por ejemplo <code>192.168.1.20:8080</code>). Todos tenéis que usar el mismo servidor.</small>`;
  }

  // ------------------------------------------------------------ RED
  bindNet() {
    const n = this.net;
    n.on('status', () => this.refresh());
    n.on('neterror', (text) => {
      this.error = text;
      this.busy = false;
      this.refresh();
    });
    n.on('auth_ok', (m) => {
      this.busy = false;
      this.error = '';
      // Aspecto: el del servidor manda; si no tiene, se sube el local
      if (m.outfit) {
        this.game.settings.outfit = m.outfit;
        this.game.applySettings();
        this.game.player.setOutfit(m.outfit);
      } else if (this.game.settings.outfit) n.send('outfit', { outfit: this.game.settings.outfit });
      if (this.autoJoin) {
        n.send('party_join', { id: this.autoJoin });
        this.autoJoin = null;
      }
      if (this.autoOpen && this.game.state === 'menu') this.menu.show('online');
      this.autoOpen = false;
      this.cleanUrl();
      this.refresh();
      this.menu.updateBadge();
    });
    n.on('auth_err', (m) => {
      this.busy = false;
      this.error = m.resume ? '' : m.text;
      this.refresh();
    });
    n.on('disconnected', ({ wasAuthed }) => {
      if (wasAuthed) this.toast('Conexión perdida con el servidor. Reintentando…', 'warn');
      this.party = null;
      this.refresh();
      this.menu.updateBadge();
    });
    n.on('kicked', (m) => this.toast(m.text, 'warn'));
    n.on('social', (m) => {
      this.social = m;
      this.refresh();
      this.menu.updateBadge();
    });
    n.on('party', (m) => {
      const wasQueued = this.party?.queued;
      this.party = m;
      if (!wasQueued && m.queued) this.game.audio.init();
      this.refresh();
    });
    n.on('invite', (m) => this.showInvite(m));
    n.on('notice', (m) => this.toast(m.text));
    n.on('error', (m) => this.toast(m.text, 'warn'));
    n.on('stats', () => this.refresh());
    n.on('chat', (m) => this.onChat(m));
    n.on('m.start', (m) => {
      this.notify.querySelectorAll('.invite').forEach((el) => el.remove());
      if (this.game.state === 'playing' && !this.game.net) this.toast('Tu grupo ha encontrado partida online');
      this.matchChat = [];
      this.chatLines.innerHTML = '';
      this.game.startOnline(m);
    });
  }

  cleanUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.has('online') && !q.has('join')) return;
    q.delete('online');
    q.delete('join');
    const s = q.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }

  // ------------------------------------------------------------ AVISOS
  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'note ' + kind;
    el.textContent = text;
    this.notify.prepend(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4700);
  }

  showInvite(m) {
    this.notify.querySelector(`[data-invite="${CSS.escape(m.id)}"]`)?.remove();
    const el = document.createElement('div');
    el.className = 'note invite';
    el.dataset.invite = m.id;
    el.innerHTML = `<div>🎮 <b>${esc(m.from)}</b> te invita a su grupo<br><small>${esc(MODES[m.mode]?.name || '')}</small></div>
      <div class="note-btns"><button class="ok">Unirme</button><button class="no">✕</button></div>`;
    el.querySelector('.ok').addEventListener('click', () => {
      el.remove();
      if (this.net.seed && this.net.seed !== this.game.seed) {
        // Hay que estar en la isla online: recargar y unirse al volver
        const q = new URLSearchParams(location.search);
        q.set('seed', this.net.seed);
        q.set('online', '1');
        q.set('join', m.id);
        location.search = q.toString();
        return;
      }
      this.net.send('party_join', { id: m.id });
      if (this.game.state === 'menu') this.menu.show('online');
    });
    el.querySelector('.no').addEventListener('click', () => {
      el.remove();
      this.net.send('party_decline', { id: m.id });
    });
    this.notify.prepend(el);
    this.game.audio.init();
    this.game.audio.pickup?.();
    setTimeout(() => el.remove(), 60000);
  }

  // ------------------------------------------------------------ CHAT
  onChat(m) {
    if (m.scope === 'party') {
      this.partyChat.push(m);
      if (this.partyChat.length > 60) this.partyChat.shift();
      const box = $('ol-chat-lines');
      if (box) {
        box.insertAdjacentHTML('beforeend', this.chatLineHTML(m));
        box.scrollTop = box.scrollHeight;
      }
      if (this.game.state === 'playing' && !m.system) this.addMatchLine(`<span class="who party">[Grupo] ${esc(m.from)}:</span> ${esc(m.text)}`);
      return;
    }
    const mine = m.team === this.game.player.team;
    this.addMatchLine(`<span class="who ${mine ? 'ally' : 'enemy'}">${m.teamOnly ? '[Equipo] ' : ''}${esc(m.from)}:</span> ${esc(m.text)}`);
  }

  chatLineHTML(m) {
    if (m.system) return `<div class="sys">${esc(m.text)}</div>`;
    return `<div><b>${esc(m.from)}:</b> ${esc(m.text)}</div>`;
  }

  addMatchLine(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    this.chatLines.appendChild(el);
    while (this.chatLines.children.length > 8) this.chatLines.firstChild.remove();
    this.chatBox.classList.add('active');
    clearTimeout(this.chatFade);
    this.chatFade = setTimeout(() => !this.chatOpen && this.chatBox.classList.remove('active'), 8000);
  }

  bindChat() {
    addEventListener('keydown', (e) => {
      const g = this.game;
      if ((e.code !== 'Enter' && e.key !== 'Enter') || this.chatOpen || g.state !== 'playing' || !g.net || g.paused) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      e.preventDefault();
      this.openChat();
    });
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      // Los teclados de Android a veces no rellenan e.code: se mira también e.key
      if (e.code === 'Enter' || e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text) {
          const team = text.startsWith('/e ');
          this.net.send('chat', { scope: 'match', text: team ? text.slice(3) : text, team });
        }
        this.closeChat();
      } else if (e.code === 'Escape') this.closeChat();
    });
    this.chatInput.addEventListener('keyup', (e) => e.stopPropagation());
    // En el móvil, cerrar el teclado cancela el chat
    this.chatInput.addEventListener('blur', () => this.chatOpen && this.closeChat());
  }

  openChat() {
    this.chatOpen = true;
    this.game.chatOpen = true;
    this.chatBox.classList.add('active', 'typing');
    this.game.input.unlock();
    this.chatInput.value = '';
    setTimeout(() => this.chatInput.focus(), 0);
  }

  closeChat() {
    this.chatOpen = false;
    this.chatBox.classList.remove('typing');
    this.chatInput.blur();
    this.game.input.lock();
    setTimeout(() => (this.game.chatOpen = false), 300);
    clearTimeout(this.chatFade);
    this.chatFade = setTimeout(() => this.chatBox.classList.remove('active'), 5000);
  }

  // ------------------------------------------------------------ PANEL
  refresh() {
    if (this.menu.panel !== 'online' || this.game.state !== 'menu') return;
    if (this.typing()) {
      this.dirty = true;
      return;
    }
    this.render($('mm-panel'));
  }

  // Mientras se escribe no se redibuja el panel (se perdería el foco).
  typing() {
    const a = document.activeElement;
    return !!a && a.tagName === 'INPUT' && a.type !== 'checkbox' && !!a.closest('#mm-panel');
  }

  render(el) {
    if (!el) return;
    this.dirty = false;
    if (!el.dataset.olBound) {
      el.dataset.olBound = '1';
      el.addEventListener('focusout', () => setTimeout(() => this.dirty && this.refresh(), 0));
    }
    const scroll = el.querySelector('.ol-side')?.scrollTop || 0;
    el.classList.toggle('wide', this.authed);
    el.innerHTML = this.authed ? this.hubHTML() : this.loginHTML();
    if (this.authed) this.bindHub(el);
    else this.bindLogin(el);
    const side = el.querySelector('.ol-side');
    if (side) side.scrollTop = scroll;
    const chat = $('ol-chat-lines');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  loginHTML() {
    const st = this.net.state;
    const status = st === 'online' ? '<span class="dot on"></span> Conectado al servidor'
      : st === 'connecting' ? '<span class="dot busy"></span> Conectando…' : '<span class="dot off"></span> Sin conexión';
    return `
      <h2>Jugar online</h2>
      <p class="lead">Crea una cuenta, añade a tus amigos y jugad juntos: <b>1v1</b>, <b>Dúos</b>, <b>Tríos</b>, <b>Escuadras</b> y más. PC y móvil juegan juntos.</p>
      ${!this.url ? '<div class="tip">📱 Primero indica el <b>servidor</b> (abajo): pulsa <b>Buscar en mi Wi-Fi</b> o escribe la dirección que le sale a tu amigo en el PC.</div>' : ''}
      <div class="tabs">
        <button data-tab="login" class="${this.tab === 'login' ? 'on' : ''}">Entrar</button>
        <button data-tab="register" class="${this.tab === 'register' ? 'on' : ''}">Crear cuenta</button>
      </div>
      <form id="ol-auth" class="auth-form" autocomplete="on">
        <label>Nombre de jugador<input name="name" maxlength="16" autocomplete="username" required placeholder="3-16 letras o números"></label>
        <label>Contraseña<input name="pass" type="password" maxlength="64" autocomplete="${this.tab === 'login' ? 'current-password' : 'new-password'}" required placeholder="Mínimo 4 caracteres"></label>
        ${this.error ? `<div class="form-error">${esc(this.error)}</div>` : ''}
        <button class="big-play" type="submit" ${this.busy ? 'disabled' : ''}>${this.busy ? 'CONECTANDO…' : this.tab === 'login' ? 'ENTRAR' : 'CREAR CUENTA'}</button>
      </form>
      <div class="server-row">
        <div>${status}<br><small>Servidor: <code>${this.url ? esc(this.url) : 'sin configurar'}</code></small></div>
        <button class="small-btn" id="ol-server-btn">Cambiar servidor</button>
      </div>
      ${this.editServer || !this.url ? this.serverSetupHTML() : ''}`;
  }

  bindLogin(el) {
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab;
      this.error = '';
      this.render(el);
    }));
    el.querySelector('#ol-auth').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (!this.url) {
        this.error = 'Primero indica la dirección del servidor (o pulsa Buscar en mi Wi-Fi).';
        this.render(el);
        return;
      }
      this.error = '';
      this.busy = true;
      this.net.url = this.url;
      this.net.auth(this.tab, String(f.get('name')).trim(), String(f.get('pass')));
      this.render(el);
      setTimeout(() => {
        if (this.busy && !this.authed) {
          this.busy = false;
          this.error = this.error || 'El servidor no responde. ¿Está en marcha? (npm run dev o npm start)';
          this.refresh();
        }
      }, 6000);
    });
    el.querySelector('#ol-server-btn').addEventListener('click', () => {
      this.editServer = !this.editServer;
      this.render(el);
    });
    el.querySelector('#ol-server')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.setServer(new FormData(e.target).get('server'));
      this.render(el);
    });
    el.querySelector('#ol-scan')?.addEventListener('click', () => this.startScan());
    el.querySelector('#ol-scan-stop')?.addEventListener('click', () => this.stopScan());
    el.querySelectorAll('[data-server]').forEach((b) => b.addEventListener('click', () => {
      this.setServer(b.dataset.server);
      this.scanFound = null;
      this.render(el);
    }));
  }

  hubHTML() {
    const u = this.net.user;
    const p = this.party;
    const st = u.stats || { matches: 0, wins: 0, kills: 0 };
    const me = u.name.toLowerCase();
    const leader = p && p.leader.toLowerCase() === me;
    const mode = MODES[p?.mode] || MODES.duos;
    const lim = partyLimit(mode);
    const wrongIsland = this.net.seed && this.net.seed !== this.game.seed;
    const slots = [];
    const members = p?.members || [{ name: u.name, outfit: u.outfit, leader: true }];
    for (let i = 0; i < 4; i++) {
      const m = members[i];
      if (m) {
        slots.push(`<div class="slot-card ${m.name.toLowerCase() === me ? 'me' : ''}">
          ${avatar(m.outfit, 46)}<div class="sc-name">${m.leader ? '<span title="Líder">👑</span> ' : ''}${esc(m.name)}</div>
          ${leader && !m.leader ? `<button class="x" data-kick="${esc(m.name)}" title="Expulsar">✕</button>` : ''}</div>`);
      } else {
        slots.push(`<div class="slot-card empty ${i >= lim ? 'over' : ''}"><span class="plus">+</span><div class="sc-name">${i >= lim ? 'No cabe' : 'Invitar'}</div></div>`);
      }
    }
    const queued = p?.queued;
    const t = p?.queuedFor || 0;
    let action;
    if (wrongIsland) {
      action = `<div class="island-warn">Estás en otra isla (#${this.game.seed}). La isla online es la <b>#${this.net.seed}</b>.
        <button class="small-btn" id="ol-load-island">Cargar la isla online</button></div>`;
    } else if (p?.inMatch) {
      action = '<button class="big-play" disabled>TU GRUPO ESTÁ EN PARTIDA</button>';
    } else if (queued) {
      action = `<div class="queue-box"><div class="spinner"></div><div><b>Buscando partida de ${esc(mode.name)}…</b><br><small>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · ${p.bots && mode.id !== 'duel' ? 'si no hay más jugadores se rellena con bots' : mode.id === 'duel' && p.bots ? 'si nadie aparece, jugarás contra un bot' : 'esperando a más jugadores'}</small></div>
        ${leader ? '<button class="small-btn" id="ol-cancel">Cancelar</button>' : ''}</div>`;
    } else if (leader) {
      const tooMany = members.length > lim;
      action = `<button class="big-play" id="ol-queue" ${tooMany ? 'disabled' : ''}>${tooMany ? `MÁXIMO ${lim} EN ${esc(mode.name.toUpperCase())}` : mode.id === 'duel' && members.length === 2 ? '¡1v1 CONTRA TU AMIGO!' : 'BUSCAR PARTIDA'}</button>`;
    } else {
      action = `<button class="big-play" disabled>ESPERANDO AL LÍDER (${esc(p?.leader || '')})</button>`;
    }
    return `
      <div class="ol-grid">
        <section class="ol-main">
          <div class="ol-head">
            ${avatar(u.outfit, 52)}
            <div class="who"><div class="nm">${esc(u.name)}</div>
              <div class="st"><span title="Victorias">🏆 ${st.wins}</span><span title="Eliminaciones">💀 ${st.kills}</span><span title="Partidas">🎮 ${st.matches}</span><span title="Ping">📶 ${this.net.ping || '–'} ms</span></div></div>
            <button class="small-btn" id="ol-logout">Cerrar sesión</button>
          </div>
          <h3>Tu grupo <small>${members.length}/${lim}</small>${members.length > 1 ? '<button class="link" id="ol-leave">Salir del grupo</button>' : ''}</h3>
          <div class="party-slots">${slots.join('')}</div>
          <h3>Modo de juego ${leader ? '' : '<small>(lo elige el líder)</small>'}</h3>
          <div class="ol-modes">${ONLINE_MODES.map((m) => `
            <button class="ol-mode ${p?.mode === m.id ? 'on' : ''}" data-mode="${m.id}" ${leader && !queued ? '' : 'disabled'}>
              <span class="mi">${m.icon}</span><span class="mn">${m.name}</span>
              <span class="ms">${m.id === 'duel' ? '1 contra 1' : m.teams ? `${m.maxPlayers / 2} vs ${m.maxPlayers / 2}` : m.teamSize > 1 ? `Equipos de ${m.teamSize}` : 'Individual'}</span>
            </button>`).join('')}</div>
          <div class="mode-desc ol-desc">${esc(mode.desc)}</div>
          <div class="ol-opts">
            <label class="toggle ${leader && !queued ? '' : 'disabled'}"><input type="checkbox" id="ol-bots" ${p?.bots ? 'checked' : ''} ${leader && !queued ? '' : 'disabled'}><span></span> Rellenar con bots</label>
            <div class="seg small" id="ol-diff">${Object.entries(DIFFICULTIES).map(([k, d]) => `<button data-v="${k}" class="${p?.difficulty === k ? 'on' : ''}" ${leader && !queued ? '' : 'disabled'}>${d.name}</button>`).join('')}</div>
          </div>
          ${action}
          <div class="ol-chat">
            <div class="lines" id="ol-chat-lines">${this.partyChat.map((m) => this.chatLineHTML(m)).join('') || '<div class="sys">Chat del grupo: escribe para hablar con tu grupo.</div>'}</div>
            <form id="ol-chat-form"><input maxlength="160" placeholder="Mensaje para el grupo…"><button class="small-btn">Enviar</button></form>
          </div>
        </section>
        <aside class="ol-side">
          <h3>Amigos <small>${this.social.friends.filter((f) => f.status !== 'offline').length} conectados</small></h3>
          <form id="ol-add" class="add-friend"><input maxlength="16" placeholder="Nombre de tu amigo"><button class="small-btn">Añadir</button></form>
          ${this.social.incoming.length ? `<div class="req-title">Solicitudes recibidas</div>${this.social.incoming.map((n) => `
            <div class="friend req"><span class="fn">${esc(n)}</span><button class="small-btn ok" data-accept="${esc(n)}">Aceptar</button><button class="small-btn" data-decline="${esc(n)}">✕</button></div>`).join('')}` : ''}
          ${this.social.outgoing.length ? `<div class="req-title">Enviadas</div>${this.social.outgoing.map((n) => `
            <div class="friend req out"><span class="fn">${esc(n)}</span><small>pendiente</small><button class="small-btn" data-decline="${esc(n)}" title="Cancelar">✕</button></div>`).join('')}` : ''}
          <div class="friend-list">${this.social.friends.map((f) => this.friendHTML(f, p)).join('') || '<div class="empty-note">Todavía no tienes amigos añadidos. Escribe el nombre de jugador de un amigo arriba para enviarle una solicitud.</div>'}</div>
          <div class="online-count">${this.social.online} jugador${this.social.online === 1 ? '' : 'es'} conectado${this.social.online === 1 ? '' : 's'}</div>
          ${this.addressHTML()}
        </aside>
      </div>`;
  }

  // Dirección que tiene que escribir un amigo con la app del móvil.
  addressHTML() {
    let host = '';
    try {
      host = new URL(this.url.replace(/^ws/, 'http')).host;
    } catch {
      /* sin servidor */
    }
    // Conectado a «localhost»: se muestran las IPs de red que envía el servidor
    const list = !host || /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? this.net.addresses || [] : [host];
    if (!list.length) return '';
    return `<div class="mobile-addr">📱 <b>¿Tu amigo juega desde el móvil?</b><br>
      En la app: <i>ONLINE → Cambiar servidor</i> y escribe:
      ${list.map((a) => `<code>${esc(a)}</code>`).join(' ')}
      <small>o pulsa «Buscar en mi Wi-Fi» (misma red Wi-Fi).</small></div>`;
  }

  friendHTML(f, p) {
    const inParty = p?.members.some((m) => m.name.toLowerCase() === f.name.toLowerCase());
    const invited = p?.invited?.some((n) => n.toLowerCase() === f.name.toLowerCase());
    const canInvite = f.status !== 'offline' && f.status !== 'match' && !inParty && (p?.members.length || 1) < 4;
    const s = f.stats || {};
    return `<div class="friend ${f.status}">
      <span class="dot ${ST_DOT[f.status]}"></span>
      <div class="fi"><span class="fn">${esc(f.name)}</span><small>${inParty ? 'En tu grupo' : esc(f.text)}${s.wins ? ` · 🏆 ${s.wins}` : ''}</small></div>
      ${canInvite ? `<button class="small-btn ok" data-invite="${esc(f.name)}" ${invited ? 'disabled' : ''}>${invited ? 'Invitado' : 'Invitar'}</button>` : ''}
      <button class="x" data-remove="${esc(f.name)}" title="Eliminar amigo">✕</button>
    </div>`;
  }

  bindHub(el) {
    const n = this.net;
    const on = (sel, fn) => el.querySelector(sel)?.addEventListener('click', fn);
    on('#ol-logout', () => {
      n.logout();
      this.party = null;
      this.social = { friends: [], incoming: [], outgoing: [], online: 0 };
      this.partyChat = [];
      this.menu.updateBadge();
      this.render(el);
    });
    on('#ol-leave', () => n.send('party_leave'));
    on('#ol-queue', () => {
      this.game.audio.init();
      n.send('queue', { on: true });
    });
    on('#ol-cancel', () => n.send('queue', { on: false }));
    on('#ol-load-island', () => {
      const q = new URLSearchParams(location.search);
      q.set('seed', n.seed);
      q.set('online', '1');
      location.search = q.toString();
    });
    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      this.game.settings.online.mode = b.dataset.mode;
      this.game.applySettings();
      n.send('party_set', { mode: b.dataset.mode });
    }));
    el.querySelector('#ol-bots')?.addEventListener('change', (e) => {
      this.game.settings.online.bots = e.target.checked;
      this.game.applySettings();
      n.send('party_set', { bots: e.target.checked });
    });
    el.querySelectorAll('#ol-diff button').forEach((b) => b.addEventListener('click', () => {
      this.game.settings.online.difficulty = b.dataset.v;
      this.game.applySettings();
      n.send('party_set', { difficulty: b.dataset.v });
    }));
    el.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', () => n.send('party_kick', { name: b.dataset.kick })));
    el.querySelectorAll('[data-invite]').forEach((b) => b.addEventListener('click', () => {
      n.send('party_invite', { name: b.dataset.invite });
      b.disabled = true;
      b.textContent = 'Invitado';
    }));
    el.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', () => n.send('friend_accept', { name: b.dataset.accept })));
    el.querySelectorAll('[data-decline]').forEach((b) => b.addEventListener('click', () => n.send('friend_decline', { name: b.dataset.decline })));
    el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      if (confirm(`¿Eliminar a ${b.dataset.remove} de tus amigos?`)) n.send('friend_remove', { name: b.dataset.remove });
    }));
    el.querySelector('#ol-add').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const name = inp.value.trim();
      if (!name) return;
      n.send('friend_add', { name });
      inp.value = '';
    });
    el.querySelector('#ol-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const text = inp.value.trim();
      if (text) n.send('chat', { scope: 'party', text });
      inp.value = '';
    });
    // Al conectarse, el líder aplica los últimos ajustes que usó
    const p = this.party;
    const s = this.game.settings.online;
    if (p && !this.syncedParty && p.leader.toLowerCase() === n.user.name.toLowerCase() && p.members.length === 1) {
      this.syncedParty = true;
      if (p.mode !== s.mode || p.bots !== s.bots || p.difficulty !== s.difficulty) n.send('party_set', { mode: s.mode, bots: s.bots, difficulty: s.difficulty });
    }
  }
}
