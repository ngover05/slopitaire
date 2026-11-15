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
  function burst(x, y, n = 16) {
    if (settings.anim === 'off') return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.6 + Math.random() * 3.8;
      add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, g: 0.09, life: 0, max: 35 + Math.random() * 25,
        size: 3 + Math.random() * 4.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        shape: pick(['diamond', 'star', 'heart']), color: pick(COLORS) });
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
  function shape(s, r) {
    cx.beginPath();
    if (s === 'circle') cx.arc(0, 0, Math.max(0.5, r * 0.55), 0, Math.PI * 2);
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
      p.life++; p.vy += p.g;
      if (p.sway !== undefined) { p.sway += 0.05; p.x += Math.sin(p.sway) * 0.9; p.vy = Math.min(p.vy, 3); }
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const alpha = Math.min(1, (p.max - p.life) / 30);
      if (alpha <= 0 || p.y > H + 40) continue;
      cx.save(); cx.globalAlpha = alpha; cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.color;
      shape(p.shape, p.size); cx.restore();
      parts[w++] = p;
    }
    parts.length = w;
    if (w) raf = requestAnimationFrame(loop);
    else { cx.clearRect(0, 0, W, H); raf = null; }
  }
  return { burst, hearts, celebrate, resize };
})();
function sparkleAt(el) {
  const r = el.getBoundingClientRect();
  FX.burst(r.left + r.width / 2, r.top + r.height / 2);
}
