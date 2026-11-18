/* Slopitaire — Tanner card front and back (AI-Bound Tsundere: prompt terminal + Western denim). */
(() => {
  'use strict';

  const { use, starPath, star4Path } = Art.H;

  // ---------- shared Tanner motif helpers ----------

  function denimRivet(cx, cy, r = 1.5, rim = '#f59e0b', core = '#451a03', hi = '#fde68a') {
    const cr = (r * 0.44).toFixed(2);
    const hr = (r * 0.24).toFixed(2);
    const hx = (cx - r * 0.28).toFixed(2);
    const hy = (cy - r * 0.28).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${rim}" stroke="#0a101d" stroke-width=".55"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${cr}" fill="${core}"/>` +
      `<circle cx="${hx}" cy="${hy}" r="${hr}" fill="${hi}" opacity=".85"/>`;
  }

  function spurStar(cx, cy, R = 5.4, r = 2.3, fill = '#f59e0b', stroke = '#0a101d', tipDots = true) {
    let g = `<path d="${starPath(cx, cy, R, r)}" fill="${fill}" stroke="${stroke}" stroke-width=".85" stroke-linejoin="round"/>`;
    if (tipDots) {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        const tx = (cx + Math.cos(a) * R).toFixed(2);
        const ty = (cy + Math.sin(a) * R).toFixed(2);
        g += `<circle cx="${tx}" cy="${ty}" r=".75" fill="#fde68a" stroke="${stroke}" stroke-width=".35"/>`;
      }
    }
    g += `<circle cx="${cx}" cy="${cy}" r="${(r * 0.48).toFixed(2)}" fill="${stroke}" stroke="#fde68a" stroke-width=".45"/>`;
    return g;
  }

  function aiSpark(cx, cy, R = 5, r = 1.65, fill = '#38bdf8', core = '#e0f2fe', stroke = '#0a101d') {
    let g = `<path d="${star4Path(cx, cy, R, r)}" fill="${fill}"`;
    if (stroke) g += ` stroke="${stroke}" stroke-width=".8" stroke-linejoin="round"`;
    g += `/>`;
    if (core) {
      g += `<path d="${star4Path(cx, cy, R * 0.56, r * 0.52)}" fill="${core}"/>`;
    }
    return g;
  }

  function promptGlyph(cx, cy, sc = 1, chevronCol = '#7dd3fc', cursorCol = '#f59e0b') {
    const sw = (1.85 / Math.max(0.75, sc * 0.9)).toFixed(2);
    return `<g transform="translate(${cx} ${cy}) scale(${sc})" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M-6.2 -3.6 L-1.6 0 L-6.2 3.6" stroke="${chevronCol}" stroke-width="${sw}"/>` +
      `<line x1="0.8" y1="3.6" x2="6.6" y2="3.6" stroke="${cursorCol}" stroke-width="${sw}"/>` +
      `</g>`;
  }

  function promptVisor(cx, cy, w, h, bg = '#091322', rim = '#f59e0b', trim = '#38bdf8') {
    const hw = w / 2, hh = h / 2, ch = Math.min(3.4, hh * 0.56);
    const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
    const pts = `${(x0 + ch).toFixed(1)},${y0.toFixed(1)} ${(x1 - ch).toFixed(1)},${y0.toFixed(1)} ` +
      `${x1.toFixed(1)},${(y0 + ch).toFixed(1)} ${x1.toFixed(1)},${(y1 - ch).toFixed(1)} ` +
      `${(x1 - ch).toFixed(1)},${y1.toFixed(1)} ${(x0 + ch).toFixed(1)},${y1.toFixed(1)} ` +
      `${x0.toFixed(1)},${(y1 - ch).toFixed(1)} ${x0.toFixed(1)},${(y0 + ch).toFixed(1)}`;
    const ix0 = (x0 + 2.1).toFixed(1), ix1 = (x1 - 2.1).toFixed(1);
    const iy0 = (y0 + 1.8).toFixed(1), iy1 = (y1 - 1.8).toFixed(1);
    return `<polygon points="${pts}" fill="${bg}" fill-opacity=".95" stroke="${rim}" stroke-width="1.35" stroke-linejoin="round"/>` +
      `<line x1="${ix0}" y1="${iy0}" x2="${ix1}" y2="${iy0}" stroke="${trim}" stroke-width=".7" stroke-opacity=".6"/>` +
      `<line x1="${ix0}" y1="${iy1}" x2="${ix1}" y2="${iy1}" stroke="${trim}" stroke-width=".6" stroke-opacity=".42"/>` +
      promptGlyph(cx - 5.5, cy, 0.96, '#e0f2fe', rim) +
      aiSpark(cx + 9.5, cy, 3.7, 1.2, trim, '#e0f2fe', '');
  }

  function tannerRankBadge(rank, ink, pillBg, ac) {
    if (rank === 13) {
      return `<path d="M24 33.5 L24.5 25 L27.8 29 L30.8 24 L33.8 29 L37.1 25 L37.6 33.5 Z" fill="#ffd35c" stroke="#0a101d" stroke-width="1" stroke-linejoin="round"/>` +
        `<circle cx="30.8" cy="30.4" r="1.4" fill="${ink}"/>`;
    }
    if (rank === 12) {
      return `<path d="M24.2 32.8 Q30.8 26 37.4 32.8 L35.6 33.5 Q30.8 29.2 26 33.5 Z" fill="#ffd35c" stroke="#0a101d" stroke-width=".95" stroke-linejoin="round"/>` +
        `<path d="M30.8 24 L32.2 27.6 L29.4 27.6 Z" fill="#ffd35c" stroke="#0a101d" stroke-width=".75" stroke-linejoin="round"/>` +
        `<circle cx="26.4" cy="28.3" r="1.05" fill="#ffd35c" stroke="#0a101d" stroke-width=".7"/>` +
        `<circle cx="35.2" cy="28.3" r="1.05" fill="#ffd35c" stroke="#0a101d" stroke-width=".7"/>` +
        `<circle cx="30.8" cy="29.4" r="1.3" fill="${ink}"/>`;
    }
    return `<path d="M26 25 H35.6 V30 Q35.6 33.5 30.8 35.4 Q26 33.5 26 30 Z" fill="${ac}" stroke="#0a101d" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M30.8 26.8 L33.3 29.8 L30.8 32.8 L28.3 29.8 Z" fill="${pillBg}"/>`;
  }

  // ---------- 1. Tanner Card Front ----------

  Art.registerFront('tanner', {
    name: 'Tanner',
    subtitle: 'AI-BOUND TSUNDERE',
    dark: true,
    bg: 'linear-gradient(180deg, #0d1626 0%, #152540 55%, #0a101d 100%)',
    border: 'rgba(96, 165, 250, .56)',
    font: "'Chakra Petch', 'Orbitron', sans-serif",
    weight: '700',
    suitPrefix: 'suit',
    previewSuit: 3,
    ink: ['#ff5a67', '#f59e0b', '#60a5fa', '#7dd3fc'],
    tint: ['#2b131d', '#2b1d0f', '#0f203a', '#0c2336'],
    accent: '#f59e0b',
    portraits: [
      'images/tanner/default/corner_smug.webp',
      'images/tanner/default/corner_special.webp',
      'images/tanner/default/corner_hype.webp',
    ],

    frame(F, ink, isPip) {
      const ac = F.accent;
      let g =
        // Top & bottom copper denim double-stitch rails clear of corner indices (x=30..70)
        `<path d="M30 3.7 H70 M30 136.3 H70" fill="none" stroke="${ac}" stroke-width=".95" stroke-dasharray="3.2 1.8" stroke-opacity=".72" stroke-linecap="round"/>` +
        `<path d="M30 6.1 H43.5 L45.8 4.4 H54.2 L56.5 6.1 H70 M30 133.9 H43.5 L45.8 135.6 H54.2 L56.5 133.9 H70" fill="none" stroke="#38bdf8" stroke-width=".75" stroke-opacity=".48" stroke-linecap="round" stroke-linejoin="round"/>` +
        aiSpark(50, 4.9, 2.3, 0.75, '#7dd3fc', '', '') +
        aiSpark(50, 135.1, 2.3, 0.75, '#7dd3fc', '', '') +
        denimRivet(30, 4.9, 1.25, ac) + denimRivet(70, 4.9, 1.25, ac) +
        denimRivet(30, 135.1, 1.25, ac) + denimRivet(70, 135.1, 1.25, ac) +
        // Outer corner copper denim rivets (clear of rank & suit indices)
        denimRivet(4.4, 4.4, 1.35, ac) + denimRivet(95.6, 4.4, 1.35, ac) +
        denimRivet(4.4, 135.6, 1.35, ac) + denimRivet(95.6, 135.6, 1.35, ac) +
        // Side double-stitch denim rails
        `<path d="M4.2 49 V91 M95.8 49 V91" fill="none" stroke="${ac}" stroke-width=".9" stroke-dasharray="3 2" stroke-opacity=".62" stroke-linecap="round"/>` +
        `<path d="M6.4 51 V62 L7.8 64.5 V75.5 L6.4 78 V89 M93.6 51 V62 L92.2 64.5 V75.5 L93.6 78 V89" fill="none" stroke="${ink}" stroke-width=".75" stroke-opacity=".38" stroke-linecap="round"/>` +
        denimRivet(4.2, 49, 1.1, ac) + denimRivet(4.2, 91, 1.1, ac) +
        denimRivet(95.8, 49, 1.1, ac) + denimRivet(95.8, 91, 1.1, ac) +
        `<polygon points="4.2,68 6.0,70 4.2,72 2.4,70" fill="#38bdf8" opacity=".7"/>` +
        `<polygon points="95.8,68 97.6,70 95.8,72 94.0,70" fill="#38bdf8" opacity=".7"/>`;

      if (isPip) {
        g += `<g opacity=".14">` +
          `<polygon points="35,49 65,49 71,55 71,85 65,91 35,91 29,85 29,55" fill="none" stroke="${ac}" stroke-width="1.15" stroke-dasharray="3.2 2"/>` +
          `<path d="${starPath(50, 61.5, 9.8, 4.1)}" fill="none" stroke="${ink}" stroke-width="1.25"/>` +
          `<path d="${starPath(50, 61.5, 4.5, 1.9)}" fill="${ac}"/>` +
          `<path d="M38 73.5 H34.5 V84.5 H38 M62 73.5 H65.5 V84.5 H62" fill="none" stroke="#7dd3fc" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>` +
          promptGlyph(50, 79, 0.92, '#7dd3fc', ac) +
          `</g>`;
      }
      return g;
    },

    ace(c, F, ink) {
      const s = c.suit, ac = F.accent;
      return (
        // Beveled tactical denim-frame shield
        `<polygon points="32,32 68,32 80,44 80,85 50,107 20,85 20,44" fill="${F.tint[s]}" stroke="${ink}" stroke-width="1.3" stroke-opacity=".68" stroke-linejoin="round"/>` +
        // Copper topstitch inner border
        `<polygon points="33.5,35.5 66.5,35.5 76.5,45.5 76.5,83 50,102.5 23.5,83 23.5,45.5" fill="none" stroke="${ac}" stroke-width="1" stroke-dasharray="3.4 2" stroke-opacity=".82" stroke-linejoin="round"/>` +
        // Tactical corner bracket ticks
        `<path d="M38 32 L41 35.5 H59 L62 32" fill="none" stroke="#38bdf8" stroke-width=".9" stroke-opacity=".65"/>` +
        // Denim corner rivets
        denimRivet(33.5, 35.5, 1.5, ac) + denimRivet(66.5, 35.5, 1.5, ac) +
        denimRivet(23.5, 83, 1.5, ac) + denimRivet(76.5, 83, 1.5, ac) +
        // Large center suit
        use(s, 22, 39, 56, ink, 'suit') +
        // Crisp >_ AI prompt visor/pill across center suit
        promptVisor(50, 64, 37, 13, '#091322', ac, '#38bdf8') +
        // 4-point AI spark & small Western star accents
        aiSpark(70, 42.5, 4.4, 1.4, '#38bdf8', '#e0f2fe', '#091322') +
        aiSpark(28, 43, 2.7, 0.85, '#7dd3fc', '', '#091322') +
        spurStar(50, 98, 4.9, 2.05, ac, '#091322', true)
      );
    },

    court(c, F, ink) {
      const s = c.suit, r = c.rank, ac = F.accent, pfx = F.suitPrefix || 'suit';
      const cid = c.id !== undefined ? c.id : `${s}_${r}`;
      const id = `fc_tanner_${cid}`;
      const idx = Math.max(0, Math.min(2, r - 11));
      const src = (F.portraits && (F.portraits[idx] || F.portraits[0])) || '';
      const pillBg = '#0a101d';

      let g = `<defs><clipPath id="${id}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>`;
      g += `<rect x="21" y="22" width="58" height="96" rx="8" fill="${F.tint[s]}" stroke="${ink}" stroke-opacity=".65" stroke-width="1.3"/>`;
      g += `<g clip-path="url(#${id})">`;
      // Terminal & denim-stitch backdrop behind Tanner's portrait
      g += `<polygon points="50,25 76,40 76,94 24,94 24,40" fill="${ink}" fill-opacity=".14" stroke="#38bdf8" stroke-width=".8" stroke-opacity=".35"/>`;
      g += `<rect x="23.2" y="24.2" width="53.6" height="77.5" rx="6" fill="none" stroke="${ac}" stroke-width=".75" stroke-dasharray="3.2 2.2" stroke-opacity=".42"/>`;
      g += `<circle cx="50" cy="56" r="22" fill="none" stroke="${ac}" stroke-width=".85" stroke-dasharray="4 3" opacity=".34"/>`;
      g += `<path d="M24 43 H31 M69 43 H76 M24 72 H30 M70 72 H76" stroke="#38bdf8" stroke-width=".75" stroke-opacity=".32"/>`;
      g += aiSpark(69.5, 30.5, 3.2, 1.05, '#38bdf8', '#e0f2fe', '');
      g += spurStar(69.5, 39.5, 2.5, 1.05, ac, '#0a101d', false);
      // Waist-up character portrait
      if (src) g += `<image href="${src}" x="13" y="24.5" width="74" height="94" preserveAspectRatio="xMidYMin meet"/>`;
      // J / Q / K rank badge
      g += tannerRankBadge(r, ink, pillBg, ac);
      // Copper-trimmed bottom sash with rivets and suit pill
      g += `<rect x="21" y="103" width="58" height="15" fill="${ink}" fill-opacity=".88"/>`;
      g += `<line x1="21" y1="103.3" x2="79" y2="103.3" stroke="#0a101d" stroke-width="1.2"/>`;
      g += `<line x1="21" y1="104.3" x2="79" y2="104.3" stroke="${ac}" stroke-width=".95"/>`;
      g += `<path d="M23 115.8 H38.5 M61.5 115.8 H77" stroke="#fde68a" stroke-width=".6" stroke-dasharray="2.4 1.8" stroke-opacity=".55"/>`;
      g += denimRivet(26.5, 110.6, 1.75, ac, '#0a101d', '#fde68a');
      g += denimRivet(73.5, 110.6, 1.75, ac, '#0a101d', '#fde68a');
      g += aiSpark(34.5, 110.6, 2.2, 0.72, '#e0f2fe', '', '');
      g += aiSpark(65.5, 110.6, 2.2, 0.72, '#e0f2fe', '', '');
      g += `<rect x="40.5" y="104.8" width="19" height="11.8" rx="4" fill="${pillBg}" fill-opacity=".97" stroke="${ac}" stroke-width=".85"/>`;
      g += use(s, 45, 105.7, 10, ink, pfx);
      g += '</g>';
      return g;
    },
  });

  // ---------- 2. Tanner Card Back ----------

  Art.registerBack('tanner', {
    name: 'Tanner Prompt',
    edge: '#1e3354',
    bg: '#0e192b',
    bg2: '#1b3154',
    frame: '#f59e0b',
    dash: '5 2.5',
    patternW: 20,
    patternH: 20,
    tile: `<path d="M-1 11 L11 -1 M-1 21 L21 -1 M9 21 L21 9" fill="none" stroke="#60a5fa" stroke-width=".65" opacity=".18"/>` +
      `<path d="M-1 6 L6 -1 M-1 16 L16 -1 M4 21 L21 4 M14 21 L21 14" fill="none" stroke="#38bdf8" stroke-width=".4" stroke-dasharray="2 2" opacity=".14"/>` +
      `<path d="M8.3 8.3 L11.7 11.7 M11.7 8.3 L8.3 11.7" fill="none" stroke="#f59e0b" stroke-width=".65" stroke-linecap="round" opacity=".28"/>` +
      `<path d="${star4Path(15.5, 4.5, 1.35, 0.45)}" fill="#38bdf8" opacity=".32"/>` +
      `<circle cx="4.5" cy="15.5" r=".7" fill="#f59e0b" opacity=".32"/>`,
    inner:
      // Corner leather-rivet brackets
      `<path d="M12 31 V16 Q12 12 16 12 H31 L27 17 H17 V27 Z" fill="#2b1b0e" fill-opacity=".75" stroke="#f59e0b" stroke-width=".95" stroke-linejoin="round"/>` +
      `<path d="M88 31 V16 Q88 12 84 12 H69 L73 17 H83 V27 Z" fill="#2b1b0e" fill-opacity=".75" stroke="#f59e0b" stroke-width=".95" stroke-linejoin="round"/>` +
      `<path d="M12 109 V124 Q12 128 16 128 H31 L27 123 H17 V113 Z" fill="#2b1b0e" fill-opacity=".75" stroke="#f59e0b" stroke-width=".95" stroke-linejoin="round"/>` +
      `<path d="M88 109 V124 Q88 128 84 128 H69 L73 123 H83 V113 Z" fill="#2b1b0e" fill-opacity=".75" stroke="#f59e0b" stroke-width=".95" stroke-linejoin="round"/>` +
      `<g fill="none" stroke="#38bdf8" stroke-width=".75" stroke-linecap="round" opacity=".52">` +
      `<path d="M19 32 V19 H32 M81 32 V19 H68 M19 108 V121 H32 M81 108 V121 H68"/>` +
      `</g>` +
      denimRivet(15.5, 15.5, 1.65, '#f59e0b') + denimRivet(84.5, 15.5, 1.65, '#f59e0b') +
      denimRivet(15.5, 124.5, 1.65, '#f59e0b') + denimRivet(84.5, 124.5, 1.65, '#f59e0b') +
      // Top & bottom tactical prompt rails
      `<path d="M34 17 H42.5 L45 14.5 H55 L57.5 17 H66" fill="none" stroke="#38bdf8" stroke-width="1" stroke-linejoin="round" opacity=".72"/>` +
      `<path d="M34 123 H42.5 L45 125.5 H55 L57.5 123 H66" fill="none" stroke="#38bdf8" stroke-width="1" stroke-linejoin="round" opacity=".72"/>` +
      `<path d="M37 20 H63 M37 120 H63" fill="none" stroke="#f59e0b" stroke-width=".75" stroke-dasharray="2.6 2" opacity=".58"/>` +
      aiSpark(50, 17, 2.3, 0.75, '#7dd3fc', '', '') +
      aiSpark(50, 123, 2.3, 0.75, '#7dd3fc', '', '') +
      // Side denim topstitch seams with midpoint rivets
      `<path d="M13 42 V98 M87 42 V98" fill="none" stroke="#60a5fa" stroke-width=".85" stroke-dasharray="3 3" opacity=".36"/>` +
      denimRivet(13, 70, 1.35, '#f59e0b') + denimRivet(87, 70, 1.35, '#f59e0b'),
    emblem:
      // Cobalt/navy medallion rimmed in saddle-copper & prompt-cyan
      `<circle cx="50" cy="70" r="20.5" fill="#0d1b33" stroke="#f59e0b" stroke-width="1.8"/>` +
      `<circle cx="50" cy="70" r="17.2" fill="#13294b" stroke="#38bdf8" stroke-width="1.15"/>` +
      `<circle cx="50" cy="70" r="14.5" fill="none" stroke="#f59e0b" stroke-width=".75" stroke-dasharray="2.5 2" opacity=".72"/>` +
      `<circle cx="50" cy="51.2" r="1" fill="#fde68a"/><circle cx="50" cy="88.8" r="1" fill="#fde68a"/>` +
      // Bold 4-point AI spark + terminal chevron >_ flanked by tiny copper Western stars
      aiSpark(50, 62.2, 6.2, 2.05, '#38bdf8', '#e0f2fe', '#091322') +
      promptGlyph(50, 76.2, 0.96, '#e0f2fe', '#f59e0b') +
      spurStar(38.6, 70.5, 2.65, 1.12, '#f59e0b', '#091322', false) +
      spurStar(61.4, 70.5, 2.65, 1.12, '#f59e0b', '#091322', false),
  });
})();
