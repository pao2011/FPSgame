import * as THREE from 'three';
import { RemotePlayer, heldCode, modeCode, F_CROUCH, F_KNOCKED, F_ALIVE, F_SPRINT, F_SWING, F_ZIP, F_SLIDE } from './remote.js';
import { MODES } from '../game/modes.js';
import { PICKAXE } from '../game/items.js';
import { clamp } from '../core/rng.js';
import { ISLAND_RADIUS } from '../world/constants.js';
import { VoiceChat } from './voice.js';

// Lo de la Isla de Inicio (fuera del mapa) se borra al salir el autobús.
const offMap = (x, z) => Math.hypot(x, z) > ISLAND_RADIUS + 120;

const ST_RATE = 1 / 15; // estado del jugador: 15 veces por segundo
const BOT_RATE = 1 / 10;
const VEH_RATE = 1 / 12;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const tmp = new THREE.Vector3();

// Sincroniza una partida online: crea a los demás jugadores, envía nuestro
// estado y aplica lo que llega del servidor sobre los sistemas del juego.
export class OnlineMatch {
  constructor(game, net, info) {
    this.game = game;
    this.net = net;
    this.info = info;
    this.id = info.id;
    this.you = info.you;
    this.isHost = info.host === info.you;
    this.mode = MODES[info.mode];
    this.ents = new Map(); // id de red -> personaje
    this.remotes = [];
    this.stT = 0;
    this.botT = 0;
    this.vehT = 0;
    this.dropN = 0;
    this.started = false;
    this.ended = false;
    this.offs = [];
    this.offline = false; // conexión perdida, esperando volver a la partida
    this.seenBuilds = new Set();
    const me = info.ents.find((e) => e.id === info.you);
    this.myTeam = me?.team ?? 0;
    this.myName = me?.name ?? 'Tú';
    this.handlers = {
      'm.go': () => this.go(),
      'm.st': (m) => this.ents.get(m.from)?.isRemote && this.ents.get(m.from).applyState(m, this.now),
      'm.bots': (m) => this.onBots(m),
      'm.fx': (m) => this.onFx(m),
      'm.ex': (m) => this.game.explosives.onNet(this.ents.get(m.s), m),
      'm.hit': (m) => this.onHit(m),
      'm.revive': (m) => this.onRevive(m),
      'm.down': (m) => this.onDown(m),
      'm.elim': (m) => this.onElim(m),
      'm.score': (m) => (this.game.score = m.score),
      'm.chest': (m) => this.onChest(m),
      'm.picked': (m) => this.onPicked(m),
      'm.pickup_no': (m) => {
        const pk = this.game.pickups.byNid.get(m.id);
        if (pk) pk.pending = false;
      },
      'm.drop': (m) => this.onDrop(m),
      'm.build': (m) => {
        this.seenBuilds.add(m.key);
        this.game.build.netPlace(m);
      },
      'm.bedit': (m) => this.game.build.netEdit(m),
      'm.bdmg': (m) => {
        const piece = this.game.build.pieces.get(m.key);
        if (piece) this.game.build.damage(piece, m.d, true);
      },
      'm.ping': (m) => {
        if (Array.isArray(m.p) && m.team === this.myTeam) this.game.addPing(new THREE.Vector3(m.p[0], m.p[1], m.p[2]), this.name(m.from), false);
      },
      'm.bdoor': (m) => {
        const piece = this.game.build.pieces.get(m.key);
        if (piece) this.game.build.setDoor(piece, !!m.open, true);
      },
      'm.brm': (m) => {
        const piece = this.game.build.pieces.get(m.key);
        if (piece) this.game.build.remove(piece, true);
      },
      'm.harv': (m) => {
        const obj = this.game.harvest.list[m.i];
        if (obj) this.game.harvest.hit(obj, m.d, null, true);
      },
      'm.veh_in': (m) => this.game.vehicles.netEnter(m.i, this.ents.get(m.id)),
      'm.veh_no': () => this.game.hud.toast('Ese coche ya tiene conductor'),
      'm.veh_out': (m) => this.game.vehicles.netExit(m.i, m),
      'm.veh': (m) => {
        const v = this.game.vehicles.list[m.i];
        if (v && v.remoteDriver) v.netTarget = m;
      },
      'm.gone': (m) => this.onGone(m),
      'm.emote': (m) => {
        const e = this.ents.get(m.s);
        if (!e?.isRemote) return;
        if (m.e) e.startEmote(m.e);
        else e.stopEmote();
      },
      'm.wdoor': (m) => {
        const d = this.game.mapDoors.list[m.i];
        if (d) this.game.mapDoors.setOpen(d, !!m.open, true);
      },
      'm.vboom': (m) => this.game.vehicles.list[m.i]?.destroy(true),
      'm.pad': (m) => Array.isArray(m.p) && this.game.combat.addPad(m.p[0], m.p[1], m.p[2], m.y || 0),
      'm.away': (m) => this.onAway(m, true),
      'm.back': (m) => this.onAway(m, false),
      'm.rejoin': (m) => this.onRejoin(m),
      auth_ok: () => {
        // Reconectado: si la partida aún nos guarda el sitio llega m.rejoin;
        // si no llega enseguida, la partida ya no existe.
        if (!this.offline || this.ended) return;
        clearTimeout(this.rejoinWait);
        this.rejoinWait = setTimeout(() => this.offline && this.giveUp(), 4000);
      },
      'm.end': (m) => this.onEnd(m),
    };
    for (const [t, fn] of Object.entries(this.handlers)) this.offs.push(net.on(t, fn));
    this.offs.push(net.on('disconnected', () => this.onDisconnected()));
  }

  get now() {
    return performance.now() / 1000;
  }

  // Crea los personajes remotos y asigna identificadores de red.
  setup() {
    const g = this.game;
    g.player.netId = this.you;
    this.ents.set(this.you, g.player);
    for (const b of g.bots.list) this.ents.set(b.netId, b);
    for (const e of this.info.ents) {
      if (e.id === this.you || (e.bot && this.isHost)) continue;
      const rp = new RemotePlayer(g, e);
      this.remotes.push(rp);
      this.ents.set(e.id, rp);
    }
  }

  ready() {
    this.net.send('m.ready');
  }

  go() {
    if (this.started) return;
    this.started = true;
    this.game.onOnlineGo();
    if (this.game.settings.voice && this.remotes.some((r) => r.isHuman)) {
      this.voice = new VoiceChat(this.game, this);
      this.voice.start();
    }
  }

  dispose() {
    this.voice?.stop();
    this.voice = null;
    clearTimeout(this.rejoinTimer);
    clearTimeout(this.rejoinWait);
    this.game.hud.netBanner?.(null);
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const r of this.remotes) r.remove();
    this.remotes.length = 0;
    this.ents.clear();
  }

  leave() {
    if (!this.ended) this.net.send('leave_match');
    this.ended = true;
    this.dispose();
  }

  isLocal(c) {
    return !!c && !c.isRemote && (c === this.game.player || (c.isBot && this.isHost));
  }

  name(id) {
    return this.info.ents.find((e) => e.id === id)?.name || '?';
  }

  // ------------------------------------------------------------ ENVÍO
  update(dt) {
    const now = this.now;
    for (const r of this.remotes) r.update(dt, now);
    if (!this.started || this.ended || this.offline) return;
    this.stT -= dt;
    if (this.stT <= 0) {
      this.stT = ST_RATE;
      this.sendState();
    }
    if (this.isHost && this.game.bots.list.length) {
      this.botT -= dt;
      if (this.botT <= 0) {
        this.botT = BOT_RATE;
        this.sendBots();
      }
    }
    const v = this.game.player.vehicle;
    if (v) {
      this.vehT -= dt;
      if (this.vehT <= 0) {
        this.vehT = VEH_RATE;
        this.net.send('m.veh', { i: v.index, p: [r2(v.pos.x), r2(v.pos.y), r2(v.pos.z)], h: r3(v.heading), s: r2(v.speed), st: r2(v.steer) });
      }
    }
  }

  flags(c, swing) {
    return (c.crouching ? F_CROUCH : 0) | (c.knocked ? F_KNOCKED : 0) | (c.alive ? F_ALIVE : 0) | (c.sprinting ? F_SPRINT : 0) | (swing ? F_SWING : 0) | (c.zip ? F_ZIP : 0) | (c.sliding ? F_SLIDE : 0);
  }

  sendState() {
    const g = this.game;
    const p = g.player;
    const item = g.build.active ? null : p.item;
    const swing = g.combat.swingT > 0.4;
    this.net.sendRaw(JSON.stringify({
      t: 'm.st', p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], y: r3(p.yaw), pi: r3(p.pitch), m: modeCode(p.mode),
      f: this.flags(p, swing), hp: Math.ceil(p.knocked ? p.knockHp : p.health), sh: Math.ceil(p.shield),
      h: heldCode(item), v: p.vehicle ? p.vehicle.index : -1,
    }));
  }

  sendBots() {
    const b = [];
    for (const bot of this.game.bots.list) {
      if (!bot.alive && bot.sentDead) continue;
      bot.sentDead = !bot.alive;
      b.push([
        bot.netId, r2(bot.pos.x), r2(bot.pos.y), r2(bot.pos.z), r3(bot.yaw), r3(bot.pitch), modeCode(bot.mode),
        this.flags(bot, bot.swingT > 0.4), Math.ceil(bot.knocked ? bot.knockHp : bot.health), Math.ceil(bot.shield),
        heldCode(bot.weapon || PICKAXE), -1,
      ]);
    }
    if (b.length) this.net.sendRaw(JSON.stringify({ t: 'm.bots', b }));
  }

  onBots(m) {
    const now = this.now;
    for (const a of m.b) {
      const e = this.ents.get(a[0]);
      if (!e?.isRemote) continue;
      e.applyState({ p: [a[1], a[2], a[3]], y: a[4], pi: a[5], m: a[6], f: a[7], hp: a[8], sh: a[9], h: a[10], v: a[11] }, now);
    }
  }

  // Disparo (para que los demás vean las trazadoras y lo oigan).
  shotFx(shooter, sound, from, ends) {
    if (!this.started) return;
    this.net.sendRaw(JSON.stringify({
      t: 'm.fx', s: shooter.netId, w: sound, o: [r2(from.x), r2(from.y), r2(from.z)],
      e: ends.slice(0, 4).map((v) => [r2(v.x), r2(v.y), r2(v.z)]),
    }));
  }

  onFx(m) {
    const g = this.game;
    const shooter = this.ents.get(m.s);
    const o = tmp.set(m.o[0], m.o[1], m.o[2]);
    const from = shooter?.isRemote && shooter.model.root.visible ? shooter.muzzleWorld(new THREE.Vector3()) : o.clone();
    const d = from.distanceTo(g.camera.position);
    const beam = m.w === 'plasma';
    if (d < 260) {
      for (const e of m.e) {
        const end = new THREE.Vector3(e[0], e[1], e[2]);
        g.effects.tracer(from, end, beam ? 0x3ff0e0 : 0xffe0a0, beam ? 0.045 : 0.02, beam ? 0.14 : 0.07);
        g.effects.nearMiss(from, end, shooter);
      }
    }
    const vol = clamp(1 - d / 260, 0, 1);
    if (vol > 0.03) g.audio.shot(m.w, vol * vol * 0.9, from);
    if (d < 150 && m.w !== 'bow') g.effects.muzzleFlash(null, from);
    if (shooter) g.noise(shooter.pos, m.w === 'sniper' || m.w === 'dmr' ? 160 : 90, shooter);
  }

  // Lanzamiento de un explosivo (granada, C4, cohete…) o detonación de C4.
  sendEx(owner, data) {
    if (!this.started || !this.isLocal(owner)) return;
    const msg = { t: 'm.ex', s: owner.netId, a: data.a };
    if (data.k) msg.k = data.k;
    if (data.r !== undefined) msg.r = data.r;
    if (data.o) msg.o = [r2(data.o.x), r2(data.o.y), r2(data.o.z)];
    if (data.v) msg.v = [r2(data.v.x), r2(data.v.y), r2(data.v.z)];
    this.net.sendRaw(JSON.stringify(msg));
  }

  // ------------------------------------------------------------ COMBATE
  sendHit(target, dmg, type, attacker) {
    const by = attacker?.netId || this.you;
    if (attacker && !this.isLocal(attacker)) return;
    this.net.send('m.hit', { to: target.netId, by, dmg: Math.round(dmg * 10) / 10, type });
  }

  onHit(m) {
    const target = this.ents.get(m.to);
    if (!this.isLocal(target)) return;
    const attacker = this.ents.get(m.by) || null;
    target.damage(m.dmg, m.type, attacker);
  }

  sendRevive(target) {
    this.net.send('m.revive', { to: target.netId, by: this.you });
  }

  onRevive(m) {
    const target = this.ents.get(m.to);
    if (!this.isLocal(target) || !target.alive || !target.knocked) return;
    target.revive();
    this.game.onRevive(target, this.ents.get(m.by) || target);
  }

  sendDown(victim, attacker) {
    this.net.send('m.down', { id: victim.netId, by: attacker?.netId || 0 });
  }

  onDown(m) {
    const victim = this.ents.get(m.id);
    if (!victim?.isRemote || !victim.alive) return;
    victim.knocked = true;
    this.game.onKnock(victim, this.ents.get(m.by) || null, 'bullet');
  }

  sendElim(victim, killer, type) {
    this.net.send('m.elim', { id: victim.netId, by: killer?.netId || 0, type });
  }

  onElim(m) {
    if (m.score) this.game.score = m.score;
    const victim = this.ents.get(m.id);
    if (!victim?.isRemote || victim.dead) return;
    victim.netEliminate(!this.mode.respawn);
    this.game.onElimination(victim, this.ents.get(m.by) || null, m.type);
  }

  onGone(m) {
    const e = this.ents.get(m.id);
    if (!e) return;
    const g = this.game;
    if (e.isRemote) {
      const wasAlive = e.alive;
      e.remove();
      g.chars = g.chars.filter((c) => c !== e);
      this.remotes = this.remotes.filter((r) => r !== e);
      if (e.isHuman) g.hud.killFeed(`<b class="${g.teamTag(e)}">${e.name}</b> ha abandonado la partida`, false);
      if (g.spectating === e) g.nextSpectate();
      if (wasAlive) g.checkEnd();
    }
  }

  onEnd(m) {
    this.ended = true;
    this.game.onOnlineEnd(m);
  }

  // Corte de conexión: la partida sigue en local mientras el cliente intenta
  // reconectar; el servidor nos guarda el sitio REJOIN_MS (45 s).
  onDisconnected() {
    if (this.ended || this.offline) return;
    if (!this.started) return this.giveUp();
    this.offline = true;
    this.offlineAt = this.now;
    this.game.hud.netBanner?.('Conexión perdida. Reconectando…', 45);
    this.rejoinTimer = setTimeout(() => this.giveUp(), 46000);
  }

  giveUp() {
    if (this.ended) return;
    this.ended = true;
    this.offline = false;
    clearTimeout(this.rejoinTimer);
    clearTimeout(this.rejoinWait);
    this.game.hud.netBanner?.(null);
    this.game.onOnlineEnd({ winner: -2, reason: 'desconexión' });
  }

  // Otro jugador pierde la conexión (true) o vuelve (false).
  onAway(m, away) {
    const e = this.ents.get(m.id);
    if (!e?.isRemote) return;
    e.away = away;
    const tag = `<b class="${this.game.teamTag(e)}">${e.name}</b>`;
    this.game.hud.killFeed(away ? `${tag} ha perdido la conexión (reconectando…)` : `${tag} ha vuelto a la partida`, false);
    // Si era el anfitrión, sus bots se quedan quietos hasta que vuelva.
  }

  // De vuelta en la partida: se aplica lo que cambió mientras no estábamos.
  onRejoin(m) {
    if (m.id !== this.id || this.ended) return;
    const g = this.game;
    this.offline = false;
    clearTimeout(this.rejoinTimer);
    clearTimeout(this.rejoinWait);
    g.hud.netBanner?.(null);
    g.hud.toast('¡Conexión recuperada! Has vuelto a la partida');
    if (m.score) g.score = m.score;
    // Construcciones: añadir las nuevas, poner al día ediciones y puertas y
    // quitar las que se rompieron.
    const keys = new Set();
    const lobbyGone = g.phase !== 'lobby';
    for (const b of m.builds || []) {
      if (lobbyGone && offMap(b.cx * 4 + 2, b.cz * 4 + 2)) continue;
      keys.add(b.key);
      this.seenBuilds.add(b.key);
      let piece = g.build.pieces.get(b.key);
      if (!piece) {
        g.build.netPlace(b);
        piece = g.build.pieces.get(b.key);
      } else if ((piece.edit | 0) !== (b.edit | 0)) g.build.netEdit({ key: b.key, mask: b.edit | 0, dir: b.dir });
      if (piece && !!piece.doorOpen !== !!b.open) g.build.setDoor(piece, !!b.open, true);
    }
    for (const piece of [...g.build.pieces.values()]) {
      if (this.seenBuilds.has(piece.key) && !keys.has(piece.key)) g.build.remove(piece, false);
    }
    // Cofres abiertos (con el botín que aún queda en el suelo) y objetos cogidos
    const taken = new Set(m.taken || []);
    for (const [i, items] of m.chests || []) {
      const c = g.containers.list[i];
      if (c && !c.opened) g.containers.openNet(c, items.filter((x) => !taken.has(x[0])), {});
    }
    for (const id of taken) {
      const pk = g.pickups.byNid.get(id);
      if (pk) g.pickups.remove(pk);
    }
    this.onDrop({ items: (m.drops || []).filter((d) => !taken.has(d[0]) && !(lobbyGone && offMap(d[2], d[4]))) });
    const padKey = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
    const have = new Set(g.combat.pads.map((p) => padKey(p.pos.x, p.pos.z)));
    for (const p of m.pads || []) if (!(lobbyGone && offMap(p.p[0], p.p[2])) && !have.has(padKey(p.p[0], p.p[2]))) g.combat.addPad(p.p[0], p.p[1], p.p[2], p.y || 0);
    // Quién cayó mientras tanto
    for (const id of m.dead || []) {
      const e = this.ents.get(id);
      if (e?.isRemote && !e.dead && !this.mode.respawn) {
        e.netEliminate(true);
        g.chars = g.chars.filter((c) => c !== e);
      }
    }
    for (const id of m.away || []) {
      const e = this.ents.get(id);
      if (e?.isRemote) e.away = true;
    }
    g.checkEnd?.();
  }

  // ------------------------------------------------------------ MUNDO
  dropId() {
    return `d${this.you}_${++this.dropN}`;
  }

  sendDrop(pk) {
    const p = pk.pos, v = pk.vel;
    this.net.send('m.drop', { items: [[pk.nid, pk.item, r2(p.x), r2(p.y), r2(p.z), r2(v.x), r2(v.y), r2(v.z), pk.settled ? 1 : 0]] });
  }

  onDrop(m) {
    for (const [id, item, x, y, z, vx, vy, vz, settled] of m.items) {
      if (this.game.pickups.byNid.has(id)) continue;
      this.game.pickups.spawn(item, new THREE.Vector3(x, y, z), settled ? null : new THREE.Vector3(vx, vy, vz), id);
    }
  }

  requestPickup(pk) {
    if (pk.pending) return;
    pk.pending = true;
    pk.pendingT = this.now;
    this.net.send('m.pickup', { id: pk.nid, by: this.you });
  }

  // Un bot del anfitrión coge algo (optimista).
  claimPickup(pk, bot) {
    if (pk.nid) this.net.send('m.pickup', { id: pk.nid, by: bot.netId });
  }

  onPicked(m) {
    const g = this.game;
    const pk = g.pickups.byNid.get(m.id);
    if (!pk) return;
    if (m.by === this.you) g.applyPickup(pk);
    else g.pickups.remove(pk);
  }

  requestChest(c, opener) {
    if (c.requested) return;
    c.requested = true;
    this.net.send('m.chest', { i: c.index, kind: c.kind, by: opener?.netId || this.you });
  }

  onChest(m) {
    const c = this.game.containers.list[m.i];
    if (c) this.game.containers.openNet(c, m.items, this.ents.get(m.by));
  }

  sendEmote(c, id) {
    if (this.isLocal(c)) this.net.send('m.emote', { s: c.netId, e: id || '' });
  }

  sendMapDoor(door) {
    this.net.send('m.wdoor', { i: door.i, open: door.open });
  }

  sendVehicleBoom(v) {
    this.net.send('m.vboom', { i: v.index });
  }

  sendPad(x, y, z, yaw) {
    this.net.send('m.pad', { p: [r2(x), r2(y), r2(z)], y: r3(yaw) });
  }

  sendBuild(piece) {
    this.seenBuilds.add(piece.key);
    this.net.send('m.build', { key: piece.key, type: piece.type, cx: piece.cx, cz: piece.cz, base: piece.base, dir: piece.dir, mat: piece.mat, edit: piece.edit, team: piece.team });
  }

  sendPing(pos) {
    this.net.send('m.ping', { p: [r2(pos.x), r2(pos.y), r2(pos.z)], team: this.myTeam });
  }

  sendBuildDoor(piece) {
    this.net.send('m.bdoor', { key: piece.key, open: piece.doorOpen });
  }

  sendBuildEdit(piece) {
    // mask = casillas quitadas (src/game/build.js)
    this.net.send('m.bedit', { key: piece.key, mask: piece.edit | 0, dir: piece.dir });
  }

  sendBuildDamage(piece, d) {
    this.net.send('m.bdmg', { key: piece.key, d: Math.round(d) });
  }

  sendBuildRemove(piece) {
    this.net.send('m.brm', { key: piece.key });
  }

  sendHarvest(obj, d) {
    this.net.send('m.harv', { i: obj.hid, d });
  }

  requestVehicle(v, who) {
    this.net.send('m.veh_in', { i: v.index, by: who.netId });
  }

  sendVehicleExit(v) {
    this.net.send('m.veh_out', { i: v.index, p: [r2(v.pos.x), r2(v.pos.y), r2(v.pos.z)], h: r3(v.heading) });
  }

  // Rayo contra los personajes remotos.
  raycast(o, dir, maxT, ignore) {
    let best = null;
    for (const r of this.remotes) {
      if (r === ignore) continue;
      const h = r.raycastHit(o, dir, best ? best.t : maxT);
      if (h) best = { ...h, entity: r };
    }
    return best;
  }
}
