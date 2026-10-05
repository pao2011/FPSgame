import { Game } from './game/game.js';
import { setupPlatform } from './platform.js';
import { randomTip, screenBg } from './ui/tips.js';

const tipEl = document.querySelector('#loading .loading-tip');
if (tipEl) tipEl.textContent = '💡 ' + randomTip();
// Pantalla de carga elegida en la taquilla
try {
  const screen = JSON.parse(localStorage.getItem('islaRoyale.settings.v1') || '{}').outfit?.screen;
  if (screen) document.getElementById('loading').style.background = screenBg(screen);
} catch {
  /* sin ajustes guardados */
}

// Deja que se pinte la pantalla de carga antes de generar la isla.
requestAnimationFrame(() =>
  setTimeout(() => {
    try {
      const game = new Game(document.getElementById('app'));
      document.getElementById('loading').style.display = 'none';
      game.menu.showMain();
      setupPlatform(game);
      // Recarga para cambiar de isla (creativo ⇄ normal): empezar la partida elegida
      const q = new URLSearchParams(location.search);
      const auto = q.get('auto');
      if (auto) {
        q.delete('auto');
        history.replaceState(null, '', `${location.pathname}${q.toString() ? '?' + q : ''}`);
        game.startMatch(auto);
      }
    } catch (err) {
      console.error(err);
      document.querySelector('#loading .loading-text').textContent = 'Error al iniciar: ' + err.message;
    }
  }, 30),
);
