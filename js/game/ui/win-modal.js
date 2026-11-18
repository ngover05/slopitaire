/* Slopitaire — the victory modal. */
'use strict';

let winModalT = null, winScoreRaf = null;
function rollWinScore(target) {
  if (winScoreRaf) { cancelAnimationFrame(winScoreRaf); winScoreRaf = null; }
  const el = DOM.winFinalScore;
  if (!el) return;
  if (settings.anim === 'off' || target <= 0) {
    el.textContent = target.toLocaleString();
    return;
  }
  const t0 = Date.now(), dur = 850;
  el.textContent = '0';
  const step = () => {
    const p = Math.min(1, (Date.now() - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString();
    if (p < 1) winScoreRaf = requestAnimationFrame(step);
    else { el.textContent = target.toLocaleString(); winScoreRaf = null; }
  };
  winScoreRaf = requestAnimationFrame(step);
}
function showWinModal(opts = {}) {
  if (!G) return;
  const c = Companion.c, girl = c.kind === 'girl', d = DIFF[G.difficulty];
  const st = getStats(), s = st[SK()];
  const bonus = opts.bonus !== undefined ? opts.bonus : Math.max(0, Math.round(1500 - G.elapsed * 3));
  const finalScore = opts.finalScore !== undefined ? opts.finalScore : Math.round((G.score + bonus) * d.mult);
  const recTime = !!opts.recTime, recScore = !!opts.recScore;
  const maxCombo = G.maxChain || 0;
  const grade = (G.elapsed <= 150 && maxCombo >= 15) ? 'S+'
    : (G.elapsed <= 240 || maxCombo >= 12) ? 'S'
    : G.elapsed <= 390 ? 'A' : 'B';

  const wm = DOM.winMascot;
  if (wm) {
    wm.dataset.partner = c.key;
    wm.removeAttribute('title');
    wm.innerHTML = c.html('full');
    wm.parentElement.dataset.partner = c.key;
    wm.parentElement.removeAttribute('title');
    wm.parentElement.classList.toggle('is-girl', girl);
    wm.parentElement.dataset.mood = 'cheer';
  }
  const pn = DOM.winPartnerName, pq = DOM.winQuote;
  if (pn) pn.textContent = c.name;
  if (pq) pq.textContent = c.line('win')?.show || 'Stage cleared! ♡';

  const wk = DOM.winKicker;
  if (wk) wk.textContent = grade === 'S+' ? '◈ FLAWLESS PRISM CLEAR' : '◈ STAGE CLEAR';
  const wg = DOM.winGrade;
  if (wg) { wg.textContent = grade; wg.dataset.grade = grade; }

  DOM.winSub.innerHTML = `<b>${d.icon} ${d.label}</b> · ${modeText()}${d.mult !== 1 ? ` · ×${d.mult}` : ''} · Deal #${G.seed}`;

  const wr = DOM.winRecords;
  if (wr) {
    const badges = [];
    if (recScore) badges.push('<span class="record">★ NEW SCORE RECORD ★</span>');
    if (recTime) badges.push('<span class="record">⚡ NEW BEST TIME ⚡</span>');
    wr.innerHTML = badges.join('');
  }

  const rate = Math.round((s.won / Math.max(1, s.played)) * 100);
  const clearTime = fmtTime(G.elapsed) === '—' ? '0:00' : fmtTime(G.elapsed);
  DOM.winStats.innerHTML = [
    [G.score.toLocaleString(), 'Base Score'],
    [`+${bonus.toLocaleString()}`, `Time Bonus${d.mult !== 1 ? ` (×${d.mult})` : ''}`],
    [clearTime, 'Clear Time'],
    [String(G.moves), 'Total Moves'],
    G.variant === 'tripeaks' ? [`×${G.bestRun || maxCombo}`, 'Best Run'] : [`×${maxCombo}`, 'Max Combo'],
    [`🔥 ${s.streak}`, `Win Streak (${rate}%)`],
  ].map(([b, l], i) => `<div class="win-stat" style="--i:${i}"><b>${b}</b><span>${l}</span></div>`).join('');

  renderWinGacha(opts);
  showOverlay('winModal');
  rollWinScore(finalScore);
}

function renderWinGacha(opts = {}) {
  const bar = DOM.winGachaBar;
  const btn = DOM.btnWinGacha;
  if (!bar && !btn) return;
  if (typeof Gacha === 'undefined') {
    bar?.classList.add('hidden');
    btn?.classList.add('hidden');
    return;
  }
  const state = Gacha.getState ? Gacha.getState() : null;
  const reward = opts.gachaReward || null;
  const pointsPerPull = reward?.pointsPerPull || Gacha.POINTS_PER_PULL || 1500;
  const pullsEarned = reward ? (Number(reward.pullsEarned) || 0) : 0;
  const autoExcluded = reward ? !!reward.autoExcluded : (G && G.difficulty === 'auto');
  const boostedMin = !!(reward && reward.boostedMin);
  const nextCarry = reward ? Math.max(0, Number(reward.nextCarry) || 0) : Math.max(0, Number(state?.pointCarry) || 0);
  const totalPullsAvailable = reward ? Math.max(0, Number(reward.totalPullsAvailable) || 0) : Math.max(0, Number(state?.pulls) || 0);
  const ratio = Math.max(0, Math.min(1, nextCarry / Math.max(1, pointsPerPull)));

  if (bar) {
    bar.classList.remove('hidden');
    bar.classList.toggle('is-auto', autoExcluded);
    bar.classList.toggle('is-earned', pullsEarned > 0);
    const badgeText = autoExcluded
      ? '◈ AUTO MODE — MANUAL WINS EARN PULLS'
      : pullsEarned > 0
        ? `+${pullsEarned} PRISM ${pullsEarned === 1 ? 'PULL' : 'PULLS'}`
        : `PRISM GACHA · ${totalPullsAvailable} READY`;
    const chips = [];
    if (boostedMin) chips.push('<span class="wgb-chip is-guarantee">STAGE CLEAR GUARANTEE</span>');
    if (totalPullsAvailable > 0 && !autoExcluded) chips.push(`<span class="wgb-chip is-total">${totalPullsAvailable} TOTAL 🎫</span>`);
    bar.innerHTML =
      `<div class="wgb-top">` +
        `<span class="wgb-badge">${badgeText}</span>` +
        `<span class="wgb-chips">${chips.join('')}</span>` +
      `</div>` +
      `<div class="wgb-meter">` +
        `<div class="wgb-track"><div class="wgb-fill" style="transform:scaleX(${ratio.toFixed(4)})"></div></div>` +
        `<div class="wgb-sub">${nextCarry.toLocaleString()} / ${pointsPerPull.toLocaleString()} PTS TO NEXT PULL</div>` +
      `</div>`;
  }

  if (btn) {
    if (totalPullsAvailable > 0) {
      btn.textContent = `🎰 Pull Skins (${totalPullsAvailable})`;
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }
}
