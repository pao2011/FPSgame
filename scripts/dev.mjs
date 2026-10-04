// `npm run dev`: arranca a la vez el servidor online y el juego (Vite).
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const kids = [
  spawn(process.execPath, [join(root, 'server', 'index.js')], { stdio: 'inherit', cwd: root }),
  spawn(process.execPath, [vite, ...(process.argv.includes('--no-open') ? [] : ['--open'])], { stdio: 'inherit', cwd: root }),
];
const stop = () => {
  for (const k of kids) k.kill();
  process.exit(0);
};
for (const k of kids) k.on('exit', (code) => code && stop());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
