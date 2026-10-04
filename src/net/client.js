// Conexión con el servidor online: sesión, reconexión automática y eventos.
const TOKEN_KEY = 'islaRoyale.token';
const SEED_KEY = 'islaRoyale.onlineSeed';

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible */
  }
}

function load(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function savedToken() {
  return load(TOKEN_KEY);
}

export function savedOnlineSeed() {
  return Number(load(SEED_KEY)) || 0;
}

// Dirección del servidor: la configurada, o el mismo servidor que sirve la
// página (en desarrollo Vite redirige /ws al servidor del puerto 8080).
export function serverUrl(custom) {
  let s = String(custom || '').trim();
  if (s) {
    if (!/^wss?:\/\//.test(s)) s = s.replace(/^http/, 'ws');
    if (!/^wss?:\/\//.test(s)) s = 'ws://' + s;
    if (!/\/ws\/?$/.test(s)) s = s.replace(/\/$/, '') + '/ws';
    return s;
  }
  // En la app de Android el juego va dentro del móvil: no hay servidor por
  // defecto, hay que indicar el del amigo (o buscarlo en la Wi-Fi).
  if (needsServerAddress()) return '';
  // Con `npm run dev` el juego va por Vite (5173) y el servidor por el 8080:
  // se conecta directo al servidor (sin depender del proxy de Vite).
  if (import.meta.env?.DEV && (location.protocol === 'http:' || location.protocol === 'https:')) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8080/ws`;
  }
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  return 'ws://localhost:8080/ws';
}

export function needsServerAddress() {
  return !!window.Capacitor?.isNativePlatform?.();
}

export class NetClient {
  constructor() {
    this.ws = null;
    this.url = '';
    this.state = 'offline'; // offline | connecting | online
    this.user = null;
    this.token = load(TOKEN_KEY);
    this.handlers = new Map();
    this.want = false;
    this.retry = 0;
    this.retryTimer = null;
    this.seed = 0;
    this.ping = 0;
    this.addresses = [];
    this.pendingAuth = null;
    setInterval(() => {
      if (this.state === 'online') this.send('ping', { ts: performance.now() });
    }, 3000);
    this.on('pong', (m) => (this.ping = Math.round(performance.now() - m.ts)));
  }

  get authed() {
    return !!this.user;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, data) {
    const set = this.handlers.get(type);
    if (set) for (const fn of [...set]) fn(data);
    const all = this.handlers.get('*');
    if (all) for (const fn of [...all]) fn(type, data);
  }

  connect(url) {
    if (this.ws && this.url === url && this.state !== 'offline') return;
    this.close(false);
    this.url = url;
    this.want = true;
    this.open();
  }

  open() {
    clearTimeout(this.retryTimer);
    this.state = 'connecting';
    this.emit('status', this.state);
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.state = 'offline';
      this.emit('status', this.state);
      this.emit('neterror', 'Dirección del servidor no válida');
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.state = 'online';
      this.retry = 0;
      this.emit('status', this.state);
      if (this.pendingAuth) {
        this.send(this.pendingAuth.t, this.pendingAuth);
        this.pendingAuth = null;
      } else if (this.token) this.send('resume', { token: this.token });
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.receive(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const wasAuthed = this.authed;
      this.ws = null;
      this.user = null;
      this.state = 'offline';
      this.emit('status', this.state);
      this.emit('disconnected', { wasAuthed });
      if (this.want) {
        const delay = Math.min(15000, 1000 * 2 ** this.retry++);
        this.retryTimer = setTimeout(() => this.open(), delay);
      }
    };
    ws.onerror = () => {
      if (this.ws === ws && this.state === 'connecting') this.emit('neterror', 'No se puede conectar con el servidor');
    };
  }

  receive(m) {
    if (m.t === 'hello') {
      this.seed = m.seed;
      this.addresses = m.addr || [];
    }
    if (m.t === 'auth_ok') {
      this.user = { name: m.name, stats: m.stats, outfit: m.outfit };
      this.token = m.token;
      this.seed = m.seed;
      store(TOKEN_KEY, m.token);
      store(SEED_KEY, String(m.seed));
    } else if (m.t === 'auth_err' && m.resume) {
      this.token = null;
      store(TOKEN_KEY, null);
    } else if (m.t === 'stats' && this.user) {
      this.user.stats = m.stats;
    } else if (m.t === 'kicked') {
      this.want = false;
    }
    this.emit(m.t, m);
  }

  send(t, data = {}) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    data.t = t;
    this.ws.send(JSON.stringify(data));
    return true;
  }

  // Envía un mensaje ya serializado (para el estado, que se manda a menudo).
  sendRaw(str) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(str);
  }

  auth(kind, name, pass) {
    const msg = { t: kind, name, pass };
    if (this.state === 'online') this.send(kind, msg);
    else {
      this.pendingAuth = msg;
      if (this.state === 'offline') {
        this.want = true;
        this.open();
      }
    }
  }

  logout() {
    this.send('logout', { token: this.token });
    this.token = null;
    store(TOKEN_KEY, null);
    this.close(true);
  }

  close(emit = true) {
    this.want = false;
    clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.ws = null;
    this.user = null;
    if (ws) ws.close();
    if (this.state !== 'offline') {
      this.state = 'offline';
      if (emit) this.emit('status', this.state);
    }
  }
}
