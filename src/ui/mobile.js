// Extras para móviles y tabletas (sólo con los controles táctiles activos):
// apuntar con el giroscopio, disparo automático, asistencia de apuntado
// táctil, vibración según lo que pasa, batería y hora en el HUD y ahorro de
// energía automático con la batería baja.
import { WEAPONS } from '../game/items.js';

const D2R = Math.PI / 180;

// Vibraciones (ms o patrón) para cada suceso.
const HAPTICS = {
  hit: 8,
  head: 22,
  knock: [25, 35, 25],
  kill: [40, 40, 90],
  hurt: 25,
  pickup: 10,
  ping: 12,
  build: 6,
};

export class MobileExtras {
  constructor(game, touch) {
    this.game = game;
    this.touch = touch;
    this.gyroOn = false;
    this.gyroT = 0;
    this.autoTarget = false;
    this.afPulse = false;
    this.afT = 0;
    this.hapticT = {};
    this.battery = null;
    this.saving = false;
    this.onMotion = this.onMotion.bind(this);
    this.initBattery();
    this.applySettings();
  }

  applySettings() {
    const s = this.game.settings;
    if ((s.gyro || 'off') !== 'off') this.enableGyro();
    this.checkBattery();
  }

  // ------------------------------------------------------------ GIROSCOPIO
  // En iOS hay que pedir permiso (tiene que ser tras un toque del jugador).
  enableGyro(fromGesture = false) {
    if (this.gyroOn || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
    const add = () => {
      if (this.gyroOn) return;
      addEventListener('devicemotion', this.onMotion);
      this.gyroOn = true;
    };
    const req = window.DeviceMotionEvent.requestPermission;
    if (typeof req === 'function') {
      if (!fromGesture) return; // se pedirá con el siguiente toque
      req
        .call(window.DeviceMotionEvent)
        .then((r) => (r === 'granted' ? add() : this.game.hud.toast('Giroscopio: permiso denegado')))
        .catch(() => {});
    } else add();
  }

  // Primer toque: si el giroscopio necesita permiso, se pide ahora.
  onGesture() {
    if (!this.gyroOn && (this.game.settings.gyro || 'off') !== 'off') this.enableGyro(true);
  }

  onMotion(e) {
    const r = e.rotationRate;
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.gyroT || now)) / 1000);
    this.gyroT = now;
    if (!r || !dt) return;
    const g = this.game;
    const s = g.settings;
    const mode = s.gyro || 'off';
    if (mode === 'off') return;
    const p = g.player;
    if (g.state !== 'playing' || g.paused || !g.input.locked || !p.alive || g.hud.mapOpen || g.spectating) return;
    if (mode === 'ads' && !g.input.held('ads')) return;
    // Giro del móvil (°/s) → giro de la cámara, según cómo esté apoyado
    const a = ((Math.round((screen.orientation?.angle ?? window.orientation ?? 0) / 90) * 90) % 360 + 360) % 360;
    const b = r.beta || 0, gm = r.gamma || 0;
    let right, down;
    if (a === 90) [right, down] = [-b, gm];
    else if (a === 270) [right, down] = [b, -gm];
    else if (a === 180) [right, down] = [gm, b];
    else [right, down] = [-gm, -b];
    // Zona muerta para que no se desvíe la mira con el pulso
    const dead = 1.2;
    right = Math.abs(right) < dead ? 0 : right - Math.sign(right) * dead;
    down = Math.abs(down) < dead ? 0 : down - Math.sign(down) * dead;
    // Mismas unidades que arrastrar el dedo (ver Game.step: 0.0048 rad por píxel)
    const k = (D2R * dt * (s.gyroSens ?? 1)) / (0.0048 * (s.touchSens || 1));
    g.input.lookDX += right * k;
    g.input.lookDY += down * k * (s.invertY ? -1 : 1);
  }

  // ------------------------------------------------------------ CADA FOTOGRAMA
  // Antes de aplicar la cámara y las armas (Game.step).
  preStep(dt) {
    const g = this.game;
    const s = g.settings;
    const p = g.player;
    const input = g.input;
    const active = g.state === 'playing' && !g.paused && input.locked && p.alive && p.mode === 'ground' && !p.knocked && !g.build.active && !g.hud.mapOpen && !g.spectating;
    const weapon = active && p.item?.kind === 'weapon' ? p.item : null;

    // Asistencia de apuntado táctil (la misma que la del mando, más suave)
    if (weapon && s.touchAimAssist !== false && g.gamepad?.aimAssist) {
      const moving = input.lookDX !== 0 || input.lookDY !== 0 || input.axis.active;
      const adsNow = input.held('ads');
      const adsEdge = adsNow && !this.adsPrev;
      const f = g.gamepad.aimAssist(dt, moving, adsEdge, (s.touchAssistStrength ?? 0.7) * 0.8);
      input.lookDX *= f;
      input.lookDY *= f;
    }
    this.adsPrev = input.held('ads');

    // Disparo automático: dispara solo con la mira sobre un enemigo visible
    let want = false;
    if (weapon && s.autoFire) {
      const def = WEAPONS[weapon.type] || {};
      const usable = !def.explosive && !def.charge && (weapon.mag ?? 1) > 0 && !g.combat.reloading;
      this.afT -= dt;
      if (usable && this.afT <= 0) {
        this.afT = 0.06;
        const hit = g.raycast(g.aimOrigin, g.aimDir, Math.min(def.range || 150, 200), g.aimSkip, p);
        const c = hit?.kind === 'character' ? hit.entity : null;
        this.autoTarget = !!(c && c !== p && c.alive && c.team !== p.team);
      } else if (!usable) this.autoTarget = false;
      want = this.autoTarget;
      // Armas semiautomáticas: soltar y volver a pulsar en fotogramas alternos
      if (want && !def.auto) {
        this.afPulse = !this.afPulse;
        want = this.afPulse;
      }
    } else this.autoTarget = false;
    if (want !== this.afHeld) {
      this.afHeld = want;
      input.vSet('fire', want);
    }
    const cross = g.hud.el.crosshair;
    if (cross && this.autoTarget !== this.crossOn) {
      this.crossOn = this.autoTarget;
      cross.classList.toggle('auto-target', this.autoTarget);
    }
  }

  // ------------------------------------------------------------ VIBRACIÓN
  haptic(kind) {
    const s = this.game.settings;
    if (s.vibration === false || s.hapticEvents === false) return;
    const now = performance.now();
    // Los impactos seguidos (ametralladora) no vibran en cada bala
    if (now - (this.hapticT[kind] || 0) < (kind === 'hit' ? 70 : 120)) return;
    this.hapticT[kind] = now;
    this.touch.vibrate(HAPTICS[kind] ?? 10);
  }

  // ------------------------------------------------------------ BATERÍA
  initBattery() {
    if (!navigator.getBattery) return;
    navigator
      .getBattery()
      .then((b) => {
        this.battery = b;
        const on = () => this.checkBattery();
        b.addEventListener?.('levelchange', on);
        b.addEventListener?.('chargingchange', on);
        this.checkBattery();
      })
      .catch(() => {});
  }

  // Con la batería baja (≤ 20 % y sin cargar) se limita a 30 FPS.
  checkBattery() {
    const b = this.battery;
    const s = this.game.settings;
    const low = !!b && s.lowBatterySaver !== false && !b.charging && b.level <= 0.2;
    const ok = !b || b.charging || b.level > 0.25 || s.lowBatterySaver === false;
    if (low && !this.saving) {
      this.saving = true;
      if (s.fpsCap !== 30) this.game.hud?.toast('🔋 Batería baja: ahorro de energía activado (30 FPS)');
    } else if (ok && this.saving) this.saving = false;
  }

  // Batería y hora para la fila de datos del HUD.
  statusHTML() {
    if (this.game.settings.showDeviceStatus === false) return '';
    const d = new Date();
    const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const b = this.battery;
    const bat = b ? `<span class="dev-bat${b.level <= 0.2 && !b.charging ? ' low' : ''}" title="Batería">${b.charging ? '⚡' : '🔋'}${Math.round(b.level * 100)}%</span>` : '';
    return `${bat}<span class="dev-time" title="Hora">${time}</span>`;
  }
}
