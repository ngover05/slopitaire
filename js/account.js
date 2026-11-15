/* Slopitaire — optional Google OAuth2 account sign-in & non-destructive cloud progress sync. */
(() => {
  'use strict';

  const DEFAULT_SERVER_URL = 'http://localhost:3000';
  const SYNC_DEBOUNCE_MS = 900;
  const BACKUP_DEBOUNCE_MS = 400;
  const STATUS_TIMEOUT_MS = 6000;
  // per-variant stat keys, as in statKey() in game.js and DIFFICULTIES in server/merge.js
  const DIFF_KEYS = ['easy', 'medium', 'hard', 'auto'].flatMap((d) => [d, ...['spider', 'freecell', 'pyramid', 'tripeaks'].map((v) => `${v}_${d}`)]);

  const GOOGLE_G_SVG =
    '<svg class="acct-g-svg" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>' +
    '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>' +
    '<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>' +
    '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.54H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>' +
    '</svg>';

  const isElectron = () => Boolean(window.slopDesktop && window.slopDesktop.isElectron === true);
  const $ = (s) => document.querySelector(s);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  ));

  function safePictureUrl(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : '';
  }

  function normalizeServerUrl(raw) {
    const val = String(raw || '').trim();
    if (!val) return '';
    try {
      const u = new URL(val);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.origin + u.pathname.replace(/\/+$/, '');
    } catch (e) {
      return '';
    }
  }

  function shortDisplayName(user) {
    if (!user) return 'Sign in';
    const raw = String(user.name || user.email || 'Account').trim();
    const first = raw.split(/\s+/)[0];
    if (first.includes('@')) return first.split('@')[0];
    return first || 'Account';
  }

  function userInitial(user) {
    const src = String(user?.name || user?.email || '?').trim();
    return (src.charAt(0) || '?').toUpperCase();
  }

  function formatSyncTime(ts) {
    if (!ts) return 'Not synced yet';
    const diff = Math.max(0, Date.now() - ts);
    if (diff < 15000) return 'Just now';
    if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Recently';
    }
  }

  function avatarMarkup(user, large = false) {
    const cls = large ? 'acct-avatar lg' : 'acct-avatar';
    const init = esc(userInitial(user));
    const pic = safePictureUrl(user?.picture);
    if (!pic) {
      return `<span class="${cls} acct-avatar-fallback" aria-hidden="true">${init}</span>`;
    }
    return (
      `<span class="acct-avatar-wrap">` +
      `<img class="${cls}" src="${esc(pic)}" referrerpolicy="no-referrer" alt="">` +
      `<span class="${cls} acct-avatar-fallback hidden" aria-hidden="true">${init}</span>` +
      `</span>`
    );
  }

  function bindAvatarFallbacks(root) {
    if (!root) return;
    root.querySelectorAll('img.acct-avatar').forEach((img) => {
      if (img.dataset.boundFallback) return;
      img.dataset.boundFallback = '1';
      img.addEventListener('error', () => {
        img.classList.add('hidden');
        const fb = img.nextElementSibling;
        if (fb && fb.classList.contains('acct-avatar-fallback')) fb.classList.remove('hidden');
      }, { once: true });
    });
  }

  const state = {
    initialized: false,
    configured: null, // null = checking, true = ready, false = unconfigured
    setupHint: '',
    online: true,
    user: null,
    token: null,
    serverUrl: DEFAULT_SERVER_URL,
    syncStatus: 'signed_out', // 'signed_out' | 'unconfigured' | 'synced' | 'syncing' | 'offline' | 'error'
    lastSyncedAt: 0,
    syncError: '',
    signingIn: false,
  };

  let deps = {};
  let dirty = false;
  let changeSeq = 0;
  let syncTimer = null;
  let backupTimer = null;
  let syncInFlight = null;
  let resyncQueued = false;
  let microtaskQueued = false;
  let mountedSettingsContainer = null;
  let authPopupCleanup = null;

  function apiBase() {
    if (!isElectron()) return '';
    return (state.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  }

  function readMetaSafe() {
    if (typeof deps.getMeta === 'function') return deps.getMeta();
    try {
      const raw = localStorage.getItem('slopitaire.meta');
      return Object.assign(
        { settingsUpdatedAt: 0, statsUpdatedAt: 0, saveUpdatedAt: 0, guestDelta: null, deltaId: null, pendingResetStats: false },
        raw ? JSON.parse(raw) : null
      );
    } catch (e) {
      return { settingsUpdatedAt: 0, statsUpdatedAt: 0, saveUpdatedAt: 0, guestDelta: null, deltaId: null, pendingResetStats: false };
    }
  }

  function writeMetaSafe(meta) {
    if (typeof deps.setMeta === 'function') {
      deps.setMeta(meta);
      return;
    }
    try {
      localStorage.setItem('slopitaire.meta', JSON.stringify(meta));
    } catch (e) { /* storage unavailable */ }
  }

  function getSnapshot() {
    if (typeof deps.getLocalState === 'function') {
      const snap = deps.getLocalState() || {};
      const hasFlatMeta = snap.settingsUpdatedAt !== undefined
        || snap.statsUpdatedAt !== undefined
        || snap.saveUpdatedAt !== undefined
        || snap.guestDelta !== undefined
        || snap.deltaId !== undefined
        || snap.resetStats !== undefined
        || snap.pendingResetStats !== undefined;
      const meta = snap.meta || (hasFlatMeta ? {
        settingsUpdatedAt: Number(snap.settingsUpdatedAt) || 0,
        statsUpdatedAt: Number(snap.statsUpdatedAt) || 0,
        saveUpdatedAt: Number(snap.saveUpdatedAt) || 0,
        guestDelta: snap.guestDelta ?? null,
        deltaId: snap.deltaId ?? null,
        pendingResetStats: Boolean(snap.resetStats ?? snap.pendingResetStats),
      } : readMetaSafe());
      return {
        settings: snap.settings ?? null,
        stats: snap.stats ?? {},
        save: snap.save ?? null,
        meta,
      };
    }
    const readJson = (k, d) => {
      try { const v = localStorage.getItem('slopitaire.' + k); return v == null ? d : JSON.parse(v); }
      catch (e) { return d; }
    };
    return {
      settings: readJson('settings', null),
      stats: readJson('stats', {}),
      save: readJson('save', null),
      meta: readMetaSafe(),
    };
  }

  function isSignedIn() {
    if (!state.user) return false;
    if (isElectron()) return Boolean(state.token);
    return true;
  }

  function statusMeta() {
    if (isSignedIn()) {
      if (state.signingIn || state.syncStatus === 'syncing') return { key: 'syncing', label: 'Syncing…' };
      if (state.syncStatus === 'offline') return { key: 'offline', label: 'Offline' };
      if (state.syncStatus === 'error') return { key: 'error', label: 'Offline' };
      return { key: 'synced', label: 'Synced' };
    }
    if (state.configured === false) return { key: 'unconfigured', label: 'Setup required' };
    if (!state.online) return { key: 'offline', label: 'Offline' };
    return { key: 'signed_out', label: 'Not signed in' };
  }

  function openAccountSettings() {
    deps.Sound?.ensure?.();
    if (typeof deps.openSettings === 'function') {
      deps.openSettings();
      return;
    }
    $('#btnSettings')?.click();
  }

  function playClick() {
    deps.Sound?.ensure?.();
    deps.Sound?.sfx?.click?.();
  }

  // ---------------------------------------------------------------- Electron backup
  function writeElectronBackup() {
    if (!isElectron() || typeof window.slopDesktop.saveLocalBackup !== 'function') return;
    try {
      const snap = getSnapshot();
      Promise.resolve(window.slopDesktop.saveLocalBackup({
        settings: snap.settings,
        stats: snap.stats,
        save: snap.save,
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
    try {
      hasMeta = localStorage.getItem('slopitaire.meta') !== null;
      hasStats = localStorage.getItem('slopitaire.stats') !== null;
      hasSave = localStorage.getItem('slopitaire.save') !== null;
    } catch (e) { return false; }

    if (hasMeta || hasStats || hasSave) return false;

    try {
      const backup = await window.slopDesktop.loadLocalBackup();
      if (!backup || typeof backup !== 'object') return false;
      const bMeta = (backup.meta && typeof backup.meta === 'object') ? backup.meta : {};
      if (!backup.settings && !backup.stats && !backup.save && !backup.meta) return false;

      if (typeof deps.applyMergedProgress === 'function') {
        deps.applyMergedProgress({
          settings: backup.settings,
          settingsUpdatedAt: Number(bMeta.settingsUpdatedAt) || 0,
          stats: backup.stats,
          statsUpdatedAt: Number(bMeta.statsUpdatedAt) || 0,
          save: backup.save !== undefined ? backup.save : null,
          saveUpdatedAt: Number(bMeta.saveUpdatedAt) || 0,
        });
      }
      writeMetaSafe(Object.assign(
        { settingsUpdatedAt: 0, statsUpdatedAt: 0, saveUpdatedAt: 0, guestDelta: null, deltaId: null, pendingResetStats: false },
        bMeta
      ));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------- UI rendering
  function renderTopbar() {
    const btn = $('#btnAccount');
    const ic = $('#accountIc');
    const lbl = $('#accountLbl');
    if (!btn || !ic || !lbl) return;

    const sm = statusMeta();
    let dot = btn.querySelector('#accountDot');

    if (isSignedIn()) {
      btn.classList.add('is-signed-in');
      ic.innerHTML = avatarMarkup(state.user, false);
      bindAvatarFallbacks(ic);
      lbl.textContent = shortDisplayName(state.user);
      if (!dot) {
        dot = document.createElement('span');
        dot.id = 'accountDot';
        dot.className = 'acct-dot';
        dot.setAttribute('aria-hidden', 'true');
        btn.appendChild(dot);
      }
      dot.dataset.state = sm.key;
      btn.title = `${state.user.name || state.user.email || 'Google Account'} (${sm.label})`;
    } else {
      btn.classList.remove('is-signed-in');
      ic.innerHTML = GOOGLE_G_SVG;
      lbl.textContent = 'Sign in';
      if (dot) dot.remove();
      btn.title = state.configured === false
        ? 'Google Sync not configured (.env)'
        : 'Google Account & Cloud Sync';
    }
  }

  function renderStartBar() {
    const bar = $('#startAccountBar');
    if (!bar) return;

    const sm = statusMeta();
    if (isSignedIn()) {
      const name = esc(state.user.name || state.user.email || 'Google Account');
      bar.classList.add('is-signed-in');
      bar.innerHTML =
        `<div class="sab-left">` +
        `${avatarMarkup(state.user, false)}` +
        `<span class="sab-name">${name}</span>` +
        `<span class="acct-status-badge compact" data-state="${esc(sm.key)}"><i class="acct-dot" data-state="${esc(sm.key)}"></i><span data-acct-status-text>${esc(sm.label)}</span></span>` +
        `</div>` +
        `<div class="sab-right">` +
        `<button type="button" class="btn acct-mini-btn" id="sabManage">Manage</button>` +
        `<button type="button" class="btn acct-mini-btn" id="sabSignOut">Sign out</button>` +
        `</div>`;
      bindAvatarFallbacks(bar);
      bar.querySelector('#sabManage').onclick = () => { playClick(); openAccountSettings(); };
      bar.querySelector('#sabSignOut').onclick = () => { playClick(); signOut(); };
      return;
    }

    bar.classList.remove('is-signed-in');
    if (state.configured === false) {
      bar.innerHTML =
        `<div class="sab-left">` +
        `<span class="sab-guest-dot" aria-hidden="true"></span>` +
        `<span class="sab-guest-text">Guest mode — local progress</span>` +
        `</div>` +
        `<div class="sab-right">` +
        `<button type="button" class="btn acct-mini-btn acct-setup-pill" id="sabSetup">Setup required</button>` +
        `</div>`;
      bar.querySelector('#sabSetup').onclick = () => { playClick(); openAccountSettings(); };
      return;
    }

    bar.innerHTML =
      `<div class="sab-left">` +
      `<span class="sab-guest-dot" aria-hidden="true"></span>` +
      `<span class="sab-guest-text">Guest mode — local progress</span>` +
      `</div>` +
      `<div class="sab-right">` +
      `<button type="button" class="btn google-btn compact" id="sabSignIn" ${state.signingIn ? 'disabled' : ''}>${GOOGLE_G_SVG}<span>${state.signingIn ? 'Signing in…' : 'Sign in with Google'}</span></button>` +
      `</div>`;
    bar.querySelector('#sabSignIn').onclick = () => { playClick(); signIn(); };
  }

  function updateStatusIndicators() {
    renderTopbar();
    const sm = statusMeta();
    const bar = $('#startAccountBar');
    if (bar && isSignedIn()) {
      const badge = bar.querySelector('.acct-status-badge');
      const dot = bar.querySelector('.acct-dot');
      const txt = bar.querySelector('[data-acct-status-text]');
      if (badge) badge.dataset.state = sm.key;
      if (dot) dot.dataset.state = sm.key;
      if (txt) txt.textContent = sm.label;
    }
    if (mountedSettingsContainer && mountedSettingsContainer.isConnected) {
      const sec = mountedSettingsContainer.querySelector('[data-acct-section="1"]');
      if (sec) {
        const badge = sec.querySelector('.acct-status-badge');
        const dot = sec.querySelector('.acct-dot');
        const txt = sec.querySelector('[data-acct-status-text]');
        const lastEl = sec.querySelector('[data-acct-last-sync]');
        if (badge) badge.dataset.state = sm.key;
        if (dot) dot.dataset.state = sm.key;
        if (txt) txt.textContent = sm.label;
        if (lastEl && isSignedIn()) {
          lastEl.textContent = 'Last synced: ' + formatSyncTime(state.lastSyncedAt);
        }
      }
    }
  }

  function renderSettingsSection(container) {
    const host = container || mountedSettingsContainer || $('#settingsBody');
    if (!host) return null;
    mountedSettingsContainer = host;

    const existing = host.querySelector('[data-acct-section="1"]');
    if (existing) existing.remove();

    const sec = document.createElement('section');
    sec.className = 'acct-section';
    sec.dataset.acctSection = '1';

    const sm = statusMeta();
    const signedIn = isSignedIn();
    const unconfigured = state.configured === false;

    let topHtml = '';
    let metaText = '';
    let actionsHtml = '';

    if (signedIn) {
      const name = esc(state.user.name || 'Google Player');
      const email = esc(state.user.email || 'Signed in with Google');
      topHtml =
        `${avatarMarkup(state.user, true)}` +
        `<div class="acct-info">` +
        `<div class="acct-name">${name}</div>` +
        `<div class="acct-email">${email}</div>` +
        `</div>` +
        `<span class="acct-status-badge" data-state="${esc(sm.key)}"><i class="acct-dot" data-state="${esc(sm.key)}"></i><span data-acct-status-text>${esc(sm.label)}</span></span>`;
      metaText = `<span data-acct-last-sync>Last synced: ${esc(formatSyncTime(state.lastSyncedAt))}</span>`;
      if (state.syncError) {
        metaText += `<span class="acct-err">${esc(state.syncError)}</span>`;
      }
      actionsHtml =
        `<button type="button" class="btn primary" id="acctSyncNow" ${state.syncStatus === 'syncing' ? 'disabled' : ''}>${state.syncStatus === 'syncing' ? 'Syncing…' : 'Sync now'}</button>` +
        `<button type="button" class="btn" id="acctSignOut">Sign out</button>`;
    } else {
      const subtitle = unconfigured
        ? 'Google Sync not configured (.env)'
        : (!state.online ? 'Sync server unreachable — guest progress saved locally' : 'Guest mode — progress saved locally on this device');
      topHtml =
        `<span class="acct-guest-emblem">${GOOGLE_G_SVG}</span>` +
        `<div class="acct-info">` +
        `<div class="acct-name">Guest Mode</div>` +
        `<div class="acct-email">${esc(subtitle)}</div>` +
        `</div>` +
        `<span class="acct-status-badge" data-state="${esc(sm.key)}"><i class="acct-dot" data-state="${esc(sm.key)}"></i><span data-acct-status-text>${esc(sm.label)}</span></span>`;

      if (unconfigured) {
        const hint = state.setupHint || 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env to enable Google Cloud Sync.';
        metaText = `<span class="acct-hint-warn">${esc(hint)}</span>`;
        actionsHtml = `<button type="button" class="btn google-btn" id="acctSignIn" disabled title="Google Sync not configured (.env)">${GOOGLE_G_SVG}<span>Sign in with Google</span></button>`;
      } else {
        metaText = `<span>Sign in with Google to sync settings, stats &amp; mid-game saves across devices.</span>`;
        actionsHtml = `<button type="button" class="btn google-btn" id="acctSignIn" ${state.signingIn ? 'disabled' : ''}>${GOOGLE_G_SVG}<span>${state.signingIn ? 'Signing in…' : 'Sign in with Google'}</span></button>`;
      }
    }

    let serverRowHtml = '';
    if (isElectron()) {
      serverRowHtml =
        `<div class="acct-server-row">` +
        `<label for="acctServerUrl">Sync Server URL</label>` +
        `<input id="acctServerUrl" class="acct-input" type="url" value="${esc(state.serverUrl || DEFAULT_SERVER_URL)}" placeholder="${DEFAULT_SERVER_URL}" spellcheck="false" autocomplete="off">` +
        `<button type="button" class="btn" id="acctServerSave">Save</button>` +
        `</div>`;
    }

    sec.innerHTML =
      `<h3>Account &amp; Cloud Sync</h3>` +
      `<div class="acct-card">` +
      `<div class="acct-top">${topHtml}</div>` +
      `<div class="acct-meta">${metaText}</div>` +
      `<div class="acct-actions">${actionsHtml}</div>` +
      `${serverRowHtml}` +
      `</div>`;

    host.prepend(sec);
    bindAvatarFallbacks(sec);

    const btnIn = sec.querySelector('#acctSignIn');
    if (btnIn) btnIn.onclick = () => { playClick(); signIn(); };

    const btnSync = sec.querySelector('#acctSyncNow');
    if (btnSync) btnSync.onclick = () => { playClick(); syncNow({ force: true, manual: true }); };

    const btnOut = sec.querySelector('#acctSignOut');
    if (btnOut) btnOut.onclick = () => { playClick(); signOut(); };

    if (isElectron()) {
      const inp = sec.querySelector('#acctServerUrl');
      const saveBtn = sec.querySelector('#acctServerSave');
      const commitServerUrl = async () => {
        playClick();
        const normalized = normalizeServerUrl(inp.value);
        if (!normalized) {
          deps.toast?.('Enter a valid http:// or https:// URL');
          return;
        }
        saveBtn.disabled = true;
        try {
          const prevUrl = state.serverUrl;
          const saved = await window.slopDesktop.setServerUrl(normalized);
          state.serverUrl = normalizeServerUrl(saved) || normalized;
          inp.value = state.serverUrl;
          if (prevUrl && prevUrl !== state.serverUrl && state.token) {
            await window.slopDesktop.clearAuth().catch(() => {});
            state.token = null;
            state.user = null;
            state.lastSyncedAt = 0;
          }
          deps.toast?.('Sync server updated ✦');
          await refreshStatus();
        } catch (err) {
          deps.toast?.(err?.message || 'Failed to save server URL');
        } finally {
          saveBtn.disabled = false;
        }
      };
      if (saveBtn) saveBtn.onclick = commitServerUrl;
      if (inp) {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); commitServerUrl(); }
        });
      }
    }

    return sec;
  }

  function renderAll() {
    renderTopbar();
    renderStartBar();
    if (mountedSettingsContainer && mountedSettingsContainer.isConnected) {
      const settingsModal = $('#settingsModal');
      if (settingsModal && !settingsModal.classList.contains('hidden')) {
        renderSettingsSection(mountedSettingsContainer);
      }
    }
  }

  // ---------------------------------------------------------------- Network helpers
  async function apiFetch(path, opts = {}) {
    const url = apiBase() + path;
    const headers = Object.assign({}, opts.headers || {});
    const method = (opts.method || 'GET').toUpperCase();

    if (isElectron()) {
      if (state.token && !headers.Authorization) {
        headers.Authorization = 'Bearer ' + state.token;
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
        state.configured = false;
        state.online = false;
        state.setupHint = 'Cloud sync server not running.';
        if (!isElectron() || !state.token) {
          state.user = null;
          state.syncStatus = 'unconfigured';
        } else {
          state.syncStatus = 'offline';
        }
        renderAll();
        return getStatus();
      }
      if (!res.ok) {
        state.online = false;
        state.syncStatus = isSignedIn() ? 'offline' : 'signed_out';
        renderAll();
        return getStatus();
      }
      const data = await res.json();
      state.online = true;
      state.configured = Boolean(data.configured);
      state.setupHint = data.setupHint || '';

      if (data.user) {
        state.user = data.user;
        const snap = getSnapshot();
        if (hasUnsyncedLocalData(snap, data.progress)) {
          dirty = true;
          await syncNow({ force: true, silent: true });
        } else {
          if (data.progress && typeof deps.applyMergedProgress === 'function') {
            deps.applyMergedProgress(data.progress);
          }
          state.syncStatus = 'synced';
          state.lastSyncedAt = Date.now();
          state.syncError = '';
          scheduleElectronBackup(true);
        }
      } else {
        if (isElectron() && state.token) {
          await window.slopDesktop.clearAuth().catch(() => {});
        }
        state.token = null;
        state.user = null;
        state.syncStatus = state.configured ? 'signed_out' : 'unconfigured';
      }
    } catch (err) {
      state.online = false;
      if (isElectron() && state.token && state.user) {
        state.syncStatus = 'offline';
      } else {
        state.syncStatus = 'signed_out';
      }
    }

    renderAll();
    deps.onAuthChanged?.(state.user ? { ...state.user } : null);
    return getStatus();
  }

  // ---------------------------------------------------------------- Sync
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

      state.syncStatus = 'syncing';
      state.syncError = '';
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
          state.token = null;
          state.user = null;
          state.syncStatus = 'signed_out';
          state.syncError = '';
          dirty = false;
          renderAll();
          deps.onAuthChanged?.(null);
          if (!opts.silent) deps.toast?.('Session expired — please sign in again');
          return null;
        }

        if (!res.ok) {
          throw new Error('Sync failed (' + res.status + ')');
        }

        const data = await res.json();
        state.online = true;
        state.syncStatus = 'synced';
        state.lastSyncedAt = Date.now();
        state.syncError = '';

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
          dirty = false;
          if (data && data.progress && typeof deps.applyMergedProgress === 'function') {
            deps.applyMergedProgress(data.progress, { manual: Boolean(opts.manual || opts.force) });
          }
          scheduleElectronBackup(true);
        } else {
          dirty = true;
          resyncQueued = true;
        }

        updateStatusIndicators();
        if (opts.manual) {
          deps.toast?.('Cloud progress synced ✦');
        }
        return data?.progress || null;
      } catch (err) {
        dirty = true;
        const isNet = err?.name === 'TypeError' || err?.name === 'AbortError';
        state.online = !isNet;
        state.syncStatus = isNet ? 'offline' : 'error';
        state.syncError = isNet ? '' : (err?.message || 'Sync failed');
        updateStatusIndicators();
        if (opts.manual) {
          deps.toast?.(isNet ? 'Offline — changes kept locally' : (state.syncError || 'Sync failed'));
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
        setTimeout(() => { if (dirty && isSignedIn()) syncNow({ silent: true }); }, 150);
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
    if (!dirty && !meta.guestDelta && !meta.pendingResetStats) return;
    syncNow({ keepalive: true, silent: true });
  }

  function onLocalChange(key, value, opts = {}) {
    changeSeq++;
    scheduleElectronBackup(Boolean(opts && opts.immediate));

    if (!isSignedIn()) return;

    dirty = true;
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
          if (dirty && isSignedIn()) syncNow({ silent: true });
        });
      }
      return;
    }

    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      if (dirty && isSignedIn()) syncNow({ silent: true });
    }, SYNC_DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------- Sign In / Out
  function teardownPopupListeners() {
    if (authPopupCleanup) {
      authPopupCleanup();
      authPopupCleanup = null;
    }
  }

  async function completeSignIn(userObj) {
    state.signingIn = false;
    if (userObj) state.user = userObj;
    await refreshStatus();
    if (isSignedIn()) {
      const label = state.user?.name || state.user?.email || 'Google Account';
      deps.PopupFX?.pill?.('◈', 'ACCOUNT SYNCED', label, 'emerald', { always: true });
      deps.toast?.(`Signed in as ${shortDisplayName(state.user)} ✦`);
    }
    renderAll();
    deps.onAuthChanged?.(state.user ? { ...state.user } : null);
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

    state.signingIn = true;
    renderAll();

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
        state.signingIn = false;
        await refreshStatus();
        deps.toast?.(payload.error || 'Google sign-in failed or unconfigured');
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
        state.signingIn = false;
        await refreshStatus();
        if (isSignedIn()) {
          deps.PopupFX?.pill?.('◈', 'ACCOUNT SYNCED', state.user?.name || state.user?.email || 'Google Account', 'emerald', { always: true });
          deps.toast?.(`Signed in as ${shortDisplayName(state.user)} ✦`);
        }
        renderAll();
      }
    }, 500);
  }

  async function signIn() {
    if (state.signingIn) return;
    if (state.configured === false) {
      deps.toast?.('Google Sync not configured (.env)');
      openAccountSettings();
      return;
    }

    if (isElectron()) {
      state.signingIn = true;
      renderAll();
      try {
        const res = await window.slopDesktop.signInWithGoogle(state.serverUrl || DEFAULT_SERVER_URL);
        if (!res || !res.ok || !res.token || !res.user) {
          throw new Error(res?.error || 'Google sign-in was cancelled');
        }
        state.token = res.token;
        state.user = res.user;
        state.configured = true;
        state.online = true;
        state.signingIn = false;

        if (hasUnsyncedLocalData(getSnapshot(), res.progress) || !res.progress) {
          await syncNow({ force: true, silent: true });
        } else if (typeof deps.applyMergedProgress === 'function') {
          deps.applyMergedProgress(res.progress, { manual: true });
          state.syncStatus = 'synced';
          state.lastSyncedAt = Date.now();
          state.syncError = '';
          scheduleElectronBackup(true);
        }
        const label = state.user?.name || state.user?.email || 'Google Account';
        deps.PopupFX?.pill?.('◈', 'ACCOUNT SYNCED', label, 'emerald', { always: true });
        deps.toast?.(`Signed in as ${shortDisplayName(state.user)} ✦`);
        renderAll();
        deps.onAuthChanged?.(state.user ? { ...state.user } : null);
      } catch (err) {
        state.signingIn = false;
        renderAll();
        deps.toast?.(err?.message || 'Google sign-in failed');
      }
      return;
    }

    startWebSignIn();
  }

  async function signOut() {
    clearTimeout(syncTimer);
    syncTimer = null;
    dirty = false;
    teardownPopupListeners();

    try {
      if (isSignedIn()) {
        await apiFetch('/api/auth/logout', { method: 'POST', timeoutMs: 3500 }).catch(() => {});
      }
      if (isElectron() && typeof window.slopDesktop.clearAuth === 'function') {
        await window.slopDesktop.clearAuth().catch(() => {});
      }
    } finally {
      state.token = null;
      state.user = null;
      state.lastSyncedAt = 0;
      state.syncError = '';
      state.syncStatus = state.configured === false ? 'unconfigured' : 'signed_out';
      renderAll();
      deps.onAuthChanged?.(null);
      deps.toast?.('Signed out — local progress kept ✿');
    }
  }

  // ---------------------------------------------------------------- Lifecycle
  async function init(options = {}) {
    deps = options || {};
    state.initialized = true;

    if (isElectron()) {
      try {
        const cfg = await window.slopDesktop.getConfig();
        if (cfg) {
          state.serverUrl = normalizeServerUrl(cfg.serverUrl) || DEFAULT_SERVER_URL;
          state.token = cfg.token || null;
          state.user = cfg.user || null;
        }
      } catch (e) { /* ignore config error */ }
      await restoreElectronBackupIfEmpty();
    }

    renderAll();

    if (!init._listenersBound) {
      init._listenersBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) flushKeepalive();
      });
      window.addEventListener('pagehide', flushKeepalive);
    }

    await refreshStatus();
    return getStatus();
  }

  function getUser() {
    return state.user ? { ...state.user } : null;
  }

  function getStatus() {
    return {
      initialized: state.initialized,
      configured: state.configured,
      setupHint: state.setupHint,
      online: state.online,
      signedIn: isSignedIn(),
      user: getUser(),
      serverUrl: state.serverUrl,
      isElectron: isElectron(),
      syncStatus: state.syncStatus,
      lastSyncedAt: state.lastSyncedAt,
      syncError: state.syncError,
    };
  }

  window.Account = {
    init,
    isSignedIn,
    getUser,
    getStatus,
    signIn,
    signOut,
    syncNow,
    refreshStatus,
    onLocalChange,
    renderSettingsSection,
    renderTopbar,
    renderStartBar,
  };
})();
