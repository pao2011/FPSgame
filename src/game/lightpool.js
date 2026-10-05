import * as THREE from 'three';

// Luces puntuales compartidas. Cada luz puntual de la escena encarece TODOS
// los píxeles iluminados (los sombreados la recorren aunque esté apagada) y
// añadir o quitar luces obliga a recompilar los sombreados. Así que hay un
// número fijo de luces reales (según la calidad) y los efectos (fogonazos,
// explosiones, fuego, antorchas de las cuevas) usan luces «virtuales» que
// no están en la escena: cada fotograma las más importantes y cercanas a la
// cámara se copian en las reales.
export class LightPool {
  constructor(scene, count) {
    this.virtual = [];
    this.real = [];
    for (let i = 0; i < count; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(L);
      this.real.push(L);
    }
    this.cand = [];
  }

  get size() {
    return this.real.length;
  }

  // light: PointLight que NO se añade a la escena. prio: más alto = gana.
  add(light, prio = 1) {
    light.userData.prio = prio;
    this.virtual.push(light);
    return light;
  }

  update(cam) {
    if (!this.real.length) return;
    const cand = this.cand;
    cand.length = 0;
    for (const v of this.virtual) {
      if (v.intensity <= 0.01) continue;
      const d = v.position.distanceTo(cam);
      if (v.distance > 0 && d > v.distance + 50) continue;
      v.userData.score = v.userData.prio * 1000 - d;
      cand.push(v);
    }
    if (cand.length > 1) cand.sort((a, b) => b.userData.score - a.userData.score);
    for (let i = 0; i < this.real.length; i++) {
      const L = this.real[i];
      const v = cand[i];
      if (!v) {
        L.intensity = 0;
        continue;
      }
      L.position.copy(v.position);
      L.color.copy(v.color);
      L.intensity = v.intensity;
      L.distance = v.distance;
      L.decay = v.decay;
    }
  }
}
