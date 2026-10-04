// `npm run android:apk`: compila el juego, lo copia al proyecto Android y
// genera la APK de prueba (IslaRoyale-debug.apk en la carpeta del proyecto).
// Necesita Node 22+, Java 21 (JDK) y el SDK de Android (Android Studio).
// `npm run android:apk -- --release` genera la versión firmada para la tienda
// (necesita android/keystore.properties, ver movil/README.md).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const win = process.platform === 'win32';

function run(cmd, args, cwd = root) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: win });
  if (r.status !== 0) {
    console.error(`\n[ERROR] Ha fallado: ${cmd} ${args.join(' ')}  (mira movil/README.md, «Problemas frecuentes»)`);
    process.exit(r.status || 1);
  }
}

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && !existsSync(join(root, 'android', 'local.properties'))) {
  console.warn('[AVISO] No se encuentra el SDK de Android (variable ANDROID_HOME). Instala Android Studio o mira movil/README.md.');
}
run('npx', ['vite', 'build']);
run('npx', ['cap', 'sync', 'android']);
run(win ? 'gradlew.bat' : './gradlew', [release ? 'assembleRelease' : 'assembleDebug', release ? 'bundleRelease' : ''].filter(Boolean), join(root, 'android'));

const out = join(root, 'android', 'app', 'build', 'outputs', 'apk', release ? 'release' : 'debug');
const src = join(out, release ? 'app-release.apk' : 'app-debug.apk');
if (existsSync(src)) {
  const dest = join(root, release ? 'IslaRoyale.apk' : 'IslaRoyale-debug.apk');
  copyFileSync(src, dest);
  console.log(`\nAPK lista: ${dest}\nCópiala al móvil y ábrela para instalarla.`);
} else if (release) {
  console.log(`\nCompilado. Mira ${out} (si falta la firma sale app-release-unsigned.apk) y android/app/build/outputs/bundle/release (AAB para Google Play).`);
}
