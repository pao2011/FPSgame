// Partida online. El servidor no simula el mundo 3D: cada cliente simula a su
// propio jugador (y el anfitrión, además, a los bots) y el servidor reenvía
// los estados y arbitra lo que se comparte: cofres, objetos del suelo,
// vehículos, construcciones, eliminaciones, marcador y final de la partida.
import { RNG } from '../src/core/rng.js';
import { lootForChest, lootForAmmoBox } from '../src/game/items.js';

let nextMatch = 1;
const RELAY = new Set(['m.st', 'm.fx', 'm.ex', 'm.down', 'm.drop', 'm.bdmg', 'm.harv', 'm.veh', 'm.emote']);

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
    this.builds = new Set();
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
      case 'm.bots':
        if (c === this.host) {
          m.from = me.id;
          this.broadcast(m, c);
        }
        break;
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
          this.broadcast({ t: 'm.picked', id, by: this.owns(c, m.by) ? m.by : me.id });
        }
        break;
      }
      case 'm.build':
        if (typeof m.key !== 'string' || this.builds.has(m.key)) return;
        this.builds.add(m.key);
        m.from = me.id;
        this.broadcast(m, c);
        break;
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
    this.send(owner, { t: 'm.hit', to: target.id, by, dmg, type: String(m.type || 'bullet').slice(0, 12), head: !!m.head });
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
    const loot = m.kind === 'ammo' ? lootForAmmoBox(this.rng) : lootForChest(this.rng);
    const items = loot.map((it, k) => [`c${i}_${k}`, it]);
    this.broadcast({ t: 'm.chest', i, by: this.owns(c, m.by) ? m.by : me.id, items });
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
    if (!this.ents.some((e) => e.client)) return this.close();
    this.ready.delete(me.id);
    if (this.status === 'loading' && this.ents.every((e) => e.bot || !e.client || this.ready.has(e.id))) this.go();
    this.checkEnd();
  }

  checkEnd() {
    if (this.status === 'ended') return;
    if (this.mode.respawn) {
      const humanTeams = new Set(this.ents.filter((e) => e.client).map((e) => e.team));
      const botTeams = new Set(this.host ? this.ents.filter((e) => e.bot && e.alive).map((e) => e.team) : []);
      const present = new Set([...humanTeams, ...botTeams]);
      const t = this.score.findIndex((s) => s >= this.scoreLimit);
      if (t >= 0) this.end(t);
      else if (present.size < 2 && this.status === 'playing') this.end([...present][0] ?? -1, 'abandono');
      return;
    }
    const alive = new Set();
    for (const e of this.ents) if (e.alive && (e.bot ? !!this.host : !!e.client)) alive.add(e.team);
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
    this.status = 'ended';
    this.lobby.matchClosed(this);
  }
}
