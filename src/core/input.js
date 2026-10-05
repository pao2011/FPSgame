// Teclado + ratón con soporte de pointer lock y acciones reasignables. En
// pantallas táctiles los controles en pantalla (src/ui/touch.js) escriben en
// este mismo objeto, así que el resto del juego no distingue entre PC y móvil.
import { defaultBinds } from './binds.js';

const PREVENT = new Set(['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'F1', 'F2', 'F3', 'F4']);
const DEFAULTS = defaultBinds();

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.buttons = new Set();
    this.clicked = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.onLockChange = null;
    this.binds = defaultBinds();
    this.capture = null; // (código) => void mientras se reasigna una tecla
    // Táctil: giro de cámara (en píxeles de pantalla) y joystick analógico.
    this.touch = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.axis = { x: 0, y: 0, active: false };
    // Pulsaciones táctiles más cortas que un fotograma: se sueltan al acabar
    // el fotograma siguiente para que el juego llegue a verlas.
    this.frame = 0;
    // Acciones virtuales (mando): se pulsan por nombre de acción, así que no
    // dependen de las teclas asignadas.
    this.vHeld = new Set();
    this.vHit = new Set();
    this.vUp = new Set();
    this.downFrame = new Map();
    this.lateUp = new Set();

    addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        this.capture(e.code === 'Escape' ? null : e.code);
        return;
      }
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (PREVENT.has(e.code) && this.locked) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked || this.touch) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (this.capture) {
        e.preventDefault();
        this.capture('Mouse' + e.button);
        return;
      }
      if (!this.locked || this.touch) return;
      if (e.button === 1) e.preventDefault();
      this.buttons.add(e.button);
      this.clicked.add(e.button);
    });
    addEventListener('mouseup', (e) => {
      if (this.touch) return;
      if (this.buttons.delete(e.button)) this.released.add('Mouse' + e.button);
    });
    addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.touch) return;
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.keys.clear();
        this.buttons.clear();
      }
      this.onLockChange?.(this.locked);
    });
  }

  // En táctil no hay pointer lock: "capturar" sólo marca que se está jugando.
  lock() {
    if (this.touch) {
      if (this.locked) return;
      this.locked = true;
      this.onLockChange?.(true);
      return;
    }
    const r = this.canvas.requestPointerLock?.();
    if (r && r.catch) r.catch(() => {});
  }

  unlock() {
    if (this.touch) {
      if (!this.locked) return;
      this.locked = false;
      this.releaseAll();
      this.onLockChange?.(false);
      return;
    }
    document.exitPointerLock?.();
  }

  releaseAll() {
    this.vHeld.clear();
    this.keys.clear();
    this.buttons.clear();
    this.lateUp.clear();
    this.axis.x = this.axis.y = 0;
    this.axis.active = false;
  }

  // ---- API para los controles táctiles (códigos de tecla o 'mouse0'/'mouse2')
  press(code) {
    const m = code.startsWith('mouse') ? Number(code.slice(5)) : null;
    if (m !== null) {
      this.buttons.add(m);
      this.clicked.add(m);
    } else {
      this.keys.add(code);
      this.pressed.add(code);
    }
    this.lateUp.delete(code);
    this.downFrame.set(code, this.frame);
  }

  release(code) {
    if (this.downFrame.get(code) === this.frame) {
      this.lateUp.add(code);
      return;
    }
    this.lateUp.delete(code);
    if (code.startsWith('mouse')) this.buttons.delete(Number(code.slice(5)));
    else this.keys.delete(code);
  }

  tap(code) {
    this.press(code);
    this.release(code);
  }

  // Acción virtual pulsada o soltada (mando).
  vSet(action, on) {
    if (on && !this.vHeld.has(action)) {
      this.vHeld.add(action);
      this.vHit.add(action);
    } else if (!on && this.vHeld.delete(action)) this.vUp.add(action);
  }

  // ------------------------------------------------------------ CÓDIGOS
  down(code) {
    if (!code) return false;
    if (code.startsWith('Mouse') || code.startsWith('mouse')) return this.buttons.has(Number(code.slice(5)));
    return this.keys.has(code);
  }
  wasPressed(code) {
    if (!code) return false;
    if (code.startsWith('Mouse') || code.startsWith('mouse')) return this.clicked.has(Number(code.slice(5)));
    return this.pressed.has(code);
  }
  wasReleased(code) {
    return !!code && this.released.has(code);
  }
  mouseDown(b) {
    return this.buttons.has(b);
  }
  mouseClicked(b) {
    return this.clicked.has(b);
  }

  // ------------------------------------------------------------ ACCIONES
  // Los controles táctiles pulsan siempre las teclas por defecto, así que en
  // táctil también se aceptan aunque se hayan reasignado.
  held(action) {
    if (this.vHeld.has(action)) return true;
    const k = this.binds[action];
    if (k && (this.down(k[0]) || this.down(k[1]))) return true;
    const d = this.touch && DEFAULTS[action];
    return !!d && (this.down(d[0]) || this.down(d[1]));
  }
  hit(action) {
    if (this.vHit.has(action)) return true;
    const k = this.binds[action];
    if (k && (this.wasPressed(k[0]) || this.wasPressed(k[1]))) return true;
    const d = this.touch && DEFAULTS[action];
    return !!d && (this.wasPressed(d[0]) || this.wasPressed(d[1]));
  }
  up(action) {
    if (this.vUp.has(action)) return true;
    const k = this.binds[action];
    return !!k && (this.wasReleased(k[0]) || this.wasReleased(k[1]));
  }

  endFrame() {
    this.vHit.clear();
    this.vUp.clear();
    this.pressed.clear();
    this.released.clear();
    this.clicked.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
    this.frame++;
    if (this.lateUp.size) {
      for (const code of this.lateUp) {
        if (code.startsWith('mouse')) this.buttons.delete(Number(code.slice(5)));
        else this.keys.delete(code);
      }
      this.lateUp.clear();
    }
  }
}
