import * as THREE from 'three';
import { isMobileQuality } from '../game/models.js';
import { NOISE_GLSL, noiseTexture } from './noisetex.js';

export const SKY = {
  top: 0x2a74d8,
  horizon: 0xcfe8ff,
  bottom: 0x8fb8d8,
};

// Cúpula de cielo: degradado atmosférico, halo del sol y nubes altas
// procedurales que se desplazan despacio.
export function createSky(scene, sunDir) {
  const geo = new THREE.SphereGeometry(2800, isMobileQuality() ? 24 : 48, isMobileQuality() ? 12 : 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    // Móvil: nubes con 3 octavas de ruido en vez de 5
    defines: { OCTAVES: isMobileQuality() ? 3 : 5 },
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(SKY.top) },
      horizon: { value: new THREE.Color(SKY.horizon) },
      bottom: { value: new THREE.Color(SKY.bottom) },
      sunDir: { value: sunDir.clone().normalize() },
      time: { value: 0 },
      tNoise: { value: noiseTexture() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w; // siempre al fondo
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform float time;
      varying vec3 vDir;
      ${NOISE_GLSL}
      #define noise texNoise
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < OCTAVES; i++) { v += noise(p) * a; p = p * 2.03 + 17.1; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, bottom, pow(-h, 0.4));
        float s = max(dot(d, sunDir), 0.0);
        // Dispersión cálida alrededor del sol y cerca del horizonte
        col += vec3(1.0, 0.78, 0.5) * pow(s, 8.0) * 0.28 * (1.0 - clamp(h, 0.0, 1.0) * 0.5);
        col += vec3(1.0, 0.9, 0.7) * pow(1.0 - abs(h), 12.0) * 0.12;
        // Nubes altas (proyectadas sobre un plano)
        if (h > 0.02) {
          vec2 uv = d.xz / (h + 0.12) * 1.4 + vec2(time * 0.004, time * 0.0015);
          float c = fbm(uv);
          float cov = smoothstep(0.52, 0.78, c) * smoothstep(0.02, 0.25, h);
          vec3 cc = mix(vec3(0.82, 0.88, 0.98), vec3(1.0), smoothstep(0.55, 0.85, c));
          cc += vec3(1.0, 0.85, 0.65) * pow(s, 6.0) * 0.5;
          col = mix(col, cc, cov * 0.75);
        }
        // Disco solar
        col += vec3(1.0, 0.93, 0.78) * (pow(s, 1200.0) * 6.0 + pow(s, 90.0) * 0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}
