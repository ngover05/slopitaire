/* Slopitaire — the current game (G), pile access and undo snapshots. */
'use strict';

let G = null;          // current game
let busy = false;      // dealing / auto-finishing
let dealToken = 0;
const piles = (n) => Array.from({ length: n }, () => []);
function newState(difficulty, draw, deck, seed, verified, variant = 'klondike', suits = 1) {
  const prevBest = (Store.get('stats', {})?.[statKey(variant, difficulty)]?.bestScore) || 0;
  const pc = PILE_COUNTS[variant];
  return {
    variant, suits, difficulty, draw, deck, seed, verified,
    stock: [], waste: [], found: piles(pc.found), tab: piles(pc.tab), cells: piles(pc.cell), pyr: piles(pc.pyr),
    wasteFan: 0, score: 0, moves: 0, passes: 1, elapsed: 0, started: false, won: false,
    history: [], hintsLeft: DIFF[difficulty].hints, hintIdx: 0,
    chain: 0, maxChain: 0, chainUntil: 0, chainDur: 9500, lastMoveAt: 0,
    warnedChain: false, halfwaySaid: false, almostSaid: false, combo: 0, lastFoundT: 0, swaps: {},
    medals: new Set(), dealFirstMoveAt: 0, openerMoves: 0, prevBestScore: prevBest,
    homed: new Set(),  // cards that already scored a foundation placement this deal
    linked: new Set(), // Spider: cards that already scored a same-suit link this deal
    cellPeak: 0, cellsClearAt: 0, bestRun: 0,
  };
}
const SK = () => statKey(G.variant, G.difficulty);
const V = () => VARIANTS[G ? G.variant : settings.variant];
function pileOf(ref) {
  switch (ref.t) {
    case 'stock': return G.stock;
    case 'waste': return G.waste;
    case 'found': return G.found[ref.i];
    case 'cell': return G.cells[ref.i];
    case 'pyr': return G.pyr[ref.i];
    default: return G.tab[ref.i];
  }
}
function passLimit() {
  if (G.variant === 'klondike') return DIFF[G.difficulty].passes[G.draw];
  if (G.variant === 'pyramid') return PYRAMID_PASSES[G.difficulty];
  return 1;
}
const canRecycle = () => G.variant !== 'tripeaks' && G.variant !== 'spider' && G.passes < passLimit();

function snap() {
  const ids = (p) => p.map((c) => c.id);
  return {
    stock: ids(G.stock), waste: ids(G.waste), found: G.found.map(ids), tab: G.tab.map(ids),
    cells: G.cells.map(ids), pyr: G.pyr.map(ids),
    up: cards.filter((c) => c.up && c.id < useCount).map((c) => c.id),
    score: G.score, moves: G.moves, passes: G.passes, wasteFan: G.wasteFan,
    homed: [...G.homed], linked: [...G.linked],
  };
}
function restore(s) {
  const cs = (a) => a.map((id) => cards[id]);
  const pc = PILE_COUNTS[G.variant];
  G.stock = cs(s.stock); G.waste = cs(s.waste); G.found = s.found.map(cs); G.tab = s.tab.map(cs);
  G.cells = Array.isArray(s.cells) ? s.cells.map(cs) : piles(pc.cell);
  G.pyr = Array.isArray(s.pyr) ? s.pyr.map(cs) : piles(pc.pyr);
  cards.forEach((c) => { c.up = false; c.pile = null; });
  s.up.forEach((id) => { cards[id].up = true; });
  G.score = s.score; G.moves = s.moves; G.passes = s.passes; G.wasteFan = s.wasteFan;
  // older saves have no list: every card currently on a foundation has scored
  G.homed = new Set(Array.isArray(s.homed) ? s.homed : s.found.flat());
  G.linked = new Set(Array.isArray(s.linked) ? s.linked : []);
  pyrSel = null;
}
function pushHistory() {
  G.history.push(snap());
  if (G.history.length > 400) G.history.shift();
}
