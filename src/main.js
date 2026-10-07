import { Game } from './game/game.js';
import { setupPlatform } from './platform.js';
import { BootLoader, Intro, screenBackground } from './ui/loading.js';

const loadingEl = document.getElementById('loading');
// Pantalla de carga elegida en la taquilla
try {
  const screen = JSON.parse(localStorage.getItem('islaRoyale.settings.v1') || '{}').outfit?.screen;
  if (screen) loadingEl.style.background = screenBackground(screen);
} catch {
  /* sin ajustes guardados */
}
const loader = new BootLoader(loadingEl);

const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  // Deja que se pinte la pantalla de carga antes de generar la isla.
  await frame();
  loader.progress('Preparando los gráficos…', 0.005);
  await frame();
  const game = new Game(document.getElementById('app'));
  await game.init((text, f) => loader.progress(text, f));
  loader.progress('Compilando sombreados…', 0.95);
  await frame();
  game.warmShaders();
  setupPlatform(game);
  // Recarga para cambiar de isla (creativo ⇄ normal): empezar la partida elegida
  const q = new URLSearchParams(location.search);
  const auto = q.get('auto');
  const intro = !auto && game.settings.intro !== false && !q.has('sinintro');
  if (intro) new Intro(game, () => game.menu.showMain(null, true));
  await loader.hide();
  if (auto) {
    q.delete('auto');
    history.replaceState(null, '', `${location.pathname}${q.toString() ? '?' + q : ''}`);
    game.menu.showMain();
    game.startMatch(auto);
  } else if (!intro) game.menu.showMain();
}

boot().catch((err) => {
  console.error(err);
  loader.error('Error al iniciar: ' + err.message);
});
