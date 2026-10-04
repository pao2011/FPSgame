// Consejos de la pantalla de carga y de la espera de la partida online, y
// la pantalla de emparejamiento (mapa + jugadores + consejos).
export const TIPS = [
  'Construye una rampa y un muro a la vez («90s») para ganar altura rápido en un tiroteo.',
  'Los cofres brillan y suenan: actívalo en Accesibilidad para verlos también como iconos.',
  'Pulsa Tab para abrir el inventario: arrastra objetos para reordenarlos o soltarlos.',
  'Edita una pared con F para abrir una puerta o una ventana y disparar a través.',
  'La madera se construye rápido pero aguanta poco; el metal es lento pero resistente.',
  'Con el clic central marcas una ubicación: tus compañeros la ven en la brújula.',
  'Las curas pequeñas se acumulan: usa la curación rápida (H) entre tiroteos.',
  'La tormenta hace cada vez más daño: mira la previsión en el mapa (M) y muévete pronto.',
  'Agachado haces menos ruido: los demás no verán tus pasos en su brújula.',
  'Da las gracias al conductor del autobús con la tecla B. ¡Es de buena educación!',
  'El rifle de tirador y el francotirador hacen el doble o más de daño a la cabeza.',
  'Las plataformas de salto te lanzan por los aires y abren el planeador.',
  'Con mando, la asistencia de apuntado frena la cámara sobre los enemigos.',
  'Si pierdes la conexión en online tienes 45 segundos para volver a la partida.',
  'En la Isla de Inicio puedes practicar con todas las armas y construir sin gastar.',
  'Los bots oyen tus disparos: dispara sólo cuando merezca la pena.',
  'Coger altura con construcciones te da ventaja, pero un explosivo puede tirarlo todo.',
  'Puedes personalizar todos los controles en Opciones → Controles.',
];

export function randomTip(prev = '') {
  let t = prev;
  while (t === prev) t = TIPS[Math.floor(Math.random() * TIPS.length)];
  return t;
}

export class MatchLoader {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'match-loader';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    this.timer = null;
  }

  show(info, modeName) {
    const g = this.game;
    const humans = info.ents.filter((e) => !e.bot);
    const bots = info.ents.length - humans.length;
    this.el.innerHTML = `<div class="ml-box">
      <div class="ml-map"><canvas width="360" height="360"></canvas></div>
      <div class="ml-side">
        <div class="ml-title">${modeName || 'Partida online'}</div>
        <div class="ml-status"><span class="spin"></span><span class="ml-st">Cargando la isla y esperando al resto de jugadores…</span></div>
        <div class="ml-players"><b>${humans.length} jugador${humans.length === 1 ? '' : 'es'}</b>${bots ? ` · ${bots} bots` : ''}
          <div class="ml-names">${humans.map((e) => `<span class="${e.id === info.you ? 'me' : ''}">${String(e.name).replace(/[<>&]/g, '')}</span>`).join('')}</div></div>
        <div class="ml-tip"><small>CONSEJO</small><p></p></div>
      </div></div>`;
    const cv = this.el.querySelector('canvas');
    try {
      const ctx = cv.getContext('2d');
      g.mapRenderer.drawFull(ctx, cv.width, cv.height, g);
    } catch {
      /* sin mapa */
    }
    const tipEl = this.el.querySelector('.ml-tip p');
    tipEl.textContent = randomTip();
    clearInterval(this.timer);
    this.timer = setInterval(() => (tipEl.textContent = randomTip(tipEl.textContent)), 6000);
    this.el.style.display = 'flex';
  }

  status(text) {
    const st = this.el.querySelector('.ml-st');
    if (st) st.textContent = text;
  }

  hide() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.el.style.display === 'none') return;
    this.el.classList.add('out');
    setTimeout(() => {
      this.el.style.display = 'none';
      this.el.classList.remove('out');
    }, 350);
  }
}
