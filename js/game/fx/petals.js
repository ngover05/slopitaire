/* Slopitaire — falling background petals. */
'use strict';

function buildPetals() {
  const box = $('#petals'); box.innerHTML = '';
  if (!settings.petals || settings.anim === 'off') return;
  const n = perfLite() ? 8 : 18;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div'); p.className = 'petal';
    const dur = 10 + Math.random() * 12;
    p.style.left = (Math.random() * 105 - 5) + 'vw';
    p.style.animationDuration = dur + 's';
    p.style.animationDelay = -(Math.random() * dur) + 's';
    p.style.setProperty('--drift', (Math.random() * 16 - 4) + 'vw');
    p.style.setProperty('--s', (0.6 + Math.random() * 0.8).toFixed(2));
    p.innerHTML = `<i style="animation-duration:${(2 + Math.random() * 3).toFixed(2)}s"></i>`;
    box.appendChild(p);
  }
}
