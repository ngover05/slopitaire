/* Slopitaire — themed ambient particles (#petals). */
'use strict';

const PETAL_MODES = {
  petal:   { n: 18, lite: 8,  dur: [10, 12],  drift: [-4, 16], s: [0.6, 0.8],   sway: [2, 3] },
  diamond: { n: 18, lite: 8,  dur: [10, 12],  drift: [-4, 16], s: [0.6, 0.8],   sway: [2, 3] },
  steam:   { n: 14, lite: 6,  dur: [12, 8],   drift: [-6, 12], s: [0.8, 0.7],   sway: [3, 1.6],   rise: true },
  mana:    { n: 18, lite: 8,  dur: [11, 10],  drift: [-8, 16], s: [0.6, 0.7],   sway: [1.8, 1.2], rise: true },
  maple:   { n: 18, lite: 8,  dur: [9, 9],    drift: [2, 18],  s: [0.75, 0.7],  sway: [2.4, 1.6] },
  bubble:  { n: 16, lite: 7,  dur: [10, 9],   drift: [-5, 10], s: [0.65, 0.8],  sway: [2.2, 1.4], rise: true },
  spark:   { n: 16, lite: 7,  dur: [10, 8],   drift: [-6, 12], s: [0.6, 0.65],  sway: [1.5, 1.1], rise: true },
  snow:    { n: 22, lite: 10, dur: [12, 12],  drift: [-8, 16], s: [0.55, 0.75], sway: [2.8, 1.6] },
  rain:    { n: 24, lite: 10, dur: [1.6, 1.2], drift: [-12, 0], s: [0.7, 0.55], left: [-2, 116] },
};

function buildPetals() {
  const box = $('#petals');
  if (!box) return;
  box.innerHTML = '';
  const mode = (typeof THEME_DEFS !== 'undefined' && THEME_DEFS[settings.theme]?.particles)
    || (settings.theme === 'prism' ? 'diamond' : 'petal');
  box.dataset.particles = mode;
  if (!settings.petals || settings.anim === 'off') return;
  const cfg = PETAL_MODES[mode] || PETAL_MODES.petal;
  const n = perfLite() ? cfg.lite : cfg.n;
  const [lx, lw] = cfg.left || [-5, 105];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'petal';
    const dur = cfg.dur[0] + Math.random() * cfg.dur[1];
    const drift = cfg.drift[0] + (cfg.drift[1] ? Math.random() * cfg.drift[1] : 0);
    p.style.left = (lx + Math.random() * lw).toFixed(2) + 'vw';
    if (cfg.rise) {
      p.style.top = 'auto';
      p.style.bottom = '-8vh';
      p.style.animationName = 'riseFade';
    }
    p.style.animationDuration = dur.toFixed(2) + 's';
    p.style.animationDelay = (-Math.random() * dur).toFixed(2) + 's';
    p.style.setProperty('--drift', drift.toFixed(2) + 'vw');
    p.style.setProperty('--s', (cfg.s[0] + Math.random() * cfg.s[1]).toFixed(2));
    p.innerHTML = cfg.sway
      ? `<i style="animation-duration:${(cfg.sway[0] + Math.random() * cfg.sway[1]).toFixed(2)}s"></i>`
      : '<i></i>';
    box.appendChild(p);
  }
}
