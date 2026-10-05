// Progreso del jugador: XP del pase de batalla, tokens, objetos conseguidos,
// logros y estadísticas. Se guarda en el navegador y, con sesión online, en
// la cuenta del servidor (gana la copia con más cambios: `rev`).
import { PASS, PASS_REWARDS, SHOP, ACHIEVEMENTS, WELCOME_TOKENS, COSMETIC_KEYS, COSMETIC_TYPES, cosmetic, isFreeCosmetic } from './cosmetics.js';

const KEY = 'islaRoyale.progress.v1';

// Desafíos: stat = campo del resumen de la partida que suma progreso.
export const DAILY = [
  { id: 'd_kills3', name: 'Elimina a 3 rivales', stat: 'kills', goal: 3, xp: 600 },
  { id: 'd_chests5', name: 'Abre 5 cofres', stat: 'chests', goal: 5, xp: 500 },
  { id: 'd_dmg500', name: 'Causa 500 de daño', stat: 'damage', goal: 500, xp: 500 },
  { id: 'd_build50', name: 'Construye 50 piezas', stat: 'built', goal: 50, xp: 400 },
  { id: 'd_play2', name: 'Juega 2 partidas', stat: 'matches', goal: 2, xp: 400 },
  { id: 'd_top10', name: 'Queda entre los 10 mejores', stat: 'top10', goal: 1, xp: 600 },
  { id: 'd_heads3', name: 'Acierta 3 disparos a la cabeza', stat: 'heads', goal: 3, xp: 500 },
  { id: 'd_edit10', name: 'Edita 10 construcciones', stat: 'edits', goal: 10, xp: 400 },
  { id: 'd_walk1k', name: 'Recorre 1.000 m a pie', stat: 'distance', goal: 1000, xp: 400 },
  { id: 'd_emote', name: 'Haz un gesto en una partida', stat: 'emotes', goal: 1, xp: 300 },
  { id: 'd_survive10', name: 'Sobrevive 10 minutos en total', stat: 'minutes', goal: 10, xp: 500 },
];
export const WEEKLY = [
  { id: 'w_kills25', name: 'Elimina a 25 rivales', stat: 'kills', goal: 25, xp: 2500, tokens: 50 },
  { id: 'w_win1', name: 'Gana una partida', stat: 'wins', goal: 1, xp: 3000, tokens: 75 },
  { id: 'w_chests30', name: 'Abre 30 cofres', stat: 'chests', goal: 30, xp: 2000, tokens: 40 },
  { id: 'w_dmg5k', name: 'Causa 5.000 de daño', stat: 'damage', goal: 5000, xp: 2500, tokens: 50 },
  { id: 'w_build400', name: 'Construye 400 piezas', stat: 'built', goal: 400, xp: 2000, tokens: 40 },
  { id: 'w_top10x5', name: 'Queda 5 veces entre los 10 mejores', stat: 'top10', goal: 5, xp: 2500, tokens: 50 },
  { id: 'w_play10', name: 'Juega 10 partidas', stat: 'matches', goal: 10, xp: 2000, tokens: 40 },
  { id: 'w_heads25', name: 'Acierta 25 disparos a la cabeza', stat: 'heads', goal: 25, xp: 2500, tokens: 50 },
  { id: 'w_online3', name: 'Juega 3 partidas online', stat: 'online', goal: 3, xp: 2000, tokens: 40 },
];
const CHALLENGES = Object.fromEntries([...DAILY, ...WEEKLY].map((c) => [c.id, c]));

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-S${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
}
// Elige n desafíos con una semilla (la misma para el mismo día/semana).
function pickSeeded(list, n, key) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pool = list.slice();
  const out = [];
  while (out.length < n && pool.length) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}
export function challengeDef(id) {
  return CHALLENGES[id];
}

function fresh() {
  return {
    v: 1, rev: 0, season: PASS.season, xp: 0, tokens: WELCOME_TOKENS, premium: false,
    owned: Object.fromEntries(COSMETIC_KEYS.map((k) => [k, []])),
    granted: { free: 0, premium: 0, extra: 0 },
    achievements: [],
    stats: { matches: 0, wins: 0, kills: 0, top10: 0, heads: 0, chests: 0, built: 0, edits: 0, online: 0, prefabs: 0, damage: 0 },
    seen: [], // objetos nuevos ya vistos en la taquilla
    challenges: { day: '', week: '', daily: [], weekly: [] },
    modes: {}, // estadísticas por modo: { solo: { matches, wins, kills } }
  };
}

export class Progress {
  constructor(game) {
    this.game = game;
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.adopt(JSON.parse(raw), false);
    } catch {
      /* almacenamiento no disponible */
    }
    this.listeners = new Set();
    // Recompensas del nivel 1 (y las que falten si cambia el pase)
    const fresh1 = this.grantTiers().length;
    if (this.refreshChallenges() || fresh1) this.save(false);
  }

  adopt(d, save = true) {
    const f = fresh();
    const out = { ...f, ...d, owned: { ...f.owned, ...d.owned }, granted: { ...f.granted, ...d.granted }, stats: { ...f.stats, ...d.stats } };
    for (const t of COSMETIC_KEYS) out.owned[t] = (out.owned[t] || []).filter((id) => cosmetic(t, id));
    out.challenges = { ...f.challenges, ...(d.challenges || {}) };
    out.modes = { ...(d.modes || {}) };
    this.data = out;
    this.refreshChallenges();
    if (save) this.save(false);
  }

  // Desafíos nuevos cada día (3) y cada semana (4).
  refreshChallenges() {
    const c = this.data.challenges;
    const day = dayKey(), week = weekKey();
    let changed = false;
    if (c.day !== day) {
      c.day = day;
      c.daily = pickSeeded(DAILY, 3, day).map((x) => ({ id: x.id, v: 0, done: false }));
      changed = true;
    }
    if (c.week !== week) {
      c.week = week;
      c.weekly = pickSeeded(WEEKLY, 4, week).map((x) => ({ id: x.id, v: 0, done: false }));
      changed = true;
    }
    return changed;
  }

  // Suma progreso a los desafíos; devuelve los completados.
  advanceChallenges(r) {
    this.refreshChallenges();
    const done = [];
    const c = this.data.challenges;
    for (const ch of [...c.daily, ...c.weekly]) {
      const def = CHALLENGES[ch.id];
      if (!def || ch.done) continue;
      ch.v = Math.min(def.goal, ch.v + (Number(r[def.stat]) || 0));
      if (ch.v >= def.goal) {
        ch.done = true;
        done.push(def);
      }
    }
    return done;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  save(bump = true) {
    if (bump) this.data.rev++;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* almacenamiento no disponible */
    }
    const n = this.game.netClient;
    if (bump && n?.authed) n.send('profile', { profile: this.data });
    for (const fn of this.listeners) fn();
  }

  // Al iniciar sesión: se queda la copia con más cambios.
  syncWithAccount(serverProfile) {
    const n = this.game.netClient;
    if (serverProfile && (Number(serverProfile.rev) || 0) > this.data.rev) {
      this.adopt(serverProfile, true);
      for (const fn of this.listeners) fn();
    } else n.send('profile', { profile: this.data });
  }

  // ------------------------------------------------------------ CONSULTAS
  get tokens() {
    return this.data.tokens;
  }

  get premium() {
    return this.data.premium;
  }

  // Nivel (1…) y XP dentro del nivel actual. El nivel 1 ya da su recompensa.
  get level() {
    return Math.floor(this.data.xp / PASS.xpPerTier) + 1;
  }

  get tier() {
    return Math.min(PASS.tiers, this.level);
  }

  get tierXp() {
    return this.data.xp % PASS.xpPerTier;
  }

  owns(type, id) {
    return isFreeCosmetic(type, id) || !!this.data.owned[type]?.includes(id);
  }

  ownedList(type) {
    return this.data.owned[type] || [];
  }

  // ------------------------------------------------------------ RECOMPENSAS
  grant(r, out) {
    if (!r) return;
    if (r.type === 'tokens') {
      this.data.tokens += r.amount;
      out.push(r);
    } else if (!this.owns(r.type, r.id)) {
      this.data.owned[r.type].push(r.id);
      out.push(r);
    }
  }

  // Entrega lo que corresponda según el nivel alcanzado (y la versión premium).
  grantTiers() {
    const out = [];
    const g = this.data.granted;
    const tier = this.tier;
    for (let t = g.free + 1; t <= tier; t++) this.grant(PASS_REWARDS[t - 1].free, out);
    g.free = Math.max(g.free, tier);
    if (this.data.premium) {
      for (let t = g.premium + 1; t <= tier; t++) this.grant(PASS_REWARDS[t - 1].premium, out);
      g.premium = Math.max(g.premium, tier);
    }
    // Niveles extra al completar el pase: tokens
    const extra = Math.max(0, this.level - PASS.tiers);
    for (let k = g.extra; k < extra; k++) this.grant({ type: 'tokens', amount: PASS.extraTokens }, out);
    g.extra = Math.max(g.extra, extra);
    return out;
  }

  addXp(xp) {
    this.data.xp += Math.max(0, Math.round(xp));
    return this.grantTiers();
  }

  // ------------------------------------------------------------ COMPRAS
  buy(item) {
    if (item.type === 'pass') {
      if (this.data.premium) return { error: 'Ya tienes el pase premium' };
      if (this.data.tokens < item.price) return { error: `Te faltan ${item.price - this.data.tokens} tokens` };
      this.data.tokens -= item.price;
      this.data.premium = true;
      const rewards = this.grantTiers();
      this.save();
      return { ok: true, rewards };
    }
    if (this.owns(item.type, item.id)) return { error: 'Ya lo tienes' };
    if (this.data.tokens < item.price) return { error: `Te faltan ${item.price - this.data.tokens} tokens` };
    this.data.tokens -= item.price;
    this.data.owned[item.type].push(item.id);
    this.save();
    return { ok: true };
  }

  shop() {
    return SHOP;
  }

  // ------------------------------------------------------------ PARTIDAS
  // Suma estadísticas, calcula la XP de la partida y comprueba logros.
  // r = { kills, damage, chests, built, edits, heads, time, place, players, win, online, respawn }
  matchEnd(r) {
    const s = this.data.stats;
    const lines = [];
    const add = (label, xp) => {
      xp = Math.round(xp);
      if (xp > 0) lines.push({ label, xp });
    };
    add('Partida jugada', 100);
    add(`Tiempo de juego (${Math.floor(r.time / 60)} min)`, Math.min(300, r.time / 3));
    if (r.kills) add(`Eliminaciones ×${r.kills}`, r.kills * 75);
    if (r.damage) add(`Daño causado (${Math.round(r.damage)})`, Math.min(400, r.damage / 5));
    if (r.chests) add(`Cofres abiertos ×${r.chests}`, r.chests * 20);
    if (r.built) add(`Construcción (${r.built} piezas)`, Math.min(100, r.built));
    if (r.edits) add(`Ediciones ×${r.edits}`, Math.min(100, r.edits * 5));
    if (r.win) add('¡Victoria!', r.respawn ? 300 : 500);
    else if (!r.respawn && r.place && r.place <= 5) add(`Top 5 (puesto #${r.place})`, 200);
    else if (!r.respawn && r.place && r.place <= 10) add(`Top 10 (puesto #${r.place})`, 100);
    let total = lines.reduce((a, l) => a + l.xp, 0);
    if (r.online) {
      const bonus = Math.round(total * 0.25);
      lines.push({ label: 'Bonus online (+25 %)', xp: bonus });
      total += bonus;
    }

    s.matches++;
    s.kills += r.kills;
    s.damage += Math.round(r.damage);
    s.chests += r.chests;
    s.built += r.built;
    s.edits += r.edits || 0;
    s.heads += r.heads || 0;
    if (r.win) s.wins++;
    if (r.win || (!r.respawn && r.place && r.place <= 10)) s.top10++;
    if (r.online) s.online++;

    // Estadísticas por modo
    if (r.mode) {
      const m = (this.data.modes[r.mode] ||= { matches: 0, wins: 0, kills: 0 });
      m.matches++;
      m.kills += r.kills;
      if (r.win) m.wins++;
    }
    // Desafíos diarios y semanales
    const top10 = r.win || (!r.respawn && r.place && r.place <= 10) ? 1 : 0;
    const chDone = this.advanceChallenges({ ...r, matches: 1, wins: r.win ? 1 : 0, top10, online: r.online ? 1 : 0, minutes: Math.floor(r.time / 60) });
    for (const ch of chDone) {
      lines.push({ label: `Desafío: ${ch.name}`, xp: ch.xp });
      total += ch.xp;
      if (ch.tokens) this.data.tokens += ch.tokens;
    }

    const levelBefore = this.level;
    const ach = this.checkAchievements();
    for (const a of ach) {
      lines.push({ label: `Logro: ${a.name}`, xp: a.xp });
      total += a.xp;
    }
    const rewards = this.addXp(total);
    this.save();
    return { lines, total, levelBefore, level: this.level, rewards, achievements: ach, challenges: chDone };
  }

  // Estadísticas sueltas fuera de una partida (p. ej. el modo creativo).
  bump(stat, n = 1) {
    this.data.stats[stat] = (this.data.stats[stat] || 0) + n;
    const ach = this.checkAchievements();
    let rewards = [];
    if (ach.length) rewards = this.addXp(ach.reduce((a, x) => a + x.xp, 0));
    this.save();
    return { achievements: ach, rewards };
  }

  checkAchievements() {
    const got = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements.includes(a.id)) continue;
      if ((this.data.stats[a.stat] || 0) >= a.goal) {
        this.data.achievements.push(a.id);
        got.push(a);
      }
    }
    return got;
  }
}

export function rewardText(r) {
  if (!r) return '';
  if (r.type === 'tokens') return `${r.amount} tokens`;
  const c = cosmetic(r.type, r.id);
  const kind = COSMETIC_TYPES[r.type]?.name;
  return c ? `${kind}: ${c.name}` : '';
}
