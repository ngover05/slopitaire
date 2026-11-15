/* Slopitaire account — optional Google sign-in & cloud progress sync: startup and the public window.Account API. */
'use strict';

async function initAccount(options = {}) {
  accountDeps = options || {};
  accountState.initialized = true;

  if (isElectron()) {
    try {
      const cfg = await window.slopDesktop.getConfig();
      if (cfg) {
        accountState.serverUrl = normalizeServerUrl(cfg.serverUrl) || DEFAULT_SERVER_URL;
        accountState.token = cfg.token || null;
        accountState.user = cfg.user || null;
      }
    } catch (e) { /* ignore config error */ }
    await restoreElectronBackupIfEmpty();
  }

  renderAccountUI();

  if (!initAccount._listenersBound) {
    initAccount._listenersBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushKeepalive();
    });
    window.addEventListener('pagehide', flushKeepalive);
  }

  await refreshStatus();
  return getAccountStatus();
}

function getAccountUser() {
  return accountState.user ? { ...accountState.user } : null;
}

function getAccountStatus() {
  return {
    initialized: accountState.initialized,
    configured: accountState.configured,
    setupHint: accountState.setupHint,
    online: accountState.online,
    signedIn: isSignedIn(),
    user: getAccountUser(),
    serverUrl: accountState.serverUrl,
    isElectron: isElectron(),
    syncStatus: accountState.syncStatus,
    lastSyncedAt: accountState.lastSyncedAt,
    syncError: accountState.syncError,
  };
}

window.Account = {
  init: initAccount,
  isSignedIn,
  getUser: getAccountUser,
  getStatus: getAccountStatus,
  signIn,
  signOut,
  syncNow,
  refreshStatus,
  onLocalChange,
  renderSettingsSection,
  renderTopbar,
  renderStartBar,
};
