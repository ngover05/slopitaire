/* Slopitaire — Cyber & Mochi bespoke pure-vector card fronts and backs. */
(() => {
  'use strict';
  const { use, starPath, star4Path, paw, FACE_Y } = Art.H;

  // ---------- 1. CYBER FRONT ----------
  function cyberFrame(F, ink, isPip, suit) {
    const ac = F.accent;
    const node = suit === 2 ? '#ff2a85' : ac;
    // Perimeter telemetry rails kept strictly clear of corner rank/suit zones.
    const rail =
      `<path d="M29 5 H41 L43.5 2.8 H56.5 L59 5 H71 M29 135 H41 L43.5 137.2 H56.5 L59 135 H71" fill="none" stroke="${ac}" stroke-width="1" stroke-opacity=".5"/>` +
      `<path d="M33 3.2 V5 M37 3.2 V5 M63 3.2 V5 M67 3.2 V5 M33 135 V136.8 M37 135 V136.8 M63 135 V136.8 M67 135 V136.8" stroke="${ink}" stroke-width=".9" stroke-opacity=".48"/>` +
      `<polygon points="50,2.5 52.8,5 50,7.5 47.2,5" fill="${ac}" opacity=".85"/>` +
      `<polygon points="50,132.5 52.8,135 50,137.5 47.2,135" fill="${ac}" opacity=".85"/>` +
      `<circle cx="29" cy="5" r=".95" fill="${node}" opacity=".75"/><circle cx="71" cy="5" r=".95" fill="${node}" opacity=".75"/>` +
      `<circle cx="29" cy="135" r=".95" fill="${node}" opacity=".75"/><circle cx="71" cy="135" r=".95" fill="${node}" opacity=".75"/>` +
      `<path d="M4.5 48 V62.5 L6.5 65 V75 L4.5 77.5 V92 M95.5 48 V62.5 L93.5 65 V75 L95.5 77.5 V92" fill="none" stroke="${ink}" stroke-width="1" stroke-opacity=".42"/>` +
      `<path d="M7.5 52 V60 M7.5 80 V88 M92.5 52 V60 M92.5 80 V88" stroke="${ac}" stroke-width=".8" stroke-dasharray="2 2" stroke-opacity=".38"/>` +
      `<circle cx="4.5" cy="70" r="1.1" fill="${node}" opacity=".7"/><circle cx="95.5" cy="70" r="1.1" fill="${node}" opacity=".7"/>`;

    if (!isPip) return rail;

    // Subtle center hex & circuit node watermark behind pip grid.
    const wm =
      `<polygon points="50,50 67.3,60 67.3,80 50,90 32.7,80 32.7,60" fill="none" stroke="${ink}" stroke-width="1.2" stroke-opacity=".14"/>` +
      `<polygon points="50,57 61.3,63.5 61.3,76.5 50,83 38.7,76.5 38.7,63.5" fill="none" stroke="${ac}" stroke-width=".9" stroke-dasharray="4 3" stroke-opacity=".12"/>` +
      `<path d="M50 50 V43 M50 90 V97 M32.7 60 L26 56 M67.3 60 L74 56 M32.7 80 L26 84 M67.3 80 L74 84" stroke="${ac}" stroke-width=".9" stroke-opacity=".12"/>` +
      `<circle cx="50" cy="43" r="1.3" fill="${ink}" opacity=".15"/><circle cx="50" cy="97" r="1.3" fill="${ink}" opacity=".15"/>` +
      `<circle cx="26" cy="56" r="1.3" fill="${ink}" opacity=".15"/><circle cx="74" cy="56" r="1.3" fill="${ink}" opacity=".15"/>` +
      `<circle cx="26" cy="84" r="1.3" fill="${ink}" opacity=".15"/><circle cx="74" cy="84" r="1.3" fill="${ink}" opacity=".15"/>` +
      `<circle cx="50" cy="70" r="5" fill="none" stroke="${ink}" stroke-width="1" stroke-opacity=".14"/>` +
      `<circle cx="50" cy="70" r="2" fill="${node}" opacity=".17"/>`;

    return rail + wm;
  }

  function cyberAce(c, F, ink) {
    const s = c.suit, ac = F.accent;
    const node = s === 2 ? '#ff2a85' : ac;
    return (
      `<circle cx="50" cy="67" r="32" fill="${F.tint[s]}" fill-opacity=".72"/>` +
      `<circle cx="50" cy="67" r="34" fill="none" stroke="${ac}" stroke-width="1.3" stroke-dasharray="10 4 2 4" opacity=".68"/>` +
      `<circle cx="50" cy="67" r="27.5" fill="none" stroke="${ink}" stroke-width=".95" stroke-dasharray="5 5" opacity=".45"/>` +
      `<path d="M50 28.5 V35.5 M50 98.5 V105.5 M11.5 67 H18.5 M81.5 67 H88.5" stroke="${ac}" stroke-width="1.35" stroke-linecap="round" opacity=".75"/>` +
      `<path d="M24.5 41.5 L28 45 M75.5 41.5 L72 45 M24.5 92.5 L28 89 M75.5 92.5 L72 89" stroke="${ink}" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>` +
      `<path d="M19 47 V39 L23 35 H34 M81 47 V39 L77 35 H66 M19 87 V95 L23 99 H34 M81 87 V95 L77 99 H66" fill="none" stroke="${ac}" stroke-width="1.5" stroke-linejoin="round" opacity=".9"/>` +
      `<path d="M31 53 H23 L19 49 M69 53 H77 L81 49 M31 81 H23 L19 85 M69 81 H77 L81 85" fill="none" stroke="${ink}" stroke-width="1.05" opacity=".6"/>` +
      `<circle cx="19" cy="49" r="1.4" fill="${node}"/><circle cx="81" cy="49" r="1.4" fill="${node}"/>` +
      `<circle cx="19" cy="85" r="1.4" fill="${node}"/><circle cx="81" cy="85" r="1.4" fill="${node}"/>` +
      use(s, 22, 39, 56, ink, 'csuit') +
      `<path d="M43 68 V75 L46 78.5 M57 68 V75 L54 78.5 M50 68 V83" fill="none" stroke="#08121f" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="46" cy="79" r="1.1" fill="#e8ffff"/><circle cx="54" cy="79" r="1.1" fill="#e8ffff"/><circle cx="50" cy="83.5" r="1.2" fill="${node}"/>` +
      `<path d="M34 59.5 H66 L62 67.5 H38 Z" fill="#08121f" stroke="${ac}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<line x1="39.5" y1="63.5" x2="60.5" y2="63.5" stroke="${ac}" stroke-width="2.6" stroke-linecap="round" opacity=".45"/>` +
      `<line x1="40.5" y1="63.5" x2="59.5" y2="63.5" stroke="#eaffff" stroke-width="1.35" stroke-linecap="round"/>` +
      `<circle cx="43" cy="63.5" r="1.1" fill="#ff2a85"/>` +
      `<path d="${star4Path(76, 41, 4, 1.2)}" fill="${ac}"/><path d="${star4Path(24, 93, 3.6, 1.1)}" fill="${node}"/>`
    );
  }

  function cyberCourt(c, F, ink) {
    const s = c.suit, ac = F.accent, r = c.rank;
    const cid = c.id !== undefined ? c.id : `${s}_${r}`;
    const id = `fc_cyber_${cid}`;
    let g = `<defs><clipPath id="${id}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>`;
    g += `<rect x="21" y="22" width="58" height="96" rx="8" fill="${F.tint[s]}" stroke="${ink}" stroke-opacity=".7" stroke-width="1.3"/>`;
    g += `<g clip-path="url(#${id})">`;
    g += `<path d="M21 38 H79 M21 96 H79 M50 22 V118" stroke="${ac}" stroke-width=".55" stroke-opacity=".18"/>`;
    g += `<polygon points="50,27 72,40 72,66 50,79 28,66 28,40" fill="none" stroke="${ink}" stroke-width=".75" stroke-opacity=".18"/>`;
    g += `<path d="${star4Path(30, 31, 3, .9)}" fill="${ac}" opacity=".85"/><path d="${star4Path(70, 32, 2.5, .8)}" fill="${ink}" opacity=".85"/>`;

    if (r === 11) {
      // Cyber Striker (J): angled synth-hood, glowing mono-visor, tech collar & crossed blade hilts
      g += `<line x1="23.5" y1="67" x2="43" y2="91" stroke="#08121f" stroke-width="4" stroke-linecap="round"/>`;
      g += `<line x1="23.5" y1="67" x2="43" y2="91" stroke="${ac}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`;
      g += `<line x1="25.5" y1="76.5" x2="33" y2="69.5" stroke="#ffd35c" stroke-width="2.3" stroke-linecap="round"/>`;
      g += `<circle cx="23.5" cy="67" r="1.8" fill="${ink}" stroke="#ffd35c" stroke-width=".75"/>`;
      g += `<line x1="76.5" y1="67" x2="57" y2="91" stroke="#08121f" stroke-width="4" stroke-linecap="round"/>`;
      g += `<line x1="76.5" y1="67" x2="57" y2="91" stroke="${ac}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`;
      g += `<line x1="74.5" y1="76.5" x2="67" y2="69.5" stroke="#ffd35c" stroke-width="2.3" stroke-linecap="round"/>`;
      g += `<circle cx="76.5" cy="67" r="1.8" fill="${ink}" stroke="#ffd35c" stroke-width=".75"/>`;

      g += `<path d="M27 94 L30 51 L50 32 L70 51 L73 94 Z" fill="#0d1b2e" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round"/>`;
      g += `<rect x="45.5" y="83" width="9" height="10" fill="#182f4d"/>`;
      g += `<path d="M21 120 L27 93 L40 89 L50 96 L60 89 L73 93 L79 120 Z" fill="#102238" stroke="${ink}" stroke-width="1.3"/>`;
      g += `<path d="M36 96 L45 105 M64 96 L55 105" stroke="#ffd35c" stroke-width="1.1" opacity=".75"/>`;
      g += `<path d="M35 94 L39 81 L45 86 L50 92 L55 86 L61 81 L65 94 L59 99 L50 96 L41 99 Z" fill="#193454" stroke="${ac}" stroke-width="1.2" stroke-linejoin="round"/>`;
      g += `<path d="M39 85 L44 90 M61 85 L56 90" stroke="${ink}" stroke-width="1.1"/>`;

      g += `<polygon points="50,44 64,53 62,76 50,85 38,76 36,53" fill="#d4e9ff" stroke="#0b1829" stroke-width="1.3"/>`;
      g += `<polygon points="41,72 50,70 59,72 57,80 50,85 43,80" fill="#142942" stroke="${ink}" stroke-width=".9"/>`;
      g += `<line x1="46" y1="76.5" x2="54" y2="76.5" stroke="${ac}" stroke-width=".9"/>`;

      g += `<path d="M31 55 L50 35 L69 55 L63 49 L50 43 L37 49 Z" fill="#122742" stroke="${ac}" stroke-width="1.2" stroke-linejoin="round"/>`;
      g += `<path d="M44 43 L50 38 L56 43" fill="none" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>`;
      g += `<polygon points="35,57 65,60 62,67 37,64" fill="#07101c" stroke="${ac}" stroke-width="1.3" stroke-linejoin="round"/>`;
      g += `<line x1="39" y1="60.8" x2="61" y2="63.2" stroke="${ac}" stroke-width="2.5" stroke-linecap="round" opacity=".45"/>`;
      g += `<line x1="40" y1="60.9" x2="60" y2="63.1" stroke="#eaffff" stroke-width="1.25" stroke-linecap="round"/>`;
      g += `<circle cx="43" cy="61.2" r="1.2" fill="#ff2a85"/>`;
      g += `<polygon points="50,99 58,107 50,115 42,107" fill="#08121f" stroke="${ac}" stroke-width="1.1"/>`;
      g += use(s, 45.5, 102.5, 9, ink, 'csuit');
    } else if (r === 12) {
      // Holo Empress (Q): floating neural data-halo crown, twin cybernetic ear-fins, luminescent collar & suit core
      g += `<path d="M26 57 L21 119 H79 L74 57 Q50 40 26 57 Z" fill="#102138" stroke="${ac}" stroke-width="1.05" stroke-opacity=".7"/>`;
      g += `<path d="M29 45 A22 22 0 0 1 71 45" fill="none" stroke="${ac}" stroke-width="1.6" stroke-dasharray="7 3 2 3"/>`;
      g += `<path d="M34 44 Q50 31 66 44" fill="none" stroke="#ffd35c" stroke-width="1.9" stroke-linecap="round"/>`;
      g += `<polygon points="50,24 56,31 50,38 44,31" fill="#08121f" stroke="#ffd35c" stroke-width="1.1"/>`;
      g += use(s, 46.5, 27.5, 7, ink, 'csuit');
      g += `<circle cx="32" cy="39" r="1.3" fill="${ac}"/><circle cx="40" cy="33" r="1.2" fill="#ffd35c"/><circle cx="60" cy="33" r="1.2" fill="#ffd35c"/><circle cx="68" cy="39" r="1.3" fill="${ac}"/>`;

      g += `<polygon points="35,54 25,45 27,63 35,66" fill="#132a47" stroke="${ac}" stroke-width="1.2" stroke-linejoin="round"/>`;
      g += `<polygon points="33,56 27.5,49.5 29,60.5" fill="${ink}" opacity=".85"/>`;
      g += `<polygon points="65,54 75,45 73,63 65,66" fill="#132a47" stroke="${ac}" stroke-width="1.2" stroke-linejoin="round"/>`;
      g += `<polygon points="67,56 72.5,49.5 71,60.5" fill="${ink}" opacity=".85"/>`;
      g += `<circle cx="35" cy="61" r="2.1" fill="#08121f" stroke="#ffd35c" stroke-width="1"/><circle cx="65" cy="61" r="2.1" fill="#08121f" stroke="#ffd35c" stroke-width="1"/>`;

      g += `<rect x="46" y="83" width="8" height="10" fill="#182f4d"/>`;
      g += `<path d="M21 120 L25 94 L39 89 L50 96 L61 89 L75 94 L79 120 Z" fill="#132742" stroke="${ink}" stroke-width="1.3"/>`;
      g += `<path d="M32 93 L41 88 L50 95 L59 88 L68 93 L62 101 L50 98 L38 101 Z" fill="#091728" stroke="${ac}" stroke-width="1.3" stroke-linejoin="round"/>`;
      g += `<path d="M36 94 L42 91 L50 96.5 L58 91 L64 94" fill="none" stroke="#eaffff" stroke-width="1.1" stroke-linecap="round"/>`;
      g += `<path d="M27 107 H41 M59 107 H73" stroke="${ac}" stroke-width=".9" stroke-opacity=".55"/>`;
      g += `<polygon points="50,98 59,103 59,112 50,117 41,112 41,103" fill="#07101c" stroke="${ac}" stroke-width="1.3"/>`;
      g += `<polygon points="50,100.5 56.5,104.2 56.5,110.8 50,114.5 43.5,110.8 43.5,104.2" fill="${F.tint[s]}" stroke="${ink}" stroke-width=".9"/>`;
      g += use(s, 45, 102.5, 10, ink, 'csuit');

      g += `<polygon points="50,43 65,53 63,76 50,85 37,76 35,53" fill="#e2f0ff" stroke="#0d1e33" stroke-width="1.3"/>`;
      g += `<path d="M35 55 L43 45 L50 51 L57 45 L65 55 L61 48 L50 43 L39 48 Z" fill="#193354" stroke="${ink}" stroke-width="1.1"/>`;
      g += `<path d="M36 59 Q50 55 64 59 L62 67 Q50 64 38 67 Z" fill="#08121f" stroke="${ink}" stroke-width="1.2"/>`;
      g += `<ellipse cx="43" cy="62.5" rx="2.3" ry="1.6" fill="${ac}"/><ellipse cx="57" cy="62.5" rx="2.3" ry="1.6" fill="${ac}"/>`;
      g += `<circle cx="43.5" cy="62" r=".7" fill="#fff"/><circle cx="57.5" cy="62" r=".7" fill="#fff"/>`;
      g += `<path d="M47 75 Q50 77.5 53 75" stroke="${ink}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
    } else {
      // Mainframe Sovereign (K): 3-spire holographic data-crown, faceted armored pauldrons, T-visor faceplate & circuit scepter
      g += `<rect x="45.5" y="83" width="9" height="10" fill="#182f4d"/>`;
      g += `<path d="M23 120 L27 93 L42 89 L50 96 L58 89 L73 93 L77 120 Z" fill="#11253f" stroke="${ink}" stroke-width="1.3"/>`;
      g += `<polygon points="21,105 22,90 34,85 41,92 36,104" fill="#1b395e" stroke="${ac}" stroke-width="1.3" stroke-linejoin="round"/>`;
      g += `<path d="M22 94 L34 89 L38 96" fill="none" stroke="${ink}" stroke-width="1"/>`;
      g += `<polygon points="79,105 78,90 66,85 59,92 64,104" fill="#1b395e" stroke="${ac}" stroke-width="1.3" stroke-linejoin="round"/>`;
      g += `<path d="M78 94 L66 89 L62 96" fill="none" stroke="${ink}" stroke-width="1"/>`;
      g += `<polygon points="50,97 58,104 50,115 42,104" fill="#08121f" stroke="#ffd35c" stroke-width="1.1"/>`;
      g += use(s, 45.5, 101.5, 9, ink, 'csuit');

      g += `<polygon points="50,44 66,53 64,77 50,86 36,77 34,53" fill="#cde3fa" stroke="#0d1e33" stroke-width="1.4"/>`;
      g += `<path d="M34 53 L39 58 V76 L36 77 Z M66 53 L61 58 V76 L64 77 Z" fill="#17304f" stroke="${ink}" stroke-width=".9"/>`;
      g += `<path d="M35 58 H65 L61 66 H52.8 V78 L50 81 L47.2 78 V66 H39 Z" fill="#07101c" stroke="${ac}" stroke-width="1.3" stroke-linejoin="round"/>`;
      g += `<line x1="39" y1="62" x2="61" y2="62" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
      g += `<line x1="42" y1="62" x2="58" y2="62" stroke="#ffffff" stroke-width=".9" stroke-linecap="round"/>`;
      g += `<line x1="50" y1="62" x2="50" y2="77" stroke="${ac}" stroke-width="1.5" stroke-linecap="round"/>`;

      g += `<path d="M34 50 L33 31 L42 40 L50 25 L58 40 L67 31 L66 50 Z" fill="#091424" stroke="#ffd35c" stroke-width="1.4" stroke-linejoin="round"/>`;
      g += `<path d="M37 48 L36.5 36 L43 42.5 L50 29.5 L57 42.5 L63.5 36 L63 48" fill="none" stroke="${ac}" stroke-width="1" stroke-linejoin="round"/>`;
      g += `<circle cx="50" cy="42" r="2.2" fill="${ink}" stroke="#ffd35c" stroke-width=".8"/>`;
      g += `<circle cx="33" cy="30" r="1.4" fill="${ac}"/><circle cx="50" cy="24.5" r="1.6" fill="#ffd35c"/><circle cx="67" cy="30" r="1.4" fill="${ac}"/>`;

      g += `<line x1="72.5" y1="66" x2="72.5" y2="119" stroke="#ffd35c" stroke-width="2" stroke-linecap="round"/>`;
      g += `<line x1="72.5" y1="68" x2="72.5" y2="119" stroke="${ac}" stroke-width=".8" stroke-dasharray="4 3"/>`;
      g += `<polygon points="72.5,50 77.2,54.5 77.2,63 72.5,67.5 67.8,63 67.8,54.5" fill="#08121f" stroke="#ffd35c" stroke-width="1.2"/>`;
      g += `<path d="M68 54.5 L65 51.5 M77 54.5 L78.8 51.5" stroke="${ac}" stroke-width="1.05"/>`;
      g += use(s, 69.5, 55.8, 6, ink, 'csuit');
      g += `<circle cx="72.5" cy="74" r="1.5" fill="${ac}"/>`;
    }

    g += '</g>';
    return g;
  }

  Art.registerFront('cyber', {
    name: 'Cyber',
    subtitle: 'NEON GRID PROTOCOL',
    dark: true,
    bg: 'linear-gradient(180deg, #08121f 0%, #0d2137 55%, #070e1a 100%)',
    border: 'rgba(0, 240, 255, .55)',
    font: "'Orbitron', 'Chakra Petch', sans-serif",
    weight: '700',
    suitPrefix: 'csuit',
    previewSuit: 3,
    ink: ['#ff2a85', '#ff6b3d', '#00f0ff', '#78a9ff'],
    tint: ['#1f0c1d', '#211210', '#071d29', '#0c162b'],
    accent: '#00f0ff',
    frame: cyberFrame,
    ace: cyberAce,
    court: cyberCourt,
  });

  // ---------- 2. CYBER BACK ----------
  Art.registerBack('cyber', {
    name: 'Cyber Grid',
    edge: '#0ef0ff',
    bg: '#091422',
    bg2: '#120b24',
    frame: '#ff2a85',
    dash: '6 2',
    patternW: 24,
    patternH: 24,
    tile:
      `<polygon points="12,6 17.2,9 17.2,15 12,18 6.8,15 6.8,9" fill="none" stroke="#ff2a85" stroke-width=".65" opacity=".34"/>` +
      `<path d="M0 12 H6.8 M17.2 12 H24 M12 0 V6 M12 18 V24" stroke="#00f0ff" stroke-width=".55" opacity=".28"/>` +
      `<path d="M0 0 L4 4 M24 0 L20 4 M0 24 L4 20 M24 24 L20 20" stroke="#78a9ff" stroke-width=".5" opacity=".22"/>` +
      `<circle cx="12" cy="12" r="1.35" fill="#00f0ff" opacity=".52"/>`,
    inner:
      `<path d="M50 10 V45 M50 95 V130 M10 70 H27 M73 70 H90" stroke="#00f0ff" stroke-width="1" opacity=".4"/>` +
      `<path d="M36 12 L42 18 V44 M64 12 L58 18 V44 M36 128 L42 122 V96 M64 128 L58 122 V96" fill="none" stroke="#78a9ff" stroke-width=".8" opacity=".34"/>` +
      `<circle cx="42" cy="36" r="1.4" fill="#ff2a85" opacity=".75"/><circle cx="58" cy="36" r="1.4" fill="#ff2a85" opacity=".75"/>` +
      `<circle cx="42" cy="104" r="1.4" fill="#ff2a85" opacity=".75"/><circle cx="58" cy="104" r="1.4" fill="#ff2a85" opacity=".75"/>` +
      `<path d="M13 26 V15 L16 12 H27 M87 26 V15 L84 12 H73 M13 114 V125 L16 128 H27 M87 114 V125 L84 128 H73" fill="none" stroke="#00f0ff" stroke-width="1.6" stroke-linejoin="round" opacity=".88"/>` +
      `<path d="M16 21 V16 H21 M84 21 V16 H79 M16 119 V124 H21 M84 119 V124 H79" fill="none" stroke="#ff2a85" stroke-width="1" opacity=".72"/>` +
      `<circle cx="50" cy="70" r="27" fill="#08111d" fill-opacity=".62" stroke="#00f0ff" stroke-width=".9" stroke-dasharray="8 4" opacity=".55"/>`,
    emblem:
      `<polygon points="50,50 64.1,55.9 70,70 64.1,84.1 50,90 35.9,84.1 30,70 35.9,55.9" fill="#07101c" stroke="#00f0ff" stroke-width="2"/>` +
      `<polygon points="50,55.5 60.3,59.7 64.5,70 60.3,80.3 50,84.5 39.7,80.3 35.5,70 39.7,59.7" fill="#111936" stroke="#ff2a85" stroke-width="1.4"/>` +
      `<path d="M50 55.5 V84.5 M35.5 70 H64.5 M39.7 59.7 L60.3 80.3 M60.3 59.7 L39.7 80.3" stroke="#78a9ff" stroke-width=".75" opacity=".45"/>` +
      `<polygon points="50,60 58,70 50,80 42,70" fill="#00f0ff"/>` +
      `<polygon points="50,60 58,70 50,70" fill="#ffffff" opacity=".4"/>` +
      `<polygon points="50,64 54.5,70 50,76 45.5,70" fill="#ff2a85"/>` +
      `<circle cx="50" cy="70" r="1.8" fill="#ffffff"/>` +
      `<circle cx="50" cy="50" r="1.4" fill="#ff2a85"/><circle cx="70" cy="70" r="1.4" fill="#ff2a85"/>` +
      `<circle cx="50" cy="90" r="1.4" fill="#ff2a85"/><circle cx="30" cy="70" r="1.4" fill="#ff2a85"/>`,
  });

  // ---------- 3. MOCHI FRONT ----------
  const PLUM = '#5a3d5c';
  const DARK_EYE = '#3b2440';

  function mochiEars(lx1, ly1, ltx, lty, lx2, ly2, rx1, ry1, rtx, rty, rx2, ry2) {
    const ilx1 = +(lx1 + (ltx - lx1) * 0.25 + 1.5).toFixed(1);
    const ily1 = +(ly1 + (lty - ly1) * 0.25).toFixed(1);
    const iltx = +(ltx + (lx2 - ltx) * 0.14).toFixed(1);
    const ilty = +(lty + 5.2).toFixed(1);
    const ilx2 = +(lx2 - (lx2 - lx1) * 0.2).toFixed(1);
    const ily2 = +(ly2 - 0.5).toFixed(1);
    const irx1 = +(rx1 - (rx1 - rtx) * 0.25 - 1.5).toFixed(1);
    const iry1 = +(ry1 + (rty - ry1) * 0.25).toFixed(1);
    const irtx = +(rtx - (rtx - rx2) * 0.14).toFixed(1);
    const irty = +(rty + 5.2).toFixed(1);
    const irx2 = +(rx2 + (rx1 - rx2) * 0.2).toFixed(1);
    const iry2 = +(ry2 - 0.5).toFixed(1);
    return (
      `<path d="M${lx1} ${ly1} L${ltx} ${lty} L${lx2} ${ly2} Z" fill="#fff" stroke="${PLUM}" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M${ilx1} ${ily1} L${iltx} ${ilty} L${ilx2} ${ily2} Z" fill="#ffb3cf"/>` +
      `<path d="M${rx1} ${ry1} L${rtx} ${rty} L${rx2} ${ry2} Z" fill="#fff" stroke="${PLUM}" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M${irx1} ${iry1} L${irtx} ${irty} L${irx2} ${iry2} Z" fill="#ffb3cf"/>`
    );
  }

  function mochiBow(cx, cy, rot = 12, scale = 1) {
    return (
      `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${scale})">` +
      `<path d="M0 0 L-6.2 -4.4 L-6.2 4.4 Z M0 0 L6.2 -4.4 L6.2 4.4 Z" fill="#ff7aa8" stroke="${PLUM}" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<circle cx="0" cy="0" r="2.2" fill="#ffd35c" stroke="${PLUM}" stroke-width="1"/>` +
      `</g>`
    );
  }

  function mochiFrame(F, ink, isPip) {
    const ac = F.accent;
    // Stitched collar rails with tiny pink pawprints kept clear of corner rank/suit zones.
    const rail =
      `<path d="M30 5.2 H70 M30 134.8 H70" stroke="${ink}" stroke-width="2.2" stroke-opacity=".12" stroke-linecap="round"/>` +
      `<path d="M30 5.2 H70 M30 134.8 H70" stroke="${ink}" stroke-width="1" stroke-dasharray="2.6 2.8" stroke-opacity=".4" stroke-linecap="round"/>` +
      `<circle cx="38" cy="5.2" r="1.1" fill="${ac}"/><circle cx="62" cy="5.2" r="1.1" fill="${ac}"/>` +
      `<circle cx="38" cy="134.8" r="1.1" fill="${ac}"/><circle cx="62" cy="134.8" r="1.1" fill="${ac}"/>` +
      paw(50, 5.0, 1.08, '#ff7aa8') +
      `<g transform="rotate(180 50 135)">${paw(50, 135.0, 1.08, '#ff7aa8')}</g>` +
      `<path d="M4.5 52 V88 M95.5 52 V88" stroke="#ff7aa8" stroke-width=".9" stroke-dasharray="2 3" stroke-opacity=".35" stroke-linecap="round"/>` +
      `<circle cx="4.5" cy="70" r="1.2" fill="${ac}" opacity=".75"/><circle cx="95.5" cy="70" r="1.2" fill="${ac}" opacity=".75"/>`;

    if (!isPip) return rail;

    return rail +
      `<g opacity=".13">${paw(50, 68, 4.7, ink)}</g>` +
      `<g opacity=".16">${paw(50, 68, 3.2, '#ff9ec4')}</g>`;
  }

  function mochiAce(c, F, ink) {
    const s = c.suit, Y = +(39 + FACE_Y[s] * 0.56).toFixed(1);
    const blush = s < 2 ? '#ffd1e2' : '#ff9ec4';
    const eyeDx = s === 2 ? 7 : 8;
    return (
      `<circle cx="50" cy="69" r="32" fill="${F.tint[s]}" stroke="${ink}" stroke-width=".9" stroke-opacity=".24"/>` +
      `<path d="M27 57 L27 29 L45 47 L46 56 Z" fill="#fff" stroke="${PLUM}" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M30.5 51 L30.5 35 L40 45 Z" fill="#ffb3cf"/>` +
      `<path d="M73 57 L73 29 L55 47 L54 56 Z" fill="#fff" stroke="${PLUM}" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M69.5 51 L69.5 35 L60 45 Z" fill="#ffb3cf"/>` +
      use(s, 22, 39, 56, ink, 'suit') +
      mochiBow(67, 41, 10, 1.18) +
      `<ellipse cx="${50 - eyeDx}" cy="${Y - 2.5}" rx="2.3" ry="2.8" fill="#fff"/><ellipse cx="${50 + eyeDx}" cy="${Y - 2.5}" rx="2.3" ry="2.8" fill="#fff"/>` +
      `<ellipse cx="35.5" cy="${Y + 2}" rx="3.4" ry="1.9" fill="${blush}" opacity=".92"/><ellipse cx="64.5" cy="${Y + 2}" rx="3.4" ry="1.9" fill="${blush}" opacity=".92"/>` +
      `<path d="M45 ${Y + 3} Q47.5 ${Y + 6.5} 50 ${Y + 3} Q52.5 ${Y + 6.5} 55 ${Y + 3}" stroke="#fff" stroke-width="1.75" fill="none" stroke-linecap="round"/>` +
      `<g stroke="${PLUM}" stroke-width="1.4" stroke-linecap="round">` +
      `<path d="M12 64.5 L22.5 67"/><path d="M12 72 L22.5 71"/><path d="M88 64.5 L77.5 67"/><path d="M88 72 L77.5 71"/></g>` +
      `<path d="${starPath(24, 95, 3.3, 1.3)}" fill="#ffd35c"/><path d="${starPath(76, 94, 2.8, 1.1)}" fill="#ffd35c"/>`
    );
  }

  function mochiCourt(c, F, ink) {
    const s = c.suit, r = c.rank, ac = F.accent;
    const cid = c.id !== undefined ? c.id : `${s}_${r}`;
    const id = `fc_mochi_${cid}`;
    let g = `<defs><clipPath id="${id}"><rect x="21" y="22" width="58" height="96" rx="8"/></clipPath></defs>`;
    g += `<rect x="21" y="22" width="58" height="96" rx="8" fill="${F.tint[s]}" stroke="${ink}" stroke-opacity=".48" stroke-width="1.3"/>`;
    g += `<g clip-path="url(#${id})">`;
    g += `<path d="${starPath(71, 31, 3, 1.15)}" fill="${ac}"/><path d="${starPath(28, 37, 2.3, .9)}" fill="${ac}"/>` +
      `<g opacity=".22">${paw(29, 109, 1.5, ink)}</g>`;

    if (r === 11) {
      // Cavalier Knight Mochi (J): winking, feathered beret, suit cape, white ascot & golden taiyaki fish-wand
      g += `<path d="M21 120 Q25 90 50 87 Q75 90 79 120 Z" fill="${ink}" stroke="${PLUM}" stroke-width="1.2"/>`;
      g += `<path d="M35 90 L43 119 H57 L65 90 Q50 95 35 90 Z" fill="#fff" fill-opacity=".16"/>`;
      g += `<path d="M40 87 Q50 93 60 87 L56 97 L50 105 L44 97 Z" fill="#fff" stroke="${PLUM}" stroke-width="1.2" stroke-linejoin="round"/>`;
      g += `<path d="M44 91 Q50 96 56 91 L53 102 Q50 105 47 102 Z" fill="#fff6fb" stroke="${PLUM}" stroke-width=".9"/>`;
      g += `<circle cx="50" cy="92.5" r="2.2" fill="${ac}" stroke="${PLUM}" stroke-width="1"/>`;
      g += use(s, 45, 106, 10, '#ffffff', 'suit');

      g += mochiEars(29, 57, 30, 35, 43, 47, 71, 57, 70, 35, 57, 47);
      g += `<ellipse cx="50" cy="69" rx="20.5" ry="18" fill="#fff" stroke="${PLUM}" stroke-width="2"/>`;
      g += `<ellipse cx="36" cy="73" rx="3.4" ry="2" fill="#ffa3c4" opacity=".85"/><ellipse cx="64" cy="73" rx="3.4" ry="2" fill="#ffa3c4" opacity=".85"/>`;
      g += `<g stroke="${PLUM}" stroke-width="1.1" stroke-linecap="round"><path d="M23 69 L30 70.5"/><path d="M23 74 L30 73.5"/><path d="M77 69 L70 70.5"/><path d="M77 74 L70 73.5"/></g>`;

      g += `<ellipse cx="41.5" cy="67" rx="3.1" ry="3.8" fill="${DARK_EYE}"/><circle cx="42.6" cy="65.5" r="1.2" fill="#fff"/><circle cx="40.8" cy="68.5" r=".6" fill="#fff"/>`;
      g += `<path d="M54.5 68 Q58.5 62.5 62.5 68" stroke="${DARK_EYE}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      g += `<path d="M46 74 Q48 77 50 74 Q52 77 54 74" stroke="${DARK_EYE}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;

      // Feathered beret + golden plume
      g += `<path d="M39 42 Q28 32 31 24 Q38 28 43 38 Z" fill="#ffd35c" stroke="${PLUM}" stroke-width="1.1" stroke-linejoin="round"/>`;
      g += `<path d="M32 27 Q36 33 40 39" stroke="#fff9db" stroke-width="1" fill="none" stroke-linecap="round"/>`;
      g += `<path d="M36 49 Q37 36 50 36 Q63 36 64 49 Q50 45.5 36 49 Z" fill="${ink}" stroke="${PLUM}" stroke-width="1.25" stroke-linejoin="round"/>`;
      g += `<path d="M37.5 48.5 Q50 45 62.5 48.5" stroke="${ac}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
      g += use(s, 47, 38.5, 6, '#ffd35c', 'suit');

      // Golden taiyaki fish-wand + gripping cat paw
      g += `<line x1="72" y1="67" x2="72" y2="119" stroke="#c88a1e" stroke-width="2.1" stroke-linecap="round"/>`;
      g += `<line x1="72" y1="67" x2="72" y2="119" stroke="#ffd35c" stroke-width="1" stroke-linecap="round"/>`;
      g += `<g transform="translate(72 58) rotate(-15)">` +
        `<path d="M-2.5 5.5 L-5.5 10.5 L0 8.5 L5.5 10.5 L2.5 5.5 Z" fill="#f0ad2e" stroke="${PLUM}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M0 -8 C4.5 -8 6.2 -3 5.2 2 C4.5 5 2 6.5 0 6.5 C-2 6.5 -4.5 5 -5.2 2 C-6.2 -3 -4.5 -8 0 -8 Z" fill="#ffd35c" stroke="${PLUM}" stroke-width="1.1"/>` +
        `<path d="M-2.8 -1.5 H2.8 M-2.4 1.5 H2.4 M0 -4 V4" stroke="#c88a1e" stroke-width=".75" opacity=".75"/>` +
        `<circle cx="-1.6" cy="-4.2" r=".95" fill="${PLUM}"/></g>`;
      g += `<ellipse cx="72" cy="95" rx="4" ry="3.2" fill="#fff" stroke="${PLUM}" stroke-width="1.2"/>`;
    } else if (r === 12) {
      // Princess Mochi (Q): happy arched eyes, jeweled golden suit tiara, ruffled lace collar, pink ear-bow & collar bell
      g += `<path d="M21 120 Q24 90 50 87 Q76 90 79 120 Z" fill="${ink}" stroke="${PLUM}" stroke-width="1.2"/>`;
      g += `<path d="M32 90 Q36 98 41 94 Q45.5 101 50 96 Q54.5 101 59 94 Q64 98 68 90 Q58 92 50 90 Q42 92 32 90 Z" fill="#fff" stroke="${PLUM}" stroke-width="1.2" stroke-linejoin="round"/>`;
      g += `<path d="M36 91 Q50 95 64 91" fill="none" stroke="#ff7aa8" stroke-width="1.1" stroke-linecap="round"/>`;
      g += `<circle cx="50" cy="95.5" r="3.5" fill="#ffd35c" stroke="${PLUM}" stroke-width="1.2"/>`;
      g += `<circle cx="50" cy="96.6" r=".85" fill="${PLUM}"/><line x1="50" y1="97" x2="50" y2="98.8" stroke="${PLUM}" stroke-width=".85"/>`;
      g += use(s, 45, 105.5, 10, '#ffffff', 'suit');

      g += mochiEars(30, 57, 32, 36, 44, 48, 70, 57, 68, 36, 56, 48);
      g += `<ellipse cx="50" cy="69" rx="20.5" ry="18" fill="#fff" stroke="${PLUM}" stroke-width="2"/>`;
      g += mochiBow(63, 43, 14, .92);
      g += `<ellipse cx="36" cy="73" rx="3.4" ry="2" fill="#ffa3c4" opacity=".85"/><ellipse cx="64" cy="73" rx="3.4" ry="2" fill="#ffa3c4" opacity=".85"/>`;
      g += `<g stroke="${PLUM}" stroke-width="1.1" stroke-linecap="round"><path d="M23 69 L30 70.5"/><path d="M23 74 L30 73.5"/><path d="M77 69 L70 70.5"/><path d="M77 74 L70 73.5"/></g>`;

      g += `<path d="M37.5 68 Q41.5 62 45.5 68 M54.5 68 Q58.5 62 62.5 68" stroke="${DARK_EYE}" stroke-width="2.1" fill="none" stroke-linecap="round"/>`;
      g += `<path d="M46.5 73 Q50 79 53.5 73 Z" fill="#ff7aa2" stroke="${DARK_EYE}" stroke-width="1.1" stroke-linejoin="round"/>`;

      // Jeweled golden suit tiara
      g += `<path d="M37 49 Q43 40 50 37 Q57 40 63 49 Q50 47 37 49 Z" fill="#ffd35c" stroke="#c88a1e" stroke-width="1.15" stroke-linejoin="round"/>`;
      g += `<path d="M39 47.5 Q50 38 61 47.5" fill="none" stroke="#fff3b0" stroke-width=".9" stroke-linecap="round"/>`;
      g += use(s, 46, 32.5, 8, ink, 'suit');
      g += `<circle cx="42" cy="45" r="1.3" fill="#fff" stroke="#c88a1e" stroke-width=".65"/><circle cx="58" cy="45" r="1.3" fill="#fff" stroke="#c88a1e" stroke-width=".65"/>`;
    } else {
      // Sovereign King Mochi (K): proud smug eyes/grin, 3-point jeweled golden crown, royal ermine-trimmed suit mantle & golden cat-bell scepter
      g += `<path d="M21 120 Q23 89 50 86 Q77 89 79 120 Z" fill="${ink}" stroke="${PLUM}" stroke-width="1.2"/>`;
      g += `<path d="M26 92 Q50 101 74 92 L71 101 Q50 109 29 101 Z" fill="#fff" stroke="${PLUM}" stroke-width="1.2" stroke-linejoin="round"/>`;
      g += `<path d="M28 99 L26 119 H33 L35 101 Z M72 99 L74 119 H67 L65 101 Z" fill="#fff" stroke="${PLUM}" stroke-width="1"/>`;
      g += `<circle cx="30" cy="108" r="1.1" fill="${PLUM}"/><circle cx="30.5" cy="114" r="1.1" fill="${PLUM}"/>` +
        `<circle cx="70" cy="108" r="1.1" fill="${PLUM}"/><circle cx="69.5" cy="114" r="1.1" fill="${PLUM}"/>` +
        `<circle cx="37" cy="97" r="1" fill="${PLUM}"/><circle cx="63" cy="97" r="1" fill="${PLUM}"/>`;
      g += `<circle cx="50" cy="96" r="3.4" fill="#ffd35c" stroke="${PLUM}" stroke-width="1.15"/>`;
      g += use(s, 45, 106, 10, '#ffffff', 'suit');

      g += mochiEars(30, 57, 32, 36, 44, 48, 70, 57, 68, 36, 56, 48);
      g += `<ellipse cx="50" cy="69" rx="20.5" ry="18" fill="#fff" stroke="${PLUM}" stroke-width="2"/>`;
      g += `<ellipse cx="36" cy="73" rx="3.4" ry="2" fill="#ffa3c4" opacity=".85"/><ellipse cx="64" cy="73" rx="3.4" ry="2" fill="#ffa3c4" opacity=".85"/>`;
      g += `<g stroke="${PLUM}" stroke-width="1.1" stroke-linecap="round"><path d="M23 69 L30 70.5"/><path d="M23 74 L30 73.5"/><path d="M77 69 L70 70.5"/><path d="M77 74 L70 73.5"/></g>`;

      g += `<ellipse cx="41.5" cy="68" rx="3.1" ry="3.5" fill="${DARK_EYE}"/><circle cx="42.5" cy="67" r="1.1" fill="#fff"/>`;
      g += `<ellipse cx="58.5" cy="68" rx="3.1" ry="3.5" fill="${DARK_EYE}"/><circle cx="59.5" cy="67" r="1.1" fill="#fff"/>`;
      g += `<path d="M36.5 64.5 L45.5 66.5 M63.5 64.5 L54.5 66.5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`;
      g += `<path d="M37 65 L45.5 66.8 M63 65 L54.5 66.8" stroke="${DARK_EYE}" stroke-width="1.2" stroke-linecap="round"/>`;
      g += `<path d="M45.5 74 Q48 77.5 50 74.5 Q52 77.5 55.5 73" stroke="${DARK_EYE}" stroke-width="1.35" fill="none" stroke-linecap="round"/>`;

      // 3-point jeweled golden crown
      g += `<path d="M37 49 L38 35 L44.5 42 L50 30 L55.5 42 L62 35 L63 49 Z" fill="#ffd35c" stroke="#c88a1e" stroke-width="1.25" stroke-linejoin="round"/>`;
      g += `<rect x="37" y="46.5" width="26" height="3" rx="1" fill="#f0b432" stroke="#c88a1e" stroke-width=".9"/>`;
      g += `<circle cx="50" cy="42.5" r="2.2" fill="${ink}" stroke="#fff" stroke-width=".6"/>`;
      g += `<circle cx="42" cy="44.5" r="1.3" fill="#fff"/><circle cx="58" cy="44.5" r="1.3" fill="#fff"/>`;
      g += `<circle cx="38" cy="34.5" r="1.4" fill="#ffd35c" stroke="#c88a1e" stroke-width=".7"/>`;
      g += `<circle cx="50" cy="29.5" r="1.7" fill="#ffd35c" stroke="#c88a1e" stroke-width=".7"/>`;
      g += `<circle cx="62" cy="34.5" r="1.4" fill="#ffd35c" stroke="#c88a1e" stroke-width=".7"/>`;

      // Golden cat-bell scepter + gripping cat paw
      g += `<line x1="72" y1="67" x2="72" y2="119" stroke="#c88a1e" stroke-width="2.1" stroke-linecap="round"/>`;
      g += `<line x1="72" y1="67" x2="72" y2="119" stroke="#ffd35c" stroke-width="1" stroke-linecap="round"/>`;
      g += `<path d="M67.5 56 L68 49.5 L71 53 Z M76.5 56 L76 49.5 L73 53 Z" fill="#ffd35c" stroke="#c88a1e" stroke-width=".9" stroke-linejoin="round"/>`;
      g += `<circle cx="72" cy="59" r="5" fill="#ffd35c" stroke="#c88a1e" stroke-width="1.2"/>`;
      g += `<path d="M67.5 59 H76.5" stroke="#c88a1e" stroke-width="1"/>`;
      g += `<circle cx="72" cy="61.2" r="1.1" fill="${PLUM}"/>`;
      g += `<circle cx="72" cy="65.5" r="1.8" fill="${ink}" stroke="#ffd35c" stroke-width=".8"/>`;
      g += `<ellipse cx="72" cy="95" rx="4" ry="3.2" fill="#fff" stroke="${PLUM}" stroke-width="1.2"/>`;
    }

    g += '</g>';
    return g;
  }

  Art.registerFront('mochi', {
    name: 'Mochi',
    subtitle: 'LUCKY CYBER NEKO',
    dark: false,
    bg: 'linear-gradient(180deg, #fffcff 0%, #f8eefb 100%)',
    border: 'rgba(168, 128, 186, .52)',
    font: "'Mochiy Pop One', 'Nunito', sans-serif",
    weight: '400',
    suitPrefix: 'suit',
    previewSuit: 0,
    ink: ['#ff548e', '#ff7b4c', '#634075', '#3d2852'],
    tint: ['#ffeaf3', '#fff0e6', '#f2e8f9', '#ece6f7'],
    accent: '#ffd35c',
    frame: mochiFrame,
    ace: mochiAce,
    court: mochiCourt,
  });

  // ---------- 4. MOCHI BACK ----------
  const mochiCorner = (x, y, sx, sy) =>
    `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">` +
    `<path d="M0 16 Q0 0 16 0" fill="none" stroke="#ff9ec4" stroke-width="2" stroke-linecap="round" opacity=".72"/>` +
    `<path d="M4 13 Q4 4 13 4" fill="none" stroke="#ffd35c" stroke-width="1" stroke-dasharray="2 2" opacity=".85"/>` +
    `<path d="M6 6 L1 3 L3 9 Z M6 6 L9 1 L10 6 Z" fill="#ff7aa8" opacity=".92"/>` +
    `<circle cx="6.5" cy="6.5" r="2.3" fill="#ffd35c" stroke="${PLUM}" stroke-width=".8"/>` +
    `</g>`;

  Art.registerBack('mochi', {
    name: 'Mochi Bell',
    edge: '#fff7fc',
    bg: '#9168b3',
    bg2: '#664385',
    frame: '#ffd35c',
    dash: '3 3',
    patternW: 20,
    patternH: 20,
    tile:
      `<g opacity=".36">${paw(6, 6.5, 1.1, '#fff')}</g>` +
      `<g opacity=".55"><ellipse cx="14" cy="15" rx="2.7" ry="1.6" fill="#ffd35c"/>` +
      `<polygon points="16.4,15 19,13.3 19,16.7" fill="#ffd35c"/><circle cx="12.7" cy="14.7" r=".45" fill="#664385"/></g>`,
    inner:
      mochiCorner(11, 11, 1, 1) +
      mochiCorner(89, 11, -1, 1) +
      mochiCorner(11, 129, 1, -1) +
      mochiCorner(89, 129, -1, -1) +
      `<circle cx="50" cy="70" r="25" fill="#523270" fill-opacity=".42" stroke="#ffd35c" stroke-width=".9" stroke-dasharray="3 3" opacity=".75"/>`,
    emblem:
      `<circle cx="50" cy="70" r="20" fill="#fdf6ff" stroke="#ffd35c" stroke-width="1.8"/>` +
      `<circle cx="50" cy="70" r="17.5" fill="none" stroke="#ffb3cf" stroke-width=".8" opacity=".7"/>` +
      `<path d="M36 67 L37.5 54 L45.5 61 Z" fill="#fff" stroke="${PLUM}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<path d="M38.5 64 L39.2 57.5 L43.5 61.5 Z" fill="#ffb3cf"/>` +
      `<path d="M64 67 L62.5 54 L54.5 61 Z" fill="#fff" stroke="${PLUM}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<path d="M61.5 64 L60.8 57.5 L56.5 61.5 Z" fill="#ffb3cf"/>` +
      `<ellipse cx="50" cy="70.5" rx="12.8" ry="10.2" fill="#fff" stroke="${PLUM}" stroke-width="1.3"/>` +
      `<g transform="translate(58.5 58) rotate(14)">` +
      `<path d="M0 0 L-4.2 -3 L-4.2 3 Z M0 0 L4.2 -3 L4.2 3 Z" fill="#ff7aa8" stroke="${PLUM}" stroke-width=".85" stroke-linejoin="round"/>` +
      `<circle cx="0" cy="0" r="1.5" fill="#ffd35c" stroke="${PLUM}" stroke-width=".7"/></g>` +
      `<circle cx="45.2" cy="69.5" r="1.6" fill="${DARK_EYE}"/><circle cx="45.8" cy="68.8" r=".55" fill="#fff"/>` +
      `<circle cx="54.8" cy="69.5" r="1.6" fill="${DARK_EYE}"/><circle cx="55.4" cy="68.8" r=".55" fill="#fff"/>` +
      `<ellipse cx="41.5" cy="72.5" rx="2.1" ry="1.2" fill="#ffa3c4" opacity=".85"/><ellipse cx="58.5" cy="72.5" rx="2.1" ry="1.2" fill="#ffa3c4" opacity=".85"/>` +
      `<path d="M47.5 73.5 Q48.8 75.5 50 73.5 Q51.2 75.5 52.5 73.5" stroke="${DARK_EYE}" stroke-width="1.1" fill="none" stroke-linecap="round"/>` +
      `<path d="M44 80.5 Q50 83.2 56 80.5" stroke="#ff7aa8" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
      `<circle cx="50" cy="82.5" r="2.4" fill="#ffd35c" stroke="${PLUM}" stroke-width=".9"/>`,
  });
})();
