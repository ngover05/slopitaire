/* Slopitaire — procedural backdrop scenes for non-circuit themes (consumed by StageBG). */
'use strict';

const StageScenes = (() => {
  const TAU = Math.PI * 2, WHITE = [255, 255, 255];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lcg = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const mk = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
  const pick = (pal, ci) => (ci === 0 ? pal.a : ci === 1 ? pal.b : pal.hi);
  const pushCap = (arr, item, max = 6) => { if (arr.length >= max) arr.shift(); arr.push(item); };
  const edgeX = (W, a, b, side = Math.random() < 0.5) => W * (side ? a + Math.random() * b : 1 - a - Math.random() * b);

  function stepAge(arr, dt, isStatic, fn) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      if (!isStatic) it.age += dt;
      if (it.age < 0) continue;
      const p = it.age / it.dur;
      if (p >= 1) arr.splice(i, 1); else fn(it, p);
    }
  }
  function halo(cx, img, x, y, rx, ry, a) {
    if (a <= 0.002) return;
    cx.globalAlpha = clamp(a, 0, 1);
    cx.drawImage(img, x - rx, y - ry, rx * 2, ry * 2);
  }
  function dot(cx, x, y, r, col) { cx.fillStyle = col; cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fill(); }
  function ring(cx, x, y, r, col, lw = 1.2) { cx.strokeStyle = col; cx.lineWidth = lw; cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.stroke(); }
  function star4(cx, x, y, s, col) {
    cx.strokeStyle = col; cx.lineWidth = 1.1;
    cx.beginPath(); cx.moveTo(x - s, y); cx.lineTo(x + s, y); cx.moveTo(x, y - s); cx.lineTo(x, y + s); cx.stroke();
    dot(cx, x, y, Math.max(1, s * 0.24), col);
  }
  function beam(cx, x0, bw, dx, h, c0, c1, c2) {
    const gr = cx.createLinearGradient(x0, 0, x0 + dx, h);
    gr.addColorStop(0, c0); gr.addColorStop(0.6, c1); gr.addColorStop(1, c2);
    cx.fillStyle = gr;
    cx.beginPath(); cx.moveTo(x0, 0); cx.lineTo(x0 + bw, 0); cx.lineTo(x0 + bw + dx, h); cx.lineTo(x0 + dx, h); cx.closePath(); cx.fill();
  }
  function poly(cx, r, sides, rot) {
    cx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i * TAU) / sides;
      if (i) cx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else cx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    cx.stroke();
  }
  function astrolabe(cx, x, y, R, ang, rgb, nodeRgb, ticks, a, api) {
    cx.save(); cx.translate(x, y); cx.rotate(ang);
    ring(cx, 0, 0, R, api.rgba(rgb, a), 1.15);
    ring(cx, 0, 0, R * 0.86, api.rgba(rgb, a * 0.78), 0.9);
    ring(cx, 0, 0, R * 0.56, api.rgba(rgb, a * 0.78), 0.9);
    cx.beginPath();
    for (let i = 0; i < ticks; i++) {
      const t = (i * TAU) / ticks, c = Math.cos(t), s = Math.sin(t), k = i % 3 ? 0.89 : 0.82;
      cx.moveTo(c * R * k, s * R * k); cx.lineTo(c * R, s * R);
    }
    cx.stroke();
    cx.strokeStyle = api.rgba(rgb, a * 0.65);
    if (ticks >= 20) { poly(cx, R * 0.84, 3, 0); poly(cx, R * 0.84, 3, Math.PI); }
    else { poly(cx, R * 0.84, 6, 0); poly(cx, R * 0.54, 4, Math.PI / 4); }
    const nodes = ticks >= 20 ? 6 : 4, img = api.haloFor(nodeRgb);
    for (let i = 0; i < nodes; i++) {
      const t = (i * TAU) / nodes, nx = Math.cos(t) * R * 0.86, ny = Math.sin(t) * R * 0.86;
      halo(cx, img, nx, ny, 11, 11, a * 2.1); cx.globalAlpha = 1;
      dot(cx, nx, ny, 2.1, api.rgba(nodeRgb, a * 2.6));
    }
    cx.restore(); cx.globalAlpha = 1;
  }
  function iceFern(cx, x, y, ang, len, depth, rgb, api) {
    if (depth <= 0 || len < 6) return;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    cx.strokeStyle = api.rgba(rgb, 0.08 + depth * 0.025); cx.lineWidth = depth * 0.55;
    cx.beginPath(); cx.moveTo(x, y); cx.lineTo(ex, ey); cx.stroke();
    cx.strokeStyle = api.rgba(WHITE, 0.1 + depth * 0.03); cx.lineWidth = depth * 0.25;
    cx.beginPath(); cx.moveTo(x, y); cx.lineTo(ex, ey); cx.stroke();
    for (let i = 1; i <= 3; i++) {
      const f = i * 0.27, bx = x + (ex - x) * f, by = y + (ey - y) * f, bl = len * (0.48 - i * 0.08);
      iceFern(cx, bx, by, ang + Math.PI / 3, bl, depth - 1, rgb, api);
      iceFern(cx, bx, by, ang - Math.PI / 3, bl, depth - 1, rgb, api);
    }
  }
  function crystal(cx, x, y, r, ang, stroke, core) {
    cx.strokeStyle = stroke; cx.lineWidth = 1.05; cx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = ang + (i * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a);
      cx.moveTo(x - c * r, y - s * r); cx.lineTo(x + c * r, y + s * r);
      if (r >= 7) {
        const b = r * 0.58, bl = r * 0.26;
        for (const d of [-1, 1]) {
          const px = x + d * c * b, py = y + d * s * b, base = a + (d < 0 ? Math.PI : 0);
          cx.moveTo(px, py); cx.lineTo(px + Math.cos(base + Math.PI / 3) * bl, py + Math.sin(base + Math.PI / 3) * bl);
          cx.moveTo(px, py); cx.lineTo(px + Math.cos(base - Math.PI / 3) * bl, py + Math.sin(base - Math.PI / 3) * bl);
        }
      }
    }
    cx.stroke(); dot(cx, x, y, 1.4, core);
  }
  function ellipRipple(cx, x, y, r, col, col2) {
    cx.strokeStyle = col; cx.lineWidth = 1.15;
    cx.beginPath(); cx.ellipse(x, y, r, r * 0.45, 0, 0, TAU); cx.stroke();
    if (r > 12) { cx.strokeStyle = col2; cx.beginPath(); cx.ellipse(x, y, r * 0.65, r * 0.2925, 0, 0, TAU); cx.stroke(); }
  }

  const cafe = {
    init(W, H, lite) {
      const rnd = lcg(0xcafe01);
      return {
        orbs: mk(lite ? 8 : 16, () => ({ x: rnd() * W, y: rnd() * H, r: 18 + rnd() * 38, vy: -(4 + rnd() * 6), phase: rnd() * TAU, amp: 8 + rnd() * 14, ci: (rnd() * 3) | 0, a: 0.06 + rnd() * 0.08 })),
        steams: (lite ? [0.07, 0.93] : [0.05, 0.12, 0.88, 0.95]).map((fx, i) => ({ x: fx * W, yBase: H * (0.72 + (i % 2) * 0.16), h: H * (0.34 + rnd() * 0.18), phase: rnd() * TAU, speed: 0.45 + rnd() * 0.25 })),
        ripples: [],
      };
    },
    paintStatic(cx, W, H, pal, _st, api) {
      const cw = Math.min(W * 0.2, 210), ch = H * 0.62;
      for (const fx of [0.16, 0.5, 0.84]) {
        const lx = W * fx;
        cx.strokeStyle = api.rgba(pal.a, 0.2); cx.lineWidth = 1.2;
        cx.beginPath(); cx.moveTo(lx, 0); cx.lineTo(lx, 18); cx.stroke();
        const gr = cx.createLinearGradient(lx, 18, lx, ch);
        gr.addColorStop(0, api.rgba(pal.hi, 0.065)); gr.addColorStop(0.55, api.rgba(pal.a, 0.025)); gr.addColorStop(1, api.rgba(pal.a, 0));
        cx.fillStyle = gr;
        cx.beginPath(); cx.moveTo(lx - 10, 18); cx.lineTo(lx + 10, 18); cx.lineTo(lx + cw, ch); cx.lineTo(lx - cw, ch); cx.closePath(); cx.fill();
        dot(cx, lx, 18, 2.3, api.rgba(pal.hi, 0.45));
      }
      for (const [rx, ry] of [[W * 0.08, H * 0.88], [W * 0.92, H * 0.14]]) {
        for (let i = 0; i < 4; i++) ring(cx, rx + i * 2.5, ry - i * 1.5, 34 + i * 18, api.rgba(pal.a, 0.06 - i * 0.008), 1.2);
      }
    },
    draw(cx, W, H, pal, st, api) {
      const { dt, t, tier, aMul, isStatic } = api;
      for (const o of st.orbs) {
        if (!isStatic) { o.y += o.vy * dt; if (o.y < -o.r) { o.y = H + o.r; o.x = (o.x + W * 0.37) % W; } }
        halo(cx, api.haloFor(pick(pal, o.ci)), o.x + Math.sin(t * 0.35 + o.phase) * o.amp, o.y, o.r, o.r, (o.a + tier * 0.007) * aMul);
      }
      cx.globalAlpha = 1; cx.lineWidth = 1.4;
      for (const s of st.steams) {
        cx.strokeStyle = api.rgba(pal.hi, (0.06 + tier * 0.006) * aMul); cx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const f = i / 12, x = s.x + Math.sin(f * 5.2 - t * s.speed + s.phase) * (8 + f * 12), y = s.yBase - f * s.h;
          if (i) cx.lineTo(x, y); else cx.moveTo(x, y);
        }
        cx.stroke();
      }
      stepAge(st.ripples, dt, isStatic, (rp, p) => {
        const r = 14 + p * 106, a = 0.22 * rp.power * (1 - p) * (1 - p) * aMul;
        ring(cx, rp.x, rp.y, r, api.rgba(rp.rgb, a), 1.4);
        ring(cx, rp.x, rp.y, r * 0.72, api.rgba(rp.rgb, a * 0.6), 1.1);
      });
    },
    pulse(st, rgb, power, W, H) {
      for (let i = 0; i < (power >= 0.8 ? 2 : 1); i++) {
        pushCap(st.ripples, { x: edgeX(W, 0.1, 0.2), y: H * (0.24 + Math.random() * 0.58), age: 0, dur: 1.4, rgb, power });
      }
    },
  };

  const fantasy = {
    init(W, H, lite) {
      const rnd = lcg(0xa4ca9e), want = lite ? 40 : 85, stars = [];
      for (let i = 0; i < want * 2 && stars.length < want; i++) {
        const x = rnd() * W, y = rnd() * H;
        if (x > W * 0.28 && x < W * 0.72 && y > H * 0.24 && y < H * 0.76 && rnd() < 0.65) continue;
        stars.push({ x, y, r: 0.7 + rnd() * 1.1, a: 0.14 + rnd() * 0.22, ci: (rnd() * 3) | 0 });
      }
      return {
        stars, angA: 0, angB: 0, rings: [], nextAstro: 0,
        twinkles: mk(lite ? 8 : 16, () => ({ x: rnd() * W, y: rnd() * H, s: 3 + rnd() * 2.5, phase: rnd() * TAU, speed: 0.9 + rnd() * 0.9, ci: (rnd() * 2) | 0 })),
      };
    },
    paintStatic(cx, W, H, pal, st, api) {
      for (const s of st.stars) dot(cx, s.x, s.y, s.r, api.rgba(s.ci === 2 ? WHITE : pick(pal, s.ci), s.a));
      const cr = Math.min(W, H) * 0.24;
      cx.strokeStyle = api.rgba(pal.a, 0.07); cx.lineWidth = 1;
      for (const [ax, ay, s0, s1] of [[0, 0, 0, Math.PI / 2], [W, 0, Math.PI / 2, Math.PI], [W, H, Math.PI, Math.PI * 1.5], [0, H, Math.PI * 1.5, TAU]]) {
        cx.beginPath(); cx.arc(ax, ay, cr, s0, s1); cx.stroke();
        cx.beginPath(); cx.arc(ax, ay, cr * 0.78, s0, s1); cx.stroke();
      }
    },
    draw(cx, W, H, pal, st, api) {
      const { dt, t, tier, aMul, isStatic } = api, m = Math.min(W, H);
      if (!isStatic) { st.angA += 0.045 * dt; st.angB -= 0.065 * dt; }
      const a0 = { x: W * 0.22, y: H * 0.76, r: m * 0.28 }, a1 = { x: W * 0.8, y: H * 0.26, r: m * 0.18 };
      astrolabe(cx, a0.x, a0.y, a0.r, st.angA, pal.a, pal.b, 24, (0.12 + tier * 0.015) * aMul, api);
      astrolabe(cx, a1.x, a1.y, a1.r, st.angB, pal.b, pal.a, 12, (0.11 + tier * 0.015) * aMul, api);
      for (const tw of st.twinkles) star4(cx, tw.x, tw.y, tw.s, api.rgba(tw.ci ? pal.b : pal.a, (0.28 * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * tw.speed + tw.phase))) + tier * 0.02) * aMul));
      stepAge(st.rings, dt, isStatic, (rg, p) => {
        const host = rg.which ? a1 : a0, rad = host.r * (1 + 0.35 * p), a = 0.26 * rg.power * (1 - p) * aMul;
        ring(cx, host.x, host.y, rad, api.rgba(rg.rgb, a), 1.6);
        ring(cx, host.x, host.y, rad * 0.94, api.rgba(rg.rgb, a * 0.5), 0.9);
      });
    },
    pulse(st, rgb, power) { pushCap(st.rings, { which: st.nextAstro, age: 0, dur: 1.1, rgb, power }); st.nextAstro ^= 1; },
  };

  const autumn = {
    init(W, H, lite) {
      const rnd = lcg(0xa0703a);
      return {
        mists: [{ x: W * 0.2, y: H * 0.85, rx: W * 0.36, ry: H * 0.09, vx: 4.5 }, { x: W * 0.75, y: H * 0.92, rx: W * 0.42, ry: H * 0.08, vx: -6.2 }],
        lanterns: mk(lite ? 3 : 6, (i) => ({ x: W * (i % 2 ? 0.86 + rnd() * 0.11 : 0.03 + rnd() * 0.11), y: rnd() * H, r: 16 + rnd() * 14, vy: -(5 + rnd() * 6), phase: rnd() * TAU, a: 0.22 + rnd() * 0.12 })),
        flares: [], motes: [],
      };
    },
    paintStatic(cx, W, H, pal, _st, api) {
      for (const [ox, w, ang, a] of [[-0.04, 0.14, 0.42, 0.085], [0.1, 0.16, 0.45, 0.075], [0.24, 0.13, 0.48, 0.065], [0.38, 0.11, 0.5, 0.055]]) {
        beam(cx, W * ox, W * w, Math.tan(ang) * H * 0.8, H * 0.8, api.rgba(pal.hi, a), api.rgba(pal.b, a * 0.45), api.rgba(pal.b, 0));
      }
      for (const [by, amp, freq, ph, a] of [[H * 0.86, H * 0.045, 0.0038, 0.7, 0.07], [H * 0.92, H * 0.032, 0.0052, 2.3, 0.11]]) {
        cx.fillStyle = api.rgba(pal.a, a); cx.beginPath(); cx.moveTo(0, H);
        for (let x = 0; x <= W + 24; x += 24) cx.lineTo(x, by - Math.sin(x * freq + ph) * amp - Math.cos(x * freq * 2.1 + ph * 1.4) * amp * 0.35);
        cx.lineTo(W, H); cx.closePath(); cx.fill();
      }
    },
    draw(cx, W, H, pal, st, api) {
      const { dt, t, tier, aMul, isStatic } = api, img = api.haloFor(pal.hi);
      for (const m of st.mists) {
        if (!isStatic) { m.x += m.vx * dt; if (m.vx > 0 && m.x - m.rx > W) m.x = -m.rx; else if (m.vx < 0 && m.x + m.rx < 0) m.x = W + m.rx; }
        halo(cx, img, m.x, m.y, m.rx, m.ry, (0.13 + tier * 0.01) * aMul);
      }
      for (const ln of st.lanterns) {
        if (!isStatic) { ln.y += ln.vy * dt; if (ln.y < -ln.r) ln.y = H + ln.r; }
        const lx = ln.x + Math.sin(t * 0.45 + ln.phase) * 9;
        halo(cx, img, lx, ln.y, ln.r, ln.r, (ln.a + tier * 0.015) * aMul); cx.globalAlpha = 1;
        dot(cx, lx, ln.y, 2.2, api.rgba(pal.hi, ln.a * 1.3 * aMul));
      }
      stepAge(st.flares, dt, isStatic, (fl, p) => halo(cx, img, W * 0.06, H * 0.06, W * 0.45, H * 0.42, 0.24 * fl.power * Math.sin(p * Math.PI) * aMul));
      stepAge(st.motes, dt, isStatic, (mt, p) => {
        if (!isStatic) mt.y += mt.vy * dt;
        halo(cx, api.haloFor(mt.rgb), mt.x + Math.sin(p * 6 + mt.phase) * 10, mt.y, 18, 18, 0.28 * mt.power * Math.sin(p * Math.PI) * aMul);
      });
      cx.globalAlpha = 1;
    },
    pulse(st, rgb, power, W, H) {
      pushCap(st.flares, { age: 0, dur: 1.1, power }, 3);
      pushCap(st.motes, { x: edgeX(W, 0.06, 0.18), y: H * 0.88, vy: -(28 + Math.random() * 14), age: 0, dur: 2.2, phase: Math.random() * TAU, rgb, power });
    },
  };

  const abyss = {
    init(W, H, lite) {
      const rnd = lcg(0xab7550), nj = lite ? 2 : 4;
      return {
        jellies: mk(nj, (i) => ({ x: W * (i % 2 ? 0.78 + rnd() * 0.15 : 0.07 + rnd() * 0.15), y: H * (0.18 + ((i + rnd() * 0.5) / nj) * 0.72), r: 16 + rnd() * 12, vy: -(3.5 + rnd() * 3.5), phase: rnd() * TAU, ci: i % 2, glow: 0 })),
        plankton: mk(lite ? 10 : 22, () => ({ x: rnd() * W, y: rnd() * H, r: 1 + rnd() * 1.2, vx: (rnd() - 0.5) * 6, vy: -(2 + rnd() * 5), phase: rnd() * TAU, ci: (rnd() * 3) | 0 })),
        sonars: [], nextJ: 0,
      };
    },
    paintStatic(cx, W, H, pal, _st, api) {
      for (const [fx, w, sl] of [[0.14, 0.11, 0.08], [0.38, 0.13, 0.1], [0.64, 0.12, 0.09], [0.85, 0.1, 0.07]]) {
        beam(cx, W * fx, W * w, W * sl, H * 0.55, api.rgba(pal.hi, 0.06), api.rgba(pal.a, 0.025), api.rgba(pal.a, 0));
      }
    },
    draw(cx, W, H, pal, st, api) {
      const { dt, t, tier, aMul, isStatic, lite } = api;
      for (let r = 0; r < (lite ? 1 : 2); r++) {
        const y0 = H * (0.08 + r * 0.08);
        cx.beginPath();
        for (let x = 0; x <= W + 28; x += 28) {
          const y = y0 + Math.sin(x * 0.008 + t * 0.55 + r * 2.1) * 14 + Math.cos(x * 0.015 - t * 0.35) * 5;
          if (x) cx.lineTo(x, y); else cx.moveTo(x, y);
        }
        cx.strokeStyle = api.rgba(pal.a, (0.045 + tier * 0.006) * aMul); cx.lineWidth = 7; cx.stroke();
        cx.strokeStyle = api.rgba(pal.hi, (0.095 + tier * 0.01) * aMul); cx.lineWidth = 1.4; cx.stroke();
      }
      for (const j of st.jellies) {
        if (!isStatic) { j.y += j.vy * dt; if (j.y < -j.r * 3.2) j.y = H + j.r * 2.4; j.glow = Math.max(0, j.glow - dt * 1.1); }
        const jx = j.x + Math.sin(t * 0.4 + j.phase) * 10, p = Math.sin(t * 1.4 + j.phase);
        const rx = j.r * (1 + 0.09 * p), ry = j.r * (0.76 - 0.08 * p), rgb = j.ci ? pal.b : pal.a;
        halo(cx, api.haloFor(rgb), jx, j.y, rx * 1.65, rx * 1.65, (0.18 + j.glow * 0.2 + tier * 0.012) * aMul);
        cx.globalAlpha = 1;
        cx.fillStyle = api.rgba(rgb, (0.09 + j.glow * 0.08) * aMul);
        cx.strokeStyle = api.rgba(rgb, (0.24 + j.glow * 0.14) * aMul); cx.lineWidth = 1.2;
        cx.beginPath(); cx.ellipse(jx, j.y, rx, ry, 0, Math.PI, TAU);
        cx.quadraticCurveTo(jx + rx * 0.5, j.y + ry * 0.26, jx, j.y + ry * 0.08);
        cx.quadraticCurveTo(jx - rx * 0.5, j.y + ry * 0.26, jx - rx, j.y);
        cx.fill(); cx.stroke();
        cx.strokeStyle = api.rgba(rgb, 0.13 * aMul); cx.lineWidth = 1.05;
        for (let k = -1; k <= 1; k++) {
          const tx = jx + k * rx * 0.42, len = j.r * (k ? 1.8 : 2.3);
          cx.beginPath(); cx.moveTo(tx, j.y + 2);
          for (let s = 1; s <= 4; s++) cx.lineTo(tx + Math.sin(t * 1.8 + j.phase + k + s * 0.8) * (4 + s * 1.25), j.y + 2 + (s / 4) * len);
          cx.stroke();
        }
      }
      for (const pk of st.plankton) {
        if (!isStatic) { pk.x = (pk.x + pk.vx * dt + W) % W; pk.y += pk.vy * dt; if (pk.y < -4) pk.y = H + 4; }
        dot(cx, pk.x, pk.y, pk.r, api.rgba(pick(pal, pk.ci), (0.12 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.5 + pk.phase))) * aMul));
      }
      stepAge(st.sonars, dt, isStatic, (sn, p) => ring(cx, sn.x, sn.y, 12 + p * 103, api.rgba(sn.rgb, 0.24 * sn.power * (1 - p) * (1 - p) * aMul), 1.4));
    },
    pulse(st, rgb, power, W, H) {
      if (!st.jellies.length) return;
      const j = st.jellies[st.nextJ++ % st.jellies.length];
      j.glow = Math.min(1, Math.max(j.glow, power));
      pushCap(st.sonars, { x: clamp(j.x, 20, W - 20), y: clamp(j.y, 20, H - 20), age: 0, dur: 1.4, rgb, power });
    },
  };

  const synthwave = {
    init(W, H, lite) {
      const rnd = lcg(0x579780);
      return {
        stars: mk(lite ? 30 : 65, () => ({ x: rnd() * W, y: rnd() * H * 0.56, r: 0.7 + rnd() * 0.9, a: 0.14 + rnd() * 0.22 })),
        twinkles: mk(lite ? 6 : 12, () => ({ x: rnd() * W, y: rnd() * H * 0.52, s: 2.8 + rnd() * 2.4, phase: rnd() * TAU, speed: 1.1 + rnd() * 1.1 })),
        bars: lite ? [{ p: 0.25, dur: 8.5 }] : [{ p: 0.15, dur: 7.5 }, { p: 0.65, dur: 9.0 }],
        pulseBars: [], horizBoost: 0, lite,
      };
    },
    paintStatic(cx, W, H, pal, st, api) {
      for (const s of st.stars) dot(cx, s.x, s.y, s.r, api.rgba(WHITE, s.a));
      const sx = W * 0.5, sy = H * 0.62, R = Math.min(W, H) * 0.21;
      cx.save(); cx.beginPath(); cx.arc(sx, sy, R, 0, TAU); cx.clip();
      cx.beginPath(); cx.rect(sx - R - 2, sy - R - 2, R * 2 + 4, R + 2);
      let top = sy;
      [0.06, 0.22, 0.4, 0.6, 0.8].forEach((c, i) => {
        const yc = sy + R * c, gap = R * (0.032 + i * 0.018);
        if (yc > top) cx.rect(sx - R - 2, top, R * 2 + 4, yc - top);
        top = yc + gap;
      });
      if (top < sy + R) cx.rect(sx - R - 2, top, R * 2 + 4, sy + R - top + 2);
      cx.clip();
      const gr = cx.createLinearGradient(sx, sy - R, sx, sy + R);
      gr.addColorStop(0, api.rgba([255, 224, 102], 0.22)); gr.addColorStop(0.5, api.rgba(pal.b, 0.22)); gr.addColorStop(1, api.rgba(pal.a, 0.22));
      cx.fillStyle = gr; cx.fillRect(sx - R, sy - R, R * 2, R * 2); cx.restore();
      const hy = H * 0.64, gh = H - hy, half = st.lite ? 4 : 6, vx = W * 0.5, vy = hy - H * 0.12, f = (hy - vy) / (H - vy);
      cx.strokeStyle = api.rgba(pal.a, 0.22); cx.lineWidth = 1.2;
      cx.beginPath(); cx.moveTo(0, hy); cx.lineTo(W, hy); cx.stroke();
      cx.strokeStyle = api.rgba(pal.a, 0.13); cx.lineWidth = 1;
      for (let i = 1; i <= 8; i++) { const y = hy + gh * Math.pow(i / 8, 2.15); cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
      for (let i = -half; i <= half; i++) {
        const bx = vx + (i / half) * W * 2.1, hx = vx + (bx - vx) * f;
        cx.beginPath(); cx.moveTo(hx, hy); cx.lineTo(bx, H); cx.stroke();
      }
    },
    draw(cx, W, H, pal, st, api) {
      const { dt, t, tier, aMul, isStatic } = api, R = Math.min(W, H) * 0.21, hy = H * 0.64, gh = H - hy;
      if (!isStatic) st.horizBoost = Math.max(0, st.horizBoost - dt);
      halo(cx, api.glowB, W * 0.5, H * 0.62, R * 2.5, R * 1.9, (0.1 + 0.025 * Math.sin(t * 0.5) + st.horizBoost * 0.12 + tier * 0.01) * aMul);
      cx.globalAlpha = 1;
      for (const tw of st.twinkles) star4(cx, tw.x, tw.y, tw.s, api.rgba(pal.hi, 0.26 * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * tw.speed + tw.phase))) * aMul));
      const bar = (p, rgb, a) => {
        const y = hy + gh * Math.pow(p, 2.2), env = Math.sin(p * Math.PI);
        halo(cx, api.haloFor(rgb), W * 0.5, y, W * 0.55, 8 + p * 8, a * 0.7 * env * aMul);
        cx.globalAlpha = 1; cx.strokeStyle = api.rgba(rgb, a * env * aMul); cx.lineWidth = 1.2 + p * 0.8;
        cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke();
      };
      for (const b of st.bars) { if (!isStatic) b.p = (b.p + dt / b.dur) % 1; bar(b.p, pal.hi, 0.15 + tier * 0.012); }
      stepAge(st.pulseBars, dt, isStatic, (pb, p) => bar(p, pb.rgb, 0.26 * pb.power));
    },
    pulse(st, rgb, power) { st.horizBoost = Math.min(1, Math.max(st.horizBoost, power * 0.85)); pushCap(st.pulseBars, { age: 0, dur: 1.6, rgb, power }, 4); },
  };

  const frost = {
    init(W, H, lite) {
      const rnd = lcg(0xf40570);
      return {
        flakes: mk(lite ? 8 : 16, () => ({ x: rnd() * W, y: rnd() * H, r: 5 + rnd() * 6, vx: 3 + rnd() * 5, vy: 6 + rnd() * 6, ang: rnd() * TAU, spin: (rnd() < 0.5 ? -1 : 1) * (0.18 + rnd() * 0.25), a: 0.16 + rnd() * 0.1 })),
        glints: [],
      };
    },
    paintStatic(cx, W, H, pal, _st, api) {
      api.haloFor(WHITE);
      const len = Math.min(W, H) * 0.15;
      for (const [x, y, angs] of [[0, 0, [0.28, 0.78, 1.28]], [W, 0, [Math.PI - 0.28, Math.PI - 0.78, Math.PI - 1.28]], [W, H, [Math.PI + 0.28, Math.PI + 0.78, Math.PI + 1.28]], [0, H, [TAU - 0.28, TAU - 0.78, TAU - 1.28]]]) {
        angs.forEach((a, i) => iceFern(cx, x, y, a, len * (i === 1 ? 1 : 0.78), 2, pal.a, api));
      }
    },
    draw(cx, W, H, pal, st, api) {
      const { dt, t, tier, aMul, isStatic } = api;
      halo(cx, api.haloFor(pal.hi), W * (0.3 + 0.12 * Math.sin(t * 0.11)), H * 0.14, W * 0.42, H * 0.16, (0.14 + tier * 0.012) * aMul);
      halo(cx, api.haloFor(WHITE), W * (0.72 + 0.12 * Math.cos(t * 0.09)), H * 0.18, W * 0.36, H * 0.14, (0.18 + tier * 0.012) * aMul);
      cx.globalAlpha = 1;
      for (const f of st.flakes) {
        if (!isStatic) { f.x = (f.x + f.vx * dt + W) % W; f.y = (f.y + f.vy * dt) % (H + 24); f.ang += f.spin * dt; }
        const a = (f.a + tier * 0.014) * aMul;
        crystal(cx, f.x, f.y - 12, f.r, f.ang, api.rgba(pal.a, a * 1.15), api.rgba(WHITE, a * 1.8));
      }
      stepAge(st.glints, dt, isStatic, (gl, p) => {
        const r = gl.r * (0.65 + 0.45 * p), a = 0.28 * gl.power * Math.sin(p * Math.PI) * aMul;
        halo(cx, api.haloFor(gl.rgb), gl.x, gl.y, r * 1.5, r * 1.5, a * 0.7); cx.globalAlpha = 1;
        crystal(cx, gl.x, gl.y, r, gl.ang + p * 0.5, api.rgba(gl.rgb, a * 1.4), api.rgba(WHITE, a * 2));
      });
    },
    pulse(st, rgb, power, W, H) {
      for (let i = 0; i < (power >= 0.75 ? 3 : 2); i++) {
        const x = Math.random() < 0.7 ? edgeX(W, 0.06, 0.2) : W * (0.2 + Math.random() * 0.6);
        pushCap(st.glints, { x, y: H * (0.1 + Math.random() * 0.72), r: 10 + Math.random() * 8, ang: Math.random() * TAU, age: 0, dur: 1.0, rgb, power }, 8);
      }
    },
  };

  const rainy = {
    init(W, H, lite) {
      const rnd = lcg(0x4a1970), nr = lite ? 3 : 6;
      return {
        bokeh: mk(lite ? 7 : 14, (i) => {
          const top = i % 3 === 0;
          return { x: top ? rnd() * W : W * (i % 2 ? 0.74 + rnd() * 0.22 : 0.04 + rnd() * 0.22), y: top ? H * (0.04 + rnd() * 0.22) : H * (0.16 + rnd() * 0.7), r: 24 + rnd() * 48, phase: rnd() * TAU, speed: 0.3 + rnd() * 0.35, a: 0.06 + rnd() * 0.07, isAmber: i % 2 === 0 };
        }),
        ripples: mk(nr, (i) => ({ x: W * (0.08 + rnd() * 0.84), y: H * (0.3 + rnd() * 0.66), age: (i / nr) * 3, dur: 2.4 + rnd() * 1.2, maxR: 46 + rnd() * 22 })),
        pulseRipples: [], lampFlare: 0,
      };
    },
    paintStatic(cx, W, H, pal, _st, api) {
      const y0 = H * 0.84, gr = cx.createLinearGradient(0, y0, 0, H);
      gr.addColorStop(0, api.rgba(pal.a, 0)); gr.addColorStop(0.55, api.rgba(pal.a, 0.045)); gr.addColorStop(1, api.rgba(pal.a, 0.1));
      cx.fillStyle = gr; cx.fillRect(0, y0, W, H - y0);
      cx.strokeStyle = api.rgba(pal.b, 0.07); cx.lineWidth = 1.2;
      cx.beginPath(); cx.moveTo(W * 0.64, H * 0.94); cx.lineTo(W * 0.96, H * 0.94); cx.stroke();
    },
    draw(cx, W, H, pal, st, api) {
      const { dt, t, tier, aMul, isStatic } = api, haloA = api.haloFor(pal.a), haloB = api.haloFor(pal.b);
      if (!isStatic) st.lampFlare = Math.max(0, st.lampFlare - dt * 1.1);
      for (const b of st.bokeh) {
        halo(cx, b.isAmber ? haloB : haloA, b.x, b.y, b.r, b.r, (b.a * (0.75 + 0.25 * Math.sin(t * b.speed + b.phase)) + (b.isAmber ? st.lampFlare * 0.08 : 0) + tier * 0.006) * aMul);
      }
      cx.globalAlpha = 1;
      for (const rp of st.ripples) {
        if (!isStatic) { rp.age += dt; if (rp.age >= rp.dur) { rp.age = 0; rp.x = W * (0.08 + Math.random() * 0.84); rp.y = H * (0.3 + Math.random() * 0.66); } }
        const p = clamp(rp.age / rp.dur, 0, 1), a = (0.18 + tier * 0.012) * (1 - p) * (1 - p) * aMul;
        ellipRipple(cx, rp.x, rp.y, 4 + p * rp.maxR, api.rgba(pal.a, a), api.rgba(pal.a, a * 0.55));
      }
      stepAge(st.pulseRipples, dt, isStatic, (pr, p) => {
        const a = 0.28 * pr.power * Math.pow(1 - p, 1.6) * aMul;
        ellipRipple(cx, pr.x, pr.y, 8 + p * 87, api.rgba(pr.rgb, a), api.rgba(pr.rgb, a * 0.55));
      });
    },
    pulse(st, rgb, power, W, H) {
      st.lampFlare = Math.min(1, Math.max(st.lampFlare, power));
      const x = W * (0.12 + Math.random() * 0.76), y = H * (0.34 + Math.random() * 0.56);
      for (let i = 0; i < 2; i++) pushCap(st.pulseRipples, { x: x + i * (Math.random() * 28 - 14), y: y + i * (Math.random() * 14 - 7), age: -i * 0.16, dur: 1.4, rgb, power });
    },
  };

  return { cafe, fantasy, autumn, abyss, synthwave, frost, rainy };
})();
