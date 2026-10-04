# Ficha de la tienda (Google Play / otras tiendas)

Textos e imágenes listos para copiar al publicar la app.

## Datos básicos

| Campo | Valor |
| --- | --- |
| Nombre de la app (máx. 30) | **Isla Royale** |
| ID del paquete | `com.islaroyale.juego` |
| Categoría | Juegos → Acción |
| Etiquetas | Battle royale, Disparos, Multijugador, Construcción |
| Clasificación de edad orientativa | PEGI 12 / Teen (violencia de dibujos animados, sin sangre) |
| Precio | Gratis · sin anuncios · sin compras dentro de la app |
| Idioma | Español |
| Versión | 1.0.0 (código 1) |

## Descripción breve (máx. 80 caracteres)

```
Battle royale 3D: salta, saquea, construye y gana. ¡Juega con amigos de PC!
```

## Descripción completa (máx. 4000 caracteres)

```
🏝️ ISLA ROYALE — el battle royale que cabe en tu bolsillo

Salta del autobús de batalla, aterriza donde quieras de una isla enorme, busca cofres, consigue armas y sé el último en pie mientras la tormenta se cierra.

🎮 PARTIDAS COMPLETAS
• Una isla de 1,6 km con pueblos, ciudad, puerto, base militar, estadio, granjas, faro, búnkeres y mucho más.
• Autobús de batalla, caída libre y planeador.
• Cofres y botín con 5 rarezas: fusil de asalto, escopeta, subfusil, pistola y francotirador.
• Vendas, botiquines y pociones de escudo.
• Coches que puedes conducir (¡y atropellar bots!).
• La tormenta se cierra por fases: vigila el mapa.

🎖️ PASE DE BATALLA Y TIENDA
• 40 niveles: gana XP en cada partida (eliminaciones, daño, cofres, puesto…) y con logros.
• Pase gratuito con camuflajes, accesorios, 2 skins y 450 tokens.
• Pase premium por 800 tokens: Banana Agente, Astronauta, Robo-Royale y mucho más.
• Tienda: skins como Dino Rex, accesorios (corona, capa, casco vikingo…) y el pase.
• Sin dinero real: los tokens se ganan jugando.

🎨 MODO CREATIVO
Una isla plana para ti con todas las armas, vuelo y todos los edificios de la isla para colocarlos donde quieras. Se guarda sola.

🧱 CONSTRUYE PARA SOBREVIVIR
Consigue madera, piedra y metal con el pico y levanta muros, suelos, rampas y techos en un segundo. Edítalos para abrir puertas y ventanas o girar rampas. Sube rampas encadenadas y gana la posición alta.

🤖 BOTS CON INTELIGENCIA ARTIFICIAL
Juega sin conexión contra hasta 49 bots que saquean, construyen, se curan, se cubren, rotan hacia la zona segura y se reaniman en equipo. Cuatro dificultades: Fácil, Normal, Difícil y Experto.

👥 JUEGA CON TUS AMIGOS (PC Y MÓVIL)
• Cuentas, lista de amigos, grupos de hasta 4 e invitaciones.
• Chat de grupo y de partida.
• Juego cruzado: tus amigos pueden jugar desde el ordenador y tú desde el móvil en la misma partida.
• Conecta en segundos: pulsa «Buscar en mi Wi-Fi» y la app encuentra el servidor de tu amigo.

🏆 9 MODOS DE JUEGO
Solitario · Dúos · Tríos · Escuadras · 1v1 Práctica · Duelo por equipos · Construcción cero · Práctica libre · Creativo.

📱 HECHO PARA EL MÓVIL
• Joystick, botones grandes y personalizables (tamaño, opacidad y sensibilidad).
• Apuntar y agacharse con un toque, segundo botón de disparo, inventario táctil.
• Calidad gráfica «Móvil» con resolución dinámica: el juego ajusta solo la resolución para ir fluido.
• Límite de 30 FPS para ahorrar batería.
• Vibración al recibir daño y pantalla completa.

🎨 PERSONALIZA TU PERSONAJE
Elige camiseta, pantalón, pelo y tono de piel. En las partidas online tus amigos te verán así.

Sin anuncios. Sin compras. Sin trampas. Solo tú, la isla y la tormenta.
```

## Novedades de esta versión

```
Primera versión para Android: controles táctiles, calidad gráfica para móviles con resolución dinámica, juego online cruzado con PC y búsqueda del servidor en la Wi-Fi.
```

## Imágenes

| Recurso | Archivo | Tamaño |
| --- | --- | --- |
| Icono de la app | `icono-512.png` | 512 × 512 PNG |
| Gráfico destacado | `grafico-destacado-1024x500.png` | 1024 × 500 PNG |
| Capturas de teléfono (horizontal) | `capturas/1-menu.jpg` … `capturas/5-mapa.jpg` | 1600 × 900 JPG |
| Pantalla de carga (referencia) | `pantalla-carga.png` | 1920 × 1080 PNG |

Las imágenes se generan con `npm run arte` (dibujos en `movil/arte/`). Las
capturas son del juego real con los controles táctiles.

## Seguridad de los datos (formulario de Google Play)

- **Datos recogidos:** solo en el modo online, y en el servidor que elija el
  jugador: nombre de jugador, contraseña (guardada cifrada con *scrypt*),
  lista de amigos, estadísticas (victorias, eliminaciones, partidas), aspecto
  del personaje y mensajes de chat (no se guardan, solo se reenvían).
- **Datos compartidos con terceros:** ninguno.
- **Cifrado en tránsito:** depende del servidor (con `https`/`wss` sí; en una
  red local con `ws://` no).
- **Eliminar la cuenta:** el administrador del servidor puede borrarla.
- Sin anuncios, sin analíticas, sin ubicación, sin contactos, sin cámara.

Política de privacidad: ver `politica-privacidad.md` (súbela a una web, por
ejemplo GitHub Pages, y pega el enlace en la ficha).
