/* Slopitaire — Hybrid Spotify core engine (Web Playback SDK, Spotify Connect Remote & Quick Embed fallback). */
'use strict';

window.Spotify = (() => {
  const RECENT_KEY = 'slopitaire.spotifyRecent';
  const MAX_RECENT_LINKS = 8;
  const VALID_TABS = new Set(['now', 'playlists', 'search', 'embed', 'setup']);
  const POLL_FAST_MS = 3000;
  const POLL_IDLE_MS = 8000;
  const TICK_MS = 250;
  const EMBED_API_URL = 'https://open.spotify.com/embed/iframe-api/v1';
  const WEB_SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
  const EMBED_TIMEOUT_MS = 3500;

  const getPKCE = () => (typeof SpotifyPKCE !== 'undefined'
    ? SpotifyPKCE
    : (typeof window !== 'undefined' ? window.SpotifyPKCE : null));

  const getAPI = () => (typeof SpotifyAPI !== 'undefined'
    ? SpotifyAPI
    : (typeof window !== 'undefined' ? window.SpotifyAPI : null));

  const getSound = () => (typeof Sound !== 'undefined'
    ? Sound
    : (typeof window !== 'undefined' ? window.Sound : null));

  const getPopupFX = () => (typeof PopupFX !== 'undefined'
    ? PopupFX
    : (typeof window !== 'undefined' ? window.PopupFX : null));

  const getCompanion = () => (typeof Companion !== 'undefined'
    ? Companion
    : (typeof window !== 'undefined' ? window.Companion : null));

  const getSettings = () => (typeof settings !== 'undefined'
    ? settings
    : (typeof window !== 'undefined' ? window.settings : null));

  const showToast = (msg, ms) => {
    const fn = typeof toast === 'function'
      ? toast
      : (typeof window !== 'undefined' && typeof window.toast === 'function' ? window.toast : null);
    if (fn && msg) fn(msg, ms);
  };

  const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  const initialPresets = () => (getPKCE()?.PRESETS || []).map((p) => ({ ...p }));

  const state = {
    mode: 'idle', // 'account' | 'embed' | 'idle'
    drawerOpen: false,
    activeTab: 'now',
    auth: {
      signedIn: false,
      signingIn: false,
      user: null,
      clientId: '',
      port: 43821,
      configured: false,
      redirectUri: '',
      isElectron: false,
      error: '',
    },
    playback: {
      active: false,
      isPlaying: false,
      track: null,
      positionMs: 0,
      shuffle: false,
      repeat: 'off',
      volume: 70,
      device: null,
      sdkReady: false,
      sdkSupported: false,
      error: '',
      errorCode: '',
    },
    devices: [],
    library: {
      playlists: [],
      likedTracks: [],
      likedTotal: 0,
      recentTracks: [],
      loading: false,
      error: '',
    },
    search: {
      query: '',
      tracks: [],
      playlists: [],
      albums: [],
      loading: false,
      error: '',
    },
    embed: {
      activeUri: '',
      title: '',
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      presets: initialPresets(),
      recentLinks: [],
    },
  };

  const listeners = new Set();
  let bootPromise = null;
  let listenersBound = false;
  let serverConfigLoaded = false;

  // Polling & smooth position advancement
  let pollTimer = null;
  let pollInFlight = null;
  let tickTimer = null;
  let lastTickAt = 0;
  let lastExternalMusic = null;

  // Library & search bookkeeping
  let libraryLoaded = false;
  let lastLibraryAt = 0;
  let searchSeq = 0;
  let volumeDebounceTimer = null;

  // Web Playback SDK
  let webSdkPlayer = null;
  let webSdkPlayerCtor = (typeof window !== 'undefined' && window.Spotify && typeof window.Spotify.Player === 'function')
    ? window.Spotify.Player
    : null;
  let webSdkDeviceId = '';
  let webSdkLoadPromise = null;
  let widevineChecked = false;
  let widevineSupported = false;

  // Embed iFrame API
  let embedHost = null;
  let embedApi = null;
  let embedApiPromise = null;
  let embedController = null;
  let embedControllerReady = false;
  let embedLoadSeq = 0;
  let embedFallbackTimer = null;

  function cloneState() {
    return {
      mode: state.mode,
      drawerOpen: state.drawerOpen,
      activeTab: state.activeTab,
      auth: { ...state.auth, user: state.auth.user ? { ...state.auth.user } : null },
      playback: {
        ...state.playback,
        track: state.playback.track ? { ...state.playback.track } : null,
        device: state.playback.device ? { ...state.playback.device } : null,
      },
      devices: state.devices.map((d) => ({ ...d })),
      library: {
        playlists: state.library.playlists.map((p) => ({ ...p })),
        likedTracks: state.library.likedTracks.map((t) => ({ ...t })),
        likedTotal: state.library.likedTotal,
        recentTracks: state.library.recentTracks.map((t) => ({ ...t })),
        loading: state.library.loading,
        error: state.library.error,
      },
      search: {
        query: state.search.query,
        tracks: state.search.tracks.map((t) => ({ ...t })),
        playlists: state.search.playlists.map((p) => ({ ...p })),
        albums: state.search.albums.map((a) => ({ ...a })),
        loading: state.search.loading,
        error: state.search.error,
      },
      embed: {
        ...state.embed,
        presets: state.embed.presets.map((p) => ({ ...p })),
        recentLinks: state.embed.recentLinks.map((r) => ({ ...r })),
      },
    };
  }

  function getState() {
    return cloneState();
  }

  function notify() {
    if (listeners.size === 0) return;
    const snap = cloneState();
    listeners.forEach((fn) => {
      try { fn(snap); } catch (e) { /* keep subscriber errors isolated */ }
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function isOverallPlaying() {
    if (state.mode === 'account') return Boolean(state.playback.isPlaying);
    if (state.mode === 'embed') return Boolean(state.embed.isPlaying);
    return false;
  }

  function syncAudioPolicy() {
    const cfg = getSettings();
    const autoMute = cfg ? cfg.spotifyAutoMuteBgm !== false : true;
    const wantExternal = isOverallPlaying() && autoMute;
    if (wantExternal === lastExternalMusic) return;
    lastExternalMusic = wantExternal;
    const snd = getSound();
    if (snd && typeof snd.setExternalMusicActive === 'function') {
      snd.setExternalMusicActive(wantExternal);
    }
  }

  function forceSyncAudioPolicy() {
    lastExternalMusic = null;
    syncAudioPolicy();
  }

  function announceNowPlaying(label) {
    const pfx = getPopupFX();
    if (pfx && typeof pfx.pill === 'function') {
      pfx.pill('🎧', 'SPOTIFY // NOW PLAYING', label || 'Streaming deck active', 'emerald', { always: true });
    }
    const comp = getCompanion();
    if (comp && typeof comp.react === 'function') {
      comp.react('musicChange');
    }
  }

  function playClickSfx() {
    const snd = getSound();
    snd?.sfx?.click?.();
  }

  function setErrorBanner(msg, code = '') {
    state.playback.error = msg || '';
    state.playback.errorCode = code || '';
    state.auth.error = msg || '';
  }

  function clearErrors() {
    state.playback.error = '';
    state.playback.errorCode = '';
    state.auth.error = '';
  }

  function readRecentLinks() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((x) => x && typeof x === 'object' && typeof x.uri === 'string' && x.uri)
        .slice(0, MAX_RECENT_LINKS);
    } catch (e) {
      return [];
    }
  }

  function saveRecentLinks(list) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT_LINKS)));
    } catch (e) { /* storage unavailable */ }
  }

  function recordRecentLink(parsed, title) {
    const item = {
      uri: parsed.uri,
      type: parsed.type,
      id: parsed.id,
      title: title || parsed.type,
      label: title || parsed.type,
      embedUrl: parsed.embedUrl,
      openUrl: parsed.openUrl,
      ts: Date.now(),
    };
    const next = [item, ...state.embed.recentLinks.filter((r) => r.uri !== parsed.uri)].slice(0, MAX_RECENT_LINKS);
    state.embed.recentLinks = next;
    saveRecentLinks(next);
  }

  function normalizeTrack(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const uri = String(raw.uri || (id ? `spotify:track:${id}` : '')).trim();
    if (!uri && !raw.name) return null;
    const artists = Array.isArray(raw.artists)
      ? raw.artists.map((a) => a?.name).filter(Boolean).join(', ')
      : String(raw.artists || '');
    const images = raw.album?.images || raw.images || [];
    const artUrl = images[1]?.url || images[0]?.url || images[2]?.url || raw.artUrl || '';
    return {
      id,
      uri,
      name: String(raw.name || 'Unknown Track'),
      artists,
      album: String(raw.album?.name || (typeof raw.album === 'string' ? raw.album : '') || ''),
      artUrl: String(artUrl),
      durationMs: Number(raw.duration_ms ?? raw.durationMs) || 0,
      externalUrl: String(raw.external_urls?.spotify || raw.externalUrl || (id ? `https://open.spotify.com/track/${id}` : '')),
    };
  }

  function normalizePlaylist(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const uri = String(raw.uri || (id ? `spotify:playlist:${id}` : '')).trim();
    if (!uri) return null;
    const images = raw.images || [];
    return {
      id,
      uri,
      name: String(raw.name || 'Playlist'),
      owner: String(raw.owner?.display_name || raw.owner?.id || (typeof raw.owner === 'string' ? raw.owner : '') || ''),
      trackCount: Number(raw.tracks?.total ?? raw.items?.total ?? raw.trackCount) || 0,
      artUrl: String(images[0]?.url || raw.artUrl || ''),
      externalUrl: String(raw.external_urls?.spotify || raw.externalUrl || (id ? `https://open.spotify.com/playlist/${id}` : '')),
    };
  }

  function normalizeAlbum(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const uri = String(raw.uri || (id ? `spotify:album:${id}` : '')).trim();
    if (!uri) return null;
    const artists = Array.isArray(raw.artists)
      ? raw.artists.map((a) => a?.name).filter(Boolean).join(', ')
      : String(raw.artists || '');
    const images = raw.images || [];
    return {
      id,
      uri,
      name: String(raw.name || 'Album'),
      artists,
      trackCount: Number(raw.total_tracks ?? raw.trackCount) || 0,
      artUrl: String(images[1]?.url || images[0]?.url || raw.artUrl || ''),
      externalUrl: String(raw.external_urls?.spotify || raw.externalUrl || (id ? `https://open.spotify.com/album/${id}` : '')),
    };
  }

  function normalizeDevice(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    if (!id) return null;
    return {
      id,
      name: String(raw.name || 'Spotify Device'),
      type: String(raw.type || 'Computer'),
      isActive: Boolean(raw.is_active ?? raw.isActive),
      isRestricted: Boolean(raw.is_restricted ?? raw.isRestricted),
      volumePercent: raw.volume_percent != null ? Number(raw.volume_percent) : (raw.volumePercent ?? state.playback.volume),
      isWebSdk: Boolean(raw.isWebSdk || (webSdkDeviceId && id === webSdkDeviceId)),
    };
  }

  function applyPkceState(pkceState) {
    if (!pkceState) return;
    state.auth.isElectron = Boolean(pkceState.isElectron);
    state.auth.clientId = String(pkceState.clientId || '');
    state.auth.port = Number(pkceState.port) || 43821;
    state.auth.configured = Boolean(pkceState.configured);
    state.auth.redirectUri = String(pkceState.redirectUri || '');
    state.auth.signedIn = Boolean(pkceState.signedIn);
    if (pkceState.user) state.auth.user = pkceState.user;
    else if (!pkceState.signedIn) state.auth.user = null;
  }

  function syncTickTimer() {
    const shouldRun = (state.mode === 'account' && state.playback.isPlaying)
      || (state.mode === 'embed' && state.embed.isPlaying);
    const hidden = typeof document !== 'undefined' && document.hidden;

    if (!shouldRun || hidden) {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
      return;
    }

    if (tickTimer) return;
    lastTickAt = Date.now();
    tickTimer = setInterval(() => {
      const now = Date.now();
      const dt = Math.max(0, Math.min(2000, now - lastTickAt));
      lastTickAt = now;

      let changed = false;
      if (state.mode === 'account' && state.playback.isPlaying) {
        const dur = state.playback.track?.durationMs || 0;
        const nextPos = dur > 0
          ? Math.min(dur, state.playback.positionMs + dt)
          : state.playback.positionMs + dt;
        if (nextPos !== state.playback.positionMs) {
          state.playback.positionMs = nextPos;
          changed = true;
        }
      } else if (state.mode === 'embed' && state.embed.isPlaying) {
        const dur = state.embed.durationMs || 0;
        const nextPos = dur > 0
          ? Math.min(dur, state.embed.positionMs + dt)
          : state.embed.positionMs + dt;
        if (nextPos !== state.embed.positionMs) {
          state.embed.positionMs = nextPos;
          changed = true;
        }
      }

      if (changed) notify();
    }, TICK_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function schedulePolling() {
    stopPolling();
    if (!state.auth.signedIn) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const delay = (state.playback.isPlaying || state.drawerOpen) ? POLL_FAST_MS : POLL_IDLE_MS;
    pollTimer = setTimeout(async () => {
      pollTimer = null;
      await pollPlayback();
      schedulePolling();
    }, delay);
  }

  async function pollPlayback() {
    if (!state.auth.signedIn) return null;
    if (pollInFlight) return pollInFlight;

    pollInFlight = (async () => {
      try {
        const api = getAPI();
        if (!api) return null;
        const data = await api.getPlaybackState();

        if (!data) {
          if (state.mode === 'account' && (!state.playback.device?.isWebSdk || !state.playback.isPlaying)) {
            state.playback.isPlaying = false;
            if (!state.playback.track) state.playback.active = false;
            if (!state.playback.active && !state.embed.activeUri) state.mode = 'idle';
          }
          syncTickTimer();
          syncAudioPolicy();
          notify();
          return null;
        }

        const track = normalizeTrack(data.item);
        const device = normalizeDevice(data.device);
        const isPlaying = Boolean(data.is_playing);

        state.playback.track = track;
        state.playback.isPlaying = isPlaying;
        state.playback.positionMs = Number(data.progress_ms) || 0;
        state.playback.shuffle = Boolean(data.shuffle_state);
        state.playback.repeat = data.repeat_state === 'track' || data.repeat_state === 'context' ? data.repeat_state : 'off';
        if (device) {
          state.playback.device = device;
          if (typeof device.volumePercent === 'number' && Number.isFinite(device.volumePercent)) {
            state.playback.volume = clampNum(Math.round(device.volumePercent), 0, 100);
          }
        }
        state.playback.active = Boolean(track || isPlaying);

        if (isPlaying) {
          if (state.mode === 'embed' && state.embed.isPlaying) {
            pauseEmbedSilently();
          }
          state.mode = 'account';
        } else if (state.mode !== 'embed') {
          state.mode = track ? 'account' : (state.embed.activeUri ? 'embed' : 'idle');
        }

        syncTickTimer();
        syncAudioPolicy();
        notify();
        return data;
      } catch (err) {
        if (err && err.code === 'AUTH_EXPIRED') {
          await handleExpiredSession();
        }
        return null;
      } finally {
        pollInFlight = null;
      }
    })();

    return pollInFlight;
  }

  async function handleExpiredSession() {
    stopPolling();
    disconnectWebSdk();
    await getPKCE()?.clearAuth?.();
    state.auth.signedIn = false;
    state.auth.user = null;
    state.playback.active = false;
    state.playback.isPlaying = false;
    state.playback.track = null;
    state.playback.device = null;
    state.devices = [];
    if (state.mode === 'account') {
      state.mode = state.embed.activeUri ? 'embed' : 'idle';
    }
    syncTickTimer();
    syncAudioPolicy();
    notify();
  }

  // ---------- Web Playback SDK (Web browser w/ Widevine + Premium only) ----------

  async function checkWidevineSupport() {
    if (widevineChecked) return widevineSupported;
    widevineChecked = true;
    if (getPKCE()?.isElectron?.()) {
      widevineSupported = false;
      state.playback.sdkSupported = false;
      return false;
    }
    if (typeof navigator === 'undefined' || typeof navigator.requestMediaKeySystemAccess !== 'function') {
      widevineSupported = false;
      state.playback.sdkSupported = false;
      return false;
    }
    try {
      await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
        {
          initDataTypes: ['cenc'],
          audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }],
        },
      ]);
      widevineSupported = true;
    } catch (e) {
      widevineSupported = false;
    }
    state.playback.sdkSupported = widevineSupported;
    return widevineSupported;
  }

  function rescueGlobalSpotifyObject() {
    if (typeof window === 'undefined') return;
    if (window.Spotify && window.Spotify !== publicApi) {
      const sdkObj = window.Spotify;
      if (typeof sdkObj.Player === 'function') {
        webSdkPlayerCtor = sdkObj.Player;
      }
      for (const k of Object.keys(sdkObj)) {
        if (!(k in publicApi)) publicApi[k] = sdkObj[k];
      }
      window.Spotify = publicApi;
    } else if (webSdkPlayerCtor && !publicApi.Player) {
      publicApi.Player = webSdkPlayerCtor;
    }
  }

  function loadWebPlaybackScript() {
    if (webSdkLoadPromise) return webSdkLoadPromise;
    if (typeof document === 'undefined') return Promise.resolve(false);
    if (webSdkPlayerCtor) return Promise.resolve(true);

    webSdkLoadPromise = new Promise((resolve) => {
      const prevReady = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        rescueGlobalSpotifyObject();
        if (typeof prevReady === 'function') {
          try { prevReady(); } catch (e) {}
        }
        resolve(Boolean(webSdkPlayerCtor));
      };

      const existing = document.querySelector(`script[src="${WEB_SDK_URL}"]`);
      if (existing) {
        rescueGlobalSpotifyObject();
        if (webSdkPlayerCtor) resolve(true);
        return;
      }

      const script = document.createElement('script');
      script.src = WEB_SDK_URL;
      script.async = true;
      script.onload = () => {
        rescueGlobalSpotifyObject();
        Promise.resolve().then(rescueGlobalSpotifyObject);
      };
      script.onerror = () => {
        state.playback.sdkSupported = false;
        notify();
        resolve(false);
      };
      (document.head || document.documentElement).appendChild(script);
    });

    return webSdkLoadPromise;
  }

  function disconnectWebSdk() {
    if (webSdkPlayer) {
      try { webSdkPlayer.disconnect(); } catch (e) {}
      webSdkPlayer = null;
    }
    webSdkDeviceId = '';
    state.playback.sdkReady = false;
  }

  async function initWebPlaybackSdk() {
    if (getPKCE()?.isElectron?.() || !state.auth.signedIn) {
      state.playback.sdkSupported = false;
      return false;
    }
    if (state.auth.user?.product === 'free') {
      state.playback.sdkSupported = false;
      notify();
      return false;
    }

    const supported = await checkWidevineSupport();
    if (!supported) {
      notify();
      return false;
    }

    const loaded = await loadWebPlaybackScript();
    rescueGlobalSpotifyObject();
    if (!loaded || !webSdkPlayerCtor || !state.auth.signedIn) return false;
    if (webSdkPlayer) return true;

    try {
      const player = new webSdkPlayerCtor({
        name: 'Slopitaire // PRISM',
        getOAuthToken: (cb) => {
          const pkce = getPKCE();
          if (!pkce) { cb(''); return; }
          pkce.getAccessToken(false)
            .then((tok) => cb(tok || ''))
            .catch(() => cb(''));
        },
        volume: clampNum((state.playback.volume ?? 70) / 100, 0, 1),
      });

      player.addListener('ready', ({ device_id }) => {
        webSdkDeviceId = String(device_id || '');
        state.playback.sdkReady = Boolean(webSdkDeviceId);
        refreshDevices().catch(() => {});
        notify();
      });

      player.addListener('not_ready', ({ device_id }) => {
        if (!device_id || device_id === webSdkDeviceId) {
          state.playback.sdkReady = false;
          notify();
        }
      });

      player.addListener('initialization_error', () => {
        state.playback.sdkSupported = false;
        state.playback.sdkReady = false;
        notify();
      });

      player.addListener('account_error', () => {
        state.playback.sdkSupported = false;
        state.playback.sdkReady = false;
        notify();
      });

      player.addListener('authentication_error', () => {
        getPKCE()?.getAccessToken?.(true).catch(() => {});
      });

      player.addListener('playback_error', (ev) => {
        if (ev?.message) {
          setErrorBanner(ev.message, 'PLAYBACK_ERROR');
          notify();
        }
      });

      player.addListener('player_state_changed', (sdkState) => {
        if (!sdkState) {
          pollPlayback().catch(() => {});
          return;
        }
        const cur = sdkState.track_window?.current_track;
        const images = cur?.album?.images || [];
        const track = cur ? {
          id: String(cur.id || ''),
          uri: String(cur.uri || ''),
          name: String(cur.name || 'Unknown Track'),
          artists: Array.isArray(cur.artists) ? cur.artists.map((a) => a?.name).filter(Boolean).join(', ') : '',
          album: String(cur.album?.name || ''),
          artUrl: String(images[1]?.url || images[0]?.url || ''),
          durationMs: Number(sdkState.duration || cur.duration_ms) || 0,
          externalUrl: cur.id ? `https://open.spotify.com/track/${cur.id}` : '',
        } : state.playback.track;

        const isPlaying = !sdkState.paused;
        state.playback.track = track;
        state.playback.isPlaying = isPlaying;
        state.playback.positionMs = Number(sdkState.position) || 0;
        state.playback.shuffle = Boolean(sdkState.shuffle);
        state.playback.repeat = sdkState.repeat_mode === 2 ? 'track' : sdkState.repeat_mode === 1 ? 'context' : 'off';
        state.playback.active = Boolean(track || isPlaying);
        if (webSdkDeviceId) {
          state.playback.device = {
            id: webSdkDeviceId,
            name: 'Slopitaire // PRISM',
            type: 'Computer',
            isWebSdk: true,
          };
        }
        if (isPlaying) {
          if (state.mode === 'embed' && state.embed.isPlaying) {
            pauseEmbedSilently();
          }
          state.mode = 'account';
          clearErrors();
        } else if (state.mode !== 'embed') {
          state.mode = track ? 'account' : (state.embed.activeUri ? 'embed' : 'idle');
        }
        syncTickTimer();
        syncAudioPolicy();
        notify();
      });

      webSdkPlayer = player;
      const connected = await player.connect();
      if (!connected) {
        state.playback.sdkReady = false;
      }
      return Boolean(connected);
    } catch (e) {
      state.playback.sdkSupported = false;
      state.playback.sdkReady = false;
      notify();
      return false;
    }
  }

  // ---------- Public Account / Playback Actions ----------

  async function maybeFetchServerConfig() {
    if (serverConfigLoaded || typeof window === 'undefined') return;
    const isHttp = typeof location !== 'undefined' && (location.protocol === 'http:' || location.protocol === 'https:');
    const acct = window.Account?.getStatus?.();
    if (isHttp) {
      serverConfigLoaded = true;
      await getPKCE()?.loadServerConfig?.('');
      return;
    }
    if (acct && acct.online && acct.configured !== null && acct.serverUrl) {
      serverConfigLoaded = true;
      await getPKCE()?.loadServerConfig?.(acct.serverUrl);
    }
  }

  function bindGlobalListeners() {
    if (listenersBound || typeof document === 'undefined') return;
    listenersBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopPolling();
        syncTickTimer();
      } else {
        if (state.auth.signedIn) {
          pollPlayback().catch(() => {});
          schedulePolling();
        }
        syncTickTimer();
      }
    });
  }

  async function boot() {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      bindGlobalListeners();
      state.embed.presets = initialPresets();
      state.embed.recentLinks = readRecentLinks();

      const pkce = getPKCE();
      if (!pkce) return getState();

      await maybeFetchServerConfig();

      if (!pkce.isElectron()) {
        try {
          const redirectRes = await pkce.handleStartupRedirect();
          if (redirectRes && redirectRes.ok === false && redirectRes.error) {
            state.auth.error = String(redirectRes.error);
          }
        } catch (e) {
          state.auth.error = e?.message || '';
        }
      }

      const pkceState = await pkce.getState();
      applyPkceState(pkceState);
      notify();

      if (state.auth.signedIn) {
        try {
          const api = getAPI();
          const me = await api?.getMe?.();
          if (me) {
            state.auth.user = pkce.setUser(me);
          }
          await Promise.allSettled([
            refreshDevices(),
            pollPlayback(),
            loadLibrary(false),
          ]);
          schedulePolling();
          if (!pkce.isElectron()) {
            initWebPlaybackSdk().catch(() => {});
          }
        } catch (err) {
          if (err && err.code === 'AUTH_EXPIRED') {
            await handleExpiredSession();
          }
        }
      }

      syncAudioPolicy();
      notify();
      return getState();
    })();
    return bootPromise;
  }

  async function setConfig({ clientId, port } = {}) {
    const pkce = getPKCE();
    if (!pkce) return null;
    clearErrors();
    if (!pkce.isElectron() && clientId !== undefined) {
      const cleaned = String(clientId || '').trim();
      if (cleaned) {
        state.auth.clientId = cleaned;
        state.auth.configured = true;
      }
      if (port !== undefined) {
        const n = Number(port);
        if (Number.isInteger(n) && n >= 1024 && n <= 65535) state.auth.port = n;
      }
    }
    const res = await pkce.setConfig({ clientId, port });
    const pkceState = await pkce.getState();
    applyPkceState(pkceState);
    notify();
    return res;
  }

  async function signIn() {
    const pkce = getPKCE();
    if (!pkce || state.auth.signingIn) return null;
    clearErrors();
    state.auth.signingIn = true;
    notify();

    try {
      const res = await pkce.signIn(
        pkce.isElectron()
          ? { clientId: state.auth.clientId, port: state.auth.port }
          : {}
      );
      if (res && res.redirected) return res;

      const pkceState = await pkce.getState();
      applyPkceState(pkceState);
      state.auth.signingIn = false;
      clearErrors();

      try {
        const me = await getAPI()?.getMe?.();
        if (me) state.auth.user = pkce.setUser(me);
      } catch (e) { /* keep non-fatal profile from token exchange */ }

      notify();
      await Promise.allSettled([
        refreshDevices(),
        pollPlayback(),
        loadLibrary(true),
      ]);
      schedulePolling();

      if (!pkce.isElectron()) {
        initWebPlaybackSdk().catch(() => {});
      }

      const name = state.auth.user?.displayName || 'Spotify';
      showToast(`Connected to Spotify (${name}) 🎧`);
      return getState();
    } catch (err) {
      state.auth.signingIn = false;
      state.auth.error = err?.message || 'Spotify sign-in failed.';
      notify();
      showToast(state.auth.error, 3400);
      return null;
    }
  }

  async function signOut() {
    playClickSfx();
    stopPolling();
    disconnectWebSdk();
    await getPKCE()?.clearAuth?.();

    const pkceState = await getPKCE()?.getState?.();
    if (pkceState) applyPkceState(pkceState);
    state.auth.signedIn = false;
    state.auth.signingIn = false;
    state.auth.user = null;
    clearErrors();

    state.playback.active = false;
    state.playback.isPlaying = false;
    state.playback.track = null;
    state.playback.positionMs = 0;
    state.playback.device = null;
    state.devices = [];
    state.library = { playlists: [], likedTracks: [], likedTotal: 0, recentTracks: [], loading: false, error: '' };
    state.search = { query: '', tracks: [], playlists: [], albums: [], loading: false, error: '' };
    libraryLoaded = false;
    lastLibraryAt = 0;

    state.mode = state.embed.activeUri ? 'embed' : 'idle';
    syncTickTimer();
    syncAudioPolicy();
    notify();
    showToast('Disconnected Spotify account');
  }

  function resolveTargetDeviceId() {
    if (state.playback.device?.id) return state.playback.device.id;
    const active = state.devices.find((d) => d.isActive);
    if (active?.id) return active.id;
    if (state.playback.sdkReady && webSdkDeviceId) {
      try { webSdkPlayer?.activateElement?.(); } catch (e) {}
      return webSdkDeviceId;
    }
    return undefined;
  }

  function handlePlaybackError(err) {
    const msg = err?.message || 'Spotify playback command failed.';
    const code = err?.code || '';
    if (code === 'AUTH_EXPIRED') {
      handleExpiredSession().catch(() => {});
    } else {
      setErrorBanner(msg, code);
      showToast(msg, 3800);
      notify();
    }
  }

  function pauseAccountPlaybackSilently() {
    if (!state.auth.signedIn || !state.playback.isPlaying) return;
    if (state.playback.device?.isWebSdk && webSdkPlayer && typeof webSdkPlayer.pause === 'function') {
      Promise.resolve(webSdkPlayer.pause()).catch(() => {});
    } else {
      getAPI()?.pause?.(state.playback.device?.id).catch(() => {});
    }
    state.playback.isPlaying = false;
    syncTickTimer();
    syncAudioPolicy();
  }

  async function togglePlay() {
    playClickSfx();

    if (state.mode === 'embed' && state.embed.activeUri) {
      if (embedController && typeof embedController.togglePlay === 'function') {
        try {
          if (!state.embed.isPlaying && state.playback.isPlaying) {
            pauseAccountPlaybackSilently();
          }
          embedController.togglePlay();
          state.embed.isPlaying = !state.embed.isPlaying;
          syncTickTimer();
          syncAudioPolicy();
          notify();
        } catch (e) {}
      } else {
        setDrawerOpen(true, 'embed');
        showToast('Use the Spotify embed player controls inside the drawer.');
      }
      return;
    }

    if (!state.auth.signedIn) {
      setDrawerOpen(true, 'embed');
      showToast('Connect Spotify or pick a Quick Embed preset 🎧');
      return;
    }

    clearErrors();
    try {
      if (state.playback.device?.isWebSdk && webSdkPlayer && typeof webSdkPlayer.togglePlay === 'function') {
        try { webSdkPlayer.activateElement?.(); } catch (e) {}
        if (!state.playback.isPlaying && state.embed.isPlaying) pauseEmbedSilently();
        await webSdkPlayer.togglePlay();
        state.playback.isPlaying = !state.playback.isPlaying;
        state.mode = 'account';
        syncTickTimer();
        syncAudioPolicy();
        notify();
        return;
      }

      const deviceId = resolveTargetDeviceId();
      const api = getAPI();
      if (!api) return;
      if (state.playback.isPlaying) {
        await api.pause(deviceId);
        state.playback.isPlaying = false;
      } else {
        if (state.embed.isPlaying) pauseEmbedSilently();
        await api.play({ deviceId });
        state.playback.isPlaying = true;
        state.playback.active = true;
        state.mode = 'account';
        announceNowPlaying(state.playback.track?.name || 'Playback resumed');
      }
      syncTickTimer();
      syncAudioPolicy();
      notify();
      setTimeout(() => { pollPlayback().catch(() => {}); }, 400);
    } catch (err) {
      handlePlaybackError(err);
    }
  }

  async function next() {
    playClickSfx();
    if (!state.auth.signedIn) return;
    clearErrors();
    try {
      if (state.playback.device?.isWebSdk && webSdkPlayer && typeof webSdkPlayer.nextTrack === 'function') {
        try { webSdkPlayer.activateElement?.(); } catch (e) {}
        await webSdkPlayer.nextTrack();
      } else {
        await getAPI()?.next?.(resolveTargetDeviceId());
      }
      setTimeout(() => { pollPlayback().catch(() => {}); }, 380);
    } catch (err) {
      handlePlaybackError(err);
    }
  }

  async function previous() {
    playClickSfx();
    if (!state.auth.signedIn) return;
    clearErrors();
    try {
      if (state.playback.device?.isWebSdk && webSdkPlayer && typeof webSdkPlayer.previousTrack === 'function') {
        try { webSdkPlayer.activateElement?.(); } catch (e) {}
        await webSdkPlayer.previousTrack();
      } else {
        await getAPI()?.previous?.(resolveTargetDeviceId());
      }
      setTimeout(() => { pollPlayback().catch(() => {}); }, 380);
    } catch (err) {
      handlePlaybackError(err);
    }
  }

  async function seek(positionMs) {
    const ms = Math.max(0, Math.round(Number(positionMs) || 0));
    if (state.mode === 'embed' && state.embed.activeUri) {
      state.embed.positionMs = ms;
      if (embedController && typeof embedController.seek === 'function') {
        try { embedController.seek(Math.floor(ms / 1000)); } catch (e) {}
      }
      notify();
      return;
    }
    if (!state.auth.signedIn) return;
    clearErrors();
    state.playback.positionMs = ms;
    notify();
    try {
      if (state.playback.device?.isWebSdk && webSdkPlayer && typeof webSdkPlayer.seek === 'function') {
        await webSdkPlayer.seek(ms);
      } else {
        await getAPI()?.seek?.(ms, resolveTargetDeviceId());
      }
    } catch (err) {
      handlePlaybackError(err);
    }
  }

  function setVolume(percent) {
    const pct = clampNum(Math.round(Number(percent) || 0), 0, 100);
    state.playback.volume = pct;
    notify();

    if (state.playback.device?.isWebSdk && webSdkPlayer && typeof webSdkPlayer.setVolume === 'function') {
      Promise.resolve(webSdkPlayer.setVolume(pct / 100)).catch(() => {});
    }

    if (!state.auth.signedIn) return;
    clearTimeout(volumeDebounceTimer);
    volumeDebounceTimer = setTimeout(async () => {
      volumeDebounceTimer = null;
      if (!state.auth.signedIn) return;
      if (state.playback.device?.isWebSdk && webSdkPlayer) return;
      try {
        await getAPI()?.setVolume?.(pct, resolveTargetDeviceId());
      } catch (err) {
        if (err?.code && err.code !== 'NO_ACTIVE_DEVICE') {
          handlePlaybackError(err);
        }
      }
    }, 160);
  }

  async function toggleShuffle() {
    playClickSfx();
    if (!state.auth.signedIn) return;
    clearErrors();
    const prev = state.playback.shuffle;
    const nextVal = !prev;
    state.playback.shuffle = nextVal;
    notify();
    try {
      await getAPI()?.setShuffle?.(nextVal, resolveTargetDeviceId());
    } catch (err) {
      state.playback.shuffle = prev;
      handlePlaybackError(err);
    }
  }

  async function cycleRepeat() {
    playClickSfx();
    if (!state.auth.signedIn) return;
    clearErrors();
    const prev = state.playback.repeat;
    const nextVal = prev === 'off' ? 'context' : prev === 'context' ? 'track' : 'off';
    state.playback.repeat = nextVal;
    notify();
    try {
      await getAPI()?.setRepeat?.(nextVal, resolveTargetDeviceId());
    } catch (err) {
      state.playback.repeat = prev;
      handlePlaybackError(err);
    }
  }

  function findLabelForUri(uri) {
    if (!uri) return '';
    const pl = state.library.playlists.find((p) => p.uri === uri)
      || state.search.playlists.find((p) => p.uri === uri);
    if (pl?.name) return pl.name;
    const al = state.search.albums.find((a) => a.uri === uri);
    if (al?.name) return al.name;
    const tr = state.library.likedTracks.find((t) => t.uri === uri)
      || state.library.recentTracks.find((t) => t.uri === uri)
      || state.search.tracks.find((t) => t.uri === uri);
    if (tr?.name) return tr.name;
    const preset = state.embed.presets.find((p) => p.uri === uri);
    return preset?.label || '';
  }

  async function playContext(uri, offsetUri) {
    playClickSfx();
    if (!uri) return;
    if (!state.auth.signedIn) {
      showToast('Connect Spotify Account to play directly, or use Quick Embed.');
      return;
    }
    clearErrors();
    pauseEmbedSilently();
    const deviceId = resolveTargetDeviceId();
    try {
      await getAPI()?.play?.({ deviceId, contextUri: uri, offsetUri });
      state.mode = 'account';
      state.playback.active = true;
      state.playback.isPlaying = true;
      announceNowPlaying(findLabelForUri(offsetUri || uri) || 'Playlist started');
      syncTickTimer();
      syncAudioPolicy();
      notify();
      setTimeout(() => { pollPlayback().catch(() => {}); }, 450);
      setTimeout(() => { pollPlayback().catch(() => {}); }, 1300);
    } catch (err) {
      handlePlaybackError(err);
    }
  }

  async function playTracks(uris, startIndex = 0) {
    playClickSfx();
    const list = Array.isArray(uris) ? uris.filter(Boolean) : (typeof uris === 'string' && uris ? [uris] : []);
    if (list.length === 0) return;
    if (!state.auth.signedIn) {
      showToast('Connect Spotify Account to play tracks, or use Quick Embed.');
      return;
    }
    clearErrors();
    pauseEmbedSilently();
    const idx = clampNum(Math.floor(Number(startIndex) || 0), 0, list.length - 1);
    const offsetUri = list[idx];
    const deviceId = resolveTargetDeviceId();
    try {
      await getAPI()?.play?.({ deviceId, uris: list, offsetUri });
      state.mode = 'account';
      state.playback.active = true;
      state.playback.isPlaying = true;
      announceNowPlaying(findLabelForUri(offsetUri) || 'Track started');
      syncTickTimer();
      syncAudioPolicy();
      notify();
      setTimeout(() => { pollPlayback().catch(() => {}); }, 450);
      setTimeout(() => { pollPlayback().catch(() => {}); }, 1300);
    } catch (err) {
      handlePlaybackError(err);
    }
  }

  async function refreshDevices() {
    if (!state.auth.signedIn) return [];
    try {
      const res = await getAPI()?.getDevices?.();
      const rawList = Array.isArray(res) ? res : (Array.isArray(res?.devices) ? res.devices : []);
      const list = rawList.map(normalizeDevice).filter(Boolean);
      if (state.playback.sdkReady && webSdkDeviceId && !list.some((d) => d.id === webSdkDeviceId)) {
        list.unshift({
          id: webSdkDeviceId,
          name: 'Slopitaire // PRISM',
          type: 'Computer',
          isActive: state.playback.device?.id === webSdkDeviceId,
          isRestricted: false,
          volumePercent: state.playback.volume,
          isWebSdk: true,
        });
      }
      state.devices = list;
      const active = state.devices.find((d) => d.isActive);
      if (active) state.playback.device = active;
      notify();
      return state.devices.map((d) => ({ ...d }));
    } catch (err) {
      if (err?.code === 'AUTH_EXPIRED') await handleExpiredSession();
      return [];
    }
  }

  async function selectDevice(deviceId, play = true) {
    playClickSfx();
    if (!state.auth.signedIn || !deviceId) return;
    clearErrors();
    if (deviceId === webSdkDeviceId && webSdkPlayer) {
      try { webSdkPlayer.activateElement?.(); } catch (e) {}
    }
    try {
      if (play && state.embed.isPlaying) pauseEmbedSilently();
      await getAPI()?.transferPlayback?.(deviceId, Boolean(play));
      const matched = state.devices.find((d) => d.id === deviceId);
      if (matched) state.playback.device = { ...matched, isActive: true };
      if (play) {
        state.mode = 'account';
        state.playback.active = true;
        state.playback.isPlaying = true;
      }
      syncTickTimer();
      syncAudioPolicy();
      notify();
      setTimeout(() => {
        refreshDevices().catch(() => {});
        pollPlayback().catch(() => {});
      }, 450);
    } catch (err) {
      handlePlaybackError(err);
    }
  }

  async function loadLibrary(force = false) {
    if (!state.auth.signedIn) return state.library;
    if (!force && libraryLoaded && (Date.now() - lastLibraryAt < 60_000)) return state.library;
    if (state.library.loading && !force) return state.library;

    state.library.loading = true;
    state.library.error = '';
    notify();

    const api = getAPI();
    try {
      const [plRes, likedRes, recentRes] = await Promise.allSettled([
        api.getPlaylists(30),
        api.getSavedTracks(25),
        api.getRecentlyPlayed(20),
      ]);

      if (plRes.status === 'fulfilled' && plRes.value) {
        state.library.playlists = (plRes.value.items || []).map(normalizePlaylist).filter(Boolean);
      }
      if (likedRes.status === 'fulfilled' && likedRes.value) {
        state.library.likedTotal = Number(likedRes.value.total) || 0;
        state.library.likedTracks = (likedRes.value.items || [])
          .map((item) => normalizeTrack(item?.track || item))
          .filter(Boolean);
      }
      if (recentRes.status === 'fulfilled' && recentRes.value) {
        const seen = new Set();
        const deduped = [];
        for (const item of (recentRes.value.items || [])) {
          const tr = normalizeTrack(item?.track || item);
          if (!tr || !tr.uri || seen.has(tr.uri)) continue;
          seen.add(tr.uri);
          deduped.push(tr);
        }
        state.library.recentTracks = deduped;
      }

      const firstRejected = [plRes, likedRes, recentRes].find((r) => r.status === 'rejected');
      if (firstRejected && firstRejected.reason?.code === 'AUTH_EXPIRED') {
        await handleExpiredSession();
      } else if (plRes.status === 'rejected' && likedRes.status === 'rejected' && recentRes.status === 'rejected') {
        state.library.error = firstRejected?.reason?.message || 'Failed to load Spotify library.';
      } else {
        libraryLoaded = true;
        lastLibraryAt = Date.now();
      }
    } catch (err) {
      state.library.error = err?.message || 'Failed to load Spotify library.';
    } finally {
      state.library.loading = false;
      notify();
    }
    return state.library;
  }

  async function searchCatalog(query) {
    const q = String(query || '').trim();
    const mySeq = ++searchSeq;
    state.search.query = q;

    if (!q) {
      state.search.tracks = [];
      state.search.playlists = [];
      state.search.albums = [];
      state.search.loading = false;
      state.search.error = '';
      notify();
      return state.search;
    }

    if (!state.auth.signedIn) {
      state.search.tracks = [];
      state.search.playlists = [];
      state.search.albums = [];
      state.search.loading = false;
      state.search.error = 'Connect your Spotify account to search Spotify catalog.';
      notify();
      return state.search;
    }

    state.search.loading = true;
    state.search.error = '';
    notify();

    try {
      const data = await getAPI()?.search?.(q, 'track,playlist,album', 8);
      if (mySeq !== searchSeq) return state.search;
      state.search.tracks = (data?.tracks?.items || []).map(normalizeTrack).filter(Boolean);
      state.search.playlists = (data?.playlists?.items || []).map(normalizePlaylist).filter(Boolean);
      state.search.albums = (data?.albums?.items || []).map(normalizeAlbum).filter(Boolean);
      state.search.loading = false;
      notify();
    } catch (err) {
      if (mySeq !== searchSeq) return state.search;
      state.search.loading = false;
      state.search.error = err?.message || 'Spotify search failed.';
      if (err?.code === 'AUTH_EXPIRED') await handleExpiredSession();
      notify();
    }
    return state.search;
  }

  // ---------- Quick Embed Fallback (zero-setup Spotify Embed iFrame) ----------

  function parseInput(raw) {
    return getPKCE()?.parseSpotifyInput?.(raw) || { ok: false, error: 'Parser unavailable.' };
  }

  function clearEmbedFallbackTimer() {
    if (embedFallbackTimer) {
      clearTimeout(embedFallbackTimer);
      embedFallbackTimer = null;
    }
  }

  function embedHeightForType(type) {
    return (type === 'track' || type === 'episode') ? 152 : 352;
  }

  function renderFallbackIframe(parsed) {
    if (!embedHost) return;
    embedController = null;
    embedControllerReady = false;
    embedHost.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.className = 'sp-embed-iframe';
    iframe.src = parsed.embedUrl;
    iframe.width = '100%';
    iframe.height = String(embedHeightForType(parsed.type));
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
    iframe.setAttribute('loading', 'lazy');
    iframe.title = state.embed.title || 'Spotify Embed Player';
    iframe.style.border = '0';
    iframe.style.borderRadius = '12px';
    iframe.style.display = 'block';
    iframe.style.width = '100%';
    embedHost.appendChild(iframe);
  }

  function ensureEmbedApiLoaded() {
    if (embedApi) return Promise.resolve(embedApi);
    if (embedApiPromise) return embedApiPromise;
    if (typeof document === 'undefined') return Promise.resolve(null);

    embedApiPromise = new Promise((resolve) => {
      const prevReady = window.onSpotifyIframeApiReady;
      window.onSpotifyIframeApiReady = (IFrameAPI) => {
        embedApi = IFrameAPI;
        if (typeof prevReady === 'function') {
          try { prevReady(IFrameAPI); } catch (e) {}
        }
        resolve(IFrameAPI);
      };

      const existing = document.querySelector(`script[src="${EMBED_API_URL}"]`);
      if (existing) return;

      const script = document.createElement('script');
      script.src = EMBED_API_URL;
      script.async = true;
      script.onerror = () => {
        resolve(null);
      };
      (document.head || document.documentElement).appendChild(script);
    });

    return embedApiPromise;
  }

  function mountEmbedIntoHost(parsed) {
    if (!embedHost || !parsed?.ok) return;
    const seq = ++embedLoadSeq;
    clearEmbedFallbackTimer();

    // Reuse active controller if its iframe is still mounted in embedHost
    if (embedController && embedHost.querySelector('iframe')) {
      try {
        const iframe = embedHost.querySelector('iframe');
        if (iframe) iframe.height = String(embedHeightForType(parsed.type));
        embedController.loadUri(parsed.uri);
        return;
      } catch (e) {
        embedController = null;
        embedControllerReady = false;
      }
    }

    embedHost.innerHTML = '';
    const slot = document.createElement('div');
    slot.className = 'sp-embed-slot';
    embedHost.appendChild(slot);

    embedFallbackTimer = setTimeout(() => {
      embedFallbackTimer = null;
      if (seq !== embedLoadSeq || !state.embed.activeUri) return;
      if (!embedController) {
        renderFallbackIframe(parsed);
      }
    }, EMBED_TIMEOUT_MS);

    ensureEmbedApiLoaded().then((IFrameAPI) => {
      if (seq !== embedLoadSeq || !state.embed.activeUri || !embedHost) return;
      if (!IFrameAPI || typeof IFrameAPI.createController !== 'function') {
        clearEmbedFallbackTimer();
        renderFallbackIframe(parsed);
        return;
      }

      try {
        IFrameAPI.createController(
          slot,
          {
            width: '100%',
            height: embedHeightForType(parsed.type),
            uri: parsed.uri,
          },
          (controller) => {
            if (seq !== embedLoadSeq || !state.embed.activeUri) {
              try { controller.destroy?.(); } catch (e) {}
              return;
            }
            clearEmbedFallbackTimer();
            embedController = controller;
            embedControllerReady = false;

            controller.addListener?.('ready', () => {
              embedControllerReady = true;
            });

            controller.addListener?.('playback_update', (ev) => {
              const d = ev?.data || {};
              const nextPlaying = !d.isPaused;
              const prevPlaying = state.embed.isPlaying;
              state.embed.isPlaying = nextPlaying;
              state.embed.positionMs = Number(d.position) || 0;
              state.embed.durationMs = Number(d.duration) || 0;

              if (nextPlaying && !prevPlaying) {
                state.mode = 'embed';
                if (state.playback.isPlaying) {
                  pauseAccountPlaybackSilently();
                }
              }

              syncTickTimer();
              syncAudioPolicy();
              notify();
            });
          }
        );
      } catch (e) {
        clearEmbedFallbackTimer();
        renderFallbackIframe(parsed);
      }
    });
  }

  function mountEmbedHost(el) {
    const nextEl = el || null;
    if (nextEl === embedHost) return;
    if (embedHost && nextEl && !nextEl.contains(embedHost)) {
      if (embedController) {
        try { embedController.destroy?.(); } catch (e) {}
        embedController = null;
        embedControllerReady = false;
      }
    }
    embedHost = nextEl;
    if (embedHost && state.embed.activeUri) {
      const parsed = parseInput(state.embed.activeUri);
      if (parsed.ok) mountEmbedIntoHost(parsed);
    }
  }

  function pauseEmbedSilently() {
    if (!state.embed.isPlaying && !embedController) return;
    if (embedController) {
      try {
        if (typeof embedController.pause === 'function') {
          embedController.pause();
        } else if (state.embed.isPlaying && typeof embedController.togglePlay === 'function') {
          embedController.togglePlay();
        }
      } catch (e) {}
    }
    if (state.embed.isPlaying) {
      state.embed.isPlaying = false;
      syncTickTimer();
      syncAudioPolicy();
      notify();
    }
  }

  function loadEmbed(rawOrUri, title) {
    const parsed = parseInput(rawOrUri);
    if (!parsed.ok) {
      showToast(parsed.error, 3200);
      return parsed;
    }

    playClickSfx();
    if (state.playback.isPlaying) {
      pauseAccountPlaybackSilently();
    }

    const preset = state.embed.presets.find((p) => p.uri === parsed.uri);
    const existingRecent = state.embed.recentLinks.find((r) => r.uri === parsed.uri);
    const fallbackTitle = `Spotify ${parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1)}`;
    const resolvedTitle = String(title || preset?.label || existingRecent?.title || fallbackTitle).trim();

    recordRecentLink(parsed, resolvedTitle);

    state.mode = 'embed';
    state.embed.activeUri = parsed.uri;
    state.embed.title = resolvedTitle;
    state.embed.isPlaying = false;
    state.embed.positionMs = 0;
    state.embed.durationMs = 0;
    clearErrors();

    announceNowPlaying(resolvedTitle);
    syncTickTimer();
    syncAudioPolicy();
    notify();

    if (embedHost) {
      mountEmbedIntoHost(parsed);
    }

    return { ok: true, ...parsed, title: resolvedTitle };
  }

  function stopEmbed() {
    playClickSfx();
    embedLoadSeq++;
    clearEmbedFallbackTimer();
    if (embedController) {
      try { embedController.pause?.(); } catch (e) {}
      try { embedController.destroy?.(); } catch (e) {}
      embedController = null;
    }
    embedControllerReady = false;
    if (embedHost) {
      embedHost.innerHTML = '';
    }
    state.embed.activeUri = '';
    state.embed.title = '';
    state.embed.isPlaying = false;
    state.embed.positionMs = 0;
    state.embed.durationMs = 0;
    state.mode = (state.auth.signedIn && state.playback.track) ? 'account' : 'idle';
    syncTickTimer();
    syncAudioPolicy();
    notify();
  }

  // ---------- Drawer & Tab Management ----------

  function setDrawerOpen(open, tab) {
    const nextOpen = Boolean(open);
    state.drawerOpen = nextOpen;
    if (tab && VALID_TABS.has(tab)) {
      state.activeTab = tab;
    }
    notify();

    if (nextOpen) {
      maybeFetchServerConfig().then(async () => {
        const pkce = getPKCE();
        if (pkce && !state.auth.clientId) {
          const s = await pkce.getState();
          applyPkceState(s);
          notify();
        }
      }).catch(() => {});

      if (state.auth.signedIn) {
        pollPlayback().catch(() => {});
        refreshDevices().catch(() => {});
        if (state.activeTab === 'playlists' && !libraryLoaded) {
          loadLibrary(false).catch(() => {});
        }
        schedulePolling();
      }
    } else if (state.auth.signedIn) {
      schedulePolling();
    }
  }

  function toggleDrawer(tab) {
    if (tab && VALID_TABS.has(tab) && state.drawerOpen && state.activeTab !== tab) {
      setActiveTab(tab);
      return;
    }
    setDrawerOpen(!state.drawerOpen, tab);
  }

  function setActiveTab(tab) {
    if (!VALID_TABS.has(tab)) return;
    state.activeTab = tab;
    notify();

    if (tab === 'playlists' && state.auth.signedIn && !libraryLoaded) {
      loadLibrary(false).catch(() => {});
    } else if (tab === 'now' && state.auth.signedIn) {
      pollPlayback().catch(() => {});
    } else if (tab === 'setup') {
      maybeFetchServerConfig().then(async () => {
        const pkce = getPKCE();
        if (pkce) {
          const s = await pkce.getState();
          applyPkceState(s);
          notify();
        }
      }).catch(() => {});
    }
  }

  function onGameMuteChanged(muted) {
    if (muted !== true) {
      forceSyncAudioPolicy();
      return;
    }
    if (state.mode === 'account' && state.playback.isPlaying && state.playback.device?.isWebSdk && webSdkPlayer) {
      try { Promise.resolve(webSdkPlayer.pause?.()).catch(() => {}); } catch (e) {}
      state.playback.isPlaying = false;
      syncTickTimer();
      notify();
    }
    if (state.mode === 'embed' && state.embed.isPlaying) {
      pauseEmbedSilently();
    }
    forceSyncAudioPolicy();
  }

  const publicApi = {
    boot,
    getState,
    subscribe,
    setConfig,
    signIn,
    signOut,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    playContext,
    playTracks,
    refreshDevices,
    selectDevice,
    loadLibrary,
    searchCatalog,
    parseInput,
    mountEmbedHost,
    loadEmbed,
    stopEmbed,
    setDrawerOpen,
    toggleDrawer,
    setActiveTab,
    onGameMuteChanged,
    syncAudioPolicy: forceSyncAudioPolicy,
  };

  if (webSdkPlayerCtor) {
    publicApi.Player = webSdkPlayerCtor;
  }

  return publicApi;
})();
