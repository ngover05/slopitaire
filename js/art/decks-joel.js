/* Slopitaire — Joel card front and back (Cat-Hat Complexity: P = NP chalkboard + brown cat hat & pink hoodie). */
(() => {
  'use strict';

  const { use, star4Path } = Art.H;

  // ---------- shared Joel motif helpers ----------

  function catHat(cx, cy, sc = 1, body = '#a14812', brim = '#c25914', earIn = '#f9a8d4', stitch = '#fbbf24') {
    return `<g transform="translate(${cx} ${cy}) scale(${sc})">` +
      // Left & right cat ears with pastel-pink inner triangles
      `<path d="M-11.4 -1.0 L-10.3 -11.0 L-3.2 -4.6 Z" fill="${body}" stroke="#140c09" stroke-width="1.05" stroke-linejoin="round"/>` +
      `<path d="M-9.3 -2.4 L-8.7 -8.2 L-4.7 -4.4 Z" fill="${earIn}"/>` +
      `<path d="M11.4 -1.0 L10.3 -11.0 L3.2 -4.6 Z" fill="${body}" stroke="#140c09" stroke-width="1.05" stroke-linejoin="round"/>` +
      `<path d="M9.3 -2.4 L8.7 -8.2 L4.7 -4.4 Z" fill="${earIn}"/>` +
      // Rounded warm-brown beanie crown
      `<path d="M-12.2 2.4 C-12.2 -5.8 -6.6 -7.2 0 -7.2 C6.6 -7.2 12.2 -5.8 12.2 2.4 Z" fill="${body}" stroke="#140c09" stroke-width="1.05" stroke-linejoin="round"/>` +
      // Soft crown knit highlight
      `<path d="M-7.2 -2.6 Q0 -5.5 7.2 -2.6" fill="none" stroke="#f59e0b" stroke-width=".95" stroke-linecap="round" opacity=".72"/>` +
      // Cuffed brim with golden chalk stitching
      `<rect x="-13.2" y=".9" width="26.4" height="4.5" rx="2.25" fill="${brim}" stroke="#140c09" stroke-width="1"/>` +
      `<line x1="-10.2" y1="3.15" x2="10.2" y2="3.15" stroke="${stitch}" stroke-width=".9" stroke-dasharray="2.3 1.7" stroke-linecap="round"/>` +
      `</g>`;
  }

  function joelGlasses(cx, cy, sc = 1, rim = '#fbbf24', lens = '#1c1310', glare = '#fbcfe8') {
    return `<g transform="translate(${cx} ${cy}) scale(${sc})">` +
      // Temple end-pieces
      `<line x1="-12.8" y1="-.8" x2="-11.1" y2="-.8" stroke="${rim}" stroke-width="1.35" stroke-linecap="round"/>` +
      `<line x1="11.1" y1="-.8" x2="12.8" y2="-.8" stroke="${rim}" stroke-width="1.35" stroke-linecap="round"/>` +
      // Arched nose bridge
      `<path d="M-1.9 -.6 Q0 -2.4 1.9 -.6" fill="none" stroke="${rim}" stroke-width="1.3" stroke-linecap="round"/>` +
      // Left & right rounded-rectangular frames
      `<rect x="-11.3" y="-3.3" width="9.4" height="6.6" rx="2.2" fill="${lens}" fill-opacity=".92" stroke="${rim}" stroke-width="1.35"/>` +
      `<rect x="1.9" y="-3.3" width="9.4" height="6.6" rx="2.2" fill="${lens}" fill-opacity=".92" stroke="${rim}" stroke-width="1.35"/>` +
      // Crisp pastel-pink lens glare streaks
      `<path d="M-9.3 1.5 L-6.2 -1.7 M-6.8 1.5 L-4.9 -.4" stroke="${glare}" stroke-width=".95" stroke-linecap="round" opacity=".82"/>` +
      `<path d="M3.9 1.5 L7.0 -1.7 M6.4 1.5 L8.3 -.4" stroke="${glare}" stroke-width=".95" stroke-linecap="round" opacity=".82"/>` +
      `</g>`;
  }

  // Pure-vector "P = NP" glyph (font-independent so it renders identically on fronts & data-URI backs).
  function pEqNpGlyph(cx, cy, sc = 1, pCol = '#fbcfe8', eqCol = '#fbbf24', npCol = '#f472b6') {
    const sw = (1.65 / Math.max(0.75, sc * 0.92)).toFixed(2);
    return `<g transform="translate(${cx} ${cy}) scale(${sc})" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      // P
      `<path d="M-14.0 4 V-4 H-11.0 C-9.1 -4 -9.1 .2 -11.0 .2 H-14.0" stroke="${pCol}" stroke-width="${sw}"/>` +
      // =
      `<path d="M-6.0 -1.45 H-2.4 M-6.0 1.45 H-2.4" stroke="${eqCol}" stroke-width="${sw}"/>` +
      // N
      `<path d="M1.2 4 V-4 L6.0 4 V-4" stroke="${npCol}" stroke-width="${sw}"/>` +
      // P
      `<path d="M9.2 4 V-4 H12.2 C14.1 -4 14.1 .2 12.2 .2 H9.2" stroke="${npCol}" stroke-width="${sw}"/>` +
      `</g>`;
  }

  function pEqNpPlaque(cx, cy, w, h, bg = '#18100d', rim = '#fbbf24', pink = '#f472b6') {
    const hw = w / 2, hh = h / 2, ch = Math.min(3.2, hh * 0.52);
    const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
    const pts = `${(x0 + ch).toFixed(1)},${y0.toFixed(1)} ${(x1 - ch).toFixed(1)},${y0.toFixed(1)} ` +
      `${x1.toFixed(1)},${(y0 + ch).toFixed(1)} ${x1.toFixed(1)},${(y1 - ch).toFixed(1)} ` +
      `${(x1 - ch).toFixed(1)},${y1.toFixed(1)} ${(x0 + ch).toFixed(1)},${y1.toFixed(1)} ` +
      `${x0.toFixed(1)},${(y1 - ch).toFixed(1)} ${x0.toFixed(1)},${(y0 + ch).toFixed(1)}`;
    const ix0 = (x0 + 2.4).toFixed(1), ix1 = (x1 - 2.4).toFixed(1);
    const iy0 = (y0 + 1.6).toFixed(1), iy1 = (y1 - 1.6).toFixed(1);
    return `<polygon points="${pts}" fill="${bg}" fill-opacity=".96" stroke="${rim}" stroke-width="1.35" stroke-linejoin="round"/>` +
      `<line x1="${ix0}" y1="${iy0}" x2="${ix1}" y2="${iy0}" stroke="${pink}" stroke-width=".65" stroke-opacity=".55"/>` +
      `<line x1="${ix0}" y1="${iy1}" x2="${ix1}" y2="${iy1}" stroke="${pink}" stroke-width=".55" stroke-opacity=".4"/>` +
      pEqNpGlyph(cx, cy + 0.1, 0.94, '#fbcfe8', rim, pink);
  }

  function graphNode(cx, cy, r = 1.5, fill = '#f472b6', ring = '#fbbf24', core = '#18100d') {
    const cr = (r * 0.45).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${ring}" stroke-width=".65"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${cr}" fill="${core}"/>`;
  }

  function chalkStar(cx, cy, R = 4.2, r = 1.4, fill = '#fbbf24', core = '#fff7ed', stroke = '') {
    let g = `<path d="${star4Path(cx, cy, R, r)}" fill="${fill}"`;
    if (stroke) g += ` stroke="${stroke}" stroke-width=".75" stroke-linejoin="round"`;
    g += `/>`;
    if (core) g += `<path d="${star4Path(cx, cy, R * 0.52, r * 0.48)}" fill="${core}"/>`;
    return g;
  }

  function qedBox(cx, cy, s = 2.6, fill = '#fbbf24', stroke = '#18100d') {
    const h = s / 2;
    return `<rect x="${(cx - h).toFixed(2)}" y="${(cy - h).toFixed(2)}" width="${s}" height="${s}" rx=".45" fill="${fill}" stroke="${stroke}" stroke-width=".65"/>`;
  }

  // Miniature cat-ear crest for top/bottom card perimeter rails.
  function railCatEars(cx, cy, flipY = false, rim = '#d97706', earIn = '#f472b6', gold = '#fbbf24') {
    const sy = flipY ? -1 : 1;
    return `<g transform="translate(${cx} ${cy}) scale(1 ${sy})">` +
      `<path d="M-5.8 1.5 L-4.8 -2.6 L-1.6 .3 H1.6 L4.8 -2.6 L5.8 1.5 Z" fill="${rim}" stroke="${gold}" stroke-width=".55" stroke-linejoin="round"/>` +
      `<path d="M-4.6 .8 L-4.2 -1.3 L-2.6 .4 Z M4.6 .8 L4.2 -1.3 L2.6 .4 Z" fill="${earIn}"/>` +
      `</g>`;
  }

  function joelRankBadge(rank, ink, pillBg, ac) {
    if (rank === 13) {
      // King: golden crown with subtle cat-ear outer peaks & suit gem
      return `<path d="M24 33.5 L24.6 24.8 L28 28.8 L30.8 24 L33.6 28.8 L37 24.8 L37.6 33.5 Z" fill="${ac}" stroke="#18100d" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M25.6 31.3 L25.8 27.6 L27.6 29.8 Z M36 31.3 L35.8 27.6 L34 29.8 Z" fill="#f472b6" opacity=".88"/>` +
        `<circle cx="30.8" cy="30.4" r="1.4" fill="${ink}" stroke="#18100d" stroke-width=".45"/>`;
    }
    if (rank === 12) {
      // Queen: golden chalk tiara with jewel crest
      return `<path d="M24.2 32.8 Q30.8 26 37.4 32.8 L35.6 33.5 Q30.8 29.2 26 33.5 Z" fill="${ac}" stroke="#18100d" stroke-width=".95" stroke-linejoin="round"/>` +
        `<path d="M30.8 23.8 L32.5 27.9 L29.1 27.9 Z" fill="${ac}" stroke="#18100d" stroke-width=".75" stroke-linejoin="round"/>` +
        `<circle cx="26.4" cy="28.3" r="1.15" fill="${ac}" stroke="#18100d" stroke-width=".65"/>` +
        `<circle cx="35.2" cy="28.3" r="1.15" fill="${ac}" stroke="#18100d" stroke-width=".65"/>` +
        `<circle cx="30.8" cy="29.5" r="1.35" fill="${ink}" stroke="#18100d" stroke-width=".45"/>`;
    }
    // Jack: Q.E.D. diamond theorem crest
    return `<polygon points="30.8,24.2 36.2,29.6 30.8,35 25.4,29.6" fill="#f472b6" stroke="#18100d" stroke-width="1" stroke-linejoin="round"/>` +
      `<polygon points="30.8,26.5 33.6,29.6 30.8,32.7 28,29.6" fill="${pillBg}" stroke="${ac}" stroke-width=".65"/>` +
      `<rect x="29.8" y="28.6" width="2" height="2" rx=".3" fill="${ac}"/>`;
  }

  // ---------- 1. Joel Card Front ----------

  Art.registerFront('joel', {
    name: 'Joel',
    subtitle: 'CAT-HAT COMPLEXITY',
    dark: true,
    bg: 'linear-gradient(180deg, #1d1411 0%, #2a1d18 55%, #160e0b 100%)',
    border: 'rgba(244, 114, 182, .56)',
    font: "'Chakra Petch', 'Nunito', sans-serif",
    weight: '700',
    suitPrefix: 'suit',
    previewSuit: 0,
    // Hearts & Diamonds: hoodie pink & warm chalk-coral (red). Clubs & Spades: chalkboard mint & crisp white chalk (black).
    ink: ['#f472b6', '#ff766b', '#8adbc8', '#e8f4f0'],
    tint: ['#361924', '#361e16', '#142925', '#17242c'],
    accent: '#fbbf24',
    portraits: [
      'images/joel/default/corner_thinking.webp',
      'images/joel/default/corner_smug.webp',
      'images/joel/default/corner_hype.webp',
    ],

    frame(F, ink, isPip) {
      const ac = F.accent;
      let g =
        // Top & bottom chalkboard margin rails with notebook ticks (strictly clear of corner indices, x=30..70)
        `<path d="M30 4.9 H43.2 M56.8 4.9 H70 M30 135.1 H43.2 M56.8 135.1 H70" fill="none" stroke="#d97706" stroke-width=".95" stroke-opacity=".75" stroke-linecap="round"/>` +
        `<path d="M34 3.4 V6.4 M38.5 3.9 V5.9 M61.5 3.9 V5.9 M66 3.4 V6.4 M34 133.6 V136.6 M38.5 134.1 V136.1 M61.5 134.1 V136.1 M66 133.6 V136.6" fill="none" stroke="#f9a8d4" stroke-width=".75" stroke-opacity=".55" stroke-linecap="round"/>` +
        railCatEars(50, 4.9, false, '#b45309', '#f472b6', ac) +
        railCatEars(50, 135.1, true, '#b45309', '#f472b6', ac) +
        graphNode(30, 4.9, 1.3, '#f472b6', ac) + graphNode(70, 4.9, 1.3, '#f472b6', ac) +
        graphNode(30, 135.1, 1.3, '#f472b6', ac) + graphNode(70, 135.1, 1.3, '#f472b6', ac) +
        // Side complexity-graph edges & vertex nodes (y=49..91, clear of corner indices)
        `<path d="M4.4 49 V91 M95.6 49 V91" fill="none" stroke="${ac}" stroke-width=".85" stroke-dasharray="3 2.4" stroke-opacity=".55" stroke-linecap="round"/>` +
        `<path d="M6.7 54 V65 L8.1 70 L6.7 75 V86 M93.3 54 V65 L91.9 70 L93.3 75 V86" fill="none" stroke="${ink}" stroke-width=".7" stroke-opacity=".34" stroke-linecap="round" stroke-linejoin="round"/>` +
        graphNode(4.4, 49, 1.15, ac, '#d97706') + graphNode(4.4, 91, 1.15, ac, '#d97706') +
        graphNode(95.6, 49, 1.15, ac, '#d97706') + graphNode(95.6, 91, 1.15, ac, '#d97706') +
        graphNode(4.4, 70, 1.45, '#f472b6', ac) + graphNode(95.6, 70, 1.45, '#f472b6', ac);

      if (isPip) {
        // Subtle notebook graph-grid + K4 complexity-reduction diamond watermark behind pip grid
        g += `<g opacity=".13">` +
          `<path d="M33 52 H67 M33 61 H67 M33 70 H67 M33 79 H67 M33 88 H67 M38 49 V91 M50 49 V91 M62 49 V91" fill="none" stroke="#d97706" stroke-width=".55"/>` +
          `<polygon points="50,49 69,70 50,91 31,70" fill="none" stroke="${ac}" stroke-width="1.2"/>` +
          `<path d="M50 49 V91 M31 70 H69" stroke="${ink}" stroke-width=".85" stroke-dasharray="2.5 2"/>` +
          `<circle cx="50" cy="49" r="2.1" fill="#f472b6"/><circle cx="69" cy="70" r="2.1" fill="${ac}"/>` +
          `<circle cx="50" cy="91" r="2.1" fill="#f472b6"/><circle cx="31" cy="70" r="2.1" fill="${ac}"/>` +
          pEqNpGlyph(50, 70, 0.72, '#fbcfe8', ac, '#f472b6') +
          `</g>`;
      }
      return g;
    },

    ace(c, F, ink) {
      const s = c.suit, ac = F.accent;
      return (
        // Chamfered chalkboard-slate theorem plaque (strictly clear of top-left & bottom-right corner suits)
        `<polygon points="30,34 70,34 79,43 79,95 70,104 30,104 21,95 21,43" fill="${F.tint[s]}" stroke="#d97706" stroke-width="1.35" stroke-opacity=".82" stroke-linejoin="round"/>` +
        // Dashed golden-chalk inner notebook border
        `<polygon points="31.8,37.2 68.2,37.2 75.8,44.8 75.8,93.2 68.2,100.8 31.8,100.8 24.2,93.2 24.2,44.8" fill="none" stroke="${ac}" stroke-width=".85" stroke-dasharray="3.2 2.2" stroke-opacity=".68" stroke-linejoin="round"/>` +
        // Faint chalkboard graph-paper ticks inside slate
        `<path d="M27 56 H73 M27 78 H73 M38 39 V98 M62 39 V98" fill="none" stroke="#f9a8d4" stroke-width=".45" stroke-opacity=".18"/>` +
        // Corner complexity-graph nodes on chamfer joints
        graphNode(30, 34, 1.55, '#f472b6', ac) + graphNode(70, 34, 1.55, '#f472b6', ac) +
        graphNode(21, 95, 1.45, ac, '#b45309') + graphNode(79, 95, 1.45, ac, '#b45309') +
        // Large center suit
        use(s, 22, 41, 56, ink, 'suit') +
        // Iconic brown cat-ear hat perched on the top rim of the theorem slate
        catHat(50, 33.0, 0.96, '#a14812', '#c25914', '#f9a8d4', ac) +
        // Crisp beveled P = NP chalk plaque across the center suit
        pEqNpPlaque(50, 68, 41, 13.6, '#18100d', ac, '#f472b6') +
        // Polynomial-time sparkle stars & Halmos Q.E.D. proof tombstone at bottom center
        chalkStar(71.5, 44.5, 4.1, 1.35, ac, '#fff7ed', '#18100d') +
        chalkStar(28.5, 44.5, 2.9, 0.95, '#f9a8d4', '#fff7ed', '#18100d') +
        chalkStar(28.5, 92, 2.7, 0.9, ac, '', '#18100d') +
        chalkStar(71.5, 92, 2.7, 0.9, '#f472b6', '', '#18100d') +
        qedBox(50, 100.8, 3.8, ac, '#18100d')
      );
    },

    court(c, F, ink) {
      const s = c.suit, r = c.rank, ac = F.accent, pfx = F.suitPrefix || 'suit';
      const cid = c.id !== undefined ? c.id : `${s}_${r}`;
      const id = `fc_joel_${cid}`;
      const idx = Math.max(0, Math.min(2, r - 11));
      const src = (F.portraits && (F.portraits[idx] || F.portraits[0])) || '';
      const pillBg = '#18100d';

      let g = `<defs><clipPath id="${id}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>`;
      g += `<rect x="21" y="22" width="58" height="96" rx="8" fill="${F.tint[s]}" stroke="${ink}" stroke-opacity=".68" stroke-width="1.3"/>`;
      g += `<g clip-path="url(#${id})">`;
      // Complexity chalkboard grid & polynomial constellation behind Joel's portrait
      g += `<path d="M21 38 H79 M21 56 H79 M21 74 H79 M21 92 H79 M35 22 V103 M50 22 V103 M65 22 V103" fill="none" stroke="#d97706" stroke-width=".5" stroke-opacity=".22"/>`;
      g += `<rect x="23.2" y="24.2" width="53.6" height="77.2" rx="6" fill="none" stroke="${ac}" stroke-width=".75" stroke-dasharray="3 2.2" stroke-opacity=".42"/>`;
      g += `<circle cx="50" cy="56" r="22.5" fill="none" stroke="#f472b6" stroke-width=".85" stroke-dasharray="4 3" opacity=".36"/>`;
      g += `<path d="M26 42 L35 33 L67 31 L74 44" fill="none" stroke="${ac}" stroke-width=".75" stroke-opacity=".38"/>`;
      g += graphNode(74, 44, 1.3, '#f472b6', ac);
      g += chalkStar(69.5, 30.5, 3.4, 1.1, ac, '#fff7ed', '');
      g += qedBox(69.5, 39.2, 2.5, '#f9a8d4', pillBg);
      // Waist-up character portrait
      if (src) g += `<image href="${src}" x="13" y="24.5" width="74" height="94" preserveAspectRatio="xMidYMin meet"/>`;
      // Top-left J / Q / K rank badge
      g += joelRankBadge(r, ink, pillBg, ac);
      // Bottom suit crest sash with chalk stitches, graph nodes, and framed suit pill
      g += `<rect x="21" y="103" width="58" height="15" fill="${ink}" fill-opacity=".9"/>`;
      g += `<line x1="21" y1="103.3" x2="79" y2="103.3" stroke="${pillBg}" stroke-width="1.2"/>`;
      g += `<line x1="21" y1="104.3" x2="79" y2="104.3" stroke="${ac}" stroke-width=".95"/>`;
      g += `<path d="M24 110.6 H37.5 M62.5 110.6 H76" stroke="${pillBg}" stroke-width="1.2" stroke-opacity=".55" stroke-dasharray="2.4 1.8"/>`;
      g += graphNode(26.5, 110.6, 1.75, ac, pillBg, '#f472b6');
      g += graphNode(73.5, 110.6, 1.75, ac, pillBg, '#f472b6');
      g += chalkStar(34.5, 110.6, 2.2, 0.72, '#fff7ed', '', '');
      g += chalkStar(65.5, 110.6, 2.2, 0.72, '#fff7ed', '', '');
      g += `<rect x="40.5" y="104.8" width="19" height="11.8" rx="4" fill="${pillBg}" fill-opacity=".97" stroke="${ac}" stroke-width=".85"/>`;
      g += use(s, 45, 105.7, 10, ink, pfx);
      g += '</g>';
      return g;
    },
  });

  // ---------- 2. Joel Card Back ----------

  Art.registerBack('joel', {
    name: 'Joel P=NP',
    subtitle: 'CAT-HAT PROOF',
    edge: '#fce2f0',
    bg: '#231511',
    bg2: '#3a2018',
    frame: '#fbbf24',
    dash: '5 2.2',
    patternW: 20,
    patternH: 20,
    tile:
      // Seamless chalkboard complexity-grid + polynomial reduction diagonal edges
      `<path d="M0 10 H20 M10 0 V20" fill="none" stroke="#d97706" stroke-width=".45" opacity=".2"/>` +
      `<path d="M0 0 L20 20 M20 0 L0 20" fill="none" stroke="#f472b6" stroke-width=".4" stroke-dasharray="2 2.4" opacity=".16"/>` +
      `<circle cx="10" cy="10" r="1.35" fill="none" stroke="#fbbf24" stroke-width=".6" opacity=".32"/>` +
      `<circle cx="10" cy="10" r=".5" fill="#f9a8d4" opacity=".38"/>` +
      `<path d="${star4Path(4.5, 15.5, 1.45, 0.48)}" fill="#f9a8d4" opacity=".32"/>` +
      `<rect x="14.6" y="3.6" width="1.8" height="1.8" rx=".3" fill="#fbbf24" opacity=".26"/>`,
    inner:
      // Warm chestnut cat-ear corner proof brackets
      `<path d="M12 31 V16 Q12 12 16 12 H31 L27 17 H17 V27 Z" fill="#5c2d14" fill-opacity=".85" stroke="#fbbf24" stroke-width=".95" stroke-linejoin="round"/>` +
      `<path d="M88 31 V16 Q88 12 84 12 H69 L73 17 H83 V27 Z" fill="#5c2d14" fill-opacity=".85" stroke="#fbbf24" stroke-width=".95" stroke-linejoin="round"/>` +
      `<path d="M12 109 V124 Q12 128 16 128 H31 L27 123 H17 V113 Z" fill="#5c2d14" fill-opacity=".85" stroke="#fbbf24" stroke-width=".95" stroke-linejoin="round"/>` +
      `<path d="M88 109 V124 Q88 128 84 128 H69 L73 123 H83 V113 Z" fill="#5c2d14" fill-opacity=".85" stroke="#fbbf24" stroke-width=".95" stroke-linejoin="round"/>` +
      // Pink cat-ear corner inlays & inner chalk lines
      `<polygon points="14.5,14.5 19.6,14.5 14.5,19.6" fill="#f472b6" opacity=".88"/>` +
      `<polygon points="85.5,14.5 80.4,14.5 85.5,19.6" fill="#f472b6" opacity=".88"/>` +
      `<polygon points="14.5,125.5 19.6,125.5 14.5,120.4" fill="#f472b6" opacity=".88"/>` +
      `<polygon points="85.5,125.5 80.4,125.5 85.5,120.4" fill="#f472b6" opacity=".88"/>` +
      `<g fill="none" stroke="#f9a8d4" stroke-width=".7" stroke-linecap="round" opacity=".52">` +
      `<path d="M19 32 V19 H32 M81 32 V19 H68 M19 108 V121 H32 M81 108 V121 H68"/>` +
      `</g>` +
      // Top & bottom symmetrical polynomial-reduction node trees
      `<path d="M35 18 L43 14.5 L50 19 L57 14.5 L65 18 M43 14.5 H57" fill="none" stroke="#fbbf24" stroke-width=".85" stroke-linejoin="round" opacity=".72"/>` +
      `<path d="M35 122 L43 125.5 L50 121 L57 125.5 L65 122 M43 125.5 H57" fill="none" stroke="#fbbf24" stroke-width=".85" stroke-linejoin="round" opacity=".72"/>` +
      graphNode(35, 18, 1.25, '#f472b6', '#fbbf24') + graphNode(65, 18, 1.25, '#f472b6', '#fbbf24') +
      graphNode(43, 14.5, 1.15, '#fbbf24', '#1a100c') + graphNode(57, 14.5, 1.15, '#fbbf24', '#1a100c') +
      graphNode(35, 122, 1.25, '#f472b6', '#fbbf24') + graphNode(65, 122, 1.25, '#f472b6', '#fbbf24') +
      graphNode(43, 125.5, 1.15, '#fbbf24', '#1a100c') + graphNode(57, 125.5, 1.15, '#fbbf24', '#1a100c') +
      chalkStar(50, 24.5, 2.8, 0.9, '#f9a8d4', '#fff7ed', '') +
      chalkStar(50, 115.5, 2.8, 0.9, '#f9a8d4', '#fff7ed', '') +
      // Vertical margin stitch rails + central tether nodes
      `<path d="M13 40 V100 M87 40 V100" fill="none" stroke="#d97706" stroke-width=".85" stroke-dasharray="3 2.5" opacity=".52"/>` +
      `<path d="M15 70 H26 M74 70 H85 M50 31 V46 M50 94 V109" fill="none" stroke="#f472b6" stroke-width=".75" stroke-dasharray="2.4 2" opacity=".48"/>` +
      graphNode(13, 70, 1.5, '#f472b6', '#fbbf24') + graphNode(87, 70, 1.5, '#f472b6', '#fbbf24'),
    emblem:
      // Layered espresso, warm-gold, and hoodie-pink chalkboard medallion
      `<circle cx="50" cy="70" r="23.6" fill="#1a100c" stroke="#fbbf24" stroke-width="1.85"/>` +
      `<circle cx="50" cy="70" r="20.6" fill="#291812" stroke="#f472b6" stroke-width="1.2"/>` +
      `<circle cx="50" cy="70" r="18.6" fill="none" stroke="#fbbf24" stroke-width=".6" stroke-dasharray="2.4 2" opacity=".68"/>` +
      // Cardinal complexity-graph orbit vertices
      graphNode(50, 46.4, 1.45, '#f472b6', '#fbbf24') + graphNode(50, 93.6, 1.45, '#f472b6', '#fbbf24') +
      graphNode(26.4, 70, 1.45, '#fbbf24', '#1a100c') + graphNode(73.6, 70, 1.45, '#fbbf24', '#1a100c') +
      // Signature brown cat hat perched cleanly at top of medallion
      catHat(50, 60.8, 0.88, '#a14812', '#c25914', '#f9a8d4', '#fbbf24') +
      // Joel's cool glasses right beneath the hat brim
      joelGlasses(50, 70.7, 0.9, '#fbbf24', '#18100d', '#fbcfe8') +
      // Crisp vector P = NP theorem & polynomial-time flanking stars
      pEqNpGlyph(50, 80.5, 0.66, '#fbcfe8', '#fbbf24', '#f472b6') +
      chalkStar(35.0, 70.7, 2.35, 0.78, '#f9a8d4', '#fff7ed', '') +
      chalkStar(65.0, 70.7, 2.35, 0.78, '#f9a8d4', '#fff7ed', '') +
      qedBox(50, 86.2, 2.2, '#fbbf24', '#1a100c'),
  });
})();
