// Genera jugar.html: el juego entero (JS + CSS) en un solo archivo que se
// abre con doble clic, sin servidor ni npm. Se ejecuta tras `vite build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/, (_, file) => {
  const js = readFileSync(join(dist, file), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  return `<script type="module">\n${js}\n</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/, (_, file) => {
  // Las fuentes van dentro del CSS (base64) para que funcione sin internet
  const css = readFileSync(join(dist, file), 'utf8').replace(/url\((?:\.\/)?([^)'"]+\.woff2)\)/g, (m, font) => {
    const data = readFileSync(join(dist, 'assets', font.replace(/^.*\//, ''))).toString('base64');
    return `url(data:font/woff2;base64,${data})`;
  });
  return `<style>\n${css}\n</style>`;
});
// Manifest e iconos de la web instalable: con doble clic no hacen falta
html = html.replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, '');
if (/src="\.\/assets|href="\.\/assets/.test(html)) {
  console.error('No se pudieron incrustar todos los recursos en jugar.html');
  process.exit(1);
}
writeFileSync(join(root, 'jugar.html'), html);
console.log(`jugar.html generado (${(html.length / 1024).toFixed(0)} KB)`);
