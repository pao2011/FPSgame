// Servidor online de Isla Royale.
//   node server/index.js      (o `npm start` tras `npm run build`)
// Sirve el juego compilado (carpeta dist/) y el WebSocket en /ws.
// Variables de entorno: PORT (8080), DATA_DIR (server/data).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import { DB } from './db.js';
import { Lobby } from './lobby.js';
import { MAP_SEED } from '../src/world/constants.js';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const db = new DB();
// Mapa único: la isla es siempre la misma (la misma semilla que el juego).
const seed = MAP_SEED;
const lobby = new Lobby(db, seed);

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/estado') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, online: lobby.online.size, partidas: lobby.matches.size, isla: seed }));
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  const file = join(DIST, path);
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('no es un archivo');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    if (path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Isla Royale</title>
        <body style="font-family:sans-serif;background:#0b1630;color:#fff;padding:40px">
        <h1>Servidor de Isla Royale en marcha ✅</h1>
        <p>No se ha encontrado la carpeta <code>dist/</code>. Ejecuta <code>npm run build</code> para servir el juego desde aquí,
        o usa <code>npm run dev</code> durante el desarrollo.</p>
        <p>WebSocket: <code>ws://${req.headers.host}/ws</code></p></body>`);
    } else {
      res.writeHead(404);
      res.end('No encontrado');
    }
  }
}

const server = http.createServer((req, res) => {
  serveStatic(req, res).catch(() => {
    res.writeHead(500);
    res.end();
  });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws) => lobby.connect(ws));
setInterval(() => lobby.heartbeat(), 15000);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  [ERROR] El puerto ${PORT} ya está en uso: probablemente el servidor ya está abierto en otra ventana.`);
    console.error('  Ciérralo o arranca este en otro puerto, por ejemplo:  PORT=8081 npm start\n');
  } else console.error(err);
  process.exit(1);
});
wss.on('error', () => {});

server.listen(PORT, () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  Servidor online de Isla Royale en el puerto ${PORT} (isla #${seed})`);
  console.log(`  · Este ordenador:  http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  · Red local:       http://${ip}:${PORT}`);
  console.log('');
});

function shutdown() {
  db.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
