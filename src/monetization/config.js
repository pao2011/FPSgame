// Configuración de la monetización. Todo se puede cambiar aquí o, sin tocar
// el código, con variables de entorno de Vite en un archivo .env (o en los
// secretos de GitHub Actions al compilar la APK):
//
//   VITE_DONATE_URL           enlace de donaciones en la web (Ko-fi, PayPal.me…)
//   VITE_ADSENSE_CLIENT       ca-pub-… de AdSense (anuncios H5 Games en la web)
//   VITE_ADMOB_REWARDED       bloque de anuncios bonificados de AdMob (app)
//   VITE_ADMOB_INTERSTITIAL   bloque de anuncios intersticiales de AdMob (app)
//   VITE_ADMOB_TESTING=0      anuncios reales (por defecto: de prueba)
//
// Mientras no pongas tus IDs, la app usa los bloques de PRUEBA oficiales de
// Google (se ven anuncios de prueba y no se cobra nada). El ID de aplicación
// de AdMob va en android/app/src/main/res/values/strings.xml (admob_app_id).
//
// Productos de Google Play (Play Console → Monetizar → Productos → Productos
// integrados en la aplicación): créalos con estos mismos IDs.
const env = import.meta.env || {};

export const MONEY = {
  donateUrl: env.VITE_DONATE_URL || '',
  adsenseClient: env.VITE_ADSENSE_CLIENT || '',
  admob: {
    testing: env.VITE_ADMOB_TESTING !== '0',
    rewarded: env.VITE_ADMOB_REWARDED || 'ca-app-pub-3940256099942544/5224354917',
    interstitial: env.VITE_ADMOB_INTERSTITIAL || 'ca-app-pub-3940256099942544/1033173712',
  },
  products: {
    pass: 'pase_premium_t1', // pase de batalla premium de la temporada 1 (no consumible)
    noads: 'quitar_anuncios', // no consumible
    tips: ['propina_1', 'propina_3', 'propina_5'], // donaciones (consumibles)
  },
  // Anuncios con recompensa
  reward: { tokens: 30, perDay: 6 },
  // Un anuncio intersticial cada N partidas (nunca con «Quitar anuncios»)
  interstitialEvery: 3,
};
