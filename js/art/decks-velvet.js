/* Slopitaire — Velvet & Matrix card fronts and backs (Ayame, Kira, Kaede). */
(() => {
  'use strict';

  const { use, star4Path, heartAt, butterfly } = Art.H;

  // ---------- shared character motif builders ----------

  function satinBow(cx, cy, rot, sc = 1, fill = '#6e1231', inner = '#a81d48', rim = '#ff6488', knot = '#ff2e68') {
    return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${sc})">` +
      `<path d="M-1.2 1 L-5.5 8.5 L-2 7 L0 2.5 Z M1.2 1 L5.5 8.5 L2 7 L0 2.5 Z" fill="${fill}" stroke="${rim}" stroke-width=".75" stroke-linejoin="round"/>` +
      `<path d="M0 0 C-4.5 -5.5 -10.5 -4.5 -10 0.5 C-9.5 4.8 -4 4.2 0 0 Z" fill="${fill}" stroke="${rim}" stroke-width=".9" stroke-linejoin="round"/>` +
      `<path d="M0 0 C4.5 -5.5 10.5 -4.5 10 0.5 C9.5 4.8 4 4.2 0 0 Z" fill="${fill}" stroke="${rim}" stroke-width=".9" stroke-linejoin="round"/>` +
      `<path d="M-2.2 -.2 C-5 -2.6 -7.6 -1.8 -7.4 .3 C-7.2 2 -4.2 1.8 -2.2 -.2 Z" fill="${inner}" opacity=".75"/>` +
      `<path d="M2.2 -.2 C5 -2.6 7.6 -1.8 7.4 .3 C7.2 2 4.2 1.8 2.2 -.2 Z" fill="${inner}" opacity=".75"/>` +
      `<circle cx="0" cy="0" r="2.1" fill="${knot}" stroke="#ffd35c" stroke-width=".75"/>` +
      `</g>`;
  }

  function keyholeLocket(cx, cy, sc = 1, rim = '#ffd35c', body = '#180913', hole = '#ff2e68') {
    return `<g transform="translate(${cx} ${cy}) scale(${sc})">` +
      `<circle cx="0" cy="-9.2" r="2.1" fill="none" stroke="${rim}" stroke-width="1.3"/>` +
      `<path d="M0 9.5 C-6 5.2 -10 1 -10 -3.2 C-10 -6.8 -7.3 -9 -4.3 -9 C-2.1 -9 -.7 -7.7 0 -6 C.7 -7.7 2.1 -9 4.3 -9 C7.3 -9 10 -6.8 10 -3.2 C10 1 6 5.2 0 9.5 Z" fill="${body}" stroke="${rim}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M0 7.1 C-4.4 3.8 -7.4 .7 -7.4 -2.7 C-7.4 -5.1 -5.6 -6.7 -3.6 -6.7 C-1.9 -6.7 -.7 -5.6 0 -4.1 C.7 -5.6 1.9 -6.7 3.6 -6.7 C5.6 -6.7 7.4 -5.1 7.4 -2.7 C7.4 .7 4.4 3.8 0 7.1 Z" fill="none" stroke="${hole}" stroke-width=".7" stroke-opacity=".55"/>` +
      `<circle cx="0" cy="-2.1" r="2.1" fill="${hole}"/>` +
      `<path d="M-1.5 4.4 L-.7 -1.2 H.7 L1.5 4.4 Z" fill="${hole}"/>` +
      `</g>`;
  }

  function kiraVisor(cx, cy, w, h, lens = '#0d362c', rim = '#ffd35c', hud = '#75ffd1') {
    const hw = w / 2, hh = h / 2, iw = hw * 0.85, ih = hh * 0.78;
    const x0 = (cx - hw).toFixed(1), x1 = (cx + hw).toFixed(1);
    const ix0 = (cx - iw).toFixed(1), ix1 = (cx + iw).toFixed(1);
    const yt = (cy - hh).toFixed(1), yb = (cy + hh).toFixed(1);
    const ym = (cy - hh * 1.24).toFixed(1), yc = (cy + hh * 0.74).toFixed(1);
    const iy0 = (cy - ih * 0.75).toFixed(1), iy1 = (cy + ih * 0.55).toFixed(1);
    const rx = (cx + hw * 0.42).toFixed(1);
    return `<path d="M${x0} ${yt} Q${cx} ${ym} ${x1} ${yt} L${ix1} ${yb} Q${cx} ${yc} ${ix0} ${yb} Z" fill="${lens}" fill-opacity=".92" stroke="${rim}" stroke-width="1.55" stroke-linejoin="round"/>` +
      `<polygon points="${(cx - hw * 0.62).toFixed(1)},${iy0} ${(cx - hw * 0.25).toFixed(1)},${iy0} ${(cx - hw * 0.44).toFixed(1)},${iy1} ${(cx - hw * 0.72).toFixed(1)},${iy1}" fill="${hud}" opacity=".26"/>` +
      `<circle cx="${rx}" cy="${cy.toFixed(1)}" r="${(h * 0.26).toFixed(1)}" fill="none" stroke="${hud}" stroke-width="1"/>` +
      `<circle cx="${rx}" cy="${cy.toFixed(1)}" r="${(h * 0.08).toFixed(1)}" fill="${hud}"/>` +
      `<line x1="${(cx - hw * 0.58).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + hw * 0.1).toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${hud}" stroke-width="1.2" stroke-dasharray="5 2.5" stroke-linecap="round"/>`;
  }

  function kaedeButterfly(cx, cy, sc = 1, rot = 0, wing = '#e5a93b', spot = '#fff5d1', body = '#59362b') {
    return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${sc})">` +
      `<path d="M-.8 -1 C-4.5 -8.5 -12 -7.5 -10.5 -1.5 C-9.5 2.5 -4 2.5 -.8 .2 Z" fill="${wing}" stroke="${body}" stroke-width=".85" stroke-linejoin="round"/>` +
      `<path d="M.8 -1 C4.5 -8.5 12 -7.5 10.5 -1.5 C9.5 2.5 4 2.5 .8 .2 Z" fill="${wing}" stroke="${body}" stroke-width=".85" stroke-linejoin="round"/>` +
      `<path d="M-.8 .8 C-4.8 1.5 -8.5 5.2 -6.2 7.8 C-4 10 -1.5 6.5 -.6 2.2 Z" fill="${wing}" stroke="${body}" stroke-width=".8" stroke-linejoin="round" opacity=".94"/>` +
      `<path d="M.8 .8 C4.8 1.5 8.5 5.2 6.2 7.8 C4 10 1.5 6.5 .6 2.2 Z" fill="${wing}" stroke="${body}" stroke-width=".8" stroke-linejoin="round" opacity=".94"/>` +
      `<ellipse cx="-5.8" cy="-2.4" rx="2.3" ry="1.6" transform="rotate(-22 -5.8 -2.4)" fill="${spot}" opacity=".85"/>` +
      `<ellipse cx="5.8" cy="-2.4" rx="2.3" ry="1.6" transform="rotate(22 5.8 -2.4)" fill="${spot}" opacity=".85"/>` +
      `<circle cx="-4.2" cy="4.4" r="1.1" fill="${spot}" opacity=".8"/><circle cx="4.2" cy="4.4" r="1.1" fill="${spot}" opacity=".8"/>` +
      `<path d="M-.7 -4.6 Q-2.8 -7.8 -4.2 -7.6 M.7 -4.6 Q2.8 -7.8 4.2 -7.6" fill="none" stroke="${body}" stroke-width=".75" stroke-linecap="round"/>` +
      `<rect x="-1" y="-5" width="2" height="10.2" rx="1" fill="${body}"/>` +
      `</g>`;
  }

  function teaLeaf(cx, cy, rot, sc = 1, fill = '#63a360', vein = '#e5f5cf') {
    return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${sc})">` +
      `<path d="M0 -5.5 C3.4 -3.2 3.6 2.4 0 5.5 C-3.6 2.4 -3.4 -3.2 0 -5.5 Z" fill="${fill}"/>` +
      `<path d="M0 -4.2 V4.6 M0 -1.2 L1.7 -2.5 M0 .8 L-1.7 -.5" stroke="${vein}" stroke-width=".65" fill="none" stroke-linecap="round"/>` +
      `</g>`;
  }

  // ---------- shared court card scaffold for Ayame, Kira, Kaede ----------

  function rankBadge(rank, ink, pillBg, ac, strokeCol) {
    if (rank === 13) {
      return `<path d="M24 33.5 L24.5 25 L27.8 29 L30.8 24 L33.8 29 L37.1 25 L37.6 33.5 Z" fill="#ffd35c" stroke="${strokeCol}" stroke-width="1" stroke-linejoin="round"/>` +
        `<circle cx="30.8" cy="30.5" r="1.35" fill="${ink}"/>`;
    }
    if (rank === 12) {
      return `<path d="M24.2 32.8 Q30.8 26 37.4 32.8 L35.6 33.5 Q30.8 29.2 26 33.5 Z" fill="#ffd35c" stroke="${strokeCol}" stroke-width=".9" stroke-linejoin="round"/>` +
        `<path d="M30.8 24 L32.2 27.6 L29.4 27.6 Z" fill="#ffd35c" stroke="${strokeCol}" stroke-width=".75" stroke-linejoin="round"/>` +
        `<circle cx="26.4" cy="28.3" r="1.1" fill="#ffd35c" stroke="${strokeCol}" stroke-width=".7"/>` +
        `<circle cx="35.2" cy="28.3" r="1.1" fill="#ffd35c" stroke="${strokeCol}" stroke-width=".7"/>` +
        `<circle cx="30.8" cy="29.4" r="1.25" fill="${ink}"/>`;
    }
    return `<path d="M26 25 H35.6 V30 Q35.6 33.5 30.8 35.4 Q26 33.5 26 30 Z" fill="${ac}" stroke="${strokeCol}" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M30.8 26.7 L33.3 29.7 L30.8 32.7 L28.3 29.7 Z" fill="${pillBg}"/>`;
  }

  function makeCourt(key, opts) {
    return (c, F, ink) => {
      const s = c.suit, r = c.rank, ac = F.accent, pfx = F.suitPrefix || 'suit';
      const id = `fc_${key}_${c.id}`;
      const src = F.portraits[r - 11] || F.portraits[0];
      const pillBg = opts.pillBg;
      const box = (opts.poseBox && opts.poseBox[r]) || { x: 13, y: 24.5, w: 74, h: 94 };

      let g = `<defs><clipPath id="${id}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>`;
      g += `<rect x="21" y="22" width="58" height="96" rx="8" fill="${F.tint[s]}" stroke="${ink}" stroke-opacity="${F.dark ? '.65' : '.52'}" stroke-width="1.3"/>`;
      g += `<g clip-path="url(#${id})">`;
      g += opts.backdrop(s, ink, ac, r);
      g += `<image href="${src}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMin meet"/>`;
      g += rankBadge(r, ink, pillBg, ac, opts.badgeStroke);
      g += `<rect x="21" y="103" width="58" height="15" fill="${ink}" fill-opacity="${F.dark ? '.9' : '.92'}"/>`;
      g += `<line x1="21" y1="103.3" x2="79" y2="103.3" stroke="${opts.badgeStroke}" stroke-width="1.2"/>`;
      g += `<line x1="21" y1="104.3" x2="79" y2="104.3" stroke="${opts.sashTrim}" stroke-width=".75" stroke-opacity=".9"/>`;
      g += opts.sashDecor(ink, ac, pillBg);
      g += `<rect x="41" y="104.9" width="18" height="11.8" rx="4" fill="${pillBg}" fill-opacity=".98"/>`;
      g += use(s, 45, 105.8, 10, ink, pfx);
      g += '</g>';
      return g;
    };
  }

  // ---------- 1. Ayame — VELVET DEVOTION ----------

  Art.registerFront('ayame', {
    name: 'Ayame',
    subtitle: 'VELVET DEVOTION',
    dark: true,
    bg: 'linear-gradient(180deg, #180913 0%, #240d1c 55%, #12060e 100%)',
    border: 'rgba(224, 48, 96, .58)',
    font: "'Nunito', Georgia, serif",
    weight: '800',
    suitPrefix: 'suit',
    previewSuit: 0,
    ink: ['#ff2e68', '#ff6488', '#dfd4f5', '#b9a5e8'],
    tint: ['#330c1d', '#331222', '#231630', '#1e132b'],
    accent: '#ff2e68',
    portraits: [
      'images/ayame/default/corner_smug.webp',
      'images/ayame/default/corner_special.webp',
      'images/ayame/default/corner_hype.webp',
    ],
    frame(F, ink, isPip) {
      const ac = F.accent;
      let g = `<path d="M30 5 H43.5 Q46.8 2.2 50 5 Q53.2 2.2 56.5 5 H70" fill="none" stroke="${ink}" stroke-width=".95" stroke-opacity=".46"/>` +
        `<path d="M30 135 H43.5 Q46.8 137.8 50 135 Q53.2 137.8 56.5 135 H70" fill="none" stroke="${ink}" stroke-width=".95" stroke-opacity=".46"/>` +
        `<polygon points="50,2.5 52.8,5 50,7.5 47.2,5" fill="${ac}" opacity=".88"/>` +
        `<polygon points="50,132.5 52.8,135 50,137.5 47.2,135" fill="${ac}" opacity=".88"/>` +
        `<circle cx="36" cy="5" r=".9" fill="#ffd35c" opacity=".65"/><circle cx="64" cy="5" r=".9" fill="#ffd35c" opacity=".65"/>` +
        `<circle cx="36" cy="135" r=".9" fill="#ffd35c" opacity=".65"/><circle cx="64" cy="135" r=".9" fill="#ffd35c" opacity=".65"/>` +
        `<path d="M4.8 49 V91 M95.2 49 V91" stroke="${ink}" stroke-width=".8" stroke-dasharray="2.2 2.8" stroke-opacity=".35"/>` +
        `<polygon points="4.8,67.5 6.8,70 4.8,72.5 2.8,70" fill="${ac}" opacity=".65"/>` +
        `<polygon points="95.2,67.5 97.2,70 95.2,72.5 93.2,70" fill="${ac}" opacity=".65"/>`;
      if (isPip) {
        g += `<g opacity=".13">` +
          `<polygon points="50,48 68,70 50,92 32,70" fill="none" stroke="${ink}" stroke-width="1.3"/>` +
          `<polygon points="50,55 62,70 50,85 38,70" fill="none" stroke="${ac}" stroke-width=".9"/>` +
          `<path d="M36 78 V62 Q50 47 64 62 V78" fill="none" stroke="${ink}" stroke-width=".9"/>` +
          heartAt(45.5, 65.5, 0.09, ac) +
          `</g>`;
      }
      return g;
    },
    ace(c, F, ink) {
      const s = c.suit, ac = F.accent;
      return `<polygon points="50,31 84,68 50,105 16,68" fill="${F.tint[s]}" stroke="${ink}" stroke-width="1.15" stroke-opacity=".58"/>` +
        `<polygon points="50,36 79,68 50,100 21,68" fill="none" stroke="#ffd35c" stroke-width=".75" stroke-dasharray="3 2.5" stroke-opacity=".52"/>` +
        `<path d="M31 83 V58 Q50 37 69 58 V83" fill="none" stroke="${ink}" stroke-width=".95" stroke-opacity=".42"/>` +
        use(s, 22, 39, 56, ink, 'suit') +
        satinBow(28, 46, -26, 0.92) +
        satinBow(72, 46, 26, 0.92) +
        keyholeLocket(50, 69.5, 0.92, '#ffd35c', '#180913', ac) +
        `<path d="M36 93 Q50 100 64 93" fill="none" stroke="#ffd35c" stroke-width=".9" stroke-opacity=".6"/>` +
        `<path d="${star4Path(24, 92, 3.3, 1)}" fill="#ffd35c" opacity=".82"/>` +
        `<path d="${star4Path(76, 92, 3.3, 1)}" fill="#ffd35c" opacity=".82"/>`;
    },
    court: makeCourt('ayame', {
      pillBg: '#180913',
      badgeStroke: '#180913',
      sashTrim: '#ffd35c',
      backdrop(s, ink, ac) {
        return `<path d="M24 103 V52 Q50 23 76 52 V103" fill="${ink}" fill-opacity=".14" stroke="${ac}" stroke-width=".9" stroke-opacity=".42"/>` +
          `<polygon points="50,24 76,60 50,96 24,60" fill="none" stroke="#ffd35c" stroke-width=".7" stroke-dasharray="3 2.5" stroke-opacity=".34"/>` +
          `<circle cx="50" cy="52" r="21" fill="none" stroke="${ac}" stroke-width=".85" stroke-dasharray="2 3" opacity=".32"/>`;
      },
      sashDecor(ink, ac) {
        return `<polygon points="29,110.8 31.8,108.3 34.6,110.8 31.8,113.3" fill="#ffd35c" stroke="#180913" stroke-width=".75"/>` +
          `<polygon points="65.4,110.8 68.2,108.3 71,110.8 68.2,113.3" fill="#ffd35c" stroke="#180913" stroke-width=".75"/>` +
          `<circle cx="25.2" cy="110.8" r="1.2" fill="${ac}" stroke="#180913" stroke-width=".65"/><circle cx="74.8" cy="110.8" r="1.2" fill="${ac}" stroke="#180913" stroke-width=".65"/>`;
      },
    }),
  });

  Art.registerBack('ayame', {
    name: 'Ayame Velvet',
    edge: '#2b0d1b',
    bg: '#160710',
    bg2: '#420d26',
    frame: '#ff2e68',
    dash: '2 2',
    patternW: 20,
    patternH: 20,
    tile: `<polygon points="10,0 20,10 10,20 0,10" fill="none" stroke="#ff2e68" stroke-width=".6" opacity=".34"/>` +
      `<polygon points="10,3.2 16.8,10 10,16.8 3.2,10" fill="none" stroke="#ffd35c" stroke-width=".35" stroke-dasharray="1.5 1.5" opacity=".28"/>` +
      heartAt(7.2, 7.2, 0.056, '#a8224f') +
      `<circle cx="10" cy="0" r=".8" fill="#ffd35c" opacity=".35"/><circle cx="0" cy="10" r=".8" fill="#ffd35c" opacity=".35"/>`,
    inner: `<g fill="none" stroke-linecap="round">` +
      `<path d="M12 31 V16 Q12 12 16 12 H31 M16 25 V17 Q16 16 17 16 H25" stroke="#ff6488" stroke-width="1" opacity=".55"/>` +
      `<path d="M88 31 V16 Q88 12 84 12 H69 M84 25 V17 Q84 16 83 16 H75" stroke="#ff6488" stroke-width="1" opacity=".55"/>` +
      `<path d="M12 109 V124 Q12 128 16 128 H31 M16 115 V123 Q16 124 17 124 H25" stroke="#ff6488" stroke-width="1" opacity=".55"/>` +
      `<path d="M88 109 V124 Q88 128 84 128 H69 M84 115 V123 Q84 124 83 124 H75" stroke="#ff6488" stroke-width="1" opacity=".55"/>` +
      `<path d="M26 20 Q50 10 74 20 M26 120 Q50 130 74 120" stroke="#ffd35c" stroke-width=".85" opacity=".48"/>` +
      `<path d="M13 44 V96 M87 44 V96" stroke="#ff2e68" stroke-width=".75" stroke-dasharray="2 3" opacity=".4"/>` +
      `</g>` +
      `<polygon points="16,16 19,16 16,19" fill="#ffd35c" opacity=".75"/>` +
      `<polygon points="84,16 81,16 84,19" fill="#ffd35c" opacity=".75"/>` +
      `<polygon points="16,124 19,124 16,121" fill="#ffd35c" opacity=".75"/>` +
      `<polygon points="84,124 81,124 84,121" fill="#ffd35c" opacity=".75"/>`,
    emblem: `<circle cx="50" cy="70" r="19.5" fill="#180710" stroke="#ff2e68" stroke-width="1.6"/>` +
      `<circle cx="50" cy="70" r="16.2" fill="none" stroke="#ffd35c" stroke-width=".75" stroke-dasharray="2.5 2"/>` +
      satinBow(41, 54.5, -22, 0.74, '#7a1537', '#bd2655', '#ff7096', '#ff2e68') +
      satinBow(59, 54.5, 22, 0.74, '#7a1537', '#bd2655', '#ff7096', '#ff2e68') +
      keyholeLocket(50, 72.5, 1.02, '#ffd35c', '#240b18', '#ff2e68') +
      `<circle cx="50" cy="86.5" r="1.3" fill="#ffd35c"/>`,
  });

  // ---------- 2. Kira — AURA NETRUNNER ----------

  Art.registerFront('kira', {
    name: 'Kira',
    subtitle: 'AURA NETRUNNER',
    dark: true,
    bg: 'linear-gradient(180deg, #0a1518 0%, #0f2226 55%, #081114 100%)',
    border: 'rgba(44, 232, 162, .52)',
    font: "'Orbitron', 'Chakra Petch', sans-serif",
    weight: '700',
    suitPrefix: 'csuit',
    previewSuit: 2,
    ink: ['#ff4d6d', '#ff9638', '#2ce8a2', '#75ffd1'],
    tint: ['#291119', '#291a10', '#0a2920', '#0e2b25'],
    accent: '#ffd35c',
    portraits: [
      'images/kira/default/corner_smug.webp',
      'images/kira/default/corner_special.webp',
      'images/kira/default/corner_hype.webp',
    ],
    frame(F, ink, isPip) {
      const ac = F.accent;
      let g = `<path d="M30 5 H41 L44 2.8 H56 L59 5 H70 M30 135 H41 L44 137.2 H56 L59 135 H70" fill="none" stroke="${ink}" stroke-width="1.05" stroke-opacity=".48"/>` +
        `<path d="M35 7.6 H43 L45 5.8 H55 L57 7.6 H65 M35 132.4 H43 L45 134.2 H55 L57 132.4 H65" fill="none" stroke="#2ce8a2" stroke-width=".65" stroke-opacity=".35"/>` +
        `<circle cx="30" cy="5" r="1.2" fill="${ac}"/><circle cx="70" cy="5" r="1.2" fill="${ac}"/>` +
        `<circle cx="50" cy="4.4" r="1.5" fill="${ac}"/><circle cx="50" cy="135.6" r="1.5" fill="${ac}"/>` +
        `<circle cx="30" cy="135" r="1.2" fill="${ac}"/><circle cx="70" cy="135" r="1.2" fill="${ac}"/>` +
        `<path d="M4.6 49 V60 L6.8 63 V77 L4.6 80 V91 M95.4 49 V60 L93.2 63 V77 L95.4 80 V91" fill="none" stroke="${ink}" stroke-width=".9" stroke-opacity=".38"/>` +
        `<circle cx="4.6" cy="49" r="1.1" fill="${ac}" opacity=".8"/><circle cx="4.6" cy="91" r="1.1" fill="${ac}" opacity=".8"/>` +
        `<circle cx="95.4" cy="49" r="1.1" fill="${ac}" opacity=".8"/><circle cx="95.4" cy="91" r="1.1" fill="${ac}" opacity=".8"/>`;
      if (isPip) {
        g += `<g opacity=".15">` +
          `<polygon points="50,49 67,59 67,81 50,91 33,81 33,59" fill="none" stroke="${ink}" stroke-width="1.3"/>` +
          `<polygon points="50,56 61,62.5 61,77.5 50,84 39,77.5 39,62.5" fill="none" stroke="${ac}" stroke-width=".85"/>` +
          `<path d="M50 49 V44 M50 91 V96 M33 70 H27 M67 70 H73" stroke="#2ce8a2" stroke-width="1"/>` +
          `<circle cx="50" cy="44" r="1.3" fill="${ac}"/><circle cx="50" cy="96" r="1.3" fill="${ac}"/>` +
          `</g>`;
      }
      return g;
    },
    ace(c, F, ink) {
      const s = c.suit, ac = F.accent;
      return `<polygon points="50,33 81,51 81,87 50,105 19,87 19,51" fill="${F.tint[s]}" stroke="${ink}" stroke-width="1.15" stroke-opacity=".55"/>` +
        `<polygon points="50,37.5 76.5,53 76.5,85 50,100.5 23.5,85 23.5,53" fill="none" stroke="#2ce8a2" stroke-width=".7" stroke-dasharray="6 3" stroke-opacity=".42"/>` +
        `<path d="M16 52 H25 L30 57 M84 52 H75 L70 57 M16 86 H25 L30 81 M84 86 H75 L70 81" fill="none" stroke="#2ce8a2" stroke-width="1.2" opacity=".78"/>` +
        `<circle cx="16" cy="52" r="1.6" fill="#081114" stroke="${ac}" stroke-width="1.1"/>` +
        `<circle cx="84" cy="52" r="1.6" fill="#081114" stroke="${ac}" stroke-width="1.1"/>` +
        `<circle cx="16" cy="86" r="1.6" fill="#081114" stroke="${ac}" stroke-width="1.1"/>` +
        `<circle cx="84" cy="86" r="1.6" fill="#081114" stroke="${ac}" stroke-width="1.1"/>` +
        `<polygon points="16.5,65 19.5,67 19.5,71 16.5,73 13.5,71 13.5,67" fill="none" stroke="${ink}" stroke-width=".9" opacity=".65"/>` +
        `<polygon points="83.5,65 86.5,67 86.5,71 83.5,73 80.5,71 80.5,67" fill="none" stroke="${ink}" stroke-width=".9" opacity=".65"/>` +
        use(s, 22, 39, 56, ink, 'csuit') +
        kiraVisor(50, 61.5, 42, 13.5, '#0b3329', ac, '#75ffd1') +
        `<path d="M40 96 H60" stroke="${ac}" stroke-width="1" stroke-dasharray="3 2" opacity=".7"/>` +
        `<circle cx="50" cy="96" r="1.7" fill="#2ce8a2"/>`;
    },
    court: makeCourt('kira', {
      pillBg: '#081114',
      badgeStroke: '#081114',
      sashTrim: '#ffd35c',
      poseBox: {
        13: { x: 16.5, y: 24.5, w: 74, h: 94 },
      },
      backdrop(s, ink, ac) {
        return `<polygon points="50,24 76,39 76,69 50,84 24,69 24,39" fill="${ink}" fill-opacity=".13" stroke="#2ce8a2" stroke-width=".9" stroke-opacity=".42"/>` +
          `<path d="M21 44 H28 L33 49 M79 44 H72 L67 49 M21 80 H29 L34 75 M79 80 H71 L66 75" fill="none" stroke="${ac}" stroke-width=".9" stroke-opacity=".5"/>` +
          `<circle cx="28" cy="44" r="1.3" fill="${ac}" opacity=".75"/><circle cx="72" cy="44" r="1.3" fill="${ac}" opacity=".75"/>` +
          `<circle cx="50" cy="54" r="22" fill="none" stroke="${ink}" stroke-width=".8" stroke-dasharray="6 3" opacity=".32"/>`;
      },
      sashDecor(ink, ac) {
        return `<path d="M23 110.8 H35 L37.5 108.5 M77 110.8 H65 L62.5 108.5" fill="none" stroke="#081114" stroke-width="1.5" opacity=".88"/>` +
          `<path d="M23 110.8 H35 L37.5 108.5 M77 110.8 H65 L62.5 108.5" fill="none" stroke="${ac}" stroke-width=".7" opacity=".95"/>` +
          `<circle cx="26" cy="110.8" r="1.7" fill="#081114" stroke="${ac}" stroke-width=".9"/>` +
          `<circle cx="74" cy="110.8" r="1.7" fill="#081114" stroke="${ac}" stroke-width=".9"/>`;
      },
    }),
  });

  Art.registerBack('kira', {
    name: 'Kira Matrix',
    edge: '#15332d',
    bg: '#0a1518',
    bg2: '#0f2d27',
    frame: '#2ce8a2',
    dash: '7 2 2 2',
    patternW: 24,
    patternH: 24,
    tile: `<path d="M0 12 H7 L11 8 H17 L21 12 H24 M12 0 V5 L8 9 M12 24 V19 L16 15" fill="none" stroke="#2ce8a2" stroke-width=".65" opacity=".36"/>` +
      `<circle cx="11" cy="8" r="1.3" fill="#0a1518" stroke="#ffd35c" stroke-width=".75" opacity=".65"/>` +
      `<circle cx="17" cy="8" r="1.1" fill="#75ffd1" opacity=".45"/>` +
      `<polygon points="5,18 7,19.2 7,21.5 5,22.7 3,21.5 3,19.2" fill="none" stroke="#2ce8a2" stroke-width=".5" opacity=".32"/>`,
    inner: `<g fill="none" stroke-linecap="round">` +
      `<path d="M13 35 V20 L20 13 H35 M13 105 V120 L20 127 H35" stroke="#2ce8a2" stroke-width="1.15" opacity=".55"/>` +
      `<path d="M87 35 V20 L80 13 H65 M87 105 V120 L80 127 H65" stroke="#2ce8a2" stroke-width="1.15" opacity=".55"/>` +
      `<path d="M17 31 V22 L22 17 H31 M17 109 V118 L22 123 H31" stroke="#ffd35c" stroke-width=".8" opacity=".48"/>` +
      `<path d="M83 31 V22 L78 17 H69 M83 109 V118 L78 123 H69" stroke="#ffd35c" stroke-width=".8" opacity=".48"/>` +
      `<path d="M13 60 V80 M87 60 V80" stroke="#75ffd1" stroke-width="1" stroke-dasharray="4 3" opacity=".45"/>` +
      `</g>` +
      `<circle cx="35" cy="13" r="1.6" fill="#0a1518" stroke="#ffd35c" stroke-width=".9"/>` +
      `<circle cx="65" cy="13" r="1.6" fill="#0a1518" stroke="#ffd35c" stroke-width=".9"/>` +
      `<circle cx="35" cy="127" r="1.6" fill="#0a1518" stroke="#ffd35c" stroke-width=".9"/>` +
      `<circle cx="65" cy="127" r="1.6" fill="#0a1518" stroke="#ffd35c" stroke-width=".9"/>`,
    emblem: `<polygon points="50,49 69,60 69,80 50,91 31,80 31,60" fill="#081316" stroke="#2ce8a2" stroke-width="1.7"/>` +
      `<polygon points="50,53 65.5,62 65.5,78 50,87 34.5,78 34.5,62" fill="none" stroke="#ffd35c" stroke-width=".75" stroke-opacity=".6"/>` +
      kiraVisor(50, 68, 28, 10.5, '#12493b', '#ffd35c', '#75ffd1') +
      `<path d="M40 79 H46 L48 77 H52 L54 79 H60" fill="none" stroke="#2ce8a2" stroke-width="1"/>` +
      `<circle cx="50" cy="82.5" r="1.6" fill="#ffd35c"/>`,
  });

  // ---------- 3. Kaede — WARM ONEE-SAN PARLOR ----------

  Art.registerFront('kaede', {
    name: 'Kaede',
    subtitle: 'WARM ONEE-SAN PARLOR',
    dark: false,
    bg: 'linear-gradient(180deg, #fffdf8 0%, #faefd9 100%)',
    border: 'rgba(198, 148, 92, .55)',
    font: "'Nunito', Georgia, sans-serif",
    weight: '800',
    suitPrefix: 'suit',
    previewSuit: 1,
    ink: ['#d4425c', '#db6c37', '#59362b', '#362328'],
    tint: ['#fcebe9', '#fdefe3', '#f3e8de', '#eee4e2'],
    accent: '#e5a93b',
    portraits: [
      'images/kaede/default/corner_wink.webp',
      'images/kaede/default/corner_special.webp',
      'images/kaede/default/corner_cheer.webp',
    ],
    frame(F, ink, isPip) {
      const ac = F.accent;
      let g = `<path d="M30 6.2 Q50 1.8 70 6.2 M35 8 Q50 4.6 65 8" fill="none" stroke="${ac}" stroke-width="1.05" stroke-opacity=".55" stroke-linecap="round"/>` +
        `<path d="M30 133.8 Q50 138.2 70 133.8 M35 132 Q50 135.4 65 132" fill="none" stroke="${ac}" stroke-width="1.05" stroke-opacity=".55" stroke-linecap="round"/>` +
        `<circle cx="50" cy="4.4" r="1.6" fill="${ac}" stroke="#8a5625" stroke-width=".5"/>` +
        `<circle cx="50" cy="135.6" r="1.6" fill="${ac}" stroke="#8a5625" stroke-width=".5"/>` +
        `<circle cx="35" cy="5.5" r=".95" fill="${ink}" opacity=".45"/><circle cx="65" cy="5.5" r=".95" fill="${ink}" opacity=".45"/>` +
        `<circle cx="35" cy="134.5" r=".95" fill="${ink}" opacity=".45"/><circle cx="65" cy="134.5" r=".95" fill="${ink}" opacity=".45"/>` +
        `<path d="M4.8 49 Q6.8 59.5 4.8 70 Q2.8 80.5 4.8 91 M95.2 49 Q93.2 59.5 95.2 70 Q97.2 80.5 95.2 91" fill="none" stroke="${ac}" stroke-width=".95" stroke-opacity=".46" stroke-linecap="round"/>` +
        teaLeaf(4.8, 70, 0, 0.55, '#68a462', '#eef8dc') +
        teaLeaf(95.2, 70, 0, 0.55, '#68a462', '#eef8dc');
      if (isPip) {
        g += `<g opacity=".14">` +
          `<polygon points="50,48 68,70 50,92 32,70" fill="none" stroke="${ac}" stroke-width="1.2"/>` +
          `<path d="M41 59 L59 81 M59 59 L41 81" stroke="#8c533e" stroke-width=".8" stroke-dasharray="2.5 2"/>` +
          butterfly(50, 70, 1.2, ac, '#fff8eb') +
          `</g>`;
      }
      return g;
    },
    ace(c, F, ink) {
      const s = c.suit, ac = F.accent;
      return `<path d="M22 100 V60 A28 28 0 0 1 78 60 V100 Q50 107 22 100 Z" fill="${F.tint[s]}" stroke="${ac}" stroke-width="1.2" stroke-opacity=".68"/>` +
        `<path d="M26 97 V61 A24 24 0 0 1 74 61 V97" fill="none" stroke="#c6945c" stroke-width=".8" stroke-dasharray="3 2.5" stroke-opacity=".52"/>` +
        `<path d="M32 52 L68 88 M68 52 L32 88" stroke="${ac}" stroke-width=".7" stroke-dasharray="3 3" stroke-opacity=".3"/>` +
        use(s, 22, 39, 56, ink, 'suit') +
        kaedeButterfly(67, 43, 1.08, 14) +
        `<path d="M25 93 Q33 98 42 96 M75 93 Q67 98 58 96" fill="none" stroke="${ac}" stroke-width=".95" stroke-linecap="round"/>` +
        teaLeaf(29, 93, -38, 0.85) +
        teaLeaf(35, 96, -68, 0.7) +
        teaLeaf(71, 93, 38, 0.85) +
        teaLeaf(65, 96, 68, 0.7) +
        `<circle cx="50" cy="99" r="1.8" fill="${ac}" stroke="#59362b" stroke-width=".6"/>` +
        `<circle cx="25" cy="48" r="1.5" fill="${ac}"/>`;
    },
    court: makeCourt('kaede', {
      pillBg: '#fffdf8',
      badgeStroke: '#59362b',
      sashTrim: '#f3c66f',
      poseBox: {
        13: { x: 17, y: 22.5, w: 78, h: 98 },
      },
      backdrop(s, ink, ac) {
        return `<path d="M24 103 V54 A26 26 0 0 1 76 54 V103" fill="${ac}" fill-opacity=".12" stroke="${ac}" stroke-width="1" stroke-opacity=".52"/>` +
          `<path d="M28 42 L72 86 M72 42 L28 86" stroke="#c6945c" stroke-width=".75" stroke-dasharray="3 3" stroke-opacity=".28"/>` +
          teaLeaf(26, 40, -28, 0.68, '#68a462', '#eef8dc') +
          teaLeaf(74, 40, 28, 0.68, '#68a462', '#eef8dc');
      },
      sashDecor(ink, ac, pillBg) {
        return `<circle cx="30" cy="110.8" r="1.8" fill="#f3c66f" stroke="#59362b" stroke-width=".65"/>` +
          `<circle cx="70" cy="110.8" r="1.8" fill="#f3c66f" stroke="#59362b" stroke-width=".65"/>` +
          `<circle cx="35.5" cy="110.8" r="1" fill="${pillBg}" stroke="#59362b" stroke-width=".45"/>` +
          `<circle cx="64.5" cy="110.8" r="1" fill="${pillBg}" stroke="#59362b" stroke-width=".45"/>`;
      },
    }),
  });

  Art.registerBack('kaede', {
    name: 'Kaede Parlor',
    edge: '#fff8eb',
    bg: '#8c533e',
    bg2: '#4a2820',
    frame: '#f3c66f',
    dash: '4 2',
    patternW: 20,
    patternH: 20,
    tile: `<polygon points="10,0 20,10 10,20 0,10" fill="#f7dfa8" fill-opacity=".07" stroke="#f7dfa8" stroke-width=".65" stroke-opacity=".3"/>` +
      `<path d="M0 0 L20 20 M20 0 L0 20" stroke="#f3c66f" stroke-width=".45" stroke-dasharray="1.8 2.2" opacity=".28"/>` +
      `<circle cx="10" cy="10" r="1.2" fill="#f3c66f" opacity=".4"/>`,
    inner: `<g fill="none" stroke-linecap="round">` +
      `<path d="M13 31 C13 17 17 13 31 13 M87 31 C87 17 83 13 69 13" stroke="#f3c66f" stroke-width="1.05" opacity=".58"/>` +
      `<path d="M13 109 C13 123 17 127 31 127 M87 109 C87 123 83 127 69 127" stroke="#f3c66f" stroke-width="1.05" opacity=".58"/>` +
      `<path d="M27 18 Q50 11 73 18 M27 122 Q50 129 73 122" stroke="#fff4d6" stroke-width=".85" opacity=".46"/>` +
      `</g>` +
      teaLeaf(16, 22, 30, 0.72, '#86bf7a', '#f7fce8') +
      teaLeaf(22, 16, 62, 0.65, '#f3c66f', '#fff9e6') +
      teaLeaf(84, 22, -30, 0.72, '#86bf7a', '#f7fce8') +
      teaLeaf(78, 16, -62, 0.65, '#f3c66f', '#fff9e6') +
      teaLeaf(16, 118, 150, 0.72, '#86bf7a', '#f7fce8') +
      teaLeaf(22, 124, 118, 0.65, '#f3c66f', '#fff9e6') +
      teaLeaf(84, 118, -150, 0.72, '#86bf7a', '#f7fce8') +
      teaLeaf(78, 124, -118, 0.65, '#f3c66f', '#fff9e6'),
    emblem: `<circle cx="50" cy="70" r="19" fill="#fffaf0" stroke="#e5a93b" stroke-width="1.8"/>` +
      `<circle cx="50" cy="70" r="15.8" fill="none" stroke="#c6945c" stroke-width=".8" stroke-dasharray="2 2"/>` +
      kaedeButterfly(50, 68.5, 1.15, 0, '#e5a93b', '#fff5d1', '#59362b') +
      teaLeaf(44, 81.5, -52, 0.68, '#68a462', '#eef8dc') +
      teaLeaf(56, 81.5, 52, 0.68, '#68a462', '#eef8dc') +
      `<circle cx="50" cy="82.5" r="1.2" fill="#e5a93b"/>`,
  });
})();
