// Genera todos los PNG del icono, la pantalla de carga, la web instalable y
// la ficha de la tienda a partir de dibujos.mjs.
//   npm i -D playwright && npx playwright install chromium
//   node movil/arte/generar-arte.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconSVG, foregroundSVG, backgroundSVG, splashSVG, featureSVG } from './dibujos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const chromium = pw.chromium || pw.default.chromium;
const font = (f) => `data:font/woff2;base64,${readFileSync(join(root, 'src', 'fonts', f)).toString('base64')}`;
const FONTS = `<style>
  @font-face { font-family: 'Lilita One'; src: url(${font('lilita-one-latin.woff2')}); }
  @font-face { font-family: 'Inter'; font-weight: 100 900; src: url(${font('inter-latin.woff2')}); }
  html, body { margin: 0; background: transparent; } svg { display: block; }
</style>`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(svgText, w, h, out, opts = {}) {
  mkdirSync(dirname(out), { recursive: true });
  const sized = svgText.replace(/<svg ([^>]*?)width="\d+" height="\d+"/, `<svg $1width="${w}" height="${h}"`);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head>${FONTS}</head><body>${sized}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: !opts.opaque, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('·', out.replace(root + '/', ''), `${w}x${h}`);
}

const res = join(root, 'android', 'app', 'src', 'main', 'res');
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  const s = Math.round(48 * k), a = Math.round(108 * k);
  await render(iconSVG({ shape: 'rounded' }), s, s, join(res, `mipmap-${d}`, 'ic_launcher.png'));
  await render(iconSVG({ shape: 'circle' }), s, s, join(res, `mipmap-${d}`, 'ic_launcher_round.png'));
  await render(foregroundSVG(), a, a, join(res, `mipmap-${d}`, 'ic_launcher_foreground.png'));
  await render(backgroundSVG(), a, a, join(res, `mipmap-${d}`, 'ic_launcher_background.png'), { opaque: true });
}
// Pantallas de carga (mismos tamaños que la plantilla de Capacitor)
const SPLASH = {
  'drawable': [480, 320], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280], 'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
};
for (const [dir, [w, h]] of Object.entries(SPLASH)) await render(splashSVG(w, h), w, h, join(res, dir, 'splash.png'), { opaque: true });

// Web instalable (PWA)
const pub = join(root, 'public', 'icons');
await render(iconSVG({ shape: 'rounded' }), 192, 192, join(pub, 'icon-192.png'));
await render(iconSVG({ shape: 'rounded' }), 512, 512, join(pub, 'icon-512.png'));
await render(iconSVG(), 512, 512, join(pub, 'icon-maskable-512.png'), { opaque: true });
await render(iconSVG(), 180, 180, join(pub, 'apple-touch-icon.png'), { opaque: true });
await render(iconSVG({ shape: 'rounded' }), 64, 64, join(pub, 'favicon-64.png'));

// Ficha de Google Play
const store = join(root, 'movil', 'tienda');
await render(iconSVG(), 512, 512, join(store, 'icono-512.png'), { opaque: true });
await render(featureSVG(), 1024, 500, join(store, 'grafico-destacado-1024x500.png'), { opaque: true });
await render(splashSVG(1920, 1080), 1920, 1080, join(store, 'pantalla-carga.png'), { opaque: true });

await browser.close();
