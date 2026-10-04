import * as THREE from 'three';
import { MAP_SIZE, HALF } from '../world/constants.js';

const SIZE = 1024;

// Renderiza el mapa base una vez y dibuja minimapa / mapa completo encima.
export class MapRenderer {
  constructor(world) {
    this.world = world;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = SIZE;
    this.renderBase();
  }

  toPx(x, z, size = SIZE) {
    return [((x + HALF) / MAP_SIZE) * size, ((z + HALF) / MAP_SIZE) * size];
  }

  renderBase() {
    const ctx = this.base.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const t = this.world.terrain;
    const c = new THREE.Color();
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const x = -HALF + ((px + 0.5) / SIZE) * MAP_SIZE;
        const z = -HALF + ((py + 0.5) / SIZE) * MAP_SIZE;
        const h = t.heightAt(x, z);
        const i = (py * SIZE + px) * 4;
        if (h < 0) {
          const d = Math.min(1, -h / 12);
          img.data[i] = 70 - d * 40;
          img.data[i + 1] = 160 - d * 60;
          img.data[i + 2] = 220 - d * 50;
        } else {
          t.colorAt(x, z, h, t.slopeAt(x, z), c);
          // sombreado de relieve
          const sh = (t.heightAt(x - 2, z - 2) - h) * 0.06;
          const k = Math.max(0.65, Math.min(1.3, 1 - sh));
          img.data[i] = Math.min(255, c.r * 255 * k);
          img.data[i + 1] = Math.min(255, c.g * 255 * k);
          img.data[i + 2] = Math.min(255, c.b * 255 * k);
        }
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Edificios
    ctx.fillStyle = 'rgba(60,55,50,0.85)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    // Carreteras
    ctx.lineCap = 'round';
    for (const road of this.world.roads.roads) {
      ctx.strokeStyle = road.kind === 'street' ? 'rgba(85,88,94,0.95)' : 'rgba(70,72,78,0.95)';
      ctx.lineWidth = Math.max(2, (road.width / MAP_SIZE) * SIZE);
      ctx.beginPath();
      road.pts.forEach(([x, z], i) => {
        const [px, py] = this.toPx(x, z);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,55,50,0.85)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (const p of this.world.plans) {
      if (p.kind === 'hay' || p.noMap) continue;
      const [x0, z0] = this.toPx(p.x - p.fw / 2, p.z - p.fd / 2);
      const [x1, z1] = this.toPx(p.x + p.fw / 2, p.z + p.fd / 2);
      ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
      ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
    }
  }

  drawCircle(ctx, cx, cz, r, scale, ox, oy, style, width = 2, dash = null) {
    ctx.beginPath();
    ctx.arc(ox + cx * scale, oy + cz * scale, Math.max(0, r * scale), 0, Math.PI * 2);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawStormOverlay(ctx, storm, scale, ox, oy, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(ox + storm.center.x * scale, oy + storm.center.y * scale, Math.max(0, storm.radius * scale), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(120,40,200,0.38)';
    ctx.fill('evenodd');
    ctx.restore();
    this.drawCircle(ctx, storm.center.x, storm.center.y, storm.radius, scale, ox, oy, 'rgba(200,120,255,0.9)', 2);
    if (storm.state === 'wait' || storm.state === 'shrink') {
      this.drawCircle(ctx, storm.next.x, storm.next.y, storm.nextRadius, scale, ox, oy, 'rgba(255,255,255,0.95)', 2);
    }
  }

  drawPlayer(ctx, x, y, yaw, size = 7) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.4);
    ctx.lineTo(size, size);
    ctx.lineTo(0, size * 0.4);
    ctx.lineTo(-size, size);
    ctx.closePath();
    ctx.fillStyle = '#ffe14d';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawBusPath(ctx, bus, scale, ox, oy) {
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox + bus.start.x * scale, oy + bus.start.z * scale);
    ctx.lineTo(ox + bus.end.x * scale, oy + bus.end.z * scale);
    ctx.stroke();
    ctx.restore();
    if (bus.active) {
      ctx.fillStyle = '#2f7de1';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox + bus.pos.x * scale, oy + bus.pos.z * scale, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Minimapa centrado en el jugador (norte arriba).
  drawMini(ctx, w, h, game, metersShown = 260) {
    const p = game.player;
    const scale = w / metersShown;
    const ox = w / 2 - p.pos.x * scale;
    const oy = h / 2 - p.pos.z * scale;
    ctx.fillStyle = '#2a6fa8';
    ctx.fillRect(0, 0, w, h);
    const srcScale = SIZE / MAP_SIZE;
    const [bx, by] = this.toPx(p.pos.x - metersShown / 2, p.pos.z - metersShown / 2);
    ctx.drawImage(this.base, bx, by, metersShown * srcScale, metersShown * srcScale, 0, 0, w, h);
    this.drawStormOverlay(ctx, game.storm, scale, ox, oy, w, h);
    if (p.mode === 'bus' || (game.bus.active && p.mode === 'lobby')) this.drawBusPath(ctx, game.bus, scale, ox, oy);
    this.drawMates(ctx, game, scale, ox, oy);
    this.drawMarks(ctx, game, scale, ox, oy);
    this.drawPlayer(ctx, w / 2, h / 2, p.yaw, 6);
  }

  // Compañeros de equipo (puntos de color)
  drawMates(ctx, game, scale, ox, oy) {
    const p = game.player;
    if ((game.mode.teamSize || 1) < 2 && !game.mode.teams) return;
    for (const c of game.chars) {
      if (c === p || c.team !== p.team || !c.alive || c.mode === 'bus') continue;
      ctx.beginPath();
      ctx.arc(ox + c.pos.x * scale, oy + c.pos.z * scale, 4, 0, Math.PI * 2);
      ctx.fillStyle = c.knocked ? '#ff6b6b' : '#3fa9ff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    }
  }

  // Marcas de ubicación (pings) y destino del mapa.
  drawMarks(ctx, game, scale, ox, oy) {
    for (const pg of game.pings) {
      ctx.fillStyle = pg.mine ? '#ffd34d' : '#3fa9ff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ox + pg.pos.x * scale, oy + pg.pos.z * scale, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (game.waypoint) this.drawMarker(ctx, ox + game.waypoint.x * scale, oy + game.waypoint.z * scale);
  }

  drawMarker(ctx, x, y) {
    ctx.fillStyle = '#ff4d6d';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 5);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x + 4, y - 5);
    ctx.fill();
  }

  drawFull(ctx, w, h, game) {
    const scale = w / MAP_SIZE;
    const ox = w / 2, oy = h / 2;
    ctx.drawImage(this.base, 0, 0, w, h);
    // rejilla
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo((i * w) / 10, 0);
      ctx.lineTo((i * w) / 10, h);
      ctx.moveTo(0, (i * h) / 10);
      ctx.lineTo(w, (i * h) / 10);
      ctx.stroke();
    }
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 10; i++) {
      ctx.fillText(String.fromCharCode(65 + i), (i + 0.5) * (w / 10) - 4, 12);
      ctx.fillText(String(i + 1), 4, (i + 0.5) * (h / 10) + 4);
    }
    this.drawStormOverlay(ctx, game.storm, scale, ox, oy, w, h);
    if (game.bus.active || game.player.mode === 'bus') this.drawBusPath(ctx, game.bus, scale, ox, oy);
    // nombres de zonas
    ctx.textAlign = 'center';
    for (const poi of this.world.pois) {
      const x = ox + poi.x * scale, y = oy + poi.z * scale;
      ctx.font = 'bold 15px "Lilita One", "Arial Black", sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(poi.name.toUpperCase(), x, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(poi.name.toUpperCase(), x, y);
    }
    // lugares destacados (más pequeños)
    for (const lm of this.world.landmarks) {
      const x = ox + lm.x * scale, y = oy + lm.z * scale;
      ctx.font = 'bold 11px "Inter", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(lm.name, x, y + 14);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(lm.name, x, y + 14);
    }
    ctx.textAlign = 'left';
    this.drawMates(ctx, game, scale, ox, oy);
    this.drawMarks(ctx, game, scale, ox, oy);
    const p = game.player;
    if (p.mode !== 'lobby' && game.phase !== 'lobby') this.drawPlayer(ctx, ox + p.pos.x * scale, oy + p.pos.z * scale, p.yaw, 8);
  }
}
