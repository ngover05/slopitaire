/* Slopitaire — Spotify OAuth 2.0 PKCE (S256), Electron IPC auth bridge, link parser & curated presets. */
'use strict';

const SpotifyPKCE = (() => {
  const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read user-read-recently-played';

  const PRESETS = [
    { id: '37i9dQZF1DWWQRwui0ExPn', uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn', label: 'Lo-Fi Beats', icon: '🌸' },
    { id: '37i9dQZF1DX6GJXiuZRisr', uri: 'spotify:playlist:37i9dQZF1DX6GJXiuZRisr', label: 'Synthwave', icon: '⚡' },
    { id: '37i9dQZF1DX0hAXqBDwvwI', uri: 'spotify:playlist:37i9dQZF1DX0hAXqBDwvwI', label: 'Anime Now', icon: '✿' },
    { id: '37i9dQZF1DX0SM0LYsmbMT', uri: 'spotify:playlist:37i9dQZF1DX0SM0LYsmbMT', label: 'Jazz Vibes', icon: '◈' },
    { id: '37i9dQZF1DWZeKCadgRdKQ', uri: 'spotify:playlist:37i9dQZF1DWZeKCadgRdKQ', label: 'Deep Focus', icon: '✦' },
  ];

  const CONFIG_KEY = 'slopitaire.spotifyConfig';
  const AUTH_KEY = 'slopitaire.spotifyAuth';
  const PKCE_KEY = 'slopitaire.spotifyPkce';
  const AUTH_RESULT_KEY = 'slopitaire.spotifyAuthResult';
  const DEFAULT_PORT = 43821;
  const AUTH_URL = 'https://accounts.spotify.com/authorize';
  const TOKEN_URL = 'https://accounts.spotify.com/api/token';
  const ME_URL = 'https://api.spotify.com/v1/me';
  const SUPPORTED_TYPES = new Set(['track', 'playlist', 'album', 'artist', 'episode', 'show']);

  let serverConfig = { configured: false, clientId: '', redirectUri: '' };
  let electronCache = null;
  let refreshInFlight = null;

  const isElectron = () => Boolean(typeof window !== 'undefined' && window.slopDesktop && window.slopDesktop.isElectron === true);

  function normalizePort(port) {
    const n = Number(port);
    return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : DEFAULT_PORT;
  }

  function cleanClientId(id) {
    return typeof id === 'string' ? id.trim() : '';
  }

  function readStorageJson(key, fallback = null) {
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeStorageJson(key, val) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (val == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* storage unavailable */ }
  }

  function defaultWebRedirectUri() {
    if (typeof window === 'undefined' || !window.location) return '';
    const origin = window.location.origin || '';
    if (!/^https?:\/\//i.test(origin)) return '';
    return origin.replace(/^http:\/\/localhost\b/i, 'http://127.0.0.1') + '/api/spotify/callback';
  }

  function electronRedirectUri(port) {
    return `http://127.0.0.1:${normalizePort(port)}/spotify/callback`;
  }

  function normalizeUser(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const displayName = String(raw.displayName || raw.display_name || id || 'Spotify User').trim();
    const imageUrl = String(raw.imageUrl || (Array.isArray(raw.images) && raw.images[0]?.url) || '').trim();
    return {
      id,
      displayName,
      display_name: String(raw.display_name || raw.displayName || id || '').trim(),
      email: String(raw.email || '').trim(),
      product: String(raw.product || '').trim().toLowerCase(),
      imageUrl,
      images: Array.isArray(raw.images) ? raw.images : (imageUrl ? [{ url: imageUrl }] : []),
    };
  }

  function parseSpotifyInput(raw) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) {
      return { ok: false, error: 'Paste a Spotify track, playlist, or album link or URI.' };
    }

    if (/^https?:\/\/spotify\.link\//i.test(s)) {
      return { ok: false, error: 'Short spotify.link URLs must be opened to get the full open.spotify.com link.' };
    }

    let type = '';
    let id = '';

    // 1. https://open.spotify.com/(intl-xx/)?(embed/)?(type)/(id)
    const urlMatch = s.match(/^(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z0-9-]+\/)?(?:embed\/)?([a-z]+)\/([A-Za-z0-9]+)(?:[/?#].*)?$/i);
    if (urlMatch) {
      type = urlMatch[1].toLowerCase();
      id = urlMatch[2];
    }

    // 2. spotify:user:<user>:playlist:<id> (legacy) or spotify:<type>:<id>
    if (!type) {
      const legacyMatch = s.match(/^spotify:user:[^:\s]+:playlist:([A-Za-z0-9]+)(?:\?.*)?$/i);
      if (legacyMatch) {
        type = 'playlist';
        id = legacyMatch[1];
      }
    }

    if (!type) {
      const uriMatch = s.match(/^spotify:([a-z]+):([A-Za-z0-9]+)(?:\?.*)?$/i);
      if (uriMatch) {
        type = uriMatch[1].toLowerCase();
        id = uriMatch[2];
      }
    }

    // 3. Typed prefix like track:ID or playlist:ID
    if (!type) {
      const shortMatch = s.match(/^([a-z]+):([A-Za-z0-9]+)$/i);
      if (shortMatch) {
        type = shortMatch[1].toLowerCase();
        id = shortMatch[2];
      }
    }

    if (!type || !id || !SUPPORTED_TYPES.has(type)) {
      return {
        ok: false,
        error: 'Enter a valid Spotify link (open.spotify.com/...) or URI (spotify:track:..., playlist:...).',
      };
    }

    const uri = `spotify:${type}:${id}`;
    return {
      ok: true,
      uri,
      type,
      id,
      embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
      openUrl: `https://open.spotify.com/${type}/${id}`,
    };
  }

  function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  function base64UrlEncode(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function randomBase64Url(byteLen) {
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
      throw new Error('Web Crypto random generator is unavailable in this browser.');
    }
    const bytes = new Uint8Array(byteLen);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  async function sha256Base64Url(input) {
    if (typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.subtle.digest !== 'function') {
      throw new Error('Web Crypto SHA-256 requires HTTPS or http://127.0.0.1.');
    }
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return base64UrlEncode(digest);
  }

  function getStoredWebConfig() {
    const raw = readStorageJson(CONFIG_KEY, null);
    return {
      clientId: cleanClientId(raw?.clientId),
      port: normalizePort(raw?.port),
    };
  }

  function getStoredWebAuth() {
    const raw = readStorageJson(AUTH_KEY, null);
    if (!raw || typeof raw !== 'object' || !raw.accessToken) return null;
    return {
      accessToken: String(raw.accessToken || ''),
      refreshToken: String(raw.refreshToken || ''),
      expiresAt: Number(raw.expiresAt) || 0,
      scope: String(raw.scope || ''),
      user: normalizeUser(raw.user),
      clientId: cleanClientId(raw.clientId),
    };
  }

  function saveWebAuth(auth) {
    if (!auth || !auth.accessToken) {
      writeStorageJson(AUTH_KEY, null);
      return null;
    }
    const normalized = {
      accessToken: String(auth.accessToken),
      refreshToken: String(auth.refreshToken || ''),
      expiresAt: Number(auth.expiresAt) || 0,
      scope: String(auth.scope || ''),
      user: normalizeUser(auth.user),
      clientId: cleanClientId(auth.clientId),
    };
    writeStorageJson(AUTH_KEY, normalized);
    return normalized;
  }

  async function loadServerConfig(baseUrl = '') {
    try {
      if (typeof fetch !== 'function') return serverConfig;
      const prefix = baseUrl ? String(baseUrl).replace(/\/+$/, '') : '';
      const url = prefix + '/api/spotify/config';
      let ctrl = null;
      let timer = null;
      const fetchOpts = { method: 'GET', credentials: 'omit' };
      if (typeof AbortController !== 'undefined') {
        ctrl = new AbortController();
        fetchOpts.signal = ctrl.signal;
        timer = setTimeout(() => ctrl.abort(), 4000);
      }
      try {
        const res = await fetch(url, fetchOpts);
        if (!res.ok) return serverConfig;
        const data = await res.json();
        if (data && typeof data === 'object') {
          serverConfig = {
            configured: Boolean(data.configured),
            clientId: cleanClientId(data.clientId),
            redirectUri: typeof data.redirectUri === 'string' ? data.redirectUri.trim() : '',
          };
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (e) { /* server config optional */ }
    return serverConfig;
  }

  function resolveWebClientId() {
    const cfg = getStoredWebConfig();
    return cfg.clientId || serverConfig.clientId || '';
  }

  function resolveWebRedirectUri() {
    return serverConfig.redirectUri || defaultWebRedirectUri();
  }

  async function fetchProfileQuiet(accessToken) {
    try {
      if (!accessToken || typeof fetch !== 'function') return null;
      const res = await fetch(ME_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return normalizeUser(data);
    } catch (e) {
      return null;
    }
  }

  async function exchangeToken(params) {
    const body = new URLSearchParams(params);
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }

    if (!res.ok || !data || !data.access_token) {
      const code = data?.error || `HTTP_${res.status}`;
      const msg = data?.error_description || data?.error || `Spotify token exchange failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.code = code;
      throw err;
    }

    const expiresInSec = Number(data.expires_in) || 3600;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || '',
      expiresAt: Date.now() + expiresInSec * 1000,
      scope: data.scope || '',
    };
  }

  async function completeWebCodeExchange({ code, codeVerifier, clientId, redirectUri }) {
    const tok = await exchangeToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });
    const user = await fetchProfileQuiet(tok.accessToken);
    const saved = saveWebAuth({
      accessToken: tok.accessToken,
      refreshToken: tok.refreshToken,
      expiresAt: tok.expiresAt,
      scope: tok.scope,
      user,
      clientId,
    });
    return {
      ok: true,
      clientId,
      accessToken: saved.accessToken,
      expiresAt: saved.expiresAt,
      scope: saved.scope,
      user: saved.user,
    };
  }

  async function getState() {
    if (isElectron()) {
      try {
        const s = await window.slopDesktop.getSpotifyState();
        electronCache = {
          clientId: cleanClientId(s?.clientId),
          port: normalizePort(s?.port),
          redirectUri: String(s?.redirectUri || electronRedirectUri(s?.port)),
          accessToken: String(s?.accessToken || ''),
          expiresAt: Number(s?.expiresAt) || 0,
          hasRefreshToken: Boolean(s?.hasRefreshToken),
          user: normalizeUser(s?.user),
        };
      } catch (e) {
        if (!electronCache) {
          electronCache = {
            clientId: '',
            port: DEFAULT_PORT,
            redirectUri: electronRedirectUri(DEFAULT_PORT),
            accessToken: '',
            expiresAt: 0,
            hasRefreshToken: false,
            user: null,
          };
        }
      }
      const effectiveClientId = electronCache.clientId || serverConfig.clientId || '';
      return {
        isElectron: true,
        clientId: effectiveClientId,
        port: electronCache.port,
        configured: Boolean(effectiveClientId),
        redirectUri: electronCache.redirectUri,
        signedIn: Boolean(electronCache.accessToken || electronCache.hasRefreshToken),
        accessToken: electronCache.accessToken,
        expiresAt: electronCache.expiresAt,
        hasRefreshToken: electronCache.hasRefreshToken,
        user: electronCache.user,
      };
    }

    const cfg = getStoredWebConfig();
    const auth = getStoredWebAuth();
    const effectiveClientId = cfg.clientId || auth?.clientId || serverConfig.clientId || '';
    const redirectUri = resolveWebRedirectUri();
    return {
      isElectron: false,
      clientId: effectiveClientId,
      port: cfg.port,
      configured: Boolean(effectiveClientId),
      redirectUri,
      signedIn: Boolean(auth && (auth.accessToken || auth.refreshToken)),
      accessToken: auth?.accessToken || '',
      expiresAt: auth?.expiresAt || 0,
      hasRefreshToken: Boolean(auth?.refreshToken),
      user: auth?.user || null,
    };
  }

  async function setConfig({ clientId, port } = {}) {
    const cleanedId = cleanClientId(clientId);
    const validPort = normalizePort(port);

    if (isElectron()) {
      const res = await window.slopDesktop.setSpotifyConfig({ clientId: cleanedId, port: validPort });
      const next = {
        clientId: cleanClientId(res?.clientId ?? cleanedId),
        port: normalizePort(res?.port ?? validPort),
        redirectUri: String(res?.redirectUri || electronRedirectUri(validPort)),
      };
      if (electronCache) {
        electronCache.clientId = next.clientId;
        electronCache.port = next.port;
        electronCache.redirectUri = next.redirectUri;
      }
      return { ok: true, ...next };
    }

    writeStorageJson(CONFIG_KEY, { clientId: cleanedId, port: validPort });
    return {
      ok: true,
      clientId: cleanedId || serverConfig.clientId || '',
      port: validPort,
      redirectUri: resolveWebRedirectUri(),
    };
  }

  function setUser(user) {
    const norm = normalizeUser(user);
    if (isElectron()) {
      if (electronCache) electronCache.user = norm;
      return norm;
    }
    const auth = getStoredWebAuth();
    if (auth) {
      auth.user = norm;
      saveWebAuth(auth);
    }
    return norm;
  }

  async function signIn(opts = {}) {
    const clientIdArg = cleanClientId(opts.clientId);
    const portArg = opts.port !== undefined ? normalizePort(opts.port) : undefined;
    const scopes = String(opts.scopes || SCOPES);

    if (isElectron()) {
      const stateBefore = await getState();
      const targetClientId = clientIdArg || stateBefore.clientId || serverConfig.clientId || '';
      const targetPort = portArg ?? stateBefore.port;
      const res = await window.slopDesktop.signInWithSpotify({
        clientId: targetClientId,
        scopes,
        port: targetPort,
      });
      if (!res || !res.ok || !res.accessToken) {
        throw new Error(res?.error || 'Spotify sign-in failed.');
      }
      electronCache = {
        clientId: cleanClientId(res.clientId || targetClientId),
        port: targetPort,
        redirectUri: electronRedirectUri(targetPort),
        accessToken: String(res.accessToken),
        expiresAt: Number(res.expiresAt) || (Date.now() + 3600_000),
        hasRefreshToken: true,
        user: normalizeUser(res.user),
      };
      return {
        ok: true,
        clientId: electronCache.clientId,
        accessToken: electronCache.accessToken,
        expiresAt: electronCache.expiresAt,
        scope: res.scope || scopes,
        user: electronCache.user,
      };
    }

    // Web PKCE flow: open popup synchronously before async crypto.subtle so popup blockers allow it.
    const clientId = clientIdArg || resolveWebClientId();
    if (!clientId) {
      throw new Error('Enter your Spotify Client ID in the Setup tab first.');
    }
    const redirectUri = resolveWebRedirectUri();
    if (!redirectUri) {
      throw new Error('Could not determine a valid HTTP(S) redirect URI for Spotify.');
    }

    const w = 500;
    const h = 720;
    const dualLeft = window.screenLeft !== undefined ? window.screenLeft : (window.screenX || 0);
    const dualTop = window.screenTop !== undefined ? window.screenTop : (window.screenY || 0);
    const vw = window.innerWidth || document.documentElement?.clientWidth || window.outerWidth || 1280;
    const vh = window.innerHeight || document.documentElement?.clientHeight || window.outerHeight || 800;
    const left = Math.max(0, Math.round(dualLeft + (vw - w) / 2));
    const top = Math.max(0, Math.round(dualTop + (vh - h) / 2));
    const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=yes,status=no`;

    let popup = null;
    try {
      popup = window.open('about:blank', 'slopitaire_spotify_auth', features);
    } catch (e) {
      popup = null;
    }

    const stateToken = 'slop_sp_' + randomBase64Url(24);
    const codeVerifier = randomBase64Url(64);
    let codeChallenge;
    try {
      codeChallenge = await sha256Base64Url(codeVerifier);
    } catch (err) {
      try { if (popup && !popup.closed) popup.close(); } catch (e) {}
      throw err;
    }

    writeStorageJson(AUTH_RESULT_KEY, null);
    writeStorageJson(PKCE_KEY, {
      state: stateToken,
      codeVerifier,
      clientId,
      redirectUri,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state: stateToken,
      scope: scopes,
    });
    const authUrl = `${AUTH_URL}?${params.toString()}`;

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      if (typeof window.location.assign === 'function') window.location.assign(authUrl);
      else window.location.href = authUrl;
      return { ok: false, redirected: true };
    }

    try {
      popup.location.replace(authUrl);
    } catch (e) {
      try { if (popup && !popup.closed) popup.close(); } catch (err) {}
      window.location.assign(authUrl);
      return { ok: false, redirected: true };
    }

    const callbackPayload = await new Promise((resolve, reject) => {
      let settled = false;
      let bc = null;
      let pollTimer = null;
      let timeoutTimer = null;
      let closeGraceTimer = null;

      const cleanup = () => {
        if (bc) { try { bc.close(); } catch (e) {} bc = null; }
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
        if (closeGraceTimer) { clearTimeout(closeGraceTimer); closeGraceTimer = null; }
        window.removeEventListener('message', onMessage);
        window.removeEventListener('storage', onStorage);
      };

      const finish = (err, data) => {
        if (settled) return;
        settled = true;
        cleanup();
        try { if (popup && !popup.closed) popup.close(); } catch (e) {}
        if (err) reject(err);
        else resolve(data);
      };

      const handlePayload = (d) => {
        if (!d || d.type !== 'slopitaire:spotify-callback') return;
        if (d.state && !constantTimeEqual(String(d.state), stateToken)) {
          finish(new Error('Spotify OAuth state mismatch — please try again.'));
          return;
        }
        if (!d.ok || d.error || !d.code) {
          finish(new Error(d.error || 'Spotify authorization was cancelled.'));
          return;
        }
        writeStorageJson(AUTH_RESULT_KEY, null);
        writeStorageJson(PKCE_KEY, null);
        finish(null, { code: String(d.code), state: String(d.state || '') });
      };

      const onMessage = (ev) => {
        if (ev.origin !== window.location.origin) return;
        handlePayload(ev.data);
      };

      const onStorage = (ev) => {
        if (ev.key !== AUTH_RESULT_KEY || !ev.newValue) return;
        try {
          handlePayload(JSON.parse(ev.newValue));
        } catch (e) { /* ignore malformed storage payload */ }
      };

      window.addEventListener('message', onMessage);
      window.addEventListener('storage', onStorage);

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          bc = new BroadcastChannel('slopitaire-spotify');
          bc.onmessage = (ev) => handlePayload(ev.data);
        } catch (e) { /* BroadcastChannel unavailable */ }
      }

      pollTimer = setInterval(() => {
        if (settled) return;
        let closed = false;
        try { closed = Boolean(popup.closed); } catch (e) { closed = false; }
        if (closed && !closeGraceTimer) {
          closeGraceTimer = setTimeout(() => {
            if (settled) return;
            // Check localStorage one last time in case storage event didn't fire in the same tab
            const last = readStorageJson(AUTH_RESULT_KEY, null);
            if (last && last.type === 'slopitaire:spotify-callback') {
              handlePayload(last);
              return;
            }
            const hostHint = window.location.hostname === 'localhost'
              ? ' Note: open http://127.0.0.1 instead of localhost so Spotify can return tokens to this tab.'
              : '';
            finish(new Error('Spotify sign-in window closed before completing.' + hostHint));
          }, 450);
        }
      }, 400);

      timeoutTimer = setTimeout(() => {
        finish(new Error('Spotify sign-in timed out. Please try again.'));
      }, 5 * 60 * 1000);
    });

    return completeWebCodeExchange({
      code: callbackPayload.code,
      codeVerifier,
      clientId,
      redirectUri,
    });
  }

  async function handleStartupRedirect() {
    if (isElectron() || typeof window === 'undefined' || !window.location) return null;

    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    const storedPkce = readStorageJson(PKCE_KEY, null);
    const isFreshPkce = Boolean(storedPkce && storedPkce.state && (Date.now() - (storedPkce.createdAt || 0) < 15 * 60 * 1000));

    // Case 1: Redirect landed directly on app URL with ?code=...&state=slop_sp_...
    if (state && state.startsWith('slop_sp_') && (code || error)) {
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      const cleaned = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + (url.hash || '');
      try {
        window.history.replaceState({}, document.title || '', cleaned);
      } catch (e) { /* history unavailable */ }

      writeStorageJson(PKCE_KEY, null);
      if (error) {
        return { ok: false, error };
      }
      if (!isFreshPkce || !constantTimeEqual(state, storedPkce.state)) {
        return { ok: false, error: 'Spotify OAuth state expired or mismatched. Please sign in again.' };
      }
      return completeWebCodeExchange({
        code,
        codeVerifier: storedPkce.codeVerifier,
        clientId: storedPkce.clientId,
        redirectUri: storedPkce.redirectUri,
      });
    }

    // Case 2: Redirect fallback went to /api/spotify/callback and wrote slopitaire.spotifyAuthResult before returning '/'
    const pendingResult = readStorageJson(AUTH_RESULT_KEY, null);
    if (
      pendingResult
      && pendingResult.type === 'slopitaire:spotify-callback'
      && (Date.now() - (pendingResult.ts || 0) < 3 * 60 * 1000)
      && isFreshPkce
      && pendingResult.state
      && constantTimeEqual(String(pendingResult.state), String(storedPkce.state))
    ) {
      writeStorageJson(AUTH_RESULT_KEY, null);
      writeStorageJson(PKCE_KEY, null);
      if (!pendingResult.ok || pendingResult.error || !pendingResult.code) {
        return { ok: false, error: pendingResult.error || 'Spotify authorization failed.' };
      }
      return completeWebCodeExchange({
        code: String(pendingResult.code),
        codeVerifier: storedPkce.codeVerifier,
        clientId: storedPkce.clientId,
        redirectUri: storedPkce.redirectUri,
      });
    }

    return null;
  }

  async function refresh() {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      if (isElectron()) {
        const res = await window.slopDesktop.refreshSpotifyToken();
        if (!res || !res.ok || !res.accessToken) {
          const err = new Error(res?.error || 'Spotify session refresh failed.');
          err.code = 'AUTH_EXPIRED';
          throw err;
        }
        electronCache = Object.assign({}, electronCache || {}, {
          accessToken: String(res.accessToken),
          expiresAt: Number(res.expiresAt) || (Date.now() + 3600_000),
          hasRefreshToken: true,
          user: res.user ? normalizeUser(res.user) : (electronCache?.user || null),
        });
        return {
          ok: true,
          accessToken: electronCache.accessToken,
          expiresAt: electronCache.expiresAt,
          scope: res.scope || '',
          user: electronCache.user,
        };
      }

      const auth = getStoredWebAuth();
      const clientId = auth?.clientId || resolveWebClientId();
      if (!auth?.refreshToken || !clientId) {
        await clearAuth();
        const err = new Error('Spotify session expired. Please sign in again.');
        err.code = 'AUTH_EXPIRED';
        throw err;
      }

      let tok;
      try {
        tok = await exchangeToken({
          grant_type: 'refresh_token',
          refresh_token: auth.refreshToken,
          client_id: clientId,
        });
      } catch (err) {
        if (err && (err.status === 400 || err.status === 401 || err.code === 'invalid_grant' || err.code === 'invalid_client')) {
          await clearAuth();
          err.code = 'AUTH_EXPIRED';
        }
        throw err;
      }

      const preservedRefresh = tok.refreshToken || auth.refreshToken;
      const saved = saveWebAuth({
        accessToken: tok.accessToken,
        refreshToken: preservedRefresh,
        expiresAt: tok.expiresAt,
        scope: tok.scope || auth.scope,
        user: auth.user,
        clientId,
      });

      return {
        ok: true,
        accessToken: saved.accessToken,
        expiresAt: saved.expiresAt,
        scope: saved.scope,
        user: saved.user,
      };
    })();

    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  async function getAccessToken(forceRefresh = false) {
    if (isElectron()) {
      const s = electronCache || await getState();
      if (!s.accessToken && !s.hasRefreshToken) return null;
      const expiringSoon = !s.accessToken || (s.expiresAt > 0 && Date.now() >= s.expiresAt - 60_000);
      if (forceRefresh || expiringSoon) {
        if (!s.hasRefreshToken && !forceRefresh) return s.accessToken || null;
        const refreshed = await refresh();
        return refreshed.accessToken;
      }
      return s.accessToken;
    }

    const auth = getStoredWebAuth();
    if (!auth) return null;
    const expiringSoon = !auth.accessToken || (auth.expiresAt > 0 && Date.now() >= auth.expiresAt - 60_000);
    if (forceRefresh || expiringSoon) {
      if (!auth.refreshToken) {
        await clearAuth();
        const err = new Error('Spotify session expired. Please sign in again.');
        err.code = 'AUTH_EXPIRED';
        throw err;
      }
      const refreshed = await refresh();
      return refreshed.accessToken;
    }
    return auth.accessToken;
  }

  async function clearAuth() {
    refreshInFlight = null;
    if (isElectron()) {
      electronCache = electronCache
        ? { ...electronCache, accessToken: '', expiresAt: 0, hasRefreshToken: false, user: null }
        : null;
      try {
        await window.slopDesktop.clearSpotifyAuth();
      } catch (e) { /* ignore clear error */ }
      return { ok: true };
    }
    writeStorageJson(AUTH_KEY, null);
    writeStorageJson(PKCE_KEY, null);
    writeStorageJson(AUTH_RESULT_KEY, null);
    return { ok: true };
  }

  return {
    SCOPES,
    PRESETS,
    isElectron,
    parseSpotifyInput,
    loadServerConfig,
    getState,
    setConfig,
    setUser,
    signIn,
    handleStartupRedirect,
    refresh,
    getAccessToken,
    clearAuth,
  };
})();
