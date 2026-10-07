// Monetización: anuncios con recompensa, intersticiales entre partidas,
// compras (pase premium, quitar anuncios) y donaciones.
//  · App Android: AdMob (@capacitor-community/admob) y Google Play Billing
//    (@capgo/native-purchases). Google Play exige su sistema de pagos para
//    todo lo digital, también las propinas al desarrollador.
//  · Web: anuncios H5 Games de Google (AdSense, si está configurado) y
//    donaciones con un enlace externo. Las compras con dinero sólo en la app.
//  · Desarrollo (npm run dev) o ?anunciosprueba: anuncio simulado para probar.
import { Capacitor } from '@capacitor/core';
import { AdMob, RewardAdPluginEvents, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { MONEY } from './config.js';

const today = () => new Date().toISOString().slice(0, 10);

export class Money {
  constructor(game) {
    this.game = game;
    this.native = Capacitor.isNativePlatform();
    this.prices = {}; // id de producto → precio local («2,99 €»)
    this.billing = false;
    this.adsOk = false;
    this.busy = false;
    this.simulated = !this.native && !MONEY.adsenseClient && (import.meta.env?.DEV || new URLSearchParams(location.search).has('anunciosprueba'));
    this.listeners = new Set();
  }

  get progress() {
    return this.game.progress;
  }

  get noAds() {
    return !!this.progress.data.noAds;
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  changed() {
    for (const fn of this.listeners) fn();
  }

  async init() {
    if (this.native) {
      await this.initAdMob().catch((e) => console.warn('AdMob:', e));
      await this.initBilling().catch((e) => console.warn('Google Play Billing:', e));
    } else if (MONEY.adsenseClient) this.initH5Ads();
    else this.adsOk = this.simulated;
    this.changed();
  }

  // ------------------------------------------------------------ ANUNCIOS
  async initAdMob() {
    await AdMob.initialize({ initializeForTesting: MONEY.admob.testing });
    // Consentimiento (RGPD): Google muestra su formulario si hace falta
    try {
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') await AdMob.showConsentForm();
    } catch {
      /* sin formulario de consentimiento */
    }
    this.adsOk = true;
  }

  // Anuncios H5 Games de Google (AdSense) en la web.
  initH5Ads() {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adBreak = window.adConfig = (o) => window.adsbygoogle.push(o);
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(MONEY.adsenseClient)}`;
    s.crossOrigin = 'anonymous';
    s.dataset.adFrequencyHint = '120s';
    if (MONEY.admob.testing) s.dataset.adbreakTest = 'on';
    s.onload = () => {
      window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
      this.adsOk = true;
      this.changed();
    };
    document.head.appendChild(s);
  }

  // Anuncios con recompensa vistos hoy.
  get rewardsLeft() {
    const d = this.progress.data;
    if (d.adDay !== today()) return MONEY.reward.perDay;
    return Math.max(0, MONEY.reward.perDay - (d.adCount || 0));
  }

  get canReward() {
    return this.rewardsLeft > 0 && (this.adsOk || this.noAds) && !this.busy;
  }

  countReward() {
    const d = this.progress.data;
    if (d.adDay !== today()) {
      d.adDay = today();
      d.adCount = 0;
    }
    d.adCount = (d.adCount || 0) + 1;
  }

  // Muestra un anuncio con recompensa. Devuelve true si se ha ganado.
  // Con «Quitar anuncios» la recompensa se da sin anuncio.
  async showReward() {
    if (!this.canReward) return false;
    this.busy = true;
    this.changed();
    let ok = false;
    try {
      if (this.noAds) ok = true;
      else if (this.native) ok = await this.admobReward();
      else if (MONEY.adsenseClient) ok = await this.h5Ad('reward');
      else if (this.simulated) ok = await this.fakeAd(true);
    } catch (e) {
      console.warn('Anuncio con recompensa:', e);
    }
    this.busy = false;
    if (ok) {
      this.countReward();
      this.progress.save();
    } else this.game.menu?.online?.toast('No se ha podido completar el anuncio. Inténtalo más tarde', 'warn');
    this.changed();
    return ok;
  }

  // Recompensa del menú: tokens.
  async rewardTokens() {
    if (!(await this.showReward())) return;
    this.progress.data.tokens += MONEY.reward.tokens;
    this.progress.save();
    this.game.menu?.online?.toast(`🪙 +${MONEY.reward.tokens} tokens · ¡gracias por apoyar el juego!`);
  }

  async admobReward() {
    this.muteGame(true);
    let earned = false;
    const subs = [];
    const done = new Promise((resolve) => {
      AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (earned = true)).then((h) => subs.push(h));
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => resolve()).then((h) => subs.push(h));
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => resolve()).then((h) => subs.push(h));
    });
    try {
      await AdMob.prepareRewardVideoAd({ adId: MONEY.admob.rewarded, isTesting: MONEY.admob.testing });
      await AdMob.showRewardVideoAd().then(() => (earned = true)).catch(() => {});
      await Promise.race([done, new Promise((r) => setTimeout(r, 120000))]);
    } finally {
      for (const h of subs) h.remove();
      this.muteGame(false);
    }
    return earned;
  }

  h5Ad(type) {
    return new Promise((resolve) => {
      let result = type !== 'reward';
      window.adBreak({
        type,
        name: type === 'reward' ? 'recompensa' : 'entre-partidas',
        beforeAd: () => this.muteGame(true),
        afterAd: () => this.muteGame(false),
        beforeReward: (showAdFn) => showAdFn(),
        adViewed: () => (result = true),
        adDismissed: () => (result = false),
        adBreakDone: (info) => resolve(type === 'reward' ? result && info?.breakStatus === 'viewed' : true),
      });
    });
  }

  // Anuncio simulado (sólo en desarrollo): una cuenta atrás de 5 s.
  fakeAd(reward) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.id = 'fake-ad';
      el.innerHTML = `<div class="fa-box"><small>ANUNCIO DE PRUEBA</small><b>Aquí iría un anuncio de ${reward ? 'vídeo con recompensa' : 'pantalla completa'}</b>
        <span class="fa-t">5</span><button>Cerrar</button></div>`;
      document.body.appendChild(el);
      let t = 5;
      const timer = setInterval(() => {
        t--;
        el.querySelector('.fa-t').textContent = t > 0 ? String(t) : '✓';
        if (t <= 0) clearInterval(timer);
      }, 1000);
      el.querySelector('button').addEventListener('click', () => {
        clearInterval(timer);
        el.remove();
        resolve(t <= 0);
      });
    });
  }

  // Intersticial cada N partidas (al volver al menú o jugar otra vez).
  async afterMatch() {
    if (this.noAds || !this.adsOk || this.busy) return;
    const d = this.progress.data;
    d.adMatches = (d.adMatches || 0) + 1;
    if (d.adMatches < MONEY.interstitialEvery) return;
    d.adMatches = 0;
    this.busy = true;
    try {
      if (this.native) {
        this.muteGame(true);
        await AdMob.prepareInterstitial({ adId: MONEY.admob.interstitial, isTesting: MONEY.admob.testing });
        await new Promise((resolve) => {
          const subs = [];
          const end = () => {
            for (const h of subs) h.remove();
            resolve();
          };
          AdMob.addListener(InterstitialAdPluginEvents.Dismissed, end).then((h) => subs.push(h));
          AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, end).then((h) => subs.push(h));
          AdMob.showInterstitial().catch(end);
          setTimeout(end, 90000);
        });
      } else if (MONEY.adsenseClient) await this.h5Ad('next');
      else if (this.simulated) await this.fakeAd(false);
    } catch (e) {
      console.warn('Intersticial:', e);
    } finally {
      this.muteGame(false);
      this.busy = false;
    }
  }

  muteGame(on) {
    const a = this.game.audio;
    if (on) a.ctx?.suspend?.();
    else a.ctx?.resume?.();
  }

  // ------------------------------------------------------------ COMPRAS
  async initBilling() {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    if (!isBillingSupported) return;
    this.billing = true;
    const P = MONEY.products;
    const ids = [P.pass, P.noads, ...P.tips];
    try {
      const { products } = await NativePurchases.getProducts({ productIdentifiers: ids, productType: PURCHASE_TYPE.INAPP });
      for (const p of products) this.prices[p.identifier] = p.priceString;
    } catch (e) {
      console.warn('Productos de Google Play:', e);
    }
    await this.restore(true);
  }

  // Precio de un producto (sólo cuando Google Play lo ha devuelto).
  price(id) {
    return this.prices[id] || '';
  }

  canBuy(id) {
    return this.billing && !!this.prices[id];
  }

  // Aplica lo comprado (y lo ya comprado en otro móvil con la misma cuenta).
  grant(id, quiet = false) {
    const P = MONEY.products;
    const toast = (t) => !quiet && this.game.menu?.online?.toast(t);
    if (id === P.pass) {
      if (!this.progress.data.premium) {
        this.progress.data.premium = true;
        const rewards = this.progress.grantTiers();
        this.progress.save();
        toast(`⭐ ¡Pase premium activado!${rewards.length ? ` Recibes ${rewards.length} recompensas` : ''}`);
      }
    } else if (id === P.noads) {
      if (!this.progress.data.noAds) {
        this.progress.data.noAds = true;
        this.progress.save();
        toast('🚫 Anuncios quitados: las recompensas de los anuncios ahora son directas. ¡Gracias!');
      }
    } else if (P.tips.includes(id)) toast('💖 ¡Muchísimas gracias por tu donación!');
    this.changed();
  }

  async buy(id) {
    if (!this.canBuy(id) || this.busy) return;
    this.busy = true;
    this.changed();
    try {
      const tip = MONEY.products.tips.includes(id);
      const tx = await NativePurchases.purchaseProduct({ productIdentifier: id, productType: PURCHASE_TYPE.INAPP, isConsumable: tip });
      if (!tx.purchaseState || tx.purchaseState === '1') this.grant(id);
      else this.game.menu?.online?.toast('Compra pendiente: se activará cuando Google Play la confirme');
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/cancel/i.test(msg)) this.game.menu?.online?.toast('No se ha podido completar la compra', 'warn');
    }
    this.busy = false;
    this.changed();
  }

  // Restaurar compras (pase premium y quitar anuncios).
  async restore(quiet = false) {
    if (!this.billing) return;
    try {
      await NativePurchases.restorePurchases().catch(() => {});
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
      const P = MONEY.products;
      for (const t of purchases) {
        if (t.purchaseState && t.purchaseState !== '1') continue;
        if (t.productIdentifier === P.pass || t.productIdentifier === P.noads) this.grant(t.productIdentifier, quiet);
      }
      if (!quiet) this.game.menu?.online?.toast('Compras restauradas');
    } catch (e) {
      if (!quiet) this.game.menu?.online?.toast('No se han podido restaurar las compras', 'warn');
    }
  }

  // ------------------------------------------------------------ DONACIONES
  // Web: enlace externo. App: propinas con Google Play (si están creadas).
  get canDonate() {
    return this.native ? MONEY.products.tips.some((id) => this.canBuy(id)) : !!MONEY.donateUrl;
  }

  donateWeb() {
    if (MONEY.donateUrl) window.open(MONEY.donateUrl, '_blank', 'noopener');
  }
}
