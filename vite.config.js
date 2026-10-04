import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el build funciona desde cualquier carpeta o subdirectorio.
  base: './',
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
