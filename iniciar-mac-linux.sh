#!/usr/bin/env bash
# Lanzador para macOS y Linux: instala dependencias (la primera vez) y abre el juego.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] No se encontró Node.js."
  echo "Instala la versión LTS desde https://nodejs.org y vuelve a ejecutar este script."
  echo "Mientras tanto puedes jugar abriendo jugar.html en el navegador."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando dependencias (solo la primera vez)..."
  if ! npm install; then
    echo "[ERROR] npm install ha fallado. Mira la sección 'Problemas frecuentes' del README."
    exit 1
  fi
fi

echo "Iniciando el juego en http://localhost:5173 (Ctrl+C para detenerlo)"
npm run dev
