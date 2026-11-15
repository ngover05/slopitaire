/* Slopitaire — Spider: lifting finished runs and dealing a new row. */
'use strict';

// Spider: lift a finished King-to-Ace run of one suit off column i, then turn up whatever it uncovered.
function spiderSettle(i, out) {
  const p = G.tab[i];
  if (p.length >= 13) {
    const run = p.slice(-13), suit = run[0].suit;
    let ok = run[0].rank === 13;
    for (let k = 0; ok && k < 13; k++) if (!run[k].up || run[k].suit !== suit || run[k].rank !== 13 - k) ok = false;
    if (ok) {
      p.splice(p.length - 13);
      const slot = G.found.findIndex((f) => !f.length);
      G.found[slot].push(...run.slice().reverse());   // the King ends on top
      out.runs.push({ col: i, slot, suit });
    }
  }
  if (p.length && !p[p.length - 1].up) { p[p.length - 1].up = true; out.flips.push(p[p.length - 1]); }
}

// points, effects and medals for runs lifted by a move or a deal; returns the points scored
function spiderRunFx(out, mult) {
  let pts = 0;
  out.runs.forEach((r, k) => {
    const runPts = Math.round(100 * mult);
    pts += runPts;
    G.score += runPts;
    const el = slots.found[r.slot];
    setTimeout(() => sparkleAt(el), moveMs() * 0.8 + k * 120);
    PopupFX?.float(el, `★ SPIDER RUN! ${SUIT_SYMS[r.suit]}`, { kind: 'ace', tag: 'K → A', important: true });
    scoreFloat(el, runPts, mult, 'RUN CLEARED', true);
  });
  if (out.runs.length) {
    Sound.sfx.suitDone?.();
    StageBG?.pulse('#ffe169', 1.0);
    const done = G.found.filter((p) => p.length).length;
    if (done >= 1) PopupFX?.award('spRun1', '🕸', 'FIRST RUN', '1 / 8 RUNS CLEARED', 'emerald');
    if (done >= 4) PopupFX?.award('spRun4', '🕸', 'HALF THE WEB (4/8)', 'FOUR RUNS CLEARED', 'amber');
    if (done >= 7) PopupFX?.award('spRun7', '🔥', 'ONE RUN LEFT (7/8)', 'FINAL THREAD', 'gold');
    if (out.runs.length >= 2) PopupFX?.award('spDouble', '❖', 'DOUBLE RUN', 'TWO RUNS AT ONCE', 'violet');
  }
  return pts;
}

// Spider: deal one card onto every column. Like the classic rules, every column must hold a card first.
function spiderDeal() {
  if (!G.stock.length) {
    Sound.sfx.stockEmpty?.();
    PopupFX?.float(slots.stock, 'STOCK EMPTY', { kind: 'warn', tag: 'ALL ROWS DEALT', important: true });
    shakeEl(slots.stock);
    return;
  }
  if (G.tab.some((p) => !p.length)) {
    Sound.sfx.invalid();
    PopupFX?.float(slots.stock, 'FILL EVERY COLUMN', { kind: 'warn', tag: 'DEAL LOCKED', important: true });
    PopupFX?.stamp('OOPS!', 'oops', 'amber', false);
    shakeEl(slots.stock);
    G.tab.forEach((p, i) => { if (!p.length) shakeEl(slots.tab[i]); });
    Companion.react('dealBlocked');
    return;
  }
  pushHistory();
  clearHints(); G.hintIdx = 0;
  const dealt = [];
  for (let i = 0; i < 10; i++) { const c = G.stock.pop(); c.up = true; G.tab[i].push(c); dealt.push(c); }
  const out = { runs: [], flips: [] };
  for (let i = 0; i < 10; i++) spiderSettle(i, out);
  G.moves++; gameStepSeq++; startClock();
  G.swaps = {};
  extendChain(2400);
  const step = settings.anim === 'off' ? 0 : settings.anim === 'fast' ? 22 : 40;
  dealt.forEach((c, k) => { c.el.style.transitionDelay = (k * step) + 'ms'; });
  layout();
  setTimeout(() => dealt.forEach((c) => { c.el.style.transitionDelay = ''; }), 10 * step + moveMs() + 60);
  if (step) Sound.sfx.deal(10, step / 1000); else Sound.sfx.draw();
  const left = G.stock.length / 10;
  PopupFX?.float(slots.stock, '🕸 WEB DEAL', { kind: 'info', tag: left ? `${left} LEFT` : 'LAST ROW', important: true });
  if (!left) PopupFX?.pill('🕸', 'FINAL ROW DEALT', 'NO STOCK LEFT', 'amber');
  if (out.runs.length) {
    spiderRunFx(out, tierOf(G.chain).mult);
    Companion.react('spiderRun');
    cutIn('SPIDER RUN!');
  } else Companion.react('spiderDeal');
  afterMove();
}
