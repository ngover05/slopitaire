/* Slopitaire account — non-destructive cloud progress sync. */
'use strict';

async function syncNow(opts = {}) {
  if (!isSignedIn()) return null;

  if (syncInFlight) {
    resyncQueued = true;
    await syncInFlight;
    if (!isSignedIn()) return null;
    return syncNow(Object.assign({}, opts, { _retry: true }));
  }

  const run = (async () => {
    const startSeq = changeSeq;
    const snap = getSnapshot();
    const meta = Object.assign(
      { settingsUpdatedAt: 0, statsUpdatedAt: 0, saveUpdatedAt: 0, guestDelta: null, deltaId: null, pendingResetStats: false },
      snap.meta || {}
    );
    const sentDeltaId = meta.deltaId || null;
    const sentResetStats = Boolean(meta.pendingResetStats || opts.resetStats);

    const payloadObj = {
      settings: snap.settings,
      settingsUpdatedAt: Number(meta.settingsUpdatedAt) || 0,
      stats: snap.stats || {},
      statsUpdatedAt: Number(meta.statsUpdatedAt) || 0,
      guestDelta: meta.guestDelta || null,
      deltaId: sentDeltaId,
      resetStats: sentResetStats,
      save: snap.save !== undefined ? snap.save : null,
      saveUpdatedAt: Number(meta.saveUpdatedAt) || 0,
    };
    const bodyStr = JSON.stringify(payloadObj);

    accountState.syncStatus = 'syncing';
    accountState.syncError = '';
    if (!opts.keepalive) updateStatusIndicators();

    try {
      const res = await apiFetch('/api/progress/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
        keepalive: Boolean(opts.keepalive) && bodyStr.length <= 60000,
      });

      if (res.status === 401) {
        if (isElectron()) await window.slopDesktop.clearAuth().catch(() => {});
        accountState.token = null;
        accountState.user = null;
        accountState.syncStatus = 'signed_out';
        accountState.syncError = '';
        syncDirty = false;
        renderAccountUI();
        accountDeps.onAuthChanged?.(null);
        if (!opts.silent) accountDeps.toast?.('Session expired — please sign in again');
        return null;
      }

      if (!res.ok) {
        throw new Error('Sync failed (' + res.status + ')');
      }

      const data = await res.json();
      accountState.online = true;
      accountState.syncStatus = 'synced';
      accountState.lastSyncedAt = Date.now();
      accountState.syncError = '';

      // Clear guest delta / reset flag only if not replaced mid-flight
      const latestMeta = readMetaSafe();
      let metaChanged = false;
      if (sentDeltaId && latestMeta.deltaId === sentDeltaId) {
        latestMeta.guestDelta = null;
        latestMeta.deltaId = null;
        metaChanged = true;
      }
      if (sentResetStats && latestMeta.pendingResetStats) {
        latestMeta.pendingResetStats = false;
        metaChanged = true;
      }
      if (metaChanged) writeMetaSafe(latestMeta);

      if (changeSeq === startSeq) {
        syncDirty = false;
        if (data && data.progress && typeof accountDeps.applyMergedProgress === 'function') {
          accountDeps.applyMergedProgress(data.progress, { manual: Boolean(opts.manual || opts.force) });
        }
        scheduleElectronBackup(true);
      } else {
        syncDirty = true;
        resyncQueued = true;
      }

      updateStatusIndicators();
      if (opts.manual) {
        accountDeps.toast?.('Cloud progress synced ✦');
      }
      return data?.progress || null;
    } catch (err) {
      syncDirty = true;
      const isNet = err?.name === 'TypeError' || err?.name === 'AbortError';
      accountState.online = !isNet;
      accountState.syncStatus = isNet ? 'offline' : 'error';
      accountState.syncError = isNet ? '' : (err?.message || 'Sync failed');
      updateStatusIndicators();
      if (opts.manual) {
        accountDeps.toast?.(isNet ? 'Offline — changes kept locally' : (accountState.syncError || 'Sync failed'));
      }
      return null;
    }
  })();

  syncInFlight = run;
  try {
    return await run;
  } finally {
    syncInFlight = null;
    if (resyncQueued && isSignedIn() && !opts.keepalive) {
      resyncQueued = false;
      setTimeout(() => { if (syncDirty && isSignedIn()) syncNow({ silent: true }); }, 150);
    } else {
      resyncQueued = false;
    }
  }
}

function flushKeepalive() {
  clearTimeout(syncTimer);
  syncTimer = null;
  if (isElectron()) {
    clearTimeout(backupTimer);
    backupTimer = null;
    writeElectronBackup();
  }
  if (!isSignedIn()) return;
  const meta = readMetaSafe();
  if (!syncDirty && !meta.guestDelta && !meta.pendingResetStats) return;
  syncNow({ keepalive: true, silent: true });
}

function onLocalChange(key, value, opts = {}) {
  changeSeq++;
  scheduleElectronBackup(Boolean(opts && opts.immediate));

  if (!isSignedIn()) return;

  syncDirty = true;
  if (opts && opts.resetStats) {
    const meta = readMetaSafe();
    meta.pendingResetStats = true;
    writeMetaSafe(meta);
  }

  if (opts && opts.immediate === true) {
    clearTimeout(syncTimer);
    syncTimer = null;
    if (!microtaskQueued) {
      microtaskQueued = true;
      Promise.resolve().then(() => {
        microtaskQueued = false;
        if (syncDirty && isSignedIn()) syncNow({ silent: true });
      });
    }
    return;
  }

  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (syncDirty && isSignedIn()) syncNow({ silent: true });
  }, SYNC_DEBOUNCE_MS);
}
