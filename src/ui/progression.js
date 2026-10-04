// Pantallas del pase de batalla, la tienda y la taquilla (skins, accesorios
// y camuflajes), más el resumen de XP al terminar una partida.
import * as THREE from 'three';
import { makeCharacter, makeWeaponModel } from '../game/models.js';
import { SHIRTS, PANTS, HAIR, SKINS, randomOutfit } from '../game/character.js';
import {
  SUITS, ACCESSORIES, CAMOS, PASS, PASS_REWARDS, SHOP, ACHIEVEMENTS, RARITY_COLORS, RARITY_NAMES, cosmetic,
} from '../game/cosmetics.js';
import { rewardText } from '../game/progress.js';
import { esc } from './online.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const TYPE_LIST = { suit: SUITS, acc: ACCESSORIES, camo: CAMOS };
const TYPE_NAME = { suit: 'Skin', acc: 'Accesorio', camo: 'Camuflaje' };
const COLOR_PARTS = [['shirt', 'Camiseta', SHIRTS], ['pants', 'Pantalón', PANTS], ['hair', 'Pelo', HAIR], ['skin', 'Piel', SKINS]];

// --------------------------------------------------------------- MINIATURAS
// Renderiza personajes y armas a imágenes (una vez por objeto).
class Thumbs {
  constructor() {
    this.cache = new Map();
    this.renderer = null;
  }

  init() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 192;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(192, 192, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.4));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(2, 3, 3);
    this.scene.add(d);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  }

  shot(key, build, frame) {
    if (this.cache.has(key)) return this.cache.get(key);
    let url = '';
    try {
      if (!this.renderer) this.init();
      const obj = build();
      this.scene.add(obj);
      frame(this.camera, obj);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.render(this.scene, this.camera);
      url = this.renderer.domElement.toDataURL();
      this.scene.remove(obj);
    } catch {
      url = '';
    }
    this.cache.set(key, url);
    return url;
  }

  character(outfit, focus = 'body') {
    const key = `c:${JSON.stringify(outfit)}:${focus}`;
    return this.shot(key, () => {
      const c = makeCharacter(outfit);
      c.root.rotation.y = Math.PI + 0.45;
      return c.root;
    }, (cam) => {
      if (focus === 'head') {
        cam.position.set(0.15, 1.95, 1.7);
        cam.lookAt(0, 1.82, 0);
      } else {
        cam.position.set(0, 1.15, 4.4);
        cam.lookAt(0, 0.95, 0);
      }
    });
  }

  weapon(camo) {
    return this.shot(`w:${camo}`, () => {
      const g = makeWeaponModel('ar', 3, camo);
      const pivot = new THREE.Group();
      g.position.z = 0.15;
      pivot.add(g);
      pivot.rotation.set(0.15, Math.PI / 2, 0);
      return pivot;
    }, (cam) => {
      cam.position.set(0, 0.05, 1.9);
      cam.lookAt(0, -0.02, 0);
    });
  }
}

export const thumbs = new Thumbs();

// Imagen de un objeto cosmético
export function itemThumb(type, id, outfit) {
  if (type === 'suit') return thumbs.character({ ...outfit, suit: id, acc: null });
  if (type === 'acc') return thumbs.character({ ...randomBase, acc: id, suit: null }, id === 'capa' || id === 'alas' ? 'body' : 'head');
  if (type === 'camo') return thumbs.weapon(id);
  return '';
}
const randomBase = { skin: 0xe0b48a, shirt: 0x444a55, pants: 0x2b2b38, hair: 0x3a2a1a };

// Dónde se consigue un objeto (texto corto)
function sourceOf(type, id) {
  for (const r of PASS_REWARDS) {
    if (r.free && r.free.type === type && r.free.id === id) return `Pase · nivel ${r.tier}`;
    if (r.premium.type === type && r.premium.id === id) return `Pase premium · nivel ${r.tier}`;
  }
  const s = SHOP.find((x) => x.type === type && x.id === id);
  return s ? `Tienda · ${s.price} tokens` : '';
}

function rewardCard(r, state, outfit) {
  if (!r) return '<div class="tier-card empty"></div>';
  if (r.type === 'tokens') {
    return `<div class="tier-card tokens ${state}"><div class="tk">🪙</div><b>${r.amount}</b><small>tokens</small></div>`;
  }
  const c = cosmetic(r.type, r.id);
  return `<div class="tier-card ${state}" style="--rc:${RARITY_COLORS[c.rarity]}" title="${esc(TYPE_NAME[r.type])}: ${esc(c.name)}">
    <img alt="" src="${itemThumb(r.type, r.id, outfit)}"><b>${esc(c.name)}</b><small>${TYPE_NAME[r.type]}</small></div>`;
}

export class ProgressionUI {
  constructor(game, menu) {
    this.game = game;
    this.menu = menu;
    this.lockerTab = 'suit';
    this.confirmBuy = null;
    game.progress.onChange(() => this.updatePill());
  }

  get progress() {
    return this.game.progress;
  }

  get outfit() {
    return this.game.settings.outfit || this.game.player.outfit || randomOutfit();
  }

  // Nivel y tokens bajo el logo del menú
  updatePill() {
    const el = document.getElementById('pass-pill');
    if (!el) return;
    const pr = this.progress;
    el.innerHTML = `<span class="lv">Nv. ${pr.level}</span><div class="xpbar"><i style="width:${(pr.tierXp / PASS.xpPerTier) * 100}%"></i></div><span class="tok">🪙 ${pr.tokens}</span>`;
  }

  // ------------------------------------------------------------ PASE
  renderPass(el) {
    const pr = this.progress;
    const tier = pr.tier;
    const o = this.outfit;
    el.classList.add('wide');
    const cols = PASS_REWARDS.map((r) => {
      const reached = r.tier <= tier;
      const freeState = reached ? 'got' : '';
      const premState = !pr.premium ? 'locked' : reached ? 'got' : '';
      return `<div class="tier ${reached ? 'reached' : ''} ${r.tier === tier ? 'current' : ''}" data-tier="${r.tier}">
        <div class="tnum">${r.tier}</div>
        ${rewardCard(r.free, freeState, o)}
        ${rewardCard(r.premium, premState, o)}
      </div>`;
    }).join('');
    const labels = `<div class="tier labels"><div class="tnum">&nbsp;</div><div class="row-label">GRATIS</div><div class="row-label prem">PREMIUM<br>${pr.premium ? '⭐' : '🔒'}</div></div>`;
    const ach = ACHIEVEMENTS.map((a) => {
      const done = pr.data.achievements.includes(a.id);
      const v = Math.min(a.goal, pr.data.stats[a.stat] || 0);
      return `<div class="ach ${done ? 'done' : ''}"><div class="ai">${done ? '🏆' : '🎯'}</div><div class="at"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
        <div class="abar"><i style="width:${(v / a.goal) * 100}%"></i></div></div><div class="ax">${done ? '✓' : `${v}/${a.goal}`}<small>+${a.xp} XP</small></div></div>`;
    }).join('');
    const complete = pr.level >= PASS.tiers;
    el.innerHTML = `
      <div class="pass-head">
        <div>
          <h2>Pase de batalla</h2>
          <div class="season">${esc(PASS.name)}</div>
        </div>
        <div class="pass-level"><span>NIVEL</span><b>${pr.level}</b></div>
        <div class="pass-xp">
          <div class="xpbar big"><i style="width:${(pr.tierXp / PASS.xpPerTier) * 100}%"></i></div>
          <small>${pr.tierXp} / ${PASS.xpPerTier} XP para el nivel ${pr.level + 1}${complete ? ` · pase completo: +${PASS.extraTokens} tokens por nivel extra` : ` · ${tier} de ${PASS.tiers} niveles`}</small>
        </div>
        <div class="pass-tokens">🪙 <b>${pr.tokens}</b><small>tokens</small></div>
        ${pr.premium ? '<div class="premium-badge">⭐ PREMIUM</div>'
          : `<button class="buy-pass ${this.confirmBuy === 'pass' ? 'confirm' : ''}" data-buy-pass>${this.confirmBuy === 'pass' ? `¿Confirmar? ${PASS.price} 🪙` : `⭐ Pase premium · ${PASS.price} 🪙`}</button>`}
      </div>
      <div class="pass-track">${labels}${cols}</div>
      <div class="pass-info">
        <div><h3>Cómo ganar XP</h3>
          <ul class="xp-list">
            <li>Jugar una partida <b>+100</b></li><li>Cada eliminación <b>+75</b></li><li>Daño causado <b>hasta +400</b></li>
            <li>Victoria <b>+500</b> · Top 5 <b>+200</b> · Top 10 <b>+100</b></li><li>Cofres <b>+20</b> · construir y editar</li>
            <li>Tiempo de juego <b>hasta +300</b></li><li>Partidas online <b>+25 %</b></li><li>Logros <b>+300 a +2500</b></li>
          </ul>
          <p class="hint">El pase gratuito da <b>450 tokens</b>; el premium añade skins, accesorios, camuflajes y más tokens. Al comprarlo recibes al momento las recompensas de los niveles que ya tengas.</p>
        </div>
        <div><h3>Logros <small>${pr.data.achievements.length}/${ACHIEVEMENTS.length}</small></h3><div class="ach-list">${ach}</div></div>
      </div>`;
    el.querySelector('[data-buy-pass]')?.addEventListener('click', () => this.buy({ type: 'pass', price: PASS.price }, 'pass', el));
    const track = el.querySelector('.pass-track');
    const cur = track.querySelector(`.tier[data-tier="${tier}"]`);
    if (cur) track.scrollLeft = Math.max(0, cur.offsetLeft - 200);
  }

  buy(item, confirmKey, el) {
    if (this.confirmBuy !== confirmKey) {
      this.confirmBuy = confirmKey;
      clearTimeout(this.confirmT);
      this.confirmT = setTimeout(() => {
        this.confirmBuy = null;
        if (this.menu.panel === 'shop' || this.menu.panel === 'pass') this.menu.show(this.menu.panel);
      }, 4000);
      this.menu.show(this.menu.panel);
      return;
    }
    this.confirmBuy = null;
    const res = this.progress.buy(item);
    if (res.error) this.menu.online.toast(res.error, 'warn');
    else if (item.type === 'pass') this.menu.online.toast(`⭐ ¡Pase premium activado! ${res.rewards.length ? `Recibes ${res.rewards.length} recompensas` : ''}`);
    else this.menu.online.toast(`Comprado: ${cosmetic(item.type, item.id).name}. Equípalo en PERSONAJE`);
    this.menu.show(this.menu.panel);
  }

  // ------------------------------------------------------------ TIENDA
  renderShop(el) {
    const pr = this.progress;
    const o = this.outfit;
    el.classList.add('wide');
    const cards = SHOP.map((it, i) => {
      const key = `shop${i}`;
      if (it.type === 'pass') {
        return `<div class="shop-card pass-card ${pr.premium ? 'owned' : ''}">
          <div class="shop-img pass-img">⭐<span>PASE<br>PREMIUM</span></div>
          <b>Pase de batalla premium</b><small>${esc(PASS.name)} · 3 skins, accesorios, camuflajes y tokens</small>
          <button data-shop="${i}" class="${this.confirmBuy === key ? 'confirm' : ''}" ${pr.premium ? 'disabled' : ''}>${pr.premium ? 'LO TIENES' : this.confirmBuy === key ? '¿CONFIRMAR?' : `🪙 ${it.price}`}</button></div>`;
      }
      const c = cosmetic(it.type, it.id);
      const owned = pr.owns(it.type, it.id);
      return `<div class="shop-card ${owned ? 'owned' : ''}" style="--rc:${RARITY_COLORS[c.rarity]}">
        <div class="shop-img"><img alt="" src="${itemThumb(it.type, it.id, o)}"></div>
        <b>${esc(c.name)}</b><small>${TYPE_NAME[it.type]} · ${RARITY_NAMES[c.rarity]}</small><p>${esc(c.desc)}</p>
        <button data-shop="${i}" class="${this.confirmBuy === key ? 'confirm' : ''}" ${owned ? 'disabled' : ''}>${owned ? 'LO TIENES' : this.confirmBuy === key ? '¿CONFIRMAR?' : `🪙 ${it.price}`}</button></div>`;
    }).join('');
    el.innerHTML = `
      <div class="shop-head"><h2>Tienda</h2><div class="pass-tokens">🪙 <b>${pr.tokens}</b><small>tokens</small></div></div>
      <p class="lead">Consigue tokens subiendo de nivel el pase de batalla y gástalos en skins, accesorios o el pase premium.</p>
      <div class="shop-grid">${cards}</div>`;
    el.querySelectorAll('[data-shop]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.shop);
      this.buy(SHOP[i], `shop${i}`, el);
    }));
  }

  // ------------------------------------------------------------ TAQUILLA
  renderLocker(el) {
    const g = this.game;
    const pr = this.progress;
    const o = { ...this.outfit };
    el.classList.add('wide');
    const tab = this.lockerTab;
    const tabs = [['suit', 'Skins'], ['acc', 'Accesorios'], ['camo', 'Camuflajes'], ['colors', 'Colores']];
    let body;
    if (tab === 'colors') {
      body = `${o.suit ? '<div class="tip">Llevas una skin: los colores solo se ven con la skin «Ninguna».</div>' : ''}
        <div class="swatches">${COLOR_PARTS.map(([k, label, list]) => `
          <div class="sw-row"><label>${label}</label><div class="sw">${list.map((c) => `<button data-k="${k}" data-c="${c}" class="${o[k] === c ? 'on' : ''}" style="--c:${hex(c)}"></button>`).join('')}</div></div>`).join('')}
          <button class="small-btn" id="outfit-random">🎲 Colores aleatorios</button></div>`;
    } else {
      const list = TYPE_LIST[tab];
      const none = `<button class="cos-card ${!o[tab] ? 'on' : ''}" data-equip="">
          <div class="cos-img none">${tab === 'camo' ? '🔫' : '∅'}</div><b>Ninguno</b><small>${tab === 'suit' ? 'Tus colores' : 'Sin ' + TYPE_NAME[tab].toLowerCase()}</small></button>`;
      body = `<div class="cos-grid">${none}${Object.entries(list).map(([id, c]) => {
        const owned = pr.owns(tab, id);
        return `<button class="cos-card ${o[tab] === id ? 'on' : ''} ${owned ? '' : 'locked'}" data-equip="${id}" style="--rc:${RARITY_COLORS[c.rarity]}" ${owned ? '' : 'title="Bloqueado"'}>
          <div class="cos-img"><img alt="" src="${itemThumb(tab, id, o)}">${owned ? '' : '<span class="lock">🔒</span>'}</div>
          <b>${esc(c.name)}</b><small>${owned ? RARITY_NAMES[c.rarity] : esc(sourceOf(tab, id))}</small></button>`;
      }).join('')}</div>`;
    }
    el.innerHTML = `
      <h2>Personaje</h2>
      <div class="locker">
        <div class="preview-box" id="preview-box"></div>
        <div class="locker-side">
          <div class="tabs">${tabs.map(([k, n]) => `<button data-ltab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
          ${body}
        </div>
      </div>`;
    el.querySelector('#preview-box').appendChild(this.menu.preview.canvas);
    this.menu.preview.set(o);
    this.menu.preview.start();
    const save = () => {
      g.settings.outfit = { ...o };
      g.applySettings();
      g.player.setOutfit(o);
      g.combat.modelKey = null;
      const n = g.netClient;
      if (n.authed) {
        n.user.outfit = { ...o };
        n.send('outfit', { outfit: o });
      }
      this.menu.preview.set(o);
    };
    el.querySelectorAll('[data-ltab]').forEach((b) => b.addEventListener('click', () => {
      this.lockerTab = b.dataset.ltab;
      this.renderLocker(el);
    }));
    el.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.equip || null;
      if (id && !pr.owns(tab, id)) {
        this.menu.online.toast(`Bloqueado · ${sourceOf(tab, id)}`, 'warn');
        return;
      }
      o[tab] = id;
      save();
      this.renderLocker(el);
    }));
    el.querySelectorAll('.sw button').forEach((b) => b.addEventListener('click', () => {
      o[b.dataset.k] = Number(b.dataset.c);
      save();
      this.renderLocker(el);
    }));
    el.querySelector('#outfit-random')?.addEventListener('click', () => {
      Object.assign(o, randomOutfit());
      save();
      this.renderLocker(el);
    });
  }

  // ------------------------------------------------------------ FINAL
  endHTML(res) {
    if (!res) return '';
    const up = res.level > res.levelBefore;
    const rewards = res.rewards.map((r) => `<span class="rw">${r.type === 'tokens' ? '🪙' : '🎁'} ${esc(rewardText(r))}</span>`).join('');
    return `<div class="xp-summary">
      <div class="xp-total">+${res.total} XP <small>Pase de batalla</small></div>
      <div class="xp-lines">${res.lines.map((l) => `<div><span>${esc(l.label)}</span><b>+${l.xp}</b></div>`).join('')}</div>
      ${up ? `<div class="lvl-up">⬆ ¡NIVEL ${res.level}!</div>` : `<div class="lvl-now">Nivel ${res.level} · ${this.progress.tierXp}/${PASS.xpPerTier} XP</div>`}
      ${rewards ? `<div class="rewards">${rewards}</div>` : ''}
    </div>`;
  }
}
