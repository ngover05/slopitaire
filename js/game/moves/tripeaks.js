/* Slopitaire — TriPeaks: playing one higher or one lower (Kings wrap to Aces) and banking runs. */
'use strict';

function peakPlay(i, opts = {}) {
  if (opts.record !== false) pushHistory();
  clearHints(); G.hintIdx = 0;
  const c = G.pyr[i].pop();
  const prev = G.waste[G.waste.length - 1];
  c.up = true;
  G.waste.push(c);
  const wrap = !!prev && Math.abs(prev.rank - c.rank) === 12;
  const flips = [];
  for (let k = 0; k < 28; k++) {
    const p = G.pyr[k];
    if (p.length && !p[0].up && pyrExposed(k)) { p[0].up = true; flips.push(p[0]); }
  }
  const peak = VS.TP_ROW[i] === 0;
  const peaksDone = [0, 1, 2].filter((k) => !G.pyr[k].length).length;
  const willWin = pyrLeft() === 0;
  const now = Date.now(), cx = chainCtx(now);
  if (!opts.auto) stepChain(cx, peak ? 2 : 1);
  const { mult } = tierOf(G.chain);
  const pts = Math.round((wrap ? 10 : 5) * mult);
  const peakPts = peak ? Math.round(50 * mult) : 0;
  G.score += pts + peakPts;
  G.bestRun = Math.max(G.bestRun || 0, G.chain);
  const pos = PopupFX?.posOf(c.el);

  G.moves++; gameStepSeq++; startClock();
  layout();

  Sound.sfx.place(G.chain);
  if (flips.length) setTimeout(() => (Sound.sfx.revealCard ? Sound.sfx.revealCard(flips[0].rank) : Sound.sfx.flip()), 90);
  if (peak) (Sound.sfx.peakClear || Sound.sfx.suitDone)?.();
  StageBG?.pulse(peak ? '#ffe169' : null, peak ? 1.0 : 0.3);

  const wEl = slots.waste;
  scoreFloat(wEl, pts, mult, wrap ? 'WRAP' : `RUN ×${G.chain}`, mult >= 1.5);
  if (!opts.auto) {
    if (wrap) PopupFX?.float(wEl, `↻ WRAP! ${Art.RANKS[prev.rank - 1]}↔${Art.RANKS[c.rank - 1]}`, { kind: 'speed', tag: 'K ↔ A', important: true });
    if (peak) {
      PopupFX?.float(pos || c.el, '⛰ PEAK CLEARED!', { kind: 'ace', tag: `${peaksDone} / 3`, important: true });
      scoreFloat(pos || c.el, peakPts, mult, 'PEAK BONUS', true);
    }
    const royal = flips.find((f) => f.rank >= 12);
    if (royal) PopupFX?.float(royal.el, 'ROYAL FLIP!', { kind: 'flip', tag: 'REVEAL', important: false });
    tempoFloat(wEl, cx);
  }

  const cleared = 28 - pyrLeft();
  if (peak) PopupFX?.award('tpPeak1', '⛰', 'FIRST PEAK', '1 / 3 SUMMITS', 'emerald');
  if (peaksDone >= 2) PopupFX?.award('tpPeak2', '⛰', 'TWIN PEAKS', '2 / 3 SUMMITS', 'amber');
  if (wrap) PopupFX?.award('tpWrap', '↻', 'WRAPAROUND', 'KING ↔ ACE', 'violet');
  if (G.chain >= 10) PopupFX?.award('tpRun10', '🔥', 'LONG RUN ×10', 'TEN IN A ROW', 'amber');
  if (G.chain >= 20) PopupFX?.award('tpRun20', '👑', 'MOUNTAIN RUN ×20', 'TWENTY IN A ROW', 'gold');
  if (cleared >= 14) PopupFX?.award('tpHalf', '⛰', 'HALF THE RANGE (14/28)', 'HALFWAY UP', 'amber');
  scoreAwards();

  if (!opts.auto) {
    const ms = comboMilestones(cx.prevChain, willWin);
    const pm = progressMoments(willWin);
    if (!willWin) {
      if (peak) PopupFX?.banner(`PEAK ${peaksDone} / 3 CONQUERED`, 'PEAK CLEARED', 'gold', true);
      else if (comboBanner(ms)) { /* combo promotion took the banner */ }
      else if (pm.hitAlmost) PopupFX?.banner('LAST SUMMIT IN REACH', 'FINAL STRETCH', 'gold', true);
      else if (pm.hitHalfway) PopupFX?.banner(`${cleared} / 28 CLEARED`, 'HALFWAY', 'amber', true);
      else if (cx.wasClutchPop) PopupFX?.banner('LAST-SECOND EXTENSION', 'CLUTCH SAVE', 'amber', true);

      if (ms.crossedHigh) PopupFX?.stamp('UNREAL!', 'hype', 'gold', true);
      else if (ms.crossed(20) || peak || pm.hitAlmost) PopupFX?.stamp("LET'S GO!", 'cheer', 'gold', true);
      else if (ms.crossed(10) || pm.hitHalfway) PopupFX?.stamp('LOCKED IN!', 'hype', 'amber', true);
      else if (cx.wasClutchPop || cx.wasClutch) PopupFX?.stamp('CLUTCH!', 'smug', 'amber', true);
      else if (ms.crossed(5)) PopupFX?.stamp('NICE!', 'cheer', 'emerald', false);
      else if (wrap) PopupFX?.stamp('WHOA!', 'wink', 'amber', false);
      else if (cx.wasFast) PopupFX?.stamp('SO FAST!', 'hype', 'emerald', false);
    }
    if (willWin) {
      /* win() reacts */
    } else if (ms.milestoneFired) {
      if (peak && G.chain < 10) cutIn('PEAK CLEARED!');
    } else if (peak) {
      Companion.react('peakClear');
      cutIn('PEAK CLEARED!');
    } else if (pm.hitAlmost) Companion.react('almostWon');
    else if (pm.hitHalfway) Companion.react('halfway');
    else if (cx.wasClutch) Companion.react('clutch');
    else if (wrap) Companion.react('wrapPlay');
    else if (cx.wasFast && Companion.lastEv !== 'fastPlay') Companion.react('fastPlay');
    else if (flips.some((f) => f.rank === 1 || f.rank >= 12)) Companion.react('reveal');
    else Companion.react('place');
  }
  afterMove();
}

// TriPeaks: the run is cashed in when it ends by drawing or by the gauge running out
function bankRun(len, reason) {
  if (len < 3) return;
  const bonus = 10 * (len - 2);
  G.score += bonus;
  G.bestRun = Math.max(G.bestRun || 0, len);
  PopupFX?.pill('⛰', `RUN ×${len} BANKED`, `+${bonus} PTS`, len >= 10 ? 'gold' : len >= 5 ? 'amber' : 'emerald', { medal: len >= 5 });
  PopupFX?.float(slots.waste || board, `RUN BONUS +${bonus}`, { kind: 'score', tag: `×${len} RUN`, important: len >= 5 });
  Sound.sfx.runBank?.(len);
  StageBG?.pulse('#ffb638', Math.min(1, 0.4 + len * 0.04));
  if (len >= 5 && reason === 'draw') Companion.react('runBanked');
  if (DOM.score) DOM.score.textContent = G.score;
}
