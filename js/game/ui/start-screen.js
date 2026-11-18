/* Slopitaire — the start screen and its game / difficulty pickers. */
'use strict';

function buildStartPickers() {
  const vp = $('#variantPick');
  if (vp) {
    vp.innerHTML = '';
    VARIANT_KEYS.forEach((k) => {
      const v = VARIANTS[k], b = document.createElement('button');
      b.type = 'button';
      b.className = 'variant-card' + (settings.variant === k ? ' on' : '');
      b.dataset.variant = k;
      b.title = v.tagline;
      b.innerHTML = `<span class="vc-ic">${v.icon}</span><span class="vc-name">${v.label}</span>`;
      b.onclick = () => { Sound.ensure(); setSetting('variant', k); };
      vp.appendChild(b);
    });
    const vt = $('#variantTagline');
    if (vt) vt.textContent = VARIANTS[settings.variant].tagline;
  }
  const dp = $('#diffPick'); dp.innerHTML = '';
  Object.keys(DIFF).forEach((k) => {
    const d = DIFF[k], b = document.createElement('button');
    b.type = 'button';
    b.className = 'diff-card' + (settings.difficulty === k ? ' on' : '');
    b.innerHTML = `<span class="dc-ic">${d.icon}</span><span class="dc-name">${d.label}</span><span class="dc-desc">${diffDesc(settings.variant, k)}</span>`;
    b.onclick = () => { Sound.ensure(); setSetting('difficulty', k); };
    dp.appendChild(b);
  });
  const cp = $('#castPick'), picker = makeCastPicker();
  cp.replaceWith(picker); picker.id = 'castPick';
  const skinsChip = $('#btnStartSkins');
  if (skinsChip && typeof Cast !== 'undefined' && Array.isArray(Cast.girlKeys)) {
    const customCount = Cast.girlKeys.filter((k) => skinFor(k) !== 'default').length;
    skinsChip.classList.toggle('has-custom', customCount > 0);
  }
  // the mode row: draw count for Klondike, suit count for Spider, nothing for the rest
  const row = $('#modeRow'), lbl = $('#modeLabel'), wrap = $('#drawPick');
  let fresh;
  if (settings.variant === 'spider') {
    fresh = makeSeg([[1, '1 suit'], [2, '2 suits'], [4, '4 suits']], () => settings.spiderSuits, (v) => { Sound.ensure(); setSetting('spiderSuits', v); });
    if (lbl) lbl.textContent = 'Suits';
  } else {
    fresh = makeSeg([[1, '1 card'], [3, '3 cards']], () => settings.draw, (v) => { Sound.ensure(); setSetting('draw', v); });
    if (lbl) lbl.textContent = 'Draw mode';
  }
  wrap.replaceWith(fresh); fresh.id = 'drawPick';
  if (row) row.classList.toggle('hidden', settings.variant !== 'klondike' && settings.variant !== 'spider');
  window.syncGachaBadges?.();
}
function showStart(silent) {
  buildStartPickers();
  const sv = Store.get('save', null);
  const canContinue = (G && !G.won && G.started) || validSave(sv);
  DOM.btnContinue.classList.toggle('hidden', !canContinue);
  showOverlay('startScreen', silent);
}
