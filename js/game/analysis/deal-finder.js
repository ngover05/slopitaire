/* Slopitaire — finding verified-winnable deals for each difficulty. */
'use strict';

// Shared by the worker and the no-worker fallback: keep shuffling until the variant solver wins a deal that fits the
// difficulty (gentle = solved with little search, tricky = needs a non-obvious line), or settle for the best one seen.
function findVariantDeal(j, randSeedFn, deckFn) {
  const t0 = Date.now(), kind = j.kind || '', patience = kind ? 6000 : 0, V = j.variant;
  const n = V === 'spider' ? 104 : 52;
  const th = DEAL_NODES[V === 'spider' ? 'spider' + j.opt.suits : V] || { gentle: 200, tricky: 1500 };
  let last = null, fallback = null;
  while (Date.now() - t0 < (j.budget || 30000)) {
    const seed = randSeedFn(), deck = deckFn(seed, n);
    last = { seed, deck };
    const r = VSolver.rate(V, deck, Object.assign({ limit: V === 'spider' ? 30000 : 25000, ms: 1500 }, j.opt));
    if (r.won === true) {
      const fits = kind === 'gentle' ? r.nodes <= th.gentle : kind === 'tricky' ? r.nodes > th.tricky : true;
      if (fits) return { id: j.id, seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
      fallback = fallback || { seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
    }
    if (fallback && Date.now() - t0 > patience) return { id: j.id, ...fallback };
  }
  return fallback ? { id: j.id, ...fallback } : { id: j.id, seed: last.seed, deck: last.deck, rated: { won: false, nodes: 0, ok: false } };
}
const findVariantDealSrc = findVariantDeal.toString();

// Keeps dealing until the solver finds an actual winning line under this difficulty's pass limit, then checks the
// deal fits the difficulty. The solver's effort is the difficulty signal: ~100 positions means its first, most
// natural line of play simply wins; hundreds+ means the win needs a non-obvious line.
//  - gentle (Easy): solved within GENTLE_NODES and aces/2s not buried deep in the opening tableau (~20% of deals, ~3 ms per check)
//  - tricky (Hard): needs more than OBVIOUS_NODES, so the obvious line does not win (~75% of 1-pass-winnable deals)
// If no ideal deal turns up in time, the best winnable one seen is used.
// cards stacked on top of each ace in the opening tableau (half weight for 2s)
function openingBurial(deck) {
  let b = 0;
  Solver.deal(deck).t.forEach((col) => col.forEach((c, i) => {
    const r = (c % 13) + 1, over = col.length - 1 - i;
    if (r === 1) b += over; else if (r === 2) b += over / 2;
  }));
  return b;
}
async function findWinnableSync(draw, tok, maxPasses = Infinity, kind = '') {
  const t0 = performance.now(), patience = kind ? 6000 : 0;
  let last = null, fallback = null;
  while (performance.now() - t0 < 60000) {
    const seed = randSeed(), deck = shuffledDeck(seed);
    last = { seed, deck };
    if (kind === 'gentle') {
      const r = Solver.rate(deck, draw, GENTLE_NODES, maxPasses);
      if (r.won === true) {
        if (openingBurial(deck) <= GENTLE_BURY) return { seed, deck, ok: true };
        fallback = fallback || { seed, deck, ok: true };
      } else if (!fallback && performance.now() - t0 > patience && Solver.solve(deck, draw, 25000, maxPasses) === true) {
        fallback = { seed, deck, ok: true };
      }
    } else {
      const r = Solver.rate(deck, draw, 25000, maxPasses);
      if (r.won === true) {
        if (kind !== 'tricky' || r.nodes > OBVIOUS_NODES) return { seed, deck, ok: true };
        fallback = fallback || { seed, deck, ok: true };
      }
    }
    if (fallback && performance.now() - t0 > patience) return fallback;
    await new Promise((r) => setTimeout(r, 0));
    if (tok !== dealToken) break;
  }
  return fallback || { ...last, ok: false };
}
async function findWinnable(draw, tok, maxPasses = Infinity, kind = '') {
  const res = await Analyzer.findDeal(draw, maxPasses, kind);
  if (tok !== dealToken) return { ok: false };
  if (res && !res.fallback && Array.isArray(res.deck)) {
    return { seed: res.seed, deck: res.deck, ok: !!(res.rated && res.rated.ok) };
  }
  return findWinnableSync(draw, tok, maxPasses, kind);
}

// verified deals for the other variants (Spider only at 1–2 suits: 4-suit deals are too costly to prove)
const variantSolvable = (variant, difficulty, suits) => !!DIFF[difficulty].solvable && (variant !== 'spider' || suits <= 2);
async function findVariantWinnable(variant, difficulty, suits, tok) {
  const opt = { suits, maxPasses: variant === 'pyramid' ? PYRAMID_PASSES[difficulty] : Infinity };
  const kind = DIFF[difficulty].deals || '';
  const res = await Analyzer.vfindDeal(variant, kind, opt);
  if (tok !== dealToken) return { ok: false };
  if (res && !res.fallback && Array.isArray(res.deck)) return { seed: res.seed, deck: res.deck, ok: !!(res.rated && res.rated.ok) };
  // no worker: search on the main thread in short slices
  const t0 = performance.now();
  let found = null;
  while (!found && performance.now() - t0 < 8000) {
    found = findVariantDeal({ id: 0, variant, kind: '', opt, budget: 120 }, randSeed, shuffledDeck);
    if (!found.rated.ok) found = null;
    await new Promise((r) => setTimeout(r, 0));
    if (tok !== dealToken) return { ok: false };
  }
  if (found) return { seed: found.seed, deck: found.deck, ok: true };
  const seed = randSeed();
  return { seed, deck: shuffledDeck(seed, VARIANTS[variant].deck), ok: false };
}
