/* Slopitaire — background check after each move for a game that can no longer be won. */
'use strict';

let stateVer = 0, checkT = null;

// the position in the variant solver's format
function variantState() {
  const ids = (p) => p.map((c) => c.id);
  switch (G.variant) {
    case 'spider': return {
      t: G.tab.map(ids), dn: G.tab.map((p) => { const k = p.findIndex((c) => c.up); return k < 0 ? p.length : k; }),
      s: ids(G.stock), f: G.found.filter((p) => p.length).length,
    };
    case 'freecell': {
      const f = [0, 0, 0, 0];
      G.found.forEach((p) => { if (p.length) f[p[0].suit] = p.length; });
      return { t: G.tab.map(ids), c: G.cells.map((p) => (p.length ? p[0].id : -1)), f };
    }
    case 'pyramid': return { p: G.pyr.map((p) => (p.length ? p[0].id : -1)), s: ids(G.stock), w: ids(G.waste), pass: G.passes };
    case 'tripeaks': return { p: G.pyr.map((p) => (p.length ? p[0].id : -1)), s: ids(G.stock), w: ids(G.waste) };
    default: return null;
  }
}
const variantOpt = () => ({ suits: G.suits, maxPasses: passLimit() });

// Background loss checks run after every move. A Spider or FreeCell proof only ever finishes near the end of a
// game (the space is too big earlier), so they get a smaller budget instead of burning seconds of CPU per move.
const ANALYZE_BUDGET = {
  spider: { limit: 60000, ms: 1200 }, freecell: { limit: 120000, ms: 2000 },
  pyramid: { limit: 250000, ms: 3000 }, tripeaks: { limit: 250000, ms: 3000 },
};
function solverState() {
  const ids = (p) => p.map((c) => c.id);
  const f = [0, 0, 0, 0];
  G.found.forEach((p) => { if (p.length) f[p[0].suit] = p.length; });
  return {
    t: G.tab.map(ids),
    dn: G.tab.map((p) => { const k = p.findIndex((c) => c.up); return k < 0 ? p.length : k; }),
    f, s: ids(G.stock), w: ids(G.waste), p: G.passes,
  };
}
function scheduleCheck() {
  const ver = ++stateVer;
  clearTimeout(checkT);
  const mode = settings.detectLoss;
  if (mode === 'off' || !G || G.won || G.lost || !G.started) { Analyzer.stop('analyze'); return; }
  checkT = setTimeout(() => {
    if (ver !== stateVer || !G || G.won || G.lost || busy) return;
    const job = G.variant === 'klondike'
      ? { id: ver, mode, state: solverState(), draw: G.draw, maxPasses: passLimit(), limit: 250000, ms: 4000 }
      : { id: ver, mode, variant: G.variant, state: variantState(), opt: variantOpt(), ...ANALYZE_BUDGET[G.variant] };
    // on phones a multi-second search after every move heats the CPU and slows everything else down
    if (perfLite()) { job.limit = Math.round(job.limit * 0.4); job.ms = Math.min(job.ms, 1500); }
    Analyzer.run(job, (r) => {
      if (!r || r.id !== stateVer || !G || G.won || G.lost || busy || settings.detectLoss !== mode) return;
      G.analysis = r.result;
      if ((mode === 'solver' && r.result === 'lose') || (mode === 'stuck' && r.result === 'stuck')) declareLost(mode);
    });
  }, 350);
}
