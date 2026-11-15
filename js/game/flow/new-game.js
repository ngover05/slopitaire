/* Slopitaire — starting a new game: picking the deal, switching variants and the deal animation. */
'use strict';

// the opening layout: Klondike deals itself; the others take VSolver.deal() so the solver always sees the same table
function dealLayout() {
  const d = G.deck.slice();
  if (G.variant === 'klondike') {
    for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) G.tab[j].push(cards[d.pop()]);
    G.stock = d.map((id) => cards[id]);
    return;
  }
  const L = VSolver.deal(G.variant, d), cs = (a) => a.map((id) => cards[id]);
  if (L.t) G.tab = L.t.map(cs);
  if (L.p) G.pyr = L.p.map((id) => [cards[id]]);
  if (L.s) G.stock = cs(L.s);
  if (L.w) G.waste = cs(L.w);
}

async function newGame(opts = {}) {
  const tok = ++dealToken;
  Analyzer.stop();
  DOM.shuffleNote.classList.add('hidden');
  stopAutoStep(); autoPaused = false;
  clearTimeout(winModalT); clearTimeout(loseModalT);
  if (winScoreRaf) { cancelAnimationFrame(winScoreRaf); winScoreRaf = null; }
  hideAllOverlays(); clearHints(); stopAutoFinish(); clearTimeout(autoT);
  DOM.btnAutoFinish.classList.add('hidden');
  Sound.ensure();
  if (G && G.started && !G.won) { const st = getStats(); st[SK()].streak = 0; Store.set('stats', st); }
  const restart = opts.restart && G;
  const difficulty = restart ? G.difficulty : settings.difficulty;
  const draw = restart ? G.draw : settings.draw;
  const variant = restart ? G.variant : settings.variant;
  const suits = restart ? G.suits : settings.spiderSuits;
  let deck, seed, verified = false;
  if (restart) { deck = G.deck; seed = G.seed; verified = G.verified; }
  else if (variant === 'klondike' ? DIFF[difficulty].solvable : variantSolvable(variant, difficulty, suits)) {
    busy = true;
    const note = DOM.shuffleNote; const noteT = setTimeout(() => note.classList.remove('hidden'), 250);
    Sound.sfx.shuffle();
    const r = variant === 'klondike'
      ? await findWinnable(draw, tok, DIFF[difficulty].passes[draw], DIFF[difficulty].deals)
      : await findVariantWinnable(variant, difficulty, suits, tok);
    clearTimeout(noteT); note.classList.add('hidden');
    if (tok !== dealToken) return;
    ({ deck, seed } = r); verified = r.ok;
  } else { seed = randSeed(); deck = shuffledDeck(seed, VARIANTS[variant].deck); }

  G = newState(difficulty, draw, deck, seed, verified, variant, suits);
  pyrSel = null;
  gameStepSeq++; resetAutoPlan();
  syncComboHud(false);
  board.classList.remove('lost'); scheduleCheck();
  enterVariant(variant, suits);
  cards.forEach((c) => { c.up = false; c.pile = null; c._rx = null; c._ry = null; c._rz = null; c._rup = false; c.el.classList.remove('covered', 'selected'); });
  dealLayout();
  board.classList.remove('empty');
  updateHUD();
  animateDeal(tok);
  PopupFX?.pill('✿', `DEAL #${G.seed} LIVE`, `${DIFF[G.difficulty].label.toUpperCase()} · ${modeText().toUpperCase()}${G.verified ? ' · VERIFIED' : ''}`, 'emerald');
  Companion.react(restart ? 'restart' : START_EV[variant] || (DIFF[difficulty].solvable && verified ? 'startEasy' : 'start'));
  saveGame();
}

// switch the table over to a variant: faces, slots, measurements
function enterVariant(variant, suits) {
  applyFaces(variant, suits);
  buildSlots(variant);
  layoutDirty = true; lastMeasW = -1;
  measure(true);
}

// the order cards fly out of the deck, and which ones land face up
function dealOrder() {
  const out = [];
  switch (G.variant) {
    case 'klondike':
      for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) out.push(G.tab[j][i]);
      break;
    case 'spider': case 'freecell': {
      const rows = Math.max(...G.tab.map((p) => p.length));
      for (let r = 0; r < rows; r++) G.tab.forEach((p) => { if (p[r]) out.push(p[r]); });
      break;
    }
    default:
      G.pyr.forEach((p) => { if (p[0]) out.push(p[0]); });
      out.push(...G.waste);
  }
  return out;
}
function revealOpening() {
  switch (G.variant) {
    case 'freecell': G.tab.forEach((p) => p.forEach((c) => { c.up = true; })); break;
    case 'pyramid': G.pyr.forEach((p) => p.forEach((c) => { c.up = true; })); break;
    case 'tripeaks':
      G.pyr.forEach((p, i) => { if (p[0] && pyrExposed(i)) p[0].up = true; });
      G.waste.forEach((c) => { c.up = true; });
      break;
    default: G.tab.forEach((p) => { if (p.length) p[p.length - 1].up = true; });
  }
}
function animateDeal(tok) {
  busy = true;
  measure();
  layout({ instant: true });   // places the slots, so the deck can fly out of the stock (FreeCell: from the top centre)
  const sx = slots.stock ? slots.stock._rx : (M.W - M.cw) / 2, sy = slots.stock ? slots.stock._ry : M.topY;
  board.classList.add('no-anim');
  cards.forEach((c, k) => {
    c.el.classList.remove('up', 'celebrate', 'hint', 'shake');
    clearTimeout(c.zt); c.zt = null;
    c.x = sx; c.y = sy; c.z = 10 + k;
    c._rx = sx; c._ry = sy; c._rz = 10 + k; c._rup = false;
    c.el.style.transform = `translate3d(${sx}px,${sy}px,0)`;
    c.el.style.zIndex = 10 + k;
  });
  void board.offsetHeight;
  board.classList.remove('no-anim');
  const order = dealOrder();
  const step = settings.anim === 'off' ? 0 : settings.anim === 'fast' ? 18 : (order.length > 40 ? 22 : 36);
  order.forEach((c, k) => { c.el.style.transitionDelay = (k * step) + 'ms'; });
  layout();
  if (step) Sound.sfx.deal(Math.min(order.length, 40), step / 1000);
  setTimeout(() => {
    cards.forEach((c) => { c.el.style.transitionDelay = ''; });
    if (tok !== dealToken) return;
    revealOpening();
    layout(); Sound.sfx.flip();
    busy = false;
    saveGame();
    scheduleAutoStep(AUTO_STEP_MS);
  }, order.length * step + moveMs() + 40);
}

async function requestNewGame() {
  if (busy && !(G && G.won)) return;
  if (G && G.started && !G.won) {
    const ans = await ask('Start over? Your current game will be lost (；ω；)', [
      { label: 'New deal ✿', value: 'new', primary: true },
      { label: 'Restart this deal', value: 'restart' },
      { label: 'Keep playing', value: null },
    ]);
    if (ans === 'new') newGame();
    else if (ans === 'restart') newGame({ restart: true });
    return;
  }
  newGame();
}
