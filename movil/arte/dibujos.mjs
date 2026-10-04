// Dibujos vectoriales (SVG) del icono, la pantalla de carga y el gráfico de
// la tienda. Los usa generar-arte.mjs para crear todos los PNG.

const DEFS = `
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1c5fc4"/><stop offset="0.55" stop-color="#4fa6f5"/><stop offset="1" stop-color="#bfe4ff"/>
  </linearGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#22c3e0"/><stop offset="0.5" stop-color="#1287c9"/><stop offset="1" stop-color="#0a4c97"/>
  </linearGradient>
  <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff6c8"/><stop offset="0.45" stop-color="#ffe27a"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#6fdc5a"/><stop offset="1" stop-color="#2f9e44"/>
  </linearGradient>
  <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe7a6"/><stop offset="1" stop-color="#e6bf6a"/>
  </linearGradient>
  <linearGradient id="storm" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#c25bff"/><stop offset="1" stop-color="#7a2bd6"/>
  </linearGradient>`;

// Isla con palmera centrada en (0,0), unos 600 de ancho.
const ISLAND = `
  <ellipse cx="0" cy="62" rx="330" ry="58" fill="#0d6aa8" opacity="0.45"/>
  <ellipse cx="0" cy="40" rx="300" ry="62" fill="url(#sand)"/>
  <path d="M-250 40 C-190 -70 -90 -40 -30 -70 C40 -150 160 -110 250 40 Z" fill="url(#hill)"/>
  <path d="M-30 -70 C40 -150 160 -110 250 40 L140 40 C120 -40 60 -90 -30 -70Z" fill="#000" opacity="0.12"/>
  <!-- casita -->
  <g transform="translate(110 -32)">
    <rect x="-38" y="-30" width="76" height="58" fill="#f4efe6"/>
    <path d="M-50 -28 L0 -70 L50 -28 Z" fill="#e2483d"/>
    <rect x="-12" y="0" width="24" height="28" fill="#7a4a24"/>
  </g>
  <!-- palmera -->
  <path d="M-90 30 C-100 -60 -80 -150 -40 -230" fill="none" stroke="#7b4a22" stroke-width="30" stroke-linecap="round"/>
  <path d="M-90 30 C-100 -60 -80 -150 -40 -230" fill="none" stroke="#a8693a" stroke-width="12" stroke-linecap="round" stroke-dasharray="14 18"/>
  <g transform="translate(-40 -232)" fill="#2fae4a" stroke="#1e7a34" stroke-width="6" stroke-linejoin="round">
    <path d="M0 0 C60 -70 150 -50 190 10 C130 -20 70 -10 0 0Z"/>
    <path d="M0 0 C-50 -80 -150 -70 -190 -10 C-120 -35 -60 -25 0 0Z"/>
    <path d="M0 0 C20 -90 90 -130 150 -110 C90 -90 40 -50 0 0Z"/>
    <path d="M0 0 C-30 -90 -100 -120 -150 -95 C-90 -80 -40 -45 0 0Z"/>
    <path d="M0 0 C70 10 140 60 150 120 C100 70 50 40 0 0Z"/>
    <path d="M0 0 C-70 20 -130 70 -130 130 C-90 80 -45 45 0 0Z"/>
  </g>
  <circle cx="-48" cy="-222" r="14" fill="#6b3b17"/><circle cx="-24" cy="-214" r="13" fill="#7a4520"/>`;

// Mira (punto de mira) centrada en (0,0) con radio r.
const crosshair = (r, w) => `
  <g fill="none" stroke-linecap="round">
    <circle r="${r}" stroke="#0b1630" stroke-width="${w + 16}" opacity="0.55"/>
    <circle r="${r}" stroke="#ffd23f" stroke-width="${w}"/>
    ${[0, 90, 180, 270].map((a) => `<g transform="rotate(${a})"><line x1="0" y1="${-r - w * 1.6}" x2="0" y2="${-r + w * 1.9}" stroke="#0b1630" stroke-width="${w + 16}" opacity="0.55"/><line x1="0" y1="${-r - w * 1.6}" x2="0" y2="${-r + w * 1.9}" stroke="#ffd23f" stroke-width="${w}"/></g>`).join('')}
  </g>`;

const sceneBackground = (w, h, horizon) => `
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <circle cx="${w * 0.78}" cy="${h * 0.22}" r="${Math.min(w, h) * 0.2}" fill="url(#sun)"/>
  <circle cx="${w * 0.78}" cy="${h * 0.22}" r="${Math.min(w, h) * 0.075}" fill="#fff3b0"/>
  <g fill="#fff" opacity="0.85">
    <ellipse cx="${w * 0.2}" cy="${h * 0.2}" rx="${w * 0.1}" ry="${h * 0.035}"/>
    <ellipse cx="${w * 0.27}" cy="${h * 0.18}" rx="${w * 0.07}" ry="${h * 0.04}"/>
    <ellipse cx="${w * 0.55}" cy="${h * 0.1}" rx="${w * 0.06}" ry="${h * 0.02}"/>
  </g>
  <rect y="${horizon}" width="${w}" height="${h - horizon}" fill="url(#sea)"/>
  <path d="M0 ${horizon} H${w}" stroke="#bff3ff" stroke-width="${h * 0.006}" opacity="0.7"/>`;

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${DEFS}</defs>${body}</svg>`;

// Icono completo (cuadrado 1024)
export function iconSVG({ shape = 'square' } = {}) {
  const clip = shape === 'circle' ? '<clipPath id="c"><circle cx="512" cy="512" r="512"/></clipPath>'
    : shape === 'rounded' ? '<clipPath id="c"><rect width="1024" height="1024" rx="190"/></clipPath>'
      : '<clipPath id="c"><rect width="1024" height="1024"/></clipPath>';
  return svg(1024, 1024, `<defs>${clip}</defs><g clip-path="url(#c)">
    ${sceneBackground(1024, 1024, 660)}
    <path d="M-40 1060 A720 720 0 0 1 -40 -40" fill="none" stroke="url(#storm)" stroke-width="60" opacity="0.8"/>
    <g transform="translate(540 650) scale(1.15)">${ISLAND}</g>
    <g transform="translate(512 512)">${crosshair(330, 34)}</g>
  </g>`);
}

// Capa delantera del icono adaptativo de Android (108dp: zona segura central de 66dp)
export function foregroundSVG() {
  return svg(1024, 1024, `
    <g transform="translate(530 600) scale(0.78)">${ISLAND}</g>
    <g transform="translate(512 512)">${crosshair(250, 28)}</g>`);
}

// Capa trasera del icono adaptativo
export function backgroundSVG() {
  return svg(1024, 1024, sceneBackground(1024, 1024, 640));
}

// Pantalla de carga (cualquier tamaño)
export function splashSVG(w, h) {
  const s = Math.min(w, h);
  return svg(w, h, `
    <rect width="${w}" height="${h}" fill="#0b1630"/>
    <circle cx="${w / 2}" cy="${h / 2 - s * 0.1}" r="${s * 0.26}" fill="#2d5fb8" opacity="0.35"/>
    <g transform="translate(${w / 2} ${h / 2 - s * 0.1}) scale(${s / 1700})">
      <g transform="translate(20 140)">${ISLAND}</g>
      ${crosshair(260, 26)}
    </g>
    <text x="${w / 2}" y="${h / 2 + s * 0.33}" text-anchor="middle" font-family="Lilita One" font-size="${s * 0.11}" fill="#fff"
      stroke="#1b3f8f" stroke-width="${s * 0.012}" paint-order="stroke">ISLA <tspan fill="#ffd23f">ROYALE</tspan></text>`);
}

// Gráfico destacado de Google Play (1024 x 500)
export function featureSVG() {
  const w = 1024, h = 500;
  return svg(w, h, `
    ${sceneBackground(w, h, 330)}
    <g transform="translate(790 330) scale(0.72)">${ISLAND}</g>
    <g transform="translate(790 300)">${crosshair(150, 16)}</g>
    <defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b1630" stop-opacity="0.45"/><stop offset="0.65" stop-color="#0b1630" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#shade)"/>
    <text x="52" y="210" font-family="Lilita One" font-size="118" fill="#fff" stroke="#1b3f8f" stroke-width="14" paint-order="stroke">ISLA</text>
    <text x="52" y="320" font-family="Lilita One" font-size="118" fill="#ffd23f" stroke="#1b3f8f" stroke-width="14" paint-order="stroke">ROYALE</text>
    <text x="56" y="380" font-family="Inter" font-weight="800" font-size="30" fill="#fff" stroke="#0b1630" stroke-width="6" paint-order="stroke">Battle royale 3D · Juega con tus amigos</text>
    <text x="56" y="420" font-family="Inter" font-weight="600" font-size="24" fill="#e6f3ff" stroke="#0b1630" stroke-width="5" paint-order="stroke">Bots con IA · Construcción · PC y móvil</text>`);
}
