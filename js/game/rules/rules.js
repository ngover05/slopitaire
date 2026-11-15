/* Slopitaire — legal moves: drops, movable stacks, foundation targets and safe auto-moves. */
'use strict';

// FreeCell: the longest sequence that can move at once (free cells + 1, doubled for each empty column)
function fcCapacity(toEmpty) {
  const free = G.cells.filter((p) => !p.length).length;
  const empty = G.tab.filter((p) => !p.length).length - (toEmpty ? 1 : 0);
  return (free + 1) * (1 << Math.max(0, empty));
}
const freeCells = () => G.cells.filter((p) => !p.length).length;

function canDrop(mov, ref) {
  const c = mov[0];
  switch (G.variant) {
    case 'spider': {
      if (ref.t !== 'tab') return false;
      const p = G.tab[ref.i];
      if (!p.length) return true;
      const top = p[p.length - 1];
      return top.up && top.rank === c.rank + 1;
    }
    case 'freecell': {
      if (ref.t === 'cell') return mov.length === 1 && c.pile?.t !== 'cell' && !G.cells[ref.i].length;
      if (ref.t === 'tab') {
        const p = G.tab[ref.i];
        if (mov.length > fcCapacity(!p.length)) return false;
        if (!p.length) return true;
        const top = p[p.length - 1];
        return top.red !== c.red && top.rank === c.rank + 1;
      }
      break;
    }
    case 'pyramid': {
      // "dropping" pairs the card with whatever it lands on; Kings are dropped on the discard pile
      if (mov.length !== 1 || !pyrAvailable(c)) return false;
      if (ref.t === 'found') return c.rank === 13;
      const p = pileOf(ref), o = p[p.length - 1];
      return !!o && o !== c && pyrAvailable(o) && o.rank + c.rank === 13;
    }
    case 'tripeaks': {
      if (ref.t !== 'waste' || mov.length !== 1) return false;
      const top = G.waste[G.waste.length - 1];
      return !!top && c.pile?.t === 'pyr' && c.up && pyrExposed(c.pile.i) && tpAdjacent(c, top);
    }
    default: break;
  }
  if (ref.t === 'found') {
    if (mov.length !== 1) return false;
    const p = G.found[ref.i];
    if (!p.length) return c.rank === 1;
    const top = p[p.length - 1];
    return top.suit === c.suit && top.rank === c.rank - 1;
  }
  if (ref.t === 'tab') {
    const p = G.tab[ref.i];
    if (!p.length) return c.rank === 13;
    const top = p[p.length - 1];
    return top.up && top.red !== c.red && top.rank === c.rank + 1;
  }
  return false;
}
function movableFrom(c) {
  const ref = c.pile; if (!ref || !c.up) return null;
  const p = pileOf(ref);
  switch (G.variant) {
    case 'spider': {
      if (ref.t !== 'tab') return null;
      const seq = p.slice(c.idx);
      for (let k = 1; k < seq.length; k++) {
        if (!seq[k].up || seq[k].suit !== seq[k - 1].suit || seq[k].rank !== seq[k - 1].rank - 1) return null;
      }
      return seq;
    }
    case 'freecell': {
      if (ref.t === 'cell') return [c];
      if (ref.t !== 'tab') return null;
      const seq = p.slice(c.idx);
      for (let k = 1; k < seq.length; k++) {
        if (seq[k].red === seq[k - 1].red || seq[k].rank !== seq[k - 1].rank - 1) return null;
      }
      return seq.length <= fcCapacity(false) ? seq : null;
    }
    case 'pyramid': return pyrAvailable(c) ? [c] : null;
    case 'tripeaks': return ref.t === 'pyr' && pyrExposed(ref.i) ? [c] : null;
    default: break;
  }
  if (ref.t === 'tab') {
    const seq = p.slice(c.idx);
    for (let k = 1; k < seq.length; k++) {
      if (!seq[k].up || seq[k].red === seq[k - 1].red || seq[k].rank !== seq[k - 1].rank - 1) return null;
    }
    return seq;
  }
  if ((ref.t === 'waste' || ref.t === 'found') && c.idx === p.length - 1) return [c];
  return null;
}
function foundTarget(c) {
  if (G.variant !== 'klondike' && G.variant !== 'freecell') return null;
  for (let i = 0; i < 4; i++) if (canDrop([c], { t: 'found', i })) return { t: 'found', i };
  return null;
}
function bestTarget(mov, src) {
  if (G.variant === 'spider') {
    // same suit first (it keeps the run movable), then any suit, then an empty column
    let any = null, empty = null;
    const c = mov[0];
    // a tap never makes the table worse: a run already on its own suit stays put, and one already built on
    // another suit only moves to its own suit
    const under = src.t === 'tab' && c.idx > 0 ? G.tab[src.i][c.idx - 1] : null;
    const onLink = !!under && under.up && under.rank === c.rank + 1;
    if (onLink && under.suit === c.suit) return null;
    for (let i = 0; i < G.tab.length; i++) {
      if (src.t === 'tab' && src.i === i) continue;
      const p = G.tab[i];
      if (!canDrop(mov, { t: 'tab', i })) continue;
      if (!p.length) { if (empty === null) empty = i; continue; }
      if (p[p.length - 1].suit === c.suit) return { t: 'tab', i };
      if (any === null) any = i;
    }
    if (onLink) return null;
    if (any !== null) return { t: 'tab', i: any };
    if (empty !== null && !(src.t === 'tab' && mov[0].idx === 0)) return { t: 'tab', i: empty };
    return null;
  }
  if (G.variant === 'freecell') {
    if (mov.length === 1) { const f = foundTarget(mov[0]); if (f) return f; }
    let empty = null;
    for (let i = 0; i < G.tab.length; i++) {
      if (src.t === 'tab' && src.i === i) continue;
      if (!canDrop(mov, { t: 'tab', i })) continue;
      if (G.tab[i].length) return { t: 'tab', i };
      if (empty === null) empty = i;
    }
    if (empty !== null && !(src.t === 'tab' && mov[0].idx === 0)) return { t: 'tab', i: empty };
    if (mov.length === 1 && src.t === 'tab') {
      const k = G.cells.findIndex((p) => !p.length);
      if (k >= 0) return { t: 'cell', i: k };
    }
    return null;
  }
  if (mov.length === 1 && src.t !== 'found') { const f = foundTarget(mov[0]); if (f) return f; }
  let empty = null;
  for (let i = 0; i < 7; i++) {
    if (src.t === 'tab' && src.i === i) continue;
    if (!canDrop(mov, { t: 'tab', i })) continue;
    if (G.tab[i].length) return { t: 'tab', i };
    if (empty === null) empty = i;
  }
  if (empty !== null && !(src.t === 'tab' && mov[0].idx === 0)) return { t: 'tab', i: empty };
  return null;
}
function foundRankOfSuit(s) {
  for (const p of G.found) if (p.length && p[0].suit === s) return p.length;
  return 0;
}
function safeToFound(c) {
  if (c.rank <= 2) return true;
  const opp = c.red ? [2, 3] : [0, 1];
  return opp.every((s) => foundRankOfSuit(s) >= c.rank - 1);
}
function autoFoundStep(onlySafe) {
  if (G.variant !== 'klondike' && G.variant !== 'freecell') return null;
  const cand = [];
  if (G.waste.length) cand.push({ c: G.waste[G.waste.length - 1], src: { t: 'waste', i: 0 }, idx: G.waste.length - 1 });
  G.tab.forEach((p, i) => { if (p.length) cand.push({ c: p[p.length - 1], src: { t: 'tab', i }, idx: p.length - 1 }); });
  G.cells.forEach((p, i) => { if (p.length) cand.push({ c: p[0], src: { t: 'cell', i }, idx: 0 }); });
  cand.sort((a, b) => a.c.rank - b.c.rank);
  for (const k of cand) {
    if (onlySafe && !safeToFound(k.c)) continue;
    const d = foundTarget(k.c);
    if (d) return { src: k.src, idx: k.idx, dst: d };
  }
  return null;
}
