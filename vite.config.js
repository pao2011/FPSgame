import { defineConfig } from 'vite';

// En desarrollo, /ws se redirige al servidor online (server/index.js, puerto 8080).
const proxy = { '/ws': { target: 'ws://localhost:8080', ws: true }, '/estado': 'http://localhost:8080' };

export default defineConfig({
  // Rutas relativas: el build funciona desde cualquier carpeta o subdirectorio.
  base: './',
  server: { host: true, proxy },
  preview: { host: true, proxy },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
