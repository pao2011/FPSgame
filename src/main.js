import { Game } from './game/game.js';

// Deja que se pinte la pantalla de carga antes de generar la isla.
requestAnimationFrame(() =>
  setTimeout(() => {
    try {
      new Game(document.getElementById('app'));
      document.getElementById('loading').style.display = 'none';
      document.getElementById('menu').style.display = 'flex';
    } catch (err) {
      console.error(err);
      document.querySelector('#loading .loading-text').textContent = 'Error al iniciar: ' + err.message;
    }
  }, 30),
);
