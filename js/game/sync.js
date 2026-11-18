/* Slopitaire — the bridge between the game and the optional account cloud sync (js/account/account.js). */
'use strict';

function getLocalState() {
  return {
    settings,
    stats: Store.get('stats', {}),
    save: Store.get('save', null),
    gacha: (typeof Gacha !== 'undefined' && Gacha.getState) ? Gacha.getState() : Store.get('gacha', null),
    meta: Store.getMeta(),
  };
}

function applyMergedProgress(p) {
  if (!p || typeof p !== 'object') return;
  const readGachaSnapshot = () => (typeof Gacha !== 'undefined' && Gacha.getState) ? Gacha.getState() : Store.get('gacha', null);
  const prevSettingsJson = JSON.stringify(settings);
  const prevStatsJson = JSON.stringify(Store.get('stats', {}) || {});
  const prevGachaJson = JSON.stringify(readGachaSnapshot());
  const prevLeftHanded = settings.leftHanded;
  const prevDetectLoss = settings.detectLoss;
  const prevAutoFinish = settings.autoFinish;

  // Apply gacha unlocks before normalizing settings so newly synced cosmetics stay equipped
  const hasRemoteGacha = p.gacha !== undefined && p.gacha && typeof p.gacha === 'object';
  if (hasRemoteGacha) {
    if (typeof Gacha !== 'undefined' && Gacha.setState) Gacha.setState(p.gacha, { fromRemote: true });
    else Store.set('gacha', p.gacha, { fromRemote: true });
  }

  if (p.settings !== undefined && p.settings && typeof p.settings === 'object') {
    settings = normalizeSettings(p.settings);
    Store.set('settings', settings, { fromRemote: true });
  } else if (hasRemoteGacha && typeof normalizeSettings === 'function') {
    const normalized = normalizeSettings(settings);
    if (JSON.stringify(normalized) !== JSON.stringify(settings)) {
      settings = normalized;
      Store.set('settings', settings, { fromRemote: true });
    }
  }

  if (p.stats !== undefined) {
    const nextStats = (p.stats && typeof p.stats === 'object') ? p.stats : {};
    Store.set('stats', nextStats, { fromRemote: true });
  }

  if (p.save !== undefined) {
    const nextSave = validSave(p.save) ? p.save : null;
    Store.set('save', nextSave, { fromRemote: true });
  }

  const curMeta = Store.getMeta();
  const nextMeta = Object.assign({}, curMeta);
  if (typeof p.settingsUpdatedAt === 'number') nextMeta.settingsUpdatedAt = p.settingsUpdatedAt;
  if (typeof p.statsUpdatedAt === 'number') nextMeta.statsUpdatedAt = p.statsUpdatedAt;
  if (typeof p.saveUpdatedAt === 'number') nextMeta.saveUpdatedAt = p.saveUpdatedAt;
  if (typeof p.gachaUpdatedAt === 'number') nextMeta.gachaUpdatedAt = p.gachaUpdatedAt;
  Store.setMeta(nextMeta);

  const nextSettingsJson = JSON.stringify(settings);
  const nextStatsJson = JSON.stringify(Store.get('stats', {}) || {});
  const nextGachaJson = JSON.stringify(readGachaSnapshot());
  const settingsChanged = prevSettingsJson !== nextSettingsJson;
  const statsChanged = prevStatsJson !== nextStatsJson;
  const gachaChanged = prevGachaJson !== nextGachaJson;

  if (settingsChanged) {
    applySettings();
    buildStartPickers();
  }
  window.syncGachaBadges?.();

  const sv = Store.get('save', null);
  const canContinue = (G && !G.won && G.started) || validSave(sv);
  DOM.btnContinue.classList.toggle('hidden', !canContinue);

  if (G) {
    G.prevBestScore = Math.max(G.prevBestScore || 0, getStats()?.[SK()]?.bestScore || 0);
    if (prevLeftHanded !== settings.leftHanded) { slotsDirty = true; layout(); }
    if (prevAutoFinish !== settings.autoFinish) maybeAutoFinish();
    if (prevDetectLoss !== settings.detectLoss) scheduleCheck();
    updateHUD();
  }

  const settingsModal = DOM.settingsModal || $('#settingsModal');
  if (settingsModal && !settingsModal.classList.contains('hidden') && (settingsChanged || statsChanged || gachaChanged)) {
    const panel = settingsModal.querySelector('.panel');
    const scrollY = panel ? panel.scrollTop : 0;
    buildSettings();
    if (panel) panel.scrollTop = scrollY;
  }

  const gachaModal = DOM.gachaModal || $('#gachaModal');
  if (gachaModal && !gachaModal.classList.contains('hidden') && (gachaChanged || settingsChanged)) {
    window.refreshGachaModal?.();
  }

  const skinsModal = DOM.skinsModal || $('#skinsModal');
  if (skinsModal && !skinsModal.classList.contains('hidden') && (gachaChanged || settingsChanged)) {
    window.refreshSkinsModal?.();
  }
}

function onAuthChanged() {
  if (DOM.settingsModal && !DOM.settingsModal.classList.contains('hidden')) {
    window.Account?.renderSettingsSection?.($('#settingsBody'));
  }
}

// start the account module (js/account/) with the game hooks it needs
function connectAccount() {
  window.Account?.init?.({
    getLocalState,
    applyMergedProgress,
    onAuthChanged,
    toast,
    PopupFX,
    Sound,
    getMeta: Store.getMeta,
    setMeta: Store.setMeta,
    openSettings,
  });
}
