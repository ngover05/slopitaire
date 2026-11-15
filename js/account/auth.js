/* Slopitaire account — Google OAuth2 sign-in and sign-out (web popup or the desktop app's browser flow). */
'use strict';

function teardownPopupListeners() {
  if (authPopupCleanup) {
    authPopupCleanup();
    authPopupCleanup = null;
  }
}

async function completeSignIn(userObj) {
  accountState.signingIn = false;
  if (userObj) accountState.user = userObj;
  await refreshStatus();
  if (isSignedIn()) {
    const label = accountState.user?.name || accountState.user?.email || 'Google Account';
    accountDeps.PopupFX?.pill?.('◈', 'ACCOUNT SYNCED', label, 'emerald', { always: true });
    accountDeps.toast?.(`Signed in as ${shortDisplayName(accountState.user)} ✦`);
  }
  renderAccountUI();
  accountDeps.onAuthChanged?.(accountState.user ? { ...accountState.user } : null);
}

function startWebSignIn() {
  teardownPopupListeners();

  const w = 520, h = 640;
  const dualLeft = window.screenLeft !== undefined ? window.screenLeft : (window.screenX || 0);
  const dualTop = window.screenTop !== undefined ? window.screenTop : (window.screenY || 0);
  const vw = window.innerWidth || document.documentElement?.clientWidth || window.outerWidth || (typeof screen !== 'undefined' ? screen.width : 1280);
  const vh = window.innerHeight || document.documentElement?.clientHeight || window.outerHeight || (typeof screen !== 'undefined' ? screen.height : 800);
  const left = Math.max(0, Math.round(dualLeft + (vw - w) / 2));
  const top = Math.max(0, Math.round(dualTop + (vh - h) / 2));
  const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=yes,status=no`;

  const popup = window.open('/api/auth/google/start?mode=popup', 'slopitaire_google_auth', features);
  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    const ret = (window.location.pathname || '/') + (window.location.search || '');
    const redirectUrl = '/api/auth/google/start?mode=redirect&return_to=' + encodeURIComponent(ret);
    if (typeof window.location.assign === 'function') window.location.assign(redirectUrl);
    else window.location.href = redirectUrl;
    return;
  }

  accountState.signingIn = true;
  renderAccountUI();

  let finished = false;
  let bc = null;
  let pollT = null;

  const cleanup = () => {
    if (bc) { try { bc.close(); } catch (e) {} bc = null; }
    window.removeEventListener('message', onMsg);
    window.removeEventListener('storage', onStorage);
    if (pollT) { clearInterval(pollT); pollT = null; }
    authPopupCleanup = null;
  };
  authPopupCleanup = cleanup;

  const handleOutcome = async (payload) => {
    if (finished) return;
    finished = true;
    cleanup();
    try { if (popup && !popup.closed) popup.close(); } catch (e) {}

    if (payload && payload.ok === false) {
      accountState.signingIn = false;
      await refreshStatus();
      accountDeps.toast?.(payload.error || 'Google sign-in failed or unconfigured');
      return;
    }
    await completeSignIn(null);
  };

  const onMsg = (ev) => {
    if (ev.origin !== window.location.origin) return;
    const d = ev.data;
    if (d && d.type === 'slopitaire:auth-complete') handleOutcome(d);
  };

  const onStorage = (ev) => {
    if (ev.key === 'slopitaire.authPing') handleOutcome({ ok: true });
  };

  window.addEventListener('message', onMsg);
  window.addEventListener('storage', onStorage);

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel('slopitaire-auth');
      bc.onmessage = (ev) => {
        const d = ev.data;
        if (d && d.type === 'slopitaire:auth-complete') handleOutcome(d);
      };
    } catch (e) { /* BroadcastChannel unavailable */ }
  }

  pollT = setInterval(async () => {
    if (finished) return;
    let closed = false;
    try { closed = popup.closed; } catch (e) { closed = false; }
    if (closed) {
      finished = true;
      cleanup();
      accountState.signingIn = false;
      await refreshStatus();
      if (isSignedIn()) {
        accountDeps.PopupFX?.pill?.('◈', 'ACCOUNT SYNCED', accountState.user?.name || accountState.user?.email || 'Google Account', 'emerald', { always: true });
        accountDeps.toast?.(`Signed in as ${shortDisplayName(accountState.user)} ✦`);
      }
      renderAccountUI();
    }
  }, 500);
}

async function signIn() {
  if (accountState.signingIn) return;
  if (accountState.configured === false) {
    accountDeps.toast?.('Google Sync not configured (.env)');
    openAccountSettings();
    return;
  }

  if (isElectron()) {
    accountState.signingIn = true;
    renderAccountUI();
    try {
      const res = await window.slopDesktop.signInWithGoogle(accountState.serverUrl || DEFAULT_SERVER_URL);
      if (!res || !res.ok || !res.token || !res.user) {
        throw new Error(res?.error || 'Google sign-in was cancelled');
      }
      accountState.token = res.token;
      accountState.user = res.user;
      accountState.configured = true;
      accountState.online = true;
      accountState.signingIn = false;

      if (hasUnsyncedLocalData(getSnapshot(), res.progress) || !res.progress) {
        await syncNow({ force: true, silent: true });
      } else if (typeof accountDeps.applyMergedProgress === 'function') {
        accountDeps.applyMergedProgress(res.progress, { manual: true });
        accountState.syncStatus = 'synced';
        accountState.lastSyncedAt = Date.now();
        accountState.syncError = '';
        scheduleElectronBackup(true);
      }
      const label = accountState.user?.name || accountState.user?.email || 'Google Account';
      accountDeps.PopupFX?.pill?.('◈', 'ACCOUNT SYNCED', label, 'emerald', { always: true });
      accountDeps.toast?.(`Signed in as ${shortDisplayName(accountState.user)} ✦`);
      renderAccountUI();
      accountDeps.onAuthChanged?.(accountState.user ? { ...accountState.user } : null);
    } catch (err) {
      accountState.signingIn = false;
      renderAccountUI();
      accountDeps.toast?.(err?.message || 'Google sign-in failed');
    }
    return;
  }

  startWebSignIn();
}

async function signOut() {
  clearTimeout(syncTimer);
  syncTimer = null;
  syncDirty = false;
  teardownPopupListeners();

  try {
    if (isSignedIn()) {
      await apiFetch('/api/auth/logout', { method: 'POST', timeoutMs: 3500 }).catch(() => {});
    }
    if (isElectron() && typeof window.slopDesktop.clearAuth === 'function') {
      await window.slopDesktop.clearAuth().catch(() => {});
    }
  } finally {
    accountState.token = null;
    accountState.user = null;
    accountState.lastSyncedAt = 0;
    accountState.syncError = '';
    accountState.syncStatus = accountState.configured === false ? 'unconfigured' : 'signed_out';
    renderAccountUI();
    accountDeps.onAuthChanged?.(null);
    accountDeps.toast?.('Signed out — local progress kept ✿');
  }
}
