/* Slopitaire — move hints. */
'use strict';

let hintT = null;   // clears the hint highlight

function findVariantHints() {
  const out = [];
  const tabRefs = G.tab.map((_, i) => ({ t: 'tab', i }));
  if (G.variant === 'spider') {
    G.tab.forEach((p, i) => {
      const fu = p.findIndex((c) => c.up);
      if (fu < 0) return;
      for (let idx = fu; idx < p.length; idx++) {
        const seq = movableFrom(p[idx]);
        if (!seq) continue;
        const reveals = idx === fu && fu > 0;
        for (const ref of tabRefs) {
          if (ref.i === i || !canDrop(seq, ref)) continue;
          const q = G.tab[ref.i], top = q[q.length - 1];
          const sameSuit = top && top.suit === seq[0].suit;
          const breaksLink = idx > fu && p[idx - 1].rank === seq[0].rank + 1 && p[idx - 1].suit === seq[0].suit;
          if (breaksLink && !sameSuit) continue;
          let pri = 0;
          if (!q.length) pri = reveals ? 55 : idx === 0 ? 0 : 20;
          else if (sameSuit) pri = reveals ? 95 : breaksLink ? 0 : 85;
          else pri = reveals ? 75 : idx === 0 ? 45 : 35;
          if (pri) out.push({ src: { t: 'tab', i }, idx, dst: ref, pri });
        }
      }
    });
    if (G.stock.length && G.tab.every((p) => p.length)) out.push({ draw: true, pri: 10 });
  } else if (G.variant === 'freecell') {
    const tops = [];
    G.tab.forEach((p, i) => { if (p.length) tops.push({ src: { t: 'tab', i }, idx: p.length - 1, c: p[p.length - 1] }); });
    G.cells.forEach((p, i) => { if (p.length) tops.push({ src: { t: 'cell', i }, idx: 0, c: p[0] }); });
    for (const t of tops) { const d = foundTarget(t.c); if (d) out.push({ src: t.src, idx: t.idx, dst: d, pri: 100 - t.c.rank }); }
    G.cells.forEach((p, k) => {
      if (!p.length) return;
      for (const ref of tabRefs) if (G.tab[ref.i].length && canDrop(p, ref)) { out.push({ src: { t: 'cell', i: k }, idx: 0, dst: ref, pri: 70 }); break; }
    });
    G.tab.forEach((p, i) => {
      for (let idx = 0; idx < p.length; idx++) {
        const seq = movableFrom(p[idx]);
        if (!seq) continue;
        for (const ref of tabRefs) {
          if (ref.i === i || !G.tab[ref.i].length || !canDrop(seq, ref)) continue;
          const freed = idx > 0 ? p[idx - 1] : null;
          out.push({ src: { t: 'tab', i }, idx, dst: ref, pri: !freed ? 65 : foundTarget(freed) ? 80 : 50 });
          break;
        }
      }
      const free = G.cells.findIndex((q) => !q.length);
      if (free >= 0 && p.length >= 2 && foundTarget(p[p.length - 2])) out.push({ src: { t: 'tab', i }, idx: p.length - 1, dst: { t: 'cell', i: free }, pri: 60 });
    });
    const empty = G.tab.findIndex((p) => !p.length);
    if (empty >= 0) {
      G.tab.forEach((p, i) => {
        if (p.length < 2) return;
        for (let idx = 1; idx < p.length; idx++) {
          if (movableFrom(p[idx]) && canDrop(p.slice(idx), { t: 'tab', i: empty })) { out.push({ src: { t: 'tab', i }, idx, dst: { t: 'tab', i: empty }, pri: 30 }); break; }
        }
      });
    }
  } else if (G.variant === 'pyramid') {
    const av = pyrAvail();
    av.forEach((a) => { if (a.c.rank === 13) out.push({ src: a.ref, idx: pileOf(a.ref).length - 1, dst: { t: 'found', i: 0 }, pri: 100 }); });
    for (let x = 0; x < av.length; x++) {
      for (let y = x + 1; y < av.length; y++) {
        if (av[x].c.rank + av[y].c.rank !== 13) continue;
        const waste = av[x].ref.t === 'waste' || av[y].ref.t === 'waste';
        const a = waste && av[x].ref.t === 'waste' ? av[y] : av[x], b = a === av[x] ? av[y] : av[x];
        out.push({ src: a.ref, idx: pileOf(a.ref).length - 1, dst: b.ref, pri: waste ? 80 : 90 });
      }
    }
    if (G.stock.length || (G.waste.length && canRecycle())) out.push({ draw: true, pri: 10 });
  } else if (G.variant === 'tripeaks') {
    const top = G.waste[G.waste.length - 1];
    for (let i = 0; i < 28; i++) {
      const p = G.pyr[i];
      if (p.length && p[0].up && pyrExposed(i) && top && tpAdjacent(p[0], top)) out.push({ src: { t: 'pyr', i }, idx: 0, dst: { t: 'waste', i: 0 }, pri: 60 + (3 - VS.TP_ROW[i]) * 5 });
    }
    if (G.stock.length) out.push({ draw: true, pri: 10 });
  }
  return out.sort((a, b) => b.pri - a.pri);
}
function findHints() {
  if (G.variant !== 'klondike') return findVariantHints();
  const out = [];
  const tops = [];
  if (G.waste.length) tops.push({ src: { t: 'waste', i: 0 }, idx: G.waste.length - 1 });
  G.tab.forEach((p, i) => { if (p.length) tops.push({ src: { t: 'tab', i }, idx: p.length - 1 }); });
  for (const t of tops) {
    const c = pileOf(t.src)[t.idx], d = foundTarget(c);
    if (d) out.push({ ...t, dst: d, pri: 100 - c.rank });
  }
  G.tab.forEach((p, i) => {
    const fu = p.findIndex((c) => c.up); if (fu < 0) return;
    for (let idx = fu; idx < p.length; idx++) {
      const seq = p.slice(idx);
      let pri = 0;
      if (idx === fu && fu > 0) pri = 80;
      else if (idx === 0) pri = 30;
      else if (foundTarget(p[idx - 1])) pri = 60;
      if (!pri) continue;
      for (let j = 0; j < 7; j++) {
        if (j === i || !canDrop(seq, { t: 'tab', i: j })) continue;
        if (idx === 0 && !G.tab[j].length) continue;
        out.push({ src: { t: 'tab', i }, idx, dst: { t: 'tab', i: j }, pri });
        break;
      }
    }
  });
  if (G.waste.length) {
    const c = G.waste[G.waste.length - 1];
    for (let j = 0; j < 7; j++) {
      if (!canDrop([c], { t: 'tab', i: j })) continue;
      out.push({ src: { t: 'waste', i: 0 }, idx: G.waste.length - 1, dst: { t: 'tab', i: j }, pri: G.tab[j].length ? 50 : 45 });
      break;
    }
  }
  if (G.stock.length || (G.waste.length && canRecycle())) out.push({ draw: true, pri: 10 });
  return out.sort((a, b) => b.pri - a.pri);
}
function clearHints() {
  clearTimeout(hintT);
  board.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
}
function hint() {
  if (!G || G.won || G.lost || busy) return;
  noteActivity();
  const d = DIFF[G.difficulty];
  if (d.hints === 0) {
    toast('Hints are off in Hard mode ✧');
    Sound.sfx.invalid();
    PopupFX?.float(DOM.btnHint, 'HINTS OFF', { kind: 'warn', tag: 'HARD MODE', important: true });
    Companion.react('hintNone');
    return;
  }
  const list = findHints();
  if (!list.length) {
    Companion.react('noMoves'); Sound.sfx.invalid();
    PopupFX?.float(DOM.btnHint, 'NO MOVES', { kind: 'warn', important: true });
    toast(d.undo ? 'No moves left… try Undo or a New game' : 'No moves left… time for a New game ✿');
    return;
  }
  if (d.hints !== Infinity) {
    if (G.hintsLeft <= 0) {
      toast('No hints left this game (｡•́︿•̀｡)');
      Sound.sfx.invalid();
      PopupFX?.float(DOM.btnHint, '0 HINTS', { kind: 'warn', important: true });
      Companion.react('hintNone');
      return;
    }
    G.hintsLeft--;
  }
  const h = list[G.hintIdx % list.length]; G.hintIdx++;
  clearHints();
  let targetEl = null;
  if (h.draw) {
    targetEl = G.stock.length ? G.stock[G.stock.length - 1].el : slots.stock;
    targetEl.classList.add('hint');
    if (G.variant === 'spider') G.stock.slice(-10).forEach((c) => c.el.classList.add('hint'));
  } else {
    const seq = pileOf(h.src).slice(h.idx);
    seq.forEach((c) => c.el.classList.add('hint'));
    const dp = pileOf(h.dst);
    targetEl = dp.length ? dp[dp.length - 1].el : slotEl(h.dst);
    targetEl.classList.add('hint');
    targetEl = seq[0]?.el || targetEl;
  }
  Sound.sfx.hint();
  PopupFX?.float(targetEl, '✧ HINT', {
    kind: 'info',
    tag: d.hints === Infinity ? 'GUIDE' : `${G.hintsLeft} LEFT`,
    important: true,
  });
  Companion.react('hint');
  hintT = setTimeout(clearHints, 1800);
  updateHUD(); saveGame();
}
