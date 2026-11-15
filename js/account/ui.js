/* Slopitaire account — the account chip in the top bar, the start-screen bar and the settings section. */
'use strict';

function openAccountSettings() {
  accountDeps.Sound?.ensure?.();
  if (typeof accountDeps.openSettings === 'function') {
    accountDeps.openSettings();
    return;
  }
  $('#btnSettings')?.click();
}

function playClick() {
  accountDeps.Sound?.ensure?.();
  accountDeps.Sound?.sfx?.click?.();
}

function renderTopbar() {
  const btn = $('#btnAccount');
  const ic = $('#accountIc');
  const lbl = $('#accountLbl');
  if (!btn || !ic || !lbl) return;

  const sm = statusMeta();
  let dot = btn.querySelector('#accountDot');

  if (isSignedIn()) {
    btn.classList.add('is-signed-in');
    ic.innerHTML = avatarMarkup(accountState.user, false);
    bindAvatarFallbacks(ic);
    lbl.textContent = shortDisplayName(accountState.user);
    if (!dot) {
      dot = document.createElement('span');
      dot.id = 'accountDot';
      dot.className = 'acct-dot';
      dot.setAttribute('aria-hidden', 'true');
      btn.appendChild(dot);
    }
    dot.dataset.state = sm.key;
    btn.title = `${accountState.user.name || accountState.user.email || 'Google Account'} (${sm.label})`;
  } else {
    btn.classList.remove('is-signed-in');
    ic.innerHTML = GOOGLE_G_SVG;
    lbl.textContent = 'Sign in';
    if (dot) dot.remove();
    btn.title = accountState.configured === false
      ? 'Google Sync not configured (.env)'
      : 'Google Account & Cloud Sync';
  }
}

function renderStartBar() {
  const bar = $('#startAccountBar');
  if (!bar) return;

  const sm = statusMeta();
  if (isSignedIn()) {
    const name = esc(accountState.user.name || accountState.user.email || 'Google Account');
    bar.classList.add('is-signed-in');
    bar.innerHTML =
      `<div class="sab-left">` +
      `${avatarMarkup(accountState.user, false)}` +
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
  if (accountState.configured === false) {
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
    `<button type="button" class="btn google-btn compact" id="sabSignIn" ${accountState.signingIn ? 'disabled' : ''}>${GOOGLE_G_SVG}<span>${accountState.signingIn ? 'Signing in…' : 'Sign in with Google'}</span></button>` +
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
        lastEl.textContent = 'Last synced: ' + formatSyncTime(accountState.lastSyncedAt);
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
  const unconfigured = accountState.configured === false;

  let topHtml = '';
  let metaText = '';
  let actionsHtml = '';

  if (signedIn) {
    const name = esc(accountState.user.name || 'Google Player');
    const email = esc(accountState.user.email || 'Signed in with Google');
    topHtml =
      `${avatarMarkup(accountState.user, true)}` +
      `<div class="acct-info">` +
      `<div class="acct-name">${name}</div>` +
      `<div class="acct-email">${email}</div>` +
      `</div>` +
      `<span class="acct-status-badge" data-state="${esc(sm.key)}"><i class="acct-dot" data-state="${esc(sm.key)}"></i><span data-acct-status-text>${esc(sm.label)}</span></span>`;
    metaText = `<span data-acct-last-sync>Last synced: ${esc(formatSyncTime(accountState.lastSyncedAt))}</span>`;
    if (accountState.syncError) {
      metaText += `<span class="acct-err">${esc(accountState.syncError)}</span>`;
    }
    actionsHtml =
      `<button type="button" class="btn primary" id="acctSyncNow" ${accountState.syncStatus === 'syncing' ? 'disabled' : ''}>${accountState.syncStatus === 'syncing' ? 'Syncing…' : 'Sync now'}</button>` +
      `<button type="button" class="btn" id="acctSignOut">Sign out</button>`;
  } else {
    const subtitle = unconfigured
      ? 'Google Sync not configured (.env)'
      : (!accountState.online ? 'Sync server unreachable — guest progress saved locally' : 'Guest mode — progress saved locally on this device');
    topHtml =
      `<span class="acct-guest-emblem">${GOOGLE_G_SVG}</span>` +
      `<div class="acct-info">` +
      `<div class="acct-name">Guest Mode</div>` +
      `<div class="acct-email">${esc(subtitle)}</div>` +
      `</div>` +
      `<span class="acct-status-badge" data-state="${esc(sm.key)}"><i class="acct-dot" data-state="${esc(sm.key)}"></i><span data-acct-status-text>${esc(sm.label)}</span></span>`;

    if (unconfigured) {
      const hint = accountState.setupHint || 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env to enable Google Cloud Sync.';
      metaText = `<span class="acct-hint-warn">${esc(hint)}</span>`;
      actionsHtml = `<button type="button" class="btn google-btn" id="acctSignIn" disabled title="Google Sync not configured (.env)">${GOOGLE_G_SVG}<span>Sign in with Google</span></button>`;
    } else {
      metaText = `<span>Sign in with Google to sync settings, stats &amp; mid-game saves across devices.</span>`;
      actionsHtml = `<button type="button" class="btn google-btn" id="acctSignIn" ${accountState.signingIn ? 'disabled' : ''}>${GOOGLE_G_SVG}<span>${accountState.signingIn ? 'Signing in…' : 'Sign in with Google'}</span></button>`;
    }
  }

  let serverRowHtml = '';
  if (isElectron()) {
    serverRowHtml =
      `<div class="acct-server-row">` +
      `<label for="acctServerUrl">Sync Server URL</label>` +
      `<input id="acctServerUrl" class="acct-input" type="url" value="${esc(accountState.serverUrl || DEFAULT_SERVER_URL)}" placeholder="${DEFAULT_SERVER_URL}" spellcheck="false" autocomplete="off">` +
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
        accountDeps.toast?.('Enter a valid http:// or https:// URL');
        return;
      }
      saveBtn.disabled = true;
      try {
        const prevUrl = accountState.serverUrl;
        const saved = await window.slopDesktop.setServerUrl(normalized);
        accountState.serverUrl = normalizeServerUrl(saved) || normalized;
        inp.value = accountState.serverUrl;
        if (prevUrl && prevUrl !== accountState.serverUrl && accountState.token) {
          await window.slopDesktop.clearAuth().catch(() => {});
          accountState.token = null;
          accountState.user = null;
          accountState.lastSyncedAt = 0;
        }
        accountDeps.toast?.('Sync server updated ✦');
        await refreshStatus();
      } catch (err) {
        accountDeps.toast?.(err?.message || 'Failed to save server URL');
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

function renderAccountUI() {
  renderTopbar();
  renderStartBar();
  if (mountedSettingsContainer && mountedSettingsContainer.isConnected) {
    const settingsModal = $('#settingsModal');
    if (settingsModal && !settingsModal.classList.contains('hidden')) {
      renderSettingsSection(mountedSettingsContainer);
    }
  }
}
