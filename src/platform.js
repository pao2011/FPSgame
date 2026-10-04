// Integración con la plataforma: app Android (Capacitor) y web instalable (PWA).
import { App } from '@capacitor/app';
import { isNativeApp } from './ui/touch.js';

export function setupPlatform(game) {
  if (isNativeApp()) setupAndroid(game);
  else registerServiceWorker();
}

// Botón «Atrás» de Android: cierra el mapa, pausa o vuelve al menú; en el
// menú principal sale de la app.
function setupAndroid(game) {
  document.body.classList.add('native');
  App.addListener('backButton', () => {
    const g = game;
    if (g.menu.online.chatOpen) return g.menu.online.closeChat();
    if (g.state === 'playing') {
      if (g.hud.mapOpen) return g.hud.toggleMap(false);
      if (g.spectating) return g.quitToMenu();
      if (g.paused) return g.resume();
      return g.input.unlock(); // pausa
    }
    if (g.state === 'won' || g.state === 'dead') return g.quitToMenu();
    if (g.menu.panel !== 'play') return g.menu.show('play');
    App.exitApp();
  }).catch(() => {});
  // Al volver a la app se reanuda el sonido
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) game.audio.ctx?.resume?.();
    else game.audio.ctx?.suspend?.();
  }).catch(() => {});
}

// Web instalable: el service worker guarda el juego para abrirlo sin conexión.
function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
