/* Slopitaire — the ◈ Auto difficulty autopilot (580ms steady cadence). */
'use strict';

const AUTO_STEP_MS = 580;
let autoStepT = null, autoQueue = [], autoPaused = false, gameStepSeq = 0, autoLastSeq = 0;
const autoVisited = new Set();

let autoPlanSeq = 0;
function stopAutoStep() {
  clearTimeout(autoStepT);
  autoStepT = null;
  autoPlanSeq++;
  Analyzer.stop('plan');
  Analyzer.stop('vplan');
}
function resetAutoPlan() {
  stopAutoStep();
  autoQueue = [];
  autoVisited.clear();
  autoLastSeq = gameStepSeq;
}
function scheduleAutoStep(delay = AUTO_STEP_MS) {
  stopAutoStep();
  if (!G || G.difficulty !== 'auto' || G.won || G.lost || autoPaused || busy || document.hidden || anyOverlayOpen()) return;
  autoStepT = setTimeout(runAutoTick, delay);
}

// one step of a variant solver plan, checked against the live table first
function tryExecVariantStep(m) {
  const top = (p) => p[p.length - 1];
  switch (m[0]) {
    case 'tt': {
      const sp = G.tab[m[1]];
      if (!sp || sp.length < m[2]) return false;
      const idx = sp.length - m[2], seq = movableFrom(sp[idx]);
      if (!seq || !canDrop(seq, { t: 'tab', i: m[3] })) return false;
      tabMove({ t: 'tab', i: m[1] }, idx, { t: 'tab', i: m[3] });
      return true;
    }
    case 'tf': case 'cf': {
      const src = m[0] === 'tf' ? { t: 'tab', i: m[1] } : { t: 'cell', i: m[1] };
      const p = pileOf(src);
      if (!p || !p.length) return false;
      const dst = foundTarget(top(p));
      if (!dst) return false;
      tabMove(src, p.length - 1, dst);
      return true;
    }
    case 'ct': {
      const p = G.cells[m[1]];
      if (!p || !p.length || !canDrop(p, { t: 'tab', i: m[2] })) return false;
      tabMove({ t: 'cell', i: m[1] }, 0, { t: 'tab', i: m[2] });
      return true;
    }
    case 'tc': {
      const p = G.tab[m[1]];
      if (!p || !p.length || G.cells[m[2]].length) return false;
      tabMove({ t: 'tab', i: m[1] }, p.length - 1, { t: 'cell', i: m[2] });
      return true;
    }
    case 'deal': {
      if (!G.stock.length || G.tab.some((p) => !p.length)) return false;
      spiderDeal();
      return true;
    }
    case 'k': case 'p': {
      const refs = m.slice(1).map((a) => (a < 0 ? { t: 'waste', i: 0 } : { t: 'pyr', i: a }));
      const cs = refs.map((r) => top(pileOf(r)));
      if (cs.some((c) => !c || !pyrAvailable(c))) return false;
      if (cs.reduce((a, c) => a + c.rank, 0) !== 13) return false;
      pyramidRemove(refs);
      return true;
    }
    case 'd': {
      if (!G.stock.length) return false;
      drawStock();
      return true;
    }
    case 'r': {
      if (G.stock.length || !G.waste.length || !canRecycle()) return false;
      drawStock();
      return true;
    }
    case 't': {
      const p = G.pyr[m[1]], w = top(G.waste);
      if (!p || !p.length || !pyrExposed(m[1]) || !w || !tpAdjacent(p[0], w)) return false;
      peakPlay(m[1]);
      return true;
    }
    default: return false;
  }
}
function tryExecPlanStep(m) {
  if (!m || !G) return false;
  if (G.variant !== 'klondike') return tryExecVariantStep(m);
  switch (m[0]) {
    case 0: {
      const col = m[1], p = G.tab[col];
      if (!p || !p.length || !p[p.length - 1].up) return false;
      const dst = foundTarget(p[p.length - 1]);
      if (!dst) return false;
      moveCards({ t: 'tab', i: col }, p.length - 1, dst);
      return true;
    }
    case 1: {
      if (!G.waste.length) return false;
      const dst = foundTarget(G.waste[G.waste.length - 1]);
      if (!dst) return false;
      moveCards({ t: 'waste', i: 0 }, G.waste.length - 1, dst);
      return true;
    }
    case 2: {
      const fc = m[1], idx = m[2], tc = m[3];
      const sp = G.tab[fc];
      if (!sp || idx < 0 || idx >= sp.length || !sp[idx].up) return false;
      const seq = movableFrom(sp[idx]);
      if (!seq || !canDrop(seq, { t: 'tab', i: tc })) return false;
      moveCards({ t: 'tab', i: fc }, idx, { t: 'tab', i: tc });
      return true;
    }
    case 3: {
      const tc = m[1];
      if (!G.waste.length) return false;
      const c = G.waste[G.waste.length - 1];
      if (!canDrop([c], { t: 'tab', i: tc })) return false;
      moveCards({ t: 'waste', i: 0 }, G.waste.length - 1, { t: 'tab', i: tc });
      return true;
    }
    case 4: {
      if (!G.stock.length) return false;
      drawStock();
      return true;
    }
    case 5: {
      if (G.stock.length || !G.waste.length || !canRecycle()) return false;
      autoQueue.unshift([4]);
      drawStock();
      return true;
    }
    case 6: {
      const suit = m[1], tc = m[2];
      const fi = G.found.findIndex((p) => p.length && p[0].suit === suit);
      if (fi < 0) return false;
      const fp = G.found[fi], c = fp[fp.length - 1];
      if (!canDrop([c], { t: 'tab', i: tc })) return false;
      moveCards({ t: 'found', i: fi }, fp.length - 1, { t: 'tab', i: tc });
      return true;
    }
    default:
      return false;
  }
}
function execAutoFallback() {
  const af = autoFoundStep(true);
  if (af) { doMove(af.src, af.idx, af.dst); return true; }
  const hints = findHints();
  const passCtx = `${G.passes}:${G.stock.length}:${G.waste.length}`;
  for (const h of hints) {
    if (h.draw) { drawStock(); return true; }
    const sp = pileOf(h.src), c = sp[h.idx];
    const sig = `${passCtx}:${c.id}->${h.dst.t}${h.dst.i}`;
    if (autoVisited.has(sig)) continue;
    autoVisited.add(sig);
    doMove(h.src, h.idx, h.dst);
    return true;
  }
  return false;
}
async function runAutoTick() {
  autoStepT = null;
  if (!G || G.difficulty !== 'auto' || G.won || G.lost || autoPaused || document.hidden || anyOverlayOpen()) return false;
  if (busy || drag) { scheduleAutoStep(220); return false; }

  if (gameStepSeq !== autoLastSeq) autoQueue = [];
  const seq = gameStepSeq;
  const tickTok = ++autoPlanSeq;

  const planNow = () => (G.variant === 'klondike'
    ? Analyzer.plan(solverState(), G.draw, passLimit(), 65000)
    : Analyzer.vplan(G.variant, variantState(), Object.assign(variantOpt(), { limit: 60000, ms: 2500 })));
  if (!autoQueue.length && Solver.plan) {
    const planned = await planNow();
    if (tickTok !== autoPlanSeq || seq !== gameStepSeq || !G || G.difficulty !== 'auto' || G.won || G.lost || autoPaused || busy || drag || document.hidden || anyOverlayOpen()) {
      return false;
    }
    if (Array.isArray(planned) && planned.length) {
      autoQueue = planned.slice();
      autoVisited.clear();
    }
  }

  let moved = false;
  if (autoQueue.length) {
    moved = tryExecPlanStep(autoQueue.shift());
    if (!moved && Solver.plan) {
      autoQueue = [];
      const replanned = await planNow();
      if (tickTok !== autoPlanSeq || seq !== gameStepSeq || !G || G.difficulty !== 'auto' || G.won || G.lost || autoPaused || busy || drag || document.hidden || anyOverlayOpen()) {
        return false;
      }
      if (Array.isArray(replanned) && replanned.length) {
        autoQueue = replanned.slice();
        moved = tryExecPlanStep(autoQueue.shift());
      }
    }
  }
  if (!moved) moved = execAutoFallback();
  autoLastSeq = gameStepSeq;
  if (moved && G && G.difficulty === 'auto' && !G.won && !G.lost && !busy && !autoPaused) {
    scheduleAutoStep(AUTO_STEP_MS);
  }
  return moved;
}
function toggleAutoPause() {
  if (!G || G.difficulty !== 'auto' || G.won || G.lost) return autoPaused;
  Sound.ensure();
  autoPaused = !autoPaused;
  ((autoPaused ? Sound.sfx.toggleOff : Sound.sfx.toggleOn) || Sound.sfx.click)?.();
  PopupFX?.pill(
    autoPaused ? '⏸' : '▶',
    autoPaused ? 'AUTOPILOT PAUSED' : 'AUTOPILOT ACTIVE',
    autoPaused ? 'CLICK ◈ AUTO TO RESUME' : 'STEADY PACE ENGAGED',
    autoPaused ? 'amber' : 'emerald',
    { always: true }
  );
  updateHUD();
  if (autoPaused) stopAutoStep();
  else scheduleAutoStep(260);
  return autoPaused;
}
