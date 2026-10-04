import * as THREE from 'three';
import { makeBus } from './models.js';
import { BUS_ALTITUDE, ISLAND_RADIUS } from '../world/constants.js';

// Autobús de batalla: cruza la isla en línea recta colgado de un globo.
export class BattleBus {
  constructor(scene) {
    this.model = makeBus();
    this.model.visible = false;
    this.model.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    scene.add(this.model);
    this.pos = this.model.position;
    this.dir = new THREE.Vector3();
    this.start = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.speed = 28;
    this.t = 0;
    this.length = 1;
    this.active = false;
    this.doorsTime = 0;
  }

  launch() {
    const ang = Math.random() * Math.PI * 2;
    this.dir.set(Math.cos(ang), 0, Math.sin(ang));
    const perp = new THREE.Vector3(-this.dir.z, 0, this.dir.x);
    const off = (Math.random() - 0.5) * 260;
    const half = ISLAND_RADIUS + 160;
    this.start.copy(perp).multiplyScalar(off).addScaledVector(this.dir, -half);
    this.end.copy(perp).multiplyScalar(off).addScaledVector(this.dir, half);
    this.start.y = this.end.y = BUS_ALTITUDE;
    this.length = this.start.distanceTo(this.end);
    this.t = 0;
    this.active = true;
    this.doorsTime = 3;
    this.model.visible = true;
    this.model.rotation.y = Math.atan2(-this.dir.x, -this.dir.z);
    this.pos.copy(this.start);
  }

  get velocity() {
    return this.dir.clone().multiplyScalar(this.speed);
  }

  // Distancia horizontal al centro del mapa.
  get radial() {
    return Math.hypot(this.pos.x, this.pos.z);
  }

  get doorsOpen() {
    return this.doorsTime <= 0 && this.radial < ISLAND_RADIUS + 40;
  }

  // Pasado el centro y saliendo de la isla => expulsión obligatoria.
  get mustEject() {
    return this.t > this.length * 0.5 && this.radial > ISLAND_RADIUS - 10;
  }

  update(dt, time) {
    if (!this.active) return;
    this.doorsTime -= dt;
    this.t += this.speed * dt;
    this.pos.copy(this.start).addScaledVector(this.dir, this.t);
    this.pos.y = BUS_ALTITUDE + Math.sin(time * 0.8) * 1.2;
    this.model.rotation.z = Math.sin(time * 0.6) * 0.03;
    this.model.userData.prop.rotation.z += dt * 25;
    if (this.t >= this.length) {
      this.active = false;
      this.model.visible = false;
    }
  }
}
