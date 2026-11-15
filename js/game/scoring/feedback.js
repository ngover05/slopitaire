/* Slopitaire — score & tempo pop-ups, score awards and deal-progress callouts shared by every move. */
'use strict';

// clutch save (played with the gauge nearly empty) or a quick follow-up move
function tempoFloat(dstEl, x) {
  if (x.wasClutchPop) {
    PopupFX?.float(dstEl, '🔥 CLUTCH SAVE!', { kind: 'clutch', tag: `${Math.max(1, Math.round(x.remRatio * 100))}% LEFT`, important: true });
  } else if (x.dtPrev > 0 && x.dtPrev < 1800 && G.chain >= 2) {
    const spLbl = x.dtPrev < 650 ? '⚡ BLITZ SPEED!' : x.dtPrev < 1150 ? '⚡ SNAP!' : '⚡ QUICK!';
    PopupFX?.float(dstEl, spLbl, { kind: 'speed', tag: `${(x.dtPrev / 1000).toFixed(1)}s`, important: x.dtPrev < 950 });
  }
}

// the combo part of the sub-HUD banner; true when it showed something
function comboBanner(ms) {
  if (ms.crossedHigh) PopupFX?.banner('APEX MULTIPLIER ×3.0', `${G.chain}x COMBO`, 'gold', true);
  else if (ms.crossed(20)) PopupFX?.banner('BLITZ MULTIPLIER ×2.0', '20x COMBO', 'gold', true);
  else if (ms.crossed(15)) PopupFX?.banner('BOOST SUSTAINED', '15x COMBO', 'amber', false);
  else if (ms.crossed(10)) PopupFX?.banner('BOOST MULTIPLIER ×1.5', '10x COMBO', 'amber', true);
  else if (ms.crossed(5)) PopupFX?.banner('SURGE MULTIPLIER ×1.2', '5x COMBO', 'emerald', false);
  else return false;
  return true;
}
function scoreFloat(el, pts, mult, tag, important) {
  if (pts <= 0) return;
  PopupFX?.float(el, mult > 1 ? `+${pts} ×${mult.toFixed(1)}` : `+${pts}`, { kind: 'score', tag, important, mult });
}
function scoreAwards() {
  for (const ms of [250, 500, 1000, 2500, 5000]) {
    if (G.score >= ms) PopupFX?.award('score_' + ms, '★', 'SCORE MILESTONE', `${ms.toLocaleString()} PTS`, ms >= 1000 ? 'gold' : 'amber');
  }
  if (G.prevBestScore > 0 && G.score > G.prevBestScore) {
    PopupFX?.award('newBest', '👑', 'NEW BEST SCORE!', `${G.score} PTS RECORD`, 'gold');
  }
}

// the deal's completion share drives the HALFWAY / FINAL STRETCH callouts in every variant
function progressOf() {
  switch (G.variant) {
    case 'spider': { const d = G.found.reduce((s, p) => s + p.length, 0); return { done: d, total: 104, label: 'RUNS CLEARED', unit: 'Cards Home' }; }
    case 'pyramid': return { done: 28 - pyrLeft(), total: 28, label: 'PYRAMID CLEARED', unit: 'Cards Cleared' };
    case 'tripeaks': return { done: 28 - pyrLeft(), total: 28, label: 'PEAKS CLEARED', unit: 'Cards Cleared' };
    default: { const d = G.found.reduce((s, p) => s + p.length, 0); return { done: d, total: 52, label: 'FOUNDATION PROGRESS', unit: 'Cards Home' }; }
  }
}

// halfway (50%) and almost-won (85%) moments, said once per deal; returns which one fired
function progressMoments(willWin) {
  if (willWin) return { hitHalfway: false, hitAlmost: false };
  const { done, total } = progressOf();
  const hitAlmost = done >= Math.ceil(total * 0.85) && !G.almostSaid;
  const hitHalfway = !hitAlmost && done >= total / 2 && !G.halfwaySaid;
  if (hitAlmost) { G.almostSaid = true; G.halfwaySaid = true; Sound.sfx.almostWon?.(); }
  else if (hitHalfway) { G.halfwaySaid = true; Sound.sfx.halfway?.(); }
  return { hitHalfway, hitAlmost };
}
