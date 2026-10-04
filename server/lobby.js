// Lobby online: sesiones, presencia, amigos, grupos, invitaciones, chat y
// emparejamiento. Las partidas en sí las gestiona Match (match.js).
import { MODES, DIFFICULTIES, partyLimit } from '../src/game/modes.js';
import { Match } from './match.js';
import { cleanCosmetics } from '../src/game/cosmetics.js';

const WAIT_MS = Number(process.env.QUEUE_WAIT_MS) || 12000; // espera en cola antes de empezar con bots
const PARTY_MAX = 4;
const BOT_NAMES = [
  'Lucía', 'Mateo', 'Sofía', 'Hugo', 'Valeria', 'Leo', 'Martina', 'Pablo', 'Paula', 'Álvaro',
  'Daniela', 'Diego', 'Carla', 'Marcos', 'Elena', 'Bruno', 'Noa', 'Iker', 'Alba', 'Adrián',
  'Vega', 'Gael', 'Lola', 'Thiago', 'Abril', 'Enzo', 'Irene', 'Unai', 'Julia', 'Izan',
];

const STATUS_TEXT = { menu: 'En el menú', party: 'En un grupo', queue: 'Buscando partida', match: 'En partida' };

let nextId = 1;
const uid = (p) => `${p}${(nextId++).toString(36)}`;

export class Lobby {
  constructor(db, islandSeed) {
    this.db = db;
    this.islandSeed = islandSeed;
    this.clients = new Set();
    this.online = new Map(); // nombre en minúsculas -> cliente
    this.parties = new Map();
    this.matches = new Map();
    this.away = new Map(); // cuenta -> partida que le guarda el sitio
    this.queue = []; // grupos buscando partida (en orden de llegada)
    this.tickTimer = setInterval(() => this.tick(), 1000);
  }

  // ------------------------------------------------------------ CONEXIONES
  connect(ws) {
    const c = { ws, key: null, user: null, party: null, match: null, alive: true, msgs: 0 };
    this.clients.add(c);
    ws.on('message', (raw) => {
      if (++c.msgs > 400) return; // limitador sencillo (se reinicia cada segundo)
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      try {
        this.handle(c, msg);
      } catch (err) {
        console.error('[lobby] Error procesando', msg.t, err);
      }
    });
    ws.on('pong', () => (c.alive = true));
    ws.on('close', () => this.disconnect(c));
    ws.on('error', () => {});
    // addr: direcciones de red local del servidor (para conectar móviles)
    this.send(c, { t: 'hello', seed: this.islandSeed, online: this.online.size, addr: this.addresses || [] });
  }

  send(c, msg) {
    if (c && c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  error(c, text) {
    this.send(c, { t: 'error', text });
  }

  heartbeat() {
    for (const c of this.clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping();
      } catch {
        /* conexión cerrada */
      }
    }
  }

  disconnect(c) {
    if (!this.clients.delete(c)) return;
    if (c.match) c.match.leave(c, 'disconnect');
    if (c.key && this.online.get(c.key) === c) {
      this.online.delete(c.key);
      this.leaveParty(c, true);
      this.notifyFriends(c.key);
    }
  }

  // ------------------------------------------------------------ MENSAJES
  handle(c, m) {
    if (m.t === 'register' || m.t === 'login' || m.t === 'resume') return this.auth(c, m);
    if (!c.user) return this.error(c, 'Primero inicia sesión');
    if (c.match && m.t.startsWith('m.')) return c.match.handle(c, m);
    switch (m.t) {
      case 'logout': this.db.logout(m.token); c.ws.close(); break;
      case 'friend_add': this.friendAdd(c, m.name); break;
      case 'friend_accept': this.friendAccept(c, m.name); break;
      case 'friend_decline': this.friendDecline(c, m.name); break;
      case 'friend_remove': this.friendRemove(c, m.name); break;
      case 'party_invite': this.partyInvite(c, m.name); break;
      case 'party_join': this.partyJoin(c, m.id); break;
      case 'party_decline': this.partyDecline(c, m.id); break;
      case 'party_leave': this.leaveParty(c); this.ensureParty(c); this.pushParty(c.party); break;
      case 'party_kick': this.partyKick(c, m.name); break;
      case 'party_set': this.partySet(c, m); break;
      case 'queue': this.setQueue(c, !!m.on); break;
      case 'chat': this.chat(c, m); break;
      case 'outfit': this.setOutfit(c, m.outfit); break;
      case 'profile': this.setProfile(c, m.profile); break;
      case 'leave_match': if (c.match) c.match.leave(c, 'quit'); break;
      case 'ping': this.send(c, { t: 'pong', ts: m.ts }); break;
      default: break;
    }
  }

  auth(c, m) {
    if (c.user) return;
    let res;
    if (m.t === 'register') res = this.db.register(String(m.name || '').trim(), m.pass);
    else if (m.t === 'login') res = this.db.login(String(m.name || '').trim(), m.pass);
    else res = this.db.resume(m.token);
    if (res.error) return this.send(c, { t: 'auth_err', text: res.error, resume: m.t === 'resume' });
    const key = res.user.name.toLowerCase();
    const old = this.online.get(key);
    if (old && old !== c) {
      // La misma cuenta entra desde otro sitio: se cierra la sesión anterior.
      this.send(old, { t: 'kicked', text: 'Has iniciado sesión desde otra ventana' });
      this.disconnect(old);
      old.ws.close();
    }
    c.key = key;
    c.user = res.user;
    this.online.set(key, c);
    const u = res.user;
    this.send(c, { t: 'auth_ok', name: u.name, token: res.token, stats: u.stats, outfit: u.outfit, profile: u.profile || null, seed: this.islandSeed });
    this.ensureParty(c);
    // Volvía de un corte en plena partida: se le devuelve a ella.
    const back = this.away.get(key);
    if (back && back.rejoin(c)) this.send(c, { t: 'notice', text: 'Has vuelto a la partida' });
    this.pushParty(c.party);
    this.pushSocial(key);
    this.notifyFriends(key);
    // Invitaciones pendientes de grupos que siguen existiendo
    for (const p of this.parties.values()) {
      if (p.invites.has(key)) this.send(c, { t: 'invite', id: p.id, from: this.displayName(p.leader), mode: p.mode });
    }
  }

  displayName(key) {
    return this.db.user(key)?.name || key;
  }

  // ------------------------------------------------------------ PRESENCIA
  status(key) {
    const c = this.online.get(key);
    if (!c) return 'offline';
    if (c.match) return 'match';
    if (c.party?.queuedAt) return 'queue';
    if (c.party && c.party.members.length > 1) return 'party';
    return 'menu';
  }

  statusText(key) {
    const st = this.status(key);
    if (st === 'offline') return 'Desconectado';
    if (st === 'match') return `En partida · ${MODES[this.online.get(key).match.mode.id]?.name || ''}`;
    return STATUS_TEXT[st];
  }

  pushSocial(key) {
    const c = this.online.get(key);
    const u = this.db.user(key);
    if (!c || !u) return;
    const friends = u.friends.map((f) => {
      const fu = this.db.user(f);
      const st = this.status(f);
      return {
        name: fu?.name || f, status: st, text: this.statusText(f),
        party: this.online.get(f)?.party?.id === c.party?.id && st !== 'offline',
        stats: fu?.stats,
      };
    });
    const order = { match: 1, queue: 1, party: 1, menu: 1, offline: 2 };
    friends.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
    this.send(c, {
      t: 'social', friends,
      incoming: u.incoming.map((k) => this.displayName(k)),
      outgoing: u.outgoing.map((k) => this.displayName(k)),
      online: this.online.size,
    });
  }

  notifyFriends(key) {
    const u = this.db.user(key);
    if (!u) return;
    for (const f of u.friends) this.pushSocial(f);
  }

  // Al cambiar el estado de alguien: avisar a sus amigos y a su grupo.
  statusChanged(key) {
    this.pushSocial(key);
    this.notifyFriends(key);
  }

  // ------------------------------------------------------------ AMIGOS
  friendAdd(c, name) {
    const me = c.user;
    const other = this.db.user(name);
    if (!other) return this.error(c, `No existe ningún jugador llamado "${String(name || '').slice(0, 20)}"`);
    const ok = other.name.toLowerCase();
    if (ok === c.key) return this.error(c, 'No puedes añadirte a ti mismo');
    if (me.friends.includes(ok)) return this.error(c, `${other.name} ya es tu amigo`);
    if (me.incoming.includes(ok)) return this.friendAccept(c, other.name);
    if (me.outgoing.includes(ok)) return this.error(c, `Ya enviaste una solicitud a ${other.name}`);
    me.outgoing.push(ok);
    other.incoming.push(c.key);
    this.db.save();
    this.send(c, { t: 'notice', text: `Solicitud de amistad enviada a ${other.name}` });
    const oc = this.online.get(ok);
    if (oc) this.send(oc, { t: 'notice', text: `${me.name} quiere ser tu amigo`, kind: 'friend', from: me.name });
    this.pushSocial(c.key);
    this.pushSocial(ok);
  }

  friendAccept(c, name) {
    const me = c.user;
    const other = this.db.user(name);
    if (!other) return;
    const ok = other.name.toLowerCase();
    if (!me.incoming.includes(ok)) return;
    me.incoming = me.incoming.filter((k) => k !== ok);
    other.outgoing = other.outgoing.filter((k) => k !== c.key);
    if (!me.friends.includes(ok)) me.friends.push(ok);
    if (!other.friends.includes(c.key)) other.friends.push(c.key);
    this.db.save();
    const oc = this.online.get(ok);
    if (oc) this.send(oc, { t: 'notice', text: `${me.name} ha aceptado tu solicitud de amistad` });
    this.send(c, { t: 'notice', text: `${other.name} y tú ya sois amigos` });
    this.pushSocial(c.key);
    this.pushSocial(ok);
  }

  friendDecline(c, name) {
    const me = c.user;
    const other = this.db.user(name);
    if (!other) return;
    const ok = other.name.toLowerCase();
    me.incoming = me.incoming.filter((k) => k !== ok);
    me.outgoing = me.outgoing.filter((k) => k !== ok);
    other.outgoing = other.outgoing.filter((k) => k !== c.key);
    other.incoming = other.incoming.filter((k) => k !== c.key);
    this.db.save();
    this.pushSocial(c.key);
    this.pushSocial(ok);
  }

  friendRemove(c, name) {
    const other = this.db.user(name);
    if (!other) return;
    const ok = other.name.toLowerCase();
    c.user.friends = c.user.friends.filter((k) => k !== ok);
    other.friends = other.friends.filter((k) => k !== c.key);
    this.db.save();
    this.pushSocial(c.key);
    this.pushSocial(ok);
  }

  // ------------------------------------------------------------ GRUPOS
  ensureParty(c) {
    if (c.party) return c.party;
    const s = { mode: 'duos', bots: true, difficulty: 'normal' };
    const p = { id: uid('p'), leader: c.key, members: [c.key], invites: new Set(), queuedAt: 0, match: null, ...s };
    this.parties.set(p.id, p);
    c.party = p;
    return p;
  }

  partyView(p) {
    const mode = MODES[p.mode];
    return {
      t: 'party', id: p.id, leader: this.displayName(p.leader), mode: p.mode, bots: p.bots, difficulty: p.difficulty,
      members: p.members.map((k) => ({ name: this.displayName(k), outfit: this.db.user(k)?.outfit, leader: k === p.leader })),
      queued: !!p.queuedAt, queuedFor: p.queuedAt ? Math.floor((Date.now() - p.queuedAt) / 1000) : 0,
      inMatch: !!p.match, limit: partyLimit(mode),
      invited: [...p.invites].map((k) => this.displayName(k)),
    };
  }

  pushParty(p) {
    if (!p) return;
    const view = JSON.stringify(this.partyView(p));
    for (const k of p.members) this.send(this.online.get(k), view);
  }

  partyChanged(p) {
    this.pushParty(p);
    for (const k of p.members) this.statusChanged(k);
  }

  partyInvite(c, name) {
    const p = this.ensureParty(c);
    const other = this.db.user(name);
    if (!other) return;
    const ok = other.name.toLowerCase();
    if (!c.user.friends.includes(ok)) return this.error(c, 'Solo puedes invitar a tus amigos');
    const oc = this.online.get(ok);
    if (!oc) return this.error(c, `${other.name} no está conectado`);
    if (p.members.includes(ok)) return this.error(c, `${other.name} ya está en tu grupo`);
    if (p.members.length >= PARTY_MAX) return this.error(c, 'El grupo está completo (máximo 4)');
    if (p.match) return this.error(c, 'Espera a que termine la partida');
    p.invites.add(ok);
    this.send(oc, { t: 'invite', id: p.id, from: c.user.name, mode: p.mode });
    this.send(c, { t: 'notice', text: `Invitación enviada a ${other.name}` });
    this.pushParty(p);
  }

  partyJoin(c, id) {
    const p = this.parties.get(id);
    if (!p || !p.invites.has(c.key)) return this.error(c, 'La invitación ya no es válida');
    if (c.match) return this.error(c, 'Termina tu partida antes de unirte a un grupo');
    if (p.match) return this.error(c, 'Ese grupo está en partida; inténtalo cuando termine');
    if (p.members.length >= PARTY_MAX) return this.error(c, 'El grupo está completo');
    p.invites.delete(c.key);
    this.leaveParty(c);
    this.unqueue(p);
    p.members.push(c.key);
    c.party = p;
    this.chatSystem(p, `${c.user.name} se ha unido al grupo`);
    this.partyChanged(p);
  }

  partyDecline(c, id) {
    const p = this.parties.get(id);
    if (!p) return;
    p.invites.delete(c.key);
    const lc = this.online.get(p.leader);
    if (lc) this.send(lc, { t: 'notice', text: `${c.user.name} ha rechazado la invitación` });
    this.pushParty(p);
  }

  // Sale de su grupo actual (y lo borra si se queda vacío).
  leaveParty(c, disconnected = false) {
    const p = c.party;
    if (!p) return;
    c.party = null;
    this.unqueue(p);
    p.members = p.members.filter((k) => k !== c.key);
    if (!p.members.length) {
      this.parties.delete(p.id);
      return;
    }
    if (p.leader === c.key) p.leader = p.members[0];
    this.chatSystem(p, `${c.user.name} ha ${disconnected ? 'perdido la conexión' : 'salido del grupo'}`);
    this.partyChanged(p);
    if (!disconnected) this.statusChanged(c.key);
  }

  partyKick(c, name) {
    const p = c.party;
    if (!p || p.leader !== c.key) return;
    const key = String(name || '').toLowerCase();
    if (key === c.key || !p.members.includes(key)) return;
    const oc = this.online.get(key);
    if (!oc || oc.match) return;
    this.leaveParty(oc);
    this.ensureParty(oc);
    this.pushParty(oc.party);
    this.send(oc, { t: 'notice', text: 'Te han expulsado del grupo' });
  }

  partySet(c, m) {
    const p = c.party;
    if (!p || p.leader !== c.key || p.match) return;
    if (m.mode && MODES[m.mode]?.online) p.mode = m.mode;
    if (typeof m.bots === 'boolean') p.bots = m.bots;
    if (m.difficulty && DIFFICULTIES[m.difficulty]) p.difficulty = m.difficulty;
    this.unqueue(p);
    this.partyChanged(p);
  }

  chat(c, m) {
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!text) return;
    if (m.scope === 'match' && c.match) return c.match.chat(c, text, !!m.team);
    const p = c.party;
    if (!p) return;
    const msg = JSON.stringify({ t: 'chat', scope: 'party', from: c.user.name, text });
    for (const k of p.members) this.send(this.online.get(k), msg);
  }

  chatSystem(p, text) {
    const msg = JSON.stringify({ t: 'chat', scope: 'party', system: true, text });
    for (const k of p.members) this.send(this.online.get(k), msg);
  }

  setOutfit(c, outfit) {
    if (!outfit || typeof outfit !== 'object') return;
    const clean = {};
    for (const k of ['skin', 'shirt', 'pants', 'hair']) if (Number.isInteger(outfit[k])) clean[k] = outfit[k] & 0xffffff;
    Object.assign(clean, cleanCosmetics(outfit));
    c.user.outfit = clean;
    this.db.save();
    if (c.party) this.pushParty(c.party);
  }

  // Progreso del pase de batalla, tokens y objetos (lo calcula el juego).
  setProfile(c, profile) {
    if (!profile || typeof profile !== 'object') return;
    const json = JSON.stringify(profile);
    if (json.length > 16000) return;
    const cur = c.user.profile;
    if (cur && (Number(cur.rev) || 0) > (Number(profile.rev) || 0)) return; // versión más antigua
    c.user.profile = JSON.parse(json);
    this.db.save();
  }

  // ------------------------------------------------------------ COLA
  setQueue(c, on) {
    const p = c.party;
    if (!p || p.leader !== c.key) return this.error(c, 'Solo el líder del grupo puede buscar partida');
    if (!on) {
      this.unqueue(p);
      this.partyChanged(p);
      return;
    }
    if (p.queuedAt || p.match) return;
    const mode = MODES[p.mode];
    if (!mode?.online) return;
    const lim = partyLimit(mode);
    if (p.members.length > lim) return this.error(c, `${mode.name} admite grupos de hasta ${lim} jugador${lim > 1 ? 'es' : ''}`);
    for (const k of p.members) {
      const mc = this.online.get(k);
      if (!mc || mc.match) return this.error(c, `${this.displayName(k)} todavía está en una partida`);
    }
    // 1v1 con un amigo del grupo: partida privada inmediata, uno contra otro
    if (mode.id === 'duel' && p.members.length === 2) {
      this.startMatch(mode, [[{ key: p.members[0] }], [{ key: p.members[1] }]], [p], p);
      return;
    }
    p.queuedAt = Date.now();
    this.queue.push(p);
    this.partyChanged(p);
  }

  unqueue(p) {
    if (!p.queuedAt) return;
    p.queuedAt = 0;
    this.queue = this.queue.filter((q) => q !== p);
  }

  tick() {
    for (const c of this.clients) c.msgs = 0;
    if (!this.queue.length) return;
    const byMode = new Map();
    for (const p of this.queue) {
      if (!byMode.has(p.mode)) byMode.set(p.mode, []);
      byMode.get(p.mode).push(p);
    }
    for (const [modeId, list] of byMode) this.matchmake(MODES[modeId], list);
    // refrescar el contador de espera
    for (const p of this.queue) this.pushParty(p);
  }

  matchmake(mode, list) {
    const now = Date.now();
    if (mode.id === 'duel') {
      while (list.length >= 2) {
        const a = list.shift(), b = list.shift();
        this.startMatch(mode, [[{ key: a.members[0] }], [{ key: b.members[0] }]], [a, b], a);
      }
      // Solo en la cola demasiado tiempo: duelo contra un bot si lo permite
      const a = list[0];
      if (a && a.bots && now - a.queuedAt >= WAIT_MS) {
        this.startMatch(mode, [[{ key: a.members[0] }], [{ bot: true }]], [a], a);
      }
      return;
    }
    const max = mode.maxPlayers;
    const humans = list.reduce((n, p) => n + p.members.length, 0);
    if (humans < max && now - list[0].queuedAt < WAIT_MS) return;
    // Tomar grupos por orden de llegada hasta llenar la partida
    const take = [];
    let n = 0;
    for (const p of list) {
      if (n + p.members.length > max) continue;
      take.push(p);
      n += p.members.length;
    }
    const opts = take[0];
    const teams = this.formTeams(mode, take);
    const humanTeams = teams.length;
    if (opts.bots) this.fillBots(mode, teams);
    else if (humanTeams < 2) return; // sin bots hace falta al menos un rival
    this.startMatch(mode, teams, take, opts);
  }

  // Agrupa los grupos en equipos (rellenando huecos con otros jugadores).
  formTeams(mode, parties) {
    const sorted = [...parties].sort((a, b) => b.members.length - a.members.length);
    if (mode.teams) {
      const teams = Array.from({ length: mode.teams }, () => []);
      for (const p of sorted) {
        const t = teams.reduce((best, cur) => (cur.length < best.length ? cur : best), teams[0]);
        for (const k of p.members) t.push({ key: k });
      }
      return teams;
    }
    const size = mode.teamSize || 1;
    const teams = [];
    for (const p of sorted) {
      const room = teams.find((t) => t.length + p.members.length <= size && size > 1);
      const t = room || [];
      if (!room) teams.push(t);
      for (const k of p.members) t.push({ key: k });
    }
    return teams;
  }

  fillBots(mode, teams) {
    const max = mode.maxPlayers;
    let total = teams.reduce((n, t) => n + t.length, 0);
    if (mode.teams) {
      const per = Math.floor(max / mode.teams);
      for (const t of teams) while (t.length < per) t.push({ bot: true });
      return;
    }
    const size = mode.teamSize || 1;
    for (const t of teams) {
      while (t.length < size && total < max) {
        t.push({ bot: true });
        total++;
      }
    }
    while (total + size <= max) {
      teams.push(Array.from({ length: size }, () => ({ bot: true })));
      total += size;
    }
  }

  startMatch(mode, teams, parties, opts) {
    for (const p of parties) this.unqueue(p);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let bi = 0;
    const roster = [];
    teams.forEach((t, team) => {
      for (const e of t) {
        if (e.bot) {
          const base = names[bi % names.length];
          roster.push({ bot: true, team, name: bi >= names.length ? `${base} ${Math.floor(bi / names.length) + 1}` : base });
          bi++;
        } else {
          const c = this.online.get(e.key);
          if (c) roster.push({ client: c, team, name: c.user.name, outfit: c.user.outfit });
        }
      }
    });
    if (!roster.some((r) => r.client)) return;
    const match = new Match(this, mode, roster, { difficulty: opts.difficulty, seed: this.islandSeed });
    this.matches.set(match.id, match);
    for (const p of parties) p.match = match;
    for (const r of roster) if (r.client) this.statusChanged(r.client.key);
    for (const p of parties) this.pushParty(p);
    console.log(`[lobby] Partida ${match.id} (${mode.name}): ${roster.filter((r) => r.client).length} jugadores, ${bi} bots`);
  }

  // Lo llama Match cuando termina o se queda sin jugadores.
  matchClosed(match) {
    this.matches.delete(match.id);
    for (const p of this.parties.values()) {
      if (p.match === match) {
        p.match = null;
        this.partyChanged(p);
      }
    }
  }

  // Jugador desconectado cuya partida le guarda el sitio (null = ya no).
  setAway(key, match) {
    if (!key) return;
    if (match) this.away.set(key, match);
    else this.away.delete(key);
  }

  // Un jugador sale de la partida (vuelve al lobby).
  clientLeftMatch(c) {
    c.match = null;
    if (c.party && c.party.match && !c.party.members.some((k) => this.online.get(k)?.match === c.party.match)) c.party.match = null;
    if (c.party) this.pushParty(c.party);
    if (c.key) this.statusChanged(c.key);
  }
}
