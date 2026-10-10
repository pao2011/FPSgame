import * as THREE from 'three';

// Efectos de los cofres por nivel: círculo mágico en el suelo, motas de luz
// que suben en espiral, columna de luz (corta y violeta en los épicos;
// altísima y dorada en los legendarios, visible desde muy lejos) y el
// estallido de luz al abrirlos. Las partículas y la columna se animan en los
// sombreados: no hay trabajo por partícula en la CPU.
export const TIER_FX = [
  { color: 0xffd34d, glow: 0xffd34d, glowS: [1.8, 1.4], burst: 12, speed: 3.2, light: 3 },
  { color: 0xb65cff, glow: 0xc46dff, glowS: [2.4, 1.9], ring: 1.25, motes: 16, rise: 1.7, beamH: 10, beamR: 0.24, far: 260, burst: 34, speed: 4.4, light: 9 },
  { color: 0xffa62e, glow: 0xffc23d, glowS: [2.9, 2.2], ring: 1.6, motes: 26, rise: 2.4, beamH: 56, beamR: 0.32, far: 720, burst: 56, speed: 5.4, light: 14, star: 1 },
];

const SPARK_FRAG = `
uniform vec3 uColor;
uniform float uStar;
uniform float uBoost;
varying float vA;
varying float vTw;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float core = pow(max(0.0, 1.0 - r), 2.4);
  float rays = max(0.0, 1.0 - abs(c.x) * 16.0) * max(0.0, 1.0 - abs(c.y) * 2.2)
    + max(0.0, 1.0 - abs(c.y) * 16.0) * max(0.0, 1.0 - abs(c.x) * 2.2);
  float a = max(core, rays * uStar * vTw) * vA;
  if (a < 0.01) discard;
  a = min(1.0, a);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.55) * a * uBoost, a * 0.45);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Motas que suben en espiral alrededor del cofre (bucle infinito).
const MOTE_VERT = `
uniform float uTime;
uniform float uSize;
uniform float uPx;
uniform float uRise;
uniform float uRad;
attribute vec4 aSeed;
varying float vA;
varying float vTw;
void main() {
  float t = fract(uTime * (0.22 + aSeed.w * 0.2) + aSeed.z);
  float ang = aSeed.x * 6.2832 + uTime * (0.35 + aSeed.y * 0.5);
  float rad = uRad * (0.45 + aSeed.y * 0.6) * (1.0 - t * 0.4);
  vec3 p = vec3(cos(ang) * rad, 0.15 + t * uRise * (0.7 + aSeed.w * 0.6), sin(ang) * rad);
  vA = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t));
  vTw = 0.55 + 0.45 * sin(uTime * 9.0 + aSeed.x * 40.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + aSeed.z * 0.8) * projectionMatrix[1][1] * uPx / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// Estallido al abrir: chispas que salen hacia arriba y caen.
const BURST_VERT = `
uniform float uT;
uniform float uSize;
uniform float uPx;
uniform float uSpeed;
attribute vec4 aSeed;
varying float vA;
varying float vTw;
void main() {
  float ang = aSeed.x * 6.2832;
  float sp = uSpeed * (0.45 + aSeed.z * 0.75);
  vec3 v = vec3(cos(ang) * sp * 0.5, (0.6 + aSeed.y * 0.9) * sp, sin(ang) * sp * 0.5);
  float t = uT * (0.75 + aSeed.w * 0.5);
  // con algo de rozamiento: frena y luego cae despacio
  float k = (1.0 - exp(-2.2 * t)) / 2.2;
  vec3 p = vec3(0.0, 0.45, 0.0) + v * k - vec3(0.0, 1.6 * t * t, 0.0);
  vA = 1.0 - smoothstep(0.55, 1.5, t);
  vTw = 0.6 + 0.4 * sin(uT * 14.0 + aSeed.x * 30.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.5 + aSeed.w) * projectionMatrix[1][1] * uPx / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// Columna de luz: dos cilindros abiertos (núcleo y halo). Se ensancha con la
// distancia para que se vea desde lejos y se apaga al llegar a uFar.
const BEAM_VERT = `
uniform float uFar;
uniform float uFlare;
attribute float layer;
varying float vH;
varying float vFade;
varying float vEdge;
varying float vLayer;
varying float vNear;
void main() {
  vec3 org = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float d = distance(cameraPosition, org);
  vec3 p = position;
  p.xz *= max(1.0, d / 45.0) * (1.0 + uFlare * 2.0);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec2 n = normalize(position.xz + 1e-5);
  vec2 v = normalize(cameraPosition.xz - wp.xz + 1e-5);
  vEdge = abs(dot(n, v));
  vH = uv.y;
  vLayer = layer;
  vFade = 1.0 - smoothstep(uFar * 0.6, uFar, d);
  vNear = smoothstep(3.0, 32.0, d);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BEAM_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uBoost;
uniform float uFade;
uniform float uFlare;
varying float vH;
varying float vFade;
varying float vEdge;
varying float vLayer;
varying float vNear;
void main() {
  float halo = step(0.5, vLayer);
  float edge = pow(vEdge, mix(3.0, 1.4, halo));
  float fall = pow(1.0 - vH, mix(1.1, 2.0, halo)) * smoothstep(0.0, 0.012, vH);
  float shimmer = 0.78 + 0.22 * sin(vH * 70.0 - uTime * 5.0) * (1.0 - halo);
  // de cerca no deslumbra (sobre todo el halo)
  float nearK = mix(mix(0.22, 0.06, halo), 1.0, vNear);
  float a = clamp(edge * fall * shimmer * vFade * nearK * uFade * mix(0.85, 0.5, halo) * (1.0 + uFlare * 1.5), 0.0, 1.0);
  vec3 col = mix(uColor, vec3(1.0, 0.97, 0.9), (1.0 - halo) * edge * 0.3);
  // luz que se suma (núcleo) y que tiñe lo de detrás (halo): se ve con el
  // color del cofre incluso contra un cielo claro
  gl_FragColor = vec4(col * a * uBoost, a * mix(0.45, 0.85, halo));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Círculo mágico (runas) para el suelo, en blanco: lo tiñe el material.
function ringTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.translate(S / 2, S / 2);
  const grd = x.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.32)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd;
  x.fillRect(-S / 2, -S / 2, S, S);
  x.strokeStyle = '#fff';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(0, 0, 118, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 2.5;
  x.beginPath();
  x.arc(0, 0, 100, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.arc(0, 0, 58, 0, Math.PI * 2);
  x.stroke();
  // runas entre los dos aros
  x.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    x.save();
    x.rotate((i / 24) * Math.PI * 2);
    x.beginPath();
    const k = i % 3;
    if (k === 0) {
      x.moveTo(-4, -104);
      x.lineTo(0, -114);
      x.lineTo(4, -104);
    } else if (k === 1) {
      x.moveTo(0, -103);
      x.lineTo(0, -115);
      x.moveTo(-4, -109);
      x.lineTo(4, -109);
    } else {
      x.arc(0, -109, 3.5, 0, Math.PI * 2);
    }
    x.stroke();
    x.restore();
  }
  // estrella de ocho puntas
  x.lineWidth = 3;
  x.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = (i * 3 / 8) * Math.PI * 2;
    const px = Math.sin(a) * 98, py = -Math.cos(a) * 98;
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  return t;
}

// Onda expansiva: anillo suave.
function waveTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.62, 'rgba(255,255,255,0.05)');
  grd.addColorStop(0.84, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function seedGeometry(n, radius) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(n * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, radius * 0.5, 0), radius);
  return g;
}

function beamGeometry(h, r) {
  const parts = [];
  for (const [rad, layer] of [[r, 0], [r * 2.1, 1]]) {
    const g = new THREE.CylinderGeometry(rad * 0.75, rad, h, 18, 1, true).translate(0, h / 2, 0);
    const n = g.attributes.position.count;
    g.setAttribute('layer', new THREE.Float32BufferAttribute(new Float32Array(n).fill(layer), 1));
    parts.push(g);
  }
  // une los dos cilindros en una sola geometría
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'layer']) {
    const size = parts[0].attributes[name].itemSize;
    const arr = [];
    for (const g of parts) arr.push(...g.attributes[name].array);
    out.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
  }
  const idx = [];
  let off = 0;
  for (const g of parts) {
    for (const i of g.index.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  out.setIndex(idx);
  out.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h / 2, 0), h);
  return out;
}

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
// Mezcla «luz sobre»: el sombreado da la luz ya multiplicada por su alfa
// (se suma) y el alfa dice cuánto tapa de lo de detrás.
const glowBlend = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };

// Círculo mágico del suelo (gira en el sombreado).
const RING_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RING_FRAG = `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uRot;
uniform float uOpacity;
uniform float uBoost;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float s = sin(uRot), k = cos(uRot);
  float a = texture2D(uMap, vec2(k * c.x - s * c.y, s * c.x + k * c.y) + 0.5).a * uOpacity;
  gl_FragColor = vec4(uColor * a * uBoost, a * 0.75);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class ChestFx {
  constructor(game) {
    this.game = game;
    this.list = new Set(); // cofres con efectos puestos
    this.bursts = [];
    this.time = { value: 0 };
    this.px = { value: 400 };
    this.boost = { value: 1 };
    const lite = !!game.gfx?.lite;
    this.lite = lite;
    this.ringTex = ringTexture();
    this.waveTex = waveTexture();
    this.waveGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.tiers = TIER_FX.map((f, tier) => {
      const color = new THREE.Color(f.color);
      const o = { f, color };
      const sparkUniforms = (size) => ({
        uColor: { value: color }, uStar: { value: f.star || 0 }, uBoost: this.boost, uPx: this.px, uSize: { value: size },
      });
      o.burstGeo = seedGeometry(lite ? Math.ceil(f.burst * 0.6) : f.burst, 4);
      o.burstMat = new THREE.ShaderMaterial({
        uniforms: { ...sparkUniforms(tier ? 0.16 : 0.1), uT: { value: 0 }, uSpeed: { value: f.speed } },
        vertexShader: BURST_VERT, fragmentShader: SPARK_FRAG, ...glowBlend,
      });
      if (!tier) return o;
      o.ringGeo = new THREE.PlaneGeometry(f.ring * 2, f.ring * 2).rotateX(-Math.PI / 2);
      o.ringRot = { value: 0 };
      o.ringMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: this.ringTex }, uColor: { value: color }, uRot: o.ringRot, uOpacity: { value: 0.9 }, uBoost: this.boost },
        vertexShader: RING_VERT, fragmentShader: RING_FRAG, ...glowBlend, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      o.moteGeo = seedGeometry(lite ? Math.ceil(f.motes * 0.6) : f.motes, f.rise + 1);
      o.moteMat = new THREE.ShaderMaterial({
        uniforms: { ...sparkUniforms(tier === 2 ? 0.13 : 0.1), uTime: this.time, uRise: { value: f.rise }, uRad: { value: f.ring * 0.75 } },
        vertexShader: MOTE_VERT, fragmentShader: SPARK_FRAG, ...glowBlend,
      });
      o.beamGeo = beamGeometry(f.beamH, f.beamR);
      o.beamMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: color }, uTime: this.time, uBoost: this.boost, uFar: { value: f.far },
          uFlare: { value: 0 }, uFade: { value: tier === 2 ? 1 : 0.75 },
        },
        vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, ...glowBlend, side: THREE.DoubleSide,
      });
      return o;
    });
    // Destello de luz al abrir (luz virtual del pool: ver lightpool.js)
    this.light = game.lights.add(new THREE.PointLight(0xffffff, 0, 14, 2), 2);
    this.lightT = 0;
    this.lightPeak = 0;
  }

  // Pone (o quita, si el cofre es normal) los efectos de su nivel.
  attach(c) {
    this.detach(c);
    if (c.kind !== 'chest' || !c.tier) return;
    const T = this.tiers[c.tier];
    const group = new THREE.Group();
    group.position.copy(c.pos);
    const ring = new THREE.Mesh(T.ringGeo, T.ringMat);
    ring.position.y = 0.025;
    ring.renderOrder = 1;
    const motes = new THREE.Points(T.moteGeo, T.moteMat);
    const beam = new THREE.Mesh(T.beamGeo, T.beamMat);
    beam.position.y = 0.3;
    // sin oclusión ambiental (el pase de normales los vería opacos)
    ring.userData.noAO = beam.userData.noAO = true;
    group.add(ring, motes);
    this.game.scene.add(group, beam);
    beam.position.add(c.pos);
    c.fx = { group, ring, motes, beam, flare: null };
    group.visible = beam.visible = false;
    this.list.add(c);
  }

  detach(c) {
    const fx = c.fx;
    if (!fx) return;
    this.game.scene.remove(fx.group, fx.beam);
    if (fx.flare) fx.flare.material.dispose();
    c.fx = null;
    this.list.delete(c);
  }

  // Apertura (o rotura): chispas, onda expansiva, destello de luz y la
  // columna que se ensancha y se apaga.
  open(c, near = true) {
    const fx = c.fx;
    if (fx) {
      fx.group.visible = false;
      if (!fx.flare) {
        fx.flare = { t: 0, material: this.cloneMat(fx.beam.material) };
        fx.beam.material = fx.flare.material;
      }
    }
    if (!near) return;
    const T = this.tiers[c.tier || 0];
    const pos = c.pos;
    const pts = new THREE.Points(T.burstGeo, this.cloneMat(T.burstMat));
    pts.position.copy(pos);
    pts.frustumCulled = false;
    this.game.scene.add(pts);
    const b = { pts, wave: null, t: 0, life: 1.8 };
    if (c.tier) {
      const wave = new THREE.Mesh(this.waveGeo, new THREE.MeshBasicMaterial({ map: this.waveTex, color: T.color, ...additive, fog: false }));
      wave.position.set(pos.x, pos.y + 0.06, pos.z);
      wave.userData.noAO = true;
      this.game.scene.add(wave);
      b.wave = wave;
      b.waveR = T.f.ring * 3.2;
    }
    this.bursts.push(b);
    if (T.f.light) {
      this.light.position.set(pos.x, pos.y + 1.1, pos.z);
      this.light.color.setHex(T.f.color);
      this.lightPeak = T.f.light;
      this.lightT = 1;
      this.light.intensity = T.f.light;
    }
  }

  // Copia de un material de partículas o de columna (para animarlo aparte)
  // que sigue usando los valores compartidos (tiempo, brillo, píxeles).
  cloneMat(m) {
    const c = m.clone();
    const u = c.uniforms;
    if (u.uTime) u.uTime = this.time;
    if (u.uBoost) u.uBoost = this.boost;
    if (u.uPx) u.uPx = this.px;
    return c;
  }

  clearBursts() {
    for (const b of this.bursts) this.removeBurst(b);
    this.bursts.length = 0;
    this.light.intensity = 0;
    this.lightT = 0;
  }

  removeBurst(b) {
    this.game.scene.remove(b.pts);
    b.pts.material.dispose();
    if (b.wave) {
      this.game.scene.remove(b.wave);
      b.wave.material.dispose();
    }
  }

  update(dt, time, cam, nearD) {
    const g = this.game;
    this.time.value = time;
    this.boost.value = g.composer ? 2 : 1;
    this.px.value = g.renderer.getDrawingBufferSize(this.tmpV2 || (this.tmpV2 = new THREE.Vector2())).y * 0.5;
    const near2 = nearD * nearD;
    for (const T of this.tiers) if (T.ringRot) T.ringRot.value = time * (T.f.star ? -0.35 : 0.25);
    for (const c of this.list) {
      const fx = c.fx;
      const show = c.active && !c.broken;
      if (fx.flare) {
        // columna al abrir: se ensancha, brilla y se apaga
        const F = fx.flare;
        F.t += dt;
        const k = F.t / 1.6;
        const u = F.material.uniforms;
        u.uFlare.value = Math.sin(Math.min(1, k) * Math.PI) * 0.8;
        u.uFade.value = Math.max(0, 1 - k * k);
        fx.beam.visible = show && k < 1;
        fx.group.visible = false;
        continue;
      }
      const d2 = c.pos.distanceToSquared(cam);
      const live = show && !c.opened;
      fx.group.visible = live && d2 < near2;
      const far = TIER_FX[c.tier].far;
      fx.beam.visible = live && d2 < far * far;
    }
    if (this.lightT > 0) {
      this.lightT = Math.max(0, this.lightT - dt * 1.4);
      this.light.intensity = this.lightPeak * this.lightT * this.lightT;
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      b.pts.material.uniforms.uT.value = b.t;
      if (b.wave) {
        const k = Math.min(1, b.t / 0.8);
        const s = 0.4 + (1 - Math.pow(1 - k, 3)) * b.waveR;
        b.wave.scale.set(s, 1, s);
        b.wave.material.opacity = (1 - k) * 0.9;
        b.wave.visible = k < 1;
      }
      if (b.t >= b.life) {
        this.removeBurst(b);
        this.bursts.splice(i, 1);
      }
    }
  }

  // Al volver a empezar la partida: columnas en su sitio y sin destellos.
  reset(c) {
    const fx = c.fx;
    if (!fx?.flare) return;
    const T = this.tiers[c.tier];
    fx.beam.material = T.beamMat;
    fx.flare.material.dispose();
    fx.flare = null;
  }
}
