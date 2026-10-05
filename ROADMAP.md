# Plan de desarrollo — Isla Royale

Este documento recoge lo que ya está hecho en la versión actual y lo que
convendría añadir en próximas actualizaciones, ordenado por prioridad. Las
prioridades piensan en lo que más se nota al jugar (y en lo que suele
olvidarse cuando se copia la fórmula de Fortnite).

Leyenda: 🔴 imprescindible · 🟠 muy recomendable · 🟢 deseable · 💡 idea

---

## ✅ Versión 0.4

- **Un solo mapa fijo** (`MAP_SEED` en `src/world/constants.js`): la isla es
  idéntica en todas las partidas, en local y online. Se quitó «Nueva isla» y
  el parámetro `?seed`.
- **Cofres aleatorios**: todos los huecos posibles son candidatos y en cada
  partida cada cofre aparece con una probabilidad (misma semilla para todos en
  online).
- **Isla de Inicio** fuera del mapa (visible desde la costa, no en el
  minimapa): plaza, plataformas, cartel, palmeras, mesas con armas de
  práctica, dianas y construcción libre. Al reunirse todos los jugadores,
  cuenta atrás de 10 s y al autobús. Sin daño.
- **Autobús de batalla detallado**: conductor, pasajeros, puertas, faros,
  parrilla, matrícula, equipaje, globo de gajos con quemador y llama animada,
  banderines, hélice… y **«dar las gracias al conductor»** (B).
- **Edición de piezas reales**: muro 3×3 (puerta con hoja que se abre,
  ventana, arco, arco grande, media pared, valla, puerta lateral, ventana
  doble), suelo 2×2 con huecos, rampa girada, tejado inclinado o plano.
  Sincronizado online.
- **Ajustes estilo Epic**: construcción turbo y su retardo, cambio
  automático de material, confirmar edición al soltar, selección arrastrando,
  sensibilidades separadas (apuntar, mira, construir, editar), apuntar y
  agacharse alternos, correr por defecto, recarga automática, límite de FPS,
  tamaño de interfaz, color de mira, números de daño y **controles
  totalmente personalizables** (dos teclas por acción, ratón incluido).
- **Modo creativo**: vuelo, catálogo con todas las armas y consumibles,
  munición/materiales infinitos, modo dios, velocidad, bots enemigos por
  dificultad, dianas, cofres, cajas de munición, 7 prefabricados, 3 ranuras
  de guardado, teletransporte desde el mapa, hora del día y tormenta.
- **Armas nuevas**: fusil de ráfagas, fusil pesado, minigun, escopeta
  táctica, escopeta de dos cañones, rifle de caza, revólver, cañón de mano,
  lanzacohetes y lanzagranadas (explosiones que rompen construcciones).
- **Consumibles nuevos**: pez saltarín, Zumo Slurp, Jarra Chug, granada,
  granada de impulso y plataforma de salto.
- **Estructuras nuevas**: Castillo Corona, molinos y mercadillos (con nombre
  en el mapa).
- **Pase de batalla** (40 niveles, XP por partida y logros), **Tienda** con
  tokens, **skins**, **accesorios** y **camuflajes de armas**.
- **Versión para móviles**: controles táctiles, calidad *Móvil* con
  resolución dinámica, juego cruzado PC + móvil y **APK de Android**.
- **Explosivos**: granada, granada lapa, C4 (detonación a distancia), humo,
  molotov e impulso, con trayectoria previa y sincronizados online.
- **Rarezas Mítico y Exótico**, rifle de tirador, rifle de plasma y arco
  explosivo.
- **Calidad de vida**: marcadores de ubicación (clic central, también para tu
  equipo online), destino en el mapa (clic), marcas en brújula y minimapa,
  recogida automática, curas ordenadas a la derecha, curación rápida (H),
  arma anterior (X), correr automático (=), aviso de munición baja, mapa con
  ratón libre.

---

## ✅ Versión 0.5 (esta actualización)

### Gráficos
- **Materiales PBR** con iluminación de entorno (PMREM) en calidad normal y
  alta, **oclusión ambiental (GTAO)** y sombras suaves en alta.
- **Personajes articulados** (rodillas y codos) con piezas redondeadas y
  animaciones de recarga, construcción, edición y curación.
- **Mapa:** fachadas con patrones (tablas, ladrillo, revoque), asfalto con
  grano, parches y grietas, árboles y rocas con volumen y **césped
  instanciado que se mece con el viento**.
- **Armas** con guardamonte, gatillo, raíl, bocacha y ventana de expulsión;
  manos con dedos en primera persona; pico nuevo.
- **Construcciones** con texturas nuevas y relieve (marco y clavos, juntas,
  chapa corrugada con remaches).
- **Balas y efectos:** trazadoras que viajan con halo, casquillos, polvo de
  impacto, agujeros de bala con textura y fogonazo en estrella con humo.

### 🔴 Prioridad alta (hecho)
1. **Online sincronizado:** plataformas de salto, puertas, armas de las mesas
   de la Isla de Inicio y, al volver tras un corte, construcciones, cofres,
   objetos y bajas.
2. **Anti-trampas en el servidor** (`server/anticheat.js`): daño máximo por
   arma/rareza/tiro a la cabeza, cadencia (cubo de daño) y distancia.
3. **Inventario con arrastrar y soltar** (Tab): reordenar, juntar y dividir
   pilas, soltar cantidades de munición y materiales.
4. **Accesibilidad:** modo daltónico (protanopía, deuteranopía, tritanopía),
   sonidos visualizados alrededor de la mira y subtítulos.
5. **Mando** con asistencia de apuntado y esquemas *Clásico* y *Constructor
   pro*; **editor de la disposición de los botones táctiles**.
6. **Pantalla de emparejamiento** con mapa, jugadores y consejos; consejos en
   la carga; **reconexión** a la partida durante 45 s.
7. **Disparos y pasos cercanos en la brújula.**

### 🟠 Prioridad media (hecho)
8. **Desafíos diarios (3) y semanales (4)** con XP y tokens; estadísticas
   por modo.
9. **Taquilla ampliada:** picos, planeadores, mochilas, estelas, gestos (con
   animación y online) y pantallas de carga.
10. **Vehículos:** quads, lanchas, gasolina (gasolineras) y daño/explosión.
11. **PNJ y misiones:** comerciantes (armas por oro), misiones de reliquias,
    eliminaciones y cofres, y **jefe** en el Castillo Corona con botín mítico.
12. **IA:** «90s», ventanas editadas desde la caja para disparar, gestos al
    eliminar y compañeros que acuden a los marcadores.
13. **Furgonetas de reaparición** con tarjetas (equipos contra bots).
14. **Repeticiones** (línea de tiempo, velocidad, seguir jugadores, cámara
    libre) y **espectador en directo**.
15. **Clima** (nublado, lluvia, niebla) y **ciclo de día** en la partida.
16. **Tormenta:** fases variables, zona final móvil y ruta en el mapa.

### 🟢 Prioridad baja e ideas (hecho)
17. **Compartir islas del creativo** con un código (edificios,
    construcciones y punto de aparición) y **modo foto**.
18. **Modos temporales:** Sólo francotiradores, Tiroteo de escopetas, Lluvia
    de cohetes, Equipos de 20 y Práctica de edición contra el reloj.
19. **Arena:** puntos por eliminaciones y puesto, 9 divisiones y Copa
    semanal.
20. **Chat de voz** WebRTC: rivales por proximidad (3D), compañeros siempre,
    pulsar para hablar o micrófono abierto.
21. **Rendimiento:** puertas y PNJ lejanos ocultos, césped que se desactiva
    solo si bajan los FPS.
22. **Animaciones** en tercera persona (recarga, construir, editar, curarse,
    gestos).
23. **Sonido:** música dinámica, sonido 3D (HRTF) y pasos según el suelo.
24. **Idiomas:** inglés y portugués.
- **Puertas reales** en las casas del mapa (E; los bots también las abren).
- **Mapa de calor** de aterrizajes y eliminaciones al terminar.

---

## ✅ Optimización para móviles

- **Mundo por parcelas:** terreno (8×8), vegetación (parcelas de 160 m) y
  edificios (120 m) se descartan fuera de cámara y por distancia
  (`src/world/lod.js`). En calidad *Móvil*: de ~1,65 M a ~0,2 M triángulos
  por fotograma; la Isla de Inicio pasa de ~200 llamadas de dibujo a 7.
- **Calidad *Móvil*:** árboles, rocas y arbustos con menos polígonos, cielo
  con 3 octavas de nubes, agua sin ruido, suelo y asfalto con menos ruido,
  fachadas con dibujo sólo de cerca, sin luces puntuales, niebla más cercana,
  sonido 3D *equalpower* y máximo de sonidos simultáneos.
- **CPU:** rutas de los bots con presupuesto de tiempo por fotograma y atajo
  en línea recta (de ~13 ms a ~1 ms por fotograma en la prueba), animación
  de los bots lejanos a menos FPS, matrices sólo de lo visible, minimapa a
  ~13 Hz, lluvia en el *shader*.
- **Batería:** 30 FPS en el menú y el mapa, 15 FPS en pausa; distancia de
  visión (*Opciones → Móvil y táctil*) que se acorta sola si la resolución
  dinámica ya está al mínimo.
- **Sin tirones:** shaders precompilados en la carga y luces fijas (añadir
  luces obligaba a recompilar todo).

## ✅ Novedades para móviles

- **Apuntar con el giroscopio** (`src/ui/mobile.js`): desactivado, al apuntar
  o siempre; tiene en cuenta la orientación de la pantalla y pide permiso en
  iOS.
- **Disparo automático** con la mira sobre un enemigo visible (pulsos en las
  armas semiautomáticas; nunca con explosivos ni arcos) y **asistencia de
  apuntado táctil** (la del mando, con su propia intensidad).
- **Botón CURAR** (curación rápida) que sólo aparece si sirve; arreglada la
  curación rápida, que se cancelaba durante el cambio de objeto.
- **Doble toque para marcar**, **mapa táctil** (marcar, quitar, pellizcar
  para zoom, arrastrar) con botón de cerrar.
- **Disposiciones predefinidas** *Garra* y *Botones grandes*, **correr
  automáticamente** y **vibración** según los sucesos (con límite para no
  vibrar en cada bala).
- **Batería y hora** en pantalla y **ahorro automático** con la batería baja.

## 🔜 Pendiente para próximas versiones

- **Rendimiento:** *instancing* de las piezas de construcción, navegación de
  los bots en un *worker*, sombras en cascada e impostores de los edificios
  lejanos.
- **IA:** bots que conducen vehículos y que usan las furgonetas de
  reaparición en online.
- **Online:** furgonetas de reaparición, PNJ y jefe en partidas online
  (ahora sólo contra bots); validación de la munición en el servidor.
- **Torneos online** con clasificación entre jugadores reales (la Arena y la
  Copa son ahora individuales).
- **Idiomas:** traducir también las descripciones largas (modos, consejos,
  ayuda), que siguen en español.
- **Animaciones** de abrir cofres y de esqueleto completo (manos y dedos).
- Más armas y objetos con jefe, y nuevos puntos de interés.

---

## Notas técnicas para las próximas versiones

- **Mapa único**: cambiar `MAP_SEED` cambia la isla para todos; si se hace,
  hay que actualizar a la vez el servidor y `jugar.html`. Si se quieren
  añadir lugares nuevos sin alterar el resto, conviene generarlos al final de
  `World.generate()` con su propio `RNG` (como la Isla de Inicio) para no
  desplazar la secuencia aleatoria del mapa.
- **Edición**: los bits de edición están en `src/game/build.js`
  (`WALL_PRESETS`); añadir piezas nuevas es añadir una máscara.
- **Controles**: cualquier acción nueva va en `src/core/binds.js` y se lee
  con `input.held('accion')` / `input.hit('accion')`.
- **Cosméticos**: `src/game/cosmetics.js` (`COSMETIC_TYPES`); el servidor
  los valida con `cleanCosmetics`.
- **Modos temporales**: `lootPool` en `src/game/modes.js` limita las armas
  (cliente y servidor usan `setLootPool`).
- **Idiomas**: `src/ui/i18n.js` traduce los textos de la página con un
  diccionario y patrones; añadir una frase es añadir una entrada.
- **Armas**: se definen en `src/game/items.js` (`WEAPONS`); el modelo 3D va
  en `makeWeaponModel()` de `src/game/models.js`. El campo `cat` decide cómo
  las usan los bots.
