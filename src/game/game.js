import * as THREE from 'three';
import { World } from '../world/world.js';
import { NavGrid } from '../world/navgrid.js';
import { createSky, SKY } from '../world/sky.js';
import { Grass } from '../world/grass.js';
import { InventoryPanel } from '../ui/inventory.js';
import { Accessibility } from '../ui/accessibility.js';
import { GamepadInput } from '../core/gamepad.js';
import { MatchLoader } from '../ui/tips.js';
import { Trails } from './trails.js';
import { Weather } from '../world/weather.js';
import { makeEnvironment } from '../world/envmap.js';
import { setModelQuality } from './models.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { Effects } from './effects.js';
import { Explosives } from './explosives.js';
import { PickupManager, ContainerManager, spawnFloorLoot } from './loot.js';
import { Dummies } from './dummies.js';
import { BattleBus } from './bus.js';
import { Storm } from './storm.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { Harvest } from './harvest.js';
import { BuildSystem } from './build.js';
import { Vehicles } from './vehicles.js';
import { BotManager } from './bots.js';
import { HUD } from '../ui/hud.js';
import { Menu } from '../ui/menu.js';
import { TouchControls, isTouchDevice } from '../ui/touch.js';
import { Progress } from './progress.js';
import { Creative } from './creative.js';
import { MapRenderer } from '../ui/minimap.js';
import { itemName, itemRarity, RARITIES, MATERIALS, AMMO, CONSUMABLES, PICKAXE, WEAPONS, makeWeapon, stackDef } from './items.js';
import { mergeBinds, keyName } from '../core/binds.js';
import { CreativePanel } from '../ui/creative.js';
import { MODES, loadSettings, saveSettings } from './modes.js';
import { clamp, random, RNG } from '../core/rng.js';
import { NetClient } from '../net/client.js';
import { OnlineMatch } from '../net/match.js';
import { ISLAND_RADIUS, MAP_SEED } from '../world/constants.js';

const SKY_COLOR = SKY.horizon;
const tmpV = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const tmpR = new THREE.Vector3();

export class Game {
  constructor(container) {
    this.settings = loadSettings();
    const params = new URLSearchParams(location.search);
    const q = params.get('calidad');
    if (q === 'baja' || q === 'movil') this.settings.quality = q;
    const mobile = this.settings.quality === 'movil';
    const low = this.settings.quality === 'baja' || mobile;
    const high = this.settings.quality === 'alta';
    this.quality = mobile ? 'movil' : low ? 'baja' : high ? 'alta' : 'normal';
    setModelQuality(this.quality);
    const tc = this.settings.touchControls;
    this.isTouch = tc === 'on' || (tc !== 'off' && isTouchDevice());

    // ------------------------------------------------------------ RENDER
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: low ? false : !this.usePost, powerPreference: 'high-performance' }));
    // Calidad móvil: resolución ajustable y dinámica (baja si van mal los FPS).
    this.dynRes = 1;
    this.perf = { t: 0, n: 0, cool: 0 };
    renderer.setPixelRatio(this.pixelRatio());
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = !low;
    renderer.shadowMap.type = high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);
    this.canvas = renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY_COLOR, 200, 1300);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.1, 5000);
    this.camera.rotation.order = 'YXZ';

    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 10);
    this.viewScene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5040, 2.0));
    const vd = new THREE.DirectionalLight(0xfff2dd, 2.2);
    vd.position.set(0.5, 1, 0.3);
    this.viewScene.add(vd);

    this.sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
    vd.position.copy(this.sunDir);
    this.sky = createSky(this.scene, this.sunDir);
    this.hemi = new THREE.HemisphereLight(0xd6ecff, 0x5f6e44, low ? 1.5 : 0.75);
    this.scene.add(this.hemi);
    // Iluminación de entorno para los materiales PBR (calidad normal/alta)
    if (!low) {
      try {
        const env = makeEnvironment(renderer, this.sunDir);
        this.scene.environment = env;
        this.scene.environmentIntensity = 0.75;
        this.viewScene.environment = env;
        this.viewScene.environmentIntensity = 0.9;
      } catch (err) {
        console.warn('Sin mapa de entorno:', err);
      }
    }
    const sun = (this.sun = new THREE.DirectionalLight(0xffefd2, 3.0));
    sun.castShadow = !low;
    sun.shadow.mapSize.set(high ? 4096 : 2048, high ? 4096 : 2048);
    const sc = sun.shadow.camera;
    const ext = high ? 95 : 70;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.setupPost();

    // ------------------------------------------------------------ MUNDO
    // Mapa único: siempre la misma isla (también en online). El modo
    // creativo usa su propia isla plana (sandbox, no es un mapa de partida).
    this.seed = MAP_SEED;
    this.world = new World(this.scene, this.seed, { creative: params.get('creativo') === '1' });
    this.grass = new Grass(this.scene, this.world, this.quality);
    this.weather = new Weather(this);

    this.input = new Input(this.canvas);
    this.gamepad = new GamepadInput(this);
    this.touch = null;
    this.audio = audio;
    this.effects = new Effects(this);
    this.explosives = new Explosives(this);
    this.trails = new Trails(this);
    this.camShake = 0;
    this.pickups = new PickupManager(this);
    this.containers = new ContainerManager(this, this.world.chestSpots, this.world.ammoSpots);
    this.dummies = new Dummies(this, this.world.dummySpots);
    this.bus = new BattleBus(this.scene);
    this.storm = new Storm(this.scene, this.world);
    this.storm.active = false;
    this.storm.mesh.visible = false;
    this.player = new Player(this);
    this.combat = new Combat(this);
    this.harvest = new Harvest(this);
    this.build = new BuildSystem(this);
    this.vehicles = new Vehicles(this, this.world.carSpots);
    this.bots = new BotManager(this);
    this.progress = new Progress(this);
    this.creative = new Creative(this);
    this.containers.reset();
    this.nav = new NavGrid(this.world);
    this.mapRenderer = new MapRenderer(this.world);
    this.hud = new HUD(this);

    this.mode = MODES.solo;
    this.state = 'menu';
    this.camMode = 'fp';
    this.paused = false;
    this.hadLock = false;
    this.time = 0;
    this.matchTime = 0;
    this.stormTick = 0;
    this.aimOrigin = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.aimSkip = 0;
    this.noises = [];
    this.pathQueue = [];
    this.chars = [this.player];
    this.score = [0, 0];
    this.spectating = null;
    this.respawnT = 0;
    this.infiniteMats = false;
    this.infiniteAmmo = false;
    this.godMode = false;
    this.speedMult = 1;
    this.phase = 'menu'; // 'lobby' (isla de inicio) | 'bus' | 'match'
    this.lobbyT = 0;
    this.lobbyJoin = [];
    this.lobbyCount = 0;
    this.pings = [];
    this.waypoint = null;
    this.net = null; // partida online en curso (OnlineMatch)
    this.waiting = false; // esperando a que empiece la partida online
    this.netClient = new NetClient();
    if (this.settings.outfit) this.player.setOutfit(this.settings.outfit);

    this.menu = new Menu(this);
    this.creativePanel = new CreativePanel(this);
    this.inventory = new InventoryPanel(this);
    this.a11y = new Accessibility(this);
    this.loader = new MatchLoader(this);
    if (this.isTouch) this.touch = new TouchControls(this);
    addEventListener('resize', () => this.onResize());
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.canvas.addEventListener('click', () => {
      if (this.touch) return; // en táctil lo gestiona src/ui/touch.js
      if (this.spectating) this.nextSpectate();
      else if (this.state === 'playing' && !this.input.locked && !this.paused) this.input.lock();
    });
    // Esc mientras se especta (sin ratón capturado) vuelve al menú
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.spectating && this.state === 'playing') this.quitToMenu();
    });
    this.timer = new THREE.Timer();
    this.hud.show(false);
    this.applySettings();
    window.game = this;
    this.lastFrame = 0;
    // Con la pestaña en segundo plano el navegador frena requestAnimationFrame:
    // en online se sigue simulando (sin dibujar) para no congelar al jugador
    // ni a los bots del anfitrión.
    this.bgLast = 0;
    setInterval(() => {
      if (!document.hidden || !this.net) return;
      const now = performance.now();
      let el = Math.min(1, (now - (this.bgLast || now)) / 1000);
      this.bgLast = now;
      while (el > 0.001) {
        const dt = Math.min(0.05, el);
        this.step(dt);
        el -= dt;
      }
    }, 100);
    this.loop();
  }

  // Posprocesado (calidad normal/alta): MSAA + bloom + tonemapping final.
  get usePost() {
    return this.settings.quality !== 'baja' && this.settings.quality !== 'movil';
  }

  pixelRatio() {
    const dpr = devicePixelRatio || 1;
    if (this.quality === 'movil') return Math.min(dpr, 2) * ((this.settings.resScale || 70) / 100) * this.dynRes;
    if (this.quality === 'baja') return Math.min(dpr, 1) * 0.75;
    return Math.min(dpr, this.quality === 'alta' ? 2 : 1.5);
  }

  // Resolución dinámica (calidad móvil): mide los FPS y ajusta la resolución.
  adaptResolution(raw) {
    if (this.quality !== 'movil' || this.settings.autoRes === false || this.state !== 'playing' || this.paused) return;
    const pf = this.perf;
    pf.t += raw;
    pf.n++;
    if (pf.t < 2) return;
    const fps = pf.n / pf.t;
    pf.t = pf.n = 0;
    const target = this.settings.fpsCap === 30 ? 28 : 50;
    let next = this.dynRes;
    if (fps < target - 6) next = Math.max(0.55, this.dynRes - 0.12);
    else if (fps > target + 6 && ++pf.cool >= 3) next = Math.min(1, this.dynRes + 0.06);
    if (next !== this.dynRes) {
      pf.cool = 0;
      this.dynRes = next;
      this.renderer.setPixelRatio(this.pixelRatio());
      this.renderer.setSize(innerWidth, innerHeight);
    }
  }

  setupPost() {
    this.composer = null;
    if (!this.usePost) return;
    try {
      const r = this.renderer;
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      const composer = new EffectComposer(r, rt);
      this.mainPass = new RenderPass(this.scene, this.camera);
      this.viewPass = new RenderPass(this.viewScene, this.viewCamera);
      this.viewPass.clear = false;
      this.viewPass.clearDepth = true;
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.5, 1.2);
      composer.addPass(this.mainPass);
      // Oclusión ambiental (rincones y bases de muros más oscuros) en calidad alta
      if (this.quality === 'alta') {
        try {
          this.aoPass = new GTAOPass(this.scene, this.camera, size.x, size.y);
          this.aoPass.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 1.5, scale: 1.2 });
          this.aoPass.blendIntensity = 0.85;
          composer.addPass(this.aoPass);
        } catch (err) {
          console.warn('Sin oclusión ambiental:', err);
        }
      }
      composer.addPass(this.viewPass);
      composer.addPass(this.bloomPass);
      composer.addPass(new OutputPass());
      this.composer = composer;
    } catch (err) {
      console.warn('Posprocesado no disponible:', err);
      this.composer = null;
    }
  }

  get baseFov() {
    return this.settings.fov;
  }

  applySettings() {
    const s = this.settings;
    s.binds = mergeBinds(s.binds);
    saveSettings(s);
    this.input.binds = s.binds;
    if (this.audio.master) this.audio.master.gain.value = (s.volume / 100) * 0.6;
    document.getElementById('fps').style.display = s.showFps ? 'block' : 'none';
    const root = document.documentElement.style;
    root.setProperty('--hud-scale', String(s.hudScale || 1));
    root.setProperty('--cross', s.crosshairColor || '#ffffff');
    this.touch?.applySettings();
    this.a11y?.apply();
    if (this.renderer && this.quality === 'movil') {
      const pr = this.pixelRatio();
      if (Math.abs(pr - this.renderer.getPixelRatio()) > 0.01) {
        this.renderer.setPixelRatio(pr);
        this.renderer.setSize(innerWidth, innerHeight);
      }
    }
  }

  // Nombre de la tecla asignada a una acción (para los avisos del HUD).
  key(action) {
    return keyName(this.settings.binds?.[action]?.[0]);
  }

  // Mantiene la pantalla encendida durante la partida (móviles).
  keepAwake(on) {
    try {
      if (on && !this.wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then((l) => {
          this.wakeLock = l;
          l.addEventListener?.('release', () => (this.wakeLock = null));
        }).catch(() => {});
      } else if (!on && this.wakeLock) {
        this.wakeLock.release().catch(() => {});
        this.wakeLock = null;
      }
    } catch {
      /* API no disponible */
    }
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = innerWidth / innerHeight;
    this.viewCamera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(innerWidth, innerHeight);
    }
  }

  onLockChange(locked) {
    if (locked) {
      this.hadLock = true;
      this.keepAwake(true);
      this.setPaused(false);
    } else if (this.state === 'playing' && this.hadLock && !this.spectating && this.player.alive && !this.chatOpen && !this.uiOpen && !this.hud.mapOpen) {
      this.setPaused(true);
    }
  }

  setPaused(p) {
    this.paused = p;
    this.menu.showPause(p);
    if (p) {
      this.audio.setWind(0);
      this.audio.engine(false);
    }
  }

  resume() {
    this.audio.init();
    this.touch?.fullscreen();
    this.input.lock();
    this.setPaused(false);
  }

  // ------------------------------------------------------------ PARTIDA
  // Partida local contra bots.
  startMatch(modeId = this.settings.mode) {
    const mode = MODES[modeId] || MODES.solo;
    this.settings.mode = mode.id;
    // El creativo usa su propia isla (plana): hay que recargar para cambiar de isla
    if (!!mode.creative !== this.world.creative) {
      this.applySettings();
      const q = new URLSearchParams(location.search);
      if (mode.creative) q.set('creativo', '1');
      else q.delete('creativo');
      q.set('auto', mode.id);
      location.search = q.toString();
      return;
    }
    if (this.net) this.leaveOnline();
    this.prepareMatch(mode, { rng: random, stormRng: random, team: 0 });

    // Equipos (el jugador siempre en el equipo 0)
    const total = mode.noBots ? 1 : mode.id === 'duel' ? 2 : clamp(this.settings.players | 0, 2, 60);
    const nb = total - 1;
    const teams = [];
    if (mode.teams) {
      const mine = Math.floor(total / 2) - 1;
      for (let i = 0; i < nb; i++) teams.push(i < mine ? 0 : 1);
    } else {
      const k = mode.teamSize || 1;
      for (let i = 0; i < nb; i++) teams.push(i < k - 1 ? 0 : 1 + Math.floor((i - (k - 1)) / k));
    }
    this.botDiff = this.settings.difficulty;
    this.bots.reset(nb, teams, this.settings.difficulty);
    this.chars = [this.player, ...this.bots.list];
    this.beginMatch({});
    if (mode.creative) {
      const p = this.player;
      p.resetBody();
      p.mode = 'ground';
      p.pos.set(0, this.world.terrain.heightAt(0, 12) + 0.5, 12);
      p.yaw = 0;
      p.model.root.visible = this.camMode !== 'fp';
      this.creative.start();
    }
    this.touch?.fullscreen();
    this.input.lock();
  }

  // Partida online (info = mensaje m.start del servidor).
  startOnline(info) {
    if (info.seed !== this.seed) {
      // El mapa es único y fijo: un servidor con otra isla es de otra versión.
      this.hud.toast('El servidor usa otra versión del mapa: actualiza el servidor y el juego');
      this.netClient.send?.('leave_match');
      return;
    }
    if (this.world.creative) {
      // Desde la isla creativa: recargar con la isla principal
      const q = new URLSearchParams(location.search);
      q.delete('creativo');
      q.set('online', '1');
      location.search = q.toString();
      return;
    }
    if (this.net) this.leaveOnline();
    const base = MODES[info.mode] || MODES.solo;
    const mode = { ...base, scoreLimit: info.scoreLimit || base.scoreLimit, online: true };
    const net = new OnlineMatch(this, this.netClient, info);
    this.net = net;
    this.prepareMatch(mode, { rng: new RNG(info.lootSeed), stormRng: new RNG(info.stormSeed), team: net.myTeam, online: true });
    const me = info.ents.find((e) => e.id === info.you);
    this.player.name = me?.name || 'Tú';
    if (this.netClient.user?.outfit) this.player.setOutfit(this.netClient.user.outfit);
    // El anfitrión simula a los bots de la partida.
    const botEnts = net.isHost ? info.ents.filter((e) => e.bot) : [];
    this.botDiff = info.difficulty;
    this.bots.reset(botEnts.length, botEnts.map((e) => e.team), info.difficulty);
    this.bots.list.forEach((b, i) => {
      b.netId = botEnts[i].id;
      b.name = botEnts[i].name;
    });
    net.setup();
    this.chars = [this.player, ...this.bots.list, ...net.remotes];
    this.beginMatch({ busAng: info.bus.ang, busOff: info.bus.off });
    this.waiting = true;
    this.combat.modelKey = null;
    this.hud.toast('Conectando con el resto de jugadores…');
    this.loader.show(info, mode.name);
    net.ready();
  }

  onOnlineGo() {
    this.waiting = false;
    this.loader.hide();
    this.audio.busHorn?.();
    this.hud.toast(this.mode.noBus ? '¡A luchar!' : '¡Todos los jugadores están listos! El autobús sale en 10 segundos');
    this.input.lock();
  }

  // Fin de la partida online decidido por el servidor.
  onOnlineEnd(m) {
    this.loader.hide();
    if (this.state !== 'playing') return;
    if (m.winner === -2) {
      this.deathInfo = { type: 'net' };
      this.endMatch(false, 'Se ha perdido la conexión con el servidor');
      return;
    }
    const win = m.winner === this.player.team;
    this.endMatch(win, win ? '' : m.reason === 'abandono' ? 'El equipo rival ha abandonado' : '');
  }

  leaveOnline() {
    this.loader.hide();
    if (!this.net) return;
    const net = this.net;
    this.net = null;
    this.waiting = false;
    net.leave();
    this.chars = this.chars.filter((c) => !c.isRemote);
  }

  // Deja la isla lista para una partida nueva.
  prepareMatch(mode, o) {
    this.mode = mode;
    this.audio.init();
    this.applySettings();
    this.menu.hideAll();
    this.paused = false;
    this.infiniteMats = !!mode.infinite;
    this.infiniteAmmo = !!mode.creative;
    this.godMode = false;
    this.speedMult = 1;
    this.phase = 'match';
    this.lobbyT = null;
    this.lobbyJoin.length = 0;
    this.thanksQueue = [];
    this.clearPings();
    this.waypoint = null;
    this.creativePanel.hide();
    this.creative.reset();
    if (this.player.vehicle) this.vehicles.exit(this.player);
    this.player.reset();
    this.player.name = 'Tú';
    this.build.reset();
    this.harvest.reset();
    this.vehicles.reset();
    this.combat.reset();
    this.explosives.reset();
    this.effects.clear();
    this.pickups.clear();
    spawnFloorLoot(this, this.world.lootSpots, o.rng, !!o.online);
    this.containers.reset(o.rng);
    this.dummies.reset();
    this.player.team = o.team;
    this.weather.start(o.stormRng, mode);
    this.storm.reset(mode.arena ? 'duel' : mode.respawn ? 'rumble' : 'br', o.stormRng);
    this.storm.mesh.visible = true;
    this.arenaAngle = o.stormRng.float(0, Math.PI * 2);
    this.score = [0, 0];
    this.state = 'playing';
    this.spectating = null;
    this.deathInfo = null;
    this.respawnT = 0;
    this.matchTime = 0;
    this.stormTick = 0;
    this.matchAwarded = false;
    this.matchPlayers = 0;
    this.noises.length = 0;
    this.pathQueue.length = 0;
    this.hud.show(true);
    this.hud.resetFeed();
    this.hud.lastZone = null;
  }

  // Coloca a todos: en la isla de inicio (y luego el autobús), en el modo
  // creativo o (modos con reaparición) directamente en el aire.
  beginMatch(o) {
    const mode = this.mode;
    const p = this.player;
    this.busOpts = o;
    if (mode.creative) {
      this.storm.active = false;
      this.storm.mesh.visible = false;
    } else if (!mode.noBus) {
      if ((this.settings.skipLobby || mode.noBots) && !this.net) this.launchBus();
      else this.enterLobby();
    } else {
      this.bus.active = false;
      this.bus.model.visible = false;
      this.spawnAir(p, this.spawnPoint(p.team));
      if (mode.loadout) this.giveLoadout(p);
      for (const b of this.bots.list) {
        const [x, z] = this.spawnPoint(b.team);
        b.respawnAt(x, z, this.botLoadout(), mode.arena ? this.world.terrain.heightAt(x, z) + 30 : 140);
      }
    }
    if (this.infiniteMats) p.mats = { wood: 999, stone: 999, metal: 999 };
  }

  // ------------------------------------------------------ ISLA DE INICIO
  // Todos aparecen en la isla de inicio; cuando están todos los jugadores
  // empieza una cuenta atrás de 10 s y se sube al autobús de batalla.
  enterLobby() {
    const p = this.player;
    const L = this.world.lobby;
    this.phase = 'lobby';
    this.storm.active = false;
    this.storm.mesh.visible = false;
    this.bus.active = false;
    this.bus.model.visible = false;
    const sp = L.spawns[random.int(0, L.spawns.length - 1)];
    p.resetBody();
    p.mode = 'ground';
    p.pos.set(sp.x, this.world.terrain.heightAt(sp.x, sp.z) + 0.6, sp.z);
    p.yaw = sp.yaw;
    p.pitch = -0.1;
    p.model.root.visible = this.camMode !== 'fp';
    this.infiniteMats = true;
    this.infiniteAmmo = true;
    p.mats = { wood: 999, stone: 999, metal: 999 };
    // Armas de práctica en las mesas (en online, compartidas: quien llega
    // primero se la lleva, arbitrado por el servidor como el resto del botín)
    this.lobbyPickups = [];
    const types = ['ar', 'burst', 'heavyar', 'smg', 'shotgun', 'tactical', 'sniper', 'pistol', 'revolver', 'rocket', 'glauncher', 'minigun'];
    L.loot.forEach((s, i) => {
      const type = types[i % types.length];
      const it = makeWeapon(type, 3); // makeWeapon ajusta la rareza a las del arma
      this.lobbyPickups.push(this.pickups.spawn(it, new THREE.Vector3(s.x, s.y, s.z), null, this.net ? `lob${i}` : null));
    });
    // Los bots van llegando poco a poco (en online todos están ya)
    const bots = this.bots.list;
    bots.forEach((b, i) => {
      const s = L.spawns[(i + 1) % L.spawns.length];
      const a = random.float(0, Math.PI * 2);
      b.enterLobby(s.x + Math.cos(a) * random.float(0, 3), s.z + Math.sin(a) * random.float(0, 3), s.yaw);
      b.lobbyShown = !!this.net;
      if (!this.net) this.lobbyJoin.push({ b, t: random.float(0.4, Math.min(9, 2.5 + bots.length * 0.18)) });
    });
    this.lobbyJoin.sort((a, b) => a.t - b.t);
    this.lobbyElapsed = 0;
    this.lobbyCount = this.net ? this.chars.length : 1;
    this.lobbyT = null;
    this.lobbyEndAt = 0;
    this.hud.toast(`Bienvenido a la Isla de Inicio · ${this.key('build')} para construir · coge armas de las mesas para practicar`);
  }

  updateLobby(dt) {
    this.lobbyElapsed += dt;
    while (this.lobbyJoin.length && this.lobbyJoin[0].t <= this.lobbyElapsed) {
      const { b } = this.lobbyJoin.shift();
      b.lobbyShown = true;
      this.lobbyCount++;
    }
    if (this.net) this.lobbyCount = this.chars.length;
    if (this.lobbyT === null) {
      if (!this.lobbyJoin.length && !this.waiting) {
        this.lobbyT = 10;
        // en online, con el reloj real para que todos salgan a la vez
        this.lobbyEndAt = this.net ? performance.now() / 1000 + 10 : 0;
        this.audio.busHorn?.();
        this.hud.toast('¡Ya estáis todos! El autobús de batalla sale en 10 segundos');
      }
      return;
    }
    const before = Math.ceil(this.lobbyT);
    this.lobbyT = this.lobbyEndAt ? this.lobbyEndAt - performance.now() / 1000 : this.lobbyT - dt;
    const now = Math.ceil(this.lobbyT);
    if (now !== before && now >= 0) this.audio.beep(now === 0);
    if (this.lobbyT <= 0) this.launchBus();
  }

  // Sube a todos al autobús (desde la isla de inicio o directamente).
  launchBus() {
    const p = this.player;
    const fromLobby = this.phase === 'lobby';
    this.phase = 'match';
    if (fromLobby) {
      // Todo lo de la isla de inicio se reinicia
      for (const pk of this.lobbyPickups || []) this.pickups.remove(pk);
      for (const pk of this.pickups.items.slice()) if (Math.hypot(pk.pos.x, pk.pos.z) > ISLAND_RADIUS + 120) this.pickups.remove(pk);
      this.lobbyPickups = [];
      this.build.reset();
      this.combat.reset();
      this.explosives.reset();
      p.inventory = [PICKAXE, null, null, null, null, null];
      p.selected = 0;
      p.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 };
      p.mats = { wood: 0, stone: 0, metal: 0 };
      p.health = 100;
      p.shield = 0;
      p.flying = false;
      p.regen = null;
      p.setHeld(PICKAXE);
      this.hud.setProgress(null);
      this.infiniteMats = !!this.mode.infinite;
      this.infiniteAmmo = false;
      for (const b of this.bots.list) b.reset(this.botDiff || 'normal');
      if (this.infiniteMats) p.mats = { wood: 999, stone: 999, metal: 999 };
    }
    this.storm.active = true;
    this.storm.mesh.visible = true;
    const o = this.busOpts || {};
    this.bus.launch(o.busAng, o.busOff);
    p.mode = 'bus';
    p.vel.set(0, 0, 0);
    p.yaw = Math.atan2(-this.bus.dir.x, -this.bus.dir.z) + 0.6;
    p.pitch = -0.35;
    this.matchTime = 0;
    this.audio.busHorn?.();
    // Algunos bots dan las gracias al conductor
    this.thanksQueue = this.bots.list.filter(() => random.chance(0.25)).map((b) => ({ b, t: random.float(1, 9) }));
    this.thanksT = 0;
  }

  thankDriver() {
    if (this.bus.thanked) return;
    this.bus.thanked = true;
    this.audio.thanks();
    this.hud.killFeed('<b class="me">Tú</b> ha dado las gracias al conductor del autobús 🚌', true);
    this.hud.toast('¡Gracias, conductor!');
  }

  spawnAir(c, [x, z]) {
    c.resetBody();
    const h = this.mode.arena ? this.world.terrain.heightAt(x, z) + 30 : 140;
    c.pos.set(x, h, z);
    c.vel.set(0, -10, 0);
    c.mode = 'freefall';
    c.model.root.visible = !c.isPlayer || this.camMode !== 'fp';
    c.yaw = Math.atan2(-(this.storm.center.x - x), -(this.storm.center.y - z));
  }

  // Punto de aparición inicial: cada equipo en un lado de la zona.
  spawnPoint(team) {
    const st = this.storm;
    if (!this.mode.arena && !this.mode.teams) return this.respawnPoint(team);
    const r = st.radius * (this.mode.arena ? 0.65 : 0.55);
    for (let k = 0; k < 16; k++) {
      const a = this.arenaAngle + team * Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.18 + (this.mode.arena ? 0 : random.float(-0.25, 0.25));
      const rr = this.mode.arena ? r : r + random.float(-40, 40);
      const x = st.center.x + Math.cos(a) * rr, z = st.center.y + Math.sin(a) * rr;
      if (this.world.terrain.heightAt(x, z) > 1.5) return [x, z];
    }
    return [st.center.x, st.center.y];
  }

  // Equipo inicial de los modos con reaparición (1v1, duelo por equipos).
  giveLoadout(p, keep = false) {
    if (!keep || !p.inventory.slice(1).some(Boolean)) {
      p.inventory = [PICKAXE, makeWeapon('ar', 3), makeWeapon('shotgun', 3), makeWeapon('smg', 2),
        { kind: 'consumable', type: 'shieldpot', count: 2 }, { kind: 'consumable', type: 'medkit', count: 1 }];
      p.selected = 1;
    }
    p.ammo = { light: 300, medium: 300, heavy: 18, shells: 60, rockets: 6 };
    p.shield = this.mode.arena ? 100 : 50;
    this.combat.modelKey = null;
  }

  botLoadout() {
    return {
      weapons: [makeWeapon('ar', random.int(1, 3)), makeWeapon('shotgun', random.int(1, 3)), makeWeapon(random.pick(['smg', 'pistol']), random.int(0, 2))],
      heals: { bandage: 5, medkit: 1, smallshield: 2, shieldpot: 1 },
      nades: { grenade: random.int(0, 2), molotov: random.int(0, 1) },
    };
  }

  quitToMenu() {
    this.inventory?.hide();
    this.weather.reset();
    const wasOnline = !!this.net || this.mode.online;
    if (this.mode.creative) this.creative.stop();
    // Abandonar a mitad de partida también da XP (sin bonus de puesto)
    const abandon = this.state === 'playing' && !this.matchAwarded && this.matchTime > 30 ? this.awardMatch(false, null) : null;
    this.leaveOnline();
    this.state = 'menu';
    this.phase = 'menu';
    this.lobbyJoin.length = 0;
    this.creativePanel.hide();
    this.combat.reset();
    this.clearPings();
    this.paused = false;
    this.waiting = false;
    this.spectating = null;
    if (this.player.vehicle) this.vehicles.exit(this.player);
    this.endMatchUI();
    this.hud.show(false);
    this.storm.mesh.visible = false;
    this.storm.active = false;
    this.bus.active = false;
    this.bus.model.visible = false;
    this.bots.reset(0, [], 'normal');
    this.explosives.reset();
    this.chars = [this.player];
    this.player.model.root.visible = false;
    this.menu.showMain(wasOnline && this.netClient.authed ? 'online' : null);
    if (abandon) this.menu.online.toast(`+${abandon.total} XP del pase · Nivel ${abandon.level}`);
  }

  // XP del pase de batalla al terminar una partida (no en práctica ni creativo).
  awardMatch(win, place) {
    if (this.matchAwarded || this.mode.noBots) return null;
    this.matchAwarded = true;
    const p = this.player;
    const res = this.progress.matchEnd({
      kills: p.stats.kills, damage: p.stats.damage, chests: p.stats.chests, built: p.stats.built, edits: p.stats.edits,
      heads: p.stats.heads, time: this.matchTime, place, win, online: !!this.net, respawn: !!this.mode.respawn,
      distance: Math.round(p.stats.distance || 0), emotes: p.stats.emotes || 0, mode: this.mode.id,
    });
    return res;
  }

  // Avisos de logros y recompensas conseguidos fuera de la pantalla final.
  announceRewards(r) {
    if (!r) return;
    for (const a of r.achievements || []) this.hud.toast(`🏆 Logro: ${a.name} (+${a.xp} XP)`);
    if (r.rewards?.length) this.menu.online.toast(`🎁 Nuevas recompensas del pase: ${r.rewards.length}`);
  }

  characters() {
    return this.chars;
  }

  teamMembers(team) {
    return this.chars.filter((c) => c.team === team);
  }

  // Líder de un equipo: un jugador humano en pie; si no, el primer bot.
  teamLeader(team) {
    if ((this.mode.teamSize || 1) === 1 || this.mode.teams) return null; // en el duelo cada uno va a su aire
    for (const c of this.chars) if (c.team === team && !c.isBot && !c.remoteBot && c.alive && !c.knocked) return c;
    for (const b of this.bots.list) if (b.team === team && b.alive && !b.knocked) return b;
    return null;
  }

  // Los bots de un equipo comparten lo que ven.
  shareIntel(from, enemy) {
    if ((this.mode.teamSize || 1) === 1 && !this.mode.teams) return;
    for (const b of this.bots.list) {
      if (b === from || b.team !== from.team || !b.alive) continue;
      if (b.pos.distanceTo(from.pos) > 160) continue;
      const m = b.memory.get(enemy);
      if (!m || this.time - m.time > 1) b.remember(enemy, false);
    }
  }

  canKnock(c) {
    if (this.mode.respawn || (this.mode.teamSize || 1) < 2) return false;
    return this.chars.some((o) => o !== c && o.team === c.team && o.alive && !o.knocked);
  }

  noise(pos, r, src) {
    this.noises.push({ pos: pos.clone(), r, src, t: this.time });
  }

  requestPath(bot, goal) {
    if (bot.pathPending) return;
    bot.pathPending = true;
    this.pathQueue.push({ bot, goal: goal.clone() });
  }

  processPaths() {
    let budget = this.pathQueue.length > 8 ? 3 : 2;
    while (budget-- > 0 && this.pathQueue.length) {
      const { bot, goal } = this.pathQueue.shift();
      if (!bot.alive) {
        bot.pathPending = false;
        continue;
      }
      // Los trayectos largos se dividen en tramos de ~140 m
      let tx = goal.x, tz = goal.z;
      const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 150) {
        tx = bot.pos.x + (dx / d) * 140;
        tz = bot.pos.z + (dz / d) * 140;
      }
      bot.setPath(this.nav.findPath(bot.pos.x, bot.pos.z, tx, tz), goal);
    }
  }

  // ------------------------------------------------------- EVENTOS DE COMBATE
  name(c) {
    return c.isPlayer ? 'Tú' : c.name;
  }

  teamTag(c) {
    if ((this.mode.teamSize || 1) === 1 && !this.mode.teams) return c.isPlayer ? 'me' : '';
    return c.team === this.player.team ? 'ally' : 'enemy';
  }

  onKnock(victim, attacker) {
    if (this.net?.isLocal(victim)) this.net.sendDown(victim, attacker);
    const a = attacker ? `<b class="${this.teamTag(attacker)}">${this.name(attacker)}</b> derribó a ` : '';
    this.hud.killFeed(`${a}<b class="${this.teamTag(victim)}">${this.name(victim)}</b>${attacker ? '' : ' cayó derribado'}`, attacker?.isPlayer);
    if (attacker?.isPlayer) {
      this.hud.toast(`Has derribado a ${victim.name}`);
      this.audio.elim();
    }
    if (victim.isPlayer) {
      this.build.setActive(false);
      this.combat.cancelUse();
      this.hud.toast('¡Te han derribado! Arrástrate hacia tus compañeros');
    }
    this.checkTeamWipe(victim.team);
  }

  onRevive(mate, by) {
    this.hud.killFeed(`<b class="${this.teamTag(by)}">${this.name(by)}</b> reanimó a <b class="${this.teamTag(mate)}">${this.name(mate)}</b>`, by.isPlayer);
    if (mate.isPlayer) this.hud.toast(`${by.name} te ha reanimado`);
  }

  onElimination(victim, killer, type) {
    if (this.net?.isLocal(victim)) this.net.sendElim(victim, killer, type);
    // Los bots a veces celebran la eliminación con un gesto
    if (killer?.isBot && killer !== victim && Math.random() < 0.3) {
      const id = ['baile', 'saludo', 'victoria', 'aplauso'][Math.floor(Math.random() * 4)];
      setTimeout(() => {
        if (killer.alive && killer.startEmote(id)) this.net?.sendEmote(killer, id);
      }, 700);
    }
    const how = { storm: 'la tormenta', fall: 'una caída', quit: 'abandono', explosion: 'una explosión', fire: 'el fuego' }[type] || null;
    const v = `<b class="${this.teamTag(victim)}">${this.name(victim)}</b>`;
    let text;
    if (killer && killer !== victim) text = `<b class="${this.teamTag(killer)}">${this.name(killer)}</b> eliminó a ${v}`;
    else if (how) text = `${v} fue eliminado por ${how}`;
    else text = `${v} fue eliminado`;
    this.hud.killFeed(text, killer?.isPlayer);
    if (killer?.isPlayer && victim !== this.player) {
      this.player.stats.kills++;
      this.audio.elim();
      this.hud.toast(`Has eliminado a ${victim.name}${this.mode.respawn ? '' : ` · Quedan ${this.aliveCount}`}`);
    }
    if (this.mode.respawn) {
      if (!this.net) {
        if (killer && killer.team !== victim.team) this.score[killer.team]++;
        else if (this.mode.arena) this.score[1 - victim.team]++;
      }
      if (victim.isBot) victim.respawnT = this.mode.arena ? 3 : 5;
    }
    if (this.spectating === victim) this.nextSpectate();
    this.checkTeamWipe(victim.team);
    this.checkEnd();
  }

  // Si nadie del equipo sigue en pie, los derribados quedan eliminados
  // (en online cada ordenador se encarga de los personajes que controla).
  checkTeamWipe(team) {
    const members = this.teamMembers(team);
    if (members.some((c) => c.alive && !c.knocked)) return;
    for (const c of members) if (c.alive && c.knocked && !c.isRemote) c.eliminate('bleed', c.knocker);
  }

  get aliveCount() {
    let n = 0;
    for (const c of this.chars) if (c.alive) n++;
    return n;
  }

  teamsAlive() {
    const s = new Set();
    for (const c of this.chars) if (c.alive) s.add(c.team);
    return s;
  }

  checkEnd() {
    if (this.state !== 'playing' || this.mode.noBots) return;
    if (this.net) {
      // La victoria la decide el servidor; aquí sólo la derrota de mi equipo.
      if (!this.mode.respawn && !this.teamsAlive().has(this.player.team)) this.endMatch(false);
      return;
    }
    if (this.mode.respawn) {
      const lim = this.mode.scoreLimit;
      if (this.score[0] >= lim) this.endMatch(this.player.team === 0);
      else if (this.score[1] >= lim) this.endMatch(this.player.team === 1);
      return;
    }
    const alive = this.teamsAlive();
    if (!alive.has(this.player.team)) this.endMatch(false);
    else if (alive.size === 1) this.endMatch(true);
  }

  onPlayerEliminated(type, killer) {
    const p = this.player;
    if (p.vehicle) this.vehicles.exit(p);
    p.model.root.visible = false;
    this.build.setActive(false);
    this.hud.setScope(false);
    this.deathInfo = { type, killer };
    if (this.mode.respawn) {
      this.respawnT = this.mode.arena ? 3 : 5;
      this.hud.toast(killer ? `${killer.name} te ha eliminado · Reapareces en ${this.respawnT} s` : `Reapareces en ${this.respawnT} s`);
      return;
    }
    // Soltar el inventario
    const drops = [];
    for (const it of p.inventory.slice(1)) if (it && !(it.count <= 0)) drops.push({ ...it });
    for (const a in p.ammo) if (p.ammo[a] > 0) drops.push({ kind: 'ammo', ammo: a, count: p.ammo[a] });
    if (!this.infiniteMats) for (const m in p.mats) if (p.mats[m] > 0) drops.push({ kind: 'material', mat: m, count: p.mats[m] });
    this.pickups.burst(drops.slice(0, 10), p.pos.clone().setY(p.pos.y + 0.8));
    if (this.mode.noBots) {
      this.endMatch(false);
      return;
    }
    const mate = this.teamMembers(p.team).find((c) => c.alive && c !== p);
    if (mate) {
      this.spectating = mate;
      this.input.unlock();
      this.hud.toast(`Has sido eliminado · Espectando a ${mate.name}`);
    }
  }

  nextSpectate() {
    const mates = this.teamMembers(this.player.team).filter((c) => c.alive && c !== this.player);
    if (!mates.length) {
      this.spectating = null;
      return;
    }
    const i = mates.indexOf(this.spectating);
    this.spectating = mates[(i + 1) % mates.length];
  }

  // Punto de reaparición: cerca de compañeros vivos y lejos de los enemigos.
  respawnPoint(team) {
    if (this.mode.respawn) {
      const enemies = this.chars.filter((c) => c.team !== team && c.alive && c.mode !== 'bus');
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < 8; i++) {
        const pt = this.randomPointNear(team);
        let dmin = 400;
        for (const e of enemies) dmin = Math.min(dmin, Math.hypot(e.pos.x - pt[0], e.pos.z - pt[1]));
        const score = Math.min(dmin, this.mode.arena ? 60 : 90) + random.float(0, 10);
        if (score > bestScore) {
          bestScore = score;
          best = pt;
        }
      }
      return best;
    }
    return this.randomPointNear(team);
  }

  randomPointNear(team) {
    const mates = this.mode.arena ? [] : this.chars.filter((c) => c.team === team && c.alive && c.mode === 'ground');
    const st = this.storm;
    for (let i = 0; i < 30; i++) {
      let x, z;
      if (mates.length && random.chance(0.7)) {
        const m = random.pick(mates);
        const a = random.float(0, Math.PI * 2);
        x = m.pos.x + Math.cos(a) * random.float(30, 70);
        z = m.pos.z + Math.sin(a) * random.float(30, 70);
      } else {
        const a = random.float(0, Math.PI * 2);
        const r = Math.sqrt(random.next()) * Math.min(st.radius, ISLAND_RADIUS) * (this.mode.arena ? 0.85 : 0.8);
        x = st.center.x + Math.cos(a) * r;
        z = st.center.y + Math.sin(a) * r;
      }
      if (this.world.terrain.heightAt(x, z) > 1.5 && !st.isOutside(x, z)) return [x, z];
    }
    return [st.center.x, st.center.y];
  }

  updateRespawns(dt) {
    if (!this.mode.respawn || this.state !== 'playing') return;
    for (const b of this.bots.list) {
      if (b.alive || b.respawnT <= 0) continue;
      b.respawnT -= dt;
      if (b.respawnT <= 0) {
        const [x, z] = this.respawnPoint(b.team);
        const weapons = b.weapons.some(Boolean) ? b.weapons : this.botLoadout().weapons;
        b.respawnAt(x, z, { weapons, heals: { bandage: 0, medkit: 0, smallshield: 1, shieldpot: this.mode.arena ? 1 : 0 } }, this.mode.arena ? this.world.terrain.heightAt(x, z) + 30 : 140);
        if (this.mode.arena) b.shield = 100;
      }
    }
    const p = this.player;
    if (!p.alive && this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.spawnAir(p, this.respawnPoint(p.team));
        if (this.mode.loadout) this.giveLoadout(p, true);
        this.input.lock();
      }
    }
  }

  endMatch(win, customCause = '') {
    this.inventory?.hide();
    if (this.state !== 'playing') return;
    this.state = win ? 'won' : 'dead';
    this.spectating = null;
    this.endMatchUI();
    const place = win ? 1 : this.teamsAlive().size + 1;
    if (win) this.audio.victory();
    let cause = '';
    if (!win) {
      const d = this.deathInfo;
      if (this.mode.arena) cause = `Has perdido el 1v1 (${this.score[this.player.team]}–${this.score[1 - this.player.team]})`;
      else if (this.mode.respawn) cause = 'Tu equipo ha perdido el duelo';
      else if (d?.type === 'storm') cause = 'La tormenta te ha eliminado';
      else if (d?.type === 'fall') cause = 'Has muerto por la caída';
      else if (d?.killer) cause = `${d.killer.name} te ha eliminado`;
      else cause = 'Tu equipo ha sido eliminado';
      if (!this.mode.noBots && !this.mode.respawn) cause += ` · Puesto #${place}`;
      if (customCause) cause = customCause;
    }
    const xp = this.awardMatch(win, this.mode.respawn ? null : place);
    this.menu.showEnd(win, cause, this.statsHTML(), !!this.mode.online, xp);
  }

  statsHTML() {
    const p = this.player;
    const t = Math.floor(this.matchTime);
    const extra = this.mode.respawn
      ? `<div><b>${this.score[p.team]}–${this.score[1 - p.team]}</b><span>Marcador</span></div>`
      : `<div><b>${p.stats.chests}</b><span>Cofres abiertos</span></div>`;
    return `
      <div><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><span>Duración</span></div>
      <div><b>${p.stats.kills}</b><span>Eliminaciones</span></div>
      <div><b>${Math.round(p.stats.damage)}</b><span>Daño causado</span></div>
      ${extra}
      <div><b>${p.stats.built}</b><span>Piezas construidas</span></div>
      <div><b>${Math.round(p.stats.distance)} m</b><span>Recorrido</span></div>`;
  }

  endMatchUI() {
    this.input.unlock();
    this.keepAwake(false);
    this.hud.setScope(false);
    this.hud.toggleMap(false);
    this.build.setActive(false);
    this.audio.setWind(0);
    this.audio.setStorm(0);
    this.audio.setChest(0, 0);
    this.audio.engine(false);
  }

  onJumpFromBus() {
    if (!this.settings.showHints) return;
    this.hud.toast(this.touch ? '¡Has saltado! Mira hacia abajo y empuja el joystick para caer más rápido' : `¡Has saltado! Mira hacia abajo y pulsa ${this.key('forward')} para caer más rápido`);
  }

  onLanded() {
    if (!this.settings.showHints) return;
    const build = this.touch ? 'el botón de ladrillos para construir' : `${this.key('build')} para construir`;
    this.hud.toast(this.mode.build ? `¡Has aterrizado! Busca cofres y armas · ${build}` : '¡Has aterrizado! Busca cofres y armas');
  }

  // ---------------------------------------------------------- RAYCAST
  // Rayo contra el mundo, el terreno, las dianas y los personajes.
  // ignore: personaje que dispara (no se impacta a sí mismo).
  raycast(origin, dir, maxDist, skip = 0, ignore = null) {
    const o = tmpV.copy(origin).addScaledVector(dir, skip);
    let best = null;
    const maxT = maxDist - skip;
    if (maxT <= 0) return null;
    const hb = this.world.collision.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, maxT);
    if (hb) best = { t: hb.t, kind: 'world', box: hb.box, normal: new THREE.Vector3(hb.nx, hb.ny, hb.nz) };
    const ht = this.world.terrain.raycast(o, dir, best ? best.t : maxT);
    if (ht && (!best || ht.t < best.t)) best = { t: ht.t, kind: 'terrain', normal: null };
    const hd = this.dummies.raycast(o, dir, best ? best.t : maxT);
    if (hd) best = { t: hd.t, kind: 'dummy', dummy: hd.dummy, head: hd.head, normal: dir.clone().negate() };
    const hc = this.bots.raycast(o, dir, best ? best.t : maxT, ignore);
    if (hc) best = { t: hc.t, kind: 'character', entity: hc.entity, head: hc.head, normal: dir.clone().negate() };
    if (this.net) {
      const hr = this.net.raycast(o, dir, best ? best.t : maxT, ignore);
      if (hr) best = { t: hr.t, kind: 'character', entity: hr.entity, head: hr.head, normal: dir.clone().negate() };
    }
    if (ignore !== this.player) {
      const hp = this.player.raycastHit(o, dir, best ? best.t : maxT);
      if (hp) best = { t: hp.t, kind: 'character', entity: this.player, head: hp.head, normal: dir.clone().negate() };
    }
    if (!best) return null;
    best.point = o.clone().addScaledVector(dir, best.t);
    if (best.kind === 'terrain') best.normal = this.world.terrain.normalAt(best.point.x, best.point.z, new THREE.Vector3());
    best.t += skip;
    return best;
  }

  // ---------------------------------------------------------- LOOP
  loop = (ts) => {
    requestAnimationFrame(this.loop);
    // Límite de FPS (Opciones)
    const lim = this.settings.fpsLimit | 0;
    if (lim > 0 && ts - this.lastFrame < 1000 / lim - 1) return;
    this.lastFrame = ts;
    this.timer.update(ts);
    let raw = this.timer.getDelta();
    // Límite de 30 FPS (ahorro de batería): se salta un fotograma de cada dos
    if (this.settings.fpsCap === 30) {
      this.capAcc = (this.capAcc || 0) + raw;
      if (this.capAcc < 1 / 32) return;
      raw = this.capAcc;
      this.capAcc = 0;
    }
    this.hud.fps(raw);
    this.adaptResolution(raw);
    this.step(Math.min(0.05, raw));
    this.render();
  };

  step(dt) {
    const input = this.input;
    this.gamepad.update(dt);
    this.time += dt;
    const t = this.time;

    this.world.water.material.uniforms.time.value = t;
    this.sky.material.uniforms.time.value = t;
    if (this.state === 'menu') {
      this.updateMenuCamera(t);
      this.world.clouds.rotation.y = t * 0.003;
      this.containers.update(dt, t);
      this.touch?.update();
      input.endFrame();
      return;
    }
    // En online la partida no se detiene al pausar.
    if (this.paused && !this.net) {
      this.touch?.update();
      input.endFrame();
      return;
    }
    if (this.waiting && this.phase !== 'lobby') {
      this.net?.update(dt);
      this.updateCamera(dt);
      this.updateBanner();
      this.hud.update(dt);
      this.touch?.update();
      input.endFrame();
      return;
    }

    const p = this.player;
    if (this.infiniteMats) p.mats.wood = p.mats.stone = p.mats.metal = 999;
    if (this.phase === 'lobby' && this.state === 'playing') this.updateLobby(dt);
    if (this.thanksQueue?.length && p.mode !== 'lobby') {
      this.thanksT += dt;
      while (this.thanksQueue.length && this.thanksQueue[0].t <= this.thanksT) {
        const { b } = this.thanksQueue.shift();
        if (b.mode === 'bus') this.hud.killFeed(`<b>${b.name}</b> ha dado las gracias al conductor del autobús 🚌`);
      }
    }
    if (this.state === 'playing' && p.alive) {
      if (this.phase !== 'lobby') this.matchTime += dt;
      if (!this.paused) this.handleGlobalKeys(input);
      const zoom = this.camera.fov / this.baseFov;
      const st = this.settings;
      // Sensibilidad según el contexto (apuntando, con mira, construyendo, editando)
      let mult = 1;
      if (this.build.editing) mult = st.editSensitivity ?? 1;
      else if (this.build.active) mult = st.buildSensitivity ?? 1;
      else if (this.combat.adsBlend > 0.5) mult = this.hud.scoped ? st.scopeSensitivity ?? 0.6 : st.adsSensitivity ?? 0.8;
      if (this.creativePanel.open) mult = 0;
      const sens = 0.0022 * zoom * st.sensitivity * mult;
      const tsens = 0.0048 * zoom * (st.touchSens || 1) * mult;
      const inv = st.invertY ? -1 : 1;
      p.yaw -= input.mouseDX * sens + input.lookDX * tsens;
      p.pitch -= (input.mouseDY * sens + input.lookDY * tsens) * inv;
      p.pitch = clamp(p.pitch, -1.5, 1.5);
      this.vehicles.update(dt, input);
      p.update(dt, input);
      this.updateCamera(dt);
      this.build.update(dt, input);
      this.creative.update(dt, input);
      this.combat.update(dt, input);
      this.updateInteraction(input, dt);
      this.updateStorm(dt);
    } else {
      if (this.state === 'playing') {
        this.matchTime += dt;
        if (input.hit('map')) this.hud.toggleMap();
      }
      this.combat.update(dt, input);
      this.vehicles.update(dt, null);
      this.updateCamera(dt);
    }
    this.updateBanner();

    this.processPaths();
    this.bots.update(dt);
    this.net?.update(dt);
    this.updateRespawns(dt);
    this.harvest.update(dt);
    this.bus.update(dt, t);
    this.storm.update(dt);
    this.pickups.update(dt, t);
    this.containers.update(dt, t);
    this.dummies.update(dt);
    this.explosives.update(dt);
    this.effects.update(dt);
    this.grass.update(dt, this.camera.position);
    this.trails.update(dt);
    if (this.state === 'playing') this.weather.update(dt);
    this.inventory.update();
    this.a11y.update(dt);
    this.updatePings(dt);
    this.updateAudio();
    if (this.noises.length && t - this.noises[0].t > 1.5) this.noises = this.noises.filter((n) => t - n.t < 1.5);
    this.world.clouds.rotation.y = t * 0.003;
    if (this.state === 'playing') this.hud.update(dt);
    this.touch?.update();
    input.endFrame();
  }

  handleGlobalKeys(input) {
    const p = this.player;
    if (input.hit('map')) this.hud.toggleMap();
    if (input.hit('inventory')) this.inventory.toggle();
    if (input.hit('emote') && !p.emote && !this.build.active) {
      const id = p.outfit?.emote || 'baile';
      if (p.startEmote(id)) {
        p.stats.emotes = (p.stats.emotes || 0) + 1;
        this.net?.sendEmote(p, id);
      }
    } else if (p.emote && (input.held('forward') || input.held('back') || input.held('left') || input.held('right') || input.hit('jump') || input.held('fire') || input.held('ads') || input.axis.active || this.build.active)) {
      p.stopEmote();
      this.net?.sendEmote(p, '');
    }
    if (input.hit('camera')) {
      this.camMode = this.camMode === 'fp' ? 'tp' : 'fp';
      this.hud.toast(this.camMode === 'fp' ? 'Cámara: primera persona' : 'Cámara: tercera persona');
    }
    if (input.hit('catalog')) {
      if (p.mode === 'bus') this.thankDriver();
      else if (this.mode.creative) this.creativePanel.toggle();
    }
    if (input.hit('ping')) this.pingAim();
    if (p.mode !== 'ground' || p.vehicle || p.knocked || this.build.editing) return;
    if (this.build.active) {
      for (let i = 4; i < 6; i++) {
        if (input.hit('slot' + (i + 1))) {
          this.build.setActive(false);
          this.combat.select(i);
        }
      }
      return;
    }
    for (let i = 0; i < 6; i++) if (input.hit('slot' + (i + 1))) this.combat.select(i);
    if (input.wheel) this.combat.cycle(input.wheel > 0 ? 1 : -1);
    if (input.hit('drop')) this.dropSelected();
  }

  // ------------------------------------------------------------ MARCADORES
  // Marca el punto al que apuntas (lo ven tus compañeros en partidas online).
  pingAim() {
    const hit = this.raycast(this.aimOrigin, this.aimDir, 600, this.aimSkip, this.player);
    if (!hit) return;
    this.addPing(hit.point, 'Tú', true);
    this.net?.sendPing(hit.point);
  }

  addPing(pos, who, mine) {
    while (this.pings.length >= 4) this.removePing(this.pings[0]);
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 40, 8, 1, true).translate(0, 20, 0),
      new THREE.MeshBasicMaterial({ color: mine ? 0xffd34d : 0x3fa9ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.9, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: mine ? 0xffd34d : 0x3fa9ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.position.y = 0.05;
    g.add(beam, ring);
    g.position.copy(pos);
    this.scene.add(g);
    this.pings.push({ pos: pos.clone(), mesh: g, t: 25, who, mine });
    this.audio.ping();
    if (!mine) this.hud.toast(`${who} ha marcado una ubicación`);
  }

  removePing(pg) {
    this.scene.remove(pg.mesh);
    const i = this.pings.indexOf(pg);
    if (i >= 0) this.pings.splice(i, 1);
  }

  clearPings() {
    for (const pg of this.pings.slice()) this.removePing(pg);
  }

  updatePings(dt) {
    for (const pg of this.pings.slice()) {
      pg.t -= dt;
      pg.mesh.children[1].scale.setScalar(1 + Math.sin(this.time * 4) * 0.15);
      if (pg.t <= 0 || pg.pos.distanceTo(this.player.pos) < 3) this.removePing(pg);
    }
  }

  dropSelected() {
    this.dropSlot(this.player.selected);
  }

  // Suelta el objeto de un hueco (o sólo `count` unidades de una pila).
  dropSlot(i, count = null) {
    const p = this.player;
    const item = p.inventory[i];
    if (i === 0 || !item) return;
    if (stackDef(item) && item.count <= 0) return; // detonador del C4 sin cargas
    let out = item;
    if (stackDef(item) && count !== null && count < item.count) {
      if (count <= 0) return;
      out = { ...item, count };
      item.count -= count;
    } else p.inventory[i] = null;
    if (i === p.selected) {
      this.combat.reloading = false;
      this.combat.cancelUse();
    }
    this.tossPickup(out);
    this.combat.modelKey = null;
  }

  // Suelta munición o materiales (inventario con cantidades).
  dropResource(kind, key, n) {
    const p = this.player;
    const store = kind === 'ammo' ? p.ammo : p.mats;
    n = Math.min(n, store[key] || 0);
    if (n <= 0) return;
    if (!(kind === 'ammo' ? this.infiniteAmmo : this.infiniteMats)) store[key] -= n;
    this.tossPickup(kind === 'ammo' ? { kind: 'ammo', ammo: key, count: n } : { kind: 'material', mat: key, count: n });
  }

  tossPickup(item) {
    const p = this.player;
    const f = tmpF.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const pos = p.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
    const pk = this.pickups.spawn(item, pos, f.clone().multiplyScalar(3).setY(3));
    pk.noAuto = true;
    pk.dropAt = this.time; // la munición y los materiales tirados no se recogen solos al momento
    return pk;
  }

  // ¿Hay un hueco libre (o una pila sin llenar) para el objeto?
  hasFreeSlot(item, strict = false) {
    const p = this.player;
    for (let i = 1; i < 6; i++) {
      const s = p.inventory[i];
      if (!s) return true;
      if (!strict && item.kind === 'consumable' && s.kind === 'consumable' && s.type === item.type && s.count < CONSUMABLES[item.type].max) return true;
    }
    return false;
  }

  // ¿Cabe el objeto en el inventario (directamente o intercambiándolo)?
  canTake(item) {
    const p = this.player;
    if (item.kind === 'ammo' || item.kind === 'material') return true;
    for (let i = 1; i < 6; i++) {
      const s = p.inventory[i];
      if (!s) return true;
      const def = stackDef(item);
      if (def && s.kind === item.kind && s.type === item.type && s.count < def.max) return true;
    }
    return p.selected > 0 && !!p.inventory[p.selected];
  }

  // En online el servidor confirma antes quién se queda el objeto.
  tryPickup(pk) {
    if (this.net && pk.nid) {
      if (!this.canTake(pk.item)) this.hud.toast('Inventario lleno: selecciona un objeto para intercambiarlo');
      else this.net.requestPickup(pk);
      return;
    }
    this.applyPickup(pk);
  }

  applyPickup(pk) {
    const p = this.player;
    const item = pk.item;
    if (item.kind === 'ammo' || item.kind === 'material') {
      p.addItem(item);
      this.pickups.remove(pk);
      this.audio.pickup();
      const what = item.kind === 'material' ? MATERIALS[item.mat].name : AMMO[item.ammo].name;
      this.hud.toast(`+${item.count} ${what}`);
      return;
    }
    if (p.addItem(item)) {
      this.pickups.remove(pk);
      this.audio.pickup();
      this.combat.modelKey = null;
      return;
    }
    if (p.selected > 0 && p.inventory[p.selected]) {
      const cur = p.inventory[p.selected];
      p.inventory[p.selected] = { ...item };
      this.pickups.remove(pk);
      this.pickups.spawn(cur, pk.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, 2.5, 0)).noAuto = true;
      this.combat.reloading = false;
      this.combat.cancelUse();
      this.combat.modelKey = null;
      this.combat.swapT = 0.3;
      this.audio.pickup();
    } else {
      this.hud.toast('Inventario lleno: selecciona un objeto para intercambiarlo');
      // en online ya era nuestro: se suelta para no perderlo
      if (this.net) {
        this.pickups.remove(pk);
        this.pickups.spawn(item, p.pos.clone().setY(p.pos.y + 1), new THREE.Vector3(0, 3, 0));
      }
    }
  }

  updateInteraction(input, dt) {
    const p = this.player;
    if (p.mode !== 'ground' || !p.alive || p.knocked) {
      this.hud.setPrompt(null);
      return;
    }
    const E = `<kbd>${this.key('interact')}</kbd>`;
    if (p.vehicle) {
      this.hud.setPrompt(`${E} Salir del coche`);
      if (input.hit('interact')) this.vehicles.exit(p);
      return;
    }
    if (this.build.editing) {
      const pc = this.build.editing.piece;
      const presets = pc.type === 'wall' ? ' · 1 puerta · 2 ventana · 3 arco · 4 arco grande · 5 media pared · 6 valla · 7 puerta lateral' : pc.type === 'ramp' ? ' · elige 2 casillas de un lado para girarla' : '';
      this.hud.setPrompt(`EDITANDO · clic: quitar/poner casillas (arrastra) · ${keyName(this.settings.binds.editReset[0])}: restablecer · <kbd>${this.key('edit')}</kbd> confirmar${presets}`);
      return;
    }
    // Reanimar a un compañero derribado (mantener E)
    const downed = this.chars.find((c) => c !== p && c.team === p.team && c.alive && c.knocked && c.pos.distanceTo(p.pos) < 2.2);
    if (downed) {
      if (input.held('interact')) {
        downed.reviveT += dt;
        this.hud.setProgress(downed.reviveT / 5, `Reanimando a ${downed.name}`);
        if (downed.reviveT >= 5) {
          downed.revive();
          this.onRevive(downed, p);
          this.hud.setProgress(null);
        }
      } else if (!this.combat.using) this.hud.setProgress(null);
      this.hud.setPrompt(`Mantén ${E} para reanimar a ${downed.name}`);
      return;
    }
    const eye = p.eye;
    const dir = this.aimDir;
    const c = this.containers.findInteract(eye, dir);
    const k = this.pickups.findInteract(eye, dir);
    let target = null;
    if (c && (!k || c.score >= k.score)) target = c;
    else if (k) target = k;

    const autoW = this.settings.autoPickupWeapons !== false;
    for (const pk of this.pickups.items.slice()) {
      const kind = pk.item.kind;
      if (!pk.settled || pk.pending || pk.pos.distanceTo(p.pos) >= 1.4) continue;
      if (kind === 'ammo' || kind === 'material') {
        if (!(pk.dropAt && this.time - pk.dropAt < 2.5)) this.tryPickup(pk);
      }
      // Recogida automática de armas y curas si hay un hueco libre
      else if (autoW && !pk.noAuto && (kind === 'weapon' || kind === 'consumable') && this.hasFreeSlot(pk.item, true)) this.tryPickup(pk);
    }

    // Puertas de las construcciones editadas
    const door = !target || target.score < 1.2 ? this.build.findDoor(eye, dir) : null;
    if (door) {
      this.hud.setPrompt(`${E} ${door.doorOpen ? 'Cerrar' : 'Abrir'} puerta`);
      if (input.hit('interact')) this.build.setDoor(door, !door.doorOpen);
      return;
    }

    if (!target) {
      const car = this.vehicles.findNear(p.pos);
      if (car) {
        this.hud.setPrompt(`${E} Conducir coche`);
        if (input.hit('interact')) {
          this.build.setActive(false);
          this.vehicles.enter(p, car);
        }
      } else this.hud.setPrompt(null);
      return;
    }
    if (target.container) {
      const ct = target.container;
      this.hud.setPrompt(`${E} ${ct.kind === 'chest' ? 'Abrir cofre' : 'Abrir caja de munición'}`);
      if (input.hit('interact')) {
        this.containers.open(ct, p);
        if (ct.kind === 'chest') p.stats.chests++;
      }
    } else {
      const it = target.pickup.item;
      const col = RARITIES[itemRarity(it)].color;
      const extra = it.kind === 'weapon' ? ` <small>${RARITIES[it.rarity].name}</small>` : it.count ? ` <small>x${it.count}</small>` : '';
      this.hud.setPrompt(`${E} Recoger <span style="color:${col}">${itemName(it)}</span>${extra}`);
      if (input.hit('interact')) this.tryPickup(target.pickup);
    }
  }

  updateStorm(dt) {
    const p = this.player;
    if (!p.alive || p.mode === 'bus' || !this.storm.active || this.phase === 'lobby') return;
    if (this.storm.isOutside(p.pos.x, p.pos.z)) {
      this.stormTick += dt;
      if (this.stormTick >= 1) {
        this.stormTick -= 1;
        p.damage(this.storm.dps, 'storm');
      }
    } else this.stormTick = 0;
  }

  updateBanner() {
    const p = this.player;
    const hud = this.hud;
    if (this.state !== 'playing') return hud.banner('');
    if (this.phase === 'lobby') {
      if (this.waiting) return hud.banner('ISLA DE INICIO', 'Esperando a que estén listos todos los jugadores…');
      if (this.lobbyT === null) return hud.banner('ISLA DE INICIO', `Reuniendo jugadores… <b>${this.lobbyCount}/${this.chars.length}</b>`);
      return hud.banner(`EL AUTOBÚS SALE EN ${Math.max(0, Math.ceil(this.lobbyT))}`, `Jugadores <b>${this.chars.length}/${this.chars.length}</b> · todo lo de la isla de inicio se reinicia al subir`);
    }
    if (this.waiting) return hud.banner('PARTIDA ONLINE', 'Esperando a que estén listos todos los jugadores…');
    const touch = !!this.touch;
    if (this.net && !this.input.locked && !this.paused && p.alive && !this.spectating) return hud.banner('', touch ? '<b>Toca</b> la pantalla para jugar' : 'Haz <b>clic</b> en la pantalla para jugar');
    if (!p.alive && this.mode.respawn) return hud.banner('ELIMINADO', `Reapareces en ${Math.max(1, Math.ceil(this.respawnT))}…`);
    if (this.spectating) return hud.banner('', `Espectando a <b>${this.spectating.name}</b> · ${touch ? 'Toca para cambiar · ⏸: menú' : 'Clic para cambiar · Esc: menú'}`);
    if (p.knocked) return hud.banner('¡DERRIBADO!', 'Arrástrate hacia un compañero para que te reanime');
    if (p.mode === 'bus') {
      const thank = this.bus.thanked ? '' : touch ? ' · 🏠: dar las gracias al conductor' : ` · ${this.key('catalog')}: dar las gracias al conductor`;
      if (this.bus.doorsTime > 0) hud.banner('AUTOBÚS DE BATALLA', `Las puertas se abren en ${Math.ceil(this.bus.doorsTime)}…${thank}`);
      else if (!this.bus.doorsOpen) hud.banner('AUTOBÚS DE BATALLA', `Esperando a sobrevolar la isla…${thank}`);
      else if (touch) hud.banner('PULSA <kbd>SALTAR</kbd>', `Arrastra para mirar · toca el minimapa para ver el mapa${thank}`);
      else hud.banner(`PULSA <kbd>${this.key('jump').toUpperCase()}</kbd> PARA SALTAR`, `Mueve el ratón para mirar · ${this.key('map')}: mapa${thank}`);
    } else hud.banner('');
  }

  updateAudio() {
    const p = this.player;
    const a = this.audio;
    if (!a.ctx || this.state !== 'playing') return;
    if (p.mode === 'freefall') a.setWind(Math.min(1, p.vel.length() / 55));
    else if (p.mode === 'glide') a.setWind(0.3);
    else if (p.mode === 'bus') a.setWind(0.12);
    else a.setWind(0);
    const near = p.mode === 'ground' && p.alive ? this.containers.nearestChest(p.pos, 20) : null;
    if (near) {
      const v = Math.pow(1 - near.dist / 20, 2);
      tmpR.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      const to = tmpV.copy(near.chest.pos).sub(p.pos).setY(0).normalize();
      a.setChest(v, to.dot(tmpR));
    } else a.setChest(0, 0);
    a.setStorm(p.alive && p.mode !== 'bus' && this.storm.active && this.storm.isOutside(p.pos.x, p.pos.z) ? 1 : 0);
  }

  // ---------------------------------------------------------- CÁMARA
  updateMenuCamera(t) {
    const a = t * 0.03;
    this.camera.position.set(Math.cos(a) * 640, 260, Math.sin(a) * 640);
    this.camera.lookAt(0, 10, 0);
    this.scene.fog.near = 400;
    this.scene.fog.far = 2200;
    this.focusShadow(new THREE.Vector3(0, 0, 0));
  }

  updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    const base = this.baseFov;
    let fov = base;
    // Espectador: seguir a un compañero
    if (this.spectating && this.spectating.alive) {
      const s = this.spectating;
      const yaw = s.yaw, pitch = -0.25;
      const f = tmpF.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      cam.position.copy(s.pos).add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(f, -5);
      cam.rotation.set(pitch, yaw, 0, 'YXZ');
      cam.fov += (base - cam.fov) * Math.min(1, dt * 8);
      cam.updateProjectionMatrix();
      this.focusShadow(s.pos);
      return;
    }
    const f = tmpF.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    this.aimDir.copy(f);
    this.aimSkip = 0;

    if (p.mode === 'bus' || p.mode === 'lobby') {
      const target = this.bus.pos.clone();
      target.y += 3;
      cam.position.copy(target).addScaledVector(f, -30);
      this.aimOrigin.copy(cam.position);
      p.model.root.visible = false;
      this.scene.fog.near = 350;
      this.scene.fog.far = 2000;
    } else if (p.vehicle) {
      const target = p.vehicle.pos.clone();
      target.y += 2.2;
      cam.position.copy(target).addScaledVector(f, -9);
      const th = this.world.terrain.heightAt(cam.position.x, cam.position.z) + 0.6;
      if (cam.position.y < th) cam.position.y = th;
      this.aimOrigin.copy(cam.position);
      p.model.root.visible = true;
      fov = base + Math.min(10, Math.abs(p.vehicle.speed) / 2.5);
      this.scene.fog.near = 220;
      this.scene.fog.far = 1300;
    } else if (p.mode === 'freefall' || p.mode === 'glide' || !p.alive || p.knocked) {
      const target = p.pos.clone();
      target.y += p.mode === 'glide' ? 2.2 : 1.2;
      const dist = p.mode === 'glide' ? 7.5 : p.knocked ? 4.5 : 6;
      cam.position.copy(target).addScaledVector(f, -dist);
      const th = this.world.terrain.heightAt(cam.position.x, cam.position.z) + 0.5;
      if (cam.position.y < th) cam.position.y = th;
      this.aimOrigin.copy(cam.position);
      p.model.root.visible = p.alive;
      fov = base + (p.mode === 'freefall' ? Math.min(12, -p.vel.y / 5) : 0);
      this.scene.fog.near = 300;
      this.scene.fog.far = 1700;
    } else {
      const ads = this.combat.adsBlend;
      const item = p.item;
      const adsFov = item && item.kind === 'weapon' && !this.build.active ? this.combat.def(item).adsFov : base;
      fov = base + (adsFov - base) * ads;
      if (p.sprinting) fov += 6;
      this.scene.fog.near = 200;
      this.scene.fog.far = 1250;
      if (this.camMode === 'fp' && !this.build.active && !p.emote) {
        cam.position.copy(p.eye);
        this.aimOrigin.copy(cam.position);
        p.model.root.visible = false;
      } else {
        const pivot = p.eye.clone();
        pivot.y += 0.15;
        const right = tmpR.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        const back = this.build.active ? 4.2 : p.emote ? 4.2 : 3.0 - ads * 1.5;
        const desired = pivot.clone().addScaledVector(right, 0.7 - ads * 0.15).addScaledVector(f, -back);
        const dir = desired.clone().sub(pivot);
        const dist = dir.length();
        dir.divideScalar(dist);
        let d = dist;
        const hb = this.world.collision.raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, dist);
        if (hb) d = Math.min(d, hb.t - 0.2);
        const ht = this.world.terrain.raycast(pivot, dir, dist);
        if (ht) d = Math.min(d, ht.t - 0.3);
        d = Math.max(0.2, d);
        cam.position.copy(pivot).addScaledVector(dir, d);
        this.aimOrigin.copy(cam.position);
        this.aimSkip = Math.max(0, tmpV.copy(pivot).sub(cam.position).dot(f)) + 0.2;
        p.model.root.visible = true;
      }
    }
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 12);
    if (this.camShake > 0) {
      // Temblor de cámara por explosiones cercanas
      const k = this.camShake * this.camShake * 0.05;
      cam.rotation.x += (Math.random() - 0.5) * k;
      cam.rotation.y += (Math.random() - 0.5) * k;
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.storm.updateVisual(cam.position);
    this.focusShadow(p.mode === 'bus' ? this.bus.pos : p.pos);
  }

  focusShadow(focus) {
    const s = this.sun;
    s.target.position.set(focus.x, Math.max(0, focus.y), focus.z);
    s.position.copy(s.target.position).addScaledVector(this.sunDir, 200);
    s.target.updateMatrixWorld();
  }

  render() {
    const r = this.renderer;
    const view = this.state === 'playing' && this.camMode === 'fp' && this.player.mode === 'ground' && this.combat.viewmodel.visible && !this.spectating && !this.player.emote;
    if (this.composer) {
      this.viewPass.enabled = view;
      this.composer.render();
      return;
    }
    r.clear();
    r.render(this.scene, this.camera);
    if (view) {
      r.clearDepth();
      r.render(this.viewScene, this.viewCamera);
    }
  }
}
