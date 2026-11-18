/* Slopitaire account — the Electron desktop app's offline progress backup. */
'use strict';

function writeElectronBackup() {
  if (!isElectron() || typeof window.slopDesktop.saveLocalBackup !== 'function') return;
  try {
    const snap = getSnapshot();
    Promise.resolve(window.slopDesktop.saveLocalBackup({
      settings: snap.settings,
      stats: snap.stats,
      save: snap.save,
      gacha: snap.gacha ?? null,
      gachaUpdatedAt: Number(snap.meta?.gachaUpdatedAt) || 0,
      meta: snap.meta,
      updatedAt: Date.now(),
    })).catch(() => {});
  } catch (e) { /* ignore backup failures */ }
}

function scheduleElectronBackup(immediate = false) {
  if (!isElectron()) return;
  clearTimeout(backupTimer);
  if (immediate) {
    backupTimer = null;
    writeElectronBackup();
    return;
  }
  backupTimer = setTimeout(() => {
    backupTimer = null;
    writeElectronBackup();
  }, BACKUP_DEBOUNCE_MS);
}

async function restoreElectronBackupIfEmpty() {
  if (!isElectron() || typeof window.slopDesktop.loadLocalBackup !== 'function') return false;
  let hasMeta = false;
  let hasStats = false;
  let hasSave = false;
  let hasGacha = false;
  try {
    hasMeta = localStorage.getItem('slopitaire.meta') !== null;
    hasStats = localStorage.getItem('slopitaire.stats') !== null;
    hasSave = localStorage.getItem('slopitaire.save') !== null;
    hasGacha = localStorage.getItem('slopitaire.gacha') !== null;
  } catch (e) { return false; }

  if (hasMeta || hasStats || hasSave || hasGacha) return false;

  try {
    const backup = await window.slopDesktop.loadLocalBackup();
    if (!backup || typeof backup !== 'object') return false;
    const bMeta = (backup.meta && typeof backup.meta === 'object') ? backup.meta : {};
    if (!backup.settings && !backup.stats && !backup.save && !backup.gacha && !backup.meta) return false;

    const gachaUpdatedAt = Number(bMeta.gachaUpdatedAt || backup.gachaUpdatedAt) || 0;
    if (typeof accountDeps.applyMergedProgress === 'function') {
      accountDeps.applyMergedProgress({
        settings: backup.settings,
        settingsUpdatedAt: Number(bMeta.settingsUpdatedAt) || 0,
        stats: backup.stats,
        statsUpdatedAt: Number(bMeta.statsUpdatedAt) || 0,
        save: backup.save !== undefined ? backup.save : null,
        saveUpdatedAt: Number(bMeta.saveUpdatedAt) || 0,
        gacha: backup.gacha !== undefined ? backup.gacha : null,
        gachaUpdatedAt,
      });
    }
    writeMetaSafe(Object.assign(
      {
        settingsUpdatedAt: 0,
        statsUpdatedAt: 0,
        saveUpdatedAt: 0,
        gachaUpdatedAt: 0,
        guestDelta: null,
        guestGachaDelta: null,
        deltaId: null,
        pendingResetStats: false,
      },
      bMeta,
      gachaUpdatedAt ? { gachaUpdatedAt } : null
    ));
    return true;
  } catch (e) {
    return false;
  }
}
