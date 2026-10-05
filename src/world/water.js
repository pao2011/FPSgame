import * as THREE from 'three';
import { MAP_SIZE, HALF } from './constants.js';
import { isMobileQuality } from '../game/models.js';

// Textura con la altura del terreno (para saber la profundidad del agua y
// pintar la orilla con espuma y tonos turquesa).
function heightTexture(terrain) {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -HALF + ((i + 0.5) / N) * MAP_SIZE;
      const z = -HALF + ((j + 0.5) / N) * MAP_SIZE;
      const h = terrain.heightAt(x, z);
      // -20..+10 m -> 0..255
      const v = Math.max(0, Math.min(255, Math.round(((h + 20) / 30) * 255)));
      const k = (j * N + i) * 4;
      data[k] = v;
      data[k + 1] = v;
      data[k + 2] = v;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createWater(scene, terrain, sunDir) {
  const geo = new THREE.PlaneGeometry(8000, 8000, 1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    // Móvil: olas sólo con senos (sin ruido) y espuma más sencilla
    defines: isMobileQuality() ? { LITE: '' } : {},
    depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        heightTex: { value: null },
        sunDir: { value: sunDir.clone().normalize() },
        sunColor: { value: new THREE.Color(0xfff1d8) },
        deep: { value: new THREE.Color(0x0b5f9c) },
        mid: { value: new THREE.Color(0x1590c8) },
        shallow: { value: new THREE.Color(0x3fe0d0) },
        skyTop: { value: new THREE.Color(0x3a8be6) },
        skyHorizon: { value: new THREE.Color(0xcfe8ff) },
        mapSize: { value: MAP_SIZE },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float time;
      uniform sampler2D heightTex;
      uniform vec3 sunDir, sunColor, deep, mid, shallow, skyTop, skyHorizon;
      uniform float mapSize;
      varying vec3 vWorld;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      // Altura de las olas (suma de ondas) para sacar la normal.
      float waves(vec2 p) {
        float h = 0.0;
        h += sin(dot(p, vec2(0.12, 0.05)) + time * 1.1) * 0.35;
        h += sin(dot(p, vec2(-0.07, 0.15)) + time * 1.4) * 0.25;
        h += sin(dot(p, vec2(0.31, -0.22)) + time * 2.1) * 0.10;
      #ifdef LITE
        h += sin(dot(p, vec2(0.9, 0.7)) - time * 1.7) * 0.06;
      #else
        h += (vnoise(p * 0.35 + vec2(time * 0.35, time * 0.2)) - 0.5) * 0.35;
        h += (vnoise(p * 1.1 - vec2(time * 0.5, -time * 0.3)) - 0.5) * 0.12;
      #endif
        return h;
      }

      void main() {
        vec2 p = vWorld.xz;
        vec2 uv = p / mapSize + 0.5;
        float ground = -16.0;
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ground = texture2D(heightTex, uv).r * 30.0 - 20.0;
        float depth = max(0.0, -ground);

        float e = 0.6;
        float h0 = waves(p);
        vec3 n = normalize(vec3(h0 - waves(p + vec2(e, 0.0)), e * 1.6, h0 - waves(p + vec2(0.0, e))));
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(cameraPosition - vWorld);
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(150.0, 900.0, dist)));

        // Color según la profundidad
        vec3 col = mix(shallow, mid, smoothstep(0.3, 4.5, depth));
        col = mix(col, deep, smoothstep(4.5, 16.0, depth));
        // Reflejo del cielo (Fresnel)
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(skyHorizon, skyTop, clamp(R.y * 1.6, 0.0, 1.0));
        col = mix(col, sky, clamp(0.12 + fres * 0.85, 0.0, 1.0));
        // Brillo del sol
        float spec = pow(max(dot(R, normalize(sunDir)), 0.0), 220.0);
        col += sunColor * spec * 3.5;
        col += sunColor * pow(max(dot(R, normalize(sunDir)), 0.0), 18.0) * 0.08;
        // Espuma en la orilla
        float foamLine = 1.0 - smoothstep(0.0, 1.3, depth + sin(time * 1.6 + p.x * 0.05 + p.y * 0.04) * 0.25);
      #ifdef LITE
        float foamNoise = 0.55 + 0.25 * sin(p.x * 1.3 + time * 0.8) * sin(p.y * 1.1 - time * 0.6);
      #else
        float foamNoise = vnoise(p * 1.6 + vec2(time * 0.6, time * 0.4));
      #endif
        float foam = foamLine * smoothstep(0.35, 0.75, foamNoise + foamLine * 0.45);
        col = mix(col, vec3(0.95, 0.98, 1.0), foam * 0.9);

        float alpha = mix(0.45, 0.93, smoothstep(0.0, 3.5, depth));
        alpha = max(alpha, foam * 0.95);
        alpha = max(alpha, fres * 0.9);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.heightTex.value = heightTexture(terrain);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}
