# Plan de desarrollo — Isla Royale

Este documento recoge lo que ya está hecho en la versión actual y lo que
convendría añadir en próximas actualizaciones, ordenado por prioridad. Las
prioridades piensan en lo que más se nota al jugar (y en lo que suele
olvidarse cuando se copia la fórmula de Fortnite).

Leyenda: 🔴 imprescindible · 🟠 muy recomendable · 🟢 deseable · 💡 idea

---

## ✅ Versión 0.4 (esta actualización)

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

## 🔴 Prioridad alta (siguiente versión)

1. **Sincronizar en online lo que aún es local**: plataformas de salto, las
   puertas ya abiertas al unirse tarde y el botín de las mesas de la Isla de
   Inicio.
2. **Servidor con autoridad sobre el daño** (anti-trampas básico): validar
   distancia/cadencia de los impactos y la munición en `server/match.js`.
3. **Inventario con arrastrar y soltar** (reordenar huecos, dividir pilas,
   tirar cantidades concretas de munición y materiales).
4. **Ajustes de accesibilidad**: modo daltónico (protanopía, deuteranopía,
   tritanopía), visualización de efectos de sonido (indicadores de pasos,
   disparos y cofres en pantalla) y subtítulos.
5. **Mando (gamepad)** con asistencia de apuntado y esquemas de botones
   (incluido «constructor pro»), y **reasignar los botones táctiles** igual
   que las teclas.
6. **Pantalla de carga/emparejamiento** con consejos y el mapa, y
   **reconexión** a una partida en curso tras perder la conexión.
7. **Indicador de pasos y disparos cercanos** en la brújula (muy útil sin
   cascos).

## 🟠 Prioridad media

8. **Desafíos diarios y semanales** y estadísticas por modo (el pase de
   batalla ya da XP por partida y logros).
9. **Taquilla ampliada**: picos, planeadores, mochilas, estelas, gestos
   (bailes) y pantallas de carga (ya hay skins, accesorios y camuflajes).
10. **Más vehículos**: barcas, quads, avión de reconocimiento; gasolina y
    daño de vehículos.
11. **NPCs y misiones** en los pueblos (comerciantes que venden armas por
    oro, misiones de buscar objetos, jefes con botín especial).
12. **Mejoras de IA**: bots que editan, usan explosivos, se suben a
    vehículos, hacen «90s» y reaccionan a los marcadores del jugador cuando
    son compañeros.
13. **Sistema de reaparición en equipo** (tarjeta de reaparición en una
    furgoneta, como en Fortnite) para dúos/tríos/escuadras.
14. **Repeticiones** (grabar estados y reproducir la partida) y modo
    espectador libre al morir.
15. **Clima y ciclo día/noche** durante la partida (lluvia, niebla).
16. **Tormenta mejorada**: fases variables, tormenta móvil al final y
    previsión de la siguiente zona en el mapa.

## 🟢 Prioridad baja / deseable

17. **Editor de islas** en el modo creativo: colocar estructuras del mapa,
    objetos y puntos de aparición; compartir islas con un código.
18. **Modos temporales**: «Sólo francotiradores», «Equipo de 20», «Tiroteo
    de escopetas», «Lluvia de cohetes», «Zona de práctica de edición».
19. **Torneos/arena** con puntuación por puestos y eliminaciones.
20. **Chat de voz** por proximidad y de equipo (WebRTC).
21. **Rendimiento**: LOD de edificios lejanos, *instancing* de piezas de
    construcción, *workers* para la navegación de los bots y sombras en
    cascada.
22. **Animaciones**: personajes con esqueleto (correr, saltar, recargar),
    animación de edición y de abrir cofres.
23. **Sonido**: música dinámica (menú, autobús, combate), sonidos
    posicionales en 3D (HRTF) y efectos distintos por material.
24. **Localización** a otros idiomas (inglés, portugués…).

## 💡 Ideas sueltas

- Objetos legendarios «míticos» con jefe.
- Puertas reales en los edificios del mapa (abrir/cerrar con E).
- Mapas de calor de aterrizajes y eliminaciones al final de la partida.
- Logros (primera victoria, 10 eliminaciones en una partida…).
- Fotos en el modo creativo (cámara libre sin HUD).

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
- **Armas**: se definen en `src/game/items.js` (`WEAPONS`); el modelo 3D va
  en `makeWeaponModel()` de `src/game/models.js`. El campo `cat` decide cómo
  las usan los bots.
