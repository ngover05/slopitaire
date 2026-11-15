/* Slopitaire — Klondike card moves with scoring, combo and effects. */
'use strict';

function moveCards(src, idx, dst, opts = {}) {
  if (opts.record !== false) pushHistory();
  clearHints(); G.hintIdx = 0;
  const sp = pileOf(src), dp = pileOf(dst);
  const dpWasEmpty = dp.length === 0;
  const mov = sp.splice(idx);
  dp.push(...mov);
  if (src.t === 'waste') G.wasteFan = Math.max(G.waste.length ? 1 : 0, G.wasteFan - 1);

  const now = Date.now();
  const retreating = src.t === 'found' && dst.t === 'tab';
  // A card pulled back off a foundation and sent home again already scored once. Without this, the round trip
  // (-15, then +10 × combo multiplier) gains points at ×2.0 and above and pumps the combo for free.
  const reHome = dst.t === 'found' && src.t !== 'found' && G.homed.has(mov[0].id);
  const cx = chainCtx(now);
  const { prevChain, dtPrev } = cx;
  // Anti-farming: shuffling a card between tableau piles without turning anything face-up would pump the combo
  // for free. Each such move is counted per card; past SWAP_LIMIT the combo dies and further shuffles add nothing.
  // Real progress (a face-down card turned up, or a card sent home) clears the counts.
  let swapSpam = false;
  if (!opts.auto && G.difficulty !== 'auto' && src.t === 'tab' && dst.t === 'tab') {
    if (sp.length && !sp[sp.length - 1].up) G.swaps = {};
    else {
      G.swaps = G.swaps || {};
      const n = (G.swaps[mov[0].id] = (G.swaps[mov[0].id] || 0) + 1);
      swapSpam = n > SWAP_LIMIT;
    }
  } else if (dst.t === 'found' && !retreating && !reHome) G.swaps = {};
  if (swapSpam) {
    if (G.chain > 0) breakChain('swap');
    PopupFX?.float(mov[0].el, '✕ CARD SHUFFLE', { kind: 'warn', tag: 'NO COMBO', important: true });
  } else if (!opts.auto && !retreating && !reHome) {
    stepChain(cx, dst.t === 'found' && mov[0].rank === 13 ? 2 : 1);
  }
  const { remRatio, wasClutch, wasClutchPop, wasFast } = cx;

  const { mult } = tierOf(G.chain);
  let movePts = 0, flipPts = 0;
  if (dst.t === 'found' && src.t !== 'found') {
    if (!reHome) { movePts = Math.round(10 * mult); G.score += movePts; G.homed.add(mov[0].id); }
  } else if (src.t === 'waste' && dst.t === 'tab') { movePts = Math.round(5 * mult); G.score += movePts; }
  else if (retreating) G.score = Math.max(0, G.score - 15);
  let flipped = false, flippedRank = 1;
  if (src.t === 'tab' && sp.length && !sp[sp.length - 1].up) {
    sp[sp.length - 1].up = true;
    flippedRank = sp[sp.length - 1].rank;
    flipPts = Math.round(5 * mult);
    G.score += flipPts;
    flipped = true;
  }

  const suitCompleted = dst.t === 'found' && mov[0].rank === 13 && src.t !== 'found' && !reHome;
  const acePlaced = dst.t === 'found' && mov[0].rank === 1 && src.t !== 'found' && !reHome;
  const kingLocked = dst.t === 'tab' && dpWasEmpty && mov[0].rank === 13 && !retreating;
  const clearedCol = src.t === 'tab' && !sp.length;

  G.moves++;
  gameStepSeq++;
  startClock();
  layout();

  if (dst.t === 'found') {
    Sound.sfx.foundation(mov[0].rank, G.chain);
    if (acePlaced && !opts.auto) Sound.sfx.aceIgnition?.();
    StageBG?.pulse(mov[0].red ? '#ffb638' : '#2ce8a2', suitCompleted ? 1.0 : 0.65);
    setTimeout(() => sparkleAt(slotEl(dst)), moveMs() * 0.8);
  } else {
    if (mov.length >= 2 && Sound.sfx.multiPlace) Sound.sfx.multiPlace(mov.length, G.chain);
    else Sound.sfx.place(G.chain);
    if (kingLocked && !opts.auto) Sound.sfx.kingLock?.();
    StageBG?.pulse(null, 0.28);
  }
  if (flipped) {
    setTimeout(() => {
      if (Sound.sfx.revealCard) Sound.sfx.revealCard(flippedRank);
      else Sound.sfx.flip();
    }, 90);
  }
  if (suitCompleted && !opts.auto) Sound.sfx.suitDone?.();
  if (clearedCol && !opts.auto) Sound.sfx.clearCol?.();

  // 4-Layer Arcade Pop-Up FX triggers
  const dstEl = mov[0]?.el || slotEl(dst);
  const srcEl = sp.length ? sp[sp.length - 1].el : slotEl(src);
  if (movePts > 0 && (!opts.auto || G.moves % 2 === 0)) {
    const sLbl = mult > 1 ? `+${movePts} ×${mult.toFixed(1)}` : `+${movePts}`;
    PopupFX?.float(dstEl, sLbl, {
      kind: 'score',
      tag: dst.t === 'found' ? 'FOUNDATION' : 'SCORE',
      important: !opts.auto && (mult >= 1.5 || dst.t === 'found'),
      mult,
    });
  }
  if (!opts.auto) {
    const sym = SUIT_SYMS[mov[0].suit];
    if (acePlaced) {
      PopupFX?.float(dstEl, `◈ ACE ONLINE! ${sym}`, { kind: 'ace', tag: SUIT_NAMES[mov[0].suit].toUpperCase(), important: true });
    } else if (dst.t === 'found' && src.t !== 'found' && !reHome) {
      if (mov[0].rank === 13) PopupFX?.float(dstEl, `★ SUIT COMPLETE! ${sym}`, { kind: 'ace', tag: '13 / 13', important: true });
      else if (mov[0].rank >= 11) PopupFX?.float(dstEl, `ROYAL LOCK! ${sym}`, { kind: 'ace', tag: mov[0].rank === 11 ? 'JACK' : 'QUEEN', important: true });
      else if (mov[0].rank === 7) PopupFX?.float(dstEl, `HALF SUIT! ${sym}`, { kind: 'ace', tag: '7 / 13', important: true });
    }
    if (kingLocked) PopupFX?.float(dstEl, '♛ KING ANCHOR!', { kind: 'king', tag: 'EMPTY COL', important: true });
    if (mov.length >= 2) {
      PopupFX?.float(dstEl, mov.length >= 5 ? `MEGA STACK ×${mov.length}!` : `STACK ×${mov.length}!`, {
        kind: 'stack', tag: 'TRANSFER', important: mov.length >= 3,
      });
    }
    if (flipped) {
      const fMain = flippedRank === 1 ? 'ACE REVEALED!' : flippedRank >= 11 ? 'ROYAL FLIP!' : `FLIP! +${flipPts}`;
      const fTag = flippedRank === 1 || flippedRank >= 11 ? `+${flipPts}` : 'REVEAL';
      PopupFX?.float(srcEl, fMain, { kind: 'flip', tag: fTag, important: true });
    }
    if (clearedCol) PopupFX?.float(slotEl(src), '⚡ COLUMN CLEAR!', { kind: 'clear', tag: 'OPEN LANE', important: true });
    if (wasClutchPop || !retreating) tempoFloat(dstEl, cx);
  }

  const totalFound = G.found.reduce((s, p) => s + p.length, 0);
  if (totalFound >= 1) PopupFX?.award('found1', '◈', 'FIRST FOUNDATION', '1 / 52 ARCHIVED', 'emerald');
  if (totalFound >= 13) PopupFX?.award('found13', '◈', '25% CLEARED (13/52)', 'QUARTER DECK HOME', 'emerald');
  if (totalFound >= 26) PopupFX?.award('found26', '⚡', 'HALFWAY THERE (26/52)', '50% DECK ARCHIVED', 'amber');
  if (totalFound >= 39) PopupFX?.award('found39', '🔥', 'FINAL STRETCH (39/52)', '75% DECK ARCHIVED', 'gold');
  for (const ms of [250, 500, 1000, 2500, 5000]) {
    if (G.score >= ms) PopupFX?.award('score_' + ms, '★', 'SCORE MILESTONE', `${ms.toLocaleString()} PTS`, ms >= 1000 ? 'gold' : 'amber');
  }
  if (G.prevBestScore > 0 && G.score > G.prevBestScore) {
    PopupFX?.award('newBest', '👑', 'NEW BEST SCORE!', `${G.score} PTS RECORD`, 'gold');
  }

  if (!opts.auto) {
    if (G.openerMoves === 3 && G.dealFirstMoveAt && now - G.dealFirstMoveAt < 6000) {
      PopupFX?.award('lightningOpener', '⚡', 'LIGHTNING OPENER', '3 MOVES IN <6S', 'amber');
    }
    if (mov.length >= 5) PopupFX?.award('fullStack', '❖', 'FULL STACK TRANSFER', `${mov.length} CARDS AT ONCE`, 'violet');
    if (flipped && src.t === 'tab' && sp.every((c) => c.up)) {
      PopupFX?.award('colUnlock_' + src.i, '🔓', 'COLUMN UNLOCKED', `LANE ${src.i + 1} UNLOCKED`, 'emerald');
    }
    if (G.tab.filter((p) => p.length && p[0].up && p[0].rank === 13).length >= 4) {
      PopupFX?.award('fourKings', '♛', 'FOUR KINGS ANCHORED', 'ROYAL QUAD FORMATION', 'gold');
    }

    if (dst.t === 'found' && !reHome) {
      G.combo = now - (G.lastFoundT || 0) < 4500 ? (G.combo || 0) + 1 : 1;
      G.lastFoundT = now;
    } else G.combo = 0;

    const willWin = G.found.every((p) => p.length === 13);
    const ms = comboMilestones(prevChain, willWin, !retreating && !reHome);
    const { crossed, crossedHigh, milestoneFired } = ms;

    const hitAlmost = !willWin && totalFound >= 44 && !G.almostSaid;
    const hitHalfway = !willWin && totalFound >= 26 && totalFound < 44 && !G.halfwaySaid;
    const hitStretch = !willWin && dst.t === 'found' && totalFound === 39;
    if (hitAlmost) { G.almostSaid = true; Sound.sfx.almostWon?.(); }
    else if (hitHalfway) { G.halfwaySaid = true; Sound.sfx.halfway?.(); }

    if (!willWin) {
      // Layer 3: Sub-HUD Kinetic Callout Banner
      if (suitCompleted) PopupFX?.banner('13 / 13 HARMONIZED', 'SUIT COMPLETE', 'gold', true);
      else if (comboBanner(ms)) { /* combo promotion took the banner */ }
      else if (hitStretch || hitAlmost) PopupFX?.banner('ENDGAME CONVERGENCE', 'FINAL STRETCH', 'gold', true);
      else if (hitHalfway) PopupFX?.banner('26 / 52 ARCHIVED', 'HALFWAY', 'amber', true);
      else if (wasClutchPop) PopupFX?.banner('LAST-SECOND EXTENSION', 'CLUTCH SAVE', 'amber', true);
      else if (mov.length >= 5) PopupFX?.banner(`${mov.length}-CARD SEQUENCE`, 'MEGA STACK', 'gold', true);
      else if (acePlaced) PopupFX?.banner('FOUNDATION IGNITED', 'ACE ONLINE', 'emerald', false);
      else if (clearedCol) PopupFX?.banner('TABLEAU LANE OPEN', 'COLUMN CLEAR', 'emerald', false);
      else if (kingLocked) PopupFX?.banner('COLUMN SECURED', 'KING ANCHOR', 'amber', false);

      // Layer 4: Mini Companion Reaction Stamp
      if (crossedHigh) PopupFX?.stamp('UNREAL!', 'hype', 'gold', true);
      else if (crossed(20) || suitCompleted || hitAlmost) PopupFX?.stamp("LET'S GO!", 'cheer', 'gold', true);
      else if (crossed(10) || hitHalfway) PopupFX?.stamp('LOCKED IN!', 'hype', 'amber', true);
      else if (wasClutchPop || wasClutch) PopupFX?.stamp('CLUTCH!', 'smug', 'amber', true);
      else if (crossed(5) || acePlaced) PopupFX?.stamp('NICE!', 'cheer', 'emerald', false);
      else if (mov.length >= 4) PopupFX?.stamp('GENIUS!', 'smug', 'gold', false);
      else if (clearedCol || kingLocked) PopupFX?.stamp('CLEAN!', 'smug', 'emerald', false);
      else if (wasFast) PopupFX?.stamp('SO FAST!', 'hype', 'emerald', false);
      else if (flipped && (flippedRank === 1 || flippedRank >= 12)) PopupFX?.stamp('WHOA!', 'wink', 'amber', false);
    }

    if (willWin) {
      /* win() reacts */
    } else if (milestoneFired) {
      if (suitCompleted && G.chain < 10) cutIn('SUIT COMPLETE!');
    } else if (suitCompleted) {
      Companion.react('suitDone');
      cutIn('SUIT COMPLETE!');
    } else if (hitAlmost) {
      Companion.react('almostWon');
    } else if (hitHalfway) {
      Companion.react('halfway');
    } else if (wasClutch) {
      Companion.react('clutch');
    } else if (dst.t === 'found' && G.combo >= 3) {
      Companion.react('combo');
      if (G.combo === 4) cutIn(`COMBO ×${G.combo}!`);
    } else if (acePlaced) {
      Companion.react('aceFound');
    } else if (clearedCol) {
      Companion.react('clearCol');
    } else if (kingLocked) {
      Companion.react('kingPlace');
    } else if (mov.length >= 4) {
      Companion.react('multiMove');
    } else if (wasFast && Companion.lastEv !== 'fastPlay') {
      Companion.react('fastPlay');
    } else if (dst.t === 'found') {
      Companion.react('foundation');
    } else if (flipped) {
      Companion.react('reveal');
    } else {
      Companion.react('place');
    }
  }
  afterMove();
}
