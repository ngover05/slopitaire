/* Slopitaire — showing and hiding overlays & modals, and the confirm dialog. */
'use strict';

function anyOverlayOpen() {
  if (overlayOpen()) return true;
  const ov = document.querySelector?.('.overlay:not(.hidden)');
  return !!ov;
}

let askResolve = null;
function showOverlay(id, silent) {
  const el = OVERLAYS[id] || $('#' + id);
  const wasHidden = el.classList.contains('hidden');
  el.classList.remove('hidden');
  stopAutoStep();
  if (wasHidden && !silent) Sound.sfx.modalOpen?.();
}
function hideOverlay(id, silent) {
  const el = OVERLAYS[id] || $('#' + id);
  if (!el) return;
  const wasOpen = !el.classList.contains('hidden');
  el.classList.add('hidden');
  if (id === 'winModal' && DOM.winMascot) DOM.winMascot.innerHTML = '';
  if (id === 'loseModal' && DOM.loseMascot) DOM.loseMascot.innerHTML = '';
  if (id === 'skinsModal' && DOM.skinsMascot) DOM.skinsMascot.innerHTML = '';
  if (id === 'gachaModal') window.onGachaModalClosed?.();
  if (wasOpen && !silent) {
    Sound.sfx.modalClose?.();
    if (id === 'loseModal' && G && G.lost) toast('Board locked — press New or Undo ✿', 3000);
  }
  if (id === 'confirmModal' && askResolve) { const r = askResolve; askResolve = null; r(null); }
  scheduleAutoStep(AUTO_STEP_MS);
}
function hideAllOverlays() { ['startScreen', 'settingsModal', 'skinsModal', 'gachaModal', 'winModal', 'loseModal', 'confirmModal'].forEach((id) => hideOverlay(id, true)); }
function overlayOpen() { return ['startScreen', 'settingsModal', 'skinsModal', 'gachaModal', 'winModal', 'loseModal', 'confirmModal'].some((id) => !(OVERLAYS[id] || $('#' + id))?.classList.contains('hidden')); }

function ask(text, buttons) {
  return new Promise((res) => {
    if (askResolve) askResolve(null);
    askResolve = res;
    $('#confirmText').innerHTML = text;
    const box = $('#confirmBtns'); box.innerHTML = '';
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.className = 'btn' + (b.primary ? ' primary' : '');
      el.textContent = b.label;
      el.onclick = () => { Sound.sfx.click(); const r = askResolve; askResolve = null; hideOverlay('confirmModal'); if (r) r(b.value); };
      box.appendChild(el);
    });
    showOverlay('confirmModal');
  });
}
