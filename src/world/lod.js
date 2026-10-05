// Distancia de dibujado por tipo de objeto. El mundo se divide en parcelas
// (terreno, vegetación, edificios); three.js ya descarta las que quedan fuera
// de cámara y aquí se ocultan además las que están demasiado lejos. En móvil
// las distancias son mucho más cortas (y la niebla más cerrada para taparlo).
const DIST = {
  movil: { terrain: 1000, building: 600, tree: 360, rock: 230, bush: 110, prop: 150 },
  baja: { terrain: 1400, building: 780, tree: 540, rock: 360, bush: 170, prop: 220 },
  normal: { terrain: Infinity, building: 1400, tree: 1000, rock: 620, bush: 300, prop: 320 },
  alta: { terrain: Infinity, building: Infinity, tree: 1500, rock: 900, bush: 420, prop: 420 },
};
// Desde el aire (autobús, caída) se ve mucho más lejos: se amplía la distancia
// de lo grande (terreno, edificios, árboles), lo pequeño no merece la pena.
const AIR = { terrain: true, building: true, tree: true };

export class LodSet {
  constructor(quality) {
    this.quality = quality;
    this.dist = DIST[quality] || DIST.normal;
    this.items = [];
    this.t = 0;
    this.visible = 0;
  }

  // obj: malla (o grupo) de una parcela con centro (cx, cz) y radio r.
  add(obj, kind, cx, cz, r) {
    this.items.push({ obj, kind, cx, cz, r });
  }

  // fogFar: más allá de la niebla no hay nada que ver.
  // scale: distancia de visión (Opciones y ajuste automático).
  update(dt, cam, fogFar = Infinity, groundY = 0, force = false, scale = 1) {
    this.t -= Math.max(0, dt);
    if (this.t > 0 && !force) return;
    this.t = 0.15;
    const air = Math.min(1, Math.max(0, (cam.y - groundY - 40) / 160));
    let n = 0;
    for (const it of this.items) {
      const dx = cam.x - it.cx, dz = cam.z - it.cz;
      const d = Math.sqrt(dx * dx + dz * dz) - it.r;
      let max = (this.dist[it.kind] ?? Infinity) * (it.kind === 'terrain' ? Math.max(1, scale) : scale);
      if (air > 0 && AIR[it.kind]) max *= 1 + air * 1.2;
      const vis = d < Math.min(max, fogFar + 20);
      it.obj.visible = vis;
      if (vis) n++;
    }
    this.visible = n;
  }

  // Todo visible (menú, cámaras especiales).
  showAll() {
    for (const it of this.items) it.obj.visible = true;
  }
}
