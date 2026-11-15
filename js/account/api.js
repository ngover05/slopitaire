/* Slopitaire account — requests to the sync server and its status. */
'use strict';

async function apiFetch(path, opts = {}) {
  const url = apiBase() + path;
  const headers = Object.assign({}, opts.headers || {});
  const method = (opts.method || 'GET').toUpperCase();

  if (isElectron()) {
    if (accountState.token && !headers.Authorization) {
      headers.Authorization = 'Bearer ' + accountState.token;
    }
  }
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    headers['X-Slopitaire-CSRF'] = '1';
  }

  const fetchOpts = {
    method,
    headers,
    credentials: isElectron() ? 'omit' : 'include',
  };
  if (opts.body !== undefined) fetchOpts.body = opts.body;
  if (opts.keepalive) fetchOpts.keepalive = true;

  let timer = null;
  if (!opts.keepalive && typeof AbortController !== 'undefined' && !opts.signal) {
    const ctrl = new AbortController();
    fetchOpts.signal = ctrl.signal;
    timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || STATUS_TIMEOUT_MS);
  } else if (opts.signal) {
    fetchOpts.signal = opts.signal;
  }

  try {
    return await fetch(url, fetchOpts);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasUnsyncedLocalData(snap, serverProgress) {
  const meta = snap.meta || {};
  if (meta.guestDelta || meta.pendingResetStats) return true;
  const sp = serverProgress || {};
  if ((Number(meta.settingsUpdatedAt) || 0) > (Number(sp.settingsUpdatedAt) || 0)) return true;
  if ((Number(meta.statsUpdatedAt) || 0) > (Number(sp.statsUpdatedAt) || 0)) return true;
  if ((Number(meta.saveUpdatedAt) || 0) > (Number(sp.saveUpdatedAt) || 0)) return true;

  // Pre-account local stats without timestamps yet
  if (!sp.statsUpdatedAt && snap.stats && typeof snap.stats === 'object') {
    for (const k of DIFF_KEYS) {
      if ((snap.stats[k]?.played || 0) > 0 || (snap.stats[k]?.won || 0) > 0) return true;
    }
  }
  if (!sp.saveUpdatedAt && snap.save) return true;
  return false;
}

async function refreshStatus() {
  try {
    const res = await apiFetch('/api/auth/status');
    if (res.status === 404 || res.status === 501) {
      accountState.configured = false;
      accountState.online = false;
      accountState.setupHint = 'Cloud sync server not running.';
      if (!isElectron() || !accountState.token) {
        accountState.user = null;
        accountState.syncStatus = 'unconfigured';
      } else {
        accountState.syncStatus = 'offline';
      }
      renderAccountUI();
      return getAccountStatus();
    }
    if (!res.ok) {
      accountState.online = false;
      accountState.syncStatus = isSignedIn() ? 'offline' : 'signed_out';
      renderAccountUI();
      return getAccountStatus();
    }
    const data = await res.json();
    accountState.online = true;
    accountState.configured = Boolean(data.configured);
    accountState.setupHint = data.setupHint || '';

    if (data.user) {
      accountState.user = data.user;
      const snap = getSnapshot();
      if (hasUnsyncedLocalData(snap, data.progress)) {
        syncDirty = true;
        await syncNow({ force: true, silent: true });
      } else {
        if (data.progress && typeof accountDeps.applyMergedProgress === 'function') {
          accountDeps.applyMergedProgress(data.progress);
        }
        accountState.syncStatus = 'synced';
        accountState.lastSyncedAt = Date.now();
        accountState.syncError = '';
        scheduleElectronBackup(true);
      }
    } else {
      if (isElectron() && accountState.token) {
        await window.slopDesktop.clearAuth().catch(() => {});
      }
      accountState.token = null;
      accountState.user = null;
      accountState.syncStatus = accountState.configured ? 'signed_out' : 'unconfigured';
    }
  } catch (err) {
    accountState.online = false;
    if (isElectron() && accountState.token && accountState.user) {
      accountState.syncStatus = 'offline';
    } else {
      accountState.syncStatus = 'signed_out';
    }
  }

  renderAccountUI();
  accountDeps.onAuthChanged?.(accountState.user ? { ...accountState.user } : null);
  return getAccountStatus();
}
