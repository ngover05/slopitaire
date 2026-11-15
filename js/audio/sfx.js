/* Slopitaire audio — the Prism digital SFX suite (40+ synthesized sound effects), built on js/audio/synth.js.
 * The game normally plays these from pre-rendered Opus files (tools/sfx -> audio/sfx, listed in js/audio/sfx-files.js);
 * the synthesis below is what those files are rendered from, and the live fallback where they can't load.
 *
 * VARIANTS says how each effect's arguments map to a distinct sound, so every variant can be rendered once:
 *   key(...args)  -> the normalized arguments the sound depends on (default: none). Must mirror the clamping in the
 *                    effect; the renderer checks this by fingerprinting the synth calls of every sample.
 *   sample        -> argument lists to try (an array, or a function returning one); one render per distinct key
 *   takes         -> renders with different random seeds (noise), picked at random at play time
 *   gap           -> ms: calls closer together than this are dropped (hover ticks and popup chimes)
 *   seq(...args)  -> the effect is a timed sequence of parts: [[part, partArgs, offsetSeconds], ...]
 *   part          -> a piece of a seq effect, not callable from the game */
const SfxSuite = (() => {
  'use strict';
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
  const PARTNER_SEMI = {
    sakura: 0, yuki: 2, rin: -1, mio: 4, ayame: -3, kira: -5, kaede: -2, mochi: 5
  };
  const PARTNERS = Object.keys(PARTNER_SEMI);
  const partnerSemi = (p) => PARTNER_SEMI[String(p || 'sakura').toLowerCase()] || 0;
  const AUTO_SCALE = [
    65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89, 91,
    93, 96, 98, 100, 101, 103, 105, 108
  ];
  const ALIASES = { chainMilestone: 'comboMilestone', chainBreak: 'comboBreak' };

  // ---------- variants ----------
  const cint = (v, lo, hi, d) => clamp(Math.round(Number(v) || d), lo, hi);
  const partnerKey = (p) => {
    const k = String(p || 'sakura').toLowerCase();
    return PARTNER_SEMI[k] != null ? k : 'sakura';
  };
  const ints = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => [a + i]);
  const cross = (as, bs) => as.flatMap((a) => bs.map((b) => [...a, b]));
  const partnerSample = [...PARTNERS, '', 'Sakura', 'MOCHI', 'nobody', undefined, null].map((p) => [p]);
  const partner = { key: (p) => [partnerKey(p)], sample: partnerSample };

  const multiPlaceSeq = (count = 2, combo = 0) => {
    const n = clamp((count | 0) || 2, 2, 13);
    const cb = cint(combo, 0, 24, 0);
    const taps = Math.min(n, 7);
    const out = [['multiThud', [], 0]];
    for (let i = 0; i < taps; i++) {
      const at = i * 0.018;
      out.push(['tapNoise', [i], at], ['tapNote', [Math.min(96, 62 + cb + i * 2), i === taps - 1 && cb >= 4 ? 1 : 0], at]);
    }
    return out;
  };
  const multiPlaceSample = cross(ints(0, 14), [undefined, 0, 1, 3, 4, 5, ...Array.from({ length: 22 }, (_, i) => i + 6)]);
  const partArgs = (seq, sample, part) => sample.flatMap((a) => seq(...a).filter((s) => s[0] === part).map((s) => s[1]));

  const VARIANTS = {
    flip: { takes: 3 },
    draw: { takes: 3 },
    place: { key: (c = 0) => [cint(c, 0, 24, 0)], sample: ints(-2, 30) },
    foundation: {
      key: (rank = 1, combo = 0) => {
        const r = clamp((rank | 0) || 1, 1, 13);
        return [Math.min(94, 69 + PENTA[r - 1] + ((cint(combo, 0, 24, 0) / 4) | 0))];
      },
      sample: cross(ints(-1, 15), [undefined, 0, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23, 24, 30]),
    },
    comboMilestone: { key: (t = 1) => [cint(t, 1, 4, 1)], sample: ints(-1, 6) },
    comboBreak: { key: (lost = 5) => [clamp((Number(lost) || 5) / 20, 0.25, 1.2)], sample: ints(0, 30) },
    hover: { gap: 45 },
    cardHover: { gap: 55 },
    multiPick: { key: (c = 2) => [Math.min(10, clamp((c | 0) || 2, 2, 13))], sample: ints(-1, 15) },
    multiPlace: { seq: multiPlaceSeq },
    multiThud: { part: true },
    tapNoise: { part: true, key: (i) => [i | 0], sample: ints(0, 6) },
    tapNote: { part: true, key: (m, s) => [m, s ? 1 : 0], sample: () => partArgs(multiPlaceSeq, multiPlaceSample, 'tapNote') },
    revealCard: { key: (r = 1) => [Math.min(92, 71 + PENTA[clamp((r | 0) || 1, 1, 13) - 1])], sample: ints(-1, 15) },
    comboTick: { key: (c = 1) => [cint(c, 1, 32, 1)], sample: ints(-1, 40) },
    drawTriple: { takes: 2 },
    partnerSelect: partner,
    petGirl: partner,
    touchHead: partner,
    touchFace: partner,
    touchHands: partner,
    touchTorso: partner,
    touchLegs: partner,
    popupScore: {
      gap: 30,
      key: (mult = 1) => {
        const v = clamp(Number(mult) || 1, 1, 4);
        return [clamp(Math.round((v - 1) * 6), 0, 14), v >= 1.5 ? 1 : 0, v >= 2 ? 1 : 0];
      },
      sample: [[], [0], [1.5], [2], ...Array.from({ length: 331 }, (_, i) => [Math.round(90 + i) / 100])],
    },
    badgeUnlock: { gap: 65 },
    bannerSlam: { gap: 80 },
    reactStamp: { gap: 70 },
    pairMatch: {
      key: (c = 0, king = false) => {
        const cb = cint(c, 0, 24, 0);
        return [Math.min(92, 67 + PENTA[cb % 13] + ((cb / 13) | 0) * 12), king ? 1 : 0];
      },
      sample: cross(ints(-1, 26), [false, true]),
    },
    runBank: { key: (len = 3) => [clamp((len | 0) - 1, 2, 9)], sample: [[], ...ints(-1, 12)] },
    cellPark: { key: (u = 1) => [clamp(u | 0, 1, 4)], sample: [[], ...ints(-1, 6)] },
    autoStep: {
      key: (i = 0) => {
        const idx = Math.max(0, (i | 0) || 0);
        return [Math.min(104, idx < AUTO_SCALE.length ? AUTO_SCALE[idx] : 96 + PENTA[idx % 7])];
      },
      sample: ints(-1, 45),
    },
    shuffle: { takes: 3 },
    deal: {
      seq: (n = 7, gap = 0.04) => {
        const count = clamp((n | 0) || 0, 0, 60);
        const dt = clamp(Number(gap) || 0.04, 0.012, 0.25);
        return Array.from({ length: count }, (_, i) => ['dealTap', [i % 5, i % 7], i * dt + 0.03]);
      },
    },
    dealTap: { part: true, key: (a, b) => [a | 0, b | 0], sample: cross(ints(0, 4), [0, 1, 2, 3, 4, 5, 6]) },
    nya: { takes: 4 },
  };

  // Crisp short prism slap-shimmer for the SFX (the sfxSend voices): returns the send input, wet output -> dest
  function createEcho(ac, dest) {
    const echo = ac.createDelay(0.5);
    echo.delayTime.value = 0.085;
    const fb = ac.createGain();
    fb.gain.value = 0.22;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const wet = ac.createGain();
    wet.gain.value = 0.24;
    echo.connect(hp);
    hp.connect(fb);
    fb.connect(echo);
    hp.connect(wet);
    wet.connect(dest);
    return echo;
  }

  return { createEcho, VARIANTS, ALIASES, PARTNERS, PENTA, AUTO_SCALE, partnerSemi };
})();

// A: the engine's context, SFX bus and synthesis primitives (see sound.js and tools/sfx/render.js).
// Returns { sfx: the effects, each synthesized at the current time, parts: the pieces of the seq effects (each
// starting at a given time), now: the start time an effect uses }.
function createSoundEffects(A) {
  'use strict';
  const { VARIANTS, ALIASES, PENTA, AUTO_SCALE, partnerSemi } = SfxSuite;
  const { mtof, safeHz, tone, supersaw, chordStab, noise, bell } = A;
  const now = () => A.ctx.currentTime + 0.004;

  // pieces of the sequence effects (VARIANTS[...].seq), each starting at t
  const parts = {
    multiThud(t) {
      tone(420, t, 0.08, { vol: 0.16, glide: 140, glideT: 0.055 });
    },
    tapNoise(t, i) {
      noise(t, 0.022, { ft: 'bandpass', f: 2400 + i * 280, q: 1.2, vol: 0.08 });
    },
    tapNote(t, m, send) {
      tone(mtof(m), t, 0.075, { type: 'triangle', vol: 0.085, a: 0.002, sfxSend: !!send });
    },
    dealTap(t, a, b) {
      noise(t, 0.045, { f: 2500 + a * 260 + Math.random() * 800, q: 1.0, vol: 0.085 });
      tone(1200 + b * 90, t, 0.028, { type: 'triangle', vol: 0.022 });
    },
  };
  const playSeq = (list) => {
    const t = now();
    for (const [p, args, at] of list) parts[p](t + at, ...args);
  };

  const sfx = {
    flip() {
      const t = now();
      noise(t, 0.055, { f: 3800, fEnd: 5600, q: 0.9, vol: 0.15 });
      tone(1450, t, 0.055, { type: 'triangle', vol: 0.065, glide: 2550 });
      tone(2900, t + 0.012, 0.04, { type: 'sine', vol: 0.03, glide: 4100 });
    },

    pick() {
      const t = now();
      tone(700, t, 0.068, { type: 'triangle', vol: 0.11, glide: 1250 });
      tone(1400, t + 0.006, 0.048, { type: 'sine', vol: 0.045, glide: 2500 });
    },

    place(combo = 0) {
      const t = now();
      const cb = clamp(Math.round(Number(combo) || 0), 0, 24);
      // Punchy tactile tap transient + pitch-shifted prism synth note
      tone(460, t, 0.085, { vol: 0.2, glide: 145, glideT: 0.055 });
      noise(t, 0.034, { ft: 'bandpass', f: 2400 + cb * 70, q: 1.1, vol: 0.12 });
      const hz = mtof(64 + cb);
      tone(hz, t, 0.12, { type: 'triangle', vol: 0.11, a: 0.002 });
      tone(hz * 2, t + 0.005, 0.09, {
        type: 'sawtooth',
        vol: 0.03 + cb * 0.0016,
        lp: 3200 + cb * 220,
        lpEnd: 1100,
        sfxSend: cb >= 5
      });
    },

    draw() {
      const t = now();
      noise(t, 0.085, { f: 2500, fEnd: 4600, q: 0.75, vol: 0.12, a: 0.012 });
      tone(680, t, 0.065, { type: 'triangle', vol: 0.055, glide: 1480 });
      tone(2350, t + 0.022, 0.028, { type: 'sine', vol: 0.04 });
    },

    foundation(rank = 1, combo = 0) {
      const t = now();
      const r = clamp((rank | 0) || 1, 1, 13);
      const cb = clamp(Math.round(Number(combo) || 0), 0, 24);
      const m = Math.min(94, 69 + PENTA[r - 1] + ((cb / 4) | 0));
      // Shimmering prism chord hit + ascending crystalline synth bell
      noise(t, 0.05, { ft: 'highpass', f: 7200, vol: 0.075 });
      chordStab([m - 12, m - 5, m, m + 4], t, 0.22, {
        type: 'sawtooth', detune: 11, vol: 0.05, lp: 5800, lpEnd: 1800, sfxSend: true
      });
      bell(mtof(m), t, 0.46, 0.12, A.sfxBus, false, true);
      bell(mtof(m + 7), t + 0.045, 0.36, 0.075, A.sfxBus, false, true);
      bell(mtof(m + 12), t + 0.09, 0.34, 0.065, A.sfxBus, false, true);
    },

    comboMilestone(tier = 1) {
      const t = now();
      const tr = clamp(Math.round(Number(tier) || 1), 1, 4);
      const roots = [65, 68, 72, 77]; // Escalates across SURGE, BOOST, BLITZ, APEX!
      const root = roots[tr - 1];
      supersaw(260 + tr * 55, t, 0.16, {
        glide: 1350 + tr * 480, glideT: 0.15, vol: 0.09, lp: 7500, spread: 18, sfxSend: true
      });
      noise(t, 0.15, { ft: 'bandpass', f: 1400, fEnd: 6800, q: 1.6, vol: 0.09, a: 0.04 });
      const hitT = t + 0.11;
      tone(160, hitT, 0.22, { vol: 0.24, glide: 44, glideT: 0.14 });
      const chord = tr >= 3
        ? [root, root + 7, root + 12, root + 16, root + 19]
        : [root, root + 7, root + 12, root + 16];
      chordStab(chord, hitT, 0.34 + tr * 0.06, {
        type: 'sawtooth', detune: 14 + tr * 2, vol: 0.075, lp: 8500, lpEnd: 2200, sfxSend: true
      });
      for (let i = 0; i < tr + 1; i++) {
        bell(mtof(root + 12 + PENTA[i * 2]), hitT + i * 0.042, 0.36, 0.08, A.sfxBus, false, true);
      }
    },

    comboBreak(lost = 5) {
      const t = now();
      const sev = clamp((Number(lost) || 5) / 20, 0.25, 1.2);
      // Filter power-down sweep when a high combo drops
      supersaw(340 + sev * 60, t, 0.38, {
        glide: 54, glideT: 0.35, vol: 0.13, lp: 3200, lpEnd: 130, q: 2.4, spread: 22
      });
      tone(220, t, 0.32, { type: 'sawtooth', vol: 0.1, glide: 48, lp: 900, lpEnd: 110 });
      noise(t, 0.14, { ft: 'bandpass', f: 1500, fEnd: 320, q: 1.5, vol: 0.11 });
    },

    cutin() {
      const t = now();
      // Anime prism-slash whoosh + sub-bass impact + crystal chime
      noise(t, 0.17, { ft: 'bandpass', f: 5200, fEnd: 850, q: 1.3, vol: 0.17, a: 0.005 });
      supersaw(2400, t, 0.1, { glide: 380, glideT: 0.09, vol: 0.09, lp: 9000, spread: 14 });
      tone(145, t + 0.02, 0.28, { vol: 0.26, glide: 38, glideT: 0.2 });
      bell(mtof(84), t + 0.04, 0.42, 0.1, A.sfxBus, false, true);
      bell(mtof(91), t + 0.085, 0.45, 0.095, A.sfxBus, false, true);
      bell(mtof(96), t + 0.13, 0.52, 0.09, A.sfxBus, false, true);
    },

    hover() {
      const t = now();
      tone(1900, t, 0.018, { type: 'triangle', vol: 0.032, glide: 2550, a: 0.002 });
    },

    cardHover() {
      const t = now();
      // Silky 12ms (<15ms) micro-tick for hovering face-up cards
      tone(2250, t, 0.012, { type: 'sine', vol: 0.024, glide: 2850, a: 0.0015 });
    },

    multiPick(count = 2) {
      const t = now();
      const n = clamp((count | 0) || 2, 2, 13);
      const voices = Math.min(4, n);
      const steps = [0, 4, 7, 11];
      noise(t, 0.025, { ft: 'highpass', f: 4200, vol: 0.05 });
      for (let i = 0; i < voices; i++) {
        const hz = mtof(67 + Math.min(8, n - 2) + steps[i]);
        tone(hz, t + i * 0.012, 0.075, {
          type: 'triangle', vol: 0.075 / Math.sqrt(voices), glide: hz * 1.12
        });
      }
    },

    multiPlace(count = 2, combo = 0) {
      playSeq(VARIANTS.multiPlace.seq(count, combo));
    },

    revealCard(rank = 1) {
      const t = now();
      const r = clamp((rank | 0) || 1, 1, 13);
      const m = Math.min(92, 71 + PENTA[r - 1]);
      // Crystalline data-decrypt shimmer scaled by revealed card rank
      noise(t, 0.045, { f: 4200, fEnd: 6800, q: 1.1, vol: 0.09 });
      tone(mtof(m - 5), t, 0.07, { type: 'triangle', vol: 0.06 });
      bell(mtof(m), t + 0.024, 0.24, 0.075, A.sfxBus, false, true);
      bell(mtof(m + 7), t + 0.048, 0.28, 0.06, A.sfxBus, false, true);
    },

    kingLock() {
      const t = now();
      // Deep bass servo-lock + authoritative metallic fifth chime
      tone(190, t, 0.19, { vol: 0.24, glide: 48, glideT: 0.14 });
      tone(260, t + 0.028, 0.12, { type: 'sawtooth', vol: 0.1, glide: 130, lp: 1200, lpEnd: 280 });
      noise(t + 0.02, 0.04, { ft: 'bandpass', f: 1800, q: 1.8, vol: 0.1 });
      bell(mtof(67), t + 0.035, 0.38, 0.095, A.sfxBus, false, true);
      bell(mtof(74), t + 0.065, 0.42, 0.085, A.sfxBus, false, true);
    },

    aceIgnition() {
      const t = now();
      // Bright upward prism-spark ignition for foundation Ace
      noise(t, 0.07, { ft: 'highpass', f: 6500, vol: 0.09 });
      supersaw(587.3, t, 0.16, { glide: 2349.3, glideT: 0.15, vol: 0.075, lp: 8500, spread: 14, sfxSend: true });
      [79, 84, 88, 96].forEach((m, i) => {
        bell(mtof(m), t + i * 0.028, 0.34, 0.085, A.sfxBus, false, true);
      });
    },

    comboTick(combo = 1) {
      const t = now();
      const cb = clamp(Math.round(Number(combo) || 1), 1, 32);
      const hz = mtof(69 + cb * 0.75);
      tone(hz, t, 0.07, { type: 'sine', vol: 0.055, a: 0.002 });
      tone(safeHz(hz * 2), t + 0.008, 0.05, { type: 'triangle', vol: 0.025 });
    },

    comboSave() {
      const t = now();
      // Relieved upward dual-chime when rescuing a nearly-expired combo
      noise(t, 0.08, { ft: 'bandpass', f: 2200, fEnd: 5400, q: 1.2, vol: 0.065, a: 0.015 });
      bell(mtof(76), t, 0.24, 0.09, A.sfxBus, false, true);
      bell(mtof(81), t + 0.055, 0.3, 0.1, A.sfxBus, false, true);
      tone(mtof(88), t + 0.095, 0.16, { type: 'sine', vol: 0.055, sfxSend: true });
    },

    drawTriple() {
      const t = now();
      // Crisp rapid 3-tap card fan for Draw-3 mode
      for (let i = 0; i < 3; i++) {
        const st = t + i * 0.042;
        noise(st, 0.048, { f: 2600 + i * 650, fEnd: 4600 + i * 500, q: 0.9, vol: 0.11 });
        tone(820 + i * 240, st, 0.042, { type: 'triangle', vol: 0.05, glide: 1220 + i * 280 });
      }
    },

    stockEmpty() {
      const t = now();
      tone(420, t, 0.065, { type: 'sine', vol: 0.09, glide: 250 });
      noise(t, 0.03, { ft: 'bandpass', f: 950, q: 2.2, vol: 0.07 });
    },

    modalOpen() {
      const t = now();
      noise(t, 0.13, { ft: 'bandpass', f: 950, fEnd: 3800, q: 1.1, vol: 0.07, a: 0.025 });
      tone(587.3, t, 0.12, { type: 'triangle', vol: 0.065, glide: 880, a: 0.012, sfxSend: true });
      tone(1174.7, t + 0.035, 0.09, { type: 'sine', vol: 0.04, glide: 1760 });
    },

    modalClose() {
      const t = now();
      noise(t, 0.11, { ft: 'bandpass', f: 3400, fEnd: 780, q: 1.1, vol: 0.065, a: 0.015 });
      tone(880, t, 0.11, { type: 'triangle', vol: 0.06, glide: 523.25, a: 0.008 });
    },

    toggleOn() {
      const t = now();
      tone(987.8, t, 0.04, { type: 'triangle', vol: 0.07 });
      tone(1318.5, t + 0.032, 0.06, { type: 'sine', vol: 0.08, glide: 1480 });
    },

    toggleOff() {
      const t = now();
      tone(1174.7, t, 0.04, { type: 'triangle', vol: 0.065 });
      tone(784, t + 0.032, 0.06, { type: 'sine', vol: 0.07, glide: 698.5 });
    },

    partnerSelect(key = 'sakura') {
      const t = now();
      const k = String(key || 'sakura').toLowerCase();
      if (k === 'yuki') {
        // Icy crystalline fifth + glass octave shimmer
        [76, 83, 88].forEach((m, i) => {
          bell(mtof(m), t + i * 0.055, 0.42, 0.09, A.sfxBus, false, true);
        });
      } else if (k === 'rin') {
        // Syncopated energetic synth pluck
        const notes = [74, 77, 81, 86];
        const offs = [0, 0.045, 0.105, 0.15];
        for (let i = 0; i < 4; i++) {
          supersaw(mtof(notes[i]), t + offs[i], 0.11, {
            voices: 2, spread: 12, vol: 0.08, lp: 5800, lpEnd: 1600, sfxSend: i === 3
          });
        }
      } else if (k === 'mio') {
        // Shy Dandere: delicate pastel celesta / music-box Gmaj9 twinkle
        [79, 83, 86, 91, 95].forEach((m, i) => {
          const nt = t + i * 0.036;
          bell(mtof(m), nt, 0.4, 0.072, A.sfxBus, false, i >= 3);
        });
      } else if (k === 'ayame') {
        // Devoted Yandere: hypnotic velvet minor-major-7th harp (A-C-E-G#-C)
        [69, 72, 76, 80, 84].forEach((m, i) => {
          const nt = t + i * 0.048;
          tone(mtof(m), nt, 0.34, { type: 'triangle', vol: 0.075, lp: 2800, a: 0.004 });
          bell(mtof(m), nt, 0.44, 0.068, A.sfxBus, false, i >= 3);
        });
      } else if (k === 'kira') {
        // Cool Hacker with Aura: deep sub-bass pulse + cyber harmonic glitch lock
        tone(155, t, 0.22, { vol: 0.22, glide: 46, glideT: 0.16 });
        [72, 84, 79, 91].forEach((m, i) => {
          const nt = t + i * 0.028;
          tone(mtof(m), nt, 0.065, { type: 'square', vol: 0.048, lp: 5400, lpEnd: 1800 });
        });
        chordStab([67, 74, 81, 86], t + 0.09, 0.28, {
          type: 'sawtooth', detune: 12, vol: 0.06, lp: 6800, lpEnd: 2200, sfxSend: true
        });
      } else if (k === 'kaede') {
        // Warm Onee-san: soothing Rhodes Fmaj7 chord bloom + tender golden bells
        chordStab([65, 69, 72, 76], t, 0.42, {
          type: 'triangle', detune: 6, vol: 0.065, a: 0.018, lp: 2400, sfxSend: true
        });
        [77, 81, 84].forEach((m, i) => {
          bell(mtof(m), t + 0.025 + i * 0.058, 0.44, 0.078, A.sfxBus, false, true);
        });
      } else if (k === 'mochi') {
        // Playful mini nya-chime
        tone(640, t, 0.12, { type: 'sawtooth', vol: 0.075, glide: 980, glideT: 0.06, lp: 2200 });
        bell(mtof(86), t + 0.06, 0.3, 0.09, A.sfxBus, false, true);
        bell(mtof(91), t + 0.11, 0.34, 0.08, A.sfxBus, false, true);
      } else {
        // Sakura: bright warm major-9th bell cascade
        [72, 76, 79, 86].forEach((m, i) => {
          bell(mtof(m), t + i * 0.042, 0.36, 0.09, A.sfxBus, false, true);
        });
      }
    },

    petGirl(key = 'sakura') {
      const t = now();
      const k = String(key || 'sakura').toLowerCase();
      if (k === 'mio') {
        // Shy flustered celesta flutter-blush
        tone(740, t, 0.04, { type: 'sine', vol: 0.068, glide: 1480, a: 0.002 });
        [88, 91, 95].forEach((m, i) => {
          bell(mtof(m), t + 0.024 + i * 0.032, 0.24, 0.068, A.sfxBus, false, i === 2);
        });
      } else if (k === 'ayame') {
        // Devoted double-heartbeat pulse + velvet minor-major chime
        tone(175, t, 0.075, { vol: 0.14, glide: 64, glideT: 0.06 });
        tone(185, t + 0.085, 0.085, { vol: 0.12, glide: 62, glideT: 0.065 });
        bell(mtof(80), t + 0.03, 0.28, 0.075, A.sfxBus, false, true);
        bell(mtof(84), t + 0.085, 0.34, 0.08, A.sfxBus, false, true);
      } else if (k === 'kira') {
        // Cool hacker aura visor blip + emerald fifth shimmer
        tone(920, t, 0.036, { type: 'square', vol: 0.048, glide: 1840, lp: 5200 });
        bell(mtof(79), t + 0.026, 0.24, 0.078, A.sfxBus, false, false);
        bell(mtof(86), t + 0.065, 0.3, 0.082, A.sfxBus, false, true);
      } else if (k === 'kaede') {
        // Warm comforting Rhodes headpat chord + gentle bell embrace
        chordStab([65, 69, 72, 76], t, 0.28, { type: 'triangle', vol: 0.048, a: 0.012, lp: 2200 });
        bell(mtof(81), t + 0.03, 0.28, 0.075, A.sfxBus, false, true);
        bell(mtof(88), t + 0.08, 0.34, 0.08, A.sfxBus, false, true);
      } else {
        const pair = k === 'yuki' ? [83, 90] : k === 'rin' ? [81, 86] : k === 'mochi' ? [86, 91] : [84, 88];
        tone(540, t, 0.048, { type: 'sine', vol: 0.085, glide: 1240, a: 0.002 });
        bell(mtof(pair[0]), t + 0.03, 0.24, 0.08, A.sfxBus, false, true);
        bell(mtof(pair[1]), t + 0.075, 0.3, 0.085, A.sfxBus, false, true);
      }
    },

    touchHead(partner = 'sakura') {
      const t = now();
      const s = partnerSemi(partner);
      // Soft warm velvet dual-chime pat-pat (撫で撫で)
      for (let i = 0; i < 2; i++) {
        const pt = t + i * 0.115;
        noise(pt, 0.068, { ft: 'lowpass', f: 1100, fEnd: 580, q: 0.8, vol: 0.05, a: 0.014 });
        const m = (i === 0 ? 76 : 81) + s;
        tone(mtof(m), pt, 0.22, { type: 'triangle', vol: 0.068, a: 0.012, lp: 2400 });
        bell(mtof(m), pt + 0.008, 0.32, 0.072, A.sfxBus, false, i === 1);
      }
      if (String(partner || '').toLowerCase() === 'mochi') {
        tone(120, t + 0.03, 0.24, { type: 'sawtooth', vol: 0.045, glide: 135, lp: 320 });
      }
    },

    touchFace(partner = 'sakura') {
      const t = now();
      const s = partnerSemi(partner);
      const mul = Math.pow(2, s / 24);
      // Cute elastic pitch-bent cheek-poke boop! blip
      tone(390 * mul, t, 0.052, { type: 'sine', vol: 0.1, glide: 980 * mul, a: 0.002 });
      tone(760 * mul, t + 0.044, 0.068, { type: 'triangle', vol: 0.085, glide: 1380 * mul, a: 0.002 });
      bell(mtof(Math.min(98, 91 + s)), t + 0.055, 0.2, 0.065, A.sfxBus, false, true);
    },

    touchHands(partner = 'sakura') {
      const t = now();
      const s = partnerSemi(partner);
      // Crisp harmonic prism high-five / link chord
      noise(t, 0.032, { ft: 'bandpass', f: 2950, q: 1.1, vol: 0.095 });
      tone(350, t, 0.048, { vol: 0.12, glide: 165, glideT: 0.038 });
      chordStab([67 + s, 74 + s, 79 + s, 83 + s], t + 0.012, 0.26, {
        type: 'sawtooth', detune: 11, vol: 0.06, lp: 6400, lpEnd: 2200, sfxSend: true
      });
      bell(mtof(83 + s), t + 0.02, 0.28, 0.08, A.sfxBus, false, false);
      bell(mtof(Math.min(98, 91 + s)), t + 0.062, 0.34, 0.085, A.sfxBus, false, true);
    },

    touchTorso(partner = 'sakura') {
      const t = now();
      const s = partnerSemi(partner);
      // Anime flustered doki-doki! double-pulse + sparkly blush flourish
      tone(168, t, 0.078, { vol: 0.18, glide: 56, glideT: 0.062 });
      tone(188, t + 0.105, 0.088, { vol: 0.19, glide: 60, glideT: 0.07 });
      noise(t + 0.04, 0.13, { ft: 'highpass', f: 5200, vol: 0.048, a: 0.02 });
      [79, 83, 86, 90, 95].forEach((m, i) => {
        const nt = t + 0.05 + i * 0.026;
        bell(mtof(Math.min(100, m + s)), nt, 0.24, 0.068, A.sfxBus, false, i >= 3);
      });
    },

    touchLegs(partner = 'sakura') {
      const t = now();
      const s = partnerSemi(partner);
      const mul = Math.pow(2, s / 24);
      // Comedic anime startled upward snap-whistle (びくっ!)
      noise(t, 0.028, { ft: 'bandpass', f: 3600, q: 1.4, vol: 0.11 });
      tone(520 * mul, t, 0.115, { type: 'triangle', vol: 0.105, glide: 2480 * mul, glideT: 0.105, a: 0.002 });
      tone(1040 * mul, t + 0.01, 0.1, { type: 'sine', vol: 0.055, glide: 3600 * mul, glideT: 0.095 });
      bell(mtof(Math.min(100, 95 + Math.min(3, s))), t + 0.112, 0.18, 0.08, A.sfxBus, false, true);
    },

    halfway() {
      const t = now();
      // Uplifting midpoint progress chime (26/52 foundation cards)
      tone(165, t, 0.18, { vol: 0.18, glide: 55, glideT: 0.13 });
      [69, 73, 76, 81].forEach((m, i) => {
        const nt = t + i * 0.05;
        bell(mtof(m), nt, 0.34, 0.085, A.sfxBus, false, true);
        tone(mtof(m), nt, 0.12, { type: 'triangle', vol: 0.05 });
      });
    },

    almostWon() {
      const t = now();
      // Exciting climax shimmer (44/52 foundation cards)
      noise(t, 0.14, { ft: 'bandpass', f: 1800, fEnd: 6400, q: 1.3, vol: 0.08, a: 0.03 });
      [74, 78, 81, 86, 90, 93].forEach((m, i) => {
        const nt = t + i * 0.042;
        supersaw(mtof(m), nt, 0.14, { voices: 2, spread: 13, vol: 0.06, lp: 7200, sfxSend: i >= 4 });
        bell(mtof(m), nt, 0.32, 0.075, A.sfxBus, false, true);
      });
    },

    newRecord() {
      const t = now();
      // Golden prism Lydian arpeggio burst on setting a new record
      chordStab([60, 67, 72, 76, 83], t, 0.45, {
        type: 'sawtooth', detune: 14, vol: 0.065, lp: 8200, lpEnd: 2600, sfxSend: true
      });
      [72, 76, 79, 83, 86, 90, 96].forEach((m, i) => {
        bell(mtof(m), t + i * 0.045, 0.42, 0.09, A.sfxBus, false, true);
      });
    },

    popupScore(mult = 1) {
      const t = now() + 0.018;
      const mVal = clamp(Number(mult) || 1, 1, 4);
      const semi = clamp(Math.round((mVal - 1) * 6), 0, 14);
      const hz = mtof(88 + semi);
      // Lightweight crystalline upper-register score twinkle (non-fatiguing)
      tone(hz, t, 0.042, { type: 'sine', vol: 0.036, a: 0.002 });
      if (mVal >= 1.5) {
        tone(safeHz(hz * 1.25), t + 0.024, 0.055, { type: 'triangle', vol: 0.03, a: 0.002, sfxSend: mVal >= 2 });
      }
    },

    badgeUnlock() {
      const t = now();
      // Glassy futuristic accolade / medal unlock triad
      [79, 83, 86, 91].forEach((m, i) => {
        const nt = t + i * 0.026;
        bell(mtof(m), nt, 0.22, 0.052, A.sfxBus, false, i === 3);
      });
    },

    bannerSlam() {
      const t = now();
      // Kinetic sub-HUD callout banner wipe + crisp fifth lock
      tone(155, t, 0.11, { vol: 0.13, glide: 54, glideT: 0.085 });
      noise(t, 0.065, { ft: 'bandpass', f: 3400, fEnd: 1350, q: 1.2, vol: 0.062, a: 0.003 });
      tone(mtof(74), t + 0.01, 0.12, { type: 'triangle', vol: 0.048, sfxSend: true });
      tone(mtof(81), t + 0.028, 0.14, { type: 'sine', vol: 0.045, sfxSend: true });
    },

    reactStamp() {
      const t = now();
      // Playful holographic companion reaction stamp pop
      tone(680, t, 0.032, { type: 'sine', vol: 0.052, glide: 1520, a: 0.002 });
      bell(mtof(86), t + 0.018, 0.16, 0.05, A.sfxBus, false, false);
      bell(mtof(93), t + 0.044, 0.2, 0.052, A.sfxBus, false, true);
    },

    modeSwitch() {
      const t = now();
      tone(784, t, 0.075, { type: 'triangle', vol: 0.09, glide: 1175 });
      tone(1175, t + 0.052, 0.11, { type: 'sine', vol: 0.1, glide: 1568, sfxSend: true });
      tone(2350, t + 0.06, 0.08, { type: 'sine', vol: 0.035, glide: 3136 });
    },

    clearCol() {
      const t = now();
      supersaw(440, t, 0.22, { glide: 1760, glideT: 0.2, vol: 0.085, lp: 6500, spread: 14, sfxSend: true });
      [72, 76, 79, 84].forEach((m, i) => {
        bell(mtof(m), t + i * 0.038, 0.3, 0.075, A.sfxBus, false, true);
      });
    },

    suitDone() {
      const t = now();
      const notes = [72, 76, 79, 84, 79, 84, 88, 96];
      tone(150, t, 0.22, { vol: 0.22, glide: 45, glideT: 0.15 });
      notes.forEach((m, i) => {
        const nt = t + i * 0.055;
        supersaw(mtof(m), nt, 0.14, { vol: 0.075, lp: 7200, spread: 14, sfxSend: i >= 5 });
        bell(mtof(m), nt, 0.32, 0.07, A.sfxBus, false, i === 7);
      });
      chordStab([72, 79, 84, 88, 96], t + 7 * 0.055, 0.5, {
        type: 'sawtooth', detune: 14, vol: 0.07, lp: 8000, lpEnd: 2400, sfxSend: true
      });
    },

    // ---------- variant SFX (Pyramid / TriPeaks / FreeCell) ----------
    // Pyramid pair: two bells a fifth apart that meet on one chord; climbs with the combo. Kings get a low thud.
    pairMatch(combo = 0, king = false) {
      const t = now();
      const cb = clamp(Math.round(Number(combo) || 0), 0, 24);
      const m = Math.min(92, 67 + PENTA[cb % 13] + ((cb / 13) | 0) * 12);
      noise(t, 0.04, { ft: 'highpass', f: 6800, vol: 0.06 });
      if (king) tone(130, t, 0.18, { vol: 0.18, glide: 55, glideT: 0.12 });
      bell(mtof(m), t, 0.34, 0.1, A.sfxBus, false, true);
      bell(mtof(m + 7), t + 0.06, 0.3, 0.085, A.sfxBus, false, true);
      chordStab([m - 12, m, m + 4, m + 7], t + 0.1, 0.2, { type: 'triangle', vol: 0.045, lp: 5200, lpEnd: 1800, sfxSend: true });
    },

    // Pyramid row gone: a rising sweep into a bright stack of bells
    rowClear() {
      const t = now();
      supersaw(330, t, 0.2, { glide: 1320, glideT: 0.18, vol: 0.08, lp: 6800, spread: 16, sfxSend: true });
      [76, 79, 83, 88, 91].forEach((m, i) => bell(mtof(m), t + 0.05 + i * 0.045, 0.32, 0.07, A.sfxBus, false, true));
    },

    // TriPeaks summit: deep boom, then a fanfare arpeggio
    peakClear() {
      const t = now();
      tone(110, t, 0.3, { vol: 0.22, glide: 40, glideT: 0.25 });
      noise(t, 0.2, { ft: 'bandpass', f: 900, fEnd: 5200, q: 1.2, vol: 0.08, a: 0.03 });
      [72, 79, 84, 88, 91, 96].forEach((m, i) => {
        const nt = t + 0.04 + i * 0.06;
        supersaw(mtof(m), nt, 0.12, { vol: 0.06, lp: 7600, spread: 12, sfxSend: i >= 4 });
        bell(mtof(m), nt, 0.28, 0.065, A.sfxBus, false, i === 5);
      });
    },

    // TriPeaks run cashed in: a coin-counter ripple, longer runs get more ticks
    runBank(len = 3) {
      const t = now();
      const n = clamp((len | 0) - 1, 2, 9);
      for (let i = 0; i < n; i++) {
        const nt = t + i * 0.045;
        tone(mtof(84 + PENTA[i % 13]), nt, 0.06, { type: 'square', vol: 0.03, lp: 4200 });
        bell(mtof(84 + PENTA[i % 13]), nt, 0.16, 0.05, A.sfxBus, false, false);
      }
      chordStab([72, 76, 79, 84], t + n * 0.045, 0.32, { type: 'sawtooth', detune: 10, vol: 0.05, lp: 6400, lpEnd: 2000, sfxSend: true });
    },

    // FreeCell: parking a card in a cell; the pitch drops as the cells fill up
    cellPark(used = 1) {
      const t = now();
      const u = clamp(used | 0, 1, 4);
      tone(520 - u * 60, t, 0.07, { type: 'triangle', vol: 0.1, glide: 300 - u * 30, glideT: 0.05 });
      noise(t, 0.03, { ft: 'bandpass', f: 1800, q: 1.4, vol: 0.07 });
      tone(1040 - u * 90, t + 0.03, 0.05, { type: 'sine', vol: 0.04 });
    },

    autoStep(i = 0) {
      const t = now();
      const idx = Math.max(0, (i | 0) || 0);
      const m = idx < AUTO_SCALE.length
        ? AUTO_SCALE[idx]
        : 96 + PENTA[idx % 7];
      const hz = mtof(Math.min(104, m));
      tone(420, t, 0.05, { vol: 0.11, glide: 170, glideT: 0.04 });
      bell(hz, t, 0.26, 0.095, A.sfxBus, false, true);
      tone(hz, t, 0.07, { type: 'triangle', vol: 0.055 });
    },

    warning() {
      const t = now();
      for (let i = 0; i < 2; i++) {
        const pt = t + i * 0.105;
        tone(1046.5, pt, 0.07, { type: 'triangle', vol: 0.085, glide: 880 });
        tone(2093, pt, 0.05, { type: 'sine', vol: 0.032, glide: 1760 });
      }
    },

    invalid() {
      const t = now();
      tone(392, t, 0.11, { type: 'sawtooth', vol: 0.09, glide: 320, lp: 1400 });
      tone(311, t + 0.1, 0.17, { type: 'sawtooth', vol: 0.095, glide: 210, lp: 1100 });
    },

    shuffle() {
      const t = now();
      for (let i = 0; i < 18; i++) {
        noise(t + i * 0.028, 0.038, { f: 1900 + i * 140 + Math.random() * 900, q: 1.2, vol: 0.1 });
      }
      tone(600, t + 0.1, 0.35, { type: 'sine', vol: 0.035, glide: 1400 });
    },

    deal(n = 7, gap = 0.04) {
      playSeq(VARIANTS.deal.seq(n, gap));
    },

    hint() {
      const t = now();
      bell(1318.5, t, 0.38, 0.095, A.sfxBus, false, true);
      bell(1760, t + 0.075, 0.44, 0.095, A.sfxBus, false, true);
      bell(2093, t + 0.15, 0.48, 0.065, A.sfxBus, false, true);
    },

    click() {
      const t = now();
      tone(920, t, 0.052, { type: 'triangle', vol: 0.08, glide: 1480 });
      tone(2200, t + 0.005, 0.028, { type: 'sine', vol: 0.03 });
    },

    undo() {
      const t = now();
      tone(820, t, 0.13, { vol: 0.11, glide: 420, type: 'triangle' });
      noise(t, 0.1, { f: 2800, fEnd: 900, q: 1.0, vol: 0.06, a: 0.03 });
    },

    recycle() {
      const t = now();
      noise(t, 0.22, { f: 1400, fEnd: 3800, q: 0.7, vol: 0.11, a: 0.06 });
      tone(380, t, 0.22, { vol: 0.08, glide: 980, type: 'triangle' });
      tone(1180, t + 0.19, 0.055, { type: 'sine', vol: 0.06, glide: 1560 });
    },

    nya() {
      const t = now();
      const o = A.ctx.createOscillator(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
      const lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      o.type = 'sawtooth';
      f.type = 'bandpass';
      f.frequency.setValueAtTime(1500, t);
      f.Q.value = 1.4;
      const base = 540 + Math.random() * 120;
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.6, t + 0.09);
      o.frequency.linearRampToValueAtTime(base * 1.1, t + 0.4);
      lfo.frequency.setValueAtTime(7, t);
      lg.gain.setValueAtTime(22, t);
      lfo.connect(lg);
      lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
      g.gain.setValueAtTime(0.28, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(f);
      f.connect(g);
      g.connect(A.sfxBus);
      o.start(t);
      lfo.start(t);
      o.stop(t + 0.48);
      lfo.stop(t + 0.48);
    },

    lose() {
      const t = now();
      [67, 64, 62, 59, 55].forEach((m, i) => {
        tone(mtof(m), t + i * 0.19, 0.4, { type: 'triangle', vol: 0.11, a: 0.015 });
      });
      bell(mtof(48), t + 0.96, 1.2, 0.07, A.sfxBus, false, true);
    },

    win() {
      const t = now();
      // Grand Prism Victory fanfare!
      noise(t, 0.16, { ft: 'bandpass', f: 1600, fEnd: 7200, q: 1.4, vol: 0.11, a: 0.04 });
      tone(160, t + 0.12, 0.28, { vol: 0.25, glide: 42, glideT: 0.2 });

      [72, 76, 79, 83, 84, 86, 88, 91].forEach((m, i) => {
        const nt = t + 0.08 + i * 0.055;
        supersaw(mtof(m), nt, 0.16, { vol: 0.07, lp: 7600, spread: 15, sfxSend: true });
        bell(mtof(m), nt, 0.36, 0.085, A.sfxBus, false, true);
      });

      // IV -> V -> I triumphant synth cadence (Fmaj7 -> G6 -> Cmaj9)
      chordStab([65, 69, 72, 76, 84], t + 0.54, 0.26, {
        type: 'sawtooth', detune: 15, vol: 0.075, lp: 7800, lpEnd: 3000, sfxSend: true
      });
      chordStab([67, 71, 74, 79, 86], t + 0.80, 0.26, {
        type: 'sawtooth', detune: 15, vol: 0.08, lp: 8200, lpEnd: 3200, sfxSend: true
      });
      tone(150, t + 1.06, 0.34, { vol: 0.26, glide: 40, glideT: 0.24 });
      chordStab([60, 67, 72, 76, 79, 84, 91], t + 1.06, 1.35, {
        type: 'sawtooth', detune: 18, vol: 0.08, lp: 9200, lpEnd: 2400, a: 0.015, sfxSend: true
      });

      const starNotes = [84, 88, 91, 96, 98, 100, 96, 91, 96, 100, 103, 108];
      for (let i = 0; i < starNotes.length; i++) {
        bell(mtof(Math.min(104, starNotes[i])), t + 1.1 + i * 0.075, 0.42, 0.065, A.sfxBus, false, true);
      }
    }
  };

  // Backwards-compatible aliases
  for (const [alias, name] of Object.entries(ALIASES)) sfx[alias] = sfx[name];

  return { sfx, parts, now };
}
