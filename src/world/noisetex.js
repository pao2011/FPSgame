import * as THREE from 'three';

// Ruido de valor precalculado en una textura. Los sombreados del terreno, el
// agua, el asfalto, los edificios y el cielo usaban ruido calculado con
// sin() en cada píxel (cuatro senos por muestra y hasta decenas de muestras
// por píxel); leerlo de una textura cuesta una fracción y se ve igual.
// La textura repite cada 64 celdas de ruido, con 4 texeles por celda (la
// interpolación suave va ya horneada) y media precisión para que las
// diferencias finas (relieve, grietas) no salgan escalonadas.
const PERIOD = 64;
const SUB = 4;

let tex = null;

export function noiseTexture() {
  if (tex) return tex;
  const N = PERIOD * SUB;
  // Valores de la rejilla (semilla fija: mismo dibujo en todos los equipos)
  const grid = new Float32Array(PERIOD * PERIOD);
  let s = 0x2f6b9c1d;
  for (let i = 0; i < grid.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    grid[i] = (s >>> 8) / 16777216;
  }
  const at = (x, z) => grid[(z & (PERIOD - 1)) * PERIOD + (x & (PERIOD - 1))];
  const data = new Uint16Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      // Centro del texel en coordenadas de ruido
      const px = (i + 0.5) / SUB, pz = (j + 0.5) / SUB;
      const ix = Math.floor(px), iz = Math.floor(pz);
      const fx = px - ix, fz = pz - iz;
      const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
      const a = at(ix, iz), b = at(ix + 1, iz), c = at(ix, iz + 1), d = at(ix + 1, iz + 1);
      const v = (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz;
      data[j * N + i] = THREE.DataUtils.toHalfFloat(v);
    }
  }
  tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Función GLSL equivalente a la antigua (ruido de valor en [0, 1] con la
// rejilla en coordenadas enteras). Se usa textureLod: vale también dentro de
// condicionales, donde no hay derivadas para elegir el mipmap.
export const NOISE_GLSL = /* glsl */ `
uniform sampler2D tNoise;
float texNoise(vec2 p) { return textureLod(tNoise, p * ${(1 / PERIOD).toFixed(6)}, 0.0).r; }`;

// Añade el uniforme de la textura a un sombreado (onBeforeCompile).
export function bindNoise(sh) {
  sh.uniforms.tNoise = { value: noiseTexture() };
}
