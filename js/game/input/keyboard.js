/* Slopitaire — keyboard shortcuts. */
'use strict';

// Esc closes the top modal or Spotify drawer; U / Ctrl+Z undo, H hint, N new game, G gacha, O skins, P Spotify, M mute, Space / D draw
function bindKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#confirmModal').classList.contains('hidden')) hideOverlay('confirmModal');
      else if (window.GachaCinematic?.isOpen?.()) window.GachaCinematic.onEscape?.();
      else if (!$('#gachaModal')?.classList.contains('hidden')) hideOverlay('gachaModal');
      else if (!$('#skinsModal')?.classList.contains('hidden')) hideOverlay('skinsModal');
      else if (!$('#settingsModal').classList.contains('hidden')) hideOverlay('settingsModal');
      else if (!$('#winModal').classList.contains('hidden')) hideOverlay('winModal');
      else if (!$('#loseModal')?.classList.contains('hidden')) hideOverlay('loseModal');
      else if (window.Spotify?.getState?.()?.drawerOpen) window.Spotify.setDrawerOpen(false);
      return;
    }
    if (overlayOpen() || e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey || e.metaKey || e.altKey) return;
    else if (k === 'u') undo();
    else if (k === 'h') hint();
    else if (k === 'n') requestNewGame();
    else if (k === 'g') window.openGachaModal?.();
    else if (k === 'o') openSkinsModal();
    else if (k === 'p') window.Spotify?.toggleDrawer?.();
    else if (k === 'm') $('#btnSound').click();
    else if (k === ' ' || k === 'd') { e.preventDefault(); drawStock(); }
  });
}
