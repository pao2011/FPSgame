// Anti-trampas básico: el servidor no simula disparos, pero sí puede descartar
// impactos imposibles. Para cada atacante recuerda el arma que lleva en la mano
// (según su último estado) y su posición, y comprueba:
//  · daño máximo por impacto según arma, rareza, perdigones y tiro a la cabeza;
//  · cadencia: un «cubo» de daño por atacante que se rellena según la cadencia
//    del arma (con margen para la latencia);
//  · distancia entre atacante y víctima según el alcance del arma.
// Los impactos descartados se cuentan; no se expulsa a nadie automáticamente.
import { WEAPONS } from '../src/game/items.js';

const SWITCH_GRACE = 1.5; // s en los que aún vale el arma anterior tras cambiar
const CAPS = { pickaxe: { dmg: 25, dist: 10 }, explosion: { dmg: 260 }, car: { dmg: 130 }, fire: { dmg: 30 } };

function weaponOf(code) {
  if (typeof code !== 'string' || code[0] !== 'w') return null;
  const [type, r] = code.slice(1).split(':');
  const def = WEAPONS[type];
  if (!def) return null;
  const rarity = Math.max(0, Math.min(def.damage.length - 1, Number(r) | 0));
  const base = def.damage[rarity];
  const shot = base * (def.headMult || 1) * (def.pellets || 1) * 1.05 + 1;
  // Daño por segundo con margen (ráfagas: tres balas seguidas)
  const rate = (def.rate || 1) * (def.burst || 1);
  return { type, shot, dps: shot * rate * 1.6 + shot, cap: shot * Math.max(3, (def.burst || 1) * 2), range: def.range || 300 };
}

export class HitGuard {
  constructor() {
    this.ents = new Map(); // id -> { p, cur, prev, changed, bucket, t, rejected }
  }

  rec(id) {
    let e = this.ents.get(id);
    if (!e) this.ents.set(id, (e = { p: null, cur: null, prev: null, changed: 0, bucket: 0, t: 0, rejected: 0 }));
    return e;
  }

  // Estado recibido de una entidad (m.st o una fila de m.bots).
  state(id, p, held, now) {
    const e = this.rec(id);
    if (Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) e.p = p;
    const code = typeof held === 'string' ? held : '';
    if (code !== e.cur) {
      e.prev = e.cur;
      e.cur = code;
      e.changed = now;
    }
  }

  dist(a, b) {
    const pa = this.ents.get(a)?.p, pb = this.ents.get(b)?.p;
    if (!pa || !pb) return 0; // sin datos: no se puede comprobar
    return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
  }

  // Devuelve '' si el impacto es aceptable o el motivo del rechazo.
  check(by, to, dmg, type, now) {
    const e = this.rec(by);
    let reason = '';
    if (type === 'bullet' || type === 'headshot') {
      const cur = weaponOf(e.cur);
      const prev = now - e.changed < SWITCH_GRACE ? weaponOf(e.prev) : null;
      const w = cur && prev ? (cur.shot >= prev.shot ? cur : prev) : cur || prev;
      if (!w) reason = 'sin arma';
      else if (dmg > w.shot) reason = `daño ${dmg} > ${Math.round(w.shot)} (${w.type})`;
      else if (this.dist(by, to) > w.range * 1.25 + 20) reason = `distancia ${Math.round(this.dist(by, to))} m (${w.type})`;
      else {
        // Cubo de daño: se rellena con el tiempo y cada impacto lo vacía.
        e.bucket = Math.min(w.cap, e.bucket + (now - (e.t || now)) * w.dps);
        if (!e.t) e.bucket = w.cap;
        e.t = now;
        if (dmg > e.bucket + 0.5) reason = `cadencia (${w.type})`;
        else e.bucket -= dmg;
      }
    } else {
      const cap = CAPS[type] || { dmg: 120 };
      if (dmg > cap.dmg) reason = `daño ${dmg} > ${cap.dmg} (${type})`;
      else if (cap.dist && this.dist(by, to) > cap.dist) reason = `distancia ${Math.round(this.dist(by, to))} m (${type})`;
    }
    if (reason) e.rejected++;
    return reason;
  }

  rejected(id) {
    return this.ents.get(id)?.rejected || 0;
  }
}
