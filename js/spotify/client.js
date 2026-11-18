/* Slopitaire — Spotify Web API v1 client with Bearer auth, single-flight refresh, 429 retry & error mapping. */
'use strict';

const SpotifyAPI = (() => {
  const BASE_URL = 'https://api.spotify.com/v1';
  const REQUEST_TIMEOUT_MS = 12000;
  const MIN_RETRY_AFTER_MS = 500;
  const MAX_RETRY_AFTER_MS = 8000;

  let customTokenProvider = null;

  const getPKCE = () => (typeof SpotifyPKCE !== 'undefined'
    ? SpotifyPKCE
    : (typeof window !== 'undefined' ? window.SpotifyPKCE : null));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function setTokenProvider(fn) {
    customTokenProvider = typeof fn === 'function' ? fn : null;
  }

  async function resolveToken(forceRefresh = false) {
    if (customTokenProvider) return customTokenProvider(forceRefresh);
    const pkce = getPKCE();
    if (!pkce || typeof pkce.getAccessToken !== 'function') return null;
    return pkce.getAccessToken(forceRefresh);
  }

  function buildError(status, payload, fallbackMessage) {
    const errObj = payload && typeof payload.error === 'object' ? payload.error : null;
    const rawReason = String(errObj?.reason || (typeof payload?.error === 'string' ? payload.error : '') || '').trim();
    const rawMsg = String(errObj?.message || payload?.error_description || fallbackMessage || `Spotify request failed (${status})`).trim();

    let code = rawReason || `HTTP_${status}`;
    let message = rawMsg;

    if (status === 403 && (rawReason === 'PREMIUM_REQUIRED' || /premium/i.test(rawMsg))) {
      code = 'PREMIUM_REQUIRED';
      message = 'Spotify Premium is required for remote playback control. Use Quick Embed to play links free!';
    } else if (status === 404 && (rawReason === 'NO_ACTIVE_DEVICE' || /no active device/i.test(rawMsg))) {
      code = 'NO_ACTIVE_DEVICE';
      message = 'No active Spotify device found. Open Spotify on any device or use Stream Here / Quick Embed.';
    } else if (status === 401) {
      code = 'UNAUTHORIZED';
      message = 'Spotify session expired. Please reconnect your account.';
    } else if (status === 429) {
      code = 'RATE_LIMITED';
      message = 'Spotify rate limit reached. Please wait a moment and try again.';
    } else if (status === 403) {
      code = rawReason || 'FORBIDDEN';
      message = rawMsg || 'Spotify denied access. Check your app permissions or Spotify Development Mode users.';
    }

    const err = new Error(message);
    err.status = status;
    err.code = code;
    err.reason = rawReason;
    err.rawMessage = rawMsg;
    return err;
  }

  async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const url = path.startsWith('http') ? path : (BASE_URL + (path.startsWith('/') ? path : '/' + path));
    let retriedAuth = false;
    let forceRefresh = false;
    let retriedRateLimit = false;

    while (true) {
      const token = await resolveToken(forceRefresh);
      forceRefresh = false;
      if (!token) {
        const err = new Error('Not signed in to Spotify.');
        err.status = 401;
        err.code = 'NOT_AUTHENTICATED';
        throw err;
      }

      const headers = Object.assign({}, options.headers || {}, {
        Authorization: `Bearer ${token}`,
      });

      const fetchOpts = { method, headers };
      if (options.body !== undefined) {
        if (typeof options.body === 'string') {
          fetchOpts.body = options.body;
        } else {
          fetchOpts.body = JSON.stringify(options.body);
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        }
      }

      let timer = null;
      if (typeof AbortController !== 'undefined' && !options.signal) {
        const ctrl = new AbortController();
        fetchOpts.signal = ctrl.signal;
        timer = setTimeout(() => ctrl.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
      } else if (options.signal) {
        fetchOpts.signal = options.signal;
      }

      let res;
      try {
        res = await fetch(url, fetchOpts);
      } catch (networkErr) {
        const err = new Error(networkErr?.name === 'AbortError'
          ? 'Spotify request timed out. Please try again.'
          : 'Could not reach Spotify. Check your internet connection.');
        err.status = 0;
        err.code = networkErr?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';
        err.cause = networkErr;
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (res.status === 401 && !retriedAuth) {
        retriedAuth = true;
        const latest = await resolveToken(false).catch(() => null);
        forceRefresh = !(latest && latest !== token);
        continue;
      }

      if (res.status === 429 && !retriedRateLimit) {
        retriedRateLimit = true;
        const rawAfter = res.headers?.get?.('Retry-After');
        const sec = Number(rawAfter);
        const waitMs = clampNum((Number.isFinite(sec) && sec > 0 ? sec : 1.5) * 1000, MIN_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS);
        await sleep(waitMs);
        continue;
      }

      if (res.status === 204 || res.status === 205) {
        return null;
      }

      const text = await res.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch (e) { data = null; }
      }

      if (!res.ok) {
        throw buildError(res.status, data, res.statusText || text);
      }

      return data;
    }
  }

  function withDeviceQuery(basePath, deviceId) {
    if (!deviceId) return basePath;
    const sep = basePath.includes('?') ? '&' : '?';
    return `${basePath}${sep}device_id=${encodeURIComponent(deviceId)}`;
  }

  function getMe() {
    return request('/me');
  }

  function getPlaybackState() {
    return request('/me/player?additional_types=track,episode');
  }

  async function getDevices() {
    const data = await request('/me/player/devices');
    return Array.isArray(data?.devices) ? data.devices : [];
  }

  function transferPlayback(deviceId, play = false) {
    return request('/me/player', {
      method: 'PUT',
      body: {
        device_ids: [String(deviceId)],
        play: Boolean(play),
      },
    });
  }

  function play({ deviceId, contextUri, uris, offsetUri, positionMs } = {}) {
    const body = {};
    if (contextUri) {
      body.context_uri = contextUri;
      if (offsetUri) body.offset = { uri: offsetUri };
    } else if (Array.isArray(uris) && uris.length > 0) {
      body.uris = uris;
      if (offsetUri) body.offset = { uri: offsetUri };
    }
    if (typeof positionMs === 'number' && Number.isFinite(positionMs) && positionMs >= 0) {
      body.position_ms = Math.round(positionMs);
    }

    const opts = { method: 'PUT' };
    if (Object.keys(body).length > 0) opts.body = body;
    return request(withDeviceQuery('/me/player/play', deviceId), opts);
  }

  function pause(deviceId) {
    return request(withDeviceQuery('/me/player/pause', deviceId), { method: 'PUT' });
  }

  function next(deviceId) {
    return request(withDeviceQuery('/me/player/next', deviceId), { method: 'POST' });
  }

  function previous(deviceId) {
    return request(withDeviceQuery('/me/player/previous', deviceId), { method: 'POST' });
  }

  function seek(positionMs, deviceId) {
    const pos = Math.max(0, Math.round(Number(positionMs) || 0));
    return request(withDeviceQuery(`/me/player/seek?position_ms=${pos}`, deviceId), { method: 'PUT' });
  }

  function setVolume(volumePercent, deviceId) {
    const vol = clampNum(Math.round(Number(volumePercent) || 0), 0, 100);
    return request(withDeviceQuery(`/me/player/volume?volume_percent=${vol}`, deviceId), { method: 'PUT' });
  }

  function setShuffle(state, deviceId) {
    return request(withDeviceQuery(`/me/player/shuffle?state=${Boolean(state)}`, deviceId), { method: 'PUT' });
  }

  function setRepeat(state, deviceId) {
    const mode = state === 'track' || state === 'context' ? state : 'off';
    return request(withDeviceQuery(`/me/player/repeat?state=${mode}`, deviceId), { method: 'PUT' });
  }

  function getPlaylists(limit = 30) {
    const n = clampNum(Math.round(Number(limit) || 30), 1, 50);
    return request(`/me/playlists?limit=${n}`);
  }

  function getSavedTracks(limit = 25) {
    const n = clampNum(Math.round(Number(limit) || 25), 1, 50);
    return request(`/me/tracks?limit=${n}`);
  }

  function getRecentlyPlayed(limit = 20) {
    const n = clampNum(Math.round(Number(limit) || 20), 1, 50);
    return request(`/me/player/recently-played?limit=${n}`);
  }

  function search(query, types = 'track,playlist,album', limit = 8) {
    const q = encodeURIComponent(String(query || '').trim());
    const t = encodeURIComponent(String(types || 'track,playlist,album'));
    const n = clampNum(Math.round(Number(limit) || 8), 1, 50);
    return request(`/search?q=${q}&type=${t}&limit=${n}`);
  }

  return {
    setTokenProvider,
    request,
    getMe,
    getPlaybackState,
    getDevices,
    transferPlayback,
    play,
    pause,
    next,
    previous,
    seek,
    setVolume,
    setShuffle,
    setRepeat,
    getPlaylists,
    getSavedTracks,
    getRecentlyPlayed,
    search,
  };
})();
