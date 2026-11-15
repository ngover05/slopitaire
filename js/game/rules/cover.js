/* Slopitaire — Pyramid & TriPeaks cover rules: which cards are exposed and playable. */
'use strict';

const VS = VSolver;   // shared cover maps for Pyramid & TriPeaks

const coverOf = (i) => (G.variant === 'pyramid' ? VS.PYR_COVER : VS.TP_COVER)[i];
function pyrExposed(i) {
  if (!G.pyr[i] || !G.pyr[i].length) return false;
  const cv = coverOf(i);
  return !cv.length || (!G.pyr[cv[0]].length && !G.pyr[cv[1]].length);
}
const pyrLeft = () => G.pyr.reduce((s, p) => s + p.length, 0);

// Pyramid: every card that can be paired right now (exposed pyramid cards and the waste top)
function pyrAvail() {
  const out = [];
  for (let i = 0; i < 28; i++) if (pyrExposed(i)) out.push({ ref: { t: 'pyr', i }, c: G.pyr[i][0] });
  if (G.waste.length) out.push({ ref: { t: 'waste', i: 0 }, c: G.waste[G.waste.length - 1] });
  return out;
}
function pyrAvailable(c) {
  if (!c.pile) return false;
  if (c.pile.t === 'pyr') return pyrExposed(c.pile.i);
  return c.pile.t === 'waste' && c.idx === G.waste.length - 1;
}
const tpAdjacent = (a, b) => { const d = Math.abs(a.rank - b.rank); return d === 1 || d === 12; };
const rowCleared = (r) => G.pyr.every((p, i) => VS.PYR_ROW[i] !== r || !p.length);
