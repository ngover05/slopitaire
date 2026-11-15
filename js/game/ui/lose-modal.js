/* Slopitaire — the deadlock (game lost) modal. */
'use strict';

let loseModalT = null;
function showLost() {
  if (!G || !G.lost) return;
  const c = Companion.c, girl = c.kind === 'girl', d = DIFF[G.difficulty];
  const lt = (G.lossMode === 'stuck' && (G.variant === 'pyramid' || G.variant === 'tripeaks') ? LOSS_TEXT.stuckPairs : LOSS_TEXT[G.lossMode]) || LOSS_TEXT.solver;
  StageBG?.pulse('#ff5c6c', 1.1);
  PopupFX?.banner(lt.banner, 'DEADLOCK!', 'danger', true);
  const kick = DOM.loseKicker;
  if (kick) kick.textContent = lt.kicker;

  const lm = DOM.loseMascot;
  if (lm) {
    lm.dataset.partner = c.key;
    lm.removeAttribute('title');
    lm.innerHTML = c.html('full');
    lm.parentElement.dataset.partner = c.key;
    lm.parentElement.removeAttribute('title');
    lm.parentElement.classList.toggle('is-girl', girl);
    lm.parentElement.dataset.mood = 'sad';
  }
  const pn = DOM.losePartnerName, pq = DOM.loseQuote;
  if (pn) pn.textContent = c.name;
  if (pq) pq.textContent = c.line('lost')?.show || 'Every path is blocked… let us try a fresh deal! ♡';

  const sub = DOM.loseSub;
  if (sub) {
    sub.innerHTML = `<b>${d.icon} ${d.label}</b> · ${modeText()} · ${lt.sub}`;
  }

  const prog = progressOf(), foundCards = prog.done;
  const pct = Math.round((foundCards / prog.total) * 100);
  const pt = DOM.loseProgText, pf = DOM.loseProgFill;
  if (pt) pt.textContent = `${foundCards} / ${prog.total} (${pct}%)`;
  if (pf) pf.style.width = pct + '%';
  const pl = document.getElementById('loseProgLabel');
  if (pl) pl.textContent = prog.label;

  const ls = DOM.loseStats;
  if (ls) {
    ls.innerHTML = [
      [`${foundCards} / ${prog.total}`, prog.unit],
      [G.score.toLocaleString(), 'Score'],
      [`×${G.maxChain || 0}`, 'Max Combo'],
      [fmtTime(G.elapsed) === '—' ? '0:00' : fmtTime(G.elapsed), 'Time'],
    ].map(([b, l], i) => `<div class="win-stat" style="--i:${i}"><b>${b}</b><span>${l}</span></div>`).join('');
  }

  const act = DOM.loseActions;
  if (act) {
    act.innerHTML = '';
    const canUndo = d.undo && G.history.length > 0;
    const addBtn = (label, primary, onClick, closeAttr) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn big' + (primary ? ' primary' : '');
      if (closeAttr) b.dataset.close = closeAttr;
      b.textContent = label;
      b.onclick = onClick;
      act.appendChild(b);
    };
    if (canUndo) {
      addBtn('↶ Rewind Move', true, () => { Sound.sfx.click(); hideOverlay('loseModal', true); undo(); });
    }
    addBtn('✿ New Deal', !canUndo, () => { Sound.sfx.click(); newGame(); });
    addBtn('↻ Retry Deal', false, () => { Sound.sfx.click(); newGame({ restart: true }); });
    addBtn('👁 Inspect Board', false, () => { Sound.sfx.click(); hideOverlay('loseModal'); }, 'loseModal');
  }
  showOverlay('loseModal');
}
