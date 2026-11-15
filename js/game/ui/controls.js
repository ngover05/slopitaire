/* Slopitaire — wiring for the top bar, start screen, modal buttons and UI sounds. */
'use strict';

// hover ticks on buttons & face-up cards (audio unlocking on the first gesture lives in Sound.boot)
function bindUiSounds() {

  // subtle digital UI & face-up card hover tick delegation
  document.addEventListener('pointerenter', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    if (!t.disabled && t.matches('.btn, .cast-opt, .diff-card, .seg button, .back-opt, .chip.is-auto, .skin-tab, .skin-card, .skins-mood-btn, .skins-open-chip')) {
      Sound.sfx.hover?.();
    } else if (!drag && t.classList.contains('card') && t.classList.contains('up')) {
      Sound.sfx.cardHover?.();
    }
  }, true);
}

// buttons, chips and modal close controls
function bindControls() {
  DOM.chipDiff.onclick = () => { if (G && G.difficulty === 'auto') toggleAutoPause(); };
  DOM.chipDiff.onkeydown = (e) => {
    if (G && G.difficulty === 'auto' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggleAutoPause();
    }
  };
  $('#btnNew').onclick = () => { Sound.sfx.click(); requestNewGame(); };
  DOM.btnUndo.onclick = undo;
  DOM.btnHint.onclick = hint;
  const btnAcct = $('#btnAccount');
  if (btnAcct) btnAcct.onclick = () => { Sound.ensure(); openSettings(); };
  const btnSkins = $('#btnSkins');
  if (btnSkins) btnSkins.onclick = () => { Sound.ensure(); openSkinsModal(); };
  $('#btnSettings').onclick = () => { Sound.ensure(); openSettings(); Companion.react('settings'); };
  $('#btnSound').onclick = () => {
    Sound.ensure();
    const nextMuted = !settings.muted;
    if (nextMuted) (Sound.sfx.toggleOff || Sound.sfx.click)?.();
    setSetting('muted', nextMuted, true);
    if (!nextMuted) (Sound.sfx.toggleOn || Sound.sfx.click)?.();
    toast(settings.muted ? 'Sound off 🔇' : 'Sound on ♪');
  };
  $('#btnHome').onclick = () => { showStart(); };
  $('#btnAutoFinish').onclick = runAutoFinish;
  $('#btnPlay').onclick = () => {
    Sound.ensure();
    if (G && G.started && !G.won) { hideOverlay('startScreen', true); requestNewGame(); } else newGame();
  };
  $('#btnContinue').onclick = () => {
    Sound.ensure();
    hideOverlay('startScreen');
    if (G && !G.won && G.started) return;
    const sv = Store.get('save', null);
    if (validSave(sv)) loadGame(sv); else newGame();
  };
  $('#btnStartSettings').onclick = () => { Sound.ensure(); openSettings(); };
  const btnStartSkins = $('#btnStartSkins');
  if (btnStartSkins) btnStartSkins.onclick = () => { Sound.ensure(); openSkinsModal(); };
  $('#btnSettingsNew').onclick = () => { hideOverlay('settingsModal', true); hideOverlay('startScreen', true); requestNewGame(); };
  $('#btnWinNew').onclick = () => { Sound.sfx.click(); newGame(); };
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => { hideOverlay(b.dataset.close); }; });
  ['settingsModal', 'skinsModal', 'winModal', 'loseModal', 'confirmModal'].forEach((id) => {
    $('#' + id)?.addEventListener('pointerdown', (e) => { if (e.target.id === id) hideOverlay(id); });
  });
  const btnSprite = $('#btnSpriteMode');
  if (btnSprite) {
    btnSprite.onclick = (e) => {
      e.stopPropagation();
      Sound.ensure();
      setSetting('spriteMode', settings.spriteMode === 'full' ? 'corner' : 'full');
      Companion.boing();
    };
  }
}
