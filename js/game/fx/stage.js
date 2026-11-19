/* Slopitaire — the dynamic stage backdrop (#bgCanvas) and the combo timer loop. */
'use strict';

const StageBG = (() => {
  const cv = $('#bgCanvas'), cx = cv ? cv.getContext('2d') : null;
  const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const PALETTES = {
    prism:     { a: [44, 232, 162],  b: [255, 182, 56],  acc: [255, 225, 105], dark: true },
    night:     { a: [157, 140, 255], b: [255, 142, 110], acc: [196, 181, 255], dark: true },
    sakura:    { a: [255, 92, 138],  b: [46, 196, 182],  acc: [255, 143, 177], dark: false },
    ramune:    { a: [41, 121, 255],  b: [255, 171, 0],   acc: [92, 164, 255],  dark: false },
    matcha:    { a: [31, 184, 121],  b: [255, 127, 80],  acc: [78, 214, 154],  dark: false },
    cafe:      { a: [232, 165, 84],  b: [217, 117, 86],  acc: [255, 216, 138], dark: true },
    fantasy:   { a: [242, 193, 78],  b: [75, 227, 214],  acc: [190, 148, 255], dark: true },
    autumn:    { a: [217, 135, 24],  b: [196, 58, 39],   acc: [242, 168, 41],  dark: false },
    abyss:     { a: [54, 226, 255],  b: [255, 106, 168], acc: [110, 243, 255], dark: true },
    synthwave: { a: [255, 82, 179],  b: [255, 158, 61],  acc: [61, 232, 245],  dark: true },
    frost:     { a: [9, 116, 144],   b: [201, 63, 93],   acc: [121, 202, 224], dark: false },
    rainy:     { a: [110, 195, 240], b: [242, 185, 75],  acc: [166, 220, 255], dark: true },
  };
  const initBase = PALETTES[typeof settings !== 'undefined' ? settings.theme : 'prism'] || PALETTES.prism;
  let pal = { a: initBase.a, b: initBase.b, acc: initBase.acc, hi: initBase.acc, dark: initBase.dark };
  let W = 0, H = 0, dpr = 1, raf = null, lastWall = Date.now(), hiddenAt = 0, resizeRaf = 0;
  // The backdrop drifts slowly, so it is redrawn at ~30 fps instead of every display refresh (60–144 Hz):
  // each redraw composites several full-screen layers. The combo timer still updates every frame.
  // Battery saver (perfLite) drops it to ~20 fps on a 1x canvas: the glows are soft, so the lower resolution barely shows.
  const STAGE_FRAME_MS = 1000 / 30, STAGE_FRAME_MS_LITE = 1000 / 20;
  const frameMs = () => (perfLite() ? STAGE_FRAME_MS_LITE : STAGE_FRAME_MS);
  let stageAccMs = STAGE_FRAME_MS;
  let timeSec = 0, pulseBoost = 0, pulseRGB = initBase.a;
  // Calm ambient backdrop: circuit-board traces for classic themes or a bespoke StageScenes renderer for themed worlds.
  let traces = [], staticLayer = null, tracesKey = '';
  let curScene = 'circuit', sceneState = null, sceneKey = '';
  let glowA = null, glowB = null, glowPulse = null, glowPulseKey = '';
  const haloCache = new Map();
  const lights = [];

  function makeRadialCanvas(size, rgb) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
    gr.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }
  function haloFor(rgb) {
    const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
    let c = haloCache.get(key);
    if (!c) {
      if (haloCache.size > 16) haloCache.clear();
      c = makeRadialCanvas(128, rgb);
      haloCache.set(key, c);
    }
    return c;
  }
  function buildGlows() {
    glowA = makeRadialCanvas(256, pal.a);
    glowB = makeRadialCanvas(256, pal.b);
    glowPulse = makeRadialCanvas(256, pulseRGB);
    glowPulseKey = `${pulseRGB[0]},${pulseRGB[1]},${pulseRGB[2]}`;
    haloCache.clear();
    haloFor(pal.a);
    haloFor(pal.b);
    haloFor(pal.acc);
    if (pal.hi) haloFor(pal.hi);
  }

  function parseRGB(str, fallback) {
    if (!str) return fallback;
    const s = str.trim();
    const m6 = /^#([0-9a-f]{6})$/i.exec(s);
    if (m6) { const n = parseInt(m6[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    const m3 = /^#([0-9a-f]{3})$/i.exec(s);
    if (m3) { const h = m3[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]; }
    const mr = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
    if (mr) return [+mr[1], +mr[2], +mr[3]];
    return fallback;
  }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const sceneApi = { rgba, haloFor };
  const drawApi = { rgba, haloFor, glowA: null, glowB: null, dt: 0, t: 0, tier: 0, aMul: 1, isStatic: false, lite: false };

  function sceneName() {
    const raw = (typeof THEME_DEFS !== 'undefined' && THEME_DEFS[settings.theme]?.scene) || 'circuit';
    return (raw !== 'circuit' && typeof StageScenes !== 'undefined' && StageScenes[raw]) ? raw : 'circuit';
  }

  function refreshTheme() {
    const base = PALETTES[settings.theme] || PALETTES.prism;
    const cs = getComputedStyle(document.body);
    const a = parseRGB(cs.getPropertyValue('--beam-a') || cs.getPropertyValue('--accent'), base.a);
    const b = parseRGB(cs.getPropertyValue('--beam-b') || cs.getPropertyValue('--accent2'), base.b);
    const acc = parseRGB(cs.getPropertyValue('--accent'), base.acc);
    const bg = parseRGB(cs.getPropertyValue('--bg1') || cs.getPropertyValue('--bg2') || cs.getPropertyValue('--bg'), null);
    const dark = bg ? (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) / 255 < 0.45 : base.dark;
    pal = { a, b, acc, hi: base.acc, dark };
    buildGlows();
    rebuildStatic(false);
    stageAccMs = STAGE_FRAME_MS;
    if (!shouldAnimate()) renderStatic();
    ensureLoop();
  }

  // ---- circuit traces: grid runs that start straight and take occasional 45° bends, never overlapping
  function buildTraces() {
    let seed = 0x5eed1e;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const g = Math.max(34, Math.min(56, Math.min(W, H) / 14));
    const cols = Math.ceil(W / g) + 1, rows = Math.ceil(H / g) + 1;
    const used = new Set();
    const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const out = [], count = Math.round((cols * rows) / 9);
    for (let n = 0; n < count * 3 && out.length < count; n++) {
      let x = (rnd() * cols) | 0, y = (rnd() * rows) | 0;
      if (used.has(x + ',' + y)) continue;
      let d = ((rnd() * 4) | 0) * 2;
      const pts = [[x, y]], cells = [x + ',' + y];
      const len = 4 + ((rnd() * 10) | 0);
      for (let s = 0; s < len; s++) {
        if (s > 1 && rnd() < 0.28) d = (d + (rnd() < 0.5 ? 1 : 7)) % 8;
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], k = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || used.has(k) || cells.includes(k)) break;
        const last = pts[pts.length - 1], prev = pts[pts.length - 2];
        const straight = prev && last[0] - prev[0] === DIRS[d][0] && last[1] - prev[1] === DIRS[d][1];
        if (straight) { last[0] = nx; last[1] = ny; } else pts.push([nx, ny]);
        x = nx; y = ny; cells.push(k);
      }
      if (cells.length < 4) continue;
      cells.forEach((k) => used.add(k));
      const p = pts.map(([px, py]) => [px * g, py * g]);
      const segs = []; let total = 0;
      for (let i = 1; i < p.length; i++) { const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); segs.push(l); total += l; }
      out.push({ p, segs, total, alt: rnd() < 0.5 });
    }
    traces = out;
  }
  function prepStaticLayer() {
    staticLayer = staticLayer || document.createElement('canvas');
    staticLayer.width = Math.max(1, Math.floor(W * dpr));
    staticLayer.height = Math.max(1, Math.floor(H * dpr));
    const t = staticLayer.getContext('2d');
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    t.clearRect(0, 0, W, H);
    return t;
  }
  function paintTraces() {
    if (!cv || !W || !H) return;
    const t = prepStaticLayer();
    t.lineCap = 'round'; t.lineJoin = 'round';
    const k = pal.dark ? 1 : 0.75;
    for (const tr of traces) {
      const rgb = tr.alt ? pal.b : pal.a;
      t.strokeStyle = rgba(rgb, 0.11 * k); t.lineWidth = 1.4;
      t.beginPath(); t.moveTo(tr.p[0][0], tr.p[0][1]);
      for (let i = 1; i < tr.p.length; i++) t.lineTo(tr.p[i][0], tr.p[i][1]);
      t.stroke();
      for (const end of [tr.p[0], tr.p[tr.p.length - 1]]) {   // solder pads
        t.strokeStyle = rgba(rgb, 0.18 * k); t.lineWidth = 1.2;
        t.beginPath(); t.arc(end[0], end[1], 3.2, 0, Math.PI * 2); t.stroke();
      }
    }
  }
  function rebuildStatic(forceInit) {
    if (!cv || !W || !H) return;
    const name = sceneName(), lite = perfLite();
    curScene = name;
    if (name === 'circuit') {
      sceneState = null; sceneKey = '';
      const tk = `${W}x${H}`;
      if (forceInit || tracesKey !== tk || !traces.length) { buildTraces(); lights.length = 0; tracesKey = tk; }
      paintTraces();
      return;
    }
    const sc = StageScenes[name], sk = `${name}:${W}x${H}:${lite ? 1 : 0}`;
    if (forceInit || sceneKey !== sk || !sceneState) {
      sceneState = sc.init(W, H, lite);
      sceneKey = sk;
    }
    sc.paintStatic(prepStaticLayer(), W, H, pal, sceneState, sceneApi);
  }
  function pointOn(tr, dist) {
    let d = Math.max(0, Math.min(tr.total, dist));
    for (let i = 0; i < tr.segs.length; i++) {
      if (d <= tr.segs[i] || i === tr.segs.length - 1) {
        const f = tr.segs[i] ? Math.min(1, d / tr.segs[i]) : 0, a = tr.p[i], b = tr.p[i + 1];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
      d -= tr.segs[i];
    }
    return tr.p[0];
  }
  function spawnLight(rgb) {
    if (!traces.length || lights.length > 24) return;
    const tr = traces[(Math.random() * traces.length) | 0];
    lights.push({ tr, d: 0, speed: 38 + Math.random() * 34, rgb: rgb || (tr.alt ? pal.b : pal.a), rev: Math.random() < 0.5 });
  }

  function resize() {
    if (!cv || !cx) return;
    dpr = perfLite() ? 1 : Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.max(1, Math.floor(W * dpr));
    cv.height = Math.max(1, Math.floor(H * dpr));
    rebuildStatic(true);
    stageAccMs = STAGE_FRAME_MS;  // resizing cleared the canvas: redraw on the next frame
    if (!shouldAnimate()) renderStatic();
  }

  function shouldAnimate() {
    return !!(cv && cx && settings.bgFx && settings.anim !== 'off' && !reduceMQ.matches && !document.hidden);
  }
  function needsComboTick() {
    return !!(G && G.chain > 0 && !G.won && !G.lost && !document.hidden);
  }

  // a game event (card home, combo milestone, ...): a soft glow plus a reactive scene pulse
  function pulse(colorHex, power = 0.6) {
    const rgb = colorHex ? parseRGB(colorHex, pal.a) : (Math.random() < 0.5 ? pal.a : pal.b);
    pulseBoost = Math.min(1, Math.max(pulseBoost, power * 0.7));
    pulseRGB = rgb;
    const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
    if (key !== glowPulseKey) {
      glowPulseKey = key;
      glowPulse = makeRadialCanvas(256, rgb);
    }
    haloFor(rgb);
    if (!shouldAnimate()) return;
    if (curScene === 'circuit') {
      spawnLight(rgb);
      if (power >= 0.8) spawnLight(rgb);
    } else if (sceneState && typeof StageScenes !== 'undefined' && StageScenes[curScene]?.pulse) {
      StageScenes[curScene].pulse(sceneState, rgb, power, W, H, perfLite());
    }
  }

  function tickCombo(now, dtMs) {
    if (!G || G.chain <= 0 || G.won || G.lost) return;
    if (busy || overlayOpen() || document.hidden) {
      G.chainUntil += dtMs;
      return;
    }
    const rem = G.chainUntil - now;
    const ratio = G.chainDur > 0 ? Math.max(0, Math.min(1, rem / G.chainDur)) : 0;
    const fill = DOM.comboFill;
    if (fill) fill.style.transform = `scaleX(${ratio.toFixed(3)})`;
    if (G.chain >= 8 && ratio > 0 && ratio < 0.22 && !G.warnedChain) {
      G.warnedChain = true;
      Sound.sfx.warning?.();
      DOM.comboHud?.classList.add('danger');
    }
    if (rem <= 0) breakChain('timeout');
  }

  function drawStage(dt, isStatic) {
    if (!cv || !cx || W <= 0 || H <= 0) return;
    if (!glowA) buildGlows();
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    const { tier } = tierOf(G ? G.chain : 0);
    const aMul = (!settings.bgFx ? 0.4 : 1) * (pal.dark ? 1 : 0.62);
    if (!isStatic) { timeSec += dt; pulseBoost = Math.max(0, pulseBoost - dt * 0.9); }

    cx.save();
    cx.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over';

    // 1) two soft glows drifting on a ~40 s loop, breathing very slowly
    const R = Math.max(W, H) * 0.62, R2 = R * 2;
    const ax = W * (0.24 + 0.06 * Math.sin(timeSec * 0.15));
    const ay = H * (0.30 + 0.05 * Math.cos(timeSec * 0.12));
    const aa = 0.13 + 0.025 * Math.sin(timeSec * 0.2);
    const bx = W * (0.78 + 0.05 * Math.cos(timeSec * 0.13));
    const by = H * (0.72 + 0.05 * Math.sin(timeSec * 0.11));
    const ba = 0.11 + 0.025 * Math.cos(timeSec * 0.17);
    cx.globalAlpha = Math.max(0, Math.min(1, (aa + tier * 0.012) * aMul));
    cx.drawImage(glowA, ax - R, ay - R, R2, R2);
    cx.globalAlpha = Math.max(0, Math.min(1, (ba + tier * 0.012) * aMul));
    cx.drawImage(glowB, bx - R, by - R, R2, R2);
    if (pulseBoost > 0.02 && glowPulse) {
      const pr = R * 0.8, pr2 = pr * 2;
      cx.globalAlpha = Math.max(0, Math.min(1, pulseBoost * 0.12 * aMul));
      cx.drawImage(glowPulse, W / 2 - pr, H / 2 - pr, pr2, pr2);
    }
    cx.globalAlpha = 1;

    // 2) the static backdrop layer (circuit pattern or scene background)
    if (staticLayer) { cx.globalAlpha = settings.bgFx ? 1 : 0.6; cx.drawImage(staticLayer, 0, 0, W, H); cx.globalAlpha = 1; }

    // 3) animated scene elements; subtle boost as the combo climbs
    if (curScene === 'circuit') {
      if (settings.bgFx && !isStatic) {
        const want = perfLite() ? 3 + tier : 6 + tier * 2;
        if (lights.length < want && Math.random() < dt * 1.2) spawnLight();
        for (let i = lights.length - 1; i >= 0; i--) {
          const L = lights[i];
          L.d += dt * L.speed;
          if (L.d >= L.tr.total) { lights.splice(i, 1); continue; }
          const fade = Math.min(1, L.d / 30, (L.tr.total - L.d) / 30);
          const at = (dd) => pointOn(L.tr, L.rev ? L.tr.total - dd : dd);
          for (let k = 3; k >= 1; k--) {                                 // short fading tail
            const dd = L.d - k * 7;
            if (dd < 0) continue;
            const [x, y] = at(dd);
            cx.fillStyle = rgba(L.rgb, (0.16 / k) * fade * aMul);
            cx.beginPath(); cx.arc(x, y, 1.8, 0, Math.PI * 2); cx.fill();
          }
          const [hx, hy] = at(L.d);
          cx.globalAlpha = Math.max(0, Math.min(1, 0.3 * fade * aMul));
          cx.drawImage(haloFor(L.rgb), hx - 11, hy - 11, 22, 22);
          cx.globalAlpha = 1;
          cx.fillStyle = rgba(L.rgb, 0.75 * fade * aMul);
          cx.beginPath(); cx.arc(hx, hy, 2.2, 0, Math.PI * 2); cx.fill();
        }
      }
    } else if (settings.bgFx && sceneState && typeof StageScenes !== 'undefined' && StageScenes[curScene]) {
      drawApi.glowA = glowA;
      drawApi.glowB = glowB;
      drawApi.dt = isStatic ? 0 : dt;
      drawApi.t = timeSec;
      drawApi.tier = tier;
      drawApi.aMul = aMul;
      drawApi.isStatic = !!isStatic;
      drawApi.lite = perfLite();
      StageScenes[curScene].draw(cx, W, H, pal, sceneState, drawApi);
    }
    cx.restore();
  }

  function renderStatic() {
    drawStage(0, true);
  }

  function loop() {
    raf = null;
    if (document.hidden) return;
    const now = Date.now();
    const dtMs = Math.max(0, now - lastWall);
    lastWall = now;
    tickCombo(now, dtMs);
    const anim = shouldAnimate();
    if (anim) {
      stageAccMs += dtMs;
      if (stageAccMs >= frameMs() - 1) {
        drawStage(Math.min(0.05, stageAccMs / 1000), false);
        stageAccMs = 0;
      }
    }
    if (anim || needsComboTick()) raf = requestAnimationFrame(loop);
  }

  function ensureLoop() {
    if (document.hidden) {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      return;
    }
    if (!shouldAnimate() && !needsComboTick()) {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      return;
    }
    if (!raf) {
      lastWall = Date.now();
      stageAccMs = STAGE_FRAME_MS;
      raf = requestAnimationFrame(loop);
    }
  }

  function onVisibility() {
    const now = Date.now();
    if (document.hidden) {
      hiddenAt = now;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    } else {
      if (hiddenAt && G && G.chain > 0 && !G.won && !G.lost) {
        G.chainUntil += Math.max(0, now - hiddenAt);
      }
      hiddenAt = 0;
      lastWall = now;
      if (!shouldAnimate()) renderStatic();
      ensureLoop();
    }
  }

  resize();
  // a window drag fires many resize events; rebuild the circuit pattern once per frame at most
  addEventListener('resize', () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; resize(); });
  });
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', () => { if (!shouldAnimate()) renderStatic(); ensureLoop(); });
  return { refreshTheme, resize, pulse, ensureLoop, onVisibility, renderStatic };
})();
