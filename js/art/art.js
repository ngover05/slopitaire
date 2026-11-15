/* Slopitaire — card fronts, backs, and Mochi mascot art (classic vector SVG + cyber & cast decks). */
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

  // Angular faceted suit variants for Cyber & Kira netrunner decks.
  const CSUIT_INNER = [
    '<path d="M50 92 L12 52 L6 30 L22 10 L42 10 L50 22 L58 10 L78 10 L94 30 L88 52 Z"/>',
    '<path d="M50 3 L89 50 L50 97 L11 50 Z"/>',
    '<path d="M50 6 L69 25 L59 43 L74 40 L93 58 L74 77 L55 64 L62 96 L38 96 L45 64 L26 77 L7 58 L26 40 L41 43 L31 25 Z"/>',
    '<path d="M50 4 L92 56 L77 79 L57 72 L65 96 L35 96 L43 72 L23 79 L8 56 Z"/>',
  ];

  // vertical "face centre" of each suit symbol, for the kawaii aces
  const FACE_Y = [42, 50, 52, 56];

  function injectDefs() {
    if (document.getElementById('artSuitDefs')) return;
    const syms = SUIT_INNER.map((g, i) => `<symbol id="suit${i}" viewBox="0 0 100 100">${g}</symbol>`).join('');
    const csyms = CSUIT_INNER.map((g, i) => `<symbol id="csuit${i}" viewBox="0 0 100 100">${g}</symbol>`).join('');
    document.body.insertAdjacentHTML('afterbegin',
      `<svg id="artSuitDefs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${syms}${csyms}</defs></svg>`);
  }

  const use = (s, x, y, size, fill, prefix = 'suit') =>
    `<use href="#${prefix}${s}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`;

  function starPath(cx, cy, R, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rad).toFixed(2) + ' ' + (cy + Math.sin(a) * rad).toFixed(2);
    }
    return d + 'Z';
  }

  function star4Path(cx, cy, R, r) {
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4, rad = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rad).toFixed(2) + ' ' + (cy + Math.sin(a) * rad).toFixed(2);
    }
    return d + 'Z';
  }

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

  function clover(cx, cy, r, fill) {
    const o = r * 0.48, lr = r * 0.45;
    return [[-o, -o * 0.3], [o, -o * 0.3], [-o * 0.65, o * 0.85], [o * 0.65, o * 0.85]].map(([dx, dy]) =>
      `<circle cx="${(cx + dx).toFixed(2)}" cy="${(cy + dy).toFixed(2)}" r="${lr.toFixed(2)}" fill="${fill}"/>`).join('') +
      `<path d="M${cx} ${cy + r * 0.2} Q${cx + r * 0.2} ${cy + r * 1.1} ${cx - r * 0.15} ${cy + r * 1.4}" stroke="${fill}" stroke-width="${(r * 0.22).toFixed(2)}" fill="none" stroke-linecap="round"/>`;
  }

  function butterfly(cx, cy, s, fill, accent = '#fff4c8') {
    return `<g transform="translate(${cx} ${cy}) scale(${s})">` +
      `<ellipse cx="-6.5" cy="-3.5" rx="6.5" ry="5" transform="rotate(-24 -6.5 -3.5)" fill="${fill}"/>` +
      `<ellipse cx="6.5" cy="-3.5" rx="6.5" ry="5" transform="rotate(24 6.5 -3.5)" fill="${fill}"/>` +
      `<ellipse cx="-5" cy="4.2" rx="4.5" ry="3.5" transform="rotate(22 -5 4.2)" fill="${fill}" opacity=".88"/>` +
      `<ellipse cx="5" cy="4.2" rx="4.5" ry="3.5" transform="rotate(-22 5 4.2)" fill="${fill}" opacity=".88"/>` +
      `<circle cx="-6.5" cy="-3.5" r="2" fill="${accent}" opacity=".75"/><circle cx="6.5" cy="-3.5" r="2" fill="${accent}" opacity=".75"/>` +
      `<rect x="-1.2" y="-6.5" width="2.4" height="13" rx="1.2" fill="#4a2f27"/>` +
      `</g>`;
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

  function corner(c, ink, prefix = 'suit') {
    const r = RANKS[c.rank - 1];
    const txt = r === '10'
      ? `<text x="4" y="25" class="rk" fill="${ink}" textLength="21" lengthAdjust="spacingAndGlyphs">10</text>`
      : `<text x="7.5" y="25" class="rk" fill="${ink}">${r}</text>`;
    return txt + use(c.suit, 7, 29, 13, ink, prefix);
  }

  function pips(c, ink, prefix = 'suit') {
    const size = c.rank >= 9 ? 15 : 17, h = size / 2;
    return PIPS[c.rank].map(([px, py]) => {
      const X = 33 + px / 100 * 34, Y = 38 + py / 100 * 64;
      const u = use(c.suit, (X - h).toFixed(2), (Y - h).toFixed(2), size, ink, prefix);
      return py > 50 ? `<g transform="rotate(180 ${X.toFixed(2)} ${Y.toFixed(2)})">${u}</g>` : u;
    }).join('');
  }

  function classicAce(c, ink) {
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

  function classicFaceArt(c) {
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

  // ---------- 10 card fronts metadata ----------
  const FRONTS = {
    classic: {
      name: 'Classic', subtitle: 'ORIGINAL KAWAII', dark: false,
      bg: 'linear-gradient(180deg, #ffffff 0%, #f7faf9 100%)',
      border: 'rgba(135, 165, 160, .45)',
      font: "'Mochiy Pop One', 'Nunito', sans-serif", weight: '400',
      suitPrefix: 'suit', previewSuit: 0,
      ink: INK, tint: TINT, accent: '#ffd35c',
    },
    cyber: {
      name: 'Cyber', subtitle: 'NEON GRID PROTOCOL', dark: true,
      bg: 'linear-gradient(180deg, #091320 0%, #0d1f33 55%, #08101c 100%)',
      border: 'rgba(0, 240, 255, .52)',
      font: "'Orbitron', 'Chakra Petch', sans-serif", weight: '700',
      suitPrefix: 'csuit', previewSuit: 3,
      ink: ['#ff2a85', '#ff6b3d', '#00f0ff', '#78a9ff'],
      tint: ['#1f0c1d', '#211210', '#071d29', '#0c162b'],
      accent: '#00f0ff',
    },
    sakura: {
      name: 'Sakura', subtitle: 'PRISM STAGE IDOL', dark: false,
      bg: 'linear-gradient(180deg, #fffafd 0%, #fff0f7 100%)',
      border: 'rgba(255, 115, 168, .52)',
      font: "'Mochiy Pop One', 'Nunito', sans-serif", weight: '400',
      suitPrefix: 'suit', previewSuit: 0,
      ink: ['#ff3d7f', '#ff6e4a', '#284b9e', '#1e2f6e'],
      tint: ['#ffe6f1', '#ffece4', '#e6eeff', '#e8ebff'],
      accent: '#ffd35c',
      portraits: ['images/sakura/default/corner_wink.webp', 'images/sakura/default/corner_starry.webp', 'images/sakura/default/corner_cheer.webp'],
    },
    yuki: {
      name: 'Yuki', subtitle: 'PRISM TACTICAL AI', dark: false,
      bg: 'linear-gradient(180deg, #f7fbff 0%, #eaf3fc 100%)',
      border: 'rgba(116, 162, 218, .55)',
      font: "'Chakra Petch', 'Nunito', sans-serif", weight: '700',
      suitPrefix: 'suit', previewSuit: 3,
      ink: ['#e03e6b', '#eb6448', '#2c538a', '#1d3259'],
      tint: ['#fbe9ef', '#fcedea', '#e4effa', '#e3eaf7'],
      accent: '#7cc4ff',
      portraits: ['images/yuki/default/corner_smug.webp', 'images/yuki/default/corner_wink.webp', 'images/yuki/default/corner_hype.webp'],
    },
    rin: {
      name: 'Rin', subtitle: 'RIVAL CYBER ACE', dark: true,
      bg: 'linear-gradient(180deg, #17132e 0%, #22193d 55%, #130f26 100%)',
      border: 'rgba(255, 79, 112, .55)',
      font: "'Chakra Petch', 'Nunito', sans-serif", weight: '700',
      suitPrefix: 'suit', previewSuit: 0,
      ink: ['#ff476e', '#ff8538', '#b8abff', '#7ec8ff'],
      tint: ['#30142a', '#301c1c', '#211c45', '#192445'],
      accent: '#ff476e', portraitDx: 4,
      portraits: ['images/rin/default/corner_smug.webp', 'images/rin/default/corner_wink.webp', 'images/rin/default/corner_hype.webp'],
    },
    mio: {
      name: 'Mio', subtitle: 'SHY SOUNDSCAPE', dark: false,
      bg: 'linear-gradient(180deg, #f9fffc 0%, #ecf8f2 100%)',
      border: 'rgba(98, 186, 154, .52)',
      font: "'Nunito', 'Mochiy Pop One', sans-serif", weight: '800',
      suitPrefix: 'suit', previewSuit: 2,
      ink: ['#e85278', '#e87654', '#236b59', '#1c4742'],
      tint: ['#fdf0f3', '#fef2ec', '#e3f6ef', '#e2f0ee'],
      accent: '#5cc79c',
      portraits: ['images/mio/default/corner_wink.webp', 'images/mio/default/corner_special.webp', 'images/mio/default/corner_cheer.webp'],
    },
    ayame: {
      name: 'Ayame', subtitle: 'VELVET DEVOTION', dark: true,
      bg: 'linear-gradient(180deg, #180913 0%, #240d1c 55%, #12060e 100%)',
      border: 'rgba(224, 48, 96, .58)',
      font: "'Nunito', Georgia, serif", weight: '800',
      suitPrefix: 'suit', previewSuit: 0,
      ink: ['#ff2e68', '#ff6488', '#dfd4f5', '#b9a5e8'],
      tint: ['#330c1d', '#331222', '#231630', '#1e132b'],
      accent: '#ff2e68',
      portraits: ['images/ayame/default/corner_smug.webp', 'images/ayame/default/corner_special.webp', 'images/ayame/default/corner_hype.webp'],
    },
    kira: {
      name: 'Kira', subtitle: 'AURA NETRUNNER', dark: true,
      bg: 'linear-gradient(180deg, #0a1518 0%, #0f2226 55%, #081114 100%)',
      border: 'rgba(44, 232, 162, .52)',
      font: "'Orbitron', 'Chakra Petch', sans-serif", weight: '700',
      suitPrefix: 'csuit', previewSuit: 2,
      ink: ['#ff4d6d', '#ff9638', '#2ce8a2', '#75ffd1'],
      tint: ['#291119', '#291a10', '#0a2920', '#0e2b25'],
      accent: '#ffd35c',
      portraits: ['images/kira/default/corner_smug.webp', 'images/kira/default/corner_special.webp', 'images/kira/default/corner_hype.webp'],
    },
    kaede: {
      name: 'Kaede', subtitle: 'WARM ONEE-SAN PARLOR', dark: false,
      bg: 'linear-gradient(180deg, #fffdf8 0%, #faefd9 100%)',
      border: 'rgba(198, 148, 92, .55)',
      font: "'Nunito', Georgia, sans-serif", weight: '800',
      suitPrefix: 'suit', previewSuit: 1,
      ink: ['#d4425c', '#db6c37', '#59362b', '#362328'],
      tint: ['#fcebe9', '#fdefe3', '#f3e8de', '#eee4e2'],
      accent: '#e5a93b',
      portraits: ['images/kaede/default/corner_wink.webp', 'images/kaede/default/corner_special.webp', 'images/kaede/default/corner_cheer.webp'],
    },
    mochi: {
      name: 'Mochi', subtitle: 'LUCKY CYBER NEKO', dark: false,
      bg: 'linear-gradient(180deg, #fffcff 0%, #f8eefb 100%)',
      border: 'rgba(168, 128, 186, .52)',
      font: "'Mochiy Pop One', 'Nunito', sans-serif", weight: '400',
      suitPrefix: 'suit', previewSuit: 0,
      ink: ['#ff548e', '#ff7b4c', '#634075', '#3d2852'],
      tint: ['#ffeaf3', '#fff0e6', '#f2e8f9', '#ece6f7'],
      accent: '#ffd35c',
    },
  };

  // Subtle perimeter rails (kept clear of rank corners so fanned piles stay unobstructed) + optional center pip watermark.
  function deckFrame(key, F, ink, isPip) {
    const ac = F.accent;
    let rail = '';
    if (key === 'cyber') {
      rail = `<path d="M31 4.5 H69 M31 135.5 H69" stroke="${ac}" stroke-width="1.1" stroke-opacity=".42"/>` +
        `<path d="M4.5 48 V92 M95.5 48 V92" stroke="${ink}" stroke-width="1" stroke-dasharray="4 3" stroke-opacity=".35"/>` +
        `<polygon points="50,2.5 53,5 50,7.5 47,5" fill="${ac}" opacity=".75"/>` +
        `<polygon points="50,132.5 53,135 50,137.5 47,135" fill="${ac}" opacity=".75"/>`;
    } else if (key === 'sakura') {
      rail = `<path d="M31 5 H69 M31 135 H69" stroke="${ink}" stroke-width=".9" stroke-opacity=".28"/>` +
        flower(50, 5.2, 3.1, '#ff7aa8', '#ffd35c') + flower(50, 134.8, 3.1, '#ff7aa8', '#ffd35c');
    } else if (key === 'yuki') {
      rail = `<path d="M31 4.5 H69 M31 135.5 H69" stroke="${ac}" stroke-width="1" stroke-opacity=".5"/>` +
        `<path d="M39 3.2 V6 M61 3.2 V6 M39 134 V136.8 M61 134 V136.8" stroke="${ink}" stroke-width="1" stroke-opacity=".4"/>` +
        `<path d="${star4Path(50, 5, 3.2, 1)}" fill="${ac}"/>` + `<path d="${star4Path(50, 135, 3.2, 1)}" fill="${ac}"/>`;
    } else if (key === 'rin') {
      rail = `<path d="M31 4.5 H44 L47 2.5 L53 6.5 L56 4.5 H69 M31 135.5 H44 L47 137.5 L53 133.5 L56 135.5 H69" stroke="${ac}" stroke-width="1.1" fill="none" stroke-opacity=".55"/>`;
    } else if (key === 'mio') {
      rail = `<path d="M31 5 H69 M31 135 H69" stroke="${ac}" stroke-width="1" stroke-dasharray="3 3" stroke-opacity=".45"/>` +
        clover(50, 4.6, 2.5, ac) + `<g transform="rotate(180 50 135)">${clover(50, 134.6, 2.5, ac)}</g>`;
    } else if (key === 'ayame') {
      rail = `<path d="M31 4.5 H69 M31 135.5 H69" stroke="${ink}" stroke-width=".9" stroke-opacity=".42"/>` +
        `<polygon points="50,2.5 52.8,5 50,7.5 47.2,5" fill="${ac}" opacity=".85"/>` +
        `<polygon points="50,132.5 52.8,135 50,137.5 47.2,135" fill="${ac}" opacity=".85"/>`;
    } else if (key === 'kira') {
      rail = `<path d="M31 5 H43 L46 3 H54 L57 5 H69 M31 135 H43 L46 137 H54 L57 135 H69" stroke="${ink}" stroke-width="1" fill="none" stroke-opacity=".42"/>` +
        `<circle cx="50" cy="4.2" r="1.4" fill="${ac}"/><circle cx="50" cy="135.8" r="1.4" fill="${ac}"/>`;
    } else if (key === 'kaede') {
      rail = `<path d="M31 5.5 Q50 2.5 69 5.5 M31 134.5 Q50 137.5 69 134.5" stroke="${ac}" stroke-width="1" fill="none" stroke-opacity=".5"/>` +
        `<circle cx="50" cy="4.5" r="1.5" fill="${ac}"/><circle cx="50" cy="135.5" r="1.5" fill="${ac}"/>`;
    } else if (key === 'mochi') {
      rail = `<path d="M31 5 H69 M31 135 H69" stroke="${ink}" stroke-width="1" stroke-dasharray="2.5 3" stroke-opacity=".28"/>` +
        paw(50, 4.8, 1.05, '#ff7aa8') + `<g transform="rotate(180 50 135)">${paw(50, 134.8, 1.05, '#ff7aa8')}</g>`;
    }

    if (!isPip) return rail;
    let wm = '';
    if (key === 'cyber' || key === 'kira') {
      wm = `<polygon points="50,51 66,60.5 66,79.5 50,89 34,79.5 34,60.5" fill="none" stroke="${ink}" stroke-width="1.3" stroke-opacity=".12"/>` +
        `<circle cx="50" cy="70" r="9" fill="none" stroke="${ac}" stroke-width=".9" stroke-opacity=".11"/>`;
    } else if (key === 'sakura') {
      wm = `<g opacity=".11">${flower(50, 70, 18, ink, ac)}</g>`;
    } else if (key === 'yuki') {
      wm = `<g opacity=".12"><circle cx="50" cy="70" r="15" fill="none" stroke="${ac}" stroke-width="1.3"/><path d="${star4Path(50, 70, 17, 3)}" fill="${ink}"/></g>`;
    } else if (key === 'rin') {
      wm = `<g opacity=".12"><path d="M52 50 L41 72 H50 L47 90 L59 68 H50 Z" fill="${ink}"/></g>`;
    } else if (key === 'mio') {
      wm = `<g opacity=".11" fill="${ac}"><rect x="37" y="64" width="3" height="12" rx="1.5"/><rect x="43" y="56" width="3" height="28" rx="1.5"/><rect x="49" y="52" width="3" height="36" rx="1.5"/><rect x="55" y="58" width="3" height="24" rx="1.5"/><rect x="61" y="65" width="3" height="10" rx="1.5"/></g>`;
    } else if (key === 'ayame') {
      wm = `<g opacity=".13"><polygon points="50,50 66,70 50,90 34,70" fill="none" stroke="${ink}" stroke-width="1.4"/>${heartAt(41, 61, 0.18, ink)}</g>`;
    } else if (key === 'kaede') {
      wm = `<g opacity=".13">${butterfly(50, 70, 1.35, ac, '#fff8eb')}</g>`;
    } else if (key === 'mochi') {
      wm = `<g opacity=".12">${paw(50, 68, 4.4, ink)}</g>`;
    }
    return rail + wm;
  }

  // ---------- bespoke themed Aces ----------
  function themedAce(c, key, F, ink) {
    const s = c.suit, pfx = F.suitPrefix, ac = F.accent;
    const base = use(s, 22, 39, 56, ink, pfx);

    if (key === 'cyber') {
      return `<circle cx="50" cy="68" r="34" fill="none" stroke="${ac}" stroke-width="1.2" stroke-dasharray="9 4 3 4" opacity=".62"/>` +
        `<circle cx="50" cy="68" r="27" fill="none" stroke="${ink}" stroke-width=".9" opacity=".32"/>` +
        `<path d="M23 48 L29 42 H40 M77 48 L71 42 H60 M23 88 L29 94 H40 M77 88 L71 94 H60" stroke="${ac}" stroke-width="1.3" fill="none" opacity=".75"/>` +
        base +
        `<path d="M35 61 H65 L61 68 H39 Z" fill="#091320" stroke="${ac}" stroke-width="1.2"/>` +
        `<line x1="41" y1="64.5" x2="59" y2="64.5" stroke="${ac}" stroke-width="1.6" stroke-linecap="round"/>` +
        `<path d="${star4Path(76, 42, 4, 1.2)}" fill="${ac}"/><path d="${star4Path(24, 96, 3.6, 1.1)}" fill="${ink}"/>`;
    }
    if (key === 'sakura') {
      return `<circle cx="50" cy="68" r="31" fill="${F.tint[s]}" opacity=".85"/>` +
        base +
        `<g transform="translate(65 44) rotate(12)">${flower(0, 0, 9.5, '#ffffff', '#ffd35c')}${flower(0, 0, 7.4, '#ffb3cf', '#ffe678')}</g>` +
        `<g transform="translate(50 96)">` +
        `<path d="M0 0 L-10 -5 L-9 5 Z M0 0 L10 -5 L9 5 Z" fill="#ff5c93" stroke="#ffffff" stroke-width="1"/>` +
        `<circle cx="0" cy="0" r="2.6" fill="#ffd35c"/>` +
        `</g>` +
        `<path d="${starPath(25, 44, 4, 1.6)}" fill="#ffd35c"/><path d="${starPath(75, 98, 3.6, 1.4)}" fill="#ffd35c"/>`;
    }
    if (key === 'yuki') {
      return `<circle cx="50" cy="68" r="33" fill="none" stroke="${ac}" stroke-width="1.2" stroke-dasharray="14 5" opacity=".72"/>` +
        `<path d="M50 31 V37 M50 99 V105 M14 68 H20 M80 68 H86" stroke="${ink}" stroke-width="1.3" stroke-opacity=".55" stroke-linecap="round"/>` +
        base +
        `<path d="${star4Path(30, 44, 5.5, 1.7)}" fill="#9fd4ff" stroke="${ink}" stroke-width=".9"/>` +
        `<path d="${star4Path(69, 44, 5.2, 1.6)}" fill="#ffd35c" stroke="#c98a1c" stroke-width=".8"/>` +
        `<circle cx="50" cy="68" r="3.4" fill="#ffffff" stroke="${ink}" stroke-width="1.1"/>`;
    }
    if (key === 'rin') {
      return `<circle cx="50" cy="68" r="32" fill="${F.tint[s]}" stroke="${ac}" stroke-width="1" stroke-opacity=".42"/>` +
        `<path d="M29 50 L27 29 L43 43 Z" fill="#3b2c6b" stroke="${ac}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="M31.5 45 L30.5 34.5 L39 42 Z" fill="#ff7aa8"/>` +
        `<path d="M71 50 L73 29 L57 43 Z" fill="#3b2c6b" stroke="${ac}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="M68.5 45 L69.5 34.5 L61 42 Z" fill="#ff7aa8"/>` +
        base +
        `<circle cx="67" cy="44" r="3.4" fill="#ff476e" stroke="#ffd8e0" stroke-width=".9"/>` +
        `<circle cx="71.5" cy="48.5" r="2.9" fill="#ff476e" stroke="#ffd8e0" stroke-width=".9"/>` +
        `<path d="M26 84 L20 97 H26 L23 107 L32 94 H26 Z" fill="#ffd35c"/>` +
        `<path d="M75 62 L81 71 H76 L79 80 L71 71 H75 Z" fill="${ac}"/>`;
    }
    if (key === 'mio') {
      return `<circle cx="50" cy="69" r="31" fill="${F.tint[s]}"/>` +
        `<path d="M22 65 Q22 33 50 33 Q78 33 78 65" fill="none" stroke="#eef7f1" stroke-width="5.2" stroke-linecap="round"/>` +
        `<path d="M22 65 Q22 33 50 33 Q78 33 78 65" fill="none" stroke="${ac}" stroke-width="2" stroke-linecap="round"/>` +
        base +
        `<rect x="16" y="57" width="8.5" height="17" rx="4.2" fill="#ffffff" stroke="${ac}" stroke-width="1.5"/>` +
        `<rect x="75.5" y="57" width="8.5" height="17" rx="4.2" fill="#ffffff" stroke="${ac}" stroke-width="1.5"/>` +
        clover(68, 43, 5.2, '#43b884') +
        `<path d="M24 96 V86 L31 84 V94" stroke="${ink}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
        `<circle cx="22.5" cy="96.5" r="2.2" fill="${ink}"/><circle cx="29.5" cy="94.5" r="2.2" fill="${ink}"/>`;
    }
    if (key === 'ayame') {
      return `<polygon points="50,33 83,68 50,103 17,68" fill="${F.tint[s]}" stroke="${ac}" stroke-width="1.1" stroke-opacity=".55"/>` +
        base +
        `<g transform="translate(29 45) rotate(-25)">` +
        `<path d="M0 0 L-7 -4 L-6 4 Z M0 0 L7 -4 L6 4 Z" fill="#6e1231" stroke="#ff668e" stroke-width=".9"/>` +
        `<circle cx="0" cy="0" r="1.9" fill="#ff2e68"/></g>` +
        `<g transform="translate(71 45) rotate(25)">` +
        `<path d="M0 0 L-7 -4 L-6 4 Z M0 0 L7 -4 L6 4 Z" fill="#6e1231" stroke="#ff668e" stroke-width=".9"/>` +
        `<circle cx="0" cy="0" r="1.9" fill="#ff2e68"/></g>` +
        `<circle cx="50" cy="69" r="7.5" fill="#180913" stroke="#ffd35c" stroke-width="1.2"/>` +
        `<circle cx="50" cy="67.5" r="1.9" fill="${ac}"/><path d="M48.5 73 L50 68 L51.5 73 Z" fill="${ac}"/>`;
    }
    if (key === 'kira') {
      return `<polygon points="50,34 79,51 79,85 50,102 21,85 21,51" fill="${F.tint[s]}" stroke="${ink}" stroke-width="1.1" stroke-opacity=".45"/>` +
        `<path d="M18 52 H27 L32 58 M82 52 H73 L68 58 M18 84 H27 L32 78 M82 84 H73 L68 78" stroke="#2ce8a2" stroke-width="1.2" fill="none" opacity=".7"/>` +
        base +
        `<path d="M30 57 H70 L66 67 H34 Z" fill="#123d32" fill-opacity=".88" stroke="#ffd35c" stroke-width="1.4" stroke-linejoin="round"/>` +
        `<line x1="36" y1="62" x2="64" y2="62" stroke="#75ffd1" stroke-width="1.4" stroke-dasharray="6 3"/>`;
    }
    if (key === 'kaede') {
      return `<circle cx="50" cy="68" r="31" fill="${F.tint[s]}" stroke="${ac}" stroke-width="1" stroke-dasharray="3 3" stroke-opacity=".6"/>` +
        base +
        butterfly(66, 44, 0.95, '#f0b13b', '#fff5d1') +
        `<path d="M23 94 Q28 89 33 94 Q28 99 23 94 Z" fill="#6da86b" opacity=".85"/>` +
        `<circle cx="75" cy="96" r="2" fill="${ac}"/><circle cx="25" cy="46" r="1.6" fill="${ac}"/>`;
    }
    // mochi: lucky white cat ears + pink bow & gold bell + eyes, w mouth & whiskers!
    const L = '#5a3d5c', Y = +(39 + FACE_Y[s] * 0.56).toFixed(1);
    return `<circle cx="50" cy="69" r="31" fill="${F.tint[s]}"/>` +
      `<path d="M26 52 L28 29 L43 43 Z" fill="#fff" stroke="${L}" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M30 47 L31 35 L39 43 Z" fill="#ffb3cf"/>` +
      `<path d="M74 52 L72 29 L57 43 Z" fill="#fff" stroke="${L}" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M70 47 L69 35 L61 43 Z" fill="#ffb3cf"/>` +
      base +
      `<g transform="translate(68 41)">` +
      `<path d="M0 0 L-7 -5 L-7 5 Z M0 0 L7 -5 L7 5 Z" fill="#ff7aa8" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<circle cx="0" cy="0" r="2.6" fill="#ffd35c" stroke="${L}" stroke-width="1.2"/></g>` +
      `<circle cx="42" cy="${Y - 3}" r="2.3" fill="#fff"/><circle cx="58" cy="${Y - 3}" r="2.3" fill="#fff"/>` +
      `<path d="M45 ${Y + 3} Q47.5 ${Y + 6.5} 50 ${Y + 3} Q52.5 ${Y + 6.5} 55 ${Y + 3}" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="36" cy="${Y + 2}" rx="3.4" ry="1.9" fill="#ffb6cf" opacity=".92"/><ellipse cx="64" cy="${Y + 2}" rx="3.4" ry="1.9" fill="#ffb6cf" opacity=".92"/>` +
      `<g stroke="${L}" stroke-width="1.4" stroke-linecap="round"><path d="M13 65 L22 67"/><path d="M13 72 L22 71"/><path d="M87 65 L78 67"/><path d="M87 72 L78 71"/></g>`;
  }

  // ---------- bespoke Cyber vector court cards (J/Q/K) ----------
  function cyberCourtArt(c, F) {
    const s = c.suit, ink = F.ink[s], ac = F.accent, id = 'fc_cyber_' + c.id, r = c.rank;
    let g = `<defs><clipPath id="${id}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>`;
    g += `<rect x="21" y="22" width="58" height="96" rx="8" fill="${F.tint[s]}" stroke="${ink}" stroke-opacity=".65" stroke-width="1.3"/>`;
    g += `<g clip-path="url(#${id})">`;
    g += `<path d="M21 42 H79 M21 96 H79 M50 22 V118" stroke="${ac}" stroke-width=".6" stroke-opacity=".18"/>`;
    g += `<path d="${star4Path(30, 32, 3, .9)}" fill="${ac}" opacity=".85"/><path d="${star4Path(70, 34, 2.5, .8)}" fill="${ink}" opacity=".85"/>`;
    if (r === 12) {
      g += `<path d="M25 60 L20 118 H80 L75 60 Q50 38 25 60 Z" fill="#13253d" stroke="${ac}" stroke-width="1.1"/>`;
    }
    // armor / mantle shoulders
    g += `<path d="M21 120 L26 95 L41 91 L50 97 L59 91 L74 95 L79 120 Z" fill="#142942" stroke="${ink}" stroke-width="1.4"/>`;
    g += `<path d="M32 95 L41 104 L50 99 L59 104 L68 95" fill="none" stroke="${ac}" stroke-width="1.3"/>`;
    // neck + cyber chin/helmet head
    g += `<rect x="45" y="81" width="10" height="12" fill="#1d3554"/>`;
    g += `<polygon points="50,43 66,54 64,77 50,86 36,77 34,54" fill="#d8ecff" stroke="#0d1e33" stroke-width="1.4"/>`;
    if (r === 13) {
      // Mainframe King: 3-spire data crown + armored T-visor
      g += `<path d="M35 53 L34 33 L42 42 L50 27 L58 42 L66 33 L65 53 Z" fill="#091320" stroke="#ffd35c" stroke-width="1.4" stroke-linejoin="round"/>`;
      g += `<circle cx="50" cy="42" r="2.2" fill="${ink}"/><circle cx="39" cy="46" r="1.4" fill="${ac}"/><circle cx="61" cy="46" r="1.4" fill="${ac}"/>`;
      g += `<path d="M35 60 H65 L61 68 H52 L50 75 L48 68 H39 Z" fill="#091320" stroke="${ac}" stroke-width="1.2"/>`;
      g += `<line x1="39" y1="64" x2="61" y2="64" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/>`;
    } else if (r === 12) {
      // Holo Empress: floating neural halo crown + wide glowing visor
      g += `<path d="M33 43 Q50 29 67 43" fill="none" stroke="#ffd35c" stroke-width="2" stroke-linecap="round"/>`;
      g += use(s, 45.5, 31, 9, ink, 'csuit');
      g += `<path d="M35 61 Q50 57 65 61 L63 68 Q50 65 37 68 Z" fill="#091320" stroke="${ink}" stroke-width="1.2"/>`;
      g += `<circle cx="43" cy="64" r="1.6" fill="${ac}"/><circle cx="57" cy="64" r="1.6" fill="${ac}"/>`;
      g += `<path d="M47 76 Q50 78.5 53 76" stroke="#22354f" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    } else {
      // Cyber Striker (J): sleek angled hood + tactical mono-visor slit
      g += `<path d="M33 56 L50 38 L67 56 L62 49 L50 45 L38 49 Z" fill="${ink}" opacity=".9"/>`;
      g += `<polygon points="36,59 64,62 61,68 38,65" fill="#091320" stroke="${ac}" stroke-width="1.2"/>`;
      g += `<line x1="40" y1="62.5" x2="60" y2="64.5" stroke="${ac}" stroke-width="1.7" stroke-linecap="round"/>`;
      g += `<path d="M46 76 L54 74.5" stroke="#22354f" stroke-width="1.3" stroke-linecap="round"/>`;
    }
    g += use(s, 44.5, 104.5, 11, ink, 'csuit');
    g += '</g>';
    return g;
  }

  // ---------- bespoke Mochi (the cat) vector court cards (J/Q/K) ----------
  function mochiCourtArt(c, F) {
    const s = c.suit, ink = F.ink[s], L = '#5a3d5c', id = 'fc_mochi_' + c.id, r = c.rank;
    let g = `<defs><clipPath id="${id}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>`;
    g += `<rect x="21" y="22" width="58" height="96" rx="8" fill="${F.tint[s]}" stroke="${ink}" stroke-opacity=".45" stroke-width="1.3"/>`;
    g += `<g clip-path="url(#${id})">`;
    g += `<path d="${starPath(29, 31, 3.2, 1.2)}" fill="#ffd35c"/><path d="${starPath(71, 37, 2.5, 1)}" fill="#ffd35c"/>` + paw(71, 108, 1.4, ink);
    // royal cloak / gown body
    g += `<path d="M22 121 Q25 91 50 88 Q75 91 78 121 Z" fill="${ink}"/>`;
    g += `<path d="M36 91 Q50 100 64 91 L61 101 Q50 107 39 101 Z" fill="#fff" stroke="${L}" stroke-width="1.2"/>`;
    if (r === 13) g += `<path d="M26 95 Q29 106 27 119 M74 95 Q71 106 73 119" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`;
    // collar golden bell
    g += `<circle cx="50" cy="94" r="3.4" fill="#ffd35c" stroke="${L}" stroke-width="1.2"/>`;
    // cat ears & head
    g += `<path d="M30 57 L32 37 L44 48 Z" fill="#fff" stroke="${L}" stroke-width="2" stroke-linejoin="round"/>`;
    g += `<path d="M33.5 53 L34.5 42 L41 48 Z" fill="#ffb3cf"/>`;
    g += `<path d="M70 57 L68 37 L56 48 Z" fill="#fff" stroke="${L}" stroke-width="2" stroke-linejoin="round"/>`;
    g += `<path d="M66.5 53 L65.5 42 L59 48 Z" fill="#ffb3cf"/>`;
    g += `<ellipse cx="50" cy="69" rx="21" ry="18.5" fill="#fff" stroke="${L}" stroke-width="2"/>`;
    // signature pink ear bow
    g += `<g transform="translate(61 45) rotate(12)"><path d="M0 0 L-5.5 -3.8 L-5.5 3.8 Z M0 0 L5.5 -3.8 L5.5 3.8 Z" fill="#ff7aa8" stroke="${L}" stroke-width="1.1"/><circle cx="0" cy="0" r="1.9" fill="#ffd35c" stroke="${L}" stroke-width=".9"/></g>`;
    // cheeks + whiskers
    g += `<ellipse cx="36" cy="73" rx="3.4" ry="2" fill="#ffa3c4" opacity=".85"/><ellipse cx="64" cy="73" rx="3.4" ry="2" fill="#ffa3c4" opacity=".85"/>`;
    g += `<g stroke="${L}" stroke-width="1.1" stroke-linecap="round"><path d="M23 69 L30 70.5"/><path d="M23 74 L30 73.5"/><path d="M77 69 L70 70.5"/><path d="M77 74 L70 73.5"/></g>`;
    // expressions & headgear per court rank
    if (r === 13) {
      // King Mochi: smug-proud eyes + grand crown
      g += `<ellipse cx="41.5" cy="68" rx="3" ry="3.5" fill="#3b2440"/><circle cx="42.5" cy="66.5" r="1.1" fill="#fff"/>`;
      g += `<ellipse cx="58.5" cy="68" rx="3" ry="3.5" fill="#3b2440"/><circle cx="59.5" cy="66.5" r="1.1" fill="#fff"/>`;
      g += `<path d="M37 64.5 L45 66 M63 64.5 L55 66" stroke="#fff" stroke-width="2.2"/>`;
      g += `<path d="M46 74 Q48 77 50 74 Q52 77 54 74" stroke="#3b2440" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
      g += `<path d="M38 49 L39 36 L44.5 42 L50 32 L55.5 42 L61 36 L62 49 Z" fill="#ffd35c" stroke="#c88a1e" stroke-width="1.2" stroke-linejoin="round"/>`;
      g += `<circle cx="50" cy="43.5" r="2" fill="${ink}"/>`;
    } else if (r === 12) {
      // Princess Mochi: happy arched eyes + tiara
      g += `<path d="M38 68 Q41.5 62.5 45 68 M55 68 Q58.5 62.5 62 68" stroke="#3b2440" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      g += `<path d="M46.5 73 Q50 79 53.5 73 Z" fill="#ff7aa2" stroke="#3b2440" stroke-width="1.1"/>`;
      g += `<path d="M38 49 Q50 37 62 49" stroke="#ffd35c" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      g += use(s, 46, 35, 8, '#ffd35c');
    } else {
      // Knight Mochi (J): winking + jaunty feather cap
      g += `<ellipse cx="41.5" cy="67" rx="3.1" ry="3.8" fill="#3b2440"/><circle cx="42.5" cy="65.5" r="1.2" fill="#fff"/>`;
      g += `<path d="M55 68 Q58.5 62.5 62 68" stroke="#3b2440" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      g += `<path d="M46 74 Q48 77 50 74 Q52 77 54 74" stroke="#3b2440" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
      g += `<path d="M37 48 L50 40 L63 48 Z" fill="${ink}" stroke="${L}" stroke-width="1.1" stroke-linejoin="round"/>`;
      g += `<path d="M33 42 Q40 31 48 40" stroke="#ffd35c" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    }
    g += use(s, 45, 105, 10, '#ffffff');
    g += '</g>';
    return g;
  }

  // ---------- 7 Girls portrait court cards (J/Q/K) ----------
  function girlCourtArt(c, frontKey, F) {
    const s = c.suit, ink = (F.ink || INK)[s], ac = F.accent || '#ffd35c', pfx = F.suitPrefix || 'suit';
    const r = c.rank, idx = r - 11, id = `fc_${frontKey}_${c.id}`;
    const src = (F.portraits && (F.portraits[idx] || F.portraits[0])) || '';
    const xPos = 13 + (F.portraitDx || 0);
    const pillBg = F.dark ? '#0b111c' : '#ffffff';

    let g = `<defs><clipPath id="${id}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>`;
    g += `<rect x="21" y="22" width="58" height="96" rx="8" fill="${(F.tint || TINT)[s]}" stroke="${ink}" stroke-opacity=".55" stroke-width="1.3"/>`;
    g += `<g clip-path="url(#${id})">`;
    // subtle backdrop rays / geometry behind the waist-up sprite
    g += `<path d="M50 22 L79 58 L21 58 Z" fill="${ink}" opacity="${F.dark ? '.16' : '.08'}"/>`;
    g += `<circle cx="50" cy="54" r="24" fill="none" stroke="${ac}" stroke-width="1" stroke-dasharray="4 3" opacity=".32"/>`;
    // waist-up character portrait
    if (src) g += `<image href="${src}" x="${xPos}" y="25" width="74" height="94" preserveAspectRatio="xMidYMin meet"/>`;
    // top-left royal rank badge (Crown / Tiara / Knight Diamond) so J, Q, K read at a glance
    if (r === 13) {
      g += `<path d="M24 33 L24.5 25 L27.5 28.5 L30.5 24 L33.5 28.5 L36.5 25 L37 33 Z" fill="#ffd35c" stroke="#7a4c0c" stroke-width=".9" stroke-linejoin="round"/>`;
    } else if (r === 12) {
      g += `<path d="M24.5 32 Q30.5 24 36.5 32 Z" fill="#ffd35c" stroke="#7a4c0c" stroke-width=".9" stroke-linejoin="round"/>`;
      g += `<circle cx="30.5" cy="28.5" r="1.4" fill="${ink}"/>`;
    } else {
      g += `<polygon points="30.5,24.5 35.5,29.5 30.5,34.5 25.5,29.5" fill="${ac}" stroke="${pillBg}" stroke-width="1"/>`;
    }
    // bottom suit crest sash
    g += `<rect x="21" y="103" width="58" height="15" fill="${ink}" fill-opacity="${F.dark ? '.84' : '.88'}"/>`;
    g += `<rect x="41" y="104.5" width="18" height="12" rx="4" fill="${pillBg}" fill-opacity=".95"/>`;
    g += use(s, 45, 105.5, 10, ink, pfx);
    g += `<circle cx="30" cy="110.5" r="1.5" fill="#ffd35c"/><circle cx="70" cy="110.5" r="1.5" fill="#ffd35c"/>`;
    g += '</g>';
    return g;
  }

  function registerFront(key, spec) {
    FRONTS[key] = Object.assign({}, FRONTS[key], spec || {});
  }

  function registerBack(key, spec) {
    BACKS[key] = Object.assign({}, BACKS[key], spec || {});
    backCache.delete(key);
  }

  function cardFace(c, frontKey = 'classic') {
    const key = Object.prototype.hasOwnProperty.call(FRONTS, frontKey) ? frontKey : 'classic';
    if (key === 'classic') {
      const ink = INK[c.suit];
      let center;
      if (c.rank === 1) center = classicAce(c, ink);
      else if (c.rank <= 10) center = pips(c, ink);
      else center = classicFaceArt(c);
      const crn = corner(c, ink);
      return `<svg class="cardsvg" viewBox="0 0 100 140" aria-hidden="true">${center}${crn}${use(c.suit, 80, 7, 13, ink)}<g transform="rotate(180 50 70)">${crn}</g></svg>`;
    }

    const F = FRONTS[key];
    const ink = (F.ink || INK)[c.suit];
    const pfx = F.suitPrefix || 'suit';
    const isPip = c.rank >= 2 && c.rank <= 10;
    const frame = (typeof F.frame === 'function' ? F.frame(F, ink, isPip, c.suit) : deckFrame(key, F, ink, isPip)) || '';

    let center;
    if (c.rank === 1) center = (typeof F.ace === 'function' ? F.ace(c, F, ink) : themedAce(c, key, F, ink)) || '';
    else if (isPip) center = pips(c, ink, pfx);
    else if (typeof F.court === 'function') center = F.court(c, F, ink) || '';
    else if (key === 'cyber') center = cyberCourtArt(c, F);
    else if (key === 'mochi') center = mochiCourtArt(c, F);
    else center = girlCourtArt(c, key, F);

    const crn = corner(c, ink, pfx);
    return `<svg class="cardsvg" viewBox="0 0 100 140" aria-hidden="true">${frame}${center}${crn}${use(c.suit, 80, 7, 13, ink, pfx)}<g transform="rotate(180 50 70)">${crn}</g></svg>`;
  }

  function frontPreviewSVG(frontKey = 'classic') {
    const key = Object.prototype.hasOwnProperty.call(FRONTS, frontKey) ? frontKey : 'classic';
    const F = FRONTS[key];
    return cardFace({ id: 'prev_' + key, suit: F.previewSuit || 0, rank: 1 }, key);
  }

  // ---------- 13 pure-vector card backs (first 4 preserved verbatim for backwards compatibility) ----------
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
    cyber: {
      name: 'Cyber Grid', edge: '#0ef0ff', bg: '#091422', bg2: '#120b24', frame: '#ff2a85', dash: '6 2',
      tile: `<path d="M0 10 H20 M10 0 V20" stroke="#00f0ff" stroke-width=".45" opacity=".25"/><polygon points="10,4 15,7 15,13 10,16 5,13 5,7" fill="none" stroke="#ff2a85" stroke-width=".6" opacity=".35"/><circle cx="10" cy="10" r="1" fill="#00f0ff" opacity=".55"/>`,
      emblem: `<polygon points="50,49 68,59 68,81 50,91 32,81 32,59" fill="#08111d" stroke="#00f0ff" stroke-width="2"/><polygon points="50,55 62,62 62,78 50,85 38,78 38,62" fill="none" stroke="#ff2a85" stroke-width="1.3"/><polygon points="50,59 58,70 50,81 42,70" fill="#00f0ff"/><polygon points="50,64 54,70 50,76 46,70" fill="#ff2a85"/>`,
    },
    sakura_idol: {
      name: 'Sakura Idol', edge: '#fff7fb', bg: '#ff6ca6', bg2: '#2e56b8', frame: '#ffd35c', dash: '4 2',
      tile: `<path d="${starPath(6, 6, 2.8, 1.1)}" fill="#ffd35c" opacity=".55"/>` + flower(15, 15, 3.6, '#fff', '#ffd35c'),
      emblem: `<circle cx="50" cy="70" r="18" fill="#fff" stroke="#ffd35c" stroke-width="1.6"/>` + flower(50, 69, 11.5, '#ff5c93', '#ffd35c') +
        `<path d="M50 82 L41 78 L41 86 Z M50 82 L59 78 L59 86 Z" fill="#2e56b8"/><circle cx="50" cy="82" r="2.2" fill="#ffd35c"/>`,
    },
    yuki: {
      name: 'Yuki AI', edge: '#eef6ff', bg: '#385682', bg2: '#1d3152', frame: '#9fd4ff', dash: '5 2 1.5 2',
      tile: `<path d="M0 10 H20 M10 0 V20" stroke="#9fd4ff" stroke-width=".4" opacity=".28"/><path d="${star4Path(10, 10, 3.2, .9)}" fill="#e3f1ff" opacity=".45"/>`,
      emblem: `<circle cx="50" cy="70" r="18" fill="#182a47" stroke="#9fd4ff" stroke-width="1.5"/>` +
        `<circle cx="50" cy="70" r="13.5" fill="none" stroke="#ffd35c" stroke-width="1" stroke-dasharray="4 3"/>` +
        `<path d="${star4Path(43.5, 70, 6.2, 1.9)}" fill="#9fd4ff"/><path d="${star4Path(56.5, 70, 6.2, 1.9)}" fill="#ffd35c"/>`,
    },
    rin: {
      name: 'Rin Rival', edge: '#2a1f4a', bg: '#1a1433', bg2: '#381229', frame: '#ff476e', dash: '5 2',
      tile: `<path d="M11 2 L5 11 H10 L8 18 L15 9 H10 Z" fill="#ff476e" opacity=".3"/><circle cx="4" cy="4" r=".9" fill="#c4b5ff" opacity=".45"/>`,
      emblem: `<circle cx="50" cy="70" r="18" fill="#151029" stroke="#ff476e" stroke-width="1.6"/>` +
        `<path d="M36 66 L38 51 L46 60 Z M64 66 L62 51 L54 60 Z" fill="#c4b5ff"/>` +
        `<path d="M38.5 64 L39.5 55.5 L44.5 60.5 Z M61.5 64 L60.5 55.5 L55.5 60.5 Z" fill="#ff7aa8"/>` +
        `<path d="M52 57 L43 71 H50 L47 84 L58 68 H50 Z" fill="#ff476e"/>`,
    },
    mio: {
      name: 'Mio Clover', edge: '#f4fff9', bg: '#5cc79c', bg2: '#286657', frame: '#fff9e6', dash: '3 3',
      tile: `<rect x="3" y="10" width="2" height="6" rx="1" fill="#fff" opacity=".32"/><rect x="7" y="7" width="2" height="9" rx="1" fill="#fff" opacity=".4"/><rect x="11" y="9" width="2" height="7" rx="1" fill="#fff" opacity=".32"/>` + clover(15, 5, 2.5, '#d9ffee'),
      emblem: `<circle cx="50" cy="70" r="18" fill="#fffdf6" stroke="#a6edd0" stroke-width="1.5"/>` +
        `<path d="M37 70 Q37 56 50 56 Q63 56 63 70" fill="none" stroke="#5cc79c" stroke-width="2.4" stroke-linecap="round"/>` +
        `<rect x="34" y="67" width="4.5" height="9" rx="2.2" fill="#286657"/><rect x="61.5" y="67" width="4.5" height="9" rx="2.2" fill="#286657"/>` +
        clover(50, 70, 5.5, '#3cb882'),
    },
    ayame: {
      name: 'Ayame Velvet', edge: '#2b0d1b', bg: '#1c0813', bg2: '#3d0c22', frame: '#ff2e68', dash: '2 2',
      tile: `<polygon points="10,2 18,10 10,18 2,10" fill="none" stroke="#ff2e68" stroke-width=".6" opacity=".32"/>` + heartAt(7.2, 7.2, 0.055, '#a8224f'),
      emblem: `<circle cx="50" cy="70" r="18" fill="#180710" stroke="#ff2e68" stroke-width="1.5"/>` +
        `<path d="M50 54 L41 50 L41 58 Z M50 54 L59 50 L59 58 Z" fill="#9c143c"/>` +
        heartAt(39.5, 60, 0.21, '#ff2e68') +
        `<circle cx="50" cy="69" r="2.2" fill="#180710"/><path d="M48.8 74 L50 69.5 L51.2 74 Z" fill="#180710"/>`,
    },
    kira: {
      name: 'Kira Matrix', edge: '#183832', bg: '#0b191c', bg2: '#102b26', frame: '#2ce8a2', dash: '7 2 2 2',
      tile: `<path d="M2 10 H8 L12 6 H18 M10 2 V7 M10 13 V18" stroke="#2ce8a2" stroke-width=".65" fill="none" opacity=".38"/><circle cx="12" cy="6" r="1" fill="#ffd35c" opacity=".5"/>`,
      emblem: `<polygon points="50,51 67,60.5 67,79.5 50,89 33,79.5 33,60.5" fill="#081316" stroke="#2ce8a2" stroke-width="1.6"/>` +
        `<path d="M37 64 H63 L60 72 H40 Z" fill="#154d3e" stroke="#ffd35c" stroke-width="1.4" stroke-linejoin="round"/>` +
        `<line x1="42" y1="68" x2="58" y2="68" stroke="#75ffd1" stroke-width="1.5" stroke-dasharray="4 2"/>` +
        `<circle cx="50" cy="79" r="2.2" fill="#2ce8a2"/>`,
    },
    kaede: {
      name: 'Kaede Parlor', edge: '#fff8eb', bg: '#8c533e', bg2: '#563027', frame: '#f3c66f', dash: '4 2',
      tile: `<polygon points="10,0 20,10 10,20 0,10" fill="none" stroke="#f7dfa8" stroke-width=".65" opacity=".28"/><circle cx="10" cy="10" r="1.2" fill="#f3c66f" opacity=".35"/>`,
      emblem: `<circle cx="50" cy="70" r="18" fill="#fffaf0" stroke="#e5a93b" stroke-width="1.6"/>` +
        butterfly(50, 70, 1.05, '#e89d2c', '#fff4c8'),
    },
    mochi: {
      name: 'Mochi Bell', edge: '#fff7fc', bg: '#9168b3', bg2: '#664385', frame: '#ffd35c', dash: '3 3',
      tile: paw(6, 7, 1.15, '#fff') + `<ellipse cx="15" cy="15" rx="2.5" ry="1.4" fill="#ffd35c" opacity=".6"/><polygon points="17.5,15 19.5,13.5 19.5,16.5" fill="#ffd35c" opacity=".6"/>`,
      emblem: `<circle cx="50" cy="70" r="18" fill="#fdf6ff" stroke="#ffd35c" stroke-width="1.6"/>` +
        `<path d="M37 67 L38 56 L45 62 Z M63 67 L62 56 L55 62 Z" fill="#fff" stroke="#5a3d5c" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<ellipse cx="50" cy="71" rx="12" ry="9.5" fill="#fff" stroke="#5a3d5c" stroke-width="1.3"/>` +
        `<path d="M58 58 L54 55 L54 61 Z M58 58 L62 55 L62 61 Z" fill="#ff7aa8"/><circle cx="58" cy="58" r="1.6" fill="#ffd35c"/>` +
        `<circle cx="45.5" cy="70" r="1.5" fill="#3b2440"/><circle cx="54.5" cy="70" r="1.5" fill="#3b2440"/>` +
        `<path d="M47.5 74 Q48.8 76 50 74 Q51.2 76 52.5 74" stroke="#3b2440" stroke-width="1.1" fill="none" stroke-linecap="round"/>`,
    },
  };

  const backCache = new Map();
  function backDataURI(kind) {
    const key = Object.prototype.hasOwnProperty.call(BACKS, kind) ? kind : 'sakura';
    let uri = backCache.get(key);
    if (uri !== undefined) return uri;
    const P = BACKS[key];
    const edge = P.edge || '#fff';
    const frame = P.frame || '#fff';
    const dash = P.dash ?? '3 3';
    const patternW = P.patternW || 20;
    const patternH = P.patternH || 20;
    const inner = P.inner || '';
    const grad = P.bg2
      ? `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${P.bg}"/><stop offset="100%" stop-color="${P.bg2}"/></linearGradient>`
      : '';
    const bgFill = P.bg2 ? 'url(#bg)' : P.bg;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><defs>${grad}<pattern id="p" width="${patternW}" height="${patternH}" patternUnits="userSpaceOnUse">${P.tile || ''}</pattern></defs>` +
      `<rect width="100" height="140" rx="10" fill="${edge}"/><rect x="5" y="5" width="90" height="130" rx="7" fill="${bgFill}"/>` +
      `<rect x="5" y="5" width="90" height="130" rx="7" fill="url(#p)"/>${inner}` +
      `<rect x="9" y="9" width="82" height="122" rx="5" fill="none" stroke="${frame}" stroke-width="1.5" stroke-dasharray="${dash}" opacity=".85"/>${P.emblem || ''}</svg>`;
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

  const H = { use, starPath, star4Path, flower, paw, heartAt, clover, butterfly, FACE_Y, RANKS, HEART, DIAMOND, SPADE, CLUB };

  return { injectDefs, cardFace, frontPreviewSVG, backDataURI, mascotSVG, registerFront, registerBack, H, FRONTS, BACKS, RANKS };
})();
