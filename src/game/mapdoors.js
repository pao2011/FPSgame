import * as THREE from 'three';
import { mat } from './models.js';

// Puertas reales en las casas del mapa: hoja con bisagra que se abre y se
// cierra con E (también los bots las abren al pasar). Cerradas bloquean el
// paso y las balas; se sincronizan en online.
const CELL = 16;
const tmpV = new THREE.Vector3();

export class MapDoors {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.grid = new Map();
    const w = game.world;
    if (!w.doors?.length) return;
    const wood = mat(0x8a5a32);
    const knob = mat(0xd9b44a, { phong: true, shininess: 80 });
    const geoCache = new Map();
    w.doors.forEach((d, i) => {
      const span = d.alongX ? d.maxX - d.minX : d.maxZ - d.minZ;
      const h = d.y1 - d.y0 - 0.05;
      const key = `${span.toFixed(2)}|${h.toFixed(2)}`;
      let geo = geoCache.get(key);
      if (!geo) geoCache.set(key, (geo = new THREE.BoxGeometry(span - 0.06, h, 0.08).translate((span - 0.06) / 2, h / 2, 0)));
      const hinge = new THREE.Group();
      // Bisagra en un extremo del hueco, centrada en el grosor del muro
      const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
      if (d.alongX) hinge.position.set(d.minX + 0.03, d.y0, cz);
      else {
        hinge.position.set(cx, d.y0, d.minZ + 0.03);
        hinge.rotation.y = -Math.PI / 2;
      }
      const pivot = new THREE.Group(); // gira alrededor de la bisagra
      hinge.add(pivot);
      const leaf = new THREE.Mesh(geo, wood);
      leaf.castShadow = true;
      pivot.add(leaf);
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), knob);
      k.position.set(span - 0.22, 1.0, 0.07);
      pivot.add(k);
      // Paneles decorativos
      const pm = mat(0x6b4426);
      for (const y of [0.55, 1.55]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(span * 0.6, 0.7, 0.1), pm);
        p.position.set(span / 2, y, 0);
        pivot.add(p);
      }
      game.scene.add(hinge);
      const door = { i, d, hinge, pivot, open: false, angle: 0, collider: null, center: new THREE.Vector3(cx, d.y0 + 1.2, cz) };
      this.list.push(door);
      const gk = `${Math.floor(cx / CELL)},${Math.floor(cz / CELL)}`;
      if (!this.grid.has(gk)) this.grid.set(gk, []);
      this.grid.get(gk).push(door);
      this.setCollider(door);
    });
  }

  setCollider(door) {
    const col = this.game.world.collision;
    if (door.collider) col.remove(door.collider);
    door.collider = null;
    if (door.open) return;
    const d = door.d;
    const pad = 0.05;
    door.collider = col.add(d.minX - (d.alongX ? 0 : pad), d.y0, d.minZ - (d.alongX ? pad : 0), d.maxX + (d.alongX ? 0 : pad), d.y1, d.maxZ + (d.alongX ? pad : 0), { type: 'mapdoor', door });
  }

  // Nueva partida: todas cerradas.
  reset() {
    for (const door of this.list) {
      if (door.open) {
        door.open = false;
        this.setCollider(door);
      }
    }
  }

  setOpen(door, open, fromNet = false) {
    if (door.open === open) return;
    door.open = open;
    this.setCollider(door);
    if (door.center.distanceTo(this.game.camera.position) < 40) this.game.audio.door?.();
    if (!fromNet) this.game.net?.sendMapDoor?.(door);
  }

  near(x, z) {
    const out = [];
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const l = this.grid.get(`${cx + dx},${cz + dz}`);
      if (l) out.push(...l);
    }
    return out;
  }

  // Puerta delante del jugador (para el aviso «E Abrir puerta»).
  findDoor(eye, forward, maxDist = 2.8) {
    let best = null, bd = maxDist;
    for (const door of this.near(eye.x, eye.z)) {
      const dist = door.center.distanceTo(eye);
      if (dist > bd) continue;
      const dot = tmpV.copy(door.center).sub(eye).normalize().dot(forward);
      if (dot < 0.4) continue;
      bd = dist;
      best = door;
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    const cam = g.camera.position;
    // Animación de la hoja (abre hacia dentro de la casa)
    for (const door of this.near(cam.x, cam.z)) {
      const want = door.open ? -Math.PI * 0.55 : 0;
      if (Math.abs(door.angle - want) > 0.001) {
        door.angle += (want - door.angle) * Math.min(1, dt * 8);
        door.pivot.rotation.y = door.angle;
      }
    }
    // Los bots (los que simula este ordenador) abren las puertas al pasar
    if (g.state !== 'playing') return;
    for (const b of g.bots.list) {
      if (!b.alive || b.mode !== 'ground' || b.hSpeed < 0.5) continue;
      if (g.net && !g.net.isLocal(b)) continue;
      for (const door of this.near(b.pos.x, b.pos.z)) {
        if (!door.open && Math.abs(door.center.x - b.pos.x) < 1.6 && Math.abs(door.center.z - b.pos.z) < 1.6 && Math.abs(door.d.y0 - b.pos.y) < 1.5) this.setOpen(door, true);
      }
    }
  }
}
