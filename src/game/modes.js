// Modos de juego y ajustes del jugador (guardados en localStorage).

// online: disponible en partidas online. maxPlayers: plazas por partida
// (jugadores reales + bots de relleno). Este archivo también lo usa el
// servidor (server/), así que no debe depender del navegador al importarse.
export const MODES = {
  solo: {
    id: 'solo', name: 'Solitario', icon: '👤', teamSize: 1, build: true, online: true, maxPlayers: 24,
    desc: 'Todos contra todos. Salta del autobús, equípate y sé el último en pie.',
  },
  duos: {
    id: 'duos', name: 'Dúos', icon: '👥', teamSize: 2, build: true, online: true, maxPlayers: 24,
    desc: 'Equipos de 2. Juega con un amigo (o con un bot) y reanimaos cuando os derriben.',
  },
  trios: {
    id: 'trios', name: 'Tríos', icon: '🔺', teamSize: 3, build: true, online: true, maxPlayers: 24,
    desc: 'Equipos de 3. Coordinaos para cubriros, saquear y rotar juntos.',
  },
  squads: {
    id: 'squads', name: 'Escuadras', icon: '🛡️', teamSize: 4, build: true, online: true, maxPlayers: 24,
    desc: 'Equipos de 4 contra otras escuadras. El trabajo en equipo lo es todo.',
  },
  duel: {
    id: 'duel', name: '1v1 Práctica', icon: '🤺', teamSize: 1, build: true, online: true, maxPlayers: 2,
    respawn: true, scoreLimit: 5, infinite: true, arena: true, loadout: true, noBus: true, noBotFill: true,
    desc: 'Duelo uno contra uno en una arena pequeña: equipo completo, materiales infinitos y reaparición. Gana quien llegue a 5.',
  },
  rumble: {
    id: 'rumble', name: 'Duelo por equipos', icon: '⚔️', teams: 2, build: true, respawn: true, scoreLimit: 50,
    online: true, maxPlayers: 16, onlineScoreLimit: 30, noBus: true, loadout: true,
    desc: 'Dos equipos grandes con reaparición. El primero en llegar al límite de eliminaciones gana.',
  },
  zerobuild: {
    id: 'zerobuild', name: 'Construcción cero', icon: '🚫', teamSize: 1, build: false, online: true, maxPlayers: 24,
    desc: 'Solitario sin construir: sólo movimiento, coberturas del mapa y puntería.',
  },
  practice: {
    id: 'practice', name: 'Práctica libre', icon: '🎯', teamSize: 1, build: true, noBots: true, infinite: true,
    desc: 'La isla para ti solo, con materiales infinitos y dianas para entrenar.',
  },
};

// Tamaño máximo de grupo para entrar en un modo online.
export function partyLimit(mode) {
  if (mode.id === 'duel') return 2;
  if (mode.teams) return 4;
  return mode.teamSize || 1;
}

export const DIFFICULTIES = {
  facil: { name: 'Fácil' },
  normal: { name: 'Normal' },
  dificil: { name: 'Difícil' },
  experto: { name: 'Experto' },
};

const KEY = 'islaRoyale.settings.v1';

export const DEFAULT_SETTINGS = {
  mode: 'solo',
  difficulty: 'normal',
  players: 30,
  sensitivity: 1,
  fov: 80,
  volume: 70,
  invertY: false,
  showFps: false,
  quality: 'normal',
  server: '',
  online: { mode: 'duos', bots: true, difficulty: 'normal' },
  // Móvil / táctil
  touchControls: 'auto', // auto | on | off
  touchSens: 1,
  touchSize: 1,
  touchOpacity: 0.85,
  touchFullscreen: true,
  vibration: true,
  resScale: 70, // % de resolución en calidad «móvil»
  autoRes: true, // resolución dinámica en calidad «móvil»
  fpsCap: 0, // 0 = sin límite · 30 = ahorro de batería
};

// Primera vez en un móvil o tableta: ajustes pensados para rendimiento.
function deviceDefaults() {
  try {
    const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    if (touch && Math.min(screen.width, screen.height) < 900) return { quality: 'movil', players: 20, fov: 85 };
  } catch {
    /* fuera del navegador */
  }
  return {};
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      s.online = { ...DEFAULT_SETTINGS.online, ...s.online };
      return s;
    }
  } catch {
    /* almacenamiento no disponible */
  }
  return { ...DEFAULT_SETTINGS, ...deviceDefaults(), online: { ...DEFAULT_SETTINGS.online } };
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento no disponible */
  }
}

export const TEAM_COLORS = ['#3fa9ff', '#ff5a5a', '#5fe05a', '#ffd23f', '#c25bff', '#ff9a3c', '#3fe0d0', '#ff6ec7', '#a0a0ff', '#c0ff6e', '#ffb0a0', '#80c0a0', '#e0e080', '#b0b0b0', '#ffa0ff', '#a0ffd0'];
