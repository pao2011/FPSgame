import { Game } from './game/game.js';
import { setupPlatform } from './platform.js';

// Deja que se pinte la pantalla de carga antes de generar la isla.
requestAnimationFrame(() =>
  setTimeout(() => {
    try {
      const game = new Game(document.getElementById('app'));
      document.getElementById('loading').style.display = 'none';
      game.menu.showMain();
      setupPlatform(game);
    } catch (err) {
      console.error(err);
      document.querySelector('#loading .loading-text').textContent = 'Error al iniciar: ' + err.message;
    }
  }, 30),
);
