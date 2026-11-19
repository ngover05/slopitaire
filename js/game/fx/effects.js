/* Slopitaire — card & board effects: sparkles, bursts and the victory celebration. */
'use strict';

const FX = (() => {
  const cv = $('#fx'), cx = cv.getContext('2d');
  let parts = [], raf = null, W = 0, H = 0, dpr = 1;
  const COLORS = ['#2ce8a2', '#ffb638', '#ffe169', '#4dffb5', '#ff8e6e', '#9d8cff', '#ff5c8a', '#ffffff'];
  function resize() {
    dpr = perfLite() ? 1 : Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
  }
  resize(); addEventListener('resize', resize);
  function add(p) { parts.push(p); if (!raf) raf = requestAnimationFrame(loop); }
  const HEART_COLORS = ['#ff5c8a', '#ff8fab', '#ffe169', '#ffb638', '#4dffb5', '#ffffff'];
  const RARITY_COLORS = {
    ssr: ['#ffe169', '#ffb638', '#ffffff', '#ff5c8a', '#2ce8a2', '#c4b5ff'],
    sr: ['#c4b5ff', '#9d8cff', '#2ce8a2', '#ff8fab', '#ffffff'],
    r: ['#56ccf2', '#2ce8a2', '#9ef8d8', '#ffffff'],
  };
  function burst(x, y, n = 16) {
    if (settings.anim === 'off') return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.6 + Math.random() * 3.8;
      add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, g: 0.09, life: 0, max: 35 + Math.random() * 25,
        size: 3 + Math.random() * 4.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        shape: pick(['diamond', 'star', 'heart']), color: pick(COLORS) });
    }
  }
  function supernova(x, y, rarity = 'ssr') {
    if (settings.anim === 'off') return;
    const lite = perfLite();
    const pal = RARITY_COLORS[rarity] || RARITY_COLORS.r;
    const ringDefs = rarity === 'ssr'
      ? [[16, 22, 2.8, '#ffffff', 20], [12, 16.5, 2.4, '#ffe169', 24], [8, 11.5, 2.0, '#ff5c8a', 26]]
      : rarity === 'sr'
        ? [[14, 17.5, 2.4, '#c4b5ff', 21], [9, 12, 1.8, '#2ce8a2', 24]]
        : [[10, 14, 2.0, '#56ccf2', 18]];
    for (const [r0, vr, lw, col, max] of ringDefs) {
      add({ x, y, vx: 0, vy: 0, g: 0, life: 0, max, size: r0, rot: 0, vr, lw, maxA: 0.68, drag: 0.96, shape: 'ring', color: col });
    }
    const rays = rarity === 'ssr' ? (lite ? 22 : 42) : rarity === 'sr' ? (lite ? 14 : 26) : (lite ? 8 : 14);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
      const s = (rarity === 'ssr' ? 5.5 : 4.2) + Math.random() * (rarity === 'ssr' ? 9.5 : 6.2);
      add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.02, drag: 0.94, life: 0, max: 26 + Math.random() * 20,
        size: 3.6 + Math.random() * 4.4, rot: a, vr: 0, shape: 'streak', color: pick(pal) });
    }
    const sparks = rarity === 'ssr' ? (lite ? 36 : 72) : rarity === 'sr' ? (lite ? 22 : 40) : (lite ? 12 : 22);
    for (let i = 0; i < sparks; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.8 + Math.random() * (rarity === 'ssr' ? 8.2 : 5.4);
      add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.8, g: 0.08, drag: 0.985, life: 0,
        max: 42 + Math.random() * 34, size: 3.5 + Math.random() * (rarity === 'ssr' ? 6 : 4.5),
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.32,
        shape: pick(['star', 'diamond', 'star', 'heart']), color: pick(pal) });
    }
  }
  function fountain(rarity = 'ssr') {
    if (settings.anim === 'off') return;
    const pal = RARITY_COLORS[rarity] || COLORS;
    const perSide = perfLite() ? 22 : 44;
    for (const side of [-1, 1]) {
      const ox = side < 0 ? W * 0.14 : W * 0.86;
      const oy = H + 10;
      const baseAng = side < 0 ? -Math.PI * 0.36 : -Math.PI * 0.64;
      for (let i = 0; i < perSide; i++) {
        const a = baseAng + (Math.random() - 0.5) * 0.42;
        const s = 8.5 + Math.random() * 8.5;
        add({ x: ox + (Math.random() - 0.5) * 28, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          g: 0.15, drag: 0.992, life: -Math.floor(Math.random() * 16), max: 72 + Math.random() * 38,
          size: 4.2 + Math.random() * 5.8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.26,
          shape: pick(['star', 'diamond', 'heart', 'petal']), color: pick(pal) });
      }
    }
  }
  function hearts(x, y, n = 12) {
    if (settings.anim === 'off') return;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1, s = 1.3 + Math.random() * 2.8;
      add({ x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(a) * s * 0.75, vy: Math.sin(a) * s - 0.9, g: -0.015, life: 0, max: 42 + Math.random() * 26,
        size: 4.2 + Math.random() * 4.8, rot: (Math.random() - 0.5) * 0.5, vr: (Math.random() - 0.5) * 0.08,
        sway: Math.random() * Math.PI * 2, shape: i % 4 === 3 ? 'star' : 'heart', color: pick(HEART_COLORS) });
    }
  }
  function celebrate() {
    const n = settings.anim === 'off' ? 60 : perfLite() ? 110 : 210;
    for (let i = 0; i < n; i++) {
      add({ x: Math.random() * W, y: -20 - Math.random() * H * 0.8, vx: (Math.random() - 0.5) * 2.2, vy: 1 + Math.random() * 2.6,
        g: 0.02, life: 0, max: 420 + Math.random() * 240, size: 5 + Math.random() * 7, rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.16, shape: pick(['diamond', 'star', 'heart', 'petal', 'circle']), color: pick(COLORS),
        sway: Math.random() * Math.PI * 2 });
    }
  }
  function shape(s, r, lw, alpha) {
    cx.beginPath();
    if (s === 'ring') {
      cx.lineWidth = Math.max(1, (lw || 3) * alpha);
      cx.arc(0, 0, Math.max(1, r), 0, Math.PI * 2);
      cx.stroke();
      return;
    }
    if (s === 'streak') {
      cx.moveTo(r * 2.8, 0); cx.lineTo(0, r * 0.38); cx.lineTo(-r * 2.1, 0); cx.lineTo(0, -r * 0.38);
      cx.closePath();
    } else if (s === 'circle') cx.arc(0, 0, Math.max(0.5, r * 0.55), 0, Math.PI * 2);
    else if (s === 'diamond') {
      cx.moveTo(0, -r * 1.15); cx.lineTo(r * 0.72, 0); cx.lineTo(0, r * 1.15); cx.lineTo(-r * 0.72, 0);
      cx.closePath();
    } else if (s === 'star') {
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; cx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      cx.closePath();
    } else if (s === 'heart') {
      cx.moveTo(0, r * 0.9);
      cx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.35);
      cx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.9);
    } else cx.ellipse(0, 0, Math.max(0.5, r), Math.max(0.5, r * 0.55), 0, 0, Math.PI * 2);
    cx.fill();
  }
  function loop() {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    let w = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life++;
      if (p.life < 0) { parts[w++] = p; continue; }
      if (p.shape === 'ring') {
        p.size += p.vr;
        if (p.drag) p.vr *= p.drag;
      } else {
        p.vy += p.g;
        if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
        if (p.sway !== undefined) { p.sway += 0.05; p.x += Math.sin(p.sway) * 0.9; p.vy = Math.min(p.vy, 3); }
        p.x += p.vx; p.y += p.vy;
        p.rot = p.shape === 'streak' ? Math.atan2(p.vy, p.vx) : p.rot + p.vr;
      }
      const fadeSpan = p.shape === 'ring' || p.shape === 'streak' ? 16 : 30;
      const alpha = Math.min(p.maxA || 1, (p.max - p.life) / fadeSpan);
      if (alpha <= 0 || p.y > H + 56) continue;
      cx.save(); cx.globalAlpha = alpha; cx.translate(p.x, p.y); cx.rotate(p.rot);
      cx.fillStyle = p.color; cx.strokeStyle = p.color;
      shape(p.shape, p.size, p.lw, alpha); cx.restore();
      parts[w++] = p;
    }
    parts.length = w;
    if (w) raf = requestAnimationFrame(loop);
    else { cx.clearRect(0, 0, W, H); raf = null; }
  }
  return { burst, supernova, fountain, hearts, celebrate, resize };
})();
function sparkleAt(el, rarity) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (rarity) FX.supernova(cx, cy, rarity);
  else FX.burst(cx, cy);
}
