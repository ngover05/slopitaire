/* Slopitaire — move dispatch for every variant, drawing from the stock, after-move checks and undo. */
'use strict';

let autoT = null;   // pending automatic foundation move after a move (settings.autoFound)

// one entry point for "move this card (stack) there", whatever the variant
function doMove(src, idx, dst, opts) {
  switch (G.variant) {
    case 'spider': case 'freecell': return tabMove(src, idx, dst, opts);
    case 'pyramid': return dst.t === 'found' ? pyramidRemove([src], opts) : pyramidRemove([src, dst], opts);
    case 'tripeaks': return peakPlay(src.i, opts);
    default: return moveCards(src, idx, dst, opts);
  }
}

function drawStock() {
  if (!G || busy || G.won || G.lost) return;
  if (G.variant === 'freecell') return;
  noteActivity(); clearHints(); G.hintIdx = 0; clearPyrSel();
  if (G.variant === 'spider') { spiderDeal(); return; }
  if (!G.stock.length) {
    if (!G.waste.length) {
      Sound.sfx.stockEmpty?.();
      PopupFX?.float(slots.stock, 'STOCK EMPTY', { kind: 'warn', important: true });
      shakeEl(slots.stock);
      return;
    }
    if (!canRecycle()) {
      Sound.sfx.stockEmpty?.();
      Sound.sfx.invalid();
      PopupFX?.float(slots.stock, 'STOCK EMPTY', { kind: 'warn', tag: G.variant === 'tripeaks' ? 'NO DRAWS LEFT' : '0 PASSES', important: true });
      PopupFX?.stamp('OOPS!', 'sad', 'amber', false);
      if (G.chain >= 3) breakChain('recycle');
      Companion.react('noRedeal');
      shakeEl(slots.stock);
      return;
    }
    pushHistory();
    Sound.sfx.stockEmpty?.();
    G.stock = G.waste.reverse(); G.waste = [];
    G.stock.forEach((c) => { c.up = false; });
    G.passes++; G.wasteFan = 0;
    if (G.variant === 'klondike' && G.draw === 1) G.score = Math.max(0, G.score - 20);
    G.moves++; gameStepSeq++; startClock();
    Sound.sfx.recycle();
    const lim = passLimit();
    PopupFX?.float(slots.stock, '↻ REDEAL', {
      kind: 'info',
      tag: lim === Infinity ? `PASS ${G.passes}` : `${Math.max(0, lim - G.passes)} LEFT`,
      important: true,
    });
    if (G.chain >= 3) breakChain('recycle');
    Companion.react('recycle');
    layout(); afterMove();
    return;
  }
  pushHistory();
  // TriPeaks: drawing ends the run (and banks it)
  if (G.variant === 'tripeaks' && G.chain > 0) breakChain('draw');
  const n = Math.min(G.variant === 'klondike' ? G.draw : 1, G.stock.length);
  for (let k = 0; k < n; k++) { const c = G.stock.pop(); c.up = true; G.waste.push(c); }
  G.wasteFan = n;
  G.moves++; gameStepSeq++; startClock();
  extendChain(2400);
  if (G.variant === 'tripeaks' && !G.stock.length) PopupFX?.pill('⛰', 'LAST DRAW', 'NO STOCK LEFT', 'amber');
  if (n > 1 && Sound.sfx.drawTriple) Sound.sfx.drawTriple();
  else Sound.sfx.draw();
  Companion.react('draw');
  layout();
  if (n > 1) PopupFX?.float(slots.waste, `DRAW ×${n}`, { kind: 'info', tag: 'FAN' });
  afterMove();
}

function afterMove() {
  updateHUD();
  if (checkWin()) return;
  if (!busy && settings.autoFound && !(G.difficulty === 'auto' && !autoPaused)) {
    clearTimeout(autoT);
    autoT = setTimeout(() => {
      if (!G || G.won || busy || drag) return;
      const m = autoFoundStep(true);
      if (m) doMove(m.src, m.idx, m.dst, { record: false, auto: true });
    }, moveMs() + 60);
  }
  maybeAutoFinish();
  saveGame();
  scheduleCheck();
  if (G && G.difficulty === 'auto' && !autoPaused && !busy && !G.won && !G.lost) scheduleAutoStep(AUTO_STEP_MS);
}

function undo() {
  if (!G || busy || G.won) return;
  if (!DIFF[G.difficulty].undo) {
    toast('No undo in Hard mode~ (｀・ω・´)');
    Sound.sfx.invalid();
    PopupFX?.float(DOM.btnUndo, 'LOCKED', { kind: 'warn', tag: 'HARD MODE', important: true });
    Companion.react('undoBlocked');
    return;
  }
  if (!G.history.length) return;
  clearTimeout(autoT); clearHints(); G.hintIdx = 0; G.combo = 0; clearPyrSel();
  if (G.lost) { G.lost = false; board.classList.remove('lost'); }
  restore(G.history.pop());
  gameStepSeq++;
  resetAutoPlan();
  const cost = DIFF[G.difficulty].undoCost;
  G.score = Math.max(0, G.score - cost);
  Sound.sfx.undo();
  PopupFX?.float(DOM.btnUndo, '↶ REWIND', { kind: 'warn', tag: cost ? `-${cost} PTS` : 'UNDO', important: true });
  if (G.chain > 0) breakChain('undo');
  Companion.react('undo');
  layout(); updateHUD(); maybeAutoFinish(); saveGame();
  scheduleCheck();
  if (G && G.difficulty === 'auto' && !autoPaused && !busy && !G.won && !G.lost) scheduleAutoStep(AUTO_STEP_MS);
}
