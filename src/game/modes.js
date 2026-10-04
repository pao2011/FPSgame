// Modos de juego y ajustes del jugador (guardados en localStorage).

export const MODES = {
  solo: {
    id: 'solo', name: 'Solitario', icon: '👤', teamSize: 1, build: true,
    desc: 'Todos contra todos. Salta del autobús, equípate y sé el último en pie.',
  },
  duos: {
    id: 'duos', name: 'Dúos', icon: '👥', teamSize: 2, build: true,
    desc: 'Equipos de 2. Tu compañero bot te sigue, te cubre y te reanima si te derriban.',
  },
  squads: {
    id: 'squads', name: 'Escuadras', icon: '👨‍👩‍👧‍👦', teamSize: 4, build: true,
    desc: 'Equipos de 4. Coordínate con tus 3 compañeros bot contra otras escuadras.',
  },
  rumble: {
    id: 'rumble', name: 'Duelo por equipos', icon: '⚔️', teams: 2, build: true, respawn: true, scoreLimit: 50,
    desc: 'Dos equipos grandes con reaparición. El primero en llegar a 50 eliminaciones gana.',
  },
  zerobuild: {
    id: 'zerobuild', name: 'Construcción cero', icon: '🚫', teamSize: 1, build: false,
    desc: 'Solitario sin construir: sólo movimiento, coberturas del mapa y puntería.',
  },
  practice: {
    id: 'practice', name: 'Práctica', icon: '🎯', teamSize: 1, build: true, noBots: true, infinite: true,
    desc: 'La isla para ti solo, con materiales infinitos y dianas para entrenar.',
  },
};

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
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* almacenamiento no disponible */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento no disponible */
  }
}

export const TEAM_COLORS = ['#3fa9ff', '#ff5a5a', '#5fe05a', '#ffd23f', '#c25bff', '#ff9a3c', '#3fe0d0', '#ff6ec7', '#a0a0ff', '#c0ff6e', '#ffb0a0', '#80c0a0', '#e0e080', '#b0b0b0', '#ffa0ff', '#a0ffd0'];
