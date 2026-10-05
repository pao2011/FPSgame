// Accesibilidad: modo daltónico (corrección de color), visualización de
// efectos de sonido (indicadores alrededor de la mira y en la brújula) y
// subtítulos de los sonidos importantes.

// Matrices RGB de simulación de cada deficiencia (Machado et al., severidad 1).
const SIM = {
  protanopia: [0.152, 1.053, -0.205, 0.115, 0.786, 0.099, -0.004, -0.048, 1.052],
  deuteranopia: [0.367, 0.861, -0.228, 0.28, 0.673, 0.047, -0.012, 0.043, 0.969],
  tritanopia: [1.256, -0.077, -0.179, -0.078, 0.931, 0.148, 0.005, 0.691, 0.304],
};
// Dónde se reparte la información de color perdida (daltonización).
const SHIFT = {
  protanopia: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  deuteranopia: [1, 0.7, 0, 0, 0, 0, 0, 0.7, 1],
  tritanopia: [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0],
};

function mul3(a, b) {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}

// Matriz de corrección: C = I + E · (I − S) · fuerza
export function daltonizeMatrix(mode, strength = 1) {
  const S = SIM[mode];
  if (!S) return null;
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const err = I.map((v, i) => v - S[i]);
  const corr = mul3(SHIFT[mode], err);
  return I.map((v, i) => v + corr[i] * strength);
}

function ensureFilter(mode, strength) {
  let svg = document.getElementById('a11y-filters');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'a11y-filters';
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    document.body.appendChild(svg);
  }
  const m = daltonizeMatrix(mode, strength);
  const v = `${m[0]} ${m[1]} ${m[2]} 0 0 ${m[3]} ${m[4]} ${m[5]} 0 0 ${m[6]} ${m[7]} ${m[8]} 0 0 0 0 0 1 0`;
  svg.innerHTML = `<filter id="a11y-cb" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${v}"/></filter>`;
}

const ICONS = {
  shot: { icon: '🔫', label: 'Disparos', cls: 'shot' },
  boom: { icon: '💥', label: 'Explosión', cls: 'boom' },
  step: { icon: '👣', label: 'Pasos', cls: 'step' },
  chest: { icon: '✨', label: 'Cofre', cls: 'chest' },
  car: { icon: '🚗', label: 'Vehículo', cls: 'car' },
  glide: { icon: '🪂', label: 'Planeador', cls: 'glide' },
};
const DIRS = ['delante', 'delante a la derecha', 'a la derecha', 'detrás a la derecha', 'detrás', 'detrás a la izquierda', 'a la izquierda', 'delante a la izquierda'];

export class Accessibility {
  constructor(game) {
    this.game = game;
    this.ring = document.createElement('div');
    this.ring.id = 'sound-ring';
    this.subs = document.createElement('div');
    this.subs.id = 'subtitles';
    const hud = document.getElementById('hud');
    hud.appendChild(this.ring);
    hud.appendChild(this.subs);
    this.pool = [];
    this.t = 0;
    this.seenNoise = 0; // instante del último ruido ya procesado
    this.events = []; // { kind, pos, t, life }
    this.subLines = []; // { text, t }
    this.lastSub = new Map();
    this.stormWarned = false;
    this.apply();
  }

  apply() {
    const s = this.game.settings;
    const mode = s.colorblind || 'none';
    const f = SIM[mode] ? 'url(#a11y-cb)' : '';
    if (f) ensureFilter(mode, s.colorblindStrength ?? 1);
    for (const el of [this.game.renderer?.domElement, document.getElementById('hud'), document.getElementById('inventory')]) if (el) el.style.filter = f;
    this.ring.style.display = s.soundViz ? '' : 'none';
    this.subs.style.display = s.subtitles ? '' : 'none';
  }

  // Ángulo relativo a la cámara (0 = delante, positivo = derecha).
  bearing(pos) {
    const p = this.game.player;
    const yaw = p.yaw;
    const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    return Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  }

  dirText(b) {
    const i = ((Math.round(b / (Math.PI / 4)) % 8) + 8) % 8;
    return DIRS[i];
  }

  subtitle(key, text, cooldown = 3) {
    const now = this.game.time;
    if (now - (this.lastSub.get(key) ?? -99) < cooldown) return;
    this.lastSub.set(key, now);
    this.subLines.push({ text, t: now });
    if (this.subLines.length > 4) this.subLines.shift();
  }

  // Un sonido que se puede ver (y subtitular).
  event(kind, pos, life, dist, subKey) {
    this.events.push({ kind, pos: pos.clone ? pos.clone() : { ...pos }, t: this.game.time, life, dist });
    if (subKey) {
      const b = this.bearing(pos);
      const far = dist > 60 ? 'lejanos' : dist > 25 ? 'cerca' : 'muy cerca';
      const name = ICONS[kind].label + (kind === 'shot' || kind === 'step' ? ` ${far}` : '');
      this.subtitle(subKey, `[${name} ${this.dirText(b)}]`, kind === 'step' ? 5 : 2.5);
    }
  }

  collect() {
    const g = this.game;
    const p = g.player;
    const viz = g.settings.soundViz, subs = g.settings.subtitles, compass = g.settings.compassSounds !== false;
    if (!viz && !subs && !compass) return;
    // Disparos y explosiones (ruidos de la partida)
    for (const n of g.noises) {
      if (n.t <= this.seenNoise) continue;
      if (n.src === p) continue;
      const d = n.pos.distanceTo(p.pos);
      if (d > (n.r >= 140 ? 160 : 120)) continue;
      const kind = n.r === 140 ? 'boom' : 'shot';
      this.event(kind, n.pos, 2.2, d, kind + Math.round(this.bearing(n.pos) * 2));
    }
    if (g.noises.length) this.seenNoise = g.noises[g.noises.length - 1].t;
    // Pasos de enemigos corriendo cerca
    for (const c of g.chars) {
      if (c === p || !c.alive || c.team === p.team || c.mode !== 'ground' || c.vehicle) continue;
      const sp = c.hSpeed ?? Math.hypot(c.vel?.x || 0, c.vel?.z || 0);
      if (sp < 2.5 || c.crouching) continue;
      const d = c.pos.distanceTo(p.pos);
      if (d > 28) continue;
      this.event('step', c.pos, 0.5, d, 'step');
    }
    // Cofres sin abrir cerca (zumbido)
    for (const c of g.containers.list) {
      if (!c.active || c.opened || c.kind !== 'chest') continue;
      const d = c.pos.distanceTo(p.pos);
      if (d < 14) this.event('chest', c.pos, 0.5, d, d < 8 ? 'chest' : null);
    }
    // Vehículos en marcha
    for (const v of g.vehicles?.list || []) {
      if (Math.abs(v.speed || 0) < 2 || v === p.vehicle) continue;
      const d = v.pos.distanceTo(p.pos);
      if (d < 45) this.event('car', v.pos, 0.5, d, 'car');
    }
    // Planeadores por encima
    for (const c of g.chars) {
      if (c === p || !c.alive || c.mode !== 'glide') continue;
      const d = c.pos.distanceTo(p.pos);
      if (d < 70) this.event('glide', c.pos, 0.5, d, null);
    }
    // Tormenta
    const out = g.storm?.active && g.storm.isOutside(p.pos.x, p.pos.z);
    if (subs && out && !this.stormWarned) {
      this.stormWarned = true;
      this.subtitle('storm', '[Estás dentro de la tormenta]', 6);
    } else if (!out) this.stormWarned = false;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const now = g.time;
    this.events = this.events.filter((e) => now - e.t < e.life);
    if (this.t >= 0.1) {
      this.t = 0;
      if (g.state === 'playing' && g.player.alive && g.player.mode !== 'bus' && g.player.mode !== 'lobby') this.collect();
      this.paint();
    }
  }

  paint() {
    const g = this.game;
    const s = g.settings;
    const now = g.time;
    // Agrupar por tipo y dirección (sectores de 30°) para no saturar
    const groups = new Map();
    for (const e of this.events) {
      const b = this.bearing(e.pos);
      const key = e.kind + Math.round(b / (Math.PI / 6));
      const k = 1 - (now - e.t) / e.life;
      const prev = groups.get(key);
      if (!prev || prev.dist > e.dist) groups.set(key, { ...e, b, k: Math.max(prev?.k || 0, k) });
    }
    const list = [...groups.values()].sort((a, b) => a.dist - b.dist).slice(0, 10);
    // Anillo alrededor de la mira
    if (s.soundViz) {
      while (this.pool.length < list.length) {
        const el = document.createElement('div');
        el.className = 'snd';
        this.ring.appendChild(el);
        this.pool.push(el);
      }
      this.pool.forEach((el, i) => {
        const e = list[i];
        if (!e) {
          el.style.display = 'none';
          return;
        }
        const ic = ICONS[e.kind];
        const R = 118;
        const near = Math.max(0.35, 1 - e.dist / 120);
        el.style.display = '';
        el.className = 'snd ' + ic.cls;
        el.textContent = ic.icon;
        el.style.transform = `translate(${Math.sin(e.b) * R}px, ${-Math.cos(e.b) * R}px) translate(-50%, -50%) scale(${0.75 + near * 0.5})`;
        el.style.opacity = String(Math.min(1, e.k * 1.5) * (0.45 + near * 0.55));
      });
    }
    // Brújula: disparos y pasos (útil sin cascos)
    g.hud.soundMarks = s.compassSounds !== false ? list.filter((e) => e.kind === 'shot' || e.kind === 'boom' || e.kind === 'step').map((e) => ({ pos: e.pos, cls: 'snd ' + ICONS[e.kind].cls, icon: ICONS[e.kind].icon })) : [];
    // Subtítulos
    if (s.subtitles) {
      this.subLines = this.subLines.filter((l) => now - l.t < 4);
      const html = this.subLines.map((l) => `<div>${l.text}</div>`).join('');
      if (html !== this.subHtml) {
        this.subHtml = html;
        this.subs.innerHTML = html;
      }
    }
  }
}
