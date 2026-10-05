// Mando (API Gamepad, distribución estándar de Xbox/PlayStation). Los botones
// pulsan acciones virtuales en Input (no dependen de las teclas asignadas),
// el stick izquierdo mueve y el derecho mira. Incluye asistencia de apuntado
// (frenado y ligera atracción hacia el enemigo, y «ajuste» al apuntar) y dos
// esquemas: Clásico y Constructor pro (gatillos y botones superiores colocan
// piezas directamente en modo construcción).

import * as THREE from 'three';

const tmpDir = new THREE.Vector3();
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = 0.14;

const dz = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * ((Math.abs(v) - DEAD) / (1 - DEAD)));
const curve = (v) => Math.sign(v) * Math.abs(v) ** 1.7;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Esquemas: botón -> acción (combate) y botón -> acción (construcción).
export const PAD_SCHEMES = {
  clasico: {
    name: 'Clásico',
    combat: { A: 'jump', B: 'crouch', X: 'interact+reload', Y: 'slot1', LT: 'ads', RT: 'fire', VIEW: 'map', R3: 'build', L3: 'sprint', UP: 'ping', DOWN: 'inventory', LEFT: 'quickHeal', RIGHT: 'camera' },
    build: { A: 'jump', B: 'edit', X: 'reload', Y: 'slot1', LT: 'ads', RT: 'fire', VIEW: 'map', R3: 'build', L3: 'sprint', UP: 'ping', DOWN: 'inventory', LEFT: 'editReset', RIGHT: 'camera' },
  },
  pro: {
    name: 'Constructor pro',
    combat: { A: 'jump', B: 'build', X: 'interact+reload', Y: 'slot1', LT: 'ads', RT: 'fire', VIEW: 'map', R3: 'crouch', L3: 'sprint', UP: 'ping', DOWN: 'inventory', LEFT: 'quickHeal', RIGHT: 'camera' },
    // RT muro · RB suelo · LT rampa · LB techo (se elige la pieza y se coloca)
    build: { A: 'jump', B: 'build', X: 'reload', Y: 'slot1', RT: 'piece:pieceWall', RB: 'piece:pieceFloor', LT: 'piece:pieceRamp', LB: 'piece:pieceCone', VIEW: 'map', R3: 'crouch', L3: 'edit', UP: 'ping', DOWN: 'inventory', LEFT: 'editReset', RIGHT: 'camera' },
  },
};

export class GamepadInput {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.prev = [];
    this.active = false; // se está usando el mando (para la asistencia)
    this.index = -1;
    this.sprintLatch = false;
    this.pieceFire = new Map(); // botón -> fotogramas que faltan para disparar
    this.held = new Set(); // acciones mantenidas por el mando este fotograma
    addEventListener('gamepadconnected', (e) => {
      this.index = e.gamepad.index;
      game.hud?.toast(`Mando conectado: ${e.gamepad.id.split('(')[0].trim().slice(0, 40)}`);
    });
    addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.index) {
        this.index = -1;
        this.release();
        game.hud?.toast('Mando desconectado');
      }
    });
  }

  pad() {
    const list = navigator.getGamepads?.() || [];
    if (this.index >= 0 && list[this.index]) return list[this.index];
    for (const p of list) if (p && p.connected) return (this.index = p.index), p;
    return null;
  }

  release() {
    for (const a of this.held) this.input.vSet(a, false);
    this.held.clear();
    this.input.axis.active = false;
  }

  update(dt) {
    const p = this.pad();
    if (!p) return;
    const g = this.game;
    const s = g.settings;
    const pressed = (i) => !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4);
    const now = Array.from({ length: 16 }, (_, i) => pressed(i));
    const edge = (i) => now[i] && !this.prev[i];
    const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
    if (now.some(Boolean) || lx || ly || rx || ry) this.active = true;

    // Menú / pausa
    if (edge(B.MENU) && g.state === 'playing') {
      if (g.paused) {
        g.setPaused(false);
        g.input.lock();
      } else g.setPaused(true);
    }
    if (g.state !== 'playing' || g.paused) {
      this.prev = now;
      this.release();
      return;
    }

    // Botones -> acciones
    const scheme = PAD_SCHEMES[s.padScheme] || PAD_SCHEMES.clasico;
    const map = g.build.active ? scheme.build : scheme.combat;
    const want = new Set();
    for (const [name, act] of Object.entries(map)) {
      const i = B[name];
      if (act.startsWith('piece:')) {
        // Constructor pro: elegir la pieza al pulsar y colocar al fotograma siguiente
        const piece = act.slice(6);
        if (edge(i)) {
          want.add(piece);
          this.pieceFire.set(i, 1);
        } else if (now[i] && (this.pieceFire.get(i) ?? 0) <= 0) want.add('fire');
        if (this.pieceFire.has(i)) this.pieceFire.set(i, this.pieceFire.get(i) - 1);
        if (!now[i]) this.pieceFire.delete(i);
        continue;
      }
      if (act === 'sprint') {
        if (edge(i)) this.sprintLatch = !this.sprintLatch;
        continue;
      }
      if (now[i]) for (const a of act.split('+')) want.add(a);
    }
    // Arma/pieza siguiente y anterior (botones superiores en el esquema clásico)
    if (!map.LB && edge(B.LB)) g.input.wheel -= 1;
    if (!map.RB && edge(B.RB)) g.input.wheel += 1;
    // Correr: se mantiene mientras el stick siga empujado
    if (!lx && !ly) this.sprintLatch = false;
    if (this.sprintLatch) want.add('sprint');
    for (const a of this.held) if (!want.has(a)) this.input.vSet(a, false);
    for (const a of want) this.input.vSet(a, true);
    this.held = want;

    // Stick izquierdo: movimiento analógico
    const ax = this.input.axis;
    if (lx || ly) {
      ax.x = lx;
      ax.y = -ly;
      ax.active = true;
      ax.pad = true;
    } else if (ax.pad) {
      ax.x = ax.y = 0;
      ax.active = false;
      ax.pad = false;
    }

    // Stick derecho: cámara (en las mismas unidades que el táctil)
    const sens = (s.padSens ?? 1) * 560 * dt;
    let lookX = curve(rx) * sens * 1.25;
    let lookY = curve(ry) * sens;
    const assist = s.padAimAssist !== false ? this.aimAssist(dt, lookX !== 0 || lookY !== 0 || lx !== 0 || ly !== 0, edge(B.LT)) : 1;
    this.input.lookDX += lookX * assist;
    this.input.lookDY += lookY * assist;
    this.prev = now;
  }

  // Asistencia de apuntado: devuelve el factor de frenado de la cámara y
  // atrae ligeramente la mira hacia el enemigo más cercano a ella. También la
  // usan los controles táctiles (src/ui/mobile.js) con su propia intensidad.
  aimAssist(dt, moving, adsPressed, strength = this.game.settings.padAssistStrength ?? 1) {
    const g = this.game;
    const p = g.player;
    if (!p.alive || p.mode !== 'ground' || g.build.active || p.item?.kind !== 'weapon') return 1;
    const o = g.aimOrigin, d = g.aimDir;
    if (!o || !d) return 1;
    let best = null, bestAng = 0.2;
    for (const c of g.chars) {
      if (c === p || !c.alive || c.team === p.team || c.mode === 'bus' || c.mode === 'lobby') continue;
      const tx = c.pos.x - o.x, ty = c.pos.y + (c.crouching || c.knocked ? 0.9 : 1.3) - o.y, tz = c.pos.z - o.z;
      const dist = Math.hypot(tx, ty, tz);
      if (dist > 110 || dist < 1) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (tx * d.x + ty * d.y + tz * d.z) / dist)));
      // Cono más ancho de cerca
      const lim = Math.min(0.2, 0.06 + 2.2 / dist);
      if (ang < lim && ang < bestAng) {
        bestAng = ang;
        best = { c, tx, ty, tz, dist, lim };
      }
    }
    if (!best) return 1;
    // Sólo si se ve (sin paredes en medio)
    const dir = tmpDir.set(best.tx, best.ty, best.tz).divideScalar(best.dist);
    const hit = g.raycast(o, dir, best.dist + 1, 0, p);
    if (hit && hit.entity !== best.c && hit.t < best.dist - 0.8) return 1;
    const ads = this.input.held('ads');
    const targetYaw = Math.atan2(-dir.x, -dir.z);
    const targetPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const dy = wrap(targetYaw - p.yaw), dp = targetPitch - p.pitch;
    if (adsPressed && bestAng < best.lim) {
      // Al apuntar: la mira salta casi hasta el objetivo
      p.yaw += dy * 0.75 * strength;
      p.pitch += dp * 0.75 * strength;
    } else if (moving) {
      const k = Math.min(1, dt * (ads ? 5 : 2.5) * strength);
      p.yaw += dy * k;
      p.pitch += dp * k;
    }
    return 1 - (ads ? 0.45 : 0.3) * Math.min(1, strength) * (1 - bestAng / best.lim);
  }
}
