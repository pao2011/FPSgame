import * as THREE from 'three';
import { WEAPONS, CONSUMABLES, THROWABLES, AMMO, RARITIES, MATERIALS, BUILD_COST, itemRarity } from '../game/items.js';
import { PIECES, MAT_ORDER, WALL_PRESETS } from '../game/build.js';
import { makeItemModel, makeWeaponModel, itemKey } from '../game/models.js';

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
    const key = itemKey(item);
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
      editHint: $('edit-hint'),
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
      mats: $('mats'),
      buildBar: $('build-bar'),
      feed: $('kill-feed'),
      dmgDir: $('damage-dir'),
      speed: $('speedo'),
      team: $('team-panel'),
      tags: $('name-tags'),
      score: $('score-bar'),
      fps: $('fps'),
      marks: $('compass-marks'),
    };
    this.tagEls = new Map();
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.miniCtx = this.el.mini.getContext('2d');
    this.fullCtx = this.el.fullmapCanvas.getContext('2d');
    this.buildSlots();
    this.buildCompass();
    // Clic en el mapa grande: marcar destino (clic derecho: quitarlo)
    const fc = this.el.fullmapCanvas;
    const toWorld = (e) => {
      const r = fc.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 1600 - 800, ((e.clientY - r.top) / r.height) * 1600 - 800];
    };
    fc.addEventListener('click', (e) => {
      if (game.touch) return; // en táctil lo gestiona src/ui/touch.js (bindMap)
      const [x, z] = toWorld(e);
      game.waypoint = { x, z };
      game.audio.ping();
    });
    fc.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      game.waypoint = null;
    });
    this.last = {};
    this.hitT = 0;
    this.toastT = 0;
    this.dmgT = 0;
    this.zoneT = 0;
    this.lastZone = null;
    this.mapOpen = false;
    addEventListener('resize', () => (this.compassHalf = 0));
    this.feed = [];
    this.dirs = [];
  }

  // Marcadores (pings y punto del mapa) en la brújula.
  updateMarkers(p) {
    const g = this.game;
    const list = g.pings.map((pg) => ({ pos: pg.pos, cls: pg.mine ? 'mine' : 'mate' }));
    if (g.waypoint) list.push({ pos: g.waypoint, cls: 'wp' });
    if (this.soundMarks?.length) list.push(...this.soundMarks);
    let html = '';
    for (const m of list) {
      const ang = Math.atan2(m.pos.x - p.pos.x, -(m.pos.z - p.pos.z)); // 0 = norte
      let rel = ((ang * 180) / Math.PI - ((-p.yaw * 180) / Math.PI)) % 360;
      if (rel > 180) rel -= 360;
      if (rel < -180) rel += 360;
      if (Math.abs(rel) > 50) continue;
      const d = Math.round(Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z));
      if (m.icon) html += `<span class="cmark ${m.cls}" style="left:${200 + rel * 4}px">${m.icon}</span>`;
      else html += `<span class="cmark ${m.cls}" style="left:${200 + rel * 4}px">▼<small>${d} m</small></span>`;
    }
    this.set('marks', this.el.marks, 'html', html);
  }

  fps(dt) {
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.el.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS`;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  }

  // Panel de compañeros + nombres sobre sus cabezas.
  updateTeam() {
    const g = this.game;
    const p = g.player;
    const teamMode = (g.mode.teamSize || 1) > 1 || g.mode.teams;
    const mates = teamMode ? g.chars.filter((c) => c !== p && c.team === p.team) : [];
    const panelMates = g.mode.teams ? mates.slice(0, 0) : mates;
    let html = '';
    for (const c of panelMates) {
      const st = !c.alive ? 'dead' : c.knocked ? 'down' : '';
      const hp = c.knocked ? c.knockHp : c.health;
      html += `<div class="mate ${st}"><span class="mname">${c.name}${c.knocked ? ' · DERRIBADO' : !c.alive ? ' · ELIMINADO' : ''}</span>
        <div class="mbar"><i class="sh" style="width:${c.alive && !c.knocked ? c.shield : 0}%"></i></div>
        <div class="mbar"><i class="${c.knocked ? 'kn' : 'hp'}" style="width:${c.alive ? hp : 0}%"></i></div></div>`;
    }
    this.set('team', this.el.team, 'html', html);
    // Etiquetas proyectadas
    const cam = g.camera;
    const w = innerWidth, h = innerHeight;
    const seen = new Set();
    for (const c of mates) {
      if (!c.alive || c.mode === 'bus') continue;
      const v = this.tagV || (this.tagV = new THREE.Vector3());
      v.copy(c.pos);
      v.y += c.height + 0.5;
      const d = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      let el = this.tagEls.get(c);
      if (!el) {
        el = document.createElement('div');
        el.className = 'name-tag';
        this.el.tags.appendChild(el);
        this.tagEls.set(c, el);
      }
      seen.add(c);
      el.textContent = `${c.knocked ? '✚ ' : ''}${c.name} · ${Math.round(d)} m`;
      el.classList.toggle('down', c.knocked);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      el.style.display = '';
    }
    for (const [c, el] of this.tagEls) {
      if (!seen.has(c)) el.style.display = 'none';
    }
    // Marcador del duelo por equipos
    if (g.mode.respawn) {
      const mine = g.score[p.team], other = g.score[1 - p.team];
      const lim = g.mode.scoreLimit;
      this.set('score', this.el.score, 'html', `<span class="ally">${mine}</span><div class="sb"><i class="ally" style="width:${(mine / lim) * 50}%"></i><i class="enemy" style="width:${(other / lim) * 50}%"></i></div><span class="enemy">${other}</span><small>Primero a ${lim}</small>`);
      this.set('scoreShow', this.el.score, 'display', 'flex');
    } else this.set('scoreShow', this.el.score, 'display', 'none');
  }

  resetFeed() {
    for (const el of this.tagEls.values()) el.remove();
    this.tagEls.clear();
    this.feed.length = 0;
    this.el.feed.innerHTML = '';
    for (const d of this.dirs) d.el.remove();
    this.dirs.length = 0;
  }

  killFeed(html, mine) {
    const el = document.createElement('div');
    el.className = 'feed-item' + (mine ? ' mine' : '');
    el.innerHTML = html;
    this.el.feed.prepend(el);
    this.feed.push({ el, t: 6 });
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
  }

  buildSlots() {
    this.slotEls = [];
    this.el.slots.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<span class="key">${i + 1}</span><img alt="" draggable="false"><span class="count"></span>`;
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

  // Aviso fijo de conexión (online): texto y segundos de cuenta atrás.
  netBanner(text, secs = 0) {
    if (!this.netEl) {
      this.netEl = document.createElement('div');
      this.netEl.id = 'net-banner';
      this.el.hud.appendChild(this.netEl);
    }
    this.netText = text;
    this.netEnd = text && secs ? performance.now() / 1000 + secs : 0;
    this.netEl.style.display = text ? '' : 'none';
    this.paintNet();
  }

  paintNet() {
    if (!this.netText || !this.netEl) return;
    const left = this.netEnd ? Math.max(0, Math.ceil(this.netEnd - performance.now() / 1000)) : 0;
    this.netEl.innerHTML = `<span class="spin"></span>${this.netText}${left ? ` <b>${left} s</b>` : ''}`;
  }

  banner(msg, sub = '') {
    this.set('banner', this.el.banner, 'html', msg ? `<div class="big">${msg}</div>${sub ? `<div class="sub">${sub}</div>` : ''}` : '');
  }

  hitMarker(head, kill) {
    const h = this.el.hit;
    h.className = 'show' + (head ? ' head' : '') + (kill === 'knock' ? ' knock' : kill ? ' kill' : '');
    this.hitT = 0.18;
    this.game.touch?.haptic(kill === 'knock' ? 'knock' : kill ? 'kill' : head ? 'head' : 'hit');
  }

  flashDamage(type, attacker = null) {
    this.dmgT = 0.4;
    this.el.dmgVig.className = type === 'storm' ? 'storm' : '';
    if (attacker && attacker.pos) {
      // Indicador de la dirección desde la que te disparan
      const el = document.createElement('div');
      el.className = 'dir-arc';
      this.el.dmgDir.appendChild(el);
      this.dirs.push({ el, t: 1.2, from: attacker.pos.clone() });
    }
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
    this.scoped = on;
    this.set('scope', this.el.scope, 'display', on ? 'block' : 'none');
  }

  setPrompt(text) {
    // En táctil la tecla E es el botón «USAR» (o tocar el propio aviso)
    if (text && this.game.touch) text = text.replace('<kbd>E</kbd>', '<kbd>USAR</kbd>');
    this.set('prompt', this.el.prompt, 'html', text || '');
    this.set('promptShow', this.el.prompt, 'display', text ? 'block' : 'none');
  }

  toggleMap(force) {
    const was = this.mapOpen;
    this.mapOpen = force ?? !this.mapOpen;
    this.el.fullmap.style.display = this.mapOpen ? 'flex' : 'none';
    // Con el mapa abierto se libera el ratón para poder marcar un destino
    const g = this.game;
    if (this.mapOpen && !was && g.state === 'playing') g.input.unlock();
    else if (!this.mapOpen && was && g.state === 'playing' && force === undefined && g.player.alive) g.input.lock();
  }

  update(dt) {
    if (this.netText) this.paintNet();
    const g = this.game;
    const p = g.player;
    const e = this.el;

    // Salud / escudo (derribado: barra roja de desangrado)
    const hpShown = p.knocked ? p.knockHp : p.health;
    this.set('hp', e.hpFill, 'width', `${Math.max(0, hpShown)}%`);
    this.set('hpv', e.hpVal, 'text', `${Math.max(0, Math.ceil(hpShown))}`);
    e.hpFill.classList.toggle('knocked', p.knocked);
    this.updateTeam();
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
          s.root.classList.toggle('glow', it.kind !== 'pickaxe' && !!RARITIES[itemRarity(it)].glow);
        } else {
          s.img.style.visibility = 'hidden';
          s.root.style.setProperty('--rarity', 'transparent');
          s.root.classList.add('empty');
          s.root.classList.remove('glow');
        }
      }
      const cnt = it ? (it.kind === 'weapon' ? `${it.mag}` : it.kind === 'consumable' || it.kind === 'throwable' ? `${it.count}` : '') : '';
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
      const low = !g.combat.reloading && it.mag <= Math.ceil(def.mag * 0.25) && def.mag > 2 ? ' low' : '';
      const reserve = g.infiniteAmmo ? '∞' : p.ammo[def.ammo];
      const out = !g.infiniteAmmo && p.ammo[def.ammo] <= 0 && it.mag <= 0 ? ' <span class="reloading">SIN MUNICIÓN</span>' : '';
      ammoTxt = `<span class="mag${low}">${it.mag}</span><span class="res"> / ${reserve}</span>${reloading}${out}`;
      const spin = def.spinUp && g.combat.spin > 0 && g.combat.spin < def.spinUp ? ' · girando…' : '';
      wname = `<span style="color:${RARITIES[it.rarity].color}">${def.name}</span> · ${RARITIES[it.rarity].name}${spin}`;
    } else if (it && it.kind === 'consumable') {
      const cdef = CONSUMABLES[it.type];
      const verb = cdef.deploy ? 'colocar' : 'usar';
      wname = `<span style="color:${RARITIES[cdef.rarity].color}">${cdef.name}</span> · ${g.touch ? `Dispara para ${verb}` : `Clic para ${verb}`}`;
    } else if (it && it.kind === 'throwable') {
      const td = THROWABLES[it.type];
      const col = RARITIES[td.rarity].color;
      if (td.remote) {
        const n = g.explosives.charges(p);
        wname = `<span style="color:${col}">${it.count > 0 ? td.name : 'Detonador de C4'}</span> · ${it.count > 0 ? (g.touch ? 'Dispara: lanzar · ' : 'Clic izq.: lanzar · ') : ''}${g.touch ? 'Apuntar: detonar' : 'Clic der.: detonar'}${n ? ` (${n})` : ''}`;
      } else wname = `<span style="color:${col}">${td.name}</span> · ${g.touch ? 'Dispara para lanzar' : 'Clic para lanzar'}`;
      ammoTxt = `<span class="mag">${it.count}</span>`;
    } else {
      wname = 'Pico';
    }
    this.set('ammo', e.ammo, 'html', ammoTxt);
    this.set('wname', e.weaponName, 'html', p.mode === 'ground' ? wname : '');
    const al = Object.keys(AMMO).map((k) => `<span style="--c:#${AMMO[k].color.toString(16).padStart(6, '0')}">${AMMO[k].short} <b>${p.ammo[k]}</b></span>`).join('');
    this.set('ammoList', e.ammoList, 'html', g.infiniteAmmo ? '<span>Munición infinita</span>' : al);

    // Mira
    const def = it && it.kind === 'weapon' ? WEAPONS[it.type] : null;
    let gap = 6;
    if (def) {
      const spread = def.pellets ? def.spread : g.combat.currentSpread(def);
      const fovR = THREE.MathUtils.degToRad(g.camera.fov / 2);
      gap = Math.max(3, (Math.tan(spread) / Math.tan(fovR)) * (innerHeight / 2));
    }
    const showCross = p.mode === 'ground' && !p.vehicle && !(def?.scope && g.combat.adsBlend > 0.9) && !g.creativePanel?.open;
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
    if (!this.compassHalf) this.compassHalf = e.compass.parentElement.clientWidth / 2 || 200;
    e.compass.style.transform = `translateX(${-(hd * 4) + this.compassHalf}px)`;
    this.set('heading', e.heading, 'text', `${Math.round(hd)}°`);
    this.updateMarkers(p);

    // Minimapa (en calidad móvil se redibuja a ~13 Hz para ahorrar CPU)
    const mm = e.mini;
    this.miniT = (this.miniT || 0) - dt;
    if (this.miniT <= 0) {
      this.miniT = g.quality === 'movil' ? 0.075 : 0;
      g.mapRenderer.drawMini(this.miniCtx, mm.width, mm.height, g, p.mode === 'ground' ? 220 : 420);
    }
    this.fullT = (this.fullT || 0) - dt;
    if (this.mapOpen && this.fullT <= 0) {
      this.fullT = g.quality === 'movil' ? 0.1 : 0;
      g.mapRenderer.drawFull(this.fullCtx, e.fullmapCanvas.width, e.fullmapCanvas.height, g);
    }

    // Tormenta
    const st = g.storm;
    let stTxt = '';
    if (st.active) {
      const t = Math.max(0, Math.ceil(st.timer));
      const mmss = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      if (st.state === 'wait' && st.drift) stTxt = `<span class="ico">➡</span> ¡La zona se está moviendo! <b>${mmss}</b>`;
      else if (st.state === 'wait') stTxt = `<span class="ico">🌀</span> La tormenta se cerrará en <b>${mmss}</b>`;
      else if (st.state === 'shrink') stTxt = `<span class="ico">⚠</span> ¡La tormenta se está cerrando! <b>${mmss}</b>`;
      else stTxt = '<span class="ico">🌀</span> Tormenta final';
      if (g.weather?.label) stTxt += `<div class="wx">${g.weather.label}</div>`;
      for (const q of g.npcs?.quests || []) {
        if (q.state === 'active') stTxt += `<div class="qst">📜 ${g.npcs.questText(q)} · <b>${q.v}/${q.goal}</b></div>`;
      }
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
      this.set('alt', e.altitude, 'html', `<div class="alt-val">${Math.max(0, Math.round(p.altitude))} m</div><div class="alt-label">${p.mode === 'freefall' ? (g.touch ? 'CAÍDA LIBRE · PLANEAR: desplegar' : 'CAÍDA LIBRE · ESPACIO: desplegar') : 'PLANEADOR'}</div><div class="alt-speed">${Math.round(-p.vel.y)} m/s</div>`);
    }

    // Nombre de la zona al entrar
    if (p.mode === 'ground' || air) {
      const w = g.world;
      const poi = w.poiAt(p.pos.x, p.pos.z);
      const isl = w.island && Math.hypot(p.pos.x - w.island.x, p.pos.z - w.island.z) < w.island.R;
      const site = w.sites?.find((s) => s.contains(p.pos.x, p.pos.z));
      const name = poi ? poi.name : isl ? 'Isla de la Bóveda' : site ? site.name : null;
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

    const teamsTxt = (g.mode.teamSize || 1) > 1 ? `<span title="Equipos vivos">🚩 ${g.teamsAlive().size}</span>` : '';
    const aliveTxt = g.mode.respawn || g.mode.creative ? '' : `<span title="Jugadores vivos">👤 ${g.phase === 'lobby' ? `${g.lobbyCount}/${g.chars.length}` : g.aliveCount}</span>`;
    const pingTxt = g.net ? `<span class="ping" title="Ping con el servidor">📶 ${g.netClient.ping || '–'}</span>` : '';
    this.set('stats', e.stats, 'html', `${aliveTxt}${teamsTxt}<span title="Eliminaciones">💀 ${p.stats.kills}</span><span title="Cofres">📦 ${p.stats.chests}</span>${pingTxt}`);

    // Materiales
    const b = g.build;
    const mats = MAT_ORDER.map((m) => {
      const sel = b.active && b.matId === m ? ' sel' : '';
      const low = p.mats[m] < BUILD_COST ? ' low' : '';
      return `<span class="mat ${m}${sel}${low}"><i></i>${p.mats[m]}</span>`;
    }).join('');
    const gold = g.npcs?.list.length && g.state === 'playing' && !g.mode.creative && !g.mode.noBots ? `<span class="mat gold" title="Oro (PNJ)">💰 ${p.gold || 0}</span>` : '';
    this.set('mats', e.mats, 'html', gold + mats);

    // Barra de construcción
    const showBar = b.active || !!b.editing;
    this.set('buildShow', e.buildBar, 'display', showBar ? 'flex' : 'none');
    if (b.editing) {
      const pc = b.editing.piece;
      const presets = pc.type === 'wall' ? WALL_PRESETS.map((w, i) => `<div class="piece"><span class="key">${i + 1}</span>${w.name}</div>`).join('') : '';
      this.set('buildBar', e.buildBar, 'html', `<div class="piece sel">✏️ EDITANDO ${{ wall: 'MURO', floor: 'SUELO', ramp: 'RAMPA', cone: 'TECHO' }[pc.type]}</div>${presets}`);
    } else if (b.active) {
      const html = PIECES.map((pc, i) => `<div class="piece ${i === b.piece ? 'sel' : ''}"><span class="key">${pc.key}</span><span class="ico ${pc.id}"></span>${pc.name}</div>`).join('') +
        `<div class="piece-mat" style="color:${MATERIALS[b.matId].color}">${MATERIALS[b.matId].name}<small>${g.touch ? 'tocar: cambiar' : 'clic der.'}</small></div>` +
        (b.rot ? `<div class="piece-mat">↻ ${b.rot * 90}°<small>${g.key('reload')}</small></div>` : '') +
        (g.settings.turboBuild ? '<div class="piece-mat">TURBO<small>construcción</small></div>' : '');
      this.set('buildBar', e.buildBar, 'html', html);
    }
    this.set('slotsShow', e.slots, 'display', showBar ? 'none' : 'flex');

    // Edición y modo creativo
    let hint = '';
    if (b.editing) hint = g.touch ? 'EDITANDO · ✎ LISTO para confirmar' : 'EDITANDO · <kbd>F</kbd> confirmar · <kbd>Clic der.</kbd> reiniciar';
    else if (b.editTarget && !g.touch) hint = '<kbd>F</kbd> Editar';
    else if (g.creative?.selected) hint = g.touch ? `Colocando: ${g.creative.selected.name}` : `Colocando: ${g.creative.selected.name} · <kbd>R</kbd> girar · <kbd>Clic der.</kbd> cancelar`;
    else if (g.creative?.erase) hint = g.touch ? 'BORRAR: apunta y dispara' : 'BORRAR: apunta y haz clic · <kbd>Clic der.</kbd> terminar';
    this.set('editHint', e.editHint, 'html', hint);
    this.set('editHintShow', e.editHint, 'display', hint ? 'block' : 'none');

    // Velocímetro
    this.set('speedShow', e.speed, 'display', p.vehicle ? 'block' : 'none');
    if (p.vehicle) {
      const v = p.vehicle;
      const fuel = Math.round(v.fuel ?? 100), hp = v.def ? Math.max(0, Math.round((v.hp / v.def.hp) * 100)) : 100;
      this.set('speed', e.speed, 'html', `${Math.round(Math.abs(v.speed) * 3.6)}<small> km/h</small>
        <div class="vbars"><span>⛽<i style="width:${fuel * 0.6}px" class="${fuel < 20 ? 'low' : ''}"></i></span><span>🔧<i style="width:${hp * 0.6}px" class="${hp < 30 ? 'low' : ''}"></i></span></div>
        ${v.refueling ? '<div class="vref">Repostando…</div>' : fuel <= 0 ? '<div class="vref low">Sin gasolina · busca una gasolinera</div>' : ''}`);
    }

    // Feed de eliminaciones
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const f = this.feed[i];
      f.t -= dt;
      if (f.t < 1) f.el.style.opacity = Math.max(0, f.t);
      if (f.t <= 0) {
        f.el.remove();
        this.feed.splice(i, 1);
      }
    }
    // Indicadores de daño
    for (let i = this.dirs.length - 1; i >= 0; i--) {
      const d = this.dirs[i];
      d.t -= dt;
      const ang = Math.atan2(d.from.x - p.pos.x, d.from.z - p.pos.z);
      // ángulo relativo a la cámara (0 = delante)
      const rel = ang - (p.yaw + Math.PI);
      d.el.style.transform = `rotate(${-rel}rad)`;
      d.el.style.opacity = Math.min(1, d.t);
      if (d.t <= 0) {
        d.el.remove();
        this.dirs.splice(i, 1);
      }
    }
  }
}

