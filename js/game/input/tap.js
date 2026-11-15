/* Slopitaire — tap / click to move, and the shake feedback for invalid taps. */
'use strict';

function tapCard(c) {
  if (c.pile.t === 'stock') { drawStock(); return; }
  if (G.variant === 'pyramid') { tapPyramid(c); return; }
  if (G.variant === 'tripeaks') { tapPeak(c); return; }
  if (!settings.tapMove) return;
  const mov = movableFrom(c); if (!mov) return;
  const dst = bestTarget(mov, c.pile);
  if (dst) doMove(c.pile, c.idx, dst);
  else {
    mov.forEach(shakeCard);
    Sound.sfx.invalid();
    PopupFX?.float(c.el, '✕ NO MOVE', { kind: 'warn' });
    PopupFX?.stamp('OOPS!', 'oops', 'amber', false);
    if (G.chain > 0) breakChain('miss');
    Companion.react('invalid');
  }
}

function invalidTap(c, label = '✕ NO MOVE') {
  shakeCard(c);
  Sound.sfx.invalid();
  PopupFX?.float(c.el, label, { kind: 'warn' });
  PopupFX?.stamp('OOPS!', 'oops', 'amber', false);
  if (G.chain > 0) breakChain('miss');
  Companion.react('invalid');
}

// Pyramid taps: a King goes alone; otherwise pick one card, then its partner. With tap-to-move on, a card that has
// exactly one possible partner pairs straight away.
function tapPyramid(c) {
  if (!pyrAvailable(c)) { if (c.pile.t === 'pyr') invalidTap(c, '✕ COVERED'); return; }
  const ref = c.pile;
  if (c.rank === 13) { pyramidRemove([ref]); return; }
  if (pyrSel) {
    const sp = pileOf(pyrSel), o = sp[sp.length - 1];
    if (o === c) { clearPyrSel(); Sound.sfx.click(); return; }
    if (o && pyrAvailable(o) && o.rank + c.rank === 13) { const a = pyrSel; pyrSel = null; o.el.classList.remove('selected'); pyramidRemove([a, ref]); return; }
    clearPyrSel();
  }
  const partners = pyrAvail().filter((a) => a.c !== c && a.c.rank + c.rank === 13);
  if (settings.tapMove && partners.length === 1) { pyramidRemove([ref, partners[0].ref]); return; }
  pyrSel = { t: ref.t, i: ref.i };
  c.el.classList.add('selected');
  Sound.sfx.pick();
  if (!partners.length) PopupFX?.float(c.el, `NEEDS ${Art.RANKS[12 - c.rank]}`, { kind: 'info', tag: 'NO PARTNER YET' });
  Companion.react('pick');
}
function tapPeak(c) {
  if (c.pile.t !== 'pyr') return;
  const top = G.waste[G.waste.length - 1];
  if (!c.up || !pyrExposed(c.pile.i)) { invalidTap(c, '✕ COVERED'); return; }
  if (top && tpAdjacent(c, top)) { peakPlay(c.pile.i); return; }
  invalidTap(c, `✕ NEEDS ${Art.RANKS[(top.rank + 11) % 13]} / ${Art.RANKS[top.rank % 13]}`);
}
function shakeCard(c) { shakeEl(c.el); }
function shakeEl(el) {
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
}
