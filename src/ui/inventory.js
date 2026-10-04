import { RARITIES, WEAPONS, AMMO, MATERIALS, itemName, itemRarity, stackDef } from '../game/items.js';
import { keyName } from '../core/binds.js';

// Inventario a pantalla completa (Tab): arrastrar para reordenar huecos o
// juntar pilas, arrastrar fuera para soltar, dividir pilas y tirar
// cantidades concretas de munición y materiales. La partida sigue corriendo
// mientras está abierto (como en Fortnite). Funciona con ratón y táctil.
export class InventoryPanel {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.sel = 1;
    this.qty = {}; // cantidad elegida para soltar (por recurso)
    this.el = document.createElement('div');
    this.el.id = 'inventory';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    this.ghost = document.createElement('div');
    this.ghost.className = 'inv-ghost';
    this.el.appendChild(this.ghost);
    this.drag = null;
    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    this.el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const slot = e.target.closest('[data-slot]');
      if (slot) this.split(Number(slot.dataset.slot));
    });
    this.el.addEventListener('click', (e) => this.onClick(e));
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Tab' || e.code === 'Escape') {
        e.preventDefault();
        if (e.code === 'Escape') this.hide(true);
      }
    });
  }

  toggle() {
    if (this.open) this.hide(true);
    else this.show();
  }

  show() {
    const g = this.game;
    if (g.state !== 'playing' || !g.player.alive || g.creativePanel?.open) return;
    this.open = true;
    this.sel = g.player.selected || 1;
    g.chatOpen = true; // que no salga la pausa al liberar el ratón
    g.uiOpen = true;
    g.input.unlock();
    this.el.style.display = 'flex';
    this.render();
  }

  hide(relock = false) {
    if (!this.open) return;
    this.open = false;
    this.drag = null;
    const g = this.game;
    g.chatOpen = false;
    setTimeout(() => (g.uiOpen = false), 200);
    this.el.style.display = 'none';
    if (relock && g.state === 'playing' && g.player.alive) g.input.lock();
  }

  // Llamado cada fotograma mientras está abierto (munición, cargador…).
  update() {
    if (!this.open) return;
    const g = this.game;
    if (!g.player.alive || g.state !== 'playing') return this.hide();
    const sig = JSON.stringify([g.player.inventory, g.player.ammo, g.player.mats, g.player.selected, this.sel, this.qty]);
    if (sig !== this.sig) this.render();
  }

  slotHtml(it, i) {
    const g = this.game;
    const p = g.player;
    if (!it) return `<div class="inv-slot empty" data-slot="${i}"><span class="k">${i + 1}</span></div>`;
    const r = it.kind === 'pickaxe' ? null : RARITIES[itemRarity(it)];
    const cnt = it.kind === 'weapon' ? `${it.mag}/${WEAPONS[it.type].mag}` : stackDef(it) ? `×${it.count}` : '';
    const cls = ['inv-slot', i === this.sel ? 'sel' : '', i === p.selected ? 'held' : '', r?.glow ? 'glow' : ''].join(' ');
    return `<div class="${cls}" data-slot="${i}" style="--rc:${r ? r.color : '#5a6270'}">
      <span class="k">${i + 1}</span><img src="${g.hud.icons.get(it)}" alt="" draggable="false">
      <span class="n">${itemName(it)}</span><span class="c">${cnt}</span></div>`;
  }

  details(it) {
    if (!it) return '<div class="inv-detail empty">Hueco vacío · arrastra aquí un objeto</div>';
    if (it.kind === 'pickaxe') return '<div class="inv-detail"><h3>Pico</h3><p>Siempre en el hueco 1: rompe objetos para conseguir materiales.</p></div>';
    const r = RARITIES[itemRarity(it)];
    let body = '';
    if (it.kind === 'weapon') {
      const d = WEAPONS[it.type];
      const dmg = d.damage[it.rarity] * (d.pellets || 1);
      body = `<div class="stats">
        <span>Daño<b>${Math.round(dmg)}${d.pellets ? ` (${d.pellets}×${d.damage[it.rarity]})` : ''}</b></span>
        <span>Cadencia<b>${d.rate}/s</b></span>
        <span>Cargador<b>${it.mag}/${d.mag}</b></span>
        <span>Munición<b>${AMMO[d.ammo]?.short || '—'}</b></span>
        <span>Alcance<b>${d.range} m</b></span>
        <span>Recarga<b>${(d.reload?.[it.rarity] ?? 0).toFixed(1)} s</b></span></div>`;
    } else {
      const max = stackDef(it)?.max ?? 1;
      const q = Math.min(this.qty.stack ?? 1, it.count);
      body = `<p>${it.count} de ${max} en la pila.</p>
        <div class="qty" data-res="stack"><button data-q="-1">−</button><b>${q}</b><button data-q="1">+</button><button data-q="all">Todo</button>
        <button class="act" data-act="drop-stack">Soltar ${q}</button>${it.count > 1 ? '<button class="act" data-act="split">Dividir</button>' : ''}</div>`;
    }
    return `<div class="inv-detail" style="--rc:${r.color}"><h3>${itemName(it)} <small>${r.name}</small></h3>${body}
      ${this.sel > 0 ? '<button class="act drop" data-act="drop-item">Soltar objeto</button>' : ''}</div>`;
  }

  resRow(kind, key, name, color, have) {
    const id = `${kind}:${key}`;
    const step = kind === 'ammo' ? (key === 'rockets' || key === 'heavy' ? 1 : 10) : 10;
    const q = Math.min(have, this.qty[id] ?? Math.min(have, step * 3));
    return `<div class="res" data-res="${id}" data-step="${step}"><i style="background:${color}"></i><span class="nm">${name}</span><b class="hv">${have}</b>
      <div class="qty"><button data-q="-1">−</button><b>${q}</b><button data-q="1">+</button><button data-q="all">Todo</button>
      <button class="act" data-act="drop-res" ${have <= 0 ? 'disabled' : ''}>Soltar</button></div></div>`;
  }

  render() {
    const g = this.game;
    const p = g.player;
    this.sig = JSON.stringify([p.inventory, p.ammo, p.mats, p.selected, this.sel, this.qty]);
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    const ammo = Object.keys(AMMO).map((a) => this.resRow('ammo', a, AMMO[a].name, hex(AMMO[a].color), g.infiniteAmmo ? 999 : p.ammo[a] || 0)).join('');
    const mats = Object.keys(MATERIALS).map((m) => this.resRow('mat', m, MATERIALS[m].name, MATERIALS[m].color, p.mats[m] || 0)).join('');
    const ghost = this.ghost;
    this.el.innerHTML = `<div class="inv-panel">
      <div class="inv-head"><h2>INVENTARIO</h2><small>Arrastra para reordenar o juntar · arrastra fuera para soltar · clic derecho: dividir pila · <kbd>${keyName(g.settings.binds?.inventory?.[0] || 'Tab')}</kbd>/<kbd>Esc</kbd> cerrar</small><button class="x" data-act="close">✕</button></div>
      <div class="inv-slots">${p.inventory.map((it, i) => this.slotHtml(it, i)).join('')}</div>
      ${this.details(p.inventory[this.sel])}
      <div class="inv-cols"><div><h4>Munición</h4>${ammo}</div><div><h4>Materiales</h4>${mats}</div></div>
      <div class="inv-drop">⬇ Arrastra aquí para soltar</div></div>`;
    this.el.appendChild(ghost);
  }

  // ------------------------------------------------------------ ACCIONES
  swap(a, b) {
    const p = this.game.player;
    if (a === b || a <= 0 || b <= 0) return;
    const A = p.inventory[a], B = p.inventory[b];
    // Misma cura/arrojadizo: se juntan hasta el máximo de la pila
    if (A && B && stackDef(A) && A.kind === B.kind && A.type === B.type) {
      const max = stackDef(B).max;
      const move = Math.min(A.count, max - B.count);
      if (move > 0) {
        B.count += move;
        A.count -= move;
        if (A.count <= 0) p.inventory[a] = null;
        this.afterChange(b);
        return;
      }
    }
    p.inventory[a] = B;
    p.inventory[b] = A;
    if (p.selected === a) p.selected = b;
    else if (p.selected === b) p.selected = a;
    this.afterChange(b);
  }

  split(i) {
    const p = this.game.player;
    const it = p.inventory[i];
    if (!it || !stackDef(it) || it.count < 2) return;
    const free = p.inventory.findIndex((s, k) => k > 0 && !s);
    if (free < 0) return this.game.hud.toast('No hay huecos libres para dividir la pila');
    const half = Math.floor(it.count / 2);
    it.count -= half;
    p.inventory[free] = { ...it, count: half };
    this.afterChange(free);
  }

  afterChange(sel) {
    const g = this.game;
    this.sel = sel;
    g.combat.modelKey = null;
    g.combat.reloading = false;
    g.combat.cancelUse?.();
    if (!g.player.inventory[g.player.selected]) g.combat.select(0);
    else g.combat.select(g.player.selected);
    this.render();
  }

  dropSlot(i, count = null) {
    const g = this.game;
    if (i <= 0 || !g.player.inventory[i]) return;
    g.dropSlot(i, count);
    this.afterChange(g.player.inventory[i] ? i : this.sel);
  }

  onClick(e) {
    const g = this.game;
    const p = g.player;
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') return this.hide(true);
    if (act === 'drop-item') return this.dropSlot(this.sel);
    if (act === 'split') return this.split(this.sel);
    if (act === 'drop-stack') return this.dropSlot(this.sel, Math.min(this.qty.stack ?? 1, p.inventory[this.sel]?.count || 0));
    const row = b.closest('[data-res]');
    if (!row) return;
    const id = row.dataset.res;
    if (b.dataset.q !== undefined) {
      const step = Number(row.dataset.step) || 1;
      let max;
      if (id === 'stack') max = p.inventory[this.sel]?.count || 0;
      else {
        const [kind, key] = id.split(':');
        max = kind === 'ammo' ? p.ammo[key] || 0 : p.mats[key] || 0;
      }
      const cur = id === 'stack' ? Math.min(this.qty.stack ?? 1, max) : Math.min(max, this.qty[id] ?? Math.min(max, step * 3));
      this.qty[id] = b.dataset.q === 'all' ? max : Math.max(1, Math.min(max, cur + Number(b.dataset.q) * step));
      return this.render();
    }
    if (act === 'drop-res') {
      const [kind, key] = id.split(':');
      const step = Number(row.dataset.step) || 1;
      const have = kind === 'ammo' ? p.ammo[key] || 0 : p.mats[key] || 0;
      const n = Math.min(have, this.qty[id] ?? Math.min(have, step * 3));
      if (n > 0) g.dropResource(kind === 'ammo' ? 'ammo' : 'material', key, n);
      this.render();
    }
  }

  // ------------------------------------------------------------ ARRASTRE
  onDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const slot = e.target.closest('[data-slot]');
    if (!slot) return;
    const i = Number(slot.dataset.slot);
    this.sel = i;
    const it = this.game.player.inventory[i];
    if (i === 0 || !it) return this.render();
    this.drag = { i, x: e.clientX, y: e.clientY, moved: false };
    this.ghost.innerHTML = `<img src="${this.game.hud.icons.get(it)}" alt="">`;
  }

  onMove(e) {
    const d = this.drag;
    if (!d || !this.open) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      d.moved = true;
      this.ghost.style.display = 'block';
      this.el.classList.add('dragging');
    }
    if (d.moved) this.ghost.style.transform = `translate(${e.clientX - 32}px, ${e.clientY - 32}px)`;
    this.el.querySelectorAll('.inv-slot.over, .inv-drop.over').forEach((x) => x.classList.remove('over'));
    const t = document.elementFromPoint(e.clientX, e.clientY);
    t?.closest('[data-slot], .inv-drop')?.classList.add('over');
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    this.ghost.style.display = 'none';
    this.el.classList.remove('dragging');
    if (!d || !this.open) return;
    if (!d.moved) return this.render();
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const slot = t?.closest('[data-slot]');
    if (slot) return this.swap(d.i, Number(slot.dataset.slot));
    // Fuera del panel o sobre la zona de soltar: se tira el objeto
    if (t?.closest('.inv-drop') || !t?.closest('.inv-panel')) return this.dropSlot(d.i);
    this.render();
  }
}
