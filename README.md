# Isla Royale — Battle Royale 3D en el navegador

Juego de disparos en 3D estilo Fortnite hecho con **Three.js**. Todo es
procedural (no usa modelos ni texturas externas): la isla, los edificios, las
armas y los sonidos se generan con código.

**Incluye:** mapa con pueblos y ciudad, edificios con escaleras, cofres y
botín por rarezas, 5 armas con apuntado, **24 bots con IA**, **construcción**
(muros, suelos, rampas y techos), **recolección de materiales con el pico**,
**coches conducibles**, autobús de batalla, caída libre con planeador,
tormenta que se cierra y pantalla de **Victoria Magistral**.

---

## Índice

1. [Jugar sin instalar nada (la forma más fácil)](#1-jugar-sin-instalar-nada-la-forma-más-fácil)
2. [Jugar con Node.js y npm (paso a paso)](#2-jugar-con-nodejs-y-npm-paso-a-paso)
3. [Cómo se juega](#3-cómo-se-juega)
4. [Controles](#4-controles)
5. [Problemas frecuentes y soluciones](#5-problemas-frecuentes-y-soluciones)
6. [Opciones avanzadas](#6-opciones-avanzadas)
7. [Estructura del proyecto](#7-estructura-del-proyecto)

---

## 1. Jugar sin instalar nada (la forma más fácil)

El archivo **`jugar.html`** contiene el juego completo en un solo archivo. No
necesitas Node.js, npm ni terminal.

1. **Descarga el proyecto desde GitHub**
   1. Entra en <https://github.com/pao2011/FPSgame>.
   2. Arriba a la izquierda, en el selector de ramas (el botón con el icono de
      rama), comprueba que está seleccionada la rama
      **`claude/compassionate-edison-em662m`** (es la que tiene el juego).
   3. Pulsa el botón verde **`<> Code`** → **`Download ZIP`**.
2. **Descomprime el ZIP**
   - **Windows:** clic derecho sobre el ZIP → **Extraer todo…** → **Extraer**.
     ⚠️ No abras los archivos desde *dentro* del ZIP sin extraerlos.
   - **Mac:** doble clic sobre el ZIP.
   - **Linux:** `unzip FPSgame-*.zip`
3. Entra en la carpeta extraída y haz **doble clic en `jugar.html`**.
   Se abrirá en tu navegador (recomendado: **Chrome, Edge o Firefox**
   actualizados).
4. Pulsa **JUGAR** (con bots) o **PRÁCTICA** (sin bots). Haz clic dentro del
   juego para capturar el ratón.

> Si tu navegador abre el archivo con otra aplicación, haz clic derecho sobre
> `jugar.html` → **Abrir con** → Chrome / Edge / Firefox.

---

## 2. Jugar con Node.js y npm (paso a paso)

Esta opción es para quien quiera modificar el código (los cambios se ven al
instante en el navegador).

### Paso 1 — Instalar Node.js

1. Ve a <https://nodejs.org> y descarga la versión **LTS** (la recomendada).
   Sirve cualquier versión **18 o superior** (recomendado 22 o 24).
2. Instálala con las opciones por defecto (en Windows deja marcada la opción
   *Add to PATH*).
3. **Cierra y vuelve a abrir** cualquier terminal que tuvieras abierta (si no,
   no detectará Node).
4. Comprueba la instalación abriendo una terminal y escribiendo:

   ```bash
   node -v
   npm -v
   ```

   Deben aparecer números de versión (por ejemplo `v22.12.0` y `10.9.0`). Si
   `node -v` muestra una versión menor que 18, actualiza Node.

### Paso 2 — Descargar el proyecto

- **Con ZIP:** igual que en la sección 1 (rama
  `claude/compassionate-edison-em662m`, *Download ZIP* y **extraer**).
- **Con Git:**

  ```bash
  git clone -b claude/compassionate-edison-em662m https://github.com/pao2011/FPSgame.git
  ```

### Paso 3 — Abrir una terminal *dentro* de la carpeta del proyecto

Es muy importante estar en la carpeta que contiene `package.json`.

- **Windows:** abre la carpeta en el Explorador, haz clic en la barra de
  direcciones, escribe `cmd` y pulsa **Enter**. Se abrirá una terminal ya
  situada en esa carpeta.
- **Mac:** clic derecho sobre la carpeta → **Nuevo terminal en la carpeta**
  (o abre Terminal y escribe `cd ` seguido de arrastrar la carpeta a la
  ventana).
- **Linux:** clic derecho → **Abrir en una terminal**.

Comprueba que estás en el sitio correcto: el comando `dir` (Windows) o `ls`
(Mac/Linux) debe mostrar `package.json`, `index.html` y la carpeta `src`.

> Al descomprimir un ZIP a veces queda una carpeta dentro de otra
> (`FPSgame-claude-compassionate-edison-em662m/FPSgame-...`). Entra hasta la
> que tenga `package.json`.

### Paso 4 — Instalar las dependencias

```bash
npm install
```

Tarda unos segundos y crea la carpeta `node_modules`. Es normal que salgan
avisos `npm warn ...`: **no son errores**.

### Paso 5 — Arrancar el juego

```bash
npm run dev
```

Se abrirá el navegador en <http://localhost:5173>. Si no se abre solo, copia
esa dirección en el navegador. Para detener el juego pulsa **Ctrl + C** en la
terminal.

### Atajo: lanzadores automáticos

En vez de los pasos 3 a 5 puedes hacer doble clic en:

- **Windows:** `iniciar-windows.bat`
- **Mac/Linux:** `iniciar-mac-linux.sh` (o en terminal: `./iniciar-mac-linux.sh`)

Comprueban que Node esté instalado, ejecutan `npm install` la primera vez y
arrancan el juego.

### Otros comandos

| Comando | Para qué sirve |
| --- | --- |
| `npm run dev` | Modo desarrollo con recarga automática |
| `npm run build` | Genera la versión optimizada en `dist/` |
| `npm run preview` | Sirve la carpeta `dist/` para probarla |
| `npm run build:standalone` | Regenera `jugar.html` (un solo archivo) |

---

## 3. Cómo se juega

1. **Menú.** Elige **JUGAR** (battle royale contra 24 bots) o **PRÁCTICA**
   (isla para ti solo, con dianas para probar armas). Haz clic en la pantalla
   para que el juego capture el ratón; **Esc** lo libera y pausa.
2. **Autobús de batalla.** Empiezas en un autobús colgado de un globo que
   cruza la isla. Mueve el ratón para mirar y pulsa **M** para ver el mapa y la
   ruta. Cuando aparezca *PULSA ESPACIO PARA SALTAR*, salta sobre la zona que
   quieras (si no saltas, te expulsa al final del recorrido).
3. **Caída libre.** Dirige la caída con **WASD**. Mira hacia abajo y mantén
   **W** para caer en picado más rápido.
4. **Planeador.** Se abre solo a unos 90 m del suelo, o antes con
   **Espacio**. Sigue dirigiéndote con WASD hasta aterrizar.
5. **Botín.** Busca **cofres dorados** (brillan y suenan cuando estás cerca) y
   ábrelos con **E**. Recoge armas, munición y curas con **E**; la munición y
   los materiales se recogen solos al pasar por encima. El color indica la
   rareza: gris (común), verde, azul, morado y dorado (legendario).
6. **Inventario.** Tienes 6 huecos (**1–6** o la rueda del ratón). El 1 es
   siempre el pico. Si el inventario está lleno, al recoger algo cambias el
   objeto que tengas en la mano. **G** suelta el objeto actual.
7. **Disparar.** **Clic izquierdo** dispara y **clic derecho** apunta (más
   precisión y zoom; el francotirador usa mira telescópica). **R** recarga.
   Disparar en movimiento, saltando o seguido abre la mira (menos precisión);
   agacharse (**C**) la cierra. Los disparos a la cabeza hacen más daño.
8. **Curarse.** Selecciona vendas, botiquín o pociones y haz **clic
   izquierdo**; tarda unos segundos (te mueves más lento mientras tanto). El
   **escudo** (barra azul) absorbe el daño antes que la vida.
9. **Materiales.** Con el **pico** golpea **árboles** (madera), **rocas**
   (piedra) y **coches abandonados** (metal). Al romperlos ganas un extra.
   Los bots también sueltan materiales al ser eliminados.
10. **Construir.** Pulsa **Q** para entrar en modo construcción (la cámara pasa
    a tercera persona). Elige pieza con **1** muro, **2** suelo, **3** rampa,
    **4** techo, cambia de material con **clic derecho** y coloca con **clic
    izquierdo** (puedes mantenerlo pulsado). Cada pieza cuesta 10 de material.
    La silueta azul indica dónde se colocará (roja = no se puede: falta
    material, ya hay una pieza o te estorba). Mirando hacia arriba se coloca
    por encima de ti. Para **subir rápido**, corre hacia delante colocando
    rampas: se encadenan solas. Madera = rápida y débil, piedra = media,
    metal = muy resistente pero tarda más en endurecerse. Las piezas se
    rompen a tiros. **Q** vuelve al modo combate.
11. **Coches.** Acércate a un coche de color y pulsa **E** para conducir.
    **W/S** acelerar/frenar y marcha atrás, **A/D** girar, **Espacio** freno
    de mano, ratón para mirar alrededor. **E** para bajarte. Puedes atropellar
    a los bots.
12. **Tormenta.** El muro morado se cierra por fases (mira el aviso arriba a
    la derecha y el círculo blanco del mapa: es la próxima zona segura).
    Fuera de la zona pierdes vida cada segundo (el escudo no protege).
13. **Ganar.** Elimina a los bots y sobrevive a la tormenta. Si eres el último
    en pie: **¡VICTORIA MAGISTRAL!** El contador 👤 de arriba a la derecha
    muestra cuántos jugadores quedan; 💀 son tus eliminaciones.

**Consejos:** aterriza lejos de la ruta del bus si quieres tranquilidad;
construye un muro (**Q**, **1**, clic) cuando te disparen; el indicador rojo
alrededor de la mira señala de dónde vienen los disparos.

---

## 4. Controles

| Tecla | Acción |
| --- | --- |
| **W A S D** | Moverse |
| **Ratón** | Mirar |
| **Clic izquierdo** | Disparar · usar curas · golpear con el pico · colocar pieza |
| **Clic derecho** | Apuntar · (construyendo) cambiar material |
| **Espacio** | Saltar · salir del autobús · abrir planeador · freno de mano |
| **Shift** | Correr |
| **C** | Agacharse |
| **E** | Abrir cofre · recoger · subir/bajar del coche |
| **R** | Recargar |
| **1–6 / rueda** | Cambiar de objeto · (construyendo) 1–4 cambia de pieza |
| **Q** | Entrar/salir del modo construcción |
| **G** | Soltar el objeto actual |
| **V** | Cámara en 1ª / 3ª persona |
| **M** | Mapa de la isla |
| **Esc** | Liberar el ratón / pausa |

---

## 5. Problemas frecuentes y soluciones

| Lo que ves | Causa | Solución |
| --- | --- | --- |
| `'npm' no se reconoce como un comando interno o externo` · `npm: command not found` | Node.js no está instalado o la terminal se abrió antes de instalarlo | Instala Node LTS desde <https://nodejs.org>, **cierra y abre** la terminal y prueba `node -v` |
| `npm.ps1 no se puede cargar porque la ejecución de scripts está deshabilitada en este sistema` | PowerShell de Windows bloquea scripts | Usa **cmd** en vez de PowerShell (escribe `cmd` en la barra del Explorador), usa `iniciar-windows.bat`, o ejecuta una vez en PowerShell: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `npm ERR! enoent ... Could not read package.json` · `ENOENT: no such file or directory, open '...package.json'` | La terminal no está en la carpeta del proyecto | Entra en la carpeta que contiene `package.json` (ver Paso 3). Recuerda **extraer** el ZIP primero |
| `EBADENGINE Unsupported engine` · `SyntaxError: Unexpected token` al arrancar | Versión de Node demasiado antigua | Instala Node **18 o superior** (recomendado la LTS) |
| `Cannot find module @rollup/rollup-win32-x64-msvc` (o `-darwin-`, `-linux-`) | Instalación incompleta de los binarios nativos | Borra la carpeta `node_modules` (y `package-lock.json` si existe) y vuelve a ejecutar `npm install`. En Windows instala también el [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) |
| `EACCES: permission denied` (Mac/Linux) | Permisos de la carpeta o de npm | No uses `sudo` dentro del proyecto. Asegúrate de que la carpeta es tuya o instala Node con [nvm](https://github.com/nvm-sh/nvm) |
| `ETIMEDOUT` · `ECONNRESET` · `self signed certificate in certificate chain` | Sin internet, proxy o antivirus bloqueando npm | Revisa la conexión, desactiva temporalmente VPN/antivirus o ejecuta `npm config set registry https://registry.npmjs.org/` |
| `Port 5173 is in use, trying another one...` | Ya hay algo usando ese puerto | No es un error: usa la dirección que aparece en la terminal (por ejemplo `http://localhost:5174`) |
| `npm warn deprecated ...` · `found X vulnerabilities` | Avisos informativos | Puedes ignorarlos |
| Pantalla negra · *Error al iniciar* · mensaje sobre **WebGL** | El navegador no tiene aceleración gráfica | Activa *Usar aceleración de hardware* en la configuración del navegador, actualiza el navegador y los drivers de la tarjeta gráfica |
| El ratón no mueve la cámara | El juego no ha capturado el ratón | Haz clic dentro de la ventana del juego. **Esc** lo suelta |
| Va lento / a tirones | Ordenador o gráfica modestos | Pulsa *¿Va lento? Prueba la calidad baja* en el menú (o añade `?calidad=baja` a la dirección), cierra otras pestañas o juega con menos bots (`?bots=10`) |
| Al abrir `index.html` con doble clic la página sale en blanco | `index.html` es para el modo desarrollo y necesita `npm run dev` | Para doble clic usa **`jugar.html`** |

Si te sale otro error, copia el mensaje completo de la terminal: la primera
línea que empieza por `npm ERR!` o `Error` suele indicar la causa.

---

## 6. Opciones avanzadas

Se añaden al final de la dirección (por ejemplo
`http://localhost:5173/?seed=42&bots=10` o `jugar.html?calidad=baja`):

| Opción | Efecto |
| --- | --- |
| `?seed=12345` | Genera siempre la misma isla |
| `?bots=10` | Número de bots (0–60, por defecto 24) |
| `?calidad=baja` | Sin sombras ni antialiasing y menor resolución |

---

## 7. Estructura del proyecto

```
index.html            página del juego (modo desarrollo)
jugar.html            juego completo en un solo archivo (generado)
iniciar-windows.bat   lanzador para Windows
iniciar-mac-linux.sh  lanzador para Mac/Linux
scripts/standalone.mjs  genera jugar.html
src/
  main.js             punto de entrada
  style.css           estilos del HUD y menús
  core/               números aleatorios + ruido, teclado/ratón, sonido
  world/              terreno, colisiones, edificios, naturaleza, cielo, isla
  game/
    game.js           bucle principal, cámara, partida y victoria
    character.js      física y modelo compartidos por jugador y bots
    player.js         jugador (controles, inventario, materiales)
    bots.js           IA de los bots
    combat.js         armas, apuntado, retroceso, recarga, curas y pico
    build.js          sistema de construcción
    harvest.js        árboles, rocas y coches que dan materiales
    vehicles.js       coches conducibles
    loot.js           objetos en el suelo, cofres y cajas de munición
    items.js          definición de armas, curas, materiales y botín
    bus.js storm.js effects.js dummies.js models.js
  ui/                 HUD, minimapa y mapa
```

Tecnologías: [Three.js](https://threejs.org) para el 3D y
[Vite](https://vitejs.dev) para el servidor de desarrollo y el build.
