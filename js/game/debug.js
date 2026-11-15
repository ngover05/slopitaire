/* Slopitaire — developer hook for automated testing (window.__slop): open index.html?debug */
'use strict';

function installDebugHook() {
  if (/[?&]debug\b/.test(location.search)) {
    window.__slop = {
      get G() { return G; },
      get combo() { return G ? G.chain : 0; },
      get chain() { return G ? G.chain : 0; },
      get autoPaused() { return autoPaused; },
      cards, settings, setSetting, skinFor, setGirlSkin, setAllGirlSkins, openSkinsModal, newGame, moveCards, drawStock, undo,
      doMove, tabMove, spiderDeal, pyramidRemove, peakPlay, variantState, isWon, pyrExposed, VSolver,
      autoFoundStep, layout, win, showWinModal, declareLost, showLost, findHints,
      Companion, cutIn, scheduleCheck, detectTouchZone, handleCompanionTouch, FX,
      StageBG, PopupFX, tierOf, syncComboHud, breakChain,
      toggleAutoPause, runAutoTick, solverState,
      Account: window.Account, Store,
    };
  }
}
