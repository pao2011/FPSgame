// Acciones reasignables (Opciones → Controles). Cada acción admite dos
// teclas: códigos de teclado (KeyW, Space…) o del ratón (Mouse0 = izquierdo,
// Mouse1 = rueda/central, Mouse2 = derecho, Mouse3/Mouse4 = laterales).

export const ACTIONS = [
  { group: 'Movimiento', id: 'forward', name: 'Avanzar', keys: ['KeyW', 'ArrowUp'] },
  { group: 'Movimiento', id: 'back', name: 'Retroceder', keys: ['KeyS', 'ArrowDown'] },
  { group: 'Movimiento', id: 'left', name: 'Izquierda', keys: ['KeyA', 'ArrowLeft'] },
  { group: 'Movimiento', id: 'right', name: 'Derecha', keys: ['KeyD', 'ArrowRight'] },
  { group: 'Movimiento', id: 'jump', name: 'Saltar · planeador · volar (creativo)', keys: ['Space', ''] },
  { group: 'Movimiento', id: 'sprint', name: 'Correr', keys: ['ShiftLeft', ''] },
  { group: 'Movimiento', id: 'crouch', name: 'Agacharse · bajar volando', keys: ['KeyC', 'ControlLeft'] },
  { group: 'Movimiento', id: 'autorun', name: 'Correr automáticamente', keys: ['Equal', ''] },

  { group: 'Combate', id: 'fire', name: 'Disparar · usar · colocar', keys: ['Mouse0', ''] },
  { group: 'Combate', id: 'ads', name: 'Apuntar · (construyendo) cambiar material', keys: ['Mouse2', ''] },
  { group: 'Combate', id: 'reload', name: 'Recargar · girar pieza', keys: ['KeyR', ''] },
  { group: 'Combate', id: 'interact', name: 'Interactuar · abrir · recoger', keys: ['KeyE', ''] },
  { group: 'Combate', id: 'drop', name: 'Soltar objeto', keys: ['KeyG', ''] },
  { group: 'Combate', id: 'slot1', name: 'Pico / hueco 1', keys: ['Digit1', ''] },
  { group: 'Combate', id: 'slot2', name: 'Hueco 2', keys: ['Digit2', ''] },
  { group: 'Combate', id: 'slot3', name: 'Hueco 3', keys: ['Digit3', ''] },
  { group: 'Combate', id: 'slot4', name: 'Hueco 4', keys: ['Digit4', ''] },
  { group: 'Combate', id: 'slot5', name: 'Hueco 5', keys: ['Digit5', ''] },
  { group: 'Combate', id: 'slot6', name: 'Hueco 6', keys: ['Digit6', ''] },
  { group: 'Combate', id: 'lastWeapon', name: 'Arma anterior', keys: ['KeyX', ''] },
  { group: 'Combate', id: 'quickHeal', name: 'Curación rápida', keys: ['KeyH', ''] },

  { group: 'Construcción', id: 'build', name: 'Modo construcción', keys: ['KeyQ', ''] },
  { group: 'Construcción', id: 'pieceWall', name: 'Muro (acceso directo)', keys: ['KeyZ', 'F1'] },
  { group: 'Construcción', id: 'pieceFloor', name: 'Suelo (acceso directo)', keys: ['F2', ''] },
  { group: 'Construcción', id: 'pieceRamp', name: 'Rampa (acceso directo)', keys: ['F3', ''] },
  { group: 'Construcción', id: 'pieceCone', name: 'Techo (acceso directo)', keys: ['F4', ''] },
  { group: 'Construcción', id: 'edit', name: 'Editar pieza · confirmar', keys: ['KeyF', ''] },
  { group: 'Construcción', id: 'editReset', name: 'Restablecer edición', keys: ['Mouse2', ''] },

  { group: 'Interfaz', id: 'map', name: 'Mapa', keys: ['KeyM', ''] },
  { group: 'Interfaz', id: 'emote', name: 'Gesto (el que lleves en la taquilla)', keys: ['KeyN', ''] },
  { group: 'Interfaz', id: 'inventory', name: 'Inventario (arrastrar y soltar)', keys: ['Tab', 'KeyI'] },
  { group: 'Interfaz', id: 'camera', name: 'Cámara 1ª / 3ª persona', keys: ['KeyV', ''] },
  { group: 'Interfaz', id: 'ping', name: 'Marcar ubicación', keys: ['Mouse1', 'KeyT'] },
  { group: 'Interfaz', id: 'catalog', name: 'Catálogo / panel creativo · agradecer al conductor', keys: ['KeyB', ''] },
];

export function defaultBinds() {
  const out = {};
  for (const a of ACTIONS) out[a.id] = a.keys.slice();
  return out;
}

// Completa unas teclas guardadas con las acciones que falten (versiones nuevas).
export function mergeBinds(saved) {
  const out = defaultBinds();
  if (saved && typeof saved === 'object') {
    for (const id in out) if (Array.isArray(saved[id])) out[id] = [saved[id][0] ?? '', saved[id][1] ?? ''];
  }
  return out;
}

const NAMES = {
  Space: 'Espacio', ShiftLeft: 'Shift', ShiftRight: 'Shift der.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl der.',
  AltLeft: 'Alt', AltRight: 'Alt der.', Tab: 'Tab', CapsLock: 'Bloq Mayús', Enter: 'Intro', Backspace: 'Retroceso',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Equal: '=', Minus: '-', Backquote: 'º',
  Mouse0: 'Clic izq.', Mouse1: 'Clic central', Mouse2: 'Clic der.', Mouse3: 'Ratón 4', Mouse4: 'Ratón 5',
  BracketLeft: '[', BracketRight: ']', Semicolon: 'Ñ', Quote: "'", Comma: ',', Period: '.', Slash: '-', IntlBackslash: '<',
};

export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
