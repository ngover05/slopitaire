/* Slopitaire — the top bar HUD and the combo HUD. */
'use strict';

function syncComboHud(pulse = false) {
  const ch = G ? G.chain : 0;
  const { tier, label, mult } = tierOf(ch);
  const hud = DOM.comboHud;
  if (hud) {
    DOM.comboCount.textContent = String(ch).padStart(3, '0');
    DOM.comboTier.textContent = label;
    DOM.comboMult.textContent = '×' + mult.toFixed(1);
    hud.dataset.tier = String(tier);
    if (!G || ch === 0 || !G.warnedChain) hud.classList.remove('danger');
    if (pulse) {
      hud.classList.remove('break', 'pulse');
      void hud.offsetWidth;
      hud.classList.add('pulse');
    }
    const fill = DOM.comboFill;
    if (fill) {
      if (G && G.won && ch > 0) {
        fill.style.transform = 'scaleX(1)';
      } else if (G && ch > 0 && G.chainDur > 0) {
        const ratio = Math.max(0, Math.min(1, (G.chainUntil - Date.now()) / G.chainDur));
        fill.style.transform = `scaleX(${ratio.toFixed(3)})`;
      } else {
        fill.style.transform = 'scaleX(0)';
      }
    }
  }
  document.body.dataset.comboTier = String(tier);
  document.body.dataset.chainTier = String(tier);
  Sound.setIntensity?.(tier);
  StageBG?.ensureLoop();
}
function modeText() {
  if (!G) return '';
  switch (G.variant) {
    case 'klondike': return `Draw ${G.draw}`;
    case 'spider': return `Spider · ${G.suits} suit${G.suits > 1 ? 's' : ''}`;
    default: return VARIANTS[G.variant].label;
  }
}
const fmtTime = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');

function updateHUD() {
  if (!G) return;
  const d = DIFF[G.difficulty];
  const cd = DOM.chipDiff;
  if (G.difficulty === 'auto') {
    cd.textContent = autoPaused ? '◈ Auto ⏸' : '◈ Auto ▶';
    cd.className = 'chip diff-auto is-auto' + (autoPaused ? ' is-paused' : '');
    cd.title = autoPaused ? 'Autopilot paused — click to resume' : 'Autopilot active — click to pause';
    cd.setAttribute('role', 'button');
    cd.tabIndex = 0;
  } else {
    cd.textContent = `${d.icon} ${d.label}`;
    cd.className = 'chip diff-' + G.difficulty;
    cd.title = '';
    cd.removeAttribute('role');
    cd.removeAttribute('tabindex');
  }
  DOM.chipDraw.textContent = G.variant === 'klondike' ? `Draw ${G.draw}` : `${V().icon} ${modeText()}`;
  DOM.moves.textContent = G.moves;
  DOM.score.textContent = G.score;
  // the third counter means something different per variant
  const pc = DOM.chipPasses, lim = passLimit();
  if (pc) {
    let ic = '↻', val, title = 'Redeals left';
    if (G.variant === 'spider') { val = G.stock.length / 10; title = 'Deals left'; ic = '🕸'; }
    else if (G.variant === 'freecell') { val = freeCells(); title = 'Free cells'; ic = '◇'; }
    else if (G.variant === 'tripeaks') { val = G.stock.length; title = 'Cards left in the stock'; ic = '▤'; }
    else val = lim === Infinity ? '∞' : Math.max(0, lim - G.passes);
    pc.title = title;
    if (DOM.passesIc) DOM.passesIc.textContent = ic;
    DOM.passes.textContent = val;
  }
  DOM.chipDeal.textContent = `#${G.seed}${G.verified ? ' ✓' : ''}`;
  DOM.chipDeal.title = G.verified ? 'Deal number — verified winnable' : 'Deal number';
  DOM.time.textContent = fmtTime(G.elapsed) === '—' ? '0:00' : fmtTime(G.elapsed);
  DOM.btnUndo.disabled = !d.undo || !G.history.length || G.won;
  DOM.btnHint.disabled = d.hints === 0 || G.won || !!G.lost;
  DOM.hintBadge.textContent = d.hints === Infinity || d.hints === 0 ? '' : G.hintsLeft;
  updateStockSlot();
  syncComboHud(false);
}
