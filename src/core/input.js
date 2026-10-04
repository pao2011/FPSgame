// Teclado + ratón con soporte de pointer lock y acciones reasignables.
import { defaultBinds } from './binds.js';

const PREVENT = new Set(['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'F1', 'F2', 'F3', 'F4']);

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
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (this.capture) {
        e.preventDefault();
        this.capture('Mouse' + e.button);
        return;
      }
      if (!this.locked) return;
      if (e.button === 1) e.preventDefault();
      this.buttons.add(e.button);
      this.clicked.add(e.button);
    });
    addEventListener('mouseup', (e) => {
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
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.keys.clear();
        this.buttons.clear();
      }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    const r = this.canvas.requestPointerLock?.();
    if (r && r.catch) r.catch(() => {});
  }

  // ------------------------------------------------------------ CÓDIGOS
  down(code) {
    if (!code) return false;
    if (code.startsWith('Mouse')) return this.buttons.has(Number(code.slice(5)));
    return this.keys.has(code);
  }
  wasPressed(code) {
    if (!code) return false;
    if (code.startsWith('Mouse')) return this.clicked.has(Number(code.slice(5)));
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
  held(action) {
    const k = this.binds[action];
    return !!k && (this.down(k[0]) || this.down(k[1]));
  }
  hit(action) {
    const k = this.binds[action];
    return !!k && (this.wasPressed(k[0]) || this.wasPressed(k[1]));
  }
  up(action) {
    const k = this.binds[action];
    return !!k && (this.wasReleased(k[0]) || this.wasReleased(k[1]));
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.clicked.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
