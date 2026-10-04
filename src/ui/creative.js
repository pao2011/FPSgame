import { catalog, itemName, itemRarity, RARITIES, WEAPONS, CONSUMABLES, THROWABLES } from '../game/items.js';
import { PREFABS, PIECE_PREFABS } from '../game/creative.js';
import { DIFFICULTIES } from '../game/modes.js';
import { MAP_SIZE, HALF } from '../world/constants.js';

const CATS = [
  ['all', 'Todo'], ['ar', 'Fusiles'], ['smg', 'Subfusiles'], ['shotgun', 'Escopetas'], ['sniper', 'Francotirador'],
  ['pistol', 'Pistolas'], ['explosive', 'Explosivos'], ['consumable', 'Curas'], ['throwable', 'Arrojadizos'], ['ammo', 'Munición y materiales'],
];

function catOf(it) {
  if (it.kind === 'weapon') return WEAPONS[it.type].cat;
  if (it.kind === 'consumable') return 'consumable';
  if (it.kind === 'throwable') return 'throwable';
  return 'ammo';
}

function describe(it) {
  if (it.kind === 'weapon') {
    const w = WEAPONS[it.type];
    const dmg = w.pellets ? `${w.damage[it.rarity]}×${w.pellets}` : w.damage[it.rarity];
    return `Daño ${dmg} · ${w.burst ? 'ráfagas de ' + w.burst : w.auto ? 'automática' : 'semiautomática'} · cargador ${w.mag}${w.explosive ? ' · explosiva' : ''}`;
  }
  if (it.kind === 'throwable') {
    const t = THROWABLES[it.type];
    if (t.knock) return 'Arrojadiza · empuja (también a ti)';
    if (t.smoke) return 'Arrojadiza · cortina de humo';
    if (t.fire) return 'Arrojadiza · fuego en el suelo';
    return `Arrojadiza · ${t.damage} de daño en área${t.remote ? ' · se detona a distancia' : ''}`;
  }
  if (it.kind === 'consumable') {
    const c = CONSUMABLES[it.type];
    if (c.deploy) return 'Se coloca en el suelo · te lanza por los aires';
    const parts = [];
    if (c.heal) parts.push(`+${c.heal} vida`);
    if (c.shield) parts.push(`+${c.shield} escudo`);
    if (c.over) parts.push(`+${c.over.total} vida/escudo poco a poco`);
    return `${parts.join(' · ')} · ${c.use} s`;
  }
  return `x${it.count}`;
}

// Panel del modo creativo: catálogo con todas las armas y consumibles, y
// herramientas (bots, dianas, cofres, prefabricados, guardar/cargar,
// teletransporte, hora del día, tormenta, modo dios…).
export class CreativePanel {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.tab = 'catalog';
    this.cat = 'all';
    this.diff = 'normal';
    this.el = document.createElement('div');
    this.el.id = 'creative';
    this.el.className = 'screen';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    // La tecla del catálogo la gestiona el juego (handleGlobalKeys); aquí Esc.
    addEventListener('keydown', (e) => {
      if (!this.open || e.code !== 'Escape') return;
      e.preventDefault();
      this.hide();
      game.input.lock();
    });
  }

  toggle() {
    if (this.open) {
      this.hide();
      this.game.input.lock();
    } else this.show();
  }

  show(tab = null) {
    if (tab) this.tab = tab;
    this.open = true;
    this.game.chatOpen = true; // evita que salga la pausa al soltar el ratón
    this.game.uiOpen = true;
    this.game.input.unlock();
    this.el.style.display = 'flex';
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.game.chatOpen = false;
    setTimeout(() => (this.game.uiOpen = false), 200);
    this.el.style.display = 'none';
  }

  render() {
    const g = this.game;
    const tabs = [['catalog', '🗂️ Objetos'], ['buildings', '🏠 Edificios'], ['tools', '🛠️ Herramientas'], ['build', '🏗️ Construcción'], ['world', '🌍 Mundo']];
    this.el.innerHTML = `
      <div class="cr-card">
        <div class="cr-head">
          <div class="logo small">MODO CREATIVO</div>
          <div class="cr-tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
          <button class="cr-close" data-act="close">✕</button>
        </div>
        <div class="cr-body">${this.bodyHTML()}</div>
        <div class="cr-foot">${g.key('catalog')} o Esc: cerrar · Doble ${g.key('jump')}: volar · Clic: al inventario · Clic derecho: soltar al suelo</div>
      </div>`;
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab;
      this.render();
    }));
    this.el.querySelector('[data-act="close"]').addEventListener('click', () => this.toggle());
    this.bind();
  }

  bodyHTML() {
    const g = this.game;
    const t = g.creative;
    if (this.tab === 'catalog') {
      const items = catalog().filter((it) => this.cat === 'all' || catOf(it) === this.cat);
      this.items = items;
      return `
        <div class="cr-cats">${CATS.map(([k, n]) => `<button data-cat="${k}" class="${this.cat === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="cr-grid">${items.map((it, i) => {
          const r = RARITIES[itemRarity(it)];
          const icon = g.hud.icons.get(it);
          return `<button class="cr-item" data-i="${i}" style="--rarity:${r.color}" title="${describe(it)}">
            ${icon ? `<img src="${icon}" alt="">` : '<span class="ph">?</span>'}
            <b>${itemName(it)}</b><small>${it.kind === 'weapon' ? r.name : describe(it)}</small></button>`;
        }).join('')}</div>`;
    }
    if (this.tab === 'buildings') {
      return `
        <p class="hint">Los mismos edificios de la isla principal: elige uno y colócalo con clic (${g.key('reload')} gira · clic derecho cancela).</p>
        <div class="cr-grid">${PREFABS.map((p) => `<button class="cr-item" data-building="${p.id}" style="--rarity:#5ab4ff"><span class="ph" style="font-size:34px;opacity:1">${p.icon}</span><b>${p.name}</b><small>${p.W}×${p.D} m</small></button>`).join('')}</div>
        <div class="cr-btns" style="margin-top:12px">
          <button data-act="erase" class="danger">🧽 Borrar edificios</button>
          <button data-act="clearIsland" class="danger">🗑️ Vaciar la isla</button>
        </div>`;
    }
    if (this.tab === 'tools') {
      return `
        <div class="cr-cols">
          <div class="cr-sec"><h3>Jugador</h3>
            <label class="cr-check"><input type="checkbox" data-k="godMode" ${g.godMode ? 'checked' : ''}> Modo dios (sin daño)</label>
            <label class="cr-check"><input type="checkbox" data-k="infiniteAmmo" ${g.infiniteAmmo ? 'checked' : ''}> Munición infinita</label>
            <label class="cr-check"><input type="checkbox" data-k="flying" ${t.flying ? 'checked' : ''}> Volar</label>
            <label>Velocidad de movimiento <b id="cr-speed">${g.speedMult.toFixed(1)}×</b></label>
            <input type="range" min="0.5" max="3" step="0.1" value="${g.speedMult}" data-range="speed">
            <div class="cr-btns">
              <button data-act="heal">❤️ Vida y escudo al máximo</button>
              <button data-act="clearInv">🧹 Vaciar inventario</button>
            </div>
          </div>
          <div class="cr-sec"><h3>Enemigos y objetivos</h3>
            <div class="seg" id="cr-diff">${Object.entries(DIFFICULTIES).map(([k, d]) => `<button data-diff="${k}" class="${this.diff === k ? 'on' : ''}">${d.name}</button>`).join('')}</div>
            <div class="cr-btns">
              <button data-act="bot">🤖 Generar bot enemigo</button>
              <button data-act="removeBots">❌ Quitar bots (${g.bots.list.length})</button>
              <button data-act="dummy">🎯 Colocar diana</button>
              <button data-act="clearDummies">Quitar dianas colocadas</button>
              <button data-act="chest">🧰 Colocar cofre</button>
              <button data-act="ammo">📦 Colocar caja de munición</button>
            </div>
          </div>
        </div>`;
    }
    if (this.tab === 'build') {
      return `
        <div class="cr-cols">
          <div class="cr-sec"><h3>Prefabricados</h3>
            <p class="hint">Se colocan delante de ti, mirando hacia donde miras.</p>
            <div class="cr-btns">${Object.entries(PIECE_PREFABS).map(([k, pf]) => `<button data-prefab="${k}">${pf.name}</button>`).join('')}</div>
            <div class="cr-btns"><button data-act="clearBuilds" class="danger">🗑️ Borrar todas las construcciones</button></div>
          </div>
          <div class="cr-sec"><h3>Guardar y cargar</h3>
            <p class="hint">Guarda tus construcciones en este navegador (3 ranuras).</p>
            ${[1, 2, 3].map((i) => `<div class="cr-slot"><span>Ranura ${i} <small>${t.slotInfo(i)}</small></span>
              <button data-save="${i}">Guardar</button><button data-load="${i}">Cargar</button></div>`).join('')}
          </div>
        </div>`;
    }
    return `
      <div class="cr-cols">
        <div class="cr-sec"><h3>Teletransporte</h3>
          <p class="hint">Haz clic en el mapa para ir a ese punto.</p>
          <canvas id="cr-map" width="360" height="360"></canvas>
        </div>
        <div class="cr-sec"><h3>Ambiente</h3>
          <label>Hora del día <b>${t.night < 0.5 ? 'Día' : 'Noche'}</b></label>
          <input type="range" min="0" max="1" step="0.05" value="${t.night}" data-range="night">
          <label class="cr-check"><input type="checkbox" data-k="storm" ${t.stormOn ? 'checked' : ''}> Tormenta activa</label>
          <label class="cr-check"><input type="checkbox" data-k="infiniteMats" ${g.infiniteMats ? 'checked' : ''}> Materiales infinitos</label>
        </div>
      </div>`;
  }

  bind() {
    const g = this.game;
    const t = g.creative;
    const el = this.el;
    el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      this.cat = b.dataset.cat;
      this.render();
    }));
    el.querySelectorAll('.cr-item[data-i]').forEach((b) => {
      const it = () => this.items[Number(b.dataset.i)];
      b.addEventListener('click', () => {
        t.give(it());
        b.classList.add('flash');
        setTimeout(() => b.classList.remove('flash'), 200);
      });
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        t.drop(it());
      });
    });
    el.querySelectorAll('input[data-k]').forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.k;
      if (k === 'flying') t.flying = inp.checked;
      else if (k === 'storm') t.setStorm(inp.checked);
      else g[k] = inp.checked;
    }));
    el.querySelectorAll('input[data-range]').forEach((inp) => inp.addEventListener('input', () => {
      const v = Number(inp.value);
      if (inp.dataset.range === 'speed') {
        g.speedMult = v;
        el.querySelector('#cr-speed').textContent = `${v.toFixed(1)}×`;
      } else t.setNight(v);
    }));
    el.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
      this.diff = b.dataset.diff;
      this.render();
    }));
    const acts = {
      heal: () => t.heal(),
      clearInv: () => t.clearInventory(),
      bot: () => t.spawnBot(this.diff),
      removeBots: () => t.removeBots(),
      dummy: () => t.spawnDummy(),
      clearDummies: () => g.dummies.clearExtra(),
      chest: () => t.spawnContainer('chest'),
      ammo: () => t.spawnContainer('ammo'),
      clearBuilds: () => t.clearBuilds(),
      erase: () => {
        t.setErase(true);
        this.toggle();
      },
      clearIsland: () => {
        if (confirm('¿Borrar todos los edificios y construcciones de tu isla creativa?')) t.clearAll();
      },
    };
    el.querySelectorAll('[data-building]').forEach((b) => b.addEventListener('click', () => {
      t.select(PREFABS.find((p) => p.id === b.dataset.building));
      this.toggle();
    }));
    el.querySelectorAll('[data-act]').forEach((b) => {
      const fn = acts[b.dataset.act];
      if (fn) b.addEventListener('click', () => {
        fn();
        if (b.dataset.act === 'removeBots' || b.dataset.act === 'bot') this.render();
      });
    });
    el.querySelectorAll('[data-prefab]').forEach((b) => b.addEventListener('click', () => {
      t.prefab(b.dataset.prefab);
      this.toggle();
    }));
    el.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => {
      t.saveSlot(Number(b.dataset.save));
      this.render();
    }));
    el.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => t.loadSlot(Number(b.dataset.load))));
    const map = el.querySelector('#cr-map');
    if (map) {
      const ctx = map.getContext('2d');
      ctx.drawImage(g.mapRenderer.base, 0, 0, map.width, map.height);
      const p = g.player;
      const px = ((p.pos.x + HALF) / MAP_SIZE) * map.width, py = ((p.pos.z + HALF) / MAP_SIZE) * map.height;
      g.mapRenderer.drawPlayer(ctx, px, py, p.yaw, 7);
      map.addEventListener('click', (e) => {
        const r = map.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * MAP_SIZE - HALF;
        const z = ((e.clientY - r.top) / r.height) * MAP_SIZE - HALF;
        t.teleport(x, z);
        this.toggle();
      });
    }
  }
}
