/* Slopitaire — Prism Stage Idol decks: Sakura, Yuki, Rin, and Mio card fronts & backs. */
(() => {
  'use strict';

  const { use, starPath, star4Path, flower, clover } = Art.H;

  // Compact ribbon bow helper (Sakura twin-tail & sailor bows, Rin/Mio accents).
  function bow(cx, cy, sc, fill, stroke, knot = '#ffd35c') {
    return `<g transform="translate(${cx} ${cy}) scale(${sc})">` +
      `<path d="M0 0 L-10 -5.2 L-8.6 5.2 Z M0 0 L10 -5.2 L8.6 5.2 Z" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M-2 1 L-5.5 7.5 L-1.5 6.2 Z M2 1 L5.5 7.5 L1.5 6.2 Z" fill="${fill}" stroke="${stroke}" stroke-width=".85" stroke-linejoin="round"/>` +
      `<circle cx="0" cy="0" r="2.6" fill="${knot}" stroke="${stroke}" stroke-width=".75"/>` +
      `</g>`;
  }

  // Top-left royal rank badge (K crown / Q tiara / J knight crest) inside portrait frame.
  function royalBadge(rank, ink, ac, pillBg) {
    if (rank === 13) {
      return `<path d="M23.5 32.5 L24 25 L27 28.2 L30 23.8 L33 28.2 L36 25 L36.5 32.5 Z" fill="#ffd35c" stroke="#7a4c0c" stroke-width=".9" stroke-linejoin="round"/>` +
        `<circle cx="30" cy="29.6" r="1.4" fill="${ink}"/><circle cx="26.2" cy="30.6" r=".8" fill="#fff"/><circle cx="33.8" cy="30.6" r=".8" fill="#fff"/>`;
    }
    if (rank === 12) {
      return `<path d="M24 31.8 Q30 23.5 36 31.8 L34.5 32.4 Q30 28.5 25.5 32.4 Z" fill="#ffd35c" stroke="#7a4c0c" stroke-width=".85" stroke-linejoin="round"/>` +
        `<circle cx="30" cy="26.3" r="1.5" fill="${ink}" stroke="#7a4c0c" stroke-width=".5"/>` +
        `<circle cx="26.5" cy="29.4" r=".85" fill="#fff"/><circle cx="33.5" cy="29.4" r=".85" fill="#fff"/>`;
    }
    return `<polygon points="30,24 35.2,29.5 30,35 24.8,29.5" fill="${ac}" stroke="${pillBg}" stroke-width="1.1" stroke-linejoin="round"/>` +
      `<polygon points="30,26.3 32.8,29.5 30,32.7 27.2,29.5" fill="#ffd35c"/>`;
  }

  // Shared portrait-card shell with bespoke backdrop, clipped sprite, royal rank badge, and suit sash.
  function prismCourt(c, key, F, ink, opts) {
    const s = c.suit;
    const suitInk = ink || F.ink[s];
    const ac = F.accent;
    const pfx = F.suitPrefix || 'suit';
    const idx = Math.max(0, Math.min(2, c.rank - 11));
    const src = (F.portraits && (F.portraits[idx] || F.portraits[0])) || '';
    const clipId = `fc_${key}_${c.id ?? 'x'}`;
    const pillBg = F.dark ? '#110d24' : '#ffffff';
    const box = opts.imageBox(idx);

    return `<defs><clipPath id="${clipId}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>` +
      `<rect x="21" y="22" width="58" height="96" rx="8" fill="${F.tint[s]}" stroke="${suitInk}" stroke-opacity="${F.dark ? '.62' : '.48'}" stroke-width="1.3"/>` +
      `<g clip-path="url(#${clipId})">` +
      opts.backdrop(s, suitInk, ac) +
      `<image href="${src}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMin meet"/>` +
      (opts.overlay ? opts.overlay(s, suitInk, ac) : '') +
      royalBadge(c.rank, suitInk, ac, pillBg) +
      `<rect x="21" y="102.5" width="58" height="15.5" fill="${suitInk}" fill-opacity="${F.dark ? '.86' : '.90'}"/>` +
      `<line x1="21" y1="102.8" x2="79" y2="102.8" stroke="${ac}" stroke-width=".9" stroke-opacity=".85"/>` +
      `<rect x="40.5" y="104.3" width="19" height="12.4" rx="4" fill="${pillBg}" fill-opacity=".96" stroke="${ac}" stroke-width=".8"/>` +
      use(s, 45, 105.5, 10, suitInk, pfx) +
      opts.sashAccent(s, suitInk, ac) +
      `</g>`;
  }

  // ---------- 1. Sakura — Prism Stage Idol ----------
  Art.registerFront('sakura', {
    name: 'Sakura',
    subtitle: 'PRISM STAGE IDOL',
    dark: false,
    bg: 'linear-gradient(180deg, #fffafd 0%, #fff0f7 100%)',
    border: 'rgba(255, 115, 168, .52)',
    font: "'Mochiy Pop One', 'Nunito', sans-serif",
    weight: '400',
    suitPrefix: 'suit',
    previewSuit: 0,
    ink: ['#ff3d7f', '#ff6e4a', '#284b9e', '#1e2f6e'],
    tint: ['#ffe6f1', '#ffece4', '#e6eeff', '#e8ebff'],
    accent: '#ffd35c',
    portraits: [
      'images/sakura/default/corner_wink.webp',
      'images/sakura/default/corner_starry.webp',
      'images/sakura/default/corner_cheer.webp',
    ],
    frame(F, ink, isPip, suit) {
      const ac = F.accent;
      let g = `<path d="M31 4.6 H69 M31 135.4 H69" stroke="${ink}" stroke-width=".9" stroke-opacity=".30"/>` +
        `<path d="M34 7.2 H66 M34 132.8 H66" stroke="#ff7aa8" stroke-width=".6" stroke-opacity=".32"/>` +
        `<path d="M4.5 50 V90 M95.5 50 V90" stroke="${ink}" stroke-width=".85" stroke-dasharray="3 3" stroke-opacity=".28"/>` +
        `<circle cx="4.5" cy="70" r="1.3" fill="${ac}"/><circle cx="95.5" cy="70" r="1.3" fill="${ac}"/>` +
        `<path d="${star4Path(37, 5, 2.1, .75)}" fill="${ac}"/><path d="${star4Path(63, 5, 2.1, .75)}" fill="${ac}"/>` +
        `<path d="${star4Path(37, 135, 2.1, .75)}" fill="${ac}"/><path d="${star4Path(63, 135, 2.1, .75)}" fill="${ac}"/>` +
        flower(50, 5.2, 3.2, '#ff7aa8', ac) + flower(50, 134.8, 3.2, '#ff7aa8', ac);
      if (!isPip) return g;
      return g + `<g opacity=".11">` +
        `<polygon points="50,36 72,94 28,94" fill="${F.tint[suit]}" stroke="${ac}" stroke-width=".9"/>` +
        flower(50, 70, 18.5, ink, ac) +
        `<path d="${star4Path(34, 54, 3.2, 1.1)}" fill="${ac}"/><path d="${star4Path(66, 86, 3.2, 1.1)}" fill="${ac}"/>` +
        `</g>`;
    },
    ace(c, F, ink) {
      const s = c.suit;
      const ac = F.accent;
      return `<polygon points="50,28 78,94 22,94" fill="${F.tint[s]}" opacity=".55"/>` +
        `<circle cx="50" cy="68" r="31" fill="${F.tint[s]}" stroke="#ff9ec4" stroke-width="1" stroke-dasharray="4 3" stroke-opacity=".65"/>` +
        use(s, 22, 39, 56, ink, F.suitPrefix || 'suit') +
        `<g transform="translate(65 44) rotate(12)">` +
        flower(0, 0, 9.6, '#ffffff', ac) +
        flower(0, 0, 7.2, '#ffb3cf', '#ffe678') +
        `</g>` +
        bow(50, 96, 1.0, '#ff4d8d', '#ffffff', ac) +
        `<path d="${starPath(25, 44, 4, 1.6)}" fill="${ac}"/><path d="${starPath(75, 98, 3.6, 1.4)}" fill="${ac}"/>` +
        `<path d="${star4Path(24, 86, 2.8, .9)}" fill="#ff85b3"/><path d="${star4Path(76, 58, 2.8, .9)}" fill="#ff85b3"/>`;
    },
    court(c, F, ink) {
      return prismCourt(c, 'sakura', F, ink, {
        imageBox: () => ({ x: 13, y: 24, w: 74, h: 94 }),
        backdrop: (s, suitInk, ac) =>
          `<path d="M50 20 L78 78 H22 Z" fill="${suitInk}" opacity=".10"/>` +
          `<path d="M50 20 L65 82 H35 Z" fill="#ffffff" opacity=".45"/>` +
          `<circle cx="50" cy="56" r="24" fill="none" stroke="${ac}" stroke-width="1" stroke-dasharray="4 3" opacity=".55"/>` +
          `<path d="${starPath(71, 31, 3.2, 1.3)}" fill="${ac}" opacity=".9"/>` +
          `<path d="${star4Path(27, 46, 2.5, .8)}" fill="#ff7aa8" opacity=".75"/>`,
        overlay: (_s, _suitInk, ac) =>
          `<path d="${star4Path(72, 95, 2.8, .9)}" fill="${ac}" opacity=".9"/>`,
        sashAccent: () =>
          `<path d="${star4Path(30, 110.5, 2.8, .9)}" fill="#ffd35c"/>` +
          `<path d="${star4Path(70, 110.5, 2.8, .9)}" fill="#ffd35c"/>`,
      });
    },
  });

  Art.registerBack('sakura_idol', {
    name: 'Sakura Idol',
    edge: '#fff7fb',
    bg: '#ff6ca6',
    bg2: '#2e56b8',
    frame: '#ffd35c',
    dash: '4 2',
    patternW: 24,
    patternH: 24,
    tile: `<path d="${star4Path(6, 6, 3.2, 1.0)}" fill="#ffd35c" opacity=".52"/>` +
      flower(17.5, 17.5, 4.1, '#ffffff', '#ffd35c') +
      `<circle cx="17.5" cy="6.5" r=".8" fill="#ffd35c" opacity=".5"/>` +
      `<circle cx="6.5" cy="17.5" r=".8" fill="#ffffff" opacity=".45"/>`,
    inner: `<g opacity=".16">` +
      `<polygon points="50,8 84,132 16,132" fill="#ffffff"/>` +
      `<polygon points="50,8 68,132 32,132" fill="#ffd35c"/>` +
      `</g>` +
      `<g fill="none" stroke="#ffd35c" stroke-width="1.2" opacity=".72">` +
      `<path d="M12 24 V12 H24"/><path d="M88 24 V12 H76"/>` +
      `<path d="M12 116 V128 H24"/><path d="M88 116 V128 H76"/>` +
      `</g>` +
      flower(16, 16, 3.4, '#fff', '#ffd35c') + flower(84, 16, 3.4, '#fff', '#ffd35c') +
      flower(16, 124, 3.4, '#fff', '#ffd35c') + flower(84, 124, 3.4, '#fff', '#ffd35c'),
    emblem: `<circle cx="50" cy="70" r="19" fill="#fffafc" stroke="#ffd35c" stroke-width="1.7"/>` +
      `<circle cx="50" cy="70" r="16" fill="none" stroke="#ff9ec4" stroke-width=".8" stroke-dasharray="3 2"/>` +
      flower(50, 68, 11.4, '#ff6ca6', '#ffd35c') +
      flower(50, 68, 7.2, '#ffffff', '#ffd35c') +
      bow(50, 82.5, 0.92, '#2e56b8', '#ffffff', '#ff4d8d') +
      `<path d="${star4Path(50, 52, 3.1, 1.0)}" fill="#ffd35c"/>`,
  });

  // ---------- 2. Yuki — Prism Tactical AI ----------
  Art.registerFront('yuki', {
    name: 'Yuki',
    subtitle: 'PRISM TACTICAL AI',
    dark: false,
    bg: 'linear-gradient(180deg, #f7fbff 0%, #eaf3fc 100%)',
    border: 'rgba(116, 162, 218, .55)',
    font: "'Chakra Petch', 'Nunito', sans-serif",
    weight: '700',
    suitPrefix: 'suit',
    previewSuit: 3,
    ink: ['#e03e6b', '#eb6448', '#2c538a', '#1d3259'],
    tint: ['#fbe9ef', '#fcedea', '#e4effa', '#e3eaf7'],
    accent: '#7cc4ff',
    portraits: [
      'images/yuki/default/corner_smug.webp',
      'images/yuki/default/corner_wink.webp',
      'images/yuki/default/corner_hype.webp',
    ],
    frame(F, ink, isPip) {
      const ac = F.accent;
      const g = `<path d="M31 4.5 H69 M31 135.5 H69" stroke="${ac}" stroke-width="1" stroke-opacity=".55"/>` +
        `<path d="M36 2.8 V6.2 M41 3.4 V5.6 M59 3.4 V5.6 M64 2.8 V6.2 M36 133.8 V137.2 M41 134.4 V136.6 M59 134.4 V136.6 M64 133.8 V137.2" stroke="${ink}" stroke-width=".95" stroke-opacity=".42"/>` +
        `<path d="M4.5 50 V90 M95.5 50 V90" stroke="${ac}" stroke-width=".9" stroke-opacity=".45"/>` +
        `<path d="M2.8 58 H6.2 M2.8 70 H6.8 M2.8 82 H6.2 M93.8 58 H97.2 M93.2 70 H97.2 M93.8 82 H97.2" stroke="${ink}" stroke-width=".9" stroke-opacity=".35"/>` +
        `<path d="${star4Path(47.2, 5, 2.8, .9)}" fill="#9fd4ff" stroke="${ink}" stroke-width=".45"/>` +
        `<path d="${star4Path(52.8, 5, 2.8, .9)}" fill="#ffd35c" stroke="#b37818" stroke-width=".45"/>` +
        `<path d="${star4Path(47.2, 135, 2.8, .9)}" fill="#9fd4ff" stroke="${ink}" stroke-width=".45"/>` +
        `<path d="${star4Path(52.8, 135, 2.8, .9)}" fill="#ffd35c" stroke="#b37818" stroke-width=".45"/>`;
      if (!isPip) return g;
      return g + `<g opacity=".13">` +
        `<circle cx="50" cy="70" r="17" fill="none" stroke="${ac}" stroke-width="1.2" stroke-dasharray="6 3"/>` +
        `<path d="M50 51 V89 M31 70 H69 M37 57 L63 83 M63 57 L37 83" stroke="${ink}" stroke-width=".9"/>` +
        `<path d="${star4Path(50, 70, 14, 3.2)}" fill="${ink}"/>` +
        `</g>`;
    },
    ace(c, F, ink) {
      const s = c.suit;
      const ac = F.accent;
      return `<circle cx="50" cy="68" r="33" fill="none" stroke="${ac}" stroke-width="1.2" stroke-dasharray="14 4 2 4" opacity=".78"/>` +
        `<circle cx="50" cy="68" r="26" fill="${F.tint[s]}" stroke="${ink}" stroke-width=".85" stroke-opacity=".30"/>` +
        `<path d="M50 30 V37 M50 99 V106 M13 68 H20 M80 68 H87" stroke="${ink}" stroke-width="1.3" stroke-opacity=".6" stroke-linecap="round"/>` +
        `<path d="M24 44 L29 40 H36 M76 92 L71 96 H64 M24 92 L29 96 H36" stroke="${ac}" stroke-width="1.2" fill="none" opacity=".8"/>` +
        use(s, 22, 39, 56, ink, F.suitPrefix || 'suit') +
        `<path d="${star4Path(62.5, 41.5, 4.3, 1.3)}" fill="#9fd4ff" stroke="${ink}" stroke-width=".85"/>` +
        `<path d="${star4Path(70.5, 46, 5.8, 1.8)}" fill="#ffd35c" stroke="#b57614" stroke-width=".85"/>` +
        `<path d="${star4Path(28, 92, 4.2, 1.3)}" fill="#9fd4ff" stroke="${ink}" stroke-width=".75"/>` +
        `<circle cx="50" cy="68" r="3.4" fill="#ffffff" stroke="${ink}" stroke-width="1.1"/>` +
        `<path d="M48 68 H52 M50 66 V70" stroke="${ink}" stroke-width=".9" stroke-linecap="round"/>`;
    },
    court(c, F, ink) {
      return prismCourt(c, 'yuki', F, ink, {
        imageBox: (idx) => idx === 2
          ? { x: 10, y: 24, w: 74, h: 96 }
          : { x: 13, y: 24, w: 74, h: 104 },
        backdrop: (s, suitInk, ac) =>
          `<path d="M21 44 H79 M21 68 H79 M21 92 H79 M35 22 V103 M65 22 V103" stroke="${ac}" stroke-width=".55" opacity=".28"/>` +
          `<circle cx="50" cy="56" r="24" fill="none" stroke="${suitInk}" stroke-width=".9" stroke-dasharray="10 4" opacity=".28"/>` +
          `<path d="M50 28 V34 M50 78 V84 M24 56 H30 M70 56 H76" stroke="${ac}" stroke-width="1" opacity=".55"/>` +
          `<path d="M70 25 H76 V31" fill="none" stroke="${suitInk}" stroke-width="1.1" opacity=".6"/>`,
        overlay: (_s, suitInk) =>
          `<path d="${star4Path(66.5, 95, 3.0, 1.0)}" fill="#9fd4ff" stroke="${suitInk}" stroke-width=".6"/>` +
          `<path d="${star4Path(72.5, 97, 3.8, 1.2)}" fill="#ffd35c" stroke="#996312" stroke-width=".6"/>`,
        sashAccent: (_s, _suitInk, ac) =>
          `<path d="M26 110.5 H35 M65 110.5 H74" stroke="#ffffff" stroke-width="1.1" stroke-opacity=".75"/>` +
          `<circle cx="30.5" cy="110.5" r="1.4" fill="${ac}"/><circle cx="69.5" cy="110.5" r="1.4" fill="#ffd35c"/>`,
      });
    },
  });

  Art.registerBack('yuki', {
    name: 'Yuki AI',
    edge: '#eef6ff',
    bg: '#385682',
    bg2: '#1d3152',
    frame: '#9fd4ff',
    dash: '5 2 1.5 2',
    patternW: 22,
    patternH: 22,
    tile: `<path d="M0 11 H22 M11 0 V22" stroke="#9fd4ff" stroke-width=".42" opacity=".28"/>` +
      `<path d="M9.2 0 H12.8 M0 9.2 V12.8" stroke="#e3f1ff" stroke-width=".55" opacity=".32"/>` +
      `<path d="${star4Path(11, 11, 3.2, .9)}" fill="#e3f1ff" opacity=".46"/>`,
    inner: `<g fill="none" stroke="#9fd4ff" stroke-width="1.2" opacity=".78">` +
      `<path d="M13 24 V13 H24"/><path d="M87 24 V13 H76"/>` +
      `<path d="M13 116 V127 H24"/><path d="M87 116 V127 H76"/>` +
      `</g>` +
      `<circle cx="50" cy="70" r="26" fill="none" stroke="#9fd4ff" stroke-width=".85" stroke-dasharray="10 4 2 4" opacity=".42"/>` +
      `<path d="M50 38 V46 M50 94 V102 M18 70 H26 M74 70 H82" stroke="#ffd35c" stroke-width="1" stroke-opacity=".6"/>` +
      `<circle cx="15" cy="15" r="1.1" fill="#ffd35c"/><circle cx="85" cy="15" r="1.1" fill="#ffd35c"/>` +
      `<circle cx="15" cy="125" r="1.1" fill="#ffd35c"/><circle cx="85" cy="125" r="1.1" fill="#ffd35c"/>`,
    emblem: `<circle cx="50" cy="70" r="18.5" fill="#182a47" stroke="#9fd4ff" stroke-width="1.6"/>` +
      `<circle cx="50" cy="70" r="13.8" fill="none" stroke="#ffd35c" stroke-width="1" stroke-dasharray="4 3"/>` +
      `<path d="M50 53 V57 M50 83 V87 M33 70 H37 M63 70 H67" stroke="#9fd4ff" stroke-width="1" stroke-linecap="round"/>` +
      `<path d="${star4Path(43.2, 68.5, 5.4, 1.7)}" fill="#9fd4ff"/>` +
      `<path d="${star4Path(55.8, 71.5, 6.8, 2.1)}" fill="#ffd35c"/>`,
  });

  // ---------- 3. Rin — Rival Cyber Ace ----------
  Art.registerFront('rin', {
    name: 'Rin',
    subtitle: 'RIVAL CYBER ACE',
    dark: true,
    bg: 'linear-gradient(180deg, #17132e 0%, #22193d 55%, #130f26 100%)',
    border: 'rgba(255, 79, 112, .55)',
    font: "'Chakra Petch', 'Nunito', sans-serif",
    weight: '700',
    suitPrefix: 'suit',
    previewSuit: 0,
    ink: ['#ff476e', '#ff8538', '#b8abff', '#7ec8ff'],
    tint: ['#30142a', '#301c1c', '#211c45', '#192445'],
    accent: '#ff476e',
    portraits: [
      'images/rin/default/corner_smug.webp',
      'images/rin/default/corner_wink.webp',
      'images/rin/default/corner_hype.webp',
    ],
    frame(F, ink, isPip) {
      const ac = F.accent;
      const g = `<path d="M31 4.5 H43.5 L46.8 2.2 L53.2 6.8 L56.5 4.5 H69 M31 135.5 H43.5 L46.8 137.8 L53.2 133.2 L56.5 135.5 H69" stroke="${ac}" stroke-width="1.2" fill="none" stroke-opacity=".68" stroke-linejoin="round"/>` +
        `<path d="M31 7 H41 M59 7 H69 M31 133 H41 M59 133 H69" stroke="#b8abff" stroke-width=".7" stroke-opacity=".38"/>` +
        `<path d="M4.5 52 L6 56 M4.5 64 L6 68 M4.5 76 L6 80 M95.5 52 L94 56 M95.5 64 L94 68 M95.5 76 L94 80" stroke="${ink}" stroke-width="1.2" stroke-opacity=".48" stroke-linecap="round"/>` +
        `<circle cx="4.5" cy="86" r="1.2" fill="${ac}" opacity=".75"/><circle cx="95.5" cy="86" r="1.2" fill="${ac}" opacity=".75"/>`;
      if (!isPip) return g;
      return g + `<g opacity=".13">` +
        `<path d="M34 86 L46 52 M54 88 L66 54" stroke="#b8abff" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M52 49 L40 72 H49.5 L46.5 91 L60 67.5 H50.5 Z" fill="${ink}"/>` +
        `</g>`;
    },
    ace(c, F, ink) {
      const s = c.suit;
      const ac = F.accent;
      return `<circle cx="50" cy="68" r="32" fill="${F.tint[s]}" stroke="${ac}" stroke-width="1.1" stroke-opacity=".48"/>` +
        `<path d="M27 83 L39 46 M61 90 L73 53" stroke="#b8abff" stroke-width="1.4" stroke-opacity=".22" stroke-linecap="round"/>` +
        `<path d="M29 50 L27 29 L43 43 Z" fill="#3b2c6b" stroke="${ac}" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<path d="M31.5 45 L30.5 34.5 L39 42 Z" fill="#ff7aa8"/>` +
        `<path d="M71 50 L73 29 L57 43 Z" fill="#3b2c6b" stroke="${ac}" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<path d="M68.5 45 L69.5 34.5 L61 42 Z" fill="#ff7aa8"/>` +
        use(s, 22, 39, 56, ink, F.suitPrefix || 'suit') +
        `<circle cx="67.5" cy="43.5" r="3.4" fill="#ff3b65" stroke="#ffd8e0" stroke-width=".95"/>` +
        `<circle cx="72" cy="48.5" r="2.9" fill="#ff3b65" stroke="#ffd8e0" stroke-width=".95"/>` +
        `<circle cx="66.5" cy="42.4" r=".9" fill="#ffffff" opacity=".8"/><circle cx="71.2" cy="47.5" r=".75" fill="#ffffff" opacity=".8"/>` +
        `<path d="M26 84 L20 97 H26 L23 107 L32 94 H26 Z" fill="#ffd35c"/>` +
        `<path d="M75 62 L81 71 H76 L79 80 L71 71 H75 Z" fill="${ac}"/>`;
    },
    court(c, F, ink) {
      return prismCourt(c, 'rin', F, ink, {
        imageBox: () => ({ x: 17, y: 25, w: 74, h: 94 }),
        backdrop: (s, suitInk, ac) =>
          `<path d="M21 62 L44 22 H55 L21 82 Z" fill="${ac}" opacity=".16"/>` +
          `<path d="M79 44 L45 103 H57 L79 64 Z" fill="#b8abff" opacity=".12"/>` +
          `<path d="M25 90 L50 38 L75 90" fill="none" stroke="${suitInk}" stroke-width="1.1" stroke-opacity=".28"/>` +
          `<path d="M72 26 L68 33 H72 L70 39 L76 31 H72 Z" fill="#ffd35c" opacity=".88"/>`,
        overlay: () =>
          `<path d="M26 90 L23 97 H26.5 L25 101 L30 94.5 H26.5 Z" fill="#ff476e" opacity=".9"/>`,
        sashAccent: () =>
          `<circle cx="29" cy="110.5" r="2.1" fill="#ff3b65" stroke="#ffd8e0" stroke-width=".7"/>` +
          `<circle cx="32.6" cy="112" r="1.8" fill="#ff3b65" stroke="#ffd8e0" stroke-width=".7"/>` +
          `<path d="M71 106.5 L67.5 111 H70.5 L69 114.5 L73.5 109.5 H70.8 Z" fill="#ffd35c"/>`,
      });
    },
  });

  Art.registerBack('rin', {
    name: 'Rin Rival',
    edge: '#2a1f4a',
    bg: '#1a1433',
    bg2: '#381229',
    frame: '#ff476e',
    dash: '5 2',
    patternW: 22,
    patternH: 22,
    tile: `<path d="M11.5 2.5 L5.5 11.5 H10.5 L8.5 19.5 L16 9.5 H11 Z" fill="#ff476e" opacity=".30"/>` +
      `<path d="M2 18 L8 12" stroke="#b8abff" stroke-width=".7" opacity=".25"/>` +
      `<circle cx="4.5" cy="4.5" r=".95" fill="#ffd35c" opacity=".42"/>`,
    inner: `<g opacity=".12" stroke="#ff476e" stroke-width="3" stroke-linecap="round">` +
      `<path d="M18 54 L82 28"/><path d="M18 112 L82 86"/>` +
      `</g>` +
      `<g fill="none" stroke-width="1.3" stroke-linejoin="round" opacity=".72">` +
      `<path d="M14 25 L14 14 L25 14 M18 27 L18 18 L27 18" stroke="#ff476e"/>` +
      `<path d="M86 25 L86 14 L75 14 M82 27 L82 18 L73 18" stroke="#ff476e"/>` +
      `<path d="M14 115 L14 126 L25 126 M18 113 L18 122 L27 122" stroke="#b8abff"/>` +
      `<path d="M86 115 L86 126 L75 126 M82 113 L82 122 L73 122" stroke="#b8abff"/>` +
      `</g>`,
    emblem: `<circle cx="50" cy="70" r="18.5" fill="#151029" stroke="#ff476e" stroke-width="1.6"/>` +
      `<path d="M35 67 L37 50 L46 59.5 Z M65 67 L63 50 L54 59.5 Z" fill="#3b2c6b" stroke="#b8abff" stroke-width="1.1" stroke-linejoin="round"/>` +
      `<path d="M38 64.5 L39 54.5 L44.5 60 Z M62 64.5 L61 54.5 L55.5 60 Z" fill="#ff7aa8"/>` +
      `<circle cx="62" cy="57.5" r="2.3" fill="#ff3b65" stroke="#ffd8e0" stroke-width=".7"/>` +
      `<circle cx="65" cy="61" r="2.0" fill="#ff3b65" stroke="#ffd8e0" stroke-width=".7"/>` +
      `<path d="M52.5 56 L42.5 71.5 H50 L47 85 L58.5 68 H50.5 Z" fill="#ff476e"/>` +
      `<path d="M51.5 61 L46 70 H50.5 L49 77 L55 68.5 H50.5 Z" fill="#ffd35c"/>`,
  });

  // ---------- 4. Mio — Shy Soundscape ----------
  Art.registerFront('mio', {
    name: 'Mio',
    subtitle: 'SHY SOUNDSCAPE',
    dark: false,
    bg: 'linear-gradient(180deg, #f9fffc 0%, #ecf8f2 100%)',
    border: 'rgba(98, 186, 154, .52)',
    font: "'Nunito', 'Mochiy Pop One', sans-serif",
    weight: '800',
    suitPrefix: 'suit',
    previewSuit: 2,
    ink: ['#e85278', '#e87654', '#236b59', '#1c4742'],
    tint: ['#fdf0f3', '#fef2ec', '#e3f6ef', '#e2f0ee'],
    accent: '#5cc79c',
    portraits: [
      'images/mio/default/corner_wink.webp',
      'images/mio/default/corner_special.webp',
      'images/mio/default/corner_cheer.webp',
    ],
    frame(F, ink, isPip) {
      const ac = F.accent;
      const g = `<path d="M31 5 H69 M31 135 H69" stroke="${ac}" stroke-width="1" stroke-dasharray="3 3" stroke-opacity=".5"/>` +
        `<rect x="37" y="3.5" width="1.6" height="3.2" rx=".8" fill="${ac}" opacity=".55"/>` +
        `<rect x="40.5" y="2.6" width="1.6" height="4.8" rx=".8" fill="${ink}" opacity=".35"/>` +
        `<rect x="57.9" y="2.6" width="1.6" height="4.8" rx=".8" fill="${ink}" opacity=".35"/>` +
        `<rect x="61.4" y="3.5" width="1.6" height="3.2" rx=".8" fill="${ac}" opacity=".55"/>` +
        `<path d="M4.5 52 Q6.8 70 4.5 88 M95.5 52 Q93.2 70 95.5 88" fill="none" stroke="${ac}" stroke-width="1" stroke-opacity=".45"/>` +
        `<circle cx="5.2" cy="70" r="1.2" fill="#e2b857"/><circle cx="94.8" cy="70" r="1.2" fill="#e2b857"/>` +
        clover(50, 4.7, 2.5, ac) + `<g transform="rotate(180 50 135)">${clover(50, 134.7, 2.5, ac)}</g>`;
      if (!isPip) return g;
      return g + `<g opacity=".12">` +
        `<rect x="37" y="64" width="3" height="12" rx="1.5" fill="${ac}"/>` +
        `<rect x="43" y="56" width="3" height="28" rx="1.5" fill="${ink}"/>` +
        `<rect x="49" y="51" width="3" height="38" rx="1.5" fill="${ac}"/>` +
        `<rect x="55" y="58" width="3" height="24" rx="1.5" fill="${ink}"/>` +
        `<rect x="61" y="65" width="3" height="10" rx="1.5" fill="${ac}"/>` +
        clover(50, 70, 9.5, ac) +
        `</g>`;
    },
    ace(c, F, ink) {
      const s = c.suit;
      const ac = F.accent;
      return `<circle cx="50" cy="69" r="31" fill="${F.tint[s]}" stroke="#bcebd7" stroke-width="1"/>` +
        `<path d="M22 65 Q22 32 50 32 Q78 32 78 65" fill="none" stroke="#f5f0da" stroke-width="5.4" stroke-linecap="round"/>` +
        `<path d="M22 65 Q22 32 50 32 Q78 32 78 65" fill="none" stroke="${ac}" stroke-width="2" stroke-linecap="round"/>` +
        use(s, 22, 40, 56, ink, F.suitPrefix || 'suit') +
        `<rect x="15.5" y="57" width="8.8" height="17" rx="4.4" fill="#faf6e8" stroke="${ac}" stroke-width="1.5"/>` +
        `<rect x="18" y="61" width="3.8" height="9" rx="1.9" fill="#bfead8"/>` +
        `<rect x="75.7" y="57" width="8.8" height="17" rx="4.4" fill="#faf6e8" stroke="${ac}" stroke-width="1.5"/>` +
        `<rect x="78.2" y="61" width="3.8" height="9" rx="1.9" fill="#bfead8"/>` +
        `<line x1="63" y1="45" x2="72" y2="41" stroke="#d8b25c" stroke-width="1.4" stroke-linecap="round"/>` +
        clover(68, 43, 5.2, '#43b884') +
        `<path d="M23.5 96 V86 L30.5 84 V94" stroke="${ink}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
        `<circle cx="22" cy="96.5" r="2.2" fill="${ink}"/><circle cx="29" cy="94.5" r="2.2" fill="${ink}"/>` +
        `<rect x="69" y="90" width="2.2" height="7" rx="1.1" fill="${ac}"/><rect x="73" y="87" width="2.2" height="10" rx="1.1" fill="${ink}"/><rect x="77" y="91" width="2.2" height="6" rx="1.1" fill="${ac}"/>`;
    },
    court(c, F, ink) {
      return prismCourt(c, 'mio', F, ink, {
        imageBox: (idx) => idx === 0
          ? { x: 11, y: 24, w: 74, h: 104 }
          : { x: 13, y: 24, w: 74, h: 106 },
        backdrop: (s, suitInk, ac) =>
          `<circle cx="50" cy="56" r="20" fill="none" stroke="${ac}" stroke-width=".9" stroke-opacity=".28"/>` +
          `<circle cx="50" cy="56" r="27" fill="none" stroke="${ac}" stroke-width=".85" stroke-dasharray="5 3" stroke-opacity=".24"/>` +
          `<g opacity=".26" fill="${suitInk}">` +
          `<rect x="24" y="91" width="2.2" height="7" rx="1"/><rect x="27.5" y="88" width="2.2" height="10" rx="1"/><rect x="31" y="92" width="2.2" height="6" rx="1"/>` +
          `</g>` +
          `<path d="M70 33 V26 L75 24.5 V31.5" stroke="${suitInk}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".6"/>` +
          `<circle cx="69" cy="33.5" r="1.5" fill="${suitInk}" opacity=".6"/><circle cx="74" cy="32" r="1.5" fill="${suitInk}" opacity=".6"/>`,
        overlay: (_s, _suitInk, ac) =>
          clover(71.5, 95, 3.3, ac),
        sashAccent: () =>
          `<path d="M28 113 V107.5 L32.5 106.5 V112" stroke="#fff9e6" stroke-width="1.1" fill="none" stroke-linecap="round"/>` +
          `<circle cx="27.2" cy="113.3" r="1.3" fill="#fff9e6"/><circle cx="31.7" cy="112.3" r="1.3" fill="#fff9e6"/>` +
          `<g transform="translate(70 110)">${clover(0, 0, 2.5, '#d9ffee')}</g>`,
      });
    },
  });

  Art.registerBack('mio', {
    name: 'Mio Clover',
    edge: '#f4fff9',
    bg: '#5cc79c',
    bg2: '#286657',
    frame: '#fff9e6',
    dash: '3 3',
    patternW: 24,
    patternH: 24,
    tile: `<rect x="3" y="13" width="2" height="7" rx="1" fill="#ffffff" opacity=".32"/>` +
      `<rect x="6.5" y="9" width="2" height="11" rx="1" fill="#ffffff" opacity=".40"/>` +
      `<rect x="10" y="11" width="2" height="9" rx="1" fill="#ffffff" opacity=".32"/>` +
      clover(17.5, 7, 2.8, '#d9ffee') +
      `<circle cx="17.5" cy="17.5" r="1.1" fill="#fff9e6" opacity=".38"/>`,
    inner: `<g fill="none" stroke="#fff9e6" stroke-width="1.1" opacity=".40">` +
      `<path d="M11 25 A14 14 0 0 0 25 11"/><path d="M11 32 A21 21 0 0 0 32 11"/>` +
      `<path d="M89 25 A14 14 0 0 1 75 11"/><path d="M89 32 A21 21 0 0 1 68 11"/>` +
      `<path d="M11 115 A14 14 0 0 1 25 129"/><path d="M11 108 A21 21 0 0 1 32 129"/>` +
      `<path d="M89 115 A14 14 0 0 0 75 129"/><path d="M89 108 A21 21 0 0 0 68 129"/>` +
      `<circle cx="50" cy="70" r="25" stroke-dasharray="4 3"/>` +
      `</g>`,
    emblem: `<circle cx="50" cy="70" r="18.5" fill="#fffdf6" stroke="#a6edd0" stroke-width="1.6"/>` +
      `<path d="M36.5 70 Q36.5 55.5 50 55.5 Q63.5 55.5 63.5 70" fill="none" stroke="#f5f0da" stroke-width="4.2" stroke-linecap="round"/>` +
      `<path d="M36.5 70 Q36.5 55.5 50 55.5 Q63.5 55.5 63.5 70" fill="none" stroke="#5cc79c" stroke-width="2.1" stroke-linecap="round"/>` +
      `<rect x="33.8" y="66.5" width="4.8" height="9.5" rx="2.4" fill="#286657" stroke="#f5f0da" stroke-width=".8"/>` +
      `<rect x="61.4" y="66.5" width="4.8" height="9.5" rx="2.4" fill="#286657" stroke="#f5f0da" stroke-width=".8"/>` +
      `<line x1="46" y1="69" x2="54" y2="66" stroke="#e2b857" stroke-width="1.2" stroke-linecap="round"/>` +
      clover(50, 70, 5.7, '#3cb882'),
  });
})();
