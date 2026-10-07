// Rueda de gestos y grafitis. Teclado/ratón: mantén N, mueve el ratón hacia
// lo que quieras y suelta (un toque rápido hace el gesto de la taquilla).
// Táctil: toca el botón de gestos y luego lo que quieras.
import { EMOTES } from '../game/cosmetics.js';
import { SPRAYS, sprayIcon } from '../game/sprays.js';

const EMOJI = {
  wave: '👋', dance: '🕺', clap: '👏', robot: '🤖', pushups: '💪', spin: '🌀', flex: '🏆',
  laugh: '😂', sit: '🪑', salute: '🫡', floss: '🦷', guitar: '🎸', dab: '🙆',
};

export class EmoteWheel {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.el = document.createElement('div');
    this.el.id = 'emote-wheel';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => {
      if (!this.open || !this.touch) return;
      e.preventDefault();
      e.stopPropagation();
      const b = e.target.closest('[data-i]');
      if (b) this.choose(Number(b.dataset.i));
      this.close();
    });
  }

  // Gestos que tiene el jugador (anillo exterior) y grafitis (interior).
  entries() {
    const prog = this.game.progress;
    const emotes = Object.keys(EMOTES).filter((id) => prog.owns('emote', id)).map((id) => ({ kind: 'emote', id, name: EMOTES[id].name, icon: EMOJI[EMOTES[id].anim] || '🙂' }));
    const sprays = Object.keys(SPRAYS).map((id) => ({ kind: 'spray', id, name: `Grafiti: ${SPRAYS[id].name}`, img: sprayIcon(id) }));
    return { emotes, sprays };
  }

  show() {
    const g = this.game;
    const p = g.player;
    if (this.open || !p.alive || p.mode !== 'ground' || p.vehicle || p.knocked) return;
    this.open = true;
    this.touch = !!g.touch;
    this.sel = -1;
    this.cx = 0;
    this.cy = 0;
    this.openedAt = performance.now();
    const { emotes, sprays } = this.entries();
    this.items = [...emotes, ...sprays];
    const R1 = 150, R2 = 72;
    const place = (list, R, off) =>
      list
        .map((it, k) => {
          const a = (k / list.length) * Math.PI * 2 - Math.PI / 2;
          it.a = a;
          it.ring = R === R1 ? 1 : 0;
          const x = Math.cos(a) * R, y = Math.sin(a) * R;
          const inner = it.img ? `<img src="${it.img}" alt="">` : `<span>${it.icon}</span>`;
          return `<button class="ew-item${it.ring ? '' : ' spray'}" data-i="${off + k}" style="transform:translate(${x}px,${y}px)" title="${it.name}">${inner}</button>`;
        })
        .join('');
    this.el.innerHTML = `<div class="ew-ring">${place(emotes, R1, 0)}${place(sprays, R2, emotes.length)}<div class="ew-label">${this.touch ? 'Toca un gesto o un grafiti · fuera para cerrar' : 'Mueve el ratón y suelta N'}</div></div>`;
    this.btns = [...this.el.querySelectorAll('.ew-item')];
    this.label = this.el.querySelector('.ew-label');
    this.el.style.display = 'flex';
  }

  close() {
    this.open = false;
    this.el.style.display = 'none';
  }

  // Ratón (capturado): un cursor virtual elige el sector y el anillo.
  update(input) {
    if (!this.open || this.touch) return;
    this.cx = Math.max(-190, Math.min(190, this.cx + input.mouseDX));
    this.cy = Math.max(-190, Math.min(190, this.cy + input.mouseDY));
    const d = Math.hypot(this.cx, this.cy);
    let sel = -1;
    if (d > 30) {
      const a = Math.atan2(this.cy, this.cx);
      const ring = d > 110 ? 1 : 0;
      let best = Infinity;
      this.items.forEach((it, i) => {
        if (it.ring !== ring) return;
        const da = Math.abs(Math.atan2(Math.sin(a - it.a), Math.cos(a - it.a)));
        if (da < best) {
          best = da;
          sel = i;
        }
      });
      if (sel < 0) {
        // anillo vacío: el más cercano del otro
        this.items.forEach((it, i) => {
          const da = Math.abs(Math.atan2(Math.sin(a - it.a), Math.cos(a - it.a)));
          if (da < best) {
            best = da;
            sel = i;
          }
        });
      }
    }
    if (sel !== this.sel) {
      this.sel = sel;
      this.btns.forEach((b, i) => b.classList.toggle('sel', i === sel));
      this.label.textContent = sel >= 0 ? this.items[sel].name : 'Mueve el ratón y suelta N';
    }
  }

  // Soltar N: lo elegido o, si fue un toque rápido, el gesto de la taquilla.
  release() {
    if (!this.open || this.touch) return;
    const quick = performance.now() - this.openedAt < 220 && this.sel < 0;
    const sel = this.sel;
    this.close();
    if (sel >= 0) this.choose(sel);
    else if (quick) this.doEmote(this.game.player.outfit?.emote || 'baile');
  }

  choose(i) {
    const it = this.items[i];
    if (!it) return;
    if (it.kind === 'emote') this.doEmote(it.id);
    else this.game.sprays.spray(it.id);
  }

  doEmote(id) {
    const g = this.game;
    const p = g.player;
    if (g.build.active) g.build.setActive(false);
    if (p.startEmote(id)) {
      p.stats.emotes = (p.stats.emotes || 0) + 1;
      g.net?.sendEmote(p, id);
    }
  }
}
