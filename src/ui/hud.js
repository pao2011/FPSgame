import * as THREE from 'three';
import { WEAPONS, CONSUMABLES, AMMO, RARITIES, itemRarity } from '../game/items.js';
import { makeItemModel, makeWeaponModel } from '../game/models.js';

const $ = (id) => document.getElementById(id);

// Renderiza iconos 3D de los objetos a imágenes (una sola vez por tipo).
class IconRenderer {
  constructor() {
    this.cache = new Map();
    this.renderer = null;
  }
  _init() {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 96;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(160, 96, false);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2);
    d.position.set(1, 2, 3);
    this.scene.add(d);
    this.camera = new THREE.PerspectiveCamera(30, 160 / 96, 0.01, 10);
  }
  get(item) {
    const key = item.kind === 'weapon' ? `${item.type}_${item.rarity}` : item.kind === 'consumable' ? item.type : item.kind === 'ammo' ? 'ammo_' + item.ammo : 'pickaxe';
    if (this.cache.has(key)) return this.cache.get(key);
    try {
      if (!this.renderer) this._init();
      const model = item.kind === 'pickaxe' ? makeWeaponModel('pickaxe') : makeItemModel(item);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const pivot = new THREE.Group();
      pivot.add(model);
      if (item.kind === 'weapon') pivot.rotation.set(0, Math.PI / 2, 0);
      else if (item.kind === 'pickaxe') pivot.rotation.set(0, Math.PI / 2, -0.6);
      else pivot.rotation.set(0.4, 0.6, 0);
      this.scene.add(pivot);
      const r = Math.max(size.x, size.y, size.z);
      this.camera.position.set(0, 0, r * 2.3);
      this.camera.lookAt(0, 0, 0);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL();
      this.scene.remove(pivot);
      this.cache.set(key, url);
      return url;
    } catch {
      this.cache.set(key, '');
      return '';
    }
  }
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.icons = new IconRenderer();
    this.el = {
      hud: $('hud'),
      crosshair: $('crosshair'),
      hit: $('hitmarker'),
      hpFill: $('hp-fill'), hpVal: $('hp-val'),
      shFill: $('sh-fill'), shVal: $('sh-val'),
      slots: $('slots'),
      ammo: $('ammo'),
      ammoList: $('ammo-list'),
      mini: $('minimap'),
      compass: $('compass-strip'),
      heading: $('heading'),
      storm: $('storm-info'),
      prompt: $('prompt'),
      banner: $('banner'),
      altitude: $('altitude'),
      progress: $('progress'), progressFill: $('progress-fill'), progressLabel: $('progress-label'),
      toast: $('toast'),
      scope: $('scope'),
      stormVig: $('storm-vignette'),
      dmgVig: $('damage-vignette'),
      fullmap: $('fullmap'), fullmapCanvas: $('fullmap-canvas'),
      zone: $('zone-name'),
      weaponName: $('weapon-name'),
      stats: $('stats'),
    };
    this.miniCtx = this.el.mini.getContext('2d');
    this.fullCtx = this.el.fullmapCanvas.getContext('2d');
    this.buildSlots();
    this.buildCompass();
    this.last = {};
    this.hitT = 0;
    this.toastT = 0;
    this.dmgT = 0;
    this.zoneT = 0;
    this.lastZone = null;
    this.mapOpen = false;
  }

  buildSlots() {
    this.slotEls = [];
    this.el.slots.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<span class="key">${i + 1}</span><img alt=""><span class="count"></span>`;
      this.el.slots.appendChild(s);
      this.slotEls.push({ root: s, img: s.querySelector('img'), count: s.querySelector('.count'), sig: '' });
    }
  }

  buildCompass() {
    const strip = this.el.compass;
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    let html = '';
    for (let rep = -1; rep <= 1; rep++) {
      for (let d = 0; d < 360; d += 15) {
        const x = (rep * 360 + d) * 4;
        const lab = labels[d];
        html += `<span class="tick ${lab ? 'major' : ''}" style="left:${x}px">${lab || d}</span>`;
      }
    }
    strip.innerHTML = html;
  }

  set(key, el, prop, value) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'display') el.style.display = value;
    else el.style[prop] = value;
  }

  show(on) {
    this.el.hud.style.display = on ? '' : 'none';
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this.toastT = 2.2;
  }

  banner(msg, sub = '') {
    this.set('banner', this.el.banner, 'html', msg ? `<div class="big">${msg}</div>${sub ? `<div class="sub">${sub}</div>` : ''}` : '');
  }

  hitMarker(head, kill) {
    const h = this.el.hit;
    h.className = 'show' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitT = 0.18;
  }

  flashDamage(type) {
    this.dmgT = 0.4;
    this.el.dmgVig.className = type === 'storm' ? 'storm' : '';
  }

  setProgress(v, label = '') {
    if (v === null) {
      this.set('progShow', this.el.progress, 'display', 'none');
      return;
    }
    this.set('progShow', this.el.progress, 'display', 'block');
    this.el.progressFill.style.width = `${Math.round(v * 100)}%`;
    this.set('progLabel', this.el.progressLabel, 'text', label);
  }

  setScope(on) {
    this.set('scope', this.el.scope, 'display', on ? 'block' : 'none');
  }

  setPrompt(text) {
    this.set('prompt', this.el.prompt, 'html', text || '');
    this.set('promptShow', this.el.prompt, 'display', text ? 'block' : 'none');
  }

  toggleMap(force) {
    this.mapOpen = force ?? !this.mapOpen;
    this.el.fullmap.style.display = this.mapOpen ? 'flex' : 'none';
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const e = this.el;

    // Salud / escudo
    this.set('hp', e.hpFill, 'width', `${p.health}%`);
    this.set('hpv', e.hpVal, 'text', `${Math.ceil(p.health)}`);
    this.set('sh', e.shFill, 'width', `${p.shield}%`);
    this.set('shv', e.shVal, 'text', `${Math.ceil(p.shield)}`);

    // Inventario
    for (let i = 0; i < 6; i++) {
      const it = p.inventory[i];
      const s = this.slotEls[i];
      const sig = it ? `${it.kind}${it.type}${it.rarity}${it.ammo}` : 'empty';
      if (s.sig !== sig) {
        s.sig = sig;
        if (it) {
          s.img.src = this.icons.get(it);
          s.img.style.visibility = 'visible';
          s.root.style.setProperty('--rarity', it.kind === 'pickaxe' ? '#5a6270' : RARITIES[itemRarity(it)].color);
          s.root.classList.remove('empty');
        } else {
          s.img.style.visibility = 'hidden';
          s.root.style.setProperty('--rarity', 'transparent');
          s.root.classList.add('empty');
        }
      }
      const cnt = it ? (it.kind === 'weapon' ? `${it.mag}` : it.kind === 'consumable' ? `${it.count}` : '') : '';
      if (s.count.textContent !== cnt) s.count.textContent = cnt;
      s.root.classList.toggle('selected', i === p.selected);
    }

    // Munición
    const it = p.item;
    let ammoTxt = '';
    let wname = '';
    if (it && it.kind === 'weapon') {
      const def = WEAPONS[it.type];
      const reloading = g.combat.reloading ? ' <span class="reloading">RECARGANDO</span>' : '';
      ammoTxt = `<span class="mag">${it.mag}</span><span class="res"> / ${p.ammo[def.ammo]}</span>${reloading}`;
      wname = `<span style="color:${RARITIES[it.rarity].color}">${def.name}</span> · ${RARITIES[it.rarity].name}`;
    } else if (it && it.kind === 'consumable') {
      wname = `<span style="color:${RARITIES[CONSUMABLES[it.type].rarity].color}">${CONSUMABLES[it.type].name}</span> · Clic para usar`;
    } else {
      wname = 'Pico';
    }
    this.set('ammo', e.ammo, 'html', ammoTxt);
    this.set('wname', e.weaponName, 'html', p.mode === 'ground' ? wname : '');
    const al = Object.keys(AMMO).map((k) => `<span style="--c:#${AMMO[k].color.toString(16).padStart(6, '0')}">${AMMO[k].short} <b>${p.ammo[k]}</b></span>`).join('');
    this.set('ammoList', e.ammoList, 'html', al);

    // Mira
    const def = it && it.kind === 'weapon' ? WEAPONS[it.type] : null;
    let gap = 6;
    if (def) {
      const spread = def.pellets ? def.spread : g.combat.currentSpread(def);
      const fovR = THREE.MathUtils.degToRad(g.camera.fov / 2);
      gap = Math.max(3, (Math.tan(spread) / Math.tan(fovR)) * (innerHeight / 2));
    }
    const showCross = p.mode === 'ground' && !(def?.scope && g.combat.adsBlend > 0.9);
    this.set('cross', e.crosshair, 'display', showCross ? 'block' : 'none');
    e.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    e.crosshair.classList.toggle('shotgun', !!def?.pellets);

    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) e.hit.className = '';
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) e.toast.classList.remove('show');
    }
    if (this.dmgT > 0) this.dmgT -= dt;
    e.dmgVig.style.opacity = Math.max(0, this.dmgT / 0.4) * 0.8;

    // Brújula
    const heading = ((-p.yaw * 180) / Math.PI) % 360;
    const hd = (heading + 360) % 360;
    e.compass.style.transform = `translateX(${-(hd * 4) + 200}px)`;
    this.set('heading', e.heading, 'text', `${Math.round(hd)}°`);

    // Minimapa
    const mm = e.mini;
    g.mapRenderer.drawMini(this.miniCtx, mm.width, mm.height, g, p.mode === 'ground' ? 220 : 420);
    if (this.mapOpen) g.mapRenderer.drawFull(this.fullCtx, e.fullmapCanvas.width, e.fullmapCanvas.height, g);

    // Tormenta
    const st = g.storm;
    let stTxt = '';
    if (st.active) {
      const t = Math.max(0, Math.ceil(st.timer));
      const mmss = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      if (st.state === 'wait') stTxt = `<span class="ico">🌀</span> La tormenta se cerrará en <b>${mmss}</b>`;
      else if (st.state === 'shrink') stTxt = `<span class="ico">⚠</span> ¡La tormenta se está cerrando! <b>${mmss}</b>`;
      else stTxt = '<span class="ico">🌀</span> Tormenta final';
      if (p.mode !== 'lobby') {
        const out = st.distanceOutside(p.pos.x, p.pos.z);
        if (out > 0) stTxt += `<div class="warn">Fuera de la zona segura · ${Math.round(out)} m</div>`;
      }
    }
    this.set('storm', e.storm, 'html', stTxt);
    const outside = p.mode !== 'lobby' && p.mode !== 'bus' && st.active && st.isOutside(p.pos.x, p.pos.z);
    this.set('stormVig', e.stormVig, 'opacity', outside ? '1' : '0');

    // Altitud
    const air = p.mode === 'freefall' || p.mode === 'glide';
    this.set('altShow', e.altitude, 'display', air ? 'flex' : 'none');
    if (air) {
      this.set('alt', e.altitude, 'html', `<div class="alt-val">${Math.max(0, Math.round(p.altitude))} m</div><div class="alt-label">${p.mode === 'freefall' ? 'CAÍDA LIBRE · ESPACIO: desplegar' : 'PLANEADOR'}</div><div class="alt-speed">${Math.round(-p.vel.y)} m/s</div>`);
    }

    // Nombre de la zona al entrar
    if (p.mode === 'ground' || air) {
      const poi = g.world.poiAt(p.pos.x, p.pos.z);
      const name = poi ? poi.name : null;
      if (name !== this.lastZone) {
        this.lastZone = name;
        if (name) {
          e.zone.textContent = name.toUpperCase();
          e.zone.classList.remove('show');
          void e.zone.offsetWidth;
          e.zone.classList.add('show');
        }
      }
    }

    this.set('stats', e.stats, 'html', `<span>👤 1</span><span>🎯 ${Math.round(p.stats.damage)}</span><span>📦 ${p.stats.chests}</span>`);
  }
}

