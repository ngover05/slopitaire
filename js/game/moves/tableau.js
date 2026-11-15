/* Slopitaire — Spider & FreeCell tableau moves with scoring, combo and effects. */
'use strict';

function tabMove(src, idx, dst, opts = {}) {
  if (opts.record !== false) pushHistory();
  clearHints(); G.hintIdx = 0;
  const spider = G.variant === 'spider';
  const sp = pileOf(src), dp = pileOf(dst);
  const cellsBefore = spider ? 0 : 4 - freeCells();
  const capBefore = spider ? 0 : fcCapacity(dst.t === 'tab' && !dp.length);
  const reveals = src.t === 'tab' && sp.length > idx && idx > 0 && !sp[idx - 1].up;
  const mov = sp.splice(idx);
  dp.push(...mov);
  const now = Date.now();
  const toFound = dst.t === 'found';
  const reHome = toFound && G.homed.has(mov[0].id);
  const under = !toFound && dp.length > mov.length ? dp[dp.length - mov.length - 1] : null;
  const newLink = spider && !!under && under.suit === mov[0].suit && under.rank === mov[0].rank + 1 && !G.linked.has(mov[0].id);
  const out = { runs: [], flips: [] };
  if (spider) {
    if (dst.t === 'tab') spiderSettle(dst.i, out);
    if (src.t === 'tab') spiderSettle(src.i, out);
  }
  const flipped = out.flips.length > 0, flippedRank = flipped ? out.flips[0].rank : 1;

  // Anti-farming, as in Klondike: shuffling a card around without turning anything up (or, in Spider, making a
  // new same-suit link) stops counting toward the combo after a few moves.
  let swapSpam = false;
  if (!opts.auto && G.difficulty !== 'auto' && !toFound) {
    if (reveals || newLink || out.runs.length) G.swaps = {};
    else {
      const n = (G.swaps[mov[0].id] = (G.swaps[mov[0].id] || 0) + 1);
      swapSpam = n > (spider ? SWAP_LIMIT : SWAP_LIMIT + 1);   // FreeCell needs a little more juggling room
    }
  } else if (toFound && !reHome) G.swaps = {};
  const cx = chainCtx(now);
  if (swapSpam) {
    if (G.chain > 0) breakChain('swap');
    PopupFX?.float(mov[0].el, '✕ CARD SHUFFLE', { kind: 'warn', tag: 'NO COMBO', important: true });
  } else if (!opts.auto && !reHome) {
    stepChain(cx, (toFound && mov[0].rank === 13 ? 2 : 1) + out.runs.length * 2);
  }

  const { mult } = tierOf(G.chain);
  let movePts = 0, flipPts = 0, linkPts = 0;
  if (toFound && !reHome) { movePts = Math.round(10 * mult); G.score += movePts; G.homed.add(mov[0].id); }
  if (newLink) { G.linked.add(mov[0].id); linkPts = Math.round(3 * mult); G.score += linkPts; }
  if (flipped) { flipPts = Math.round(5 * mult) * out.flips.length; G.score += flipPts; }

  // FreeCell cell pressure
  const cellsAfter = spider ? 0 : 4 - freeCells();
  const cellsFull = !spider && cellsAfter === 4 && cellsBefore < 4;
  if (!spider) G.cellPeak = Math.max(G.cellPeak || 0, cellsAfter);
  const cellsClear = !spider && cellsAfter === 0 && cellsBefore > 0 && G.cellPeak >= 3 && now - (G.cellsClearAt || 0) > 15000;
  if (cellsClear) { G.cellPeak = 0; G.cellsClearAt = now; }
  const supermove = !spider && dst.t === 'tab' && mov.length >= 3;
  const toCell = dst.t === 'cell';
  const acePlaced = toFound && mov[0].rank === 1 && !reHome;
  const suitCompleted = toFound && mov[0].rank === 13 && !reHome;
  const clearedCol = src.t === 'tab' && !sp.length;

  G.moves++;
  gameStepSeq++;
  startClock();
  layout();

  if (toFound) {
    Sound.sfx.foundation(mov[0].rank, G.chain);
    if (acePlaced && !opts.auto) Sound.sfx.aceIgnition?.();
    StageBG?.pulse(mov[0].red ? '#ffb638' : '#2ce8a2', suitCompleted ? 1.0 : 0.65);
    setTimeout(() => sparkleAt(slotEl(dst)), moveMs() * 0.8);
  } else {
    if (toCell && Sound.sfx.cellPark) Sound.sfx.cellPark(cellsAfter);
    else if (mov.length >= 2 && Sound.sfx.multiPlace) Sound.sfx.multiPlace(mov.length, G.chain);
    else Sound.sfx.place(G.chain);
    StageBG?.pulse(null, 0.28);
  }
  if (flipped) setTimeout(() => (Sound.sfx.revealCard ? Sound.sfx.revealCard(flippedRank) : Sound.sfx.flip()), 90);
  if (suitCompleted && !opts.auto) Sound.sfx.suitDone?.();
  if (clearedCol && !opts.auto) Sound.sfx.clearCol?.();
  if (cellsClear) Sound.sfx.clearCol?.();
  const runPts = spiderRunFx(out, mult);

  const dstEl = mov[0]?.el || slotEl(dst);
  if (movePts > 0 && (!opts.auto || G.moves % 2 === 0)) scoreFloat(dstEl, movePts, mult, 'FOUNDATION', !opts.auto);
  if (!opts.auto) {
    const sym = SUIT_SYMS[mov[0].suit];
    if (acePlaced) PopupFX?.float(dstEl, `◈ ACE ONLINE! ${sym}`, { kind: 'ace', tag: SUIT_NAMES[mov[0].suit].toUpperCase(), important: true });
    else if (suitCompleted) PopupFX?.float(dstEl, `★ SUIT COMPLETE! ${sym}`, { kind: 'ace', tag: '13 / 13', important: true });
    if (linkPts) PopupFX?.float(dstEl, `SUIT LINK +${linkPts}`, { kind: 'score', tag: `${sym} ${Art.RANKS[under.rank - 1]}→${Art.RANKS[mov[0].rank - 1]}`, mult });
    if (supermove) PopupFX?.float(dstEl, `⇉ SUPERMOVE ×${mov.length}`, { kind: 'stack', tag: `${capBefore} MAX`, important: true });
    else if (mov.length >= 2 && !toFound) {
      PopupFX?.float(dstEl, mov.length >= 5 ? `MEGA STACK ×${mov.length}!` : `STACK ×${mov.length}!`, { kind: 'stack', tag: 'TRANSFER', important: mov.length >= 3 });
    }
    if (toCell && !cellsFull) PopupFX?.float(dstEl, '◇ CELL PARK', { kind: 'info', tag: `${4 - cellsAfter} FREE` });
    if (cellsFull) PopupFX?.float(dstEl, '⚠ CELLS FULL', { kind: 'warn', tag: '0 FREE', important: true });
    if (cellsClear) PopupFX?.float(slots.cell[0], '✧ CELLS CLEAR!', { kind: 'clear', tag: '4 FREE', important: true });
    if (flipped) {
      const fMain = flippedRank === 1 ? 'ACE REVEALED!' : flippedRank >= 11 ? 'ROYAL FLIP!' : `FLIP! +${flipPts}`;
      PopupFX?.float(out.flips[0].el, fMain, { kind: 'flip', tag: flippedRank === 1 || flippedRank >= 11 ? `+${flipPts}` : 'REVEAL', important: true });
    }
    if (clearedCol) PopupFX?.float(slotEl(src), '⚡ COLUMN CLEAR!', { kind: 'clear', tag: 'OPEN LANE', important: true });
    tempoFloat(dstEl, cx);
  }

  const { done, total } = progressOf();
  if (!spider) {
    if (done >= 1) PopupFX?.award('found1', '◈', 'FIRST FOUNDATION', '1 / 52 ARCHIVED', 'emerald');
    if (done >= 13) PopupFX?.award('found13', '◈', '25% CLEARED (13/52)', 'QUARTER DECK HOME', 'emerald');
    if (done >= 26) PopupFX?.award('found26', '⚡', 'HALFWAY THERE (26/52)', '50% DECK ARCHIVED', 'amber');
    if (done >= 39) PopupFX?.award('found39', '🔥', 'FINAL STRETCH (39/52)', '75% DECK ARCHIVED', 'gold');
  }
  scoreAwards();

  const willWin = done >= total;
  let ms = { crossed: () => false, crossedHigh: false, milestoneFired: false }, pm = { hitHalfway: false, hitAlmost: false };
  if (!opts.auto) {
    if (G.openerMoves === 3 && G.dealFirstMoveAt && now - G.dealFirstMoveAt < 6000) {
      PopupFX?.award('lightningOpener', '⚡', 'LIGHTNING OPENER', '3 MOVES IN <6S', 'amber');
    }
    if (supermove && mov.length >= 5) PopupFX?.award('superMaster', '⇉', 'SUPERMOVE MASTER', `${mov.length} CARDS IN ONE GO`, 'violet');
    else if (mov.length >= 5) PopupFX?.award('fullStack', '❖', 'FULL STACK TRANSFER', `${mov.length} CARDS AT ONCE`, 'violet');
    if (cellsClear) PopupFX?.award('cellsClear', '✧', 'CELLS CLEARED', 'ALL FOUR CELLS FREE AGAIN', 'emerald');
    if (spider) {
      if (flipped && src.t === 'tab' && G.tab[src.i].every((c) => c.up)) {
        PopupFX?.award('colUnlock_' + src.i, '🔓', 'COLUMN UNLOCKED', `LANE ${src.i + 1} UNLOCKED`, 'emerald');
      }
      if (dst.t === 'tab' && !out.runs.length) {
        let run = 1;
        const p = G.tab[dst.i];
        while (run < p.length && p[p.length - run - 1].up && p[p.length - run - 1].suit === p[p.length - run].suit && p[p.length - run - 1].rank === p[p.length - run].rank + 1) run++;
        if (run >= 8) PopupFX?.award('silk', '🕸', 'SILK THREAD', `${run}-CARD SAME-SUIT RUN`, 'violet');
      }
      if (cards.every((c) => c.up || c.pile?.t === 'stock')) PopupFX?.award('allUp', '👁', 'EVERY CARD REVEALED', 'NOTHING LEFT HIDDEN', 'gold');
    }
    if (toFound && !reHome) {
      G.combo = now - (G.lastFoundT || 0) < 4500 ? (G.combo || 0) + 1 : 1;
      G.lastFoundT = now;
    } else G.combo = 0;

    ms = comboMilestones(cx.prevChain, willWin, !reHome);
    pm = progressMoments(willWin);
    const run = out.runs.length > 0;
    if (!willWin) {
      if (run) PopupFX?.banner(`${G.found.filter((p) => p.length).length} / 8 RUNS LIFTED`, 'SPIDER RUN', 'gold', true);
      else if (suitCompleted) PopupFX?.banner('13 / 13 HARMONIZED', 'SUIT COMPLETE', 'gold', true);
      else if (comboBanner(ms)) { /* combo promotion took the banner */ }
      else if (pm.hitAlmost) PopupFX?.banner('ENDGAME CONVERGENCE', 'FINAL STRETCH', 'gold', true);
      else if (pm.hitHalfway) PopupFX?.banner(`${done} / ${total} HOME`, 'HALFWAY', 'amber', true);
      else if (cx.wasClutchPop) PopupFX?.banner('LAST-SECOND EXTENSION', 'CLUTCH SAVE', 'amber', true);
      else if (supermove) PopupFX?.banner(`${mov.length}-CARD SUPERMOVE`, 'SUPERMOVE', 'violet', mov.length >= 5);
      else if (mov.length >= 5) PopupFX?.banner(`${mov.length}-CARD SEQUENCE`, 'MEGA STACK', 'gold', true);
      else if (cellsClear) PopupFX?.banner('FOUR CELLS OPEN', 'CELLS CLEAR', 'emerald', false);
      else if (acePlaced) PopupFX?.banner('FOUNDATION IGNITED', 'ACE ONLINE', 'emerald', false);
      else if (clearedCol) PopupFX?.banner('TABLEAU LANE OPEN', 'COLUMN CLEAR', 'emerald', false);

      if (ms.crossedHigh) PopupFX?.stamp('UNREAL!', 'hype', 'gold', true);
      else if (ms.crossed(20) || run || suitCompleted || pm.hitAlmost) PopupFX?.stamp("LET'S GO!", 'cheer', 'gold', true);
      else if (ms.crossed(10) || pm.hitHalfway) PopupFX?.stamp('LOCKED IN!', 'hype', 'amber', true);
      else if (cx.wasClutchPop || cx.wasClutch) PopupFX?.stamp('CLUTCH!', 'smug', 'amber', true);
      else if (ms.crossed(5) || acePlaced || cellsClear) PopupFX?.stamp('NICE!', 'cheer', 'emerald', false);
      else if (supermove || mov.length >= 4) PopupFX?.stamp('GENIUS!', 'smug', 'gold', false);
      else if (cellsFull) PopupFX?.stamp('OOPS!', 'shock', 'amber', false);
      else if (clearedCol) PopupFX?.stamp('CLEAN!', 'smug', 'emerald', false);
      else if (cx.wasFast) PopupFX?.stamp('SO FAST!', 'hype', 'emerald', false);
      else if (flipped && (flippedRank === 1 || flippedRank >= 12)) PopupFX?.stamp('WHOA!', 'wink', 'amber', false);
    }

    if (willWin) {
      /* win() reacts */
    } else if (ms.milestoneFired) {
      if ((run || suitCompleted) && G.chain < 10) cutIn(run ? 'SPIDER RUN!' : 'SUIT COMPLETE!');
    } else if (run) {
      Companion.react('spiderRun');
      cutIn('SPIDER RUN!');
    } else if (suitCompleted) {
      Companion.react('suitDone');
      cutIn('SUIT COMPLETE!');
    } else if (pm.hitAlmost) Companion.react('almostWon');
    else if (pm.hitHalfway) Companion.react('halfway');
    else if (cx.wasClutch) Companion.react('clutch');
    else if (toFound && G.combo >= 3) {
      Companion.react('combo');
      if (G.combo === 4) cutIn(`COMBO ×${G.combo}!`);
    } else if (acePlaced) Companion.react('aceFound');
    else if (cellsFull) Companion.react('cellsFull');
    else if (cellsClear) Companion.react('cellsClear');
    else if (supermove) Companion.react('supermove');
    else if (clearedCol) Companion.react('clearCol');
    else if (mov.length >= 4) Companion.react('multiMove');
    else if (cx.wasFast && Companion.lastEv !== 'fastPlay') Companion.react('fastPlay');
    else if (toFound) Companion.react('foundation');
    else if (flipped) Companion.react('reveal');
    else Companion.react('place');
  } else if (runPts) {
    Companion.react('spiderRun');
  }
  afterMove();
}
