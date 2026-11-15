/* Slopitaire — the game clock and the idle-companion timer. */
'use strict';

function startClock() {
  if (G.started) return;
  G.started = true;
  const st = getStats(); st[SK()].played++;
  Store.recordGuestStat(SK(), 'played');
  Store.set('stats', st);
}

let lastActivity = Date.now(), idleSaid = false;
function noteActivity() { lastActivity = Date.now(); idleSaid = false; }
setInterval(() => {
  if (!G || G.won || G.lost || document.hidden || overlayOpen()) return;
  if (G.started && !busy) {
    G.elapsed++;
    DOM.time.textContent = fmtTime(G.elapsed);
    if (G.elapsed % 10 === 0) saveGame();
  }
  if (!idleSaid && Date.now() - lastActivity > 45000) {
    idleSaid = true;
    Companion.react('idle');
  }
}, 1000);
