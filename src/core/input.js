// Teclado + ratón con soporte de pointer lock. En pantallas táctiles los
// controles en pantalla (src/ui/touch.js) escriben en este mismo objeto, así
// que el resto del juego no distingue entre PC y móvil.
const PREVENT = new Set(['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.buttons = new Set();
    this.clicked = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.onLockChange = null;
    // Táctil: giro de cámara (en píxeles de pantalla) y joystick analógico.
    this.touch = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.axis = { x: 0, y: 0, active: false };
    // Pulsaciones táctiles más cortas que un fotograma: se sueltan al acabar
    // el fotograma siguiente para que el juego llegue a verlas.
    this.frame = 0;
    this.downFrame = new Map();
    this.lateUp = new Set();

    addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (PREVENT.has(e.code) && this.locked) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => {
      if (!this.locked || this.touch) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked || this.touch) return;
      this.buttons.add(e.button);
      this.clicked.add(e.button);
    });
    addEventListener('mouseup', (e) => {
      if (!this.touch) this.buttons.delete(e.button);
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

  down(code) {
    return this.keys.has(code);
  }
  wasPressed(code) {
    return this.pressed.has(code);
  }
  mouseDown(b) {
    return this.buttons.has(b);
  }
  mouseClicked(b) {
    return this.clicked.has(b);
  }

  endFrame() {
    this.pressed.clear();
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
