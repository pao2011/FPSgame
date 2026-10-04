@echo off
title Isla Royale
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] No se encontro Node.js.
  echo Instala la version LTS desde https://nodejs.org y vuelve a abrir este archivo.
  echo Mientras tanto puedes jugar abriendo jugar.html con doble clic.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias, solo la primera vez. Puede tardar un minuto...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install ha fallado. Mira la seccion "Problemas frecuentes" del README.
    echo Mientras tanto puedes jugar abriendo jugar.html con doble clic.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando el juego. Se abrira el navegador en http://localhost:5173
echo Para detenerlo cierra esta ventana o pulsa Ctrl+C.
echo.
call npm run dev
pause
