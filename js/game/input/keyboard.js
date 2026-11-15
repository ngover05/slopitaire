/* Slopitaire — keyboard shortcuts. */
'use strict';

// Esc closes the top modal; U / Ctrl+Z undo, H hint, N new game, M mute, Space / D draw
function bindKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#confirmModal').classList.contains('hidden')) hideOverlay('confirmModal');
      else if (!$('#settingsModal').classList.contains('hidden')) hideOverlay('settingsModal');
      else if (!$('#winModal').classList.contains('hidden')) hideOverlay('winModal');
      else if (!$('#loseModal')?.classList.contains('hidden')) hideOverlay('loseModal');
      return;
    }
    if (overlayOpen() || e.target.closest('input')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey || e.metaKey || e.altKey) return;
    else if (k === 'u') undo();
    else if (k === 'h') hint();
    else if (k === 'n') requestNewGame();
    else if (k === 'm') $('#btnSound').click();
    else if (k === ' ' || k === 'd') { e.preventDefault(); drawStock(); }
  });
}
