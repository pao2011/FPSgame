// Idiomas de la interfaz: español (original), inglés y portugués.
// Traduce los textos de la página al vuelo (MutationObserver): cada nodo de
// texto cuyo contenido coincide con una entrada del diccionario (o con un
// patrón) se sustituye, y se recuerda el original para poder volver atrás.
// Así no hay que tocar cada pantalla del juego para añadir un idioma.

// es: [en, pt]
const D = {
  // Menú principal
  'Battle royale en 3D en tu navegador': ['3D battle royale in your browser', 'Battle royale 3D no seu navegador'],
  'ONLINE': ['ONLINE', 'ONLINE'],
  '▶ JUGAR CON BOTS': ['▶ PLAY VS BOTS', '▶ JOGAR CONTRA BOTS'],
  '⭐ PASE DE BATALLA': ['⭐ BATTLE PASS', '⭐ PASSE DE BATALHA'],
  '🛒 TIENDA': ['🛒 SHOP', '🛒 LOJA'],
  'PERSONAJE': ['LOCKER', 'ARMÁRIO'],
  'MODOS DE JUEGO': ['GAME MODES', 'MODOS DE JOGO'],
  'OPCIONES': ['SETTINGS', 'OPÇÕES'],
  'CONTROLES': ['CONTROLS', 'CONTROLES'],
  'CÓMO JUGAR': ['HOW TO PLAY', 'COMO JOGAR'],
  'NOVEDADES': ["WHAT'S NEW", 'NOVIDADES'],
  'siempre el mismo': ['always the same', 'sempre o mesmo'],
  'Mapa:': ['Map:', 'Mapa:'],
  'Jugar contra bots': ['Play vs bots', 'Jogar contra bots'],
  'Jugar online': ['Play online', 'Jogar online'],
  'Modos de juego': ['Game modes', 'Modos de jogo'],
  'Opciones': ['Settings', 'Opções'],
  'Controles': ['Controls', 'Controles'],
  'Cómo jugar': ['How to play', 'Como jogar'],
  'Novedades': ["What's new", 'Novidades'],
  'Pase de batalla': ['Battle pass', 'Passe de batalha'],
  'Personaje': ['Locker', 'Armário'],
  'Tienda': ['Shop', 'Loja'],
  'Cambiar modo': ['Change mode', 'Mudar modo'],
  'Dificultad de los bots': ['Bot difficulty', 'Dificuldade dos bots'],
  'Jugadores por partida': ['Players per match', 'Jogadores por partida'],
  '¡A LA ISLA!': ['TO THE ISLAND!', 'PARA A ILHA!'],
  'Fácil': ['Easy', 'Fácil'],
  'Normal': ['Normal', 'Normal'],
  'Difícil': ['Hard', 'Difícil'],
  'Experto': ['Expert', 'Especialista'],
  // Modos
  'Solitario': ['Solo', 'Solo'],
  'Dúos': ['Duos', 'Duplas'],
  'Tríos': ['Trios', 'Trios'],
  'Escuadras': ['Squads', 'Esquadrões'],
  '1v1 Práctica': ['1v1 Practice', 'Treino 1v1'],
  'Duelo por equipos': ['Team rumble', 'Duelo em equipes'],
  'Construcción cero': ['Zero build', 'Construção zero'],
  'Modo creativo': ['Creative mode', 'Modo criativo'],
  'Práctica libre': ['Free practice', 'Treino livre'],
  'Arena': ['Arena', 'Arena'],
  'Sólo francotiradores': ['Snipers only', 'Só atiradores'],
  'Tiroteo de escopetas': ['Shotgun showdown', 'Tiroteio de escopetas'],
  'Lluvia de cohetes': ['Rocket rain', 'Chuva de foguetes'],
  'Equipos de 20': ['Teams of 20', 'Equipes de 20'],
  'Práctica de edición': ['Edit course', 'Treino de edição'],
  'TEMPORAL': ['LIMITED', 'TEMPORÁRIO'],
  'CLASIFICATORIA': ['RANKED', 'RANQUEADA'],
  // Pestañas de opciones
  'Juego': ['Game', 'Jogo'],
  'Sensibilidad': ['Sensitivity', 'Sensibilidade'],
  'Construcción y edición': ['Building & editing', 'Construção e edição'],
  'Interfaz': ['HUD', 'Interface'],
  'Accesibilidad': ['Accessibility', 'Acessibilidade'],
  'Mando': ['Controller', 'Controle'],
  'Vídeo y sonido': ['Video & audio', 'Vídeo e som'],
  'Móvil y táctil': ['Mobile & touch', 'Celular e toque'],
  // Opciones
  'Recoger armas y curas automáticamente': ['Auto pick up weapons and heals', 'Pegar armas e curas automaticamente'],
  'Ordenar las curas a la derecha del inventario': ['Sort heals to the right of the inventory', 'Ordenar curas à direita do inventário'],
  'Recargar automáticamente al vaciar el cargador': ['Auto reload when the magazine is empty', 'Recarregar automaticamente ao esvaziar o pente'],
  'Apuntar: alternar (en vez de mantener)': ['Aim: toggle (instead of hold)', 'Mirar: alternar (em vez de segurar)'],
  'Agacharse: alternar (en vez de mantener)': ['Crouch: toggle (instead of hold)', 'Agachar: alternar (em vez de segurar)'],
  'Correr por defecto (Shift para andar)': ['Sprint by default (Shift to walk)', 'Correr por padrão (Shift para andar)'],
  'Saltar la Isla de Inicio en partidas contra bots': ['Skip the Starting Island in bot matches', 'Pular a Ilha Inicial em partidas contra bots'],
  'Mostrar consejos en pantalla': ['Show on-screen tips', 'Mostrar dicas na tela'],
  'Sensibilidad del ratón': ['Mouse sensitivity', 'Sensibilidade do mouse'],
  'Multiplicador al apuntar': ['ADS multiplier', 'Multiplicador ao mirar'],
  'Multiplicador con mira telescópica': ['Scope multiplier', 'Multiplicador com luneta'],
  'Multiplicador en modo construcción': ['Build mode multiplier', 'Multiplicador no modo construção'],
  'Multiplicador en modo edición': ['Edit mode multiplier', 'Multiplicador no modo edição'],
  'Invertir eje vertical': ['Invert vertical axis', 'Inverter eixo vertical'],
  'Construcción turbo': ['Turbo building', 'Construção turbo'],
  'Retardo de la construcción turbo': ['Turbo building delay', 'Atraso da construção turbo'],
  'Cambio automático de material': ['Auto material change', 'Troca automática de material'],
  'Mostrar la silueta de la pieza': ['Show building preview', 'Mostrar silhueta da peça'],
  'Confirmar la edición al soltar la tecla de editar': ['Confirm edit on release', 'Confirmar edição ao soltar a tecla'],
  'Seleccionar casillas arrastrando al editar': ['Drag to select edit tiles', 'Selecionar casas arrastando ao editar'],
  'Mostrar números de daño': ['Show damage numbers', 'Mostrar números de dano'],
  'Tamaño de la interfaz': ['HUD scale', 'Tamanho da interface'],
  'Color de la mira': ['Crosshair color', 'Cor da mira'],
  'Mostrar FPS': ['Show FPS', 'Mostrar FPS'],
  'Idioma': ['Language', 'Idioma'],
  'Modo daltónico': ['Colorblind mode', 'Modo daltônico'],
  'Desactivado': ['Off', 'Desligado'],
  'Protanopía': ['Protanopia', 'Protanopia'],
  'Deuteranopía': ['Deuteranopia', 'Deuteranopia'],
  'Tritanopía': ['Tritanopia', 'Tritanopia'],
  'Intensidad de la corrección': ['Correction strength', 'Intensidade da correção'],
  'Visualizar efectos de sonido': ['Visualize sound effects', 'Visualizar efeitos sonoros'],
  'Disparos y pasos cercanos en la brújula': ['Nearby shots and footsteps on the compass', 'Tiros e passos próximos na bússola'],
  'Subtítulos de los sonidos': ['Sound subtitles', 'Legendas dos sons'],
  'Esquema de botones': ['Button layout', 'Esquema de botões'],
  'Clásico': ['Classic', 'Clássico'],
  'Constructor pro': ['Builder pro', 'Construtor pro'],
  'Sensibilidad del stick': ['Stick sensitivity', 'Sensibilidade do analógico'],
  'Asistencia de apuntado': ['Aim assist', 'Assistência de mira'],
  'Intensidad de la asistencia': ['Aim assist strength', 'Intensidade da assistência'],
  'Campo de visión': ['Field of view', 'Campo de visão'],
  'Volumen': ['Volume', 'Volume'],
  'Música dinámica': ['Dynamic music', 'Música dinâmica'],
  'Sonido 3D (HRTF)': ['3D sound (HRTF)', 'Som 3D (HRTF)'],
  'Chat de voz en partidas online': ['Voice chat in online matches', 'Chat de voz em partidas online'],
  'Micrófono': ['Microphone', 'Microfone'],
  'Pulsar para hablar': ['Push to talk', 'Apertar para falar'],
  'Abierto': ['Open', 'Aberto'],
  'Volumen de la voz': ['Voice volume', 'Volume da voz'],
  'Clima y ciclo de día en las partidas': ['Weather and day cycle in matches', 'Clima e ciclo do dia nas partidas'],
  'Límite de FPS': ['FPS limit', 'Limite de FPS'],
  'Sin límite': ['Unlimited', 'Sem limite'],
  'Calidad gráfica': ['Graphics quality', 'Qualidade gráfica'],
  'Alta': ['High', 'Alta'],
  'Baja (PCs modestos)': ['Low (modest PCs)', 'Baixa (PCs modestos)'],
  'Móvil': ['Mobile', 'Celular'],
  'Controles táctiles': ['Touch controls', 'Controles de toque'],
  'Automático': ['Auto', 'Automático'],
  'Siempre': ['Always', 'Sempre'],
  'Nunca': ['Never', 'Nunca'],
  'Sensibilidad táctil': ['Touch sensitivity', 'Sensibilidade do toque'],
  'Tamaño de los botones': ['Button size', 'Tamanho dos botões'],
  'Opacidad de los botones': ['Button opacity', 'Opacidade dos botões'],
  'Disposición de los botones': ['Button layout', 'Disposição dos botões'],
  'Personalizar botones': ['Customize buttons', 'Personalizar botões'],
  'Vibración': ['Vibration', 'Vibração'],
  'Restablecer controles': ['Reset controls', 'Restaurar controles'],
  // Pausa y final
  'PAUSA': ['PAUSED', 'PAUSA'],
  'CONTINUAR': ['RESUME', 'CONTINUAR'],
  'ABANDONAR PARTIDA': ['LEAVE MATCH', 'SAIR DA PARTIDA'],
  'JUGAR OTRA VEZ': ['PLAY AGAIN', 'JOGAR DE NOVO'],
  'MENÚ PRINCIPAL': ['MAIN MENU', 'MENU PRINCIPAL'],
  'VOLVER AL GRUPO': ['BACK TO PARTY', 'VOLTAR AO GRUPO'],
  '👁 ESPECTAR': ['👁 SPECTATE', '👁 ASSISTIR'],
  '🎬 VER REPETICIÓN': ['🎬 WATCH REPLAY', '🎬 VER REPLAY'],
  '🗺 MAPA DE CALOR': ['🗺 HEATMAP', '🗺 MAPA DE CALOR'],
  '¡VICTORIA MAGISTRAL!': ['VICTORY ROYALE!', 'VITÓRIA MAGISTRAL!'],
  'ELIMINADO': ['ELIMINATED', 'ELIMINADO'],
  'Eres el último superviviente de la isla': ['You are the last survivor on the island', 'Você é o último sobrevivente da ilha'],
  'Tu equipo es el último en pie': ['Your team is the last one standing', 'Sua equipe é a última de pé'],
  'Aterrizajes': ['Landings', 'Aterrissagens'],
  'Eliminaciones': ['Eliminations', 'Eliminações'],
  // HUD
  'Ligera': ['Light', 'Leve'],
  'Media': ['Medium', 'Média'],
  'Pesada': ['Heavy', 'Pesada'],
  'Cartuchos': ['Shells', 'Cartuchos'],
  'Cohetes': ['Rockets', 'Foguetes'],
  'Pico': ['Pickaxe', 'Picareta'],
  'La tormenta se cerrará en': ['Storm closes in', 'A tempestade fecha em'],
  '¡La tormenta se está cerrando!': ['The storm is closing!', 'A tempestade está fechando!'],
  '¡La zona se está moviendo!': ['The zone is moving!', 'A zona está se movendo!'],
  'Tormenta final': ['Final storm', 'Tempestade final'],
  'Abrir cofre': ['Open chest', 'Abrir baú'],
  'Abrir caja de munición': ['Open ammo box', 'Abrir caixa de munição'],
  'Abrir puerta': ['Open door', 'Abrir porta'],
  'Cerrar puerta': ['Close door', 'Fechar porta'],
  'Editar': ['Edit', 'Editar'],
  'Muro': ['Wall', 'Parede'],
  'Suelo': ['Floor', 'Piso'],
  'Rampa': ['Ramp', 'Rampa'],
  'Techo': ['Roof', 'Telhado'],
  'Madera': ['Wood', 'Madeira'],
  'Piedra': ['Stone', 'Pedra'],
  'Metal': ['Metal', 'Metal'],
  'PLANEADOR': ['GLIDER', 'PLANADOR'],
  'CAÍDA LIBRE': ['FREEFALL', 'QUEDA LIVRE'],
  'RECARGANDO': ['RELOADING', 'RECARREGANDO'],
  'SIN MUNICIÓN': ['NO AMMO', 'SEM MUNIÇÃO'],
  'Munición infinita': ['Infinite ammo', 'Munição infinita'],
  // Inventario
  'INVENTARIO': ['INVENTORY', 'INVENTÁRIO'],
  'Munición': ['Ammo', 'Munição'],
  'Materiales': ['Materials', 'Materiais'],
  'Soltar': ['Drop', 'Soltar'],
  'Todo': ['All', 'Tudo'],
  'Soltar objeto': ['Drop item', 'Soltar item'],
  'Dividir': ['Split', 'Dividir'],
  'EN MANO': ['EQUIPPED', 'NA MÃO'],
  '⬇ Arrastra aquí para soltar': ['⬇ Drag here to drop', '⬇ Arraste aqui para soltar'],
  'Daño': ['Damage', 'Dano'],
  'Cadencia': ['Fire rate', 'Cadência'],
  'Cargador': ['Magazine', 'Pente'],
  'Alcance': ['Range', 'Alcance'],
  'Recarga': ['Reload', 'Recarga'],
  // Rarezas
  'Común': ['Common', 'Comum'],
  'Poco común': ['Uncommon', 'Incomum'],
  'Raro': ['Rare', 'Raro'],
  'Épico': ['Epic', 'Épico'],
  'Legendario': ['Legendary', 'Lendário'],
  'Mítico': ['Mythic', 'Mítico'],
  'Exótico': ['Exotic', 'Exótico'],
  // Taquilla
  'Skins': ['Outfits', 'Trajes'],
  'Accesorios': ['Accessories', 'Acessórios'],
  'Picos': ['Pickaxes', 'Picaretas'],
  'Planeadores': ['Gliders', 'Planadores'],
  'Mochilas': ['Back blings', 'Mochilas'],
  'Estelas': ['Contrails', 'Rastros'],
  'Gestos': ['Emotes', 'Gestos'],
  'Pantallas': ['Loading screens', 'Telas de carregamento'],
  'Camuflajes': ['Wraps', 'Camuflagens'],
  'Colores': ['Colors', 'Cores'],
  'Ninguno': ['None', 'Nenhum'],
  // Repetición / espectador
  'Cámara libre': ['Free camera', 'Câmera livre'],
  '🎥 Cámara libre': ['🎥 Free camera', '🎥 Câmera livre'],
  'Salir de la repetición': ['Exit replay', 'Sair do replay'],
  'Ver resultados': ['Results', 'Ver resultados'],
  '◀ Jugador': ['◀ Player', '◀ Jogador'],
  'Jugador ▶': ['Player ▶', 'Jogador ▶'],
};

// Patrones con partes variables (nombres, números…)
const P = [
  [/^Has eliminado a (.+) · Quedan (\d+)$/, ['You eliminated $1 · $2 left', 'Você eliminou $1 · Restam $2']],
  [/^(.+) eliminó a (.+)$/, ['$1 eliminated $2', '$1 eliminou $2']],
  [/^Fuera de la zona segura · (\d+) m$/, ['Outside the safe zone · $1 m', 'Fora da zona segura · $1 m']],
  [/^Conducir (.+)$/, ['Drive $1', 'Dirigir $1']],
  [/^Comerciar con (.+)$/, ['Trade with $1', 'Negociar com $1']],
  [/^Hablar con (.+)$/, ['Talk to $1', 'Falar com $1']],
  [/^Misión de (.+)$/, ['Quest from $1', 'Missão de $1']],
  [/^Puesto #(\d+)$/, ['Place #$1', 'Posição #$1']],
  [/^(\d+) jugador(es)?$/, ['$1 player(s)', '$1 jogador(es)']],
  [/^Recoger (.+)$/, ['Pick up $1', 'Pegar $1']],
  [/^Cambiar por (.+)$/, ['Swap for $1', 'Trocar por $1']],
  [/^Reanimar a (.+)$/, ['Revive $1', 'Reanimar $1']],
  [/^Espectando a (.+)$/, ['Spectating $1', 'Assistindo $1']],
];

const LANGS = { es: -1, en: 0, pt: 1 };

class Translator {
  constructor() {
    this.lang = 'es';
    this.orig = new WeakMap(); // nodo -> texto original (español)
    this.shown = new WeakMap(); // nodo -> texto que pusimos
    this.attrs = ['placeholder', 'title'];
    this.obs = null;
  }

  tr(text) {
    const i = LANGS[this.lang];
    if (i < 0) return null;
    const t = text.trim();
    if (!t || t.length > 160) return null;
    const hit = D[t];
    if (hit) return text.replace(t, hit[i]);
    for (const [re, out] of P) {
      const m = re.exec(t);
      if (m) return text.replace(t, t.replace(re, out[i]));
    }
    return null;
  }

  node(n) {
    if (n.nodeType !== 3) return;
    const cur = n.nodeValue;
    if (this.shown.get(n) === cur) return; // ya traducido por nosotros
    this.orig.set(n, cur);
    const out = this.tr(cur);
    if (out !== null && out !== cur) {
      this.shown.set(n, out);
      n.nodeValue = out;
    } else this.shown.delete(n);
  }

  walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return this.node(root);
    if (root.nodeType !== 1 || root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) this.node(n);
    for (const el of root.querySelectorAll?.('[placeholder],[title]') || []) this.attr(el);
  }

  attr(el) {
    for (const a of this.attrs) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const key = `data-i18n-${a}`;
      const orig = el.getAttribute(key) && el.getAttribute(`data-i18n-${a}-shown`) === v ? el.getAttribute(key) : v;
      el.setAttribute(key, orig);
      const out = this.tr(orig);
      const val = out ?? orig;
      el.setAttribute(`data-i18n-${a}-shown`, val);
      if (val !== v) el.setAttribute(a, val);
    }
  }

  // Cambia de idioma: retraduce todo (o vuelve al original).
  set(lang) {
    if (!(lang in LANGS)) lang = 'es';
    if (lang === this.lang && this.obs) return;
    this.lang = lang;
    document.documentElement.lang = lang;
    // Restaurar los originales y volver a traducir
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const o = this.orig.get(n);
      if (o !== undefined && this.shown.get(n) === n.nodeValue) {
        this.shown.delete(n);
        n.nodeValue = o;
      }
    }
    this.walk(document.body);
    if (!this.obs && lang !== 'es') {
      this.obs = new MutationObserver((list) => {
        if (this.lang === 'es') return;
        for (const r of list) {
          if (r.type === 'characterData') this.node(r.target);
          else for (const n of r.addedNodes) this.walk(n);
        }
      });
      this.obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }
}

export const i18n = new Translator();
