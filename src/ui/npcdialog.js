import { offerLabel } from '../game/npcs.js';

// Ventana de diálogo de un PNJ: tienda (armas por oro) o misión.
export class NpcDialog {
  constructor(game) {
    this.game = game;
    this.npc = null;
    this.el = document.createElement('div');
    this.el.id = 'npc-dialog';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    addEventListener('keydown', (e) => {
      if (!this.npc) return;
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault();
        this.close(true);
      }
    });
  }

  open(npc) {
    const g = this.game;
    if (this.npc || performance.now() - (this.closedAt || 0) < 400) return;
    this.npc = npc;
    this.msg = '';
    g.chatOpen = true;
    g.uiOpen = true;
    g.input.unlock();
    this.el.style.display = 'flex';
    this.render();
  }

  close(relock = false) {
    if (!this.npc) return;
    const g = this.game;
    this.npc = null;
    this.closedAt = performance.now();
    g.chatOpen = false;
    setTimeout(() => (g.uiOpen = false), 200);
    this.el.style.display = 'none';
    if (relock && g.state === 'playing' && g.player.alive) g.input.lock();
  }

  render() {
    const g = this.game;
    const n = this.npc;
    const gold = g.npcs.gold;
    let body;
    if (n.role === 'merchant') {
      body = `<p class="say">«¡Bienvenido! Armas de primera a cambio de oro. Lo consigues abriendo cofres, eliminando rivales y con las misiones.»</p>
        <div class="offers">${n.stock.map((o, k) => {
          const L = offerLabel(o);
          return `<div class="offer" style="--rc:${L.rarity.color}"><img alt="" src="${g.hud.icons.get(L.item)}"><div><b>${L.name}</b><small>${L.rarity.name}</small></div>
            <button data-buy="${k}" ${gold < L.price ? 'disabled' : ''}>💰 ${L.price}</button></div>`;
        }).join('')}</div>`;
    } else {
      const q = n.quest;
      const txt = g.npcs.questText(q);
      if (q.state === 'new') {
        body = `<p class="say">«Necesito ayuda, forastero. ${txt}${q.kind === 'relics' ? '' : ''} y te recompensaré.»</p>
          <div class="quest"><b>📜 ${q.kind === 'relics' ? 'Busca las reliquias' : txt}</b><small>Recompensa: 💰 ${q.gold} de oro y XP del pase</small></div>
          <button class="accept" data-accept>Aceptar misión</button>`;
      } else if (q.state === 'active') {
        body = `<p class="say">«¿Cómo va eso? ${q.kind === 'relics' ? `Los fragmentos están en ${q.where}.` : 'Sigue así.'}»</p>
          <div class="quest"><b>📜 ${txt}</b><small>Progreso: ${q.v}/${q.goal}</small></div>`;
      } else body = '<p class="say">«¡Gracias por tu ayuda! Que la tormenta te sea leve.»</p>';
    }
    this.el.innerHTML = `<div class="npc-box">
      <div class="npc-head"><span class="ic">${n.role === 'merchant' ? '🛒' : '❗'}</span><div><h3>${n.name}</h3><small>${n.role === 'merchant' ? 'Comerciante' : 'Misiones'} · ${n.poi.name}</small></div>
        <span class="gold">💰 ${gold}</span><button class="x" data-close>✕</button></div>
      ${body}
      ${this.msg ? `<div class="msg">${this.msg}</div>` : ''}
      <small class="hint">E o Esc para cerrar</small></div>`;
  }

  onClick(e) {
    const g = this.game;
    const n = this.npc;
    if (!n) return;
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.close !== undefined) return this.close(true);
    if (b.dataset.accept !== undefined) {
      g.npcs.accept(n);
      this.msg = '✅ Misión aceptada. La verás en pantalla, bajo la tormenta.';
      return this.render();
    }
    if (b.dataset.buy !== undefined) {
      const err = g.npcs.buy(n, Number(b.dataset.buy));
      this.msg = err ? `⚠ ${err}` : '✅ ¡Comprado! Ya lo tienes en el inventario.';
      this.render();
    }
  }
}
