/* Slopitaire — winning and losing a deal: stats, effects and the end-of-game modals' timing. */
'use strict';

const LOSS_TEXT = {
  solver: { banner: 'SOLVER VERIFIED', kicker: '⚠ DEADLOCK DETECTED // NO WINNING PATH', sub: 'Every legal branch was checked — no winning path remains from here.' },
  stuck: { banner: 'NO MOVES LEFT', kicker: '⚠ DEADLOCK DETECTED // NO MOVES LEFT', sub: 'Every legal move was checked — no card can reach a foundation or turn face-up anymore.' },
  stuckPairs: { banner: 'NO MOVES LEFT', kicker: '⚠ DEADLOCK DETECTED // NO MOVES LEFT', sub: 'Every legal move was checked — no card can be cleared from the table anymore.' },
};
function declareLost(mode = 'solver') {
  G.lost = true; G.lossMode = mode; stopAutoStep();
  clearTimeout(loseModalT);
  G.chain = 0; G.chainUntil = 0; G.warnedChain = false;
  syncComboHud(false);
  clearHints(); clearTimeout(autoT); clearTimeout(finishT);
  DOM.btnAutoFinish.classList.add('hidden');
  const st = getStats(); st[SK()].streak = 0; Store.set('stats', st);
  clearPyrSel();
  board.classList.add('lost');
  updateHUD(); saveGame();
  Sound.sfx.lose(); Companion.react('lost');
  StageBG?.pulse('#ff5c6c', 1.1);
  PopupFX?.banner((LOSS_TEXT[mode] || LOSS_TEXT.solver).banner, 'DEADLOCK!', 'danger', true);
  loseModalT = setTimeout(showLost, settings.anim === 'off' ? 120 : 1100);
}

function isWon() {
  if (G.variant === 'pyramid' || G.variant === 'tripeaks') return pyrLeft() === 0;
  return G.found.every((p) => p.length === 13);
}
function checkWin() {
  if (!isWon()) return false;
  win();
  return true;
}
function win() {
  // TriPeaks banks its last run; Pyramid & TriPeaks pay out for every unused stock card
  if (G.variant === 'tripeaks' && G.chain >= 3) bankRun(G.chain, 'win');
  const leftover = G.variant === 'tripeaks' ? G.stock.length * 20 : G.variant === 'pyramid' ? (G.stock.length + G.waste.length) * 10 : 0;
  if (leftover) {
    G.score += leftover;
    PopupFX?.pill('🎁', 'STOCK BONUS', `+${leftover} PTS · ${leftover / (G.variant === 'tripeaks' ? 20 : 10)} CARDS UNUSED`, 'gold', { medal: true });
  }
  clearPyrSel();
  G.won = true; busy = false; clearTimeout(finishT); clearTimeout(autoT); stopAutoStep();
  clearTimeout(winModalT);
  G.warnedChain = false;
  syncComboHud(false);
  DOM.btnAutoFinish.classList.add('hidden');
  const d = DIFF[G.difficulty];
  const bonus = Math.max(0, Math.round(1500 - G.elapsed * 3));
  const finalScore = Math.round((G.score + bonus) * d.mult);
  const gachaReward = (typeof Gacha !== 'undefined' && Gacha.awardWin) ? Gacha.awardWin(finalScore, G.difficulty) : null;
  const st = getStats(), s = st[SK()];
  const prevBest = s.bestScore || 0;
  const recTime = !s.bestTime || G.elapsed < s.bestTime;
  const recScore = finalScore > prevBest;
  s.won++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
  if (recTime) s.bestTime = G.elapsed;
  if (recScore) s.bestScore = finalScore;
  Store.recordGuestStat(SK(), 'won');
  Store.set('stats', st, { immediate: true }); Store.set('save', null, { immediate: true });
  updateHUD();
  Sound.sfx.win(); Companion.react('win'); cutIn('VICTORY!!'); FX.celebrate();
  PopupFX?.banner('STAGE CLEARED', 'VICTORY!!', 'gold', true);
  PopupFX?.stamp('UNREAL!', 'cheer', 'gold', true);
  if (recScore) PopupFX?.award('newBest', '👑', 'NEW BEST SCORE!', `${finalScore} PTS RECORD`, 'gold');
  if (gachaReward && gachaReward.pullsEarned > 0) {
    PopupFX?.pill('🎰', '+' + gachaReward.pullsEarned + (gachaReward.pullsEarned === 1 ? ' PRISM PULL!' : ' PRISM PULLS!'), finalScore.toLocaleString() + ' PTS → GACHA READY', 'gold', { medal: true });
  }
  StageBG?.pulse('#ffe169', 1.4);
  const tops = G.variant === 'tripeaks' ? [G.waste[G.waste.length - 1]] : G.found.map((p) => p[p.length - 1]);
  tops.forEach((c, i) => setTimeout(() => c?.el.classList.add('celebrate'), i * 120));
  winModalT = setTimeout(() => {
    if (!G || !G.won) return;
    if (recTime || recScore) Sound.sfx.newRecord?.();
    showWinModal({ bonus, finalScore, recTime, recScore, gachaReward });
  }, settings.anim === 'off' ? 120 : 1700);
}
