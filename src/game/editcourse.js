// Práctica de edición (modo temporal): una fila de paredes que hay que
// editar (abrir una puerta, ventana o arco en cada una) lo más rápido
// posible. El reloj empieza con la primera edición; el mejor tiempo se guarda.
const WALLS = 12;
const BEST_KEY = 'islaRoyale.editBest';

export class EditCourse {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.el = null;
  }

  get best() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  start() {
    const g = this.game;
    const w = g.world;
    const p = g.player;
    // Sitio llano cerca del centro de la isla
    let sx = 0, sz = 0;
    for (let i = 0; i < 200; i++) {
      const a = i * 2.39, r = 40 + i * 3;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (w.terrain.heightAt(x, z) > 3 && w.isFlatEnough(x, z, 30, 2.5).ok && !w.occupied(x, z, 30)) {
        sx = x;
        sz = z;
        break;
      }
    }
    g.bus.active = false;
    g.bus.model.visible = false;
    g.storm.active = false;
    g.storm.mesh.visible = false;
    p.resetBody();
    p.mode = 'ground';
    const G = 4;
    const cx = Math.floor(sx / G), cz = Math.floor(sz / G);
    p.pos.set(cx * G + 2, w.groundBelow(cx * G + 2, cz * G + 3, 200), cz * G + 3);
    p.yaw = 0;
    p.model.root.visible = g.camMode !== 'fp';
    const base = g.build.levelBase(p.pos.y, p.pos.x, p.pos.z);
    // Paredes en fila (y alguna a los lados) hacia el norte
    const list = [];
    for (let k = 0; k < WALLS; k++) list.push({ type: 'wall', x: 0, z: -1 - k, dir: 2, mat: ['wood', 'stone', 'metal'][k % 3] });
    g.build.placeRelative(list, cx, cz, base, 0);
    this.walls = list.map((q) => g.build.pieces.get(g.build.key('wall', cx + q.x, cz + q.z, base, q.dir))).filter(Boolean);
    this.t0 = 0;
    this.time = 0;
    this.done = false;
    this.active = true;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'edit-course';
      document.getElementById('hud').appendChild(this.el);
    }
    this.el.style.display = '';
    g.hud.toast(`Edita las ${this.walls.length} paredes (${g.key('edit')}) y atraviésalas. ¡El reloj empieza con la primera edición!`);
  }

  stop() {
    this.active = false;
    if (this.el) this.el.style.display = 'none';
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const edited = this.walls.filter((w) => w.edit || !g.build.pieces.has(w.key)).length;
    if (edited > 0 && !this.t0) this.t0 = g.time;
    if (this.t0 && !this.done) this.time = g.time - this.t0;
    if (!this.done && edited >= this.walls.length) {
      this.done = true;
      const best = this.best;
      const record = !best || this.time < best;
      if (record) {
        try {
          localStorage.setItem(BEST_KEY, String(this.time));
        } catch {
          /* sin almacenamiento */
        }
      }
      g.hud.toast(record ? `🏁 ¡Nuevo récord! ${this.time.toFixed(2)} s` : `🏁 ${this.time.toFixed(2)} s (récord: ${best.toFixed(2)} s)`);
      g.audio.victory?.();
    }
    const best = this.best;
    this.el.innerHTML = `✏️ <b>${edited}/${this.walls.length}</b> paredes · ⏱ <b>${this.time.toFixed(2)} s</b>${best ? ` · Récord ${best.toFixed(2)} s` : ''}${this.done ? ' · <button data-again>Repetir</button>' : ''}`;
    const again = this.el.querySelector('[data-again]');
    if (again && !again.onclick) again.onclick = () => this.reset();
    // Tecla rápida para repetir
    if (this.done && g.input.hit('reload')) this.reset();
  }

  // Repetir: restaurar las paredes y volver al principio.
  reset() {
    const g = this.game;
    for (const w of this.walls) if (g.build.pieces.has(w.key) && w.edit) g.build.applyEdit(w, 0);
    g.build.reset();
    this.start();
  }
}
