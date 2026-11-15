/* Slopitaire — all artwork is generated SVG (no image files). */
const Art = (() => {
  'use strict';
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  // suit order: 0 hearts, 1 diamonds, 2 clubs, 3 spades
  const INK = ['#ff4d85', '#ff6a5c', '#4a3f8f', '#2e2a5c'];
  const HAIR = ['#ffb0cd', '#ffd27d', '#9fe3cf', '#c3b4ff'];
  const OUTFIT = ['#ff7aa8', '#ff9b6a', '#5cc79c', '#8c7ce0'];
  const TINT = ['#fff0f6', '#fff4ea', '#effbf5', '#f3f0ff'];

  const HEART = 'M50 90 C22 70 4 52 4 32 C4 16 16 6 30 6 C40 6 46 12 50 20 C54 12 60 6 70 6 C84 6 96 16 96 32 C96 52 78 70 50 90Z';
  const DIAMOND = 'M50 3 C60 20 74 36 90 50 C74 64 60 80 50 97 C40 80 26 64 10 50 C26 36 40 20 50 3Z';
  const SPADE = 'M50 4 C62 22 92 38 92 60 C92 74 82 82 70 82 C62 82 56 78 53 73 C54 83 58 90 66 96 L34 96 C42 90 46 83 47 73 C44 78 38 82 30 82 C18 82 8 74 8 60 C8 38 38 22 50 4Z';
  const CLUB = '<circle cx="50" cy="28" r="20"/><circle cx="28" cy="58" r="20"/><circle cx="72" cy="58" r="20"/><circle cx="50" cy="52" r="12"/><path d="M45 50 L55 50 C55 75 60 87 68 96 L32 96 C40 87 45 75 45 50Z"/>';
  const SUIT_INNER = [`<path d="${HEART}"/>`, `<path d="${DIAMOND}"/>`, CLUB, `<path d="${SPADE}"/>`];
  // vertical "face centre" of each suit symbol, for the kawaii aces
  const FACE_Y = [42, 50, 52, 56];

  function injectDefs() {
    const syms = SUIT_INNER.map((g, i) => `<symbol id="suit${i}" viewBox="0 0 100 100">${g}</symbol>`).join('');
    document.body.insertAdjacentHTML('afterbegin',
      `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${syms}</defs></svg>`);
  }

  const use = (s, x, y, size, fill) =>
    `<use href="#suit${s}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`;

  function starPath(cx, cy, R, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rad).toFixed(2) + ' ' + (cy + Math.sin(a) * rad).toFixed(2);
    }
    return d + 'Z';
  }

  // pip layouts in a 0..100 box
  const PIPS = {
    2: [[50, 0], [50, 100]],
    3: [[50, 0], [50, 50], [50, 100]],
    4: [[0, 0], [100, 0], [0, 100], [100, 100]],
    5: [[0, 0], [100, 0], [50, 50], [0, 100], [100, 100]],
    6: [[0, 0], [100, 0], [0, 50], [100, 50], [0, 100], [100, 100]],
    7: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [0, 100], [100, 100]],
    8: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [50, 75], [0, 100], [100, 100]],
    9: [[0, 0], [100, 0], [0, 33.3], [100, 33.3], [50, 50], [0, 66.7], [100, 66.7], [0, 100], [100, 100]],
    10: [[0, 0], [100, 0], [50, 16.7], [0, 33.3], [100, 33.3], [0, 66.7], [100, 66.7], [50, 83.3], [0, 100], [100, 100]],
  };

  function corner(c, ink) {
    const r = RANKS[c.rank - 1];
    const txt = r === '10'
      ? `<text x="4" y="25" class="rk" fill="${ink}" textLength="21" lengthAdjust="spacingAndGlyphs">10</text>`
      : `<text x="7.5" y="25" class="rk" fill="${ink}">${r}</text>`;
    return txt + use(c.suit, 7, 29, 13, ink);
  }

  function pips(c, ink) {
    const size = c.rank >= 9 ? 15 : 17, h = size / 2;
    return PIPS[c.rank].map(([px, py]) => {
      const X = 33 + px / 100 * 34, Y = 38 + py / 100 * 64;
      const u = use(c.suit, (X - h).toFixed(2), (Y - h).toFixed(2), size, ink);
      return py > 50 ? `<g transform="rotate(180 ${X.toFixed(2)} ${Y.toFixed(2)})">${u}</g>` : u;
    }).join('');
  }

  function ace(c, ink) {
    const s = c.suit, Y = 36 + FACE_Y[s] * 0.6, dark = s >= 2;
    const eye = dark ? '#ffffff' : '#4a1f33';
    let g = use(s, 20, 36, 60, ink);
    g += `<ellipse cx="42" cy="${Y - 1}" rx="3" ry="3.8" fill="${eye}"/><ellipse cx="58" cy="${Y - 1}" rx="3" ry="3.8" fill="${eye}"/>`;
    if (!dark) g += `<circle cx="43" cy="${Y - 2.4}" r="1.1" fill="#fff"/><circle cx="59" cy="${Y - 2.4}" r="1.1" fill="#fff"/>`;
    g += `<ellipse cx="36" cy="${Y + 5}" rx="4" ry="2.3" fill="#ffb6cf" opacity=".9"/><ellipse cx="64" cy="${Y + 5}" rx="4" ry="2.3" fill="#ffb6cf" opacity=".9"/>`;
    g += `<path d="M46.5 ${Y + 4} Q48.2 ${Y + 6.5} 50 ${Y + 4} Q51.8 ${Y + 6.5} 53.5 ${Y + 4}" stroke="${eye}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    g += `<path d="${starPath(24, 40, 4, 1.6)}" fill="#ffd35c"/><path d="${starPath(77, 106, 3.4, 1.4)}" fill="#ffd35c"/><circle cx="76" cy="42" r="1.6" fill="#ffd35c"/>`;
    return g;
  }

  function faceArt(c) {
    const s = c.suit, hair = HAIR[s], out = OUTFIT[s], ink = INK[s], id = 'fc' + c.id, r = c.rank;
    let g = `<defs><clipPath id="${id}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>`;
    g += `<rect x="21" y="22" width="58" height="96" rx="8" fill="${TINT[s]}" stroke="${ink}" stroke-opacity=".35" stroke-width="1.2"/>`;
    g += `<g clip-path="url(#${id})">`;
    g += `<path d="${starPath(29, 31, 3, 1.2)}" fill="#ffd35c"/><path d="${starPath(72, 38, 2.2, .9)}" fill="#ffd35c"/><circle cx="68" cy="28" r="1.2" fill="#ffd35c"/>`;
    if (r === 12) g += `<path d="M27 62 Q21 98 29 120 L71 120 Q79 98 73 62 Z" fill="${hair}"/>`;
    g += `<ellipse cx="50" cy="63" rx="24" ry="23" fill="${hair}"/>`;
    if (r === 11) {
      g += `<path d="M30 58 L29 34 L45 46 Z" fill="${hair}"/><path d="M32.5 53 L32 39 L41 46 Z" fill="#ffc6da"/>`;
      g += `<path d="M70 58 L71 34 L55 46 Z" fill="${hair}"/><path d="M67.5 53 L68 39 L59 46 Z" fill="#ffc6da"/>`;
    }
    g += `<rect x="45" y="82" width="10" height="14" fill="#ffe2d4"/>`;
    g += `<path d="M23 122 Q25 98 50 94 Q75 98 77 122 Z" fill="${out}"/>`;
    g += `<path d="M42 95 L50 103 L58 95 Z" fill="#fff"/>`;
    g += use(s, 45, 105, 10, '#ffffff');
    g += `<ellipse cx="50" cy="68" rx="19" ry="18" fill="#ffe8dc"/>`;
    g += `<path d="M30 68 Q29 45 50 44 Q71 45 70 68 Q66 58 60 60 Q56 52 50 59 Q44 52 40 60 Q34 58 30 68 Z" fill="${hair}"/>`;
    // eyes
    g += `<ellipse cx="42" cy="72" rx="3.4" ry="4.4" fill="#3a2340"/><ellipse cx="58" cy="72" rx="3.4" ry="4.4" fill="#3a2340"/>`;
    g += `<circle cx="43.3" cy="70.3" r="1.35" fill="#fff"/><circle cx="59.3" cy="70.3" r="1.35" fill="#fff"/>`;
    g += `<circle cx="41.2" cy="73.8" r=".7" fill="#fff"/><circle cx="57.2" cy="73.8" r=".7" fill="#fff"/>`;
    g += `<ellipse cx="36" cy="78" rx="3.8" ry="2" fill="#ff9ab8" opacity=".75"/><ellipse cx="64" cy="78" rx="3.8" ry="2" fill="#ff9ab8" opacity=".75"/>`;
    if (r === 11) g += `<path d="M46 80.5 Q48 83 50 80.5 Q52 83 54 80.5" stroke="#3a2340" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
    else if (r === 12) g += `<path d="M47.5 80.5 Q50 83.5 52.5 80.5 Z" fill="#ff7aa2"/>`;
    else g += `<path d="M47 80.5 Q50 83 53 80.5" stroke="#3a2340" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
    if (r === 13) {
      g += `<path d="M36 47 L37 33 L43.5 40 L50 29 L56.5 40 L63 33 L64 47 Z" fill="#ffd35c" stroke="#e8a92c" stroke-width="1.2" stroke-linejoin="round"/>`;
      g += `<circle cx="50" cy="41" r="2.3" fill="${out}"/><circle cx="41" cy="43" r="1.4" fill="#fff"/><circle cx="59" cy="43" r="1.4" fill="#fff"/>`;
    } else if (r === 12) {
      g += `<path d="M37 46 Q50 36 63 46" stroke="#ffd35c" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
      g += use(s, 46, 34, 8, '#ffd35c');
      g += `<path d="M68 52 l8 -6 v12 z M68 52 l-8 -6 v12 z" fill="${out}"/><circle cx="68" cy="52" r="2.2" fill="#fff"/>`;
    } else {
      g += `<path d="M44 46 l6 -4 l6 4 l-6 4 z" fill="${out}"/>`;
    }
    g += '</g>';
    return g;
  }

  function cardFace(c) {
    const ink = INK[c.suit];
    let center;
    if (c.rank === 1) center = ace(c, ink);
    else if (c.rank <= 10) center = pips(c, ink);
    else center = faceArt(c);
    const crn = corner(c, ink);
    return `<svg class="cardsvg" viewBox="0 0 100 140" aria-hidden="true">${center}${crn}${use(c.suit, 80, 7, 13, ink)}<g transform="rotate(180 50 70)">${crn}</g></svg>`;
  }

  // ---------- card backs ----------
  function flower(cx, cy, r, fill, center = '#ffe08a') {
    let s = '';
    for (let k = 0; k < 5; k++) {
      s += `<ellipse cx="${cx}" cy="${cy - r * 0.55}" rx="${r * 0.38}" ry="${r * 0.55}" fill="${fill}" transform="rotate(${k * 72} ${cx} ${cy})"/>`;
    }
    return s + `<circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="${center}"/>`;
  }
  function paw(cx, cy, s, fill) {
    return `<ellipse cx="${cx}" cy="${cy + 1.5 * s}" rx="${2.2 * s}" ry="${1.8 * s}" fill="${fill}"/>` +
      [[-2.2, -1.1], [-0.8, -2.5], [0.8, -2.5], [2.2, -1.1]].map(([dx, dy]) =>
        `<circle cx="${cx + dx * s}" cy="${cy + dy * s}" r="${0.85 * s}" fill="${fill}"/>`).join('');
  }
  const heartAt = (x, y, sc, fill) => `<path d="${HEART}" transform="translate(${x} ${y}) scale(${sc})" fill="${fill}"/>`;

  const BACKS = {
    sakura: {
      name: 'Sakura', bg: '#ff9ec4',
      tile: flower(5, 5, 4.5, '#fff') + flower(15, 15, 3, '#ffd3e4'),
      emblem: `<circle cx="50" cy="70" r="17" fill="#fff"/>` + flower(50, 70, 13, '#ff9ec4', '#fff2a8'),
    },
    neko: {
      name: 'Neko Paws', bg: '#b6a2ff',
      tile: paw(6, 7, 1.2, '#fff') + paw(15, 16, 0.85, '#e4daff'),
      emblem: `<circle cx="50" cy="70" r="17" fill="#fff"/><path d="M38 66 L39 54 L46 60 Z M62 66 L61 54 L54 60 Z" fill="#b6a2ff"/><ellipse cx="50" cy="71" rx="12" ry="10" fill="#b6a2ff"/><circle cx="45.5" cy="70" r="1.6" fill="#fff"/><circle cx="54.5" cy="70" r="1.6" fill="#fff"/><path d="M48 74 Q49 75.5 50 74 Q51 75.5 52 74" stroke="#fff" stroke-width="1" fill="none"/>`,
    },
    stars: {
      name: 'Starry Night', bg: '#3c3a80',
      tile: `<path d="${starPath(5, 5, 3.2, 1.3)}" fill="#ffe27a"/><path d="${starPath(15, 14, 2, .8)}" fill="#fff"/><circle cx="14" cy="4" r=".7" fill="#fff"/><circle cx="4" cy="15" r=".6" fill="#c9bfff"/>`,
      emblem: `<circle cx="50" cy="70" r="17" fill="#ffe9a3"/><circle cx="56" cy="65" r="14" fill="#3c3a80"/><path d="${starPath(41, 74, 3.5, 1.4)}" fill="#3c3a80"/>`,
    },
    hearts: {
      name: 'Mint Hearts', bg: '#79d6bb',
      tile: heartAt(1.5, 2, 0.07, '#fff') + heartAt(11.5, 12, 0.055, '#ffd6e5'),
      emblem: `<circle cx="50" cy="70" r="17" fill="#fff"/>` + heartAt(39, 60, 0.22, '#ff8fb8'),
    },
  };

  const backCache = new Map();
  function backDataURI(kind) {
    const key = Object.prototype.hasOwnProperty.call(BACKS, kind) ? kind : 'sakura';
    let uri = backCache.get(key);
    if (uri !== undefined) return uri;
    const P = BACKS[key];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><defs><pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse">${P.tile}</pattern></defs>` +
      `<rect width="100" height="140" rx="10" fill="#fff"/><rect x="5" y="5" width="90" height="130" rx="7" fill="${P.bg}"/>` +
      `<rect x="5" y="5" width="90" height="130" rx="7" fill="url(#p)"/>` +
      `<rect x="9" y="9" width="82" height="122" rx="5" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 3" opacity=".85"/>${P.emblem}</svg>`;
    uri = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
    backCache.set(key, uri);
    return uri;
  }

  // ---------- mascot: Mochi the neko ----------
  let mascotSVGCache = '';
  function mascotSVG() {
    if (mascotSVGCache) return mascotSVGCache;
    const L = '#5a3d5c';
    mascotSVGCache = `<svg viewBox="0 0 120 112" class="chara mochi" aria-hidden="true">
      <g class="m-tail"><path d="M100 92 Q118 80 112 62" stroke="${L}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M100 92 Q118 80 112 62" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/></g>
      <path d="M18 44 L21 7 L50 28 Z" fill="#fff" stroke="${L}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M25 35 L26.5 16 L42 28 Z" fill="#ffb3cf"/>
      <path d="M102 44 L99 7 L70 28 Z" fill="#fff" stroke="${L}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M95 35 L93.5 16 L78 28 Z" fill="#ffb3cf"/>
      <ellipse cx="60" cy="64" rx="50" ry="42" fill="#fff" stroke="${L}" stroke-width="3"/>
      <g class="m-bow"><path d="M84 22 L74 14 L74 30 Z M84 22 L94 14 L94 30 Z" fill="#ff7aa8" stroke="${L}" stroke-width="2" stroke-linejoin="round"/><circle cx="84" cy="22" r="3.5" fill="#ffd35c" stroke="${L}" stroke-width="2"/></g>
      <g class="eyes-open">
        <ellipse cx="40" cy="62" rx="7" ry="9" fill="#3b2440"/><ellipse cx="80" cy="62" rx="7" ry="9" fill="#3b2440"/>
        <circle cx="42.5" cy="58" r="3" fill="#fff"/><circle cx="82.5" cy="58" r="3" fill="#fff"/>
        <circle cx="38" cy="66" r="1.5" fill="#fff"/><circle cx="78" cy="66" r="1.5" fill="#fff"/>
      </g>
      <g class="eyes-happy" fill="none" stroke="#3b2440" stroke-width="3.5" stroke-linecap="round">
        <path d="M32 64 Q40 53 48 64"/><path d="M72 64 Q80 53 88 64"/>
      </g>
      <g class="eyes-oops" fill="none" stroke="#3b2440" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M33 56 L46 62 L33 68"/><path d="M87 56 L74 62 L87 68"/>
      </g>
      <g class="eyes-sad">
        <ellipse cx="40" cy="64" rx="6" ry="7" fill="#3b2440"/><ellipse cx="80" cy="64" rx="6" ry="7" fill="#3b2440"/>
        <circle cx="42" cy="61" r="2.4" fill="#fff"/><circle cx="82" cy="61" r="2.4" fill="#fff"/>
        <path d="M30 52 L46 56 M90 52 L74 56" stroke="#3b2440" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M34 73 q-2 6 1 8 q3 -2 1 -8z" fill="#8fd3ff"/>
      </g>
      <g class="eyes-wink">
        <ellipse cx="40" cy="62" rx="7" ry="9" fill="#3b2440"/><circle cx="42.5" cy="58" r="3" fill="#fff"/>
        <path d="M72 64 Q80 53 88 64" fill="none" stroke="#3b2440" stroke-width="3.5" stroke-linecap="round"/>
      </g>
      <path class="mouth-sad" d="M53 78 Q60 72 67 78" stroke="#3b2440" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <ellipse cx="28" cy="76" rx="8" ry="4.5" fill="#ffa3c4" opacity=".85"/><ellipse cx="92" cy="76" rx="8" ry="4.5" fill="#ffa3c4" opacity=".85"/>
      <path class="mouth-w" d="M52 74 Q56 79.5 60 74 Q64 79.5 68 74" stroke="#3b2440" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="mouth-open" d="M53 74 Q60 88 67 74 Z" fill="#ff7aa2" stroke="#3b2440" stroke-width="2.4" stroke-linejoin="round"/>
      <g stroke="${L}" stroke-width="2" stroke-linecap="round"><path d="M6 66 L20 69"/><path d="M6 76 L20 74"/><path d="M114 66 L100 69"/><path d="M114 76 L100 74"/></g>
    </svg>`;
    return mascotSVGCache;
  }

  return { injectDefs, cardFace, backDataURI, mascotSVG, BACKS, RANKS };
})();
