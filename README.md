# Isla Royale — Battle Royale 3D (navegador)

Juego de disparos en 3D estilo Fortnite hecho con **Three.js** + **Vite**. Todo
es procedural: no hay modelos ni texturas externas. Por ahora es **modo práctica
sin bots** (hay muñecos-diana para probar las armas).

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producción en dist/
```

Puedes fijar la isla con `?seed=12345` en la URL.

## Qué incluye

- **Mapa procedural**: isla de 1 km con montañas, playas, agua, ~1700 árboles,
  rocas y arbustos. 8 zonas con nombre (ciudad, torres, granjas, zona industrial
  y pueblos) más casas y torres de vigilancia sueltas.
- **Edificios** con varias plantas, escaleras interiores, ventanas, puertas,
  azoteas accesibles, naves con altillo, silos, balas de paja y contenedores.
  Toda la geometría estática va en una sola malla con colores por vértice.
- **Cofres** (con brillo y zumbido cuando estás cerca), **cajas de munición** y
  **botín en el suelo** con rarezas (común → legendario).
- **Armas**: rifle de asalto, subfusil, escopeta de corredera, rifle de
  francotirador (proyectil con caída de bala y mira telescópica) y pistola.
  Dispersión dinámica (bloom, movimiento, agachado, en el aire), retroceso,
  recarga (cartucho a cartucho en la escopeta), headshots y daño por distancia.
- **Apuntado (ADS)** con zoom; cámara en **1ª y 3ª persona** (V).
- **Consumibles**: vendas, botiquín, minipociones y pociones de escudo.
- **Autobús de batalla** con globo que cruza la isla en una ruta aleatoria.
- **Caída libre** (mira abajo + W para caer más rápido) y **planeador** que se
  abre automáticamente o con Espacio.
- **Tormenta** por fases que se cierra y hace daño fuera de la zona.
- **HUD**: vida/escudo, inventario de 6 huecos con iconos 3D, munición,
  minimapa, mapa completo (M) con nombres de zonas y ruta del bus, brújula,
  altímetro, números de daño e indicadores de impacto.
- **Sonido** sintetizado con WebAudio.

## Controles

| Tecla | Acción |
| --- | --- |
| W A S D | Moverse |
| Ratón | Mirar |
| Clic izquierdo | Disparar / usar consumible / pico |
| Clic derecho | Apuntar |
| Espacio | Saltar · salir del autobús · abrir planeador |
| Shift | Correr |
| C | Agacharse |
| E | Abrir cofre / recoger |
| R | Recargar |
| 1–6 / rueda | Cambiar de objeto |
| G | Soltar objeto |
| V | Alternar 1ª / 3ª persona |
| M | Mapa |
| Esc | Pausa |

## Estructura

```
src/
  core/     rng + ruido simplex, input (pointer lock), audio WebAudio
  world/    terreno, colisiones AABB con rejilla espacial, edificios,
            naturaleza, cielo y ensamblado del mundo (zonas, planos)
  game/     jugador (física y modos bus/caída/planeo/suelo), combate,
            objetos y botín, cofres, autobús, tormenta, efectos, dianas
  ui/       HUD y minimapa/mapa
```

La física del jugador usa una caja contra el mundo de AABB (con subida
automática de escalones) más la altura exacta de la malla del terreno. Los
disparos son raycasts contra la rejilla de colisión, el terreno y las dianas.

## Próximos pasos posibles

Bots con IA, construcción, recolección de materiales con el pico, vehículos,
multijugador.
