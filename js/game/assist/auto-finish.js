/* Slopitaire — auto-finish once a deal can be sent home without choices. */
'use strict';

let finishT = null;   // next auto-finish step

function autoFinishReady() {
  if (G.variant === 'klondike') return !G.stock.length && !G.waste.length && G.tab.every((p) => p.every((c) => c.up));
  // FreeCell: once every column runs high-to-low, the cards can always be sent home in order
  if (G.variant === 'freecell') return G.tab.every((p) => p.every((c, k) => k === 0 || p[k - 1].rank >= c.rank)) && G.found.some((p) => p.length);
  return false;
}
function maybeAutoFinish() {
  const btn = DOM.btnAutoFinish;
  if (!G || G.won || busy) { btn.classList.add('hidden'); return; }
  const ready = autoFinishReady();
  if (!ready) { btn.classList.add('hidden'); return; }
  PopupFX?.award('autoReady', '✨', 'AUTO-FINISH READY', G.variant === 'freecell' ? 'EVERY COLUMN IN ORDER' : 'ALL CARDS REVEALED', 'gold');
  if (settings.autoFinish) runAutoFinish();
  else btn.classList.remove('hidden');
}
function runAutoFinish() {
  if (busy || !G || G.won) return;
  DOM.btnAutoFinish.classList.add('hidden');
  clearTimeout(autoT);
  pushHistory();
  busy = true;
  Companion.react('autoFinish');
  PopupFX?.banner(G.variant === 'freecell' ? 'EVERY COLUMN IN ORDER' : 'ALL CARDS REVEALED', 'AUTO-FINISH!', 'gold', true);
  PopupFX?.stamp("LET'S GO!", 'hype', 'gold', true);
  const stepMs = settings.anim === 'off' ? 40 : settings.anim === 'fast' ? 70 : 110;
  let stepCount = 0;
  const tick = () => {
    if (!G || G.won) { busy = false; return; }
    const m = autoFoundStep(false);
    if (!m) { busy = false; updateHUD(); return; }
    Sound.sfx.autoStep?.(stepCount++);
    doMove(m.src, m.idx, m.dst, { record: false, auto: true });
    if (!G.won) finishT = setTimeout(tick, stepMs);
  };
  finishT = setTimeout(tick, 150);
}
function stopAutoFinish() { clearTimeout(finishT); busy = false; }
