// Partida online. El servidor no simula el mundo 3D: cada cliente simula a su
// propio jugador (y el anfitrión, además, a los bots) y el servidor reenvía
// los estados y arbitra lo que se comparte: cofres, objetos del suelo,
// vehículos, construcciones, eliminaciones, marcador y final de la partida.
import { RNG } from '../src/core/rng.js';
import { lootForChest, lootForAmmoBox, setLootPool } from '../src/game/items.js';
import { HitGuard } from './anticheat.js';

let nextMatch = 1;
const RELAY = new Set(['m.fx', 'm.ex', 'm.down', 'm.bdmg', 'm.harv', 'm.veh', 'm.emote', 'm.ping', 'm.vboom', 'm.wdoor', 'm.gad']);
// Tiempo que se guarda el sitio de un jugador que pierde la conexión.
export const REJOIN_MS = 45000;
const now = () => Date.now() / 1000;

export class Match {
  constructor(lobby, mode, roster, opts) {
    this.id = `m${(nextMatch++).toString(36)}`;
    this.lobby = lobby;
    this.mode = mode;
    this.difficulty = opts.difficulty || 'normal';
    this.seed = opts.seed;
    this.lootSeed = (Math.random() * 2 ** 32) >>> 0;
    this.stormSeed = (Math.random() * 2 ** 32) >>> 0;
    this.bus = { ang: Math.random() * Math.PI * 2, off: (Math.random() - 0.5) * 420 };
    this.rng = new RNG(this.lootSeed ^ 0x5bd1e995);
    this.scoreLimit = mode.onlineScoreLimit || mode.scoreLimit || 0;
    this.ents = roster.map((r, i) => ({
      id: i + 1, name: r.name, team: r.team, bot: !!r.bot, client: r.client || null,
      key: r.client?.key || null, outfit: r.outfit || null, alive: true, kills: 0,
    }));
    this.host = this.ents.find((e) => !e.bot)?.client || null;
    this.status = 'loading';
    this.ready = new Set();
    this.chests = new Set();
    this.taken = new Set();
    this.builds = new Map(); // clave -> mensaje m.build (con edición y puerta al día)
    this.drops = new Map(); // id -> fila de m.drop (objetos tirados aún en el suelo)
    this.pads = []; // plataformas de salto colocadas
    this.chestItems = new Map(); // cofre -> botín que soltó
    this.guard = new HitGuard();
    this.cars = new Map();
    this.score = [0, 0];
    this.createdAt = Date.now();
    for (const e of this.ents) {
      if (!e.client) continue;
      e.client.match = this;
      this.lobby.send(e.client, this.startMsg(e));
    }
    this.loadTimer = setTimeout(() => this.go(), 15000);
  }

  startMsg(e) {
    return {
      t: 'm.start', id: this.id, mode: this.mode.id, seed: this.seed, lootSeed: this.lootSeed, stormSeed: this.stormSeed,
      bus: this.bus, you: e.id, host: this.entOf(this.host)?.id || 0, difficulty: this.difficulty, scoreLimit: this.scoreLimit,
      ents: this.ents.map((x) => ({ id: x.id, name: x.name, team: x.team, bot: x.bot, outfit: x.outfit })),
    };
  }

  entOf(c) {
    if (!c) return null;
    return this.ents.find((e) => e.client === c) || null;
  }

  ent(id) {
    return this.ents[(id | 0) - 1] || null;
  }

  // Cliente que simula una entidad (el propio jugador o el anfitrión para los bots).
  ownerOf(e) {
    if (!e) return null;
    return e.bot ? this.host : e.client;
  }

  owns(c, id) {
    const e = this.ent(id);
    return !!e && this.ownerOf(e) === c;
  }

  send(c, msg) {
    this.lobby.send(c, msg);
  }

  broadcast(msg, except = null) {
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const e of this.ents) if (e.client && e.client !== except) this.lobby.send(e.client, s);
  }

  go() {
    if (this.status !== 'loading') return;
    clearTimeout(this.loadTimer);
    this.status = 'playing';
    this.broadcast({ t: 'm.go' });
  }

  // ------------------------------------------------------------ MENSAJES
  handle(c, m) {
    const me = this.entOf(c);
    if (!me) return;
    if (m.t === 'm.ready') {
      this.ready.add(me.id);
      if (this.ents.every((e) => e.bot || !e.client || this.ready.has(e.id))) this.go();
      return;
    }
    if (this.status === 'ended') return;
    if (RELAY.has(m.t)) {
      m.from = me.id;
      this.broadcast(m, c);
      return;
    }
    switch (m.t) {
      case 'm.st':
        this.guard.state(me.id, m.p, m.h, now());
        m.from = me.id;
        this.broadcast(m, c);
        break;
      case 'm.bots':
        if (c === this.host && Array.isArray(m.b)) {
          const t = now();
          for (const a of m.b) if (Array.isArray(a) && this.ent(a[0])?.bot) this.guard.state(a[0], [a[1], a[2], a[3]], a[10], t);
          m.from = me.id;
          this.broadcast(m, c);
        }
        break;
      case 'm.drop':
        if (!Array.isArray(m.items)) return;
        for (const row of m.items.slice(0, 40)) {
          const id = Array.isArray(row) && String(row[0] || '').slice(0, 40);
          if (id && !this.taken.has(id)) this.drops.set(id, row);
        }
        m.from = me.id;
        this.broadcast(m, c);
        break;
      case 'm.rtc': {
        // Señalización del chat de voz: sólo al destinatario
        const to = this.ent(m.to);
        if (!to?.client || to.client === c) return;
        const out = { t: 'm.rtc', from: me.id };
        if (m.sdp && typeof m.sdp.sdp === 'string' && m.sdp.sdp.length < 20000) out.sdp = { type: m.sdp.type === 'answer' ? 'answer' : 'offer', sdp: m.sdp.sdp };
        else if (m.ice && typeof m.ice.candidate === 'string' && m.ice.candidate.length < 2000) out.ice = { candidate: m.ice.candidate, sdpMid: m.ice.sdpMid ?? null, sdpMLineIndex: m.ice.sdpMLineIndex ?? null };
        else return;
        this.send(to.client, out);
        break;
      }
      case 'm.pad': {
        const p = Array.isArray(m.p) && m.p.slice(0, 3).map(Number);
        if (!p || !p.every(Number.isFinite) || this.pads.length > 300) return;
        const k = ['pad', 'tire', 'fire', 'bubble'].includes(m.k) ? m.k : 'pad';
        const pad = { t: 'm.pad', p, y: Number(m.y) || 0, k, from: me.id };
        // Las fogatas y burbujas duran poco: no se guardan para quien entre tarde
        if (k === 'pad' || k === 'tire') this.pads.push(pad);
        this.broadcast(pad, c);
        break;
      }
      case 'm.bdoor': {
        const b = this.builds.get(m.key);
        if (!b) return;
        b.open = !!m.open;
        this.broadcast({ t: 'm.bdoor', key: m.key, open: b.open, from: me.id }, c);
        break;
      }
      case 'm.hit': this.hit(c, me, m); break;
      case 'm.elim': this.elim(c, m); break;
      case 'm.revive': {
        const target = this.ent(m.to);
        const owner = this.ownerOf(target);
        if (owner && owner !== c) this.send(owner, { t: 'm.revive', to: target.id, by: m.by || me.id });
        break;
      }
      case 'm.chest': this.chest(c, me, m); break;
      case 'm.pickup': {
        const id = String(m.id || '').slice(0, 40);
        if (!id) return;
        if (this.taken.has(id)) this.send(c, { t: 'm.pickup_no', id });
        else {
          this.taken.add(id);
          this.drops.delete(id);
          this.broadcast({ t: 'm.picked', id, by: this.owns(c, m.by) ? m.by : me.id });
        }
        break;
      }
      case 'm.build':
        if (typeof m.key !== 'string' || m.key.length > 80 || this.builds.has(m.key)) return;
        m.from = me.id;
        this.builds.set(m.key, m);
        this.broadcast(m, c);
        break;
      case 'm.bedit': {
        const b = typeof m.key === 'string' && this.builds.get(m.key);
        if (!b) return;
        b.edit = m.mask | 0;
        b.dir = (m.dir | 0) & 3;
        b.open = false;
        this.broadcast({ t: 'm.bedit', key: m.key, mask: b.edit, dir: b.dir }, c);
        break;
      }
      case 'm.brm':
        if (!this.builds.delete(m.key)) return;
        this.broadcast({ t: 'm.brm', key: m.key }, c);
        break;
      case 'm.veh_in': {
        const i = m.i | 0;
        const by = this.owns(c, m.by) ? m.by : me.id;
        if (this.cars.has(i)) this.send(c, { t: 'm.veh_no', i });
        else {
          this.cars.set(i, by);
          this.broadcast({ t: 'm.veh_in', i, id: by });
        }
        break;
      }
      case 'm.veh_out': {
        const i = m.i | 0;
        if (!this.owns(c, this.cars.get(i))) return;
        this.cars.delete(i);
        m.from = me.id;
        this.broadcast(m, c);
        break;
      }
      default: break;
    }
  }

  hit(c, me, m) {
    const target = this.ent(m.to);
    if (!target) return;
    const by = m.by && this.owns(c, m.by) ? m.by : me.id;
    const dmg = Number(m.dmg);
    if (!(dmg > 0 && dmg <= 400)) return; // descarta valores imposibles
    const owner = this.ownerOf(target);
    if (!owner || owner === c) return;
    const type = String(m.type || 'bullet').slice(0, 12);
    const bad = this.guard.check(by, target.id, dmg, type, now());
    if (bad) {
      const n = this.guard.rejected(by);
      if (n === 1 || n % 25 === 0) console.warn(`[partida ${this.id}] impacto descartado de ${this.ent(by)?.name} (${n}): ${bad}`);
      return;
    }
    this.send(owner, { t: 'm.hit', to: target.id, by, dmg, type, head: !!m.head });
  }

  elim(c, m) {
    const victim = this.ent(m.id);
    if (!victim || !this.owns(c, victim.id)) return;
    const killer = this.ent(m.by);
    if (killer && killer.team !== victim.team) killer.kills++;
    const msg = { t: 'm.elim', id: victim.id, by: killer?.id || 0, type: String(m.type || '').slice(0, 12) };
    if (this.mode.respawn) {
      if (killer && killer.team !== victim.team) this.score[killer.team]++;
      else if (this.mode.id === 'duel') this.score[1 - victim.team]++; // tormenta/caída: punto para el rival
      msg.score = this.score;
    } else {
      if (!victim.alive) return;
      victim.alive = false;
      this.freeCars(victim.id);
    }
    this.broadcast(msg, c);
    if (this.mode.respawn) this.send(c, { t: 'm.score', score: this.score });
    this.checkEnd();
  }

  chest(c, me, m) {
    const i = m.i | 0;
    if (i < 0 || i > 5000 || this.chests.has(i)) return;
    this.chests.add(i);
    setLootPool(this.mode.lootPool); // modos temporales (sólo ciertas armas)
    const loot = m.kind === 'ammo' ? lootForAmmoBox(this.rng) : lootForChest(this.rng);
    setLootPool(null);
    const items = loot.map((it, k) => [`c${i}_${k}`, it]);
    this.chestItems.set(i, items);
    this.broadcast({ t: 'm.chest', i, by: this.owns(c, m.by) ? m.by : me.id, items, brk: !!m.brk });
  }

  chat(c, text, teamOnly) {
    const me = this.entOf(c);
    if (!me) return;
    const msg = JSON.stringify({ t: 'chat', scope: 'match', from: me.name, team: me.team, teamOnly, text });
    for (const e of this.ents) if (e.client && (!teamOnly || e.team === me.team)) this.send(e.client, msg);
  }

  freeCars(id) {
    for (const [i, owner] of this.cars) {
      if (owner === id) {
        this.cars.delete(i);
        this.broadcast({ t: 'm.veh_out', i, from: id });
      }
    }
  }

  // ------------------------------------------------------------ SALIDAS
  leave(c, reason) {
    const me = this.entOf(c);
    if (!me) return;
    // Corte de conexión en plena partida: se guarda su sitio un rato por si
    // vuelve (el resto lo ve «reconectando»; sus bots, si era el anfitrión,
    // se quedan quietos mientras tanto).
    if (reason === 'disconnect' && this.status === 'playing' && me.key && (me.alive || this.mode.respawn)) {
      me.client = null;
      me.away = true;
      if (c === this.host) {
        this.host = null;
        me.wasHost = true;
      }
      this.lobby.clientLeftMatch(c);
      this.lobby.setAway(me.key, this);
      clearTimeout(me.awayTimer);
      me.awayTimer = setTimeout(() => this.expire(me), REJOIN_MS);
      this.broadcast({ t: 'm.away', id: me.id, secs: REJOIN_MS / 1000 });
      return;
    }
    this.lobby.setAway(me.key, null);
    const gone = [me];
    if (c === this.host) {
      // Sin anfitrión nadie simula a los bots: desaparecen de la partida.
      for (const e of this.ents) if (e.bot && e.alive) gone.push(e);
      this.host = null;
    }
    me.client = null;
    this.lobby.clientLeftMatch(c);
    if (this.status === 'ended') return;
    for (const e of gone) {
      const wasAlive = e.alive;
      e.alive = false;
      this.freeCars(e.id);
      if (wasAlive || this.mode.respawn) this.broadcast({ t: 'm.gone', id: e.id, reason });
    }
    if (!this.ents.some((e) => e.client || e.away)) return this.close();
    this.ready.delete(me.id);
    if (this.status === 'loading' && this.ents.every((e) => e.bot || !e.client || this.ready.has(e.id))) this.go();
    this.checkEnd();
  }

  // Ya no volvió a tiempo: sale de la partida como cualquier otro.
  expire(me) {
    if (!me.away) return;
    me.away = false;
    this.lobby.setAway(me.key, null);
    if (this.status === 'ended') return;
    const gone = [me];
    if (me.wasHost) {
      me.wasHost = false;
      for (const e of this.ents) if (e.bot && e.alive) gone.push(e);
    }
    for (const e of gone) {
      const wasAlive = e.alive;
      e.alive = false;
      this.freeCars(e.id);
      if (wasAlive || this.mode.respawn) this.broadcast({ t: 'm.gone', id: e.id, reason: 'disconnect' });
    }
    if (!this.ents.some((e) => e.client || e.away)) return this.close();
    this.checkEnd();
  }

  // Vuelve un jugador que había perdido la conexión: recibe lo que cambió.
  rejoin(c) {
    const me = this.ents.find((e) => e.away && e.key === c.key);
    if (!me || this.status === 'ended') return false;
    clearTimeout(me.awayTimer);
    me.away = false;
    me.client = c;
    c.match = this;
    this.lobby.setAway(me.key, null);
    if (me.wasHost) {
      me.wasHost = false;
      this.host = c;
    }
    this.send(c, {
      t: 'm.rejoin', id: this.id, you: me.id, host: this.entOf(this.host)?.id || 0, score: this.score,
      builds: [...this.builds.values()], chests: [...this.chestItems], taken: [...this.taken], drops: [...this.drops.values()],
      pads: this.pads, cars: [...this.cars], dead: this.ents.filter((e) => !e.alive).map((e) => e.id),
      away: this.ents.filter((e) => e.away).map((e) => e.id),
    });
    this.broadcast({ t: 'm.back', id: me.id }, c);
    if (c.key) this.lobby.statusChanged(c.key);
    return true;
  }

  // Cuenta como presente quien está conectado o reconectando.
  present(e) {
    if (e.bot) return !!this.host || this.ents.some((x) => x.wasHost && x.away);
    return !!e.client || !!e.away;
  }

  checkEnd() {
    if (this.status === 'ended') return;
    if (this.mode.respawn) {
      const humanTeams = new Set(this.ents.filter((e) => !e.bot && this.present(e)).map((e) => e.team));
      const botTeams = new Set(this.ents.filter((e) => e.bot && e.alive && this.present(e)).map((e) => e.team));
      const present = new Set([...humanTeams, ...botTeams]);
      const t = this.score.findIndex((s) => s >= this.scoreLimit);
      if (t >= 0) this.end(t);
      else if (present.size < 2 && this.status === 'playing') this.end([...present][0] ?? -1, 'abandono');
      return;
    }
    const alive = new Set();
    for (const e of this.ents) if (e.alive && this.present(e)) alive.add(e.team);
    if (alive.size <= 1) this.end(alive.size ? [...alive][0] : -1);
  }

  end(winner, reason = '') {
    if (this.status === 'ended') return;
    this.status = 'ended';
    clearTimeout(this.loadTimer);
    const db = this.lobby.db;
    for (const e of this.ents) {
      if (e.bot || !e.key) continue;
      const u = db.user(e.key);
      if (!u) continue;
      u.stats.matches++;
      u.stats.kills += e.kills;
      if (e.team === winner) u.stats.wins++;
    }
    db.save();
    const standings = this.ents.map((e) => ({ id: e.id, name: e.name, team: e.team, kills: e.kills, bot: e.bot }));
    this.broadcast({ t: 'm.end', winner, score: this.score, reason, standings });
    for (const e of this.ents) {
      if (!e.client) continue;
      const c = e.client;
      e.client = null;
      this.lobby.clientLeftMatch(c);
      const u = db.user(c.key);
      if (u) this.lobby.send(c, { t: 'stats', stats: u.stats });
    }
    this.close();
  }

  close() {
    clearTimeout(this.loadTimer);
    for (const e of this.ents) {
      clearTimeout(e.awayTimer);
      if (e.away) this.lobby.setAway(e.key, null);
      e.away = false;
    }
    this.status = 'ended';
    this.lobby.matchClosed(this);
  }
}
