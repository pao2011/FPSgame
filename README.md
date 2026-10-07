# Isla Royale — Battle Royale 3D en el navegador

Juego de disparos en 3D estilo Fortnite hecho con **Three.js**. Todo es
procedural (no usa modelos ni texturas externas): la isla, los edificios, las
armas y los sonidos se generan con código.

**Isla más densa, montañas y tirolesas:** 🗺️ **mapa más compacto y lleno**
(la isla pasa de 740 a 592 m de radio y entre las zonas hay **puestos
avanzados**: cabañas, ruinas, torres de vigilancia, almacenes de contenedores,
campamentos y graneros, más **coberturas** por todo el campo: sacos terreros,
cajas y coches abandonados), ⛰️ **cordilleras de verdad** (crestas afiladas,
mesetas, barrancos y **cumbres nevadas**, con el gran lago en un valle), 🚡
**tirolesas** para cruzar la isla volando (E para engancharte, Espacio para
saltar, S para dar la vuelta; salen en el mapa como líneas amarillas), 🏃
**correr por defecto** (Shift para andar) con balanceo de cámara y 🛝
**deslizarse** (agáchate corriendo; cuesta abajo se gana velocidad). 🔫
**Balas mejoradas**: trazadoras más rápidas y visibles de lejos, **silbido**
cuando una bala te pasa cerca, impactos según el material (tierra, metal con
chispas, madera, piedra y **salpicaduras en el agua**) y destello azul/blanco
al acertar. Arreglado: los disparos de los bots ya no parecen venir **del
cielo** (sus «ojos» se iban subiendo al bajar cuestas) y sus trazadoras salen
del cañón del arma. Además, **pantalla de carga ilustrada con progreso real**,
pantalla de carga antes de cada partida y **animación de inicio** (vuelo sobre
la isla con el logo; se salta con cualquier tecla o en Opciones).

**Isla de la Bóveda:** 🏝️ un **gran lago en el centro con una isla** donde
espera el 💀 **Guardián de la Bóveda** con sus secuaces; al morir suelta una
💳 **tarjeta** que abre la 🔒 **bóveda** (cofres seguros y armas
legendarias). Además, 🌊 un **río que cruza toda la isla**, ⚓ **cuatro
puertos** en la costa, 🗺️ **nombres de las zonas en el minimapa** y ⛰️
**terreno HD** con gráficos en *Alto* (doble resolución, relieve fino y
roca con textura).

**Mapa renovado:** 🛣️ **carreteras limpias** (el relieve ya no atraviesa el
asfalto: firme con pendiente máxima del 12 %, taludes y desfiladeros), 🏞️
**ríos y lagos** (se nada y se navega en ellos) con **puentes**, 🕯️ **cuevas
y trincheras** bajo tierra con iluminación (antorchas, faroles y cristales) y
cofres, y ⚔️ **más densidad**: más zonas y más juntas, bots que acuden a los
tiroteos y primeras fases de la tormenta más cortas.

**Novedades 0.5:** 🎨 **gráficos renovados** (materiales PBR con
iluminación de entorno, oclusión ambiental, personajes articulados, fachadas y
asfalto con textura, césped animado, armas detalladas, trazadoras, casquillos
y construcciones con relieve), 🌦️ **clima y ciclo de día**, 🌀 **tormenta
con zona móvil**, 🎒 **inventario con arrastrar y soltar** (Tab), 👕 **taquilla
ampliada** (picos, planeadores, mochilas, estelas, gestos y pantallas de
carga), 📅 **desafíos diarios y semanales**, 💰 **PNJ con misiones,
comerciantes y un jefe**, 🚤 **quads, lanchas y gasolina**, 🚐 **furgonetas de
reaparición**, 🎬 **repeticiones, espectador y mapa de calor**, 🏆 **Arena** y
**modos temporales**, 🌐 **reconexión, anti-trampas y chat de voz** online,
♿ **accesibilidad** (daltonismo, sonidos visualizados, subtítulos), 🎮
**mando** con asistencia de apuntado, 🎵 **música dinámica y sonido 3D**, 🌍
**inglés y portugués**, puertas reales en las casas y **códigos para
compartir islas** del creativo. Detalles en [`ROADMAP.md`](ROADMAP.md).

**Novedades para móviles:** 🎯 **apuntar con el giroscopio**, 🔫 **disparo
automático** y **asistencia de apuntado táctil**, ➕ **botón de curación
rápida**, 👆 **doble toque para marcar**, 🗺️ **mapa táctil** (toca para marcar
destino, pellizca para hacer zoom), 🖐️ disposiciones **Garra** y **Botones
grandes**, **correr automáticamente**, 📳 vibración al acertar o eliminar, 🔋
**batería y hora** en pantalla y **ahorro automático con la batería baja**
(todo en *Opciones → Móvil y táctil*).

**Más FPS en PC y móvil:** 🚀 **resolución dinámica en todas las calidades**
(apunta a los 60, 90 o 120 Hz de tu pantalla y, si bajar la resolución no
ayuda, la deja como estaba para que no se vea borroso), las sombras se dibujan
**una sola vez por fotograma** (antes, en *Alta*, dos), **oclusión ambiental a
media resolución**, ruido de los sombreados **precalculado en una textura**,
luces de efectos compartidas (de 6 luces siempre encendidas a 1-3), **Normal y
Baja ligeras en móviles y tabletas** (sin posprocesado, sombras pequeñas a
30 Hz, antialiasing), calidad *Móvil* **más nítida** (85 % de resolución con
antialiasing en vez de 70 % sin él) y **aviso si el navegador no usa la
tarjeta gráfica**. En táctil, el botón de dejar de apuntar ya se ve con la
mira del francotirador.

**Optimización para móviles:** el mundo se dibuja por parcelas (sólo lo que
se ve y está cerca: ~8 veces menos triángulos en calidad *Móvil*), sombreados
ligeros para el cielo, el agua, el suelo y los edificios, lluvia calculada en
la tarjeta gráfica, bots que calculan rutas sin tirones, menos FPS en menús y
pausa, sonido 3D más barato y la nueva opción **Distancia de visión** (que en
*Móvil* se acorta sola si el juego va lento).

**En la 0.4:** 🗺️ **un solo mapa** (*Isla Royale*, siempre la misma
isla), 🧰 **cofres aleatorios** en cada partida, 🏝️ **Isla de Inicio** antes
del autobús, 🚌 **autobús de batalla detallado** (y puedes dar las gracias al
conductor), ✏️ **edición con piezas reales** (puerta que se abre, ventana,
arco, arco grande, media pared, valla…), ⚙️ **ajustes al estilo de Epic**
(construcción turbo, controles personalizados, sensibilidades…), 🎨 **modo
creativo** ampliado con catálogo de todas las armas y consumibles, bots,
prefabricados y guardado, 🔫 armas y consumibles nuevos, 🏰 **estructuras
nuevas** (castillo, molinos, mercadillos), 🎖️ **pase de batalla** (40
niveles), **Tienda**, **skins**, **accesorios**, **camuflajes**, 💣
**explosivos** (granadas, lapa, C4, humo, molotov, impulso) y muchas mejoras de
calidad de vida. El plan de próximas actualizaciones está en
[`ROADMAP.md`](ROADMAP.md).

**Anteriormente:** 📱 **versión para móviles** con controles táctiles, calidad
gráfica *Móvil* con resolución dinámica, juego cruzado **PC + móvil** y
**APK de Android** (se compila sola en GitHub; ver
[sección 9](#9-versión-para-móviles-android--apk)); 🌐 **modo online** con cuentas, **amigos**, **grupos**,
invitaciones, chat y emparejamiento para **1v1 Práctica, Solitario, Dúos,
Tríos, Escuadras, Duelo por equipos y Construcción cero** (con bots de relleno
opcionales), pantalla **Personaje** para elegir tu aspecto y un apartado
gráfico renovado: bloom, antialiasing, cielo con nubes, agua con olas,
reflejos y espuma en la orilla, terreno con más detalle y menús nuevos.

**Incluye:** menú principal con opciones, **9 modos de juego** (Solitario,
Dúos, Tríos, Escuadras, 1v1 Práctica, Duelo por equipos, Construcción cero,
Práctica libre y Creativo), **bots con
IA** (navegan por el mapa, saquean, construyen, se curan, se reaniman y
trabajan en equipo), una isla de 1,3 km con **carreteras y pueblos ordenados
por calles** y muchos tipos de estructuras (casas, tiendas, gasolineras,
iglesias, rascacielos, fábrica, puerto con muelle y grúa, base militar,
estadio, granjas, faro, antena de radio, depósitos de agua, búnkeres,
campamentos, ruinas, castillo, molinos, mercadillos…), cofres aleatorios y
botín por **7 rarezas** (de común a mítico y exótico), **18 armas** con
apuntado (rifles, fusil pesado, escopetas, minigun, revólver, cañón de mano,
rifle de caza, lanzacohetes, lanzagranadas, rifle de plasma, arco
explosivo…), curas (incluidos pez saltarín, Zumo Slurp y barril de poción),
**granadas, granadas lapa, C4, granadas de impulso, humo, molotov** y
plataforma de salto, construcción y edición, recolección de materiales con
el pico, coches conducibles, Isla de Inicio, autobús de batalla, planeador y
tormenta.

---

## Índice

1. [Jugar sin instalar nada (la forma más fácil)](#1-jugar-sin-instalar-nada-la-forma-más-fácil)
2. [Jugar con Node.js y npm (paso a paso)](#2-jugar-con-nodejs-y-npm-paso-a-paso)
3. [Cómo se juega](#3-cómo-se-juega)
4. [Controles](#4-controles)
5. [Problemas frecuentes y soluciones](#5-problemas-frecuentes-y-soluciones)
6. [Opciones avanzadas](#6-opciones-avanzadas)
7. [Estructura del proyecto](#7-estructura-del-proyecto)
8. [Jugar online con amigos](#8-jugar-online-con-amigos)
9. [Versión para móviles (Android / APK)](#9-versión-para-móviles-android--apk)

---

## 1. Jugar sin instalar nada (la forma más fácil)

El archivo **`jugar.html`** contiene el juego completo en un solo archivo. No
necesitas Node.js, npm ni terminal.

1. **Descarga el proyecto desde GitHub**
   1. Entra en <https://github.com/pao2011/FPSgame>.
   2. Arriba a la izquierda, en el selector de ramas (el botón con el icono de
      rama), comprueba que está seleccionada la rama
      **`claude/festive-babbage-xm10eq`** (es la que tiene el juego).
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
  `claude/festive-babbage-xm10eq`, *Download ZIP* y **extraer**).
- **Con Git:**

  ```bash
  git clone -b claude/festive-babbage-xm10eq https://github.com/pao2011/FPSgame.git
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
> (`FPSgame-claude-festive-babbage-xm10eq/FPSgame-...`). Entra hasta la
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
| `npm run dev` | Modo desarrollo: arranca el juego **y el servidor online** |
| `npm run dev:client` | Solo el juego (sin servidor online) |
| `npm start` | Servidor online que además sirve el juego compilado (`dist/`) |
| `npm run build` | Genera la versión optimizada en `dist/` |
| `npm run preview` | Sirve la carpeta `dist/` para probarla |
| `npm run build:standalone` | Regenera `jugar.html` (un solo archivo) |
| `npm run android:apk` | Genera la APK de Android (`IslaRoyale-debug.apk`); ver [sección 9](#9-versión-para-móviles-android--apk) |
| `npm run build:android` | Compila el juego y lo copia al proyecto Android |
| `npm run android:open` | Abre el proyecto Android en Android Studio |
| `npm run arte` | Regenera iconos, pantalla de carga e imágenes de la tienda |

---

## 3. Cómo se juega

1. **Menú principal.** A la izquierda tienes **Online** (ver la
   [sección 8](#8-jugar-online-con-amigos)), **Jugar con bots**, **Pase de
   batalla**, **Tienda**, **Personaje**, **Modos de juego**, **Opciones**,
   **Controles**, **Cómo jugar** y **Novedades**. En *Jugar con bots* eliges la
   dificultad de los bots (Fácil, Normal, Difícil, Experto) y el número de
   jugadores, y pulsas **¡A LA ISLA!**. El mapa es **siempre el mismo**
   (*Isla Royale*). Durante la partida, **Esc** abre la pausa (continuar,
   opciones o abandonar).

   | Modo | Descripción |
   | --- | --- |
   | **Solitario** | Todos contra todos; gana el último en pie |
   | **Dúos** | Equipos de 2 (tu compañero es un bot) |
   | **Tríos** | Equipos de 3 (tú + 2 bots) |
   | **Escuadras** | Equipos de 4 (tú + 3 bots) |
   | **1v1 Práctica** | Duelo contra un bot en una arena pequeña, con equipo completo, materiales infinitos y reaparición; gana el primero en llegar a 5 |
   | **Duelo por equipos** | 2 equipos grandes, reaparición; gana el primero en llegar a 50 eliminaciones |
   | **Construcción cero** | Solitario sin construir |
   | **Práctica libre** | La isla principal sin bots, materiales infinitos y dianas |
   | **Modo creativo** | Isla plana para ti: vuelo, catálogo de objetos y de edificios, bots y dianas a demanda, prefabricados, guardar construcciones… (ver abajo) |

2. **Isla de Inicio.** Antes de cada partida (Solitario, Dúos, Tríos,
   Escuadras y Construcción cero) apareces en la **Isla de Inicio**, una isla
   pequeña fuera del mapa que se ve desde la costa de la isla principal pero
   no sale en el minimapa. Mientras llegan los demás jugadores puedes correr,
   construir (materiales infinitos), coger las armas de las mesas y disparar a
   las dianas; aquí nadie recibe daño. Cuando están todos, empieza una
   **cuenta atrás de 10 segundos** y todos subís al autobús (lo de la Isla de
   Inicio se reinicia). En *Opciones → Juego* puedes saltártela en las
   partidas contra bots.
3. **Autobús de batalla.** El autobús (con su conductor, pasajeros, equipaje
   y un globo con quemador) cruza la isla. Mueve el ratón para mirar, pulsa
   **M** para ver el mapa y la ruta y **B** para **dar las gracias al
   conductor**. Cuando aparezca *PULSA ESPACIO PARA SALTAR*, salta sobre la
   zona que quieras (si no saltas, te expulsa al final del recorrido).
4. **Caída libre.** Dirige la caída con **WASD**. Mira hacia abajo y mantén
   **W** para caer en picado más rápido.
5. **Planeador.** Se abre solo a unos 90 m del suelo, o antes con
   **Espacio**. Sigue dirigiéndote con WASD hasta aterrizar.
6. **Botín.** Busca **cofres dorados** (brillan y suenan cuando estás cerca) y
   ábrelos con **E**. **Los cofres no están siempre en el mismo sitio**: cada
   cofre posible tiene una probabilidad de aparecer en cada partida. Recoge
   armas, munición y curas con **E**; la munición y los materiales se recogen
   solos al pasar por encima (y las armas y curas también, si tienes un hueco
   libre). El color indica la rareza: gris (común), verde (poco común), azul
   (raro), morado (épico), naranja (legendario), dorado (mítico) y turquesa
   (exótico). Las armas míticas y exóticas brillan; las exóticas (rifle de
   plasma y arco explosivo) solo aparecen con esa rareza.
7. **Inventario.** Tienes 6 huecos (**1–6** o la rueda del ratón). El 1 es
   siempre el pico. Si el inventario está lleno, al recoger algo cambias el
   objeto que tengas en la mano. **G** suelta el objeto actual. Las curas y
   granadas se colocan a la derecha. **X** vuelve al arma anterior y **H**
   usa la mejor cura.
8. **Disparar.** **Clic izquierdo** dispara y **clic derecho** apunta (más
   precisión y zoom; el francotirador usa mira telescópica). **R** recarga.
   Disparar en movimiento, saltando o seguido abre la mira (menos precisión);
   agacharse (**C**) la cierra. Los disparos a la cabeza hacen más daño.
9. **Armas especiales.** El **rifle de ráfagas** dispara 3 balas por clic; la
   **minigun** necesita un momento para girar los cañones; el **arco
   explosivo** se tensa manteniendo el clic y dispara al soltarlo; el **rifle
   de plasma** atraviesa construcciones y enemigos. El **fusil de asalto
   pesado** pega más fuerte pero con más retroceso; la **escopeta de dos
   cañones** dispara dos veces muy rápido; el **rifle de caza** es un
   francotirador sin mira; el **cañón de mano** es la pistola más potente. El
   **lanzacohetes** y el **lanzagranadas** usan **cohetes** y destrozan
   construcciones.
10. **Explosivos.** Selecciona una granada y verás su **trayectoria**; **clic
    izquierdo** la lanza. *Granada*: rebota y explota a los 2,4 s. *Granada
    lapa*: se pega a lo que toque (también a enemigos). *Molotov*: incendia el
    suelo unos segundos. *Humo*: crea una nube que tapa la visión (los bots no
    ven a través). *Granada de impulso*: no hace daño pero lanza por los aires
    a todos los cercanos, y al caer no se recibe daño. *C4*: lanza hasta 10
    cargas que se pegan donde caen y detónalas con **clic derecho**. Las
    explosiones no atraviesan paredes y no te dañan a ti ni a tu equipo.
11. **Curarse.** Selecciona una cura y haz **clic izquierdo**; tarda unos
    segundos (te mueves más lento mientras tanto). El **escudo** (barra azul)
    absorbe el daño antes que la vida.

    | Objeto | Efecto |
    | --- | --- |
    | Vendas · Botiquín | +15 vida (hasta 75) · +100 vida |
    | Minipoción · Poción de escudo | +25 escudo (hasta 50) · +50 escudo |
    | Pez saltarín | +40 vida en 1 s |
    | Zumo Slurp | +75 de vida y luego escudo, poco a poco |
    | Barril de poción | Vida y escudo al máximo (15 s) |
    | Plataforma de salto | Se coloca en el suelo; al pisarla sales disparado y se abre el planeador |
12. **Materiales.** Con el **pico** golpea **árboles** (madera), **rocas**
    (piedra) y **coches abandonados** (metal). Al romperlos ganas un extra.
    Los bots también sueltan materiales al ser eliminados.
13. **Construir.** Pulsa **Q** para entrar en modo construcción (la cámara pasa
    a tercera persona). Elige pieza con **1** muro, **2** suelo, **3** rampa,
    **4** techo (o directamente con **Z**/**F1**–**F4**), cambia de material
    con **clic derecho**, gira rampas y techos con **R** y coloca con **clic
    izquierdo** (con la *construcción turbo* basta con mantenerlo pulsado).
    Cada pieza cuesta 10 de material. La silueta azul indica dónde se colocará
    (roja = no se puede: falta material, ya hay una pieza o te estorba).
    Mirando hacia arriba se coloca por encima de ti. Para **subir rápido**,
    corre hacia delante colocando rampas: se encadenan solas. Madera = rápida
    y débil, piedra = media, metal = muy resistente pero tarda más en
    endurecerse. Las piezas se rompen a tiros. **Q** vuelve al modo combate.
14. **Editar.** Apunta a una pieza de tu equipo y pulsa **F**. Aparece una
    rejilla: haz clic (o arrastra) sobre las casillas para quitarlas o
    ponerlas y vuelve a pulsar **F** para confirmar (**clic derecho**
    restablece). En los muros puedes aplicar directamente **piezas reales**:
    **1** puerta (que se abre y se cierra con **E**), **2** ventana, **3**
    arco, **4** arco grande, **5** media pared, **6** valla (muro bajo), **7**
    puerta lateral y **8** ventana doble. Los suelos admiten huecos, las
    rampas se giran eligiendo las 2 casillas del lado hacia el que deben subir
    y los techos se convierten en tejado inclinado o plano. En el móvil: botón
    **✎ EDITAR** (otra vez **LISTO**) y disparar para marcar casillas.
15. **Coches.** Acércate a un coche de color y pulsa **E** para conducir.
    **W/S** acelerar/frenar y marcha atrás, **A/D** girar, **Espacio** freno
    de mano, ratón para mirar alrededor. **E** para bajarte. Puedes atropellar
    a los bots.
16. **Tormenta.** El muro morado se cierra por fases (mira el aviso arriba a
    la derecha y el círculo blanco del mapa: es la próxima zona segura).
    Fuera de la zona pierdes vida cada segundo (el escudo no protege).
17. **Equipos.** En Dúos y Escuadras, si tu vida llega a 0 quedas
    **derribado**: sólo puedes arrastrarte y te desangras. Un compañero puede
    reanimarte (los bots lo hacen solos). Para reanimar tú a un compañero,
    acércate y **mantén E** 5 segundos. Si todo el equipo cae, quedáis
    eliminados. Si te eliminan y queda algún compañero, pasas a **espectar**
    (clic para cambiar de compañero). Tus compañeros aparecen en azul en el
    minimapa y con su nombre encima.
18. **Marcadores.** **Clic central** (o **T**) marca el punto al que apuntas
    (en online lo ven tus compañeros). En el mapa (**M**) el ratón queda libre:
    **clic** para marcar un destino y **clic derecho** para quitarlo. Las
    marcas salen en la brújula (con la distancia) y en el minimapa.
19. **Ganar.** Sé el último jugador (o equipo) en pie: **¡VICTORIA
    MAGISTRAL!** Arriba a la derecha: 👤 jugadores vivos, 🚩 equipos vivos,
    💀 tus eliminaciones.
20. **Pase de batalla.** Cada partida da **XP**: +100 por jugar, +75 por
    eliminación, daño (hasta +400), cofres, construir y editar, tiempo de juego
    y puesto (victoria +500, top 5 +200, top 10 +100); online, +25 %. Los
    **logros** (primera eliminación, 5 victorias, 50 disparos a la cabeza,
    abrir 25 cofres…) dan entre 300 y 2.500 XP. Cada 1.000 XP subes un nivel
    (40 niveles). El **pase gratuito** da camuflajes, accesorios, 2 skins y
    **450 tokens**; el **premium** (**800 tokens**, en la Tienda o en la
    pantalla del pase) añade la Banana Agente, el Astronauta, el Robo-Royale,
    más camuflajes (neón, arcoíris, lava, diamante, oro), accesorios y 25
    tokens en el resto de niveles. Al comprarlo recibes al momento todo lo de
    los niveles que ya tengas. Al completar el pase, cada nivel extra da 25
    tokens. Empiezas con 200 tokens de regalo. La Práctica libre y el modo
    creativo no dan XP.
21. **Tienda y personaje.** En **TIENDA** compras skins (Dino Rex es
    exclusiva), accesorios o el pase premium con tokens (pulsa dos veces para
    confirmar). En **PERSONAJE** equipas skin, accesorio y camuflaje de armas
    (o tus colores). Con sesión online, el progreso y el aspecto se guardan en
    tu cuenta y los demás te ven así.

**Modo creativo:** isla plana sin tormenta, eres invulnerable y tienes
munición y materiales infinitos (se puede cambiar). Doble **Espacio** para
volar (Espacio sube, C baja, Shift acelera) y **B** abre el panel:

- **Objetos**: todas las armas (en todas sus rarezas), curas, arrojadizos,
  munición y materiales. Clic = al inventario, clic derecho = soltar al suelo.
- **Edificios**: todos los edificios de la isla (casas, rascacielos, tienda,
  gasolinera, iglesia, nave, fábrica, estadio, búnker, torres, faro, antena,
  grúa, silo, contenedores, fuente…): elige uno, apunta y **clic** para
  colocarlo (**R** gira). *Borrar edificios* quita lo que apuntes y *Vaciar la
  isla* lo borra todo.
- **Herramientas**: modo dios, munición infinita, vuelo, velocidad, vida y
  escudo al máximo, vaciar inventario, generar **bots enemigos** (con
  dificultad), dianas, cofres y cajas de munición.
- **Construcción**: prefabricados (caja 1×1, subida de rampas, torre de
  rampas, fuerte 2×2 de 3 plantas, muro de 5, puente, plataforma 5×5), borrar
  construcciones y **guardar/cargar** en 3 ranuras.
- **Mundo**: teletransporte haciendo clic en el mapa, hora del día
  (día/noche), activar la tormenta y materiales infinitos.

Tu isla creativa (edificios y construcciones) se **guarda sola**.

**Ajustes (Opciones):** pestañas *Juego* (recogida automática, ordenar curas,
recarga automática, apuntar/agacharse alternos, correr por defecto, saltar la
Isla de Inicio, consejos), *Sensibilidad* (general, al apuntar, con mira,
construyendo y editando), *Construcción y edición* (construcción turbo y su
retardo, cambio automático de material, silueta, confirmar edición al soltar,
seleccionar arrastrando), **Controles** (reasigna cualquier acción con dos
teclas o botones del ratón), *Interfaz* (números de daño, tamaño de la
interfaz, color de la mira, FPS), *Vídeo y sonido* (campo de visión, volumen,
límite de FPS y calidad gráfica, también *Móvil*) y *Móvil y táctil*
(controles táctiles, sensibilidad y tamaño de los botones, vibración,
resolución dinámica, ahorro de batería).

**Cómo piensan los bots:** ven en un cono de ~130° y oyen los disparos
cercanos; comparten lo que ven con su equipo; recorren la isla por caminos
calculados (entran por las puertas, rodean muros y vallas); eligen el arma
según la distancia (escopeta de cerca, fusil a media distancia,
francotirador de lejos, lanzacohetes contra grupos y construcciones); tardan un poco en reaccionar y afinan la puntería
cuanto más tiempo te siguen; disparan en ráfagas; se cubren con muros o se
encierran para curarse; hacen rampas si estás más alto; disparan a tus
construcciones si te escondes detrás; te lanzan granadas, molotov y C4
(sobre todo si te escondes); usan humo para curarse; recogen materiales; rotan hacia la
zona segura con antelación; y reaniman a sus compañeros. La dificultad
cambia sus reflejos, su puntería y lo mucho que construyen.

**Consejos:** aterriza lejos de la ruta del bus si quieres tranquilidad;
construye un muro (**Q**, **1**, clic) cuando te disparen; el indicador rojo
alrededor de la mira señala de dónde vienen los disparos.

---

## 4. Controles

Son los controles por defecto: **todos se pueden cambiar** en *Opciones →
Controles* (en el móvil hay controles táctiles; ver la
[sección 9](#9-versión-para-móviles-android--apk)).

| Tecla | Acción |
| --- | --- |
| **W A S D** (o flechas) | Moverse · **W/S** junto a una escalera de mano: trepar/bajar |
| **Ratón** | Mirar |
| **Clic izquierdo** | Disparar · usar curas · lanzar granadas · golpear con el pico · colocar pieza · (arco) mantener para tensar |
| **Clic derecho** | Apuntar · detonar C4 · (construyendo) cambiar material · (editando) restablecer |
| **Clic central** / **T** | Marcar ubicación |
| **Espacio** | Saltar · salir del autobús · planeador · freno de mano · (creativo, doble) volar |
| **Shift** | Correr |
| **C** / **Ctrl** | Agacharse · (volando) bajar |
| **=** | Correr automáticamente |
| **E** | Abrir cofre · recoger · abrir puerta · vehículo · hablar con PNJ · (mantener) reanimar o usar la furgoneta de reaparición |
| **R** | Recargar · (construyendo o colocando edificios) girar |
| **1–6 / rueda** | Cambiar de objeto · (construyendo) 1–4 pieza · (editando) piezas reales |
| **X** | Arma anterior |
| **H** | Curación rápida |
| **Q** | Entrar/salir del modo construcción |
| **Z** / **F1–F4** | Construir directamente muro / suelo / rampa / techo |
| **F** | Editar la pieza a la que apuntas · confirmar la edición |
| **G** | Soltar el objeto actual |
| **Tab** / **I** | Inventario (arrastrar y soltar, dividir pilas, soltar cantidades) |
| **N** | Gesto (el que lleves en la taquilla) |
| **Y** | Hablar (chat de voz online, si está activado) |
| **V** | Cámara en 1ª / 3ª persona |
| **M** | Mapa de la isla (clic: marcar destino) |
| **B** | (Autobús) dar las gracias al conductor · (creativo) panel de objetos, edificios y herramientas |
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
| Va lento en un PC bueno | El navegador dibuja sin la tarjeta gráfica (sale un cartel rojo avisándolo) o usa la gráfica integrada del portátil | Activa *Usar aceleración por hardware* (Chrome/Edge: *Configuración → Sistema*) y reinicia el navegador. En portátiles con dos gráficas: *Configuración de Windows → Pantalla → Gráficos* → elige el navegador → *Alto rendimiento*. En *Opciones → Calidad gráfica* aparece la tarjeta que se está usando |
| Va lento / a tirones | Ordenador o gráfica modestos | En **Opciones** elige *Calidad gráfica: Normal* o *Baja* (o añade `?calidad=baja` a la dirección), deja activada la *Resolución dinámica*, baja los *Jugadores por partida* en el panel *Jugar* y cierra otras pestañas |
| Al abrir `index.html` con doble clic la página sale en blanco | `index.html` es para el modo desarrollo y necesita `npm run dev` | Para doble clic usa **`jugar.html`** |

Si te sale otro error, copia el mensaje completo de la terminal: la primera
línea que empieza por `npm ERR!` o `Error` suele indicar la causa.

---

## 6. Opciones avanzadas

Se añaden al final de la dirección (por ejemplo `jugar.html?calidad=baja`):

| Opción | Efecto |
| --- | --- |
| `?calidad=baja` | Sin sombras, sin posprocesado y menor resolución |
| `?calidad=movil` | Como *baja*, con menos distancia de dibujado y resolución ajustable (la de los móviles) |
| `?calidad=normal` | Sombras y materiales completos, sin posprocesado |
| `?calidad=alta` | Bloom, oclusión ambiental, terreno HD y sombras más nítidas |

Todas las calidades usan **resolución dinámica** (se puede quitar en
*Opciones*). En móviles y tabletas, *Normal* y *Baja* usan un perfil ligero
pensado para 60-120 FPS.

**¿Mejor descargado o en el navegador?** Da igual para los FPS: `jugar.html`,
`npm run dev` y la web usan el mismo motor del navegador (WebGL), así que van
igual de rápido. Lo que sí importa es que el navegador use la tarjeta
gráfica (ver *Problemas frecuentes*) y jugar en pantalla completa con pocas
pestañas abiertas. En Android, la APK tampoco es más rápida que Chrome, pero
va a pantalla completa y sin barras del navegador.

El mapa es **único**: la isla se genera siempre con la misma semilla
(`MAP_SEED` en `src/world/constants.js`). El resto de ajustes (modo,
dificultad, jugadores, sensibilidades, controles, construcción turbo, campo de
visión, volumen, límite de FPS, calidad gráfica **Alta / Normal / Baja /
Móvil**, controles táctiles, servidor online…) están en el menú y se guardan
en el navegador.

---

## 7. Estructura del proyecto

```
index.html            página del juego (modo desarrollo)
jugar.html            juego completo en un solo archivo (generado)
ROADMAP.md            plan de desarrollo (próximas actualizaciones)
iniciar-windows.bat   lanzador para Windows
iniciar-mac-linux.sh  lanzador para Mac/Linux
scripts/standalone.mjs  genera jugar.html
src/
  main.js             punto de entrada
  style.css           estilos del HUD y menús
  core/               números aleatorios + ruido, teclado/ratón, controles (binds.js), sonido
  world/
    world.js          trazado de la isla: zonas, calles, carreteras, estructuras
    roads.js          red de carreteras y su malla
    buildings.js      casas y naves (con escaleras, porches, chimeneas…)
    structures.js     gasolinera, iglesia, faro, búnker, estadio, muelle, castillo, molino, mercadillo…
    lobby.js          Isla de Inicio (sala de espera antes del autobús)
    navgrid.js        rejilla de navegación + A* para la IA
    water.js          agua con olas, reflejos y espuma en la orilla
    terrain.js collision.js nature.js sky.js
  net/
    client.js         conexión con el servidor (sesión, reconexión)
    discover.js       «Buscar en mi Wi-Fi»: encuentra servidores en la red local
    match.js          sincronización de una partida online
    remote.js         otros jugadores (interpolación de su movimiento)
  game/
    game.js           bucle principal, cámara, partida y victoria
    character.js      física y modelo compartidos por jugador y bots
    player.js         jugador (controles, inventario, materiales)
    bots.js           IA de los bots (percepción, decisiones, combate…)
    modes.js          modos de juego y ajustes guardados
    combat.js         armas, apuntado, retroceso, recarga, curas y pico
    build.js          sistema de construcción y edición
    creative.js       modo creativo: catálogo de edificios, vuelo, guardado, herramientas y prefabricados
    progress.js       pase de batalla: XP, niveles, tokens, logros y compras
    cosmetics.js      skins, accesorios, camuflajes, recompensas del pase y tienda
    harvest.js        árboles, rocas y coches que dan materiales
    vehicles.js       coches conducibles
    loot.js           objetos en el suelo, cofres y cajas de munición
    items.js          definición de armas, curas, materiales y botín
    bus.js storm.js effects.js dummies.js models.js
  ui/                 menú principal, online (amigos/grupo/chat), HUD, minimapa, mapa, panel creativo (creative.js)
                      controles táctiles (touch.js) y pase/tienda/taquilla (progression.js)
  platform.js         botón Atrás de Android y web instalable (PWA)
  fonts/              fuentes incluidas (funcionan sin internet)
public/               manifest, iconos y service worker de la web instalable
android/              proyecto Android (Capacitor) para generar la APK
capacitor.config.json configuración de la app Android
movil/                guía de la APK, arte (iconos) y ficha de Google Play
server/
  index.js            servidor online (WebSocket en /ws + sirve dist/)
  lobby.js            cuentas conectadas, amigos, grupos, invitaciones, cola
  match.js            partidas online: reenvío de estados y arbitraje
  db.js               cuentas y amigos (archivo server/data/db.json)
```

Tecnologías: [Three.js](https://threejs.org) para el 3D y
[Vite](https://vitejs.dev) para el servidor de desarrollo y el build.

---

## 8. Jugar online con amigos

El modo online necesita el **servidor del juego** (`server/`), que guarda las
cuentas y los amigos y conecta a los jugadores. Una persona lo arranca y el
resto se conecta a él.

### 8.1 Probarlo en tu ordenador

```bash
npm install
npm run dev
```

`npm run dev` arranca a la vez el juego (<http://localhost:5173>) y el
servidor online (puerto **8080**). En el juego pulsa **🌐 ONLINE**, crea una
cuenta y listo. Para probar con dos jugadores en el mismo ordenador abre una
segunda ventana **de incógnito** (cada ventana normal comparte la sesión).

### 8.2 Con amigos en la misma red (casa, instituto…)

1. Quien hace de servidor ejecuta `npm run build` y luego `npm start`.
2. La terminal muestra la dirección de red, por ejemplo
   `http://192.168.1.20:8080`.
3. Los demás abren **esa dirección** en su navegador. No necesitan instalar
   nada. (Si no conecta, permite Node.js en el cortafuegos de Windows.)

### 8.3 Con amigos por internet

Lo más sencillo es publicar el servidor gratis en un servicio como
[Render](https://render.com) o [Railway](https://railway.app):

1. Sube el proyecto a tu GitHub y crea un *Web Service* a partir del repositorio.
2. Comando de instalación/compilación: `npm install && npm run build`.
3. Comando de arranque: `npm start` (el servicio indica el puerto con la
   variable `PORT`, que el servidor ya usa).
4. Comparte la dirección que te den (por ejemplo `https://mi-isla.onrender.com`).

También puedes abrir el puerto 8080 en tu router o usar un túnel como
`cloudflared tunnel --url http://localhost:8080` o `ngrok http 8080`.

> Si usas `jugar.html` (el archivo suelto) o la **app de Android**, en
> **ONLINE → Cambiar servidor** escribe la dirección del servidor (por ejemplo
> `192.168.1.20:8080` o `mi-isla.onrender.com`). En la app también puedes
> pulsar **Buscar en mi Wi-Fi**. Todos tenéis que usar el mismo servidor.

### 8.4 Cómo funciona

1. **Cuenta:** en **ONLINE** elige *Crear cuenta* (nombre de 3 a 16 letras o
   números y contraseña). La sesión se recuerda en ese navegador.
2. **Amigos:** escribe el nombre de jugador de tu amigo y pulsa **Añadir**.
   Le llegará una solicitud que tiene que **Aceptar**. En la lista ves quién
   está conectado, en un grupo, buscando partida o jugando.
3. **Grupo:** pulsa **Invitar** junto a un amigo conectado. Le aparecerá un
   aviso para **Unirse**. Un grupo admite hasta 4 jugadores y tiene chat.
4. **Modo:** el líder del grupo (👑) elige el modo, si se rellena con
   **bots** y su dificultad, y pulsa **BUSCAR PARTIDA**:

   | Modo online | Grupo máximo | Cómo se juega |
   | --- | --- | --- |
   | **1v1 Práctica** | 2 | Si estáis 2 en el grupo, jugáis **uno contra el otro** al instante. Solo: se busca un rival (o un bot si tarda) |
   | **Solitario** | 1 | Todos contra todos |
   | **Dúos** | 2 | Equipos de 2 |
   | **Tríos** | 3 | Equipos de 3 |
   | **Escuadras** | 4 | Equipos de 4 |
   | **Duelo por equipos** | 4 | 2 equipos con reaparición, primero a 30 eliminaciones |
   | **Construcción cero** | 1 | Solitario sin construir |

   Los grupos incompletos se completan con otros jugadores que estén
   buscando y, si no hay suficientes en unos segundos, con **bots** (si la
   opción está activada).
5. **En la partida:** **Intro** abre el chat (empieza el mensaje con `/e` para
   hablar solo con tu equipo). Tus compañeros aparecen en el minimapa y con su
   nombre encima. Reanima a los derribados manteniendo **E**. La pausa no
   detiene la partida online.
6. Al terminar, **VOLVER AL GRUPO** te devuelve al lobby con tus amigos.

Todos los jugadores juegan en el **mismo mapa** (la isla es única). Las
partidas online empiezan en la **Isla de Inicio**: cuando todos están listos,
cuenta atrás de 10 segundos y al autobús. El servidor y el juego tienen que
ser de la misma versión.

**Datos del servidor:** las cuentas se guardan en `server/data/db.json`
(las contraseñas, cifradas con *scrypt*). Variables opcionales: `PORT`
(puerto, 8080 por defecto) y `DATA_DIR` (carpeta de datos). Comprueba que
funciona en `/estado`.

| Problema online | Solución |
| --- | --- |
| *El servidor no responde* | Comprueba que `npm run dev` o `npm start` está en marcha y que la dirección en **Cambiar servidor** es correcta |
| *El puerto 8080 ya está en uso* | Ya hay un servidor abierto: ciérralo o usa otro puerto (`PORT=8081 npm start`) |
| No veo a mi amigo conectado | Tenéis que estar en el **mismo servidor** y haber aceptado la solicitud de amistad |
| *Has iniciado sesión desde otra ventana* | Una cuenta solo puede estar conectada en un sitio a la vez |

---

## 9. Versión para móviles (Android / APK)

El mismo juego funciona en móviles y tabletas con **controles táctiles**
(joystick, botones de disparar, apuntar, saltar, agacharse, recargar,
construir, usar, inventario y mapa táctiles), interfaz adaptada a pantallas
pequeñas, calidad gráfica **Móvil** con resolución dinámica, límite de 30
FPS opcional y **distancia de visión** ajustable (*Opciones → Móvil y
táctil*). En calidad *Móvil* el juego dibuja menos (vegetación más sencilla,
sin luces puntuales, sombreados ligeros, niebla más cercana) y baja sólo la
resolución y la distancia de visión si los FPS caen.

Funciones táctiles (*Opciones → Móvil y táctil*):

- **Giroscopio:** mueve el móvil para apuntar (desactivado, sólo al apuntar o
  siempre) con su propia sensibilidad. En iPhone/iPad pide permiso la primera
  vez.
- **Disparo automático** (dispara solo con la mira sobre un enemigo visible) y
  **asistencia de apuntado táctil** con intensidad ajustable.
- **Botón CURAR:** aparece cuando estás herido y usa la mejor cura que lleves.
- **Doble toque** en la zona de mirar: pone un marcador.
- **Mapa:** toca para marcar destino, mantén para quitarlo, pellizca para
  hacer zoom y arrastra para moverte; ✕ para cerrar.
- **Disposiciones predefinidas** (*Por defecto*, *Garra*, *Botones grandes*)
  además de la personalizada, **correr automáticamente** y vibración al
  acertar, derribar, eliminar y recibir daño.
- **Batería y hora** junto a los botones de arriba y **ahorro automático**
  (30 FPS) con un 20 % de batería o menos.

- **Instalar la APK:** en GitHub → **Releases** → *Isla Royale (APK de
  prueba)* → descarga `IslaRoyale-debug.apk` en el móvil y ábrela. GitHub la
  compila sola en cada cambio (`.github/workflows/android.yml`).
- **Sin instalar nada:** con `npm run build` + `npm start` en el PC, abre en
  el navegador del móvil la dirección de red que muestra la terminal
  (`http://192.168.1.20:8080`).
- **Compilarla tú:** Node 22 + Android Studio y `npm run android:apk`.
- **Jugar con un amigo de PC:** él arranca `npm run dev`; tú, en la app,
  **ONLINE → Buscar en mi Wi-Fi** (o escribe la dirección que le sale en la
  terminal). Jugáis en la misma partida.

Guía completa (controles, firma para Google Play, problemas frecuentes):
[`movil/README.md`](movil/README.md). Icono, gráfico destacado, capturas,
descripción y política de privacidad para la tienda:
[`movil/tienda/`](movil/tienda/FICHA.md).
