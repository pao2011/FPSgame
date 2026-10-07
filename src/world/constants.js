// Mapa más compacto (antes 1600 m): zonas más juntas y más acción.
export const MAP_SIZE = 1280;
export const HALF = MAP_SIZE / 2;
export const WATER_LEVEL = 0;
export const GRAVITY = 24;
export const BUS_ALTITUDE = 250;
export const ISLAND_RADIUS = 592;

// Mapa único: la isla es SIEMPRE la misma (misma semilla en todas las
// partidas, en local y online). Cambiarla cambia el mapa para todos.
export const MAP_SEED = 20261007;
export const MAP_NAME = 'Isla Royale';

// Isla de inicio: sala de espera fuera del mapa (no sale en el minimapa,
// pero se ve desde la costa de la isla principal).
export const LOBBY = { x: 980, z: -260, radius: 62, height: 4.5 };
