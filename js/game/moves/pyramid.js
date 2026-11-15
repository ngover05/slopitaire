/* Slopitaire — Pyramid: removing pairs that add up to 13. */
'use strict';

let pyrSel = null;     // Pyramid: the card picked first when pairing by taps

function clearPyrSel() {
  if (pyrSel) { const p = pileOf(pyrSel); p[p.length - 1]?.el.classList.remove('selected'); }
  pyrSel = null;
}
function pyramidRemove(refs, opts = {}) {
  if (opts.record !== false) pushHistory();
  clearHints(); G.hintIdx = 0; clearPyrSel();
  const rowsBefore = [0, 1, 2, 3, 4, 5, 6].map(rowCleared);
  const out = refs.map((r) => pileOf(r).pop());
  out.forEach((c) => { c.el.classList.remove('covered'); G.found[0].push(c); });
  const now = Date.now(), cx = chainCtx(now);
  const king = out.length === 1;
  const fromWaste = refs.some((r) => r.t === 'waste');
  const rows = [];
  for (let r = 6; r >= 0; r--) if (!rowsBefore[r] && rowCleared(r)) rows.push(r);
  const willWin = pyrLeft() === 0;
  if (!opts.auto) stepChain(cx, 1 + rows.length);
  const { mult } = tierOf(G.chain);
  const pts = Math.round(10 * mult);
  const rowPts = rows.length ? Math.round(25 * rows.length * mult) : 0;
  G.score += pts + rowPts;

  G.moves++; gameStepSeq++; startClock();
  const el0 = out[0].el, pos = PopupFX?.posOf(el0);
  layout();

  (Sound.sfx.pairMatch || ((ch) => Sound.sfx.foundation(13, ch)))(G.chain, king);
  if (rows.length) (Sound.sfx.rowClear || Sound.sfx.clearCol)?.();
  StageBG?.pulse(king ? '#ffb638' : '#2ce8a2', rows.length ? 0.9 : 0.5);
  setTimeout(() => sparkleAt(slots.found[0]), moveMs() * 0.8);

  const at = pos || el0;
  const lbl = (c) => Art.RANKS[c.rank - 1];
  scoreFloat(at, pts, mult, king ? 'KING' : 'PAIR', mult >= 1.5);
  if (king) PopupFX?.float(at, '♛ KING SOLO!', { kind: 'king', tag: '13 ALONE', important: true });
  else if (fromWaste) PopupFX?.float(at, `DECK PAIR! ${lbl(out[0])}+${lbl(out[1])}`, { kind: 'ace', tag: '= 13', important: false });
  else PopupFX?.float(at, `PAIR 13! ${lbl(out[0])}+${lbl(out[1])}`, { kind: 'ace', tag: '= 13', important: false });
  rows.forEach((r) => {
    PopupFX?.float(at, '⚡ ROW CLEAR!', { kind: 'clear', tag: `ROW ${7 - r} / 7`, important: true });
    scoreFloat(at, Math.round(25 * mult), mult, 'ROW BONUS', true);
  });
  tempoFloat(at, cx);

  const removed = 28 - pyrLeft();
  PopupFX?.award('pyrFirst', '🔺', 'FIRST PAIR', 'THE PYRAMID CRACKS', 'emerald');
  if (rows.length) PopupFX?.award('pyrRow', '⚡', 'FIRST ROW DOWN', 'BASE OF THE PYRAMID BROKEN', 'emerald');
  if (removed >= 14) PopupFX?.award('pyrHalf', '🔺', 'HALF PYRAMID (14/28)', 'HALFWAY TO THE SUMMIT', 'amber');
  if (!willWin && pyrExposed(0) && removed === 27) PopupFX?.award('pyrSummit', '⛰', 'SUMMIT EXPOSED', 'ONE CARD TO GO', 'gold');
  if (king) PopupFX?.award('pyrKing', '♛', 'KING SOLO', 'KINGS LEAVE ALONE', 'amber');
  scoreAwards();

  let ms = { crossed: () => false, crossedHigh: false, milestoneFired: false }, pm = { hitHalfway: false, hitAlmost: false };
  if (!opts.auto) {
    G.combo = now - (G.lastFoundT || 0) < 4500 ? (G.combo || 0) + 1 : 1;
    G.lastFoundT = now;
    ms = comboMilestones(cx.prevChain, willWin);
    pm = progressMoments(willWin);
    if (!willWin) {
      if (rows.length) PopupFX?.banner(`ROW ${7 - rows[0]} DISMANTLED`, 'ROW CLEAR', 'gold', true);
      else if (comboBanner(ms)) { /* combo promotion took the banner */ }
      else if (pm.hitAlmost) PopupFX?.banner('SUMMIT IN SIGHT', 'FINAL STRETCH', 'gold', true);
      else if (pm.hitHalfway) PopupFX?.banner(`${removed} / 28 CLEARED`, 'HALFWAY', 'amber', true);
      else if (cx.wasClutchPop) PopupFX?.banner('LAST-SECOND EXTENSION', 'CLUTCH SAVE', 'amber', true);
      else if (king) PopupFX?.banner('THIRTEEN ON ITS OWN', 'KING SOLO', 'amber', false);

      if (ms.crossedHigh) PopupFX?.stamp('UNREAL!', 'hype', 'gold', true);
      else if (ms.crossed(20) || pm.hitAlmost || rows.some((r) => r <= 2)) PopupFX?.stamp("LET'S GO!", 'cheer', 'gold', true);
      else if (ms.crossed(10) || pm.hitHalfway) PopupFX?.stamp('LOCKED IN!', 'hype', 'amber', true);
      else if (cx.wasClutchPop || cx.wasClutch) PopupFX?.stamp('CLUTCH!', 'smug', 'amber', true);
      else if (ms.crossed(5) || rows.length) PopupFX?.stamp('NICE!', 'cheer', 'emerald', false);
      else if (king) PopupFX?.stamp('CLEAN!', 'smug', 'emerald', false);
      else if (cx.wasFast) PopupFX?.stamp('SO FAST!', 'hype', 'emerald', false);
    }
    if (willWin) {
      /* win() reacts */
    } else if (ms.milestoneFired) {
      if (rows.length && G.chain < 10) cutIn('ROW CLEAR!');
    } else if (rows.length) {
      Companion.react('rowClear');
      if (rows.some((r) => r <= 3)) cutIn('ROW CLEAR!');
    } else if (pm.hitAlmost) Companion.react('almostWon');
    else if (pm.hitHalfway) Companion.react('halfway');
    else if (cx.wasClutch) Companion.react('clutch');
    else if (G.combo >= 4 && G.combo % 2 === 0) Companion.react('combo');
    else if (king) Companion.react('kingSolo');
    else if (cx.wasFast && Companion.lastEv !== 'fastPlay') Companion.react('fastPlay');
    else Companion.react('pairMatch');
  }
  afterMove();
}
