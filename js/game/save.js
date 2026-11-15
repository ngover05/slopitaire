/* Slopitaire — saving and resuming the game in progress. */
'use strict';

function saveGame() {
  if (!G) return;
  if (G.won || (G.lost && !DIFF[G.difficulty].undo)) { Store.set('save', null); return; }
  Store.set('save', {
    v: 1, variant: G.variant, suits: G.suits, difficulty: G.difficulty, draw: G.draw, deck: G.deck, seed: G.seed, verified: G.verified,
    state: snap(), elapsed: G.elapsed, started: G.started, hintsLeft: G.hintsLeft === Infinity ? -1 : G.hintsLeft,
    maxChain: G.maxChain || 0, halfwaySaid: !!G.halfwaySaid, almostSaid: !!G.almostSaid, bestRun: G.bestRun || 0,
    medals: G.medals ? [...G.medals] : [],
    history: G.history.slice(-80),
  });
}
function loadGame(sv) {
  dealToken++;
  Analyzer.stop();
  busy = false;
  DOM.shuffleNote.classList.add('hidden');
  autoPaused = false;
  const variant = VARIANTS[sv.variant] ? sv.variant : 'klondike';
  G = newState(sv.difficulty, sv.draw, sv.deck, sv.seed, sv.verified, variant, sv.suits || 1);
  board.classList.remove('lost');
  enterVariant(variant, G.suits);
  cards.forEach((c) => c.el.classList.remove('covered', 'selected'));
  restore(sv.state);
  gameStepSeq++; resetAutoPlan();
  G.elapsed = sv.elapsed || 0; G.started = !!sv.started; G.history = sv.history || [];
  G.hintsLeft = sv.hintsLeft === -1 ? Infinity : sv.hintsLeft;
  G.maxChain = sv.maxChain || 0;
  G.medals = new Set(Array.isArray(sv.medals) ? sv.medals : []);
  G.bestRun = sv.bestRun || 0;
  const { done, total } = progressOf();
  G.halfwaySaid = !!sv.halfwaySaid || done >= total / 2;
  G.almostSaid = !!sv.almostSaid || done >= Math.ceil(total * 0.85);
  // a save made mid-deal may have face-down tableau tops
  revealOpening();
  board.classList.remove('empty');
  cards.forEach((c) => { c.x = null; c._rx = null; c._ry = null; c._rz = null; c._rup = null; });
  syncComboHud(false);
  layout({ instant: true }); updateHUD(); maybeAutoFinish();
  PopupFX?.pill('✿', `DEAL #${G.seed} RESUMED`, `${DIFF[G.difficulty].label.toUpperCase()} · ${modeText().toUpperCase()}`, 'emerald');
  Companion.react('welcome');
  scheduleCheck();
  scheduleAutoStep(AUTO_STEP_MS);
}
function validSave(sv) {
  if (!sv || sv.v !== 1 || !DIFF[sv.difficulty] || !Array.isArray(sv.deck) || !sv.state) return false;
  const variant = sv.variant || 'klondike';
  if (!VARIANTS[variant] || sv.deck.length !== VARIANTS[variant].deck) return false;
  if (variant === 'klondike') return sv.draw === 1 || sv.draw === 3;
  if (variant === 'spider') return [1, 2, 4].includes(sv.suits);
  return true;
}
