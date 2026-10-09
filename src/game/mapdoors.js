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

  // Se ha roto una pieza del edificio: las puertas de ese hueco caen con ella.
  breakNear(bb) {
    const e = 0.35;
    const cx = (bb[0] + bb[3]) / 2, cz = (bb[2] + bb[5]) / 2;
    for (const door of this.near(cx, cz)) {
      const d = door.d;
      if (door.broken || d.maxX < bb[0] - e || d.minX > bb[3] + e || d.maxZ < bb[2] - e || d.minZ > bb[5] + e || d.y1 < bb[1] - e || d.y0 > bb[4] + e) continue;
      door.broken = true;
      door.hinge.visible = false;
      if (door.collider) this.game.world.collision.remove(door.collider);
      door.collider = null;
      this.game.effects?.debris(door.center.clone(), 0x8a5a32);
    }
  }

  // Nueva partida: todas cerradas (y las rotas, otra vez en su sitio).
  reset() {
    for (const door of this.list) {
      if (door.broken) {
        door.broken = false;
        door.hinge.visible = true;
        door.open = false;
        this.setCollider(door);
        continue;
      }
      if (door.open) {
        door.open = false;
        this.setCollider(door);
      }
    }
  }

  setOpen(door, open, fromNet = false) {
    if (door.open === open || door.broken) return;
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
      if (door.broken) continue;
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
    // Rendimiento: sólo se dibujan las puertas cercanas (4 mallas cada una)
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT <= 0) {
      this.cullT = 0.5;
      const d2 = g.propDist(140) ** 2;
      for (const door of this.list) door.hinge.visible = !door.broken && door.center.distanceToSquared(cam) < d2;
    }
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
        if (!door.open && !door.broken && Math.abs(door.center.x - b.pos.x) < 1.6 && Math.abs(door.center.z - b.pos.z) < 1.6 && Math.abs(door.d.y0 - b.pos.y) < 1.5) this.setOpen(door, true);
      }
    }
  }
}
