/* Slopitaire — Spotify // PRISM Music Deck UI (Top-bar pill, slide-down drawer & Settings row). */
'use strict';

window.SpotifyUI = (() => {
  const TABS = [
    ['now', 'Now Playing'],
    ['playlists', 'Playlists'],
    ['search', 'Search'],
    ['embed', 'Quick Embed'],
    ['setup', 'Setup'],
  ];

  const escapeHtml = (s) => (
    typeof esc === 'function'
      ? esc(s)
      : String(s ?? '').replace(/[&<>"']/g, (ch) => (
        ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
      ))
  );

  function safeHttpUrl(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : '';
  }

  function formatMs(ms) {
    const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function formatArtists(artists) {
    if (!artists) return '';
    if (typeof artists === 'string') return artists;
    if (Array.isArray(artists)) {
      return artists.map((a) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ');
    }
    return String(artists.name || '');
  }

  function formatAlbum(album) {
    if (!album) return '';
    if (typeof album === 'string') return album;
    return String(album.name || '');
  }

  function pickArt(item) {
    if (!item || typeof item !== 'object') return '';
    return safeHttpUrl(
      item.artUrl
      || item.imageUrl
      || item.album?.artUrl
      || item.album?.images?.[0]?.url
      || item.images?.[0]?.url
      || ''
    );
  }

  function pickTrackCount(pl) {
    const raw = pl?.trackCount ?? pl?.tracksTotal ?? pl?.total ?? pl?.tracks?.total;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function pickUserName(user) {
    if (!user || typeof user !== 'object') return '';
    return String(user.displayName || user.display_name || user.name || user.id || '').trim();
  }

  function extractErr(err) {
    if (!err) return null;
    if (typeof err === 'string') return err.trim() ? { code: '', message: err.trim() } : null;
    if (typeof err === 'object') {
      const code = String(err.code || err.reason || '').trim();
      const message = String(err.message || err.error || '').trim();
      if (!code && !message) return null;
      return { code, message: message || code };
    }
    return null;
  }

  function ensureAudio() {
    try { window.Sound?.ensure?.(); } catch (e) { /* ignore audio boot error */ }
  }

  function sfxClick() {
    ensureAudio();
    try { window.Sound?.sfx?.click?.(); } catch (e) { /* ignore sfx error */ }
  }

  function notifyToast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
  }

  function callSpotify(method, ...args) {
    const sp = window.Spotify;
    if (!sp || typeof sp[method] !== 'function') return Promise.resolve(null);
    try {
      return Promise.resolve(sp[method](...args)).catch(() => null);
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function openExternalLink(url) {
    const safe = safeHttpUrl(url);
    if (!safe) return;
    try {
      window.open(safe, '_blank', 'noopener,noreferrer');
    } catch (e) { /* ignore popup block */ }
  }

  async function copyText(text) {
    const str = String(text || '');
    if (!str) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(str);
        return true;
      }
    } catch (e) { /* fallback below */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  let initialized = false;
  let unsubscribe = null;
  let lastState = null;

  // Root cached elements
  let barEl = null;
  let btnSpotify = null;
  let pillIc = null;
  let pillLbl = null;
  let btnQuickPlay = null;
  let btnQuickNext = null;

  let drawerEl = null;
  let modeBadge = null;
  let btnClose = null;
  let tabButtons = {};
  let tabPanels = {};

  let nowBody = null;
  let nowBanner = null;
  let nowStage = null;
  let playlistsBody = null;
  let searchInput = null;
  let searchBtn = null;
  let searchResults = null;
  let embedForm = null;
  let embedInput = null;
  let embedStopBtn = null;
  let embedMeta = null;
  let embedHost = null;
  let clientIdInput = null;
  let portField = null;
  let portInput = null;
  let saveConfigBtn = null;
  let setupStatus = null;

  // Persistent Now Playing controls & memo keys
  let nowMode = '';
  let nowBannerSig = '';
  let nowEmptySig = '';
  let nowTrackSig = '';
  let nowArtKey = '';
  let nowTransportSig = '';
  let nowDevicesSig = '';
  let nowVolValue = -1;
  let volDragging = false;
  let volTimer = null;
  let progDragging = false;
  let nowEls = {};

  // Other memo keys
  let pillArtKey = '';
  let playlistsSig = '';
  let searchSig = '';
  let embedMetaSig = '';
  let embedErrorMsg = '';
  let setupSig = '';
  let lastConfigCid = '';
  let lastConfigPort = '';
  let searchTimer = null;
  let copiedResetT = null;
  let wasDrawerOpen = false;
  let playlistRequested = false;

  function ensureMountContainers() {
    let bar = document.getElementById('spotifyBar');
    if (!bar) {
      const actions = document.querySelector('.topbar .actions') || document.querySelector('.topbar');
      bar = document.createElement('div');
      bar.id = 'spotifyBar';
      bar.className = 'spotify-bar';
      const btnSound = document.getElementById('btnSound');
      if (btnSound && btnSound.parentNode === actions) {
        btnSound.insertAdjacentElement('afterend', bar);
      } else if (actions) {
        actions.appendChild(bar);
      }
    }

    let drawer = document.getElementById('spotifyDrawer');
    if (!drawer) {
      const topbar = document.querySelector('header.topbar') || document.querySelector('.topbar');
      drawer = document.createElement('aside');
      drawer.id = 'spotifyDrawer';
      drawer.className = 'spotify-drawer is-closed';
      drawer.setAttribute('aria-label', 'Spotify Music Player');
      drawer.setAttribute('aria-hidden', 'true');
      if (topbar) topbar.insertAdjacentElement('afterend', drawer);
      else document.body.appendChild(drawer);
    }

    return { bar, drawer };
  }

  function buildBarSkeleton(bar) {
    bar.innerHTML =
      '<button type="button" id="btnSpotify" class="btn btn-spotify" title="Spotify Music Deck (P)" aria-expanded="false" aria-controls="spotifyDrawer">' +
      '<span class="ic sp-pill-ic" id="spPillIc">🎧</span>' +
      '<span class="sp-eq" id="spPillEq" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="lbl sp-pill-lbl" id="spPillLbl">Spotify</span>' +
      '</button>' +
      '<button type="button" id="btnSpotifyPlay" class="btn sp-quick-btn hidden" title="Play / Pause Spotify" aria-label="Play or pause Spotify">▶</button>' +
      '<button type="button" id="btnSpotifyNext" class="btn sp-quick-btn hidden" title="Next Spotify track" aria-label="Next Spotify track">⏭</button>';

    btnSpotify = bar.querySelector('#btnSpotify');
    pillIc = bar.querySelector('#spPillIc');
    pillLbl = bar.querySelector('#spPillLbl');
    btnQuickPlay = bar.querySelector('#btnSpotifyPlay');
    btnQuickNext = bar.querySelector('#btnSpotifyNext');

    btnSpotify.addEventListener('click', () => {
      sfxClick();
      callSpotify('toggleDrawer');
    });
    btnQuickPlay.addEventListener('click', () => {
      ensureAudio();
      callSpotify('togglePlay');
    });
    btnQuickNext.addEventListener('click', () => {
      ensureAudio();
      callSpotify('next');
    });
  }

  function buildDrawerSkeleton(drawer) {
    const tabsHtml = TABS.map(([id, label], idx) => (
      `<button type="button" class="sp-tab${idx === 0 ? ' is-active' : ''}" data-tab="${id}" role="tab" aria-selected="${idx === 0 ? 'true' : 'false'}">${escapeHtml(label)}</button>`
    )).join('');

    drawer.innerHTML =
      '<div class="sp-drawer-head">' +
        '<div class="sp-head-title">' +
          '<span class="sp-brand-dot" aria-hidden="true"></span>' +
          '<span class="sp-kicker">SPOTIFY // PRISM DECK</span>' +
          '<span id="spModeBadge" class="sp-mode-badge" data-mode="idle">GUEST</span>' +
        '</div>' +
        '<button type="button" id="spDrawerClose" class="sp-close-x" title="Close Spotify Deck (Esc)" aria-label="Close Spotify Deck">✕</button>' +
      '</div>' +
      `<div class="sp-tabs" id="spTabs" role="tablist" aria-label="Spotify sections">${tabsHtml}</div>` +
      '<div class="sp-body">' +
        '<section class="sp-panel is-active" data-panel="now" role="tabpanel">' +
          '<div id="spNowBody" class="sp-now-body">' +
            '<div id="spNowBanner"></div>' +
            '<div id="spNowStage"></div>' +
          '</div>' +
        '</section>' +
        '<section class="sp-panel" data-panel="playlists" role="tabpanel">' +
          '<div id="spPlaylistsBody" class="sp-playlists-body"></div>' +
        '</section>' +
        '<section class="sp-panel" data-panel="search" role="tabpanel">' +
          '<div class="sp-search-bar">' +
            '<input type="search" id="spSearchInput" class="sp-input" placeholder="Search tracks, playlists, or albums…" autocomplete="off" spellcheck="false" aria-label="Search Spotify catalog">' +
            '<button type="button" id="spSearchBtn" class="btn sp-mini-btn">Search</button>' +
          '</div>' +
          '<div id="spSearchResults" class="sp-search-results"></div>' +
        '</section>' +
        '<section class="sp-panel" data-panel="embed" role="tabpanel">' +
          '<div class="sp-embed-controls">' +
            '<form id="spEmbedForm" class="sp-embed-form" novalidate>' +
              '<input type="url" id="spEmbedInput" class="sp-input" placeholder="Paste Spotify playlist, track, or album link / URI…" autocomplete="off" spellcheck="false" aria-label="Spotify link or URI">' +
              '<button type="submit" id="spEmbedLoadBtn" class="btn sp-green-btn">Load ▶</button>' +
              '<button type="button" id="spEmbedStopBtn" class="btn sp-stop-btn hidden">Stop</button>' +
            '</form>' +
            '<div id="spEmbedMeta" class="sp-embed-meta"></div>' +
          '</div>' +
          '<div class="sp-embed-host" id="spEmbedHost"></div>' +
        '</section>' +
        '<section class="sp-panel" data-panel="setup" role="tabpanel">' +
          '<div id="spSetupFormWrap" class="sp-setup-form-wrap">' +
            '<div class="sp-field">' +
              '<label class="sp-label" for="spClientIdInput">Spotify Client ID</label>' +
              '<div class="sp-input-row">' +
                '<input type="text" id="spClientIdInput" class="sp-input" placeholder="Paste Client ID from developer.spotify.com" autocomplete="off" spellcheck="false">' +
              '</div>' +
            '</div>' +
            '<div class="sp-field hidden" id="spPortField">' +
              '<label class="sp-label" for="spPortInput">Electron Loopback Port</label>' +
              '<div class="sp-input-row">' +
                '<input type="number" id="spPortInput" class="sp-input sp-port-input" min="1024" max="65535" step="1" placeholder="43821">' +
                '<span class="sp-port-hint">Default: 43821</span>' +
              '</div>' +
            '</div>' +
            '<div class="sp-setup-save-row">' +
              '<button type="button" id="spSaveConfigBtn" class="btn sp-mini-btn">Save Config</button>' +
            '</div>' +
          '</div>' +
          '<div id="spSetupStatus" class="sp-setup-status"></div>' +
        '</section>' +
      '</div>';

    modeBadge = drawer.querySelector('#spModeBadge');
    btnClose = drawer.querySelector('#spDrawerClose');
    tabButtons = {};
    tabPanels = {};
    TABS.forEach(([id]) => {
      tabButtons[id] = drawer.querySelector(`.sp-tab[data-tab="${id}"]`);
      tabPanels[id] = drawer.querySelector(`.sp-panel[data-panel="${id}"]`);
    });

    nowBody = drawer.querySelector('#spNowBody');
    nowBanner = drawer.querySelector('#spNowBanner');
    nowStage = drawer.querySelector('#spNowStage');
    playlistsBody = drawer.querySelector('#spPlaylistsBody');
    searchInput = drawer.querySelector('#spSearchInput');
    searchBtn = drawer.querySelector('#spSearchBtn');
    searchResults = drawer.querySelector('#spSearchResults');
    embedForm = drawer.querySelector('#spEmbedForm');
    embedInput = drawer.querySelector('#spEmbedInput');
    embedStopBtn = drawer.querySelector('#spEmbedStopBtn');
    embedMeta = drawer.querySelector('#spEmbedMeta');
    embedHost = drawer.querySelector('.sp-embed-host');
    clientIdInput = drawer.querySelector('#spClientIdInput');
    portField = drawer.querySelector('#spPortField');
    portInput = drawer.querySelector('#spPortInput');
    saveConfigBtn = drawer.querySelector('#spSaveConfigBtn');
    setupStatus = drawer.querySelector('#spSetupStatus');

    // Mount permanent embed host ONCE; never cleared or replaced afterwards
    callSpotify('mountEmbedHost', embedHost);

    btnClose.addEventListener('click', () => {
      sfxClick();
      callSpotify('setDrawerOpen', false);
    });

    drawer.querySelector('#spTabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.sp-tab[data-tab]');
      if (!btn) return;
      sfxClick();
      const tab = btn.dataset.tab;
      callSpotify('setActiveTab', tab);
    });

    // Debounced (320ms) search input
    const runSearchNow = () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      callSpotify('searchCatalog', q);
    };
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      searchTimer = setTimeout(() => {
        if (!q || lastState?.auth?.signedIn) callSpotify('searchCatalog', q);
      }, 320);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearchNow();
      }
    });
    searchBtn.addEventListener('click', () => {
      sfxClick();
      runSearchNow();
    });

    // Quick Embed form
    embedForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      ensureAudio();
      const raw = embedInput.value.trim();
      if (!raw) {
        sfxClick();
        embedErrorMsg = 'Paste a Spotify playlist, track, or album link or URI first.';
        embedMetaSig = '';
        renderEmbedMeta(lastState || getSafeState());
        return;
      }
      if (typeof window.Spotify?.parseInput === 'function') {
        const parsed = window.Spotify.parseInput(raw);
        if (!parsed || !parsed.ok) {
          sfxClick();
          embedErrorMsg = parsed?.error || 'Could not recognize that Spotify URL or URI.';
          embedMetaSig = '';
          renderEmbedMeta(lastState || getSafeState());
          return;
        }
      }
      embedErrorMsg = '';
      embedMetaSig = '';
      await callSpotify('loadEmbed', raw);
    });
    embedInput.addEventListener('input', () => {
      if (embedErrorMsg) {
        embedErrorMsg = '';
        embedMetaSig = '';
        renderEmbedMeta(lastState || getSafeState());
      }
    });
    embedStopBtn.addEventListener('click', () => {
      ensureAudio();
      embedErrorMsg = '';
      callSpotify('stopEmbed');
    });

    // Setup config save
    const commitSetupConfig = async (silentToast = false) => {
      const clientId = clientIdInput.value.trim();
      const rawPort = Number(portInput.value);
      const cfg = { clientId };
      if (lastState?.auth?.isElectron) {
        cfg.port = Number.isInteger(rawPort) && rawPort >= 1024 && rawPort <= 65535
          ? rawPort
          : (lastState?.auth?.port || 43821);
      }
      await callSpotify('setConfig', cfg);
      if (!silentToast) notifyToast('Spotify config saved ✦');
    };
    saveConfigBtn.addEventListener('click', () => {
      sfxClick();
      commitSetupConfig(false);
    });
    [clientIdInput, portInput].forEach((inp) => {
      inp.addEventListener('change', () => {
        commitSetupConfig(true);
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sfxClick();
          commitSetupConfig(false);
        }
      });
    });

    // Expose helper on setupStatus click for saving unsaved clientId right before signIn
    setupStatus._commitBeforeSignIn = () => commitSetupConfig(true);
  }

  function syncDrawerTop() {
    if (!drawerEl) return;
    const topbar = document.querySelector('header.topbar') || document.querySelector('.topbar');
    if (!topbar) return;
    const rect = topbar.getBoundingClientRect();
    if (rect && rect.bottom > 0) {
      drawerEl.style.setProperty('--sp-top', `${Math.round(rect.bottom) + 4}px`);
    }
  }

  function getSafeState() {
    try {
      return window.Spotify?.getState?.() || {};
    } catch (e) {
      return {};
    }
  }

  function currentPlayingFlag(st) {
    if (st.mode === 'account') return Boolean(st.playback?.isPlaying);
    if (st.mode === 'embed') return Boolean(st.embed?.isPlaying);
    return false;
  }

  async function selectWebSdkOrFirst(st) {
    const devices = Array.isArray(st?.devices) ? st.devices : [];
    let webDev = devices.find((d) => d && d.isWebSdk);
    if (!webDev) {
      const fresh = await callSpotify('refreshDevices');
      if (Array.isArray(fresh)) {
        webDev = fresh.find((d) => d && d.isWebSdk);
      }
    }
    if (webDev && webDev.id) {
      callSpotify('selectDevice', webDev.id, true);
    } else {
      notifyToast('Web player is still connecting — try Refresh in a moment');
    }
  }

  function startAccountSignIn(st) {
    if (st.auth?.configured || st.auth?.clientId) {
      callSpotify('signIn');
    } else {
      callSpotify('setActiveTab', 'setup');
      notifyToast('Add your Spotify Client ID in Setup first ✦');
    }
  }

  // ---------- Topbar Render ----------
  function renderTopbar(st) {
    if (!btnSpotify) return;
    const mode = st.mode || 'idle';
    const track = st.playback?.track || null;
    const embedActive = Boolean(st.embed?.activeUri);
    const hasActive = (mode === 'account' && Boolean(track)) || (mode === 'embed' && embedActive);
    const isPlaying = currentPlayingFlag(st);
    const signedIn = Boolean(st.auth?.signedIn);

    btnSpotify.classList.toggle('is-playing', isPlaying);
    btnSpotify.classList.toggle('is-active', hasActive);
    btnSpotify.classList.toggle('is-connected', signedIn);
    btnSpotify.classList.toggle('is-open', Boolean(st.drawerOpen));
    btnSpotify.setAttribute('aria-expanded', String(Boolean(st.drawerOpen)));

    const artUrl = mode === 'account' && track ? pickArt(track) : '';
    const nextArtKey = artUrl ? `img:${artUrl}` : 'icon:headphones';
    if (nextArtKey !== pillArtKey) {
      pillArtKey = nextArtKey;
      if (artUrl) {
        pillIc.innerHTML = `<img class="sp-pill-art" src="${escapeHtml(artUrl)}" alt="" referrerpolicy="no-referrer">`;
        const img = pillIc.querySelector('img');
        if (img) {
          img.addEventListener('error', () => {
            pillArtKey = 'icon:headphones';
            pillIc.textContent = '🎧';
          }, { once: true });
        }
      } else {
        pillIc.textContent = '🎧';
      }
    }

    let label = 'Spotify';
    let title = 'Spotify Music Deck (P)';
    if (mode === 'account' && track) {
      label = track.name || 'Spotify';
      const artNames = formatArtists(track.artists);
      title = `${track.name}${artNames ? ' — ' + artNames : ''} · Spotify Music Deck (P)`;
    } else if (mode === 'embed' && embedActive) {
      label = st.embed?.title || 'Quick Embed';
      title = `${label} (Quick Embed) · Spotify Music Deck (P)`;
    } else if (signedIn) {
      title = `Spotify Connected (${pickUserName(st.auth?.user) || 'Account'}) · (P)`;
    }
    if (pillLbl.textContent !== label) pillLbl.textContent = label;
    if (btnSpotify.title !== title) btnSpotify.title = title;

    btnQuickPlay.classList.toggle('hidden', !hasActive);
    const playIcon = isPlaying ? '⏸' : '▶';
    if (btnQuickPlay.textContent !== playIcon) btnQuickPlay.textContent = playIcon;
    btnQuickPlay.title = isPlaying ? 'Pause Spotify' : 'Play Spotify';

    const showNext = mode === 'account' && Boolean(track);
    btnQuickNext.classList.toggle('hidden', !showNext);
  }

  // ---------- Drawer Shell & Tabs ----------
  function renderDrawerShell(st) {
    if (!drawerEl) return;
    const isOpen = Boolean(st.drawerOpen);
    if (isOpen && !wasDrawerOpen) {
      syncDrawerTop();
    }
    wasDrawerOpen = isOpen;

    drawerEl.classList.toggle('is-closed', !isOpen);
    drawerEl.setAttribute('aria-hidden', String(!isOpen));

    const mode = st.mode || 'idle';
    let badgeMode = 'idle';
    let badgeLabel = 'GUEST';
    if (mode === 'embed') {
      badgeMode = 'embed';
      badgeLabel = 'EMBED';
    } else if (mode === 'account' || st.auth?.signedIn) {
      badgeMode = 'account';
      badgeLabel = 'CONNECTED';
    }
    if (modeBadge.dataset.mode !== badgeMode) modeBadge.dataset.mode = badgeMode;
    if (modeBadge.textContent !== badgeLabel) modeBadge.textContent = badgeLabel;

    const activeTab = TABS.some(([id]) => id === st.activeTab) ? st.activeTab : 'now';
    TABS.forEach(([id]) => {
      const isAct = id === activeTab;
      const tb = tabButtons[id];
      const tp = tabPanels[id];
      if (tb) {
        tb.classList.toggle('is-active', isAct);
        tb.setAttribute('aria-selected', String(isAct));
      }
      if (tp) {
        tp.classList.toggle('is-active', isAct);
      }
    });

    // Auto-fetch library once when entering Playlists while signed in and empty
    if (isOpen && activeTab === 'playlists' && st.auth?.signedIn && !playlistRequested) {
      const lib = st.library || {};
      if (!lib.loading && !lib.error && !(lib.playlists?.length) && !(lib.likedTracks?.length) && !(lib.recentTracks?.length)) {
        playlistRequested = true;
        callSpotify('loadLibrary', false);
      }
    }
    if (!st.auth?.signedIn) playlistRequested = false;
  }

  // ---------- Tab 1: Now Playing ----------
  function renderNowBanner(st) {
    const rawErr = st.playback?.error || st.auth?.error || st.error;
    const parsed = extractErr(rawErr);
    const errCode = String(st.playback?.errorCode || parsed?.code || '').trim();
    const sdkSupported = Boolean(st.playback?.sdkSupported);
    const isWebSdk = Boolean(st.playback?.device?.isWebSdk);
    const sig = parsed ? `${errCode}|${parsed.message}|${sdkSupported}|${isWebSdk}` : '';
    if (sig === nowBannerSig) return;
    nowBannerSig = sig;

    if (!parsed) {
      nowBanner.innerHTML = '';
      return;
    }

    const combined = `${errCode} ${parsed.message}`;
    const isNoDevice = /NO_ACTIVE_DEVICE|no active.*device/i.test(combined);
    const isPremium = /PREMIUM_REQUIRED|premium/i.test(combined);

    let actionsHtml = '';
    if (isNoDevice) {
      actionsHtml =
        '<div class="sp-banner-actions">' +
        '<button type="button" class="btn sp-mini-btn" data-sp-banner="open-app">Open Spotify App ↗</button>' +
        (sdkSupported && !isWebSdk ? '<button type="button" class="btn sp-mini-btn sp-green-btn" data-sp-banner="stream-here">Stream Here</button>' : '') +
        '<button type="button" class="btn sp-mini-btn" data-sp-banner="to-embed">Switch to Quick Embed</button>' +
        '</div>';
    } else if (isPremium) {
      actionsHtml =
        '<div class="sp-banner-actions">' +
        '<button type="button" class="btn sp-mini-btn sp-green-btn" data-sp-banner="to-embed">Switch to Quick Embed</button>' +
        '</div>';
    }

    nowBanner.innerHTML =
      `<div class="sp-banner ${isNoDevice || isPremium ? 'is-warn' : 'is-err'}">` +
        `<div>${escapeHtml(parsed.message)}</div>` +
        actionsHtml +
      '</div>';

    nowBanner.querySelector('[data-sp-banner="open-app"]')?.addEventListener('click', () => {
      sfxClick();
      openExternalLink('https://open.spotify.com');
    });
    nowBanner.querySelector('[data-sp-banner="stream-here"]')?.addEventListener('click', () => {
      sfxClick();
      selectWebSdkOrFirst(lastState || st);
    });
    nowBanner.querySelector('[data-sp-banner="to-embed"]')?.addEventListener('click', () => {
      sfxClick();
      callSpotify('setActiveTab', 'embed');
    });
  }

  function buildAccountStage() {
    nowStage.innerHTML =
      '<div class="sp-now-card">' +
        '<div class="sp-art-wrap" id="spNowArtWrap">🎧</div>' +
        '<div class="sp-track-meta">' +
          '<div class="sp-track-title" id="spNowTitle"></div>' +
          '<div class="sp-track-artist" id="spNowArtists"></div>' +
          '<div class="sp-track-album" id="spNowAlbum"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sp-progress-block">' +
        '<div class="sp-progress-wrap" id="spProgWrap" role="slider" tabindex="0" aria-label="Seek track position" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">' +
          '<div class="sp-progress-track"><div class="sp-progress-fill" id="spProgFill"></div></div>' +
        '</div>' +
        '<div class="sp-progress-times"><span id="spProgElapsed">0:00</span><span id="spProgTotal">0:00</span></div>' +
      '</div>' +
      '<div class="sp-transport">' +
        '<button type="button" class="btn sp-t-btn" id="spBtnShuffle" title="Toggle Shuffle" aria-label="Toggle Shuffle" aria-pressed="false">🔀</button>' +
        '<button type="button" class="btn sp-t-btn" id="spBtnPrev" title="Previous Track" aria-label="Previous Track">⏮</button>' +
        '<button type="button" class="btn sp-t-play" id="spBtnToggle" title="Play / Pause" aria-label="Play or pause">▶</button>' +
        '<button type="button" class="btn sp-t-btn" id="spBtnNext" title="Next Track" aria-label="Next Track">⏭</button>' +
        '<button type="button" class="btn sp-t-btn" id="spBtnRepeat" title="Cycle Repeat" aria-label="Cycle Repeat">🔁</button>' +
      '</div>' +
      '<div class="sp-vol-row">' +
        '<span id="spVolIcon" aria-hidden="true">🔊</span>' +
        '<input type="range" id="spVolSlider" min="0" max="100" step="1" value="80" aria-label="Spotify volume">' +
        '<span class="sp-vol-val" id="spVolVal">80%</span>' +
      '</div>' +
      '<div class="sp-device-row">' +
        '<select id="spDeviceSelect" class="sp-select" aria-label="Playback device"></select>' +
        '<button type="button" class="btn sp-mini-btn" id="spBtnRefreshDev" title="Refresh devices">↻</button>' +
        '<button type="button" class="btn sp-mini-btn sp-green-btn hidden" id="spBtnStreamHere">Stream Here</button>' +
      '</div>';

    nowEls = {
      artWrap: nowStage.querySelector('#spNowArtWrap'),
      title: nowStage.querySelector('#spNowTitle'),
      artists: nowStage.querySelector('#spNowArtists'),
      album: nowStage.querySelector('#spNowAlbum'),
      progWrap: nowStage.querySelector('#spProgWrap'),
      progFill: nowStage.querySelector('#spProgFill'),
      progElapsed: nowStage.querySelector('#spProgElapsed'),
      progTotal: nowStage.querySelector('#spProgTotal'),
      btnShuffle: nowStage.querySelector('#spBtnShuffle'),
      btnPrev: nowStage.querySelector('#spBtnPrev'),
      btnToggle: nowStage.querySelector('#spBtnToggle'),
      btnNext: nowStage.querySelector('#spBtnNext'),
      btnRepeat: nowStage.querySelector('#spBtnRepeat'),
      volIcon: nowStage.querySelector('#spVolIcon'),
      volSlider: nowStage.querySelector('#spVolSlider'),
      volVal: nowStage.querySelector('#spVolVal'),
      deviceSelect: nowStage.querySelector('#spDeviceSelect'),
      btnRefreshDev: nowStage.querySelector('#spBtnRefreshDev'),
      btnStreamHere: nowStage.querySelector('#spBtnStreamHere'),
    };

    const seekAtClientX = (clientX, commit) => {
      const dur = Number(lastState?.playback?.track?.durationMs) || 0;
      if (!dur || !nowEls.progWrap) return;
      const rect = nowEls.progWrap.getBoundingClientRect();
      if (!rect.width) return;
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetMs = Math.round(frac * dur);
      nowEls.progFill.style.width = `${(frac * 100).toFixed(2)}%`;
      nowEls.progElapsed.textContent = formatMs(targetMs);
      if (commit) callSpotify('seek', targetMs);
    };

    nowEls.progWrap.addEventListener('pointerdown', (e) => {
      progDragging = true;
      nowEls.progWrap.setPointerCapture?.(e.pointerId);
      seekAtClientX(e.clientX, false);
    });
    nowEls.progWrap.addEventListener('pointermove', (e) => {
      if (!progDragging) return;
      seekAtClientX(e.clientX, false);
    });
    const finishProgDrag = (e) => {
      if (!progDragging) return;
      progDragging = false;
      seekAtClientX(e.clientX, true);
    };
    nowEls.progWrap.addEventListener('pointerup', finishProgDrag);
    nowEls.progWrap.addEventListener('pointercancel', () => { progDragging = false; });
    nowEls.progWrap.addEventListener('keydown', (e) => {
      const dur = Number(lastState?.playback?.track?.durationMs) || 0;
      const pos = Number(lastState?.playback?.positionMs) || 0;
      if (!dur) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 5000 : -5000;
        callSpotify('seek', Math.max(0, Math.min(dur, pos + delta)));
      }
    });

    nowEls.btnShuffle.addEventListener('click', () => { ensureAudio(); callSpotify('toggleShuffle'); });
    nowEls.btnPrev.addEventListener('click', () => { ensureAudio(); callSpotify('previous'); });
    nowEls.btnToggle.addEventListener('click', () => { ensureAudio(); callSpotify('togglePlay'); });
    nowEls.btnNext.addEventListener('click', () => { ensureAudio(); callSpotify('next'); });
    nowEls.btnRepeat.addEventListener('click', () => { ensureAudio(); callSpotify('cycleRepeat'); });

    nowEls.volSlider.addEventListener('pointerdown', () => { volDragging = true; });
    const endVolDrag = () => { volDragging = false; };
    nowEls.volSlider.addEventListener('pointerup', endVolDrag);
    nowEls.volSlider.addEventListener('pointercancel', endVolDrag);
    nowEls.volSlider.addEventListener('input', () => {
      const pct = Math.max(0, Math.min(100, Number(nowEls.volSlider.value) || 0));
      nowEls.volVal.textContent = `${pct}%`;
      nowEls.volIcon.textContent = pct === 0 ? '🔇' : pct < 45 ? '🔈' : '🔊';
      clearTimeout(volTimer);
      volTimer = setTimeout(() => callSpotify('setVolume', pct), 160);
    });
    nowEls.volSlider.addEventListener('change', () => {
      volDragging = false;
      clearTimeout(volTimer);
      const pct = Math.max(0, Math.min(100, Number(nowEls.volSlider.value) || 0));
      callSpotify('setVolume', pct);
    });

    nowEls.deviceSelect.addEventListener('change', () => {
      const id = nowEls.deviceSelect.value;
      if (id) callSpotify('selectDevice', id, true);
    });
    nowEls.btnRefreshDev.addEventListener('click', () => {
      sfxClick();
      callSpotify('refreshDevices');
    });
    nowEls.btnStreamHere.addEventListener('click', () => {
      sfxClick();
      selectWebSdkOrFirst(lastState || {});
    });

    nowArtKey = '';
    nowTrackSig = '';
    nowTransportSig = '';
    nowDevicesSig = '';
    nowVolValue = -1;
  }

  function patchAccountStage(st) {
    const pb = st.playback || {};
    const track = pb.track || {};
    const artUrl = pickArt(track);
    if (artUrl !== nowArtKey) {
      nowArtKey = artUrl;
      if (artUrl) {
        nowEls.artWrap.innerHTML = `<img class="sp-art-img" src="${escapeHtml(artUrl)}" alt="" referrerpolicy="no-referrer">`;
        const img = nowEls.artWrap.querySelector('img');
        if (img) {
          img.addEventListener('error', () => {
            nowArtKey = '';
            nowEls.artWrap.textContent = '🎧';
          }, { once: true });
        }
      } else {
        nowEls.artWrap.textContent = '🎧';
      }
    }

    const artistsStr = formatArtists(track.artists);
    const albumStr = formatAlbum(track.album);
    const extUrl = safeHttpUrl(track.externalUrl);
    const trackSig = `${track.uri || ''}|${track.name || ''}|${artistsStr}|${albumStr}|${extUrl}`;
    if (trackSig !== nowTrackSig) {
      nowTrackSig = trackSig;
      if (extUrl) {
        nowEls.title.innerHTML = `<a href="${escapeHtml(extUrl)}" target="_blank" rel="noopener noreferrer" title="Open on Spotify">${escapeHtml(track.name || 'Unknown Track')} ↗</a>`;
      } else {
        nowEls.title.textContent = track.name || 'Unknown Track';
      }
      nowEls.artists.textContent = artistsStr || 'Spotify';
      nowEls.album.textContent = albumStr;
    }

    const repeat = pb.repeat || 'off';
    const transportSig = `${Boolean(pb.isPlaying)}|${Boolean(pb.shuffle)}|${repeat}`;
    if (transportSig !== nowTransportSig) {
      nowTransportSig = transportSig;
      nowEls.btnToggle.textContent = pb.isPlaying ? '⏸' : '▶';
      nowEls.btnToggle.title = pb.isPlaying ? 'Pause' : 'Play';
      nowEls.btnShuffle.classList.toggle('is-on', Boolean(pb.shuffle));
      nowEls.btnShuffle.setAttribute('aria-pressed', String(Boolean(pb.shuffle)));
      nowEls.btnRepeat.classList.toggle('is-on', repeat !== 'off');
      nowEls.btnRepeat.textContent = repeat === 'track' ? '🔂' : '🔁';
      nowEls.btnRepeat.title = `Repeat: ${repeat}`;
    }

    const vol = Math.max(0, Math.min(100, Math.round(Number(pb.volume ?? 80))));
    if (!volDragging && document.activeElement !== nowEls.volSlider && vol !== nowVolValue) {
      nowVolValue = vol;
      nowEls.volSlider.value = String(vol);
      nowEls.volVal.textContent = `${vol}%`;
      nowEls.volIcon.textContent = vol === 0 ? '🔇' : vol < 45 ? '🔈' : '🔊';
    }

    const devices = Array.isArray(st.devices) ? st.devices : [];
    const activeDevId = pb.device?.id || '';
    const devSig = `${activeDevId}|` + devices.map((d) => `${d.id}:${d.name}:${Boolean(d.is_active || d.isActive)}:${Boolean(d.isWebSdk)}`).join(',');
    if (devSig !== nowDevicesSig && document.activeElement !== nowEls.deviceSelect) {
      nowDevicesSig = devSig;
      const list = devices.slice();
      if (pb.device && pb.device.id && !list.some((d) => d.id === pb.device.id)) {
        list.unshift(pb.device);
      }
      if (!list.length) {
        nowEls.deviceSelect.innerHTML = '<option value="">No active devices</option>';
      } else {
        nowEls.deviceSelect.innerHTML = list.map((d) => {
          const sel = (d.id === activeDevId || d.is_active || d.isActive) ? ' selected' : '';
          const tag = d.isWebSdk ? ' (This Browser)' : (d.type ? ` (${d.type})` : '');
          return `<option value="${escapeHtml(d.id)}"${sel}>${escapeHtml((d.name || 'Device') + tag)}</option>`;
        }).join('');
      }
    }

    const showStreamHere = Boolean(pb.sdkSupported && !pb.device?.isWebSdk);
    nowEls.btnStreamHere.classList.toggle('hidden', !showStreamHere);

    if (!progDragging) {
      const dur = Math.max(0, Number(track.durationMs) || 0);
      const pos = Math.max(0, Math.min(dur || Infinity, Number(pb.positionMs) || 0));
      const pct = dur > 0 ? Math.max(0, Math.min(100, (pos / dur) * 100)) : 0;
      nowEls.progFill.style.width = `${pct.toFixed(2)}%`;
      nowEls.progElapsed.textContent = formatMs(pos);
      nowEls.progTotal.textContent = formatMs(dur);
      nowEls.progWrap.setAttribute('aria-valuemax', String(dur));
      nowEls.progWrap.setAttribute('aria-valuenow', String(pos));
    }
  }

  function buildEmbedNowStage() {
    nowStage.innerHTML =
      '<div class="sp-now-card">' +
        '<div class="sp-art-wrap">🎧</div>' +
        '<div class="sp-track-meta">' +
          '<div class="sp-track-title" id="spEmbNowTitle"></div>' +
          '<div class="sp-track-artist" id="spEmbNowSub">Quick Embed Player</div>' +
          '<div class="sp-track-album" id="spEmbNowUri"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sp-progress-block" id="spEmbProgBlock">' +
        '<div class="sp-progress-track"><div class="sp-progress-fill" id="spEmbProgFill"></div></div>' +
        '<div class="sp-progress-times"><span id="spEmbElapsed">0:00</span><span id="spEmbTotal">0:00</span></div>' +
      '</div>' +
      '<div class="sp-banner-actions">' +
        '<button type="button" class="btn sp-mini-btn sp-green-btn" id="spEmbNowToggle">▶ Play / Pause</button>' +
        '<button type="button" class="btn sp-mini-btn" id="spEmbNowView">Open Embed View</button>' +
        '<button type="button" class="btn sp-stop-btn" id="spEmbNowStop">Stop</button>' +
        '<button type="button" class="btn sp-mini-btn hidden" id="spEmbNowConn">Connect Account</button>' +
      '</div>';

    nowEls = {
      title: nowStage.querySelector('#spEmbNowTitle'),
      sub: nowStage.querySelector('#spEmbNowSub'),
      uri: nowStage.querySelector('#spEmbNowUri'),
      progBlock: nowStage.querySelector('#spEmbProgBlock'),
      progFill: nowStage.querySelector('#spEmbProgFill'),
      elapsed: nowStage.querySelector('#spEmbElapsed'),
      total: nowStage.querySelector('#spEmbTotal'),
      toggle: nowStage.querySelector('#spEmbNowToggle'),
      view: nowStage.querySelector('#spEmbNowView'),
      stop: nowStage.querySelector('#spEmbNowStop'),
      conn: nowStage.querySelector('#spEmbNowConn'),
    };

    nowEls.toggle.addEventListener('click', () => { ensureAudio(); callSpotify('togglePlay'); });
    nowEls.view.addEventListener('click', () => { sfxClick(); callSpotify('setActiveTab', 'embed'); });
    nowEls.stop.addEventListener('click', () => { ensureAudio(); callSpotify('stopEmbed'); });
    nowEls.conn.addEventListener('click', () => { sfxClick(); startAccountSignIn(lastState || {}); });
  }

  function patchEmbedNowStage(st) {
    const emb = st.embed || {};
    nowEls.title.textContent = emb.title || 'Spotify Quick Embed';
    nowEls.sub.textContent = emb.isPlaying ? 'Quick Embed · Playing' : 'Quick Embed · Ready';
    nowEls.uri.textContent = emb.activeUri || '';
    nowEls.toggle.textContent = emb.isPlaying ? '⏸ Pause' : '▶ Play';
    nowEls.conn.classList.toggle('hidden', Boolean(st.auth?.signedIn));

    const dur = Math.max(0, Number(emb.durationMs) || 0);
    const pos = Math.max(0, Number(emb.positionMs) || 0);
    nowEls.progBlock.style.visibility = dur > 0 ? 'visible' : 'hidden';
    if (dur > 0) {
      const pct = Math.max(0, Math.min(100, (pos / dur) * 100));
      nowEls.progFill.style.width = `${pct.toFixed(2)}%`;
      nowEls.elapsed.textContent = formatMs(pos);
      nowEls.total.textContent = formatMs(dur);
    }
  }

  function renderEmptyNowStage(st) {
    const signedIn = Boolean(st.auth?.signedIn);
    const signingIn = Boolean(st.auth?.signingIn);
    const sdkSupported = Boolean(st.playback?.sdkSupported);
    const isWebSdk = Boolean(st.playback?.device?.isWebSdk);
    const devices = Array.isArray(st.devices) ? st.devices : [];
    const devSig = devices.map((d) => `${d.id}:${d.name}:${Boolean(d.is_active || d.isActive)}:${Boolean(d.isWebSdk)}`).join(',');
    const userName = pickUserName(st.auth?.user);
    const sig = `${signedIn}|${signingIn}|${sdkSupported}|${isWebSdk}|${userName}|${devSig}|${st.playback?.device?.id || ''}`;
    if (nowMode === 'empty' && sig === nowEmptySig) return;
    nowEmptySig = sig;

    if (signedIn) {
      const optsHtml = devices.length
        ? devices.map((d) => {
          const sel = (d.id === st.playback?.device?.id || d.is_active || d.isActive) ? ' selected' : '';
          const tag = d.isWebSdk ? ' (This Browser)' : (d.type ? ` (${d.type})` : '');
          return `<option value="${escapeHtml(d.id)}"${sel}>${escapeHtml((d.name || 'Device') + tag)}</option>`;
        }).join('')
        : '<option value="">No active devices</option>';

      nowStage.innerHTML =
        '<div class="sp-empty">' +
          '<div class="sp-empty-ic">🎧</div>' +
          `<div class="sp-empty-title">Ready to play${userName ? `, ${escapeHtml(userName)}` : ''}</div>` +
          '<div class="sp-muted">Pick a playlist, search the catalog, or launch a Quick Embed preset.</div>' +
          '<div class="sp-empty-actions">' +
            '<button type="button" class="btn sp-mini-btn sp-green-btn" data-sp-empty="playlists">Browse Playlists</button>' +
            '<button type="button" class="btn sp-mini-btn" data-sp-empty="search">Search</button>' +
            '<button type="button" class="btn sp-mini-btn" data-sp-empty="embed">Paste Link / Presets</button>' +
          '</div>' +
        '</div>' +
        '<div class="sp-device-row" style="margin-top:8px">' +
          `<select id="spEmptyDevSel" class="sp-select" aria-label="Playback device">${optsHtml}</select>` +
          '<button type="button" class="btn sp-mini-btn" id="spEmptyRefDev" title="Refresh devices">↻</button>' +
          (sdkSupported && !isWebSdk ? '<button type="button" class="btn sp-mini-btn sp-green-btn" id="spEmptyStreamHere">Stream Here</button>' : '') +
        '</div>';

      nowStage.querySelector('[data-sp-empty="playlists"]')?.addEventListener('click', () => { sfxClick(); callSpotify('setActiveTab', 'playlists'); });
      nowStage.querySelector('[data-sp-empty="search"]')?.addEventListener('click', () => { sfxClick(); callSpotify('setActiveTab', 'search'); });
      nowStage.querySelector('[data-sp-empty="embed"]')?.addEventListener('click', () => { sfxClick(); callSpotify('setActiveTab', 'embed'); });
      nowStage.querySelector('#spEmptyDevSel')?.addEventListener('change', (e) => {
        if (e.target.value) callSpotify('selectDevice', e.target.value, true);
      });
      nowStage.querySelector('#spEmptyRefDev')?.addEventListener('click', () => {
        sfxClick();
        callSpotify('refreshDevices');
      });
      nowStage.querySelector('#spEmptyStreamHere')?.addEventListener('click', () => {
        sfxClick();
        selectWebSdkOrFirst(lastState || st);
      });
      return;
    }

    nowStage.innerHTML =
      '<div class="sp-empty">' +
        '<div class="sp-empty-ic">🎧</div>' +
        '<div class="sp-empty-title">Bring your own soundtrack</div>' +
        '<div class="sp-muted">Connect your Spotify account for full playback &amp; playlists, or paste any link in Quick Embed — zero setup needed.</div>' +
        '<div class="sp-empty-actions">' +
          `<button type="button" class="btn sp-mini-btn sp-green-btn" data-sp-empty="connect" ${signingIn ? 'disabled' : ''}>${signingIn ? 'Connecting…' : 'Connect Spotify Account'}</button>` +
          '<button type="button" class="btn sp-mini-btn" data-sp-empty="embed">Paste Link / Presets</button>' +
        '</div>' +
      '</div>';

    nowStage.querySelector('[data-sp-empty="connect"]')?.addEventListener('click', () => {
      sfxClick();
      startAccountSignIn(lastState || st);
    });
    nowStage.querySelector('[data-sp-empty="embed"]')?.addEventListener('click', () => {
      sfxClick();
      callSpotify('setActiveTab', 'embed');
    });
  }

  function renderNowPlaying(st) {
    renderNowBanner(st);
    const mode = st.mode || 'idle';
    const nextMode = (mode === 'account' && st.playback?.track)
      ? 'account'
      : (mode === 'embed' && st.embed?.activeUri)
        ? 'embed'
        : 'empty';

    if (nextMode !== nowMode) {
      nowMode = nextMode;
      nowEmptySig = '';
      if (nextMode === 'account') buildAccountStage();
      else if (nextMode === 'embed') buildEmbedNowStage();
    }

    if (nextMode === 'account') patchAccountStage(st);
    else if (nextMode === 'embed') patchEmbedNowStage(st);
    else renderEmptyNowStage(st);
  }

  // ---------- Tab 2: Playlists ----------
  function renderPlaylists(st) {
    const signedIn = Boolean(st.auth?.signedIn);
    const signingIn = Boolean(st.auth?.signingIn);
    const lib = st.library || {};
    const playlists = Array.isArray(lib.playlists) ? lib.playlists : [];
    const liked = Array.isArray(lib.likedTracks) ? lib.likedTracks : [];
    const recent = Array.isArray(lib.recentTracks) ? lib.recentTracks : [];
    const likedTotal = Number(lib.likedTotal ?? liked.length) || 0;

    const sig = [
      signedIn,
      signingIn,
      Boolean(lib.loading),
      lib.error || '',
      likedTotal,
      liked.length,
      recent.length,
      playlists.map((p) => `${p.id || p.uri}:${p.name}:${pickTrackCount(p) ?? ''}`).join(','),
    ].join('|');

    if (sig === playlistsSig) return;
    playlistsSig = sig;

    if (!signedIn) {
      playlistsBody.innerHTML =
        '<div class="sp-empty">' +
          '<div class="sp-empty-ic">♫</div>' +
          '<div class="sp-empty-title">Spotify Library</div>' +
          '<div class="sp-muted">Sign in to browse your Liked Songs, Recently Played tracks, and personal playlists.</div>' +
          '<div class="sp-empty-actions">' +
            `<button type="button" class="btn sp-mini-btn sp-green-btn" data-sp-pl-act="connect" ${signingIn ? 'disabled' : ''}>${signingIn ? 'Connecting…' : 'Connect Spotify'}</button>` +
            '<button type="button" class="btn sp-mini-btn" data-sp-pl-act="embed">Quick Embed</button>' +
          '</div>' +
        '</div>';
      playlistsBody.querySelector('[data-sp-pl-act="connect"]')?.addEventListener('click', () => {
        sfxClick();
        startAccountSignIn(lastState || st);
      });
      playlistsBody.querySelector('[data-sp-pl-act="embed"]')?.addEventListener('click', () => {
        sfxClick();
        callSpotify('setActiveTab', 'embed');
      });
      return;
    }

    const errHtml = lib.error
      ? `<div class="sp-banner is-err"><div>${escapeHtml(lib.error)}</div><div class="sp-banner-actions"><button type="button" class="btn sp-mini-btn" id="spPlRetry">Retry</button></div></div>`
      : '';

    const plListHtml = playlists.length
      ? playlists.map((pl, idx) => {
        const art = pickArt(pl);
        const count = pickTrackCount(pl);
        const subParts = [];
        if (count !== null) subParts.push(`${count} track${count === 1 ? '' : 's'}`);
        if (pl.owner?.display_name || pl.owner?.id || (typeof pl.owner === 'string' && pl.owner)) {
          subParts.push(typeof pl.owner === 'string' ? pl.owner : (pl.owner.display_name || pl.owner.id));
        }
        return (
          `<div class="sp-item">` +
            `<div class="sp-thumb">${art ? `<img src="${escapeHtml(art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '♫'}</div>` +
            `<div class="sp-item-meta">` +
              `<div class="sp-item-title">${escapeHtml(pl.name || 'Playlist')}</div>` +
              `<div class="sp-item-sub">${escapeHtml(subParts.join(' · ') || 'Playlist')}</div>` +
            `</div>` +
            `<button type="button" class="btn sp-item-play sp-green-btn" data-sp-pl-idx="${idx}" title="Play playlist">▶</button>` +
          `</div>`
        );
      }).join('')
      : `<div class="sp-muted">${lib.loading ? 'Loading your playlists…' : 'No playlists found in your library.'}</div>`;

    playlistsBody.innerHTML =
      '<div class="sp-section-head">' +
        '<span class="sp-section-title">Quick Mixes</span>' +
        `<button type="button" class="btn sp-mini-btn" id="spBtnRefreshLib" ${lib.loading ? 'disabled' : ''}>${lib.loading ? 'Loading…' : '↻ Refresh'}</button>` +
      '</div>' +
      errHtml +
      '<div class="sp-quick-cards">' +
        '<div class="sp-qcard">' +
          '<div class="sp-qcard-info">' +
            '<div class="sp-qcard-name">♥ Liked Songs</div>' +
            `<div class="sp-qcard-sub">${likedTotal} track${likedTotal === 1 ? '' : 's'}</div>` +
          '</div>' +
          `<button type="button" class="btn sp-item-play sp-green-btn" id="spPlayLiked" ${liked.length ? '' : 'disabled'} title="Play Liked Songs">▶</button>` +
        '</div>' +
        '<div class="sp-qcard">' +
          '<div class="sp-qcard-info">' +
            '<div class="sp-qcard-name">⏱ Recently Played</div>' +
            `<div class="sp-qcard-sub">${recent.length} track${recent.length === 1 ? '' : 's'}</div>` +
          '</div>' +
          `<button type="button" class="btn sp-item-play sp-green-btn" id="spPlayRecent" ${recent.length ? '' : 'disabled'} title="Play Recently Played">▶</button>` +
        '</div>' +
      '</div>' +
      '<div class="sp-section-head" style="margin-top:4px">' +
        `<span class="sp-section-title">Your Playlists (${playlists.length})</span>` +
      '</div>' +
      `<div class="sp-list">${plListHtml}</div>`;

    playlistsBody.querySelector('#spBtnRefreshLib')?.addEventListener('click', () => {
      sfxClick();
      callSpotify('loadLibrary', true);
    });
    playlistsBody.querySelector('#spPlRetry')?.addEventListener('click', () => {
      sfxClick();
      callSpotify('loadLibrary', true);
    });
    playlistsBody.querySelector('#spPlayLiked')?.addEventListener('click', () => {
      ensureAudio();
      const uris = liked.map((t) => t?.uri).filter(Boolean);
      if (uris.length) callSpotify('playTracks', uris, 0);
    });
    playlistsBody.querySelector('#spPlayRecent')?.addEventListener('click', () => {
      ensureAudio();
      const uris = recent.map((t) => t?.uri).filter(Boolean);
      if (uris.length) callSpotify('playTracks', uris, 0);
    });
    playlistsBody.querySelectorAll('[data-sp-pl-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ensureAudio();
        const pl = playlists[Number(btn.dataset.spPlIdx)];
        if (pl?.uri) callSpotify('playContext', pl.uri);
      });
    });
  }

  // ---------- Tab 3: Search ----------
  function renderSearch(st) {
    const signedIn = Boolean(st.auth?.signedIn);
    const signingIn = Boolean(st.auth?.signingIn);
    const sr = st.search || {};
    const tracks = Array.isArray(sr.tracks) ? sr.tracks : [];
    const playlists = Array.isArray(sr.playlists) ? sr.playlists : [];
    const albums = Array.isArray(sr.albums) ? sr.albums : [];
    const activeUri = st.playback?.track?.uri || '';

    const sig = [
      signedIn,
      signingIn,
      Boolean(sr.loading),
      sr.error || '',
      sr.query || '',
      activeUri,
      tracks.map((t) => t.uri || t.id).join(','),
      playlists.map((p) => p.uri || p.id).join(','),
      albums.map((a) => a.uri || a.id).join(','),
    ].join('|');

    if (sig === searchSig) return;
    searchSig = sig;

    if (!signedIn) {
      searchResults.innerHTML =
        '<div class="sp-empty">' +
          '<div class="sp-empty-ic">🔎</div>' +
          '<div class="sp-empty-title">Search Spotify Catalog</div>' +
          '<div class="sp-muted">Connect your Spotify account to search songs, playlists, and albums — or drop any link in Quick Embed.</div>' +
          '<div class="sp-empty-actions">' +
            `<button type="button" class="btn sp-mini-btn sp-green-btn" data-sp-sr-act="connect" ${signingIn ? 'disabled' : ''}>${signingIn ? 'Connecting…' : 'Connect Spotify'}</button>` +
            '<button type="button" class="btn sp-mini-btn" data-sp-sr-act="embed">Quick Embed</button>' +
          '</div>' +
        '</div>';
      searchResults.querySelector('[data-sp-sr-act="connect"]')?.addEventListener('click', () => {
        sfxClick();
        startAccountSignIn(lastState || st);
      });
      searchResults.querySelector('[data-sp-sr-act="embed"]')?.addEventListener('click', () => {
        sfxClick();
        callSpotify('setActiveTab', 'embed');
      });
      return;
    }

    if (sr.loading) {
      searchResults.innerHTML = '<div class="sp-muted">Searching Spotify…</div>';
      return;
    }
    if (sr.error) {
      searchResults.innerHTML = `<div class="sp-banner is-err"><div>${escapeHtml(sr.error)}</div></div>`;
      return;
    }
    const q = (sr.query || '').trim();
    if (!q) {
      searchResults.innerHTML = '<div class="sp-muted">Type a song, artist, playlist, or album above to search Spotify.</div>';
      return;
    }
    if (!tracks.length && !playlists.length && !albums.length) {
      searchResults.innerHTML = `<div class="sp-muted">No results found for “${escapeHtml(q)}”.</div>`;
      return;
    }

    const parts = [];
    if (tracks.length) {
      parts.push(
        '<div class="sp-section-title">Tracks</div>' +
        '<div class="sp-list">' +
        tracks.map((t, idx) => {
          const art = pickArt(t);
          const sub = [formatArtists(t.artists), t.durationMs ? formatMs(t.durationMs) : ''].filter(Boolean).join(' · ');
          const isCur = activeUri && t.uri === activeUri;
          return (
            `<div class="sp-item${isCur ? ' is-active' : ''}">` +
              `<div class="sp-thumb">${art ? `<img src="${escapeHtml(art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '♪'}</div>` +
              `<div class="sp-item-meta">` +
                `<div class="sp-item-title">${escapeHtml(t.name || 'Track')}</div>` +
                `<div class="sp-item-sub">${escapeHtml(sub || 'Track')}</div>` +
              `</div>` +
              `<button type="button" class="btn sp-item-play sp-green-btn" data-sp-sr-track="${idx}" title="Play track">▶</button>` +
            `</div>`
          );
        }).join('') +
        '</div>'
      );
    }

    if (playlists.length) {
      parts.push(
        '<div class="sp-section-title">Playlists</div>' +
        '<div class="sp-list">' +
        playlists.map((pl, idx) => {
          const art = pickArt(pl);
          const owner = typeof pl.owner === 'string' ? pl.owner : (pl.owner?.display_name || pl.owner?.id || '');
          return (
            '<div class="sp-item">' +
              `<div class="sp-thumb">${art ? `<img src="${escapeHtml(art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '♫'}</div>` +
              '<div class="sp-item-meta">' +
                `<div class="sp-item-title">${escapeHtml(pl.name || 'Playlist')}</div>` +
                `<div class="sp-item-sub">${escapeHtml(owner || 'Playlist')}</div>` +
              '</div>' +
              `<button type="button" class="btn sp-item-play sp-green-btn" data-sp-sr-pl="${idx}" title="Play playlist">▶</button>` +
            '</div>'
          );
        }).join('') +
        '</div>'
      );
    }

    if (albums.length) {
      parts.push(
        '<div class="sp-section-title">Albums</div>' +
        '<div class="sp-list">' +
        albums.map((al, idx) => {
          const art = pickArt(al);
          const count = pickTrackCount(al);
          const sub = [
            formatArtists(al.artists),
            count ? `${count} track${count === 1 ? '' : 's'}` : (al.releaseDate ? String(al.releaseDate).slice(0, 4) : ''),
          ].filter(Boolean).join(' · ');
          return (
            '<div class="sp-item">' +
              `<div class="sp-thumb">${art ? `<img src="${escapeHtml(art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '💿'}</div>` +
              '<div class="sp-item-meta">' +
                `<div class="sp-item-title">${escapeHtml(al.name || 'Album')}</div>` +
                `<div class="sp-item-sub">${escapeHtml(sub || 'Album')}</div>` +
              '</div>' +
              `<button type="button" class="btn sp-item-play sp-green-btn" data-sp-sr-al="${idx}" title="Play album">▶</button>` +
            '</div>'
          );
        }).join('') +
        '</div>'
      );
    }

    searchResults.innerHTML = parts.join('');
    const trackUris = tracks.map((t) => t?.uri).filter(Boolean);
    searchResults.querySelectorAll('[data-sp-sr-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ensureAudio();
        const idx = Number(btn.dataset.spSrTrack);
        if (trackUris[idx]) callSpotify('playTracks', trackUris, idx);
      });
    });
    searchResults.querySelectorAll('[data-sp-sr-pl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ensureAudio();
        const pl = playlists[Number(btn.dataset.spSrPl)];
        if (pl?.uri) callSpotify('playContext', pl.uri);
      });
    });
    searchResults.querySelectorAll('[data-sp-sr-al]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ensureAudio();
        const al = albums[Number(btn.dataset.spSrAl)];
        if (al?.uri) callSpotify('playContext', al.uri);
      });
    });
  }

  // ---------- Tab 4: Quick Embed ----------
  function renderEmbedMeta(st) {
    const emb = st.embed || {};
    const activeUri = emb.activeUri || '';
    const presets = Array.isArray(emb.presets) ? emb.presets : [];
    const recentLinks = Array.isArray(emb.recentLinks) ? emb.recentLinks : [];

    embedStopBtn.classList.toggle('hidden', !activeUri);

    const sig = [
      activeUri,
      embedErrorMsg,
      presets.map((p) => `${p.uri}:${p.label}`).join(','),
      recentLinks.map((r) => (typeof r === 'string' ? r : `${r?.uri || r?.url || ''}:${r?.title || r?.label || ''}`)).join(','),
    ].join('|');

    if (sig === embedMetaSig) return;
    embedMetaSig = sig;

    const errHtml = embedErrorMsg
      ? `<div class="sp-banner is-err">${escapeHtml(embedErrorMsg)}</div>`
      : '';

    const presetsHtml = presets.length
      ? '<div class="sp-chip-group">' +
          '<span class="sp-section-title">Prism Vibe Presets</span>' +
          '<div class="sp-chips">' +
          presets.map((p, idx) => (
            `<button type="button" class="sp-chip-btn${activeUri === p.uri ? ' is-active' : ''}" data-sp-preset="${idx}">` +
              `<span>${escapeHtml(p.icon || '♫')}</span>` +
              `<span class="sp-chip-lbl">${escapeHtml(p.label || p.uri)}</span>` +
            '</button>'
          )).join('') +
          '</div>' +
        '</div>'
      : '';

    const recentHtml = recentLinks.length
      ? '<div class="sp-chip-group">' +
          '<span class="sp-section-title">Recent Links</span>' +
          '<div class="sp-chips">' +
          recentLinks.map((item, idx) => {
            const uri = typeof item === 'string' ? item : (item?.uri || item?.url || '');
            const lbl = typeof item === 'string' ? item : (item?.title || item?.label || uri);
            return (
              `<button type="button" class="sp-chip-btn${activeUri === uri ? ' is-active' : ''}" data-sp-recent="${idx}" title="${escapeHtml(uri)}">` +
                `<span>🎧</span>` +
                `<span class="sp-chip-lbl">${escapeHtml(lbl)}</span>` +
              '</button>'
            );
          }).join('') +
          '</div>' +
        '</div>'
      : '';

    const hintHtml = !activeUri
      ? '<div class="sp-muted">Pick a Prism Vibe preset or paste any Spotify track, album, or playlist link above — plays free without login.</div>'
      : '';

    // Never touch embedHost (#spEmbedHost) — only update #spEmbedMeta!
    embedMeta.innerHTML = errHtml + presetsHtml + recentHtml + hintHtml;

    embedMeta.querySelectorAll('[data-sp-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ensureAudio();
        embedErrorMsg = '';
        const p = presets[Number(btn.dataset.spPreset)];
        if (p?.uri) callSpotify('loadEmbed', p.uri, p.label);
      });
    });
    embedMeta.querySelectorAll('[data-sp-recent]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ensureAudio();
        embedErrorMsg = '';
        const item = recentLinks[Number(btn.dataset.spRecent)];
        const uri = typeof item === 'string' ? item : (item?.uri || item?.url || '');
        const title = typeof item === 'string' ? '' : (item?.title || item?.label || '');
        if (uri) {
          embedInput.value = uri;
          callSpotify('loadEmbed', uri, title);
        }
      });
    });
  }

  // ---------- Tab 5: Setup ----------
  function renderSetup(st) {
    const auth = st.auth || {};
    const isElectron = Boolean(auth.isElectron);

    portField.classList.toggle('hidden', !isElectron);

    const nextCid = String(auth.clientId || '');
    if (nextCid !== lastConfigCid && document.activeElement !== clientIdInput) {
      lastConfigCid = nextCid;
      clientIdInput.value = nextCid;
    }

    const nextPort = String(auth.port || 43821);
    if (nextPort !== lastConfigPort && document.activeElement !== portInput) {
      lastConfigPort = nextPort;
      portInput.value = nextPort;
    }

    const userName = pickUserName(auth.user);
    const userEmail = auth.user?.email || '';
    const product = auth.user?.product || '';
    const isLocalhost = !isElectron && typeof location !== 'undefined' && location.hostname === 'localhost';
    const sig = [
      Boolean(auth.signedIn),
      Boolean(auth.signingIn),
      Boolean(auth.configured),
      isElectron,
      isLocalhost,
      auth.redirectUri || '',
      auth.error || '',
      userName,
      userEmail,
      product,
    ].join('|');

    if (sig === setupSig) return;
    setupSig = sig;

    const localhostHost = typeof location !== 'undefined'
      ? location.host.replace(/^localhost\b/i, '127.0.0.1')
      : '127.0.0.1';
    const localhostTipUrl = typeof location !== 'undefined'
      ? `${location.protocol}//${localhostHost}${location.pathname || '/'}`
      : 'http://127.0.0.1';

    const localhostTipHtml = isLocalhost
      ? `<div class="sp-banner sp-tip-banner">Tip: Open <code>${escapeHtml(localhostTipUrl)}</code> instead of <code>localhost</code> — Spotify requires <code>127.0.0.1</code> for HTTP redirect URIs.</div>`
      : '';

    const errHtml = auth.error
      ? `<div class="sp-banner is-err">${escapeHtml(auth.error)}</div>`
      : '';

    const redirectUri = auth.redirectUri || 'http://127.0.0.1:43821/spotify/callback';
    const redirectBoxHtml =
      '<div class="sp-redirect-box">' +
        '<div class="sp-section-head">' +
          '<span class="sp-label">Redirect URI (add in Spotify Dashboard)</span>' +
          '<button type="button" class="btn sp-mini-btn" id="spCopyRedirectBtn">📋 Copy Redirect URI</button>' +
        '</div>' +
        `<code class="sp-code" id="spRedirectCode">${escapeHtml(redirectUri)}</code>` +
      '</div>';

    const userCardHtml = auth.signedIn
      ? '<div class="sp-user-card">' +
          '<div class="sp-user-meta">' +
            `<div class="sp-user-name">${escapeHtml(userName || 'Spotify Account')}</div>` +
            `<div class="sp-muted">${escapeHtml([userEmail, product ? product.toUpperCase() : ''].filter(Boolean).join(' · ') || 'Connected via PKCE')}</div>` +
          '</div>' +
          '<button type="button" class="btn sp-stop-btn" id="spSetupSignOut">Disconnect Spotify</button>' +
        '</div>'
      : '<div class="sp-user-card">' +
          '<div class="sp-user-meta">' +
            '<div class="sp-user-name">Spotify Account PKCE</div>' +
            `<div class="sp-muted">${auth.configured ? 'Client ID ready — click Connect to sign in.' : 'Enter your Spotify App Client ID above and save.'}</div>` +
          '</div>' +
          `<button type="button" class="btn sp-mini-btn sp-green-btn" id="spSetupSignIn" ${auth.signingIn ? 'disabled' : ''}>${auth.signingIn ? 'Connecting…' : 'Connect Spotify'}</button>` +
        '</div>';

    const stepsHtml =
      '<ol class="sp-steps">' +
        '<li>Create an app at <code>developer.spotify.com/dashboard</code> (enable <b>Web API</b> &amp; <b>Web Playback SDK</b>).</li>' +
        '<li>Copy the Redirect URI above into <b>Settings → Redirect URIs</b> (use <code>127.0.0.1</code>, never <code>localhost</code>).</li>' +
        '<li>Paste your <b>Client ID</b> above, click <b>Save Config</b>, then click <b>Connect Spotify</b> (no Client Secret needed).</li>' +
      '</ol>';

    setupStatus.innerHTML = errHtml + localhostTipHtml + userCardHtml + redirectBoxHtml + stepsHtml;

    const copyBtn = setupStatus.querySelector('#spCopyRedirectBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        sfxClick();
        const ok = await copyText(redirectUri);
        if (ok) {
          copyBtn.textContent = '✓ Copied!';
          notifyToast('Redirect URI copied ✦');
          clearTimeout(copiedResetT);
          copiedResetT = setTimeout(() => {
            if (copyBtn.isConnected) copyBtn.textContent = '📋 Copy Redirect URI';
          }, 1800);
        } else {
          notifyToast('Select and copy the Redirect URI manually');
        }
      });
    }

    setupStatus.querySelector('#spSetupSignOut')?.addEventListener('click', () => {
      ensureAudio();
      callSpotify('signOut');
    });

    setupStatus.querySelector('#spSetupSignIn')?.addEventListener('click', async () => {
      sfxClick();
      const typedCid = clientIdInput.value.trim();
      if (!typedCid && !auth.configured) {
        clientIdInput.focus();
        notifyToast('Paste your Spotify Client ID first ✦');
        return;
      }
      if (typedCid && typedCid !== String(auth.clientId || '').trim() && typeof setupStatus._commitBeforeSignIn === 'function') {
        if (isElectron) {
          await setupStatus._commitBeforeSignIn();
        } else {
          // Save synchronously into localStorage config before opening OAuth popup in the same user gesture
          setupStatus._commitBeforeSignIn();
        }
      }
      callSpotify('signIn');
    });
  }

  // ---------- Settings Audio Row ----------
  function describeSettingsRow(st) {
    const mode = st?.mode || 'idle';
    const track = st?.playback?.track;
    if (mode === 'account' && track) {
      const artists = formatArtists(track.artists);
      return {
        hint: `${st.playback?.isPlaying ? 'Playing' : 'Paused'}: ${track.name}${artists ? ' — ' + artists : ''}`,
        btnLabel: '🎧 Open Spotify Deck',
      };
    }
    if (mode === 'embed' && st?.embed?.activeUri) {
      return {
        hint: `Quick Embed: ${st.embed.title || 'Active'}`,
        btnLabel: '🎧 Open Spotify Deck',
      };
    }
    if (st?.auth?.signedIn) {
      const name = pickUserName(st.auth.user) || 'Spotify Account';
      return {
        hint: `Connected as ${name} — open the deck to pick a playlist or device.`,
        btnLabel: '🎧 Open Spotify Deck',
      };
    }
    return {
      hint: 'Stream your Spotify playlists or paste any link in Quick Embed.',
      btnLabel: 'Connect Spotify',
    };
  }

  function refreshSettingsRowIfPresent(st) {
    const row = document.querySelector('#settingsBody .row[data-setting="spotifyDeck"]');
    if (!row) return;
    const desc = describeSettingsRow(st);
    const hEl = row.querySelector('.row-h');
    const bEl = row.querySelector('#btnSettingsSpotify');
    if (hEl && hEl.textContent !== desc.hint) hEl.textContent = desc.hint;
    if (bEl && bEl.textContent !== desc.btnLabel) bEl.textContent = desc.btnLabel;
  }

  function renderSettingsRow(container) {
    if (!container) return null;
    const existing = container.querySelector('.row[data-setting="spotifyDeck"]');
    if (existing) existing.remove();

    const st = lastState || getSafeState();
    const desc = describeSettingsRow(st);

    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.setting = 'spotifyDeck';
    row.innerHTML =
      '<div class="row-l">' +
        '<div class="row-t">Spotify Music Deck</div>' +
        `<div class="row-h">${escapeHtml(desc.hint)}</div>` +
      '</div>' +
      '<div class="row-c">' +
        `<button type="button" class="btn sp-settings-btn" id="btnSettingsSpotify">${escapeHtml(desc.btnLabel)}</button>` +
      '</div>';

    container.appendChild(row);
    row.querySelector('#btnSettingsSpotify')?.addEventListener('click', () => {
      sfxClick();
      if (typeof window.hideOverlay === 'function') window.hideOverlay('settingsModal');
      callSpotify('setDrawerOpen', true);
    });
    return row;
  }

  // ---------- Master Render & Subscription ----------
  function renderAll(st) {
    const state = st || getSafeState();
    lastState = state;
    renderTopbar(state);
    renderDrawerShell(state);
    renderNowPlaying(state);
    renderPlaylists(state);
    renderSearch(state);
    renderEmbedMeta(state);
    renderSetup(state);
    refreshSettingsRowIfPresent(state);
  }

  function init() {
    if (initialized) {
      renderAll(getSafeState());
      return;
    }
    initialized = true;

    const { bar, drawer } = ensureMountContainers();
    barEl = bar;
    drawerEl = drawer;

    buildBarSkeleton(barEl);
    buildDrawerSkeleton(drawerEl);
    syncDrawerTop();

    window.addEventListener('resize', () => {
      if (lastState?.drawerOpen) syncDrawerTop();
    });

    // Close drawer on outside click without blocking board clicks when closed
    document.addEventListener('pointerdown', (e) => {
      const st = lastState || getSafeState();
      if (!st || !st.drawerOpen) return;
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('#spotifyDrawer') || t.closest('#spotifyBar')) return;
      callSpotify('setDrawerOpen', false);
    });

    if (typeof window.Spotify?.subscribe === 'function') {
      unsubscribe = window.Spotify.subscribe((st) => renderAll(st));
    }
    renderAll(getSafeState());
  }

  return {
    init,
    renderSettingsRow,
  };
})();
