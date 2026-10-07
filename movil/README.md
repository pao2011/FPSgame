# Isla Royale para móviles (Android / APK)

El juego funciona en el móvil de tres formas:

| Forma | Qué necesitas | Para quién |
| --- | --- | --- |
| **A. APK ya compilada** (la más fácil) | Nada: se descarga de GitHub | Instalar el juego en Android |
| **B. Navegador del móvil** | Un PC con el servidor en marcha | Probar rápido, iPhone |
| **C. Compilar la APK tú mismo** | Node 22, Java 21 y Android Studio | Modificar el juego o publicarlo |

En el móvil el juego detecta la pantalla táctil y muestra los **controles
táctiles** y la calidad gráfica **Móvil** automáticamente.

---

## A. Descargar la APK compilada por GitHub

Cada vez que se sube un cambio, GitHub compila la APK solo
(`.github/workflows/android.yml`).

1. Entra en <https://github.com/pao2011/FPSgame> desde el móvil.
2. Abre **Releases** (a la derecha, o en *Code → Releases*) y entra en
   **«Isla Royale (APK de prueba · …)»**.
3. Descarga **`IslaRoyale-debug.apk`** y ábrela.
4. Android pedirá permiso para **instalar apps de origen desconocido** desde
   el navegador: actívalo y pulsa **Instalar**.
   (Si Play Protect avisa, pulsa *Más detalles → Instalar de todas formas*:
   es normal en apps que no vienen de Google Play).

> También está en **Actions → APK Android → (última ejecución) → Artifacts →
> IslaRoyale-apk** (hay que iniciar sesión en GitHub; se descarga un ZIP con
> la APK dentro). Para lanzarla a mano: **Actions → APK Android → Run
> workflow**.

---

## B. Jugar desde el navegador del móvil

1. En el PC: `npm install`, `npm run build` y `npm start`.
2. La terminal muestra la dirección de red, por ejemplo
   `http://192.168.1.20:8080`.
3. En el móvil (en la **misma Wi-Fi**), abre esa dirección en Chrome o Safari.
4. Opcional: menú del navegador → **Añadir a pantalla de inicio**. Se instala
   como una app (pantalla completa e icono propio; si el servidor usa
   `https`, como en Render, además funciona sin conexión).

Con `npm run dev` también vale `http://192.168.1.20:5173`.

---

## C. Compilar la APK en tu ordenador

### Requisitos

1. **Node.js 22 o superior** (<https://nodejs.org>).
2. **Android Studio** (<https://developer.android.com/studio>). Al abrirlo la
   primera vez instala el *Android SDK* (deja las opciones por defecto).
   Incluye Java 21, no hace falta instalarlo aparte.
3. Variable `ANDROID_HOME` apuntando al SDK (Android Studio la muestra en
   *Settings → Languages & Frameworks → Android SDK*):
   - Windows: `C:\Users\TU_USUARIO\AppData\Local\Android\Sdk`
   - Mac: `~/Library/Android/sdk` · Linux: `~/Android/Sdk`

### Opción 1 — Con un comando

```bash
npm install
npm run android:apk
```

Genera **`IslaRoyale-debug.apk`** en la carpeta del proyecto. Pásala al móvil
(cable, Drive, WhatsApp…) y ábrela para instalarla.

### Opción 2 — Con Android Studio

```bash
npm install
npm run build:android     # compila el juego y lo copia a android/
npm run android:open      # abre el proyecto en Android Studio
```

En Android Studio: conecta el móvil con *Depuración USB* activada y pulsa
▶ **Run**, o *Build → Build App Bundle(s) / APK(s) → Build APK(s)*.

Cada vez que cambies el código del juego, repite `npm run build:android`.

### Versión firmada para Google Play

1. Crea una clave (una sola vez, **guárdala bien**: sin ella no podrás
   actualizar la app):

   ```bash
   keytool -genkey -v -keystore isla-royale.jks -keyalg RSA -keysize 2048 -validity 10000 -alias isla
   ```

2. Crea `android/keystore.properties` (no se sube a git):

   ```properties
   storeFile=/ruta/completa/isla-royale.jks
   storePassword=TU_CONTRASEÑA
   keyAlias=isla
   keyPassword=TU_CONTRASEÑA
   ```

3. `npm run android:apk -- --release` → `IslaRoyale.apk` y el **AAB** para
   Google Play en `android/app/build/outputs/bundle/release/app-release.aab`.

Para que GitHub la firme solo, añade en *Settings → Secrets and variables →
Actions*: `ANDROID_KEYSTORE_BASE64` (el `.jks` en base64:
`base64 -w0 isla-royale.jks`), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`.

Antes de cada versión nueva sube `versionCode` y `versionName` en
`android/app/build.gradle`.

### Publicar en Google Play

Todo lo necesario está en [`tienda/`](tienda/): icono 512×512, gráfico
destacado 1024×500, capturas, descripción breve y completa, clasificación y
política de privacidad ([`tienda/FICHA.md`](tienda/FICHA.md)).

---

## Jugar con un amigo de PC

El modo online es el mismo en PC y en móvil: **jugáis juntos en la misma
partida**.

1. Tu amigo, en el PC, arranca el juego con `npm run dev` (o `npm start`).
   En su terminal aparece algo como:

   ```
   Amigos con móvil (misma Wi-Fi):
   · App Android: ONLINE → Cambiar servidor → escribe  192.168.1.20:8080
   ```

   También lo ve en el juego: **ONLINE**, abajo en la lista de amigos
   («¿Tu amigo juega desde el móvil?»).
2. En la app: **ONLINE → Buscar en mi Wi-Fi** (la encuentra sola) o escribe
   esa dirección y pulsa **Guardar**.
3. Crea tu cuenta, añadíos como amigos, que uno invite al otro y **BUSCAR
   PARTIDA**. En **1v1 Práctica** con 2 en el grupo jugáis uno contra el otro.

Por internet (no en la misma Wi-Fi): publica el servidor en Render o Railway
(ver la sección 8 del README principal) y escribe su dirección
(`mi-isla.onrender.com`) en **Cambiar servidor**.

---

## Controles táctiles

| Control | Acción |
| --- | --- |
| Joystick (mitad izquierda, aparece donde pones el dedo) | Moverse · a tope hacia delante: **correr** · trepar escaleras |
| Arrastrar en la mitad derecha | Mirar (también arrastrando el botón de disparo) |
| ◎ rojo grande (y otro pequeño a la izquierda) | Disparar · curarse · pico · colocar pieza |
| Mira | Apuntar (toque = activar/desactivar) · construyendo: cambiar material |
| ▲ | Saltar · salir del autobús · planeador · freno de mano |
| ▼ | Agacharse (activar/desactivar) |
| ↻ | Recargar |
| Ladrillos / espada | Modo construcción / volver al combate |
| USAR (aparece cuando hay algo cerca) | Cofres, recoger, coche · mantener: reanimar |
| Huecos del inventario | Tocar: elegir · mantener: soltar |
| Minimapa | Abrir el mapa |
| ⏸ · 👁 · 💬 | Pausa · cámara 1ª/3ª persona · chat (online) |

En **Opciones → Móvil y pantalla táctil**: sensibilidad, tamaño y opacidad
de los botones, vibración y pantalla completa.

## Rendimiento

- **Calidad Móvil** (automática en teléfonos): sin sombras ni posprocesado,
  resolución ajustable (**Opciones → Resolución**) y **resolución dinámica**
  que baja la resolución si los FPS caen y la sube cuando van sobrados.
- **Límite de 30 FPS** para gastar menos batería y calentar menos.
- En teléfonos se proponen **20 jugadores** por partida; bájalo si va lento.
- El minimapa se redibuja menos veces por segundo.

## Problemas frecuentes

| Problema | Solución |
| --- | --- |
| «No se puede instalar la app» | Desinstala una versión anterior firmada con otra clave y vuelve a instalar |
| La app no encuentra el servidor | Mismo Wi-Fi en PC y móvil; el servidor en marcha; en Windows permite **Node.js** en el cortafuegos (redes privadas). Algunas redes de invitados aíslan los dispositivos: usa la dirección a mano o un servidor en internet |
| `SDK location not found` | Define `ANDROID_HOME` o crea `android/local.properties` con `sdk.dir=RUTA_DEL_SDK` |
| `Unsupported class file major version` / error de Java | Usa Java 21 (el que trae Android Studio: `JAVA_HOME` = carpeta `jbr` de Android Studio) |
| `npx cap` pide Node 22 | Actualiza Node.js a la versión 22 o superior |
| Va a tirones | Opciones: calidad **Móvil**, baja la **Resolución**, menos jugadores, límite de 30 FPS |
| Los botones tapan algo | Opciones: reduce el **tamaño** o la **opacidad** de los botones |

## Archivos

```
capacitor.config.json   configuración de la app (nombre, id, servidor http)
android/                proyecto Android (Capacitor); MainActivity a pantalla completa
scripts/android.mjs     npm run android:apk
src/ui/touch.js         controles táctiles
src/net/discover.js     «Buscar en mi Wi-Fi»
src/platform.js         botón Atrás de Android y web instalable
public/                 manifest, iconos y service worker (web instalable)
movil/arte/             dibujos del icono, carga y tienda (npm run arte)
movil/tienda/           ficha de Google Play: textos, imágenes y privacidad
.github/workflows/android.yml   compila la APK en GitHub
```
