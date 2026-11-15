/* Slopitaire — startup: builds the table, wires every control and shows the start screen. */
'use strict';

function init() {
  Art.injectDefs();
  buildTable();
  applyFaces('klondike', 1);
  applySettings();
  measure();

  bindDragInput();
  bindResize();
  bindUiSounds();
  bindControls();
  bindCompanionTouch();
  bindKeyboard();

  // pause the autopilot, music and voice while the page is hidden; save when it goes away
  document.addEventListener('visibilitychange', () => {
    StageBG.onVisibility();
    if (document.hidden) { stopAutoStep(); saveGame(); Sound.suspend(); Companion.silence(); }
    else { Sound.resume(); scheduleAutoStep(AUTO_STEP_MS); }
  });
  window.addEventListener('pagehide', saveGame);

  syncComboHud(false);
  showStart(true);

  installDebugHook();
  connectAccount();
}

init();
