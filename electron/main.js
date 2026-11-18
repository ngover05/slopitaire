'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  safeStorage,
  shell,
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEFAULT_SERVER_URL = 'http://localhost:3000';
const DEFAULT_SPOTIFY_PORT = 43821;
const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SPOTIFY_ME_ENDPOINT = 'https://api.spotify.com/v1/me';
const DEFAULT_SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-read-recently-played',
].join(' ');
const SIGNIN_TIMEOUT_MS = 120000;
const TOKEN_EXCHANGE_TIMEOUT_MS = 15000;
const SMOKE_TIMEOUT_MS = 8000;
const SMOKE_POLL_MS = 100;

const isSmokeTest = process.argv.includes('--smoke-test');

// The soundtrack should start as soon as the window opens, not after the first click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;
let activeLoopback = null;
let activeSpotifyLoopback = null;
let activeSpotifyRefreshPromise = null;

function userDataFile(name) {
  return path.join(app.getPath('userData'), name);
}

function writeFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {}
    throw err;
  }
}

function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeServerUrl(raw) {
  if (typeof raw !== 'string') {
    throw new Error('Server URL must be a string.');
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Server URL cannot be empty.');
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid server URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Server URL must use http: or https:.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Server URL must not include credentials.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Server URL must not include query parameters or fragments.');
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${cleanPath}`;
}

function getServerUrl() {
  const cfg = readJsonSafe(userDataFile('config.json'), null);
  if (cfg && typeof cfg.serverUrl === 'string') {
    try {
      return normalizeServerUrl(cfg.serverUrl);
    } catch {}
  }
  return DEFAULT_SERVER_URL;
}

function setServerUrl(rawUrl) {
  const normalized = normalizeServerUrl(rawUrl);
  const current = readJsonSafe(userDataFile('config.json'), {});
  const next = (current && typeof current === 'object' && !Array.isArray(current))
    ? { ...current, serverUrl: normalized }
    : { serverUrl: normalized };
  writeFileAtomic(userDataFile('config.json'), JSON.stringify(next, null, 2));
  return normalized;
}

function readAuth() {
  const data = readJsonSafe(userDataFile('auth.json'), null);
  if (!data || typeof data !== 'object' || typeof data.token !== 'string' || !data.token) {
    return { token: null, user: null };
  }
  const user = (data.user && typeof data.user === 'object') ? data.user : null;
  if (data.encrypted === true) {
    if (!safeStorage.isEncryptionAvailable()) {
      return { token: null, user: null };
    }
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(data.token, 'base64'));
      return decrypted ? { token: decrypted, user } : { token: null, user: null };
    } catch {
      return { token: null, user: null };
    }
  }
  if (data.encrypted === false) {
    return { token: data.token, user };
  }
  return { token: null, user: null };
}

function saveAuth(token, user) {
  if (typeof token !== 'string' || !token) {
    throw new Error('Cannot store empty auth token.');
  }
  const cleanUser = (user && typeof user === 'object') ? user : null;
  const canEncrypt = safeStorage.isEncryptionAvailable();
  const payload = canEncrypt
    ? {
        encrypted: true,
        token: safeStorage.encryptString(token).toString('base64'),
        user: cleanUser,
        savedAt: Date.now(),
      }
    : {
        encrypted: false,
        fallback: 'safeStorage-unavailable',
        token,
        user: cleanUser,
        savedAt: Date.now(),
      };
  writeFileAtomic(userDataFile('auth.json'), JSON.stringify(payload, null, 2));
}

function clearAuth() {
  fs.rmSync(userDataFile('auth.json'), { force: true });
  return { ok: true };
}

function normalizeSpotifyPort(rawPort) {
  if (rawPort === undefined || rawPort === null || rawPort === '') {
    return DEFAULT_SPOTIFY_PORT;
  }
  const num = Number(rawPort);
  if (Number.isInteger(num) && num >= 1024 && num <= 65535) {
    return num;
  }
  return DEFAULT_SPOTIFY_PORT;
}

function redirectUriForPort(port) {
  const validPort = normalizeSpotifyPort(port);
  return `http://127.0.0.1:${validPort}/spotify/callback`;
}

function getSpotifyConfig() {
  const cfg = readJsonSafe(userDataFile('config.json'), null);
  const savedClientId = (cfg && typeof cfg.spotifyClientId === 'string')
    ? cfg.spotifyClientId.trim()
    : '';
  const envClientId = String(process.env.SPOTIFY_CLIENT_ID || '').trim();
  const port = normalizeSpotifyPort(cfg && cfg.spotifyPort);
  return {
    clientId: savedClientId || envClientId,
    savedClientId,
    port,
    redirectUri: redirectUriForPort(port),
  };
}

function setSpotifyConfig(opts = {}) {
  const current = readJsonSafe(userDataFile('config.json'), {});
  const base = (current && typeof current === 'object' && !Array.isArray(current)) ? current : {};
  const hasClientId = opts && Object.prototype.hasOwnProperty.call(opts, 'clientId') && opts.clientId !== undefined;
  const hasPort = opts && Object.prototype.hasOwnProperty.call(opts, 'port') && opts.port !== undefined;
  const nextClientId = hasClientId
    ? String(opts.clientId ?? '').trim()
    : (typeof base.spotifyClientId === 'string' ? base.spotifyClientId.trim() : '');
  const nextPort = hasPort
    ? normalizeSpotifyPort(opts.port)
    : normalizeSpotifyPort(base.spotifyPort);
  const next = {
    ...base,
    spotifyClientId: nextClientId,
    spotifyPort: nextPort,
  };
  writeFileAtomic(userDataFile('config.json'), JSON.stringify(next, null, 2));
  return {
    ok: true,
    clientId: nextClientId,
    port: nextPort,
    redirectUri: redirectUriForPort(nextPort),
  };
}

function readSpotifyAuth() {
  const empty = {
    accessToken: null,
    refreshToken: null,
    expiresAt: 0,
    scope: '',
    clientId: '',
    user: null,
  };
  const data = readJsonSafe(userDataFile('spotify-auth.json'), null);
  if (!data || typeof data !== 'object') {
    return empty;
  }

  const meta = {
    expiresAt: Number.isFinite(Number(data.expiresAt)) ? Number(data.expiresAt) : 0,
    scope: typeof data.scope === 'string' ? data.scope : '',
    clientId: typeof data.clientId === 'string' ? data.clientId.trim() : '',
    user: (data.user && typeof data.user === 'object') ? data.user : null,
  };

  if (data.encrypted === true) {
    if (!safeStorage.isEncryptionAvailable() || typeof data.secrets !== 'string' || !data.secrets) {
      return empty;
    }
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(data.secrets, 'base64'));
      const parsed = JSON.parse(decrypted);
      if (!parsed || typeof parsed.accessToken !== 'string' || !parsed.accessToken) {
        return empty;
      }
      return {
        ...meta,
        accessToken: parsed.accessToken,
        refreshToken: typeof parsed.refreshToken === 'string' && parsed.refreshToken ? parsed.refreshToken : null,
      };
    } catch {
      return empty;
    }
  }

  if (data.encrypted === false) {
    const accessToken = typeof data.accessToken === 'string' && data.accessToken ? data.accessToken : null;
    if (!accessToken) {
      return empty;
    }
    return {
      ...meta,
      accessToken,
      refreshToken: typeof data.refreshToken === 'string' && data.refreshToken ? data.refreshToken : null,
    };
  }

  return empty;
}

function saveSpotifyAuth({ accessToken, refreshToken, expiresAt, scope, clientId, user }) {
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Cannot store empty Spotify access token.');
  }
  const cleanUser = (user && typeof user === 'object') ? user : null;
  const cleanExpiresAt = Number.isFinite(Number(expiresAt)) ? Number(expiresAt) : 0;
  const cleanScope = typeof scope === 'string' ? scope : '';
  const cleanClientId = typeof clientId === 'string' ? clientId.trim() : '';
  const cleanRefreshToken = typeof refreshToken === 'string' && refreshToken ? refreshToken : null;

  const canEncrypt = safeStorage.isEncryptionAvailable();
  const payload = canEncrypt
    ? {
        encrypted: true,
        secrets: safeStorage.encryptString(JSON.stringify({
          accessToken,
          refreshToken: cleanRefreshToken,
        })).toString('base64'),
        expiresAt: cleanExpiresAt,
        scope: cleanScope,
        clientId: cleanClientId,
        user: cleanUser,
        savedAt: Date.now(),
      }
    : {
        encrypted: false,
        fallback: 'safeStorage-unavailable',
        accessToken,
        refreshToken: cleanRefreshToken,
        expiresAt: cleanExpiresAt,
        scope: cleanScope,
        clientId: cleanClientId,
        user: cleanUser,
        savedAt: Date.now(),
      };
  writeFileAtomic(userDataFile('spotify-auth.json'), JSON.stringify(payload, null, 2));
}

function clearSpotifyAuth() {
  fs.rmSync(userDataFile('spotify-auth.json'), { force: true });
  return { ok: true };
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function resolveWithin(rootDir, relPosixPath) {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(root, relPosixPath);
  const rel = path.relative(root, candidate);
  if (!rel && relPosixPath !== '') return null;
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return candidate;
}

function isExistingFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function registerAppProtocol() {
  const appRoot = path.resolve(app.getAppPath());
  const unpackedRoot = app.isPackaged && process.resourcesPath
    ? path.resolve(process.resourcesPath, 'app.asar.unpacked')
    : null;

  protocol.handle('app', (req) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    if (parsedUrl.protocol !== 'app:' || parsedUrl.hostname !== 'slopitaire') {
      return new Response('Not Found', { status: 404 });
    }

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(parsedUrl.pathname || '/');
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    if (decodedPath.includes('\0') || decodedPath.includes('\\')) {
      return new Response('Forbidden', { status: 403 });
    }

    const rawSegments = decodedPath.replace(/^\/+/, '').split('/');
    if (rawSegments.some((seg) => seg === '..')) {
      return new Response('Forbidden', { status: 403 });
    }

    let relPath = rawSegments.filter((seg) => seg && seg !== '.').join('/');
    if (!relPath) relPath = 'index.html';

    let targetFile = null;
    if (relPath.startsWith('audio/') && unpackedRoot) {
      const unpackedCandidate = resolveWithin(unpackedRoot, relPath);
      if (unpackedCandidate && isExistingFile(unpackedCandidate)) {
        targetFile = unpackedCandidate;
      }
    }

    if (!targetFile) {
      const appCandidate = resolveWithin(appRoot, relPath);
      if (appCandidate && isExistingFile(appCandidate)) {
        targetFile = appCandidate;
      }
    }

    if (!targetFile) {
      return new Response('Not Found', { status: 404 });
    }

    return net.fetch(pathToFileURL(targetFile).toString(), {
      method: req.method,
      headers: req.headers,
    });
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCallbackPage({ ok, title, message }) {
  const accent = ok ? '#2ce8a2' : '#ff5c8a';
  const badge = ok ? '◈ LINK ESTABLISHED' : '✕ LINK INTERRUPTED';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Slopitaire // PRISM</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at 20% 15%, rgba(44, 232, 162, 0.14), transparent 45%),
        radial-gradient(circle at 80% 85%, rgba(255, 182, 56, 0.11), transparent 48%),
        #0a131a;
      color: #eaf7f3;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    }
    .card {
      width: min(460px, 100%);
      padding: 28px 26px;
      border-radius: 16px;
      background: rgba(15, 31, 43, 0.94);
      border: 1px solid ${accent};
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55), 0 0 28px rgba(44, 232, 162, 0.12);
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: ${accent};
      border: 1px solid ${accent};
      background: rgba(10, 19, 26, 0.72);
      margin-bottom: 14px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    p {
      margin: 0 0 18px;
      font-size: 14px;
      line-height: 1.55;
      color: #b4d0da;
    }
    .hint {
      font-size: 12px;
      color: #7ca0ae;
      margin: 0;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">${badge}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p class="hint">You can close this browser tab and return to Slopitaire // PRISM.</p>
  </main>
  <script>
    if (${ok ? 'true' : 'false'}) {
      setTimeout(() => { try { window.close(); } catch {} }, 1200);
    }
  </script>
</body>
</html>`;
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible() && !isSmokeTest) mainWindow.show();
  mainWindow.focus();
}

function closeLoopbackEntry(entry, reason) {
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  try {
    entry.server.close();
    entry.server.closeAllConnections?.();
  } catch {}
  if (reason && entry.cancel) {
    entry.cancel(new Error(reason));
  }
}

function closeActiveLoopback(reason) {
  if (!activeLoopback) return;
  const current = activeLoopback;
  activeLoopback = null;
  closeLoopbackEntry(current, reason);
}

function closeActiveSpotifyLoopback(reason) {
  if (!activeSpotifyLoopback) return;
  const current = activeSpotifyLoopback;
  activeSpotifyLoopback = null;
  closeLoopbackEntry(current, reason);
}

async function runDesktopGoogleSignIn(serverUrlArg) {
  closeActiveLoopback('Cancelled by a newer Google sign-in request.');

  const baseServerUrl = (typeof serverUrlArg === 'string' && serverUrlArg.trim())
    ? normalizeServerUrl(serverUrlArg)
    : getServerUrl();

  const ticket = await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      if (activeLoopback && activeLoopback.server === server) {
        if (activeLoopback.timer) clearTimeout(activeLoopback.timer);
        activeLoopback = null;
      }
      try {
        server.close();
        const closeTimer = setTimeout(() => {
          try {
            server.closeAllConnections?.();
          } catch {}
        }, 150);
        if (typeof closeTimer.unref === 'function') closeTimer.unref();
      } catch {}
      if (err) reject(err);
      else resolve(val);
    };

    const server = http.createServer((req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
        res.end('Method Not Allowed');
        return;
      }

      let reqUrl;
      try {
        reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
        res.end('Bad Request');
        return;
      }

      if (reqUrl.pathname === '/favicon.ico') {
        res.writeHead(204, { Connection: 'close' });
        res.end();
        return;
      }

      if (reqUrl.pathname !== '/auth/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
        res.end('Not Found');
        return;
      }

      const authError = reqUrl.searchParams.get('error');
      const authErrorDesc = reqUrl.searchParams.get('error_description');
      const authTicket = reqUrl.searchParams.get('ticket');

      if (authError || !authTicket) {
        const msg = authErrorDesc || authError || 'Google sign-in did not return an authorization ticket.';
        const html = renderCallbackPage({
          ok: false,
          title: 'Google Sign-In Failed',
          message: msg,
        });
        res.writeHead(400, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'close',
        });
        res.end(html, () => {
          focusMainWindow();
          finish(new Error(msg));
        });
        return;
      }

      const html = renderCallbackPage({
        ok: true,
        title: 'Signed In to Slopitaire',
        message: 'Google authentication succeeded. Syncing your Prism profile back to the desktop app.',
      });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'close',
      });
      res.end(html, () => {
        finish(null, authTicket);
      });
    });

    server.once('error', (err) => {
      finish(new Error(`Loopback listener failed: ${err.message}`));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr !== 'object') {
        finish(new Error('Failed to bind local OAuth callback port.'));
        return;
      }
      const callbackUrl = `http://127.0.0.1:${addr.port}/auth/callback`;
      const startUrl = `${baseServerUrl}/api/auth/google/start?mode=desktop&desktop_redirect=${encodeURIComponent(callbackUrl)}`;

      const timer = setTimeout(() => {
        finish(new Error('Google sign-in timed out after 120 seconds.'));
      }, SIGNIN_TIMEOUT_MS);
      if (typeof timer.unref === 'function') timer.unref();

      activeLoopback = {
        server,
        timer,
        cancel: (err) => finish(err),
      };

      shell.openExternal(startUrl).catch((err) => {
        finish(new Error(`Could not open system browser: ${err.message}`));
      });
    });
  });

  const exchangeRes = await fetch(`${baseServerUrl}/api/auth/token-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
    signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
  });

  let payload = null;
  try {
    payload = await exchangeRes.json();
  } catch {
    throw new Error(`Invalid response from sync server (${exchangeRes.status}).`);
  }

  if (!exchangeRes.ok || !payload || !payload.ok || !payload.token) {
    throw new Error(payload?.error || `Token exchange failed (${exchangeRes.status}).`);
  }

  saveAuth(payload.token, payload.user || null);
  focusMainWindow();

  return {
    ok: true,
    token: payload.token,
    user: payload.user || null,
    progress: payload.progress || null,
  };
}

async function fetchSpotifyProfile(accessToken) {
  try {
    const res = await fetch(SPOTIFY_ME_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    const id = typeof data.id === 'string' ? data.id : '';
    const displayName = typeof data.display_name === 'string' && data.display_name.trim()
      ? data.display_name.trim()
      : (id || 'Spotify User');
    return {
      id,
      display_name: displayName,
      email: typeof data.email === 'string' ? data.email : '',
      product: typeof data.product === 'string' ? data.product : '',
      country: typeof data.country === 'string' ? data.country : '',
      images: Array.isArray(data.images) ? data.images : [],
    };
  } catch {
    return null;
  }
}

async function runDesktopSpotifySignIn(opts = {}) {
  closeActiveSpotifyLoopback('Cancelled by a newer Spotify sign-in request.');

  const cfg = getSpotifyConfig();
  const resolvedClientId = (typeof opts?.clientId === 'string' && opts.clientId.trim())
    ? opts.clientId.trim()
    : cfg.clientId;
  if (!resolvedClientId) {
    throw new Error('Spotify Client ID is required. Enter your Spotify App Client ID in Setup or set SPOTIFY_CLIENT_ID.');
  }

  const port = opts?.port !== undefined ? normalizeSpotifyPort(opts.port) : cfg.port;
  const redirectUri = redirectUriForPort(port);
  const scopes = (typeof opts?.scopes === 'string' && opts.scopes.trim())
    ? opts.scopes.trim()
    : (Array.isArray(opts?.scopes) && opts.scopes.length ? opts.scopes.join(' ') : DEFAULT_SPOTIFY_SCOPES);

  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
  const expectedState = crypto.randomBytes(24).toString('base64url');

  const code = await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      if (activeSpotifyLoopback && activeSpotifyLoopback.server === server) {
        if (activeSpotifyLoopback.timer) clearTimeout(activeSpotifyLoopback.timer);
        activeSpotifyLoopback = null;
      }
      try {
        server.close();
        const closeTimer = setTimeout(() => {
          try {
            server.closeAllConnections?.();
          } catch {}
        }, 150);
        if (typeof closeTimer.unref === 'function') closeTimer.unref();
      } catch {}
      if (err) reject(err);
      else resolve(val);
    };

    const server = http.createServer((req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
        res.end('Method Not Allowed');
        return;
      }

      let reqUrl;
      try {
        reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
        res.end('Bad Request');
        return;
      }

      if (reqUrl.pathname === '/favicon.ico') {
        res.writeHead(204, { Connection: 'close' });
        res.end();
        return;
      }

      if (reqUrl.pathname !== '/spotify/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
        res.end('Not Found');
        return;
      }

      const returnedState = reqUrl.searchParams.get('state') || '';
      if (!returnedState || !timingSafeEqualStr(returnedState, expectedState)) {
        const html = renderCallbackPage({
          ok: false,
          title: 'Spotify State Mismatch',
          message: 'Spotify OAuth state verification failed. Please retry signing in from Slopitaire.',
        });
        res.writeHead(400, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'close',
        });
        res.end(html, () => {
          focusMainWindow();
          finish(new Error('Spotify OAuth state mismatch.'));
        });
        return;
      }

      const authError = reqUrl.searchParams.get('error');
      const authErrorDesc = reqUrl.searchParams.get('error_description');
      const authCode = reqUrl.searchParams.get('code');

      if (authError || !authCode) {
        const msg = authErrorDesc || authError || 'Spotify sign-in did not return an authorization code.';
        const html = renderCallbackPage({
          ok: false,
          title: 'Spotify Sign-In Cancelled',
          message: msg,
        });
        res.writeHead(400, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'close',
        });
        res.end(html, () => {
          focusMainWindow();
          finish(new Error(msg));
        });
        return;
      }

      const html = renderCallbackPage({
        ok: true,
        title: 'Spotify Connected',
        message: 'Spotify authorization succeeded. Linking your music deck back to Slopitaire // PRISM.',
      });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'close',
      });
      res.end(html, () => {
        finish(null, authCode);
      });
    });

    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        finish(new Error(`Port ${port} is already in use. Close the conflicting app or change the Spotify port in Setup.`));
        return;
      }
      finish(new Error(`Spotify loopback listener failed: ${err.message}`));
    });

    server.listen(port, '127.0.0.1', () => {
      const authUrl = new URL(SPOTIFY_AUTH_ENDPOINT);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', resolvedClientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('state', expectedState);
      authUrl.searchParams.set('scope', scopes);

      const timer = setTimeout(() => {
        finish(new Error('Spotify sign-in timed out after 120 seconds.'));
      }, SIGNIN_TIMEOUT_MS);
      if (typeof timer.unref === 'function') timer.unref();

      activeSpotifyLoopback = {
        server,
        timer,
        cancel: (err) => finish(err),
      };

      shell.openExternal(authUrl.toString()).catch((err) => {
        finish(new Error(`Could not open system browser: ${err.message}`));
      });
    });
  });

  const tokenRes = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: resolvedClientId,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
  });

  let tokenBody = null;
  try {
    tokenBody = await tokenRes.json();
  } catch {
    tokenBody = null;
  }

  if (!tokenRes.ok || !tokenBody || !tokenBody.access_token) {
    throw new Error(tokenBody?.error_description || tokenBody?.error || `Spotify token exchange failed (${tokenRes.status}).`);
  }

  const accessToken = tokenBody.access_token;
  const expiresInSec = Math.max(60, Number(tokenBody.expires_in) || 3600);
  const expiresAt = Date.now() + expiresInSec * 1000;
  const scope = typeof tokenBody.scope === 'string' && tokenBody.scope ? tokenBody.scope : scopes;
  const user = await fetchSpotifyProfile(accessToken);

  saveSpotifyAuth({
    accessToken,
    refreshToken: typeof tokenBody.refresh_token === 'string' ? tokenBody.refresh_token : null,
    expiresAt,
    scope,
    clientId: resolvedClientId,
    user,
  });
  focusMainWindow();

  return {
    ok: true,
    clientId: resolvedClientId,
    accessToken,
    expiresAt,
    scope,
    user,
  };
}

async function refreshDesktopSpotifyToken() {
  if (activeSpotifyRefreshPromise) {
    return activeSpotifyRefreshPromise;
  }

  activeSpotifyRefreshPromise = (async () => {
    const stored = readSpotifyAuth();
    const cfg = getSpotifyConfig();
    const clientId = stored.clientId || cfg.clientId;
    if (!stored.refreshToken) {
      throw new Error('No Spotify refresh token stored. Please sign in again.');
    }
    if (!clientId) {
      throw new Error('Spotify Client ID is missing. Please configure it in Setup.');
    }

    const res = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken,
        client_id: clientId,
      }),
      signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok || !body || !body.access_token) {
      const errCode = body?.error || '';
      if (errCode === 'invalid_grant') {
        clearSpotifyAuth();
      }
      throw new Error(body?.error_description || errCode || `Spotify token refresh failed (${res.status}).`);
    }

    const accessToken = body.access_token;
    const refreshToken = (typeof body.refresh_token === 'string' && body.refresh_token)
      ? body.refresh_token
      : stored.refreshToken;
    const expiresInSec = Math.max(60, Number(body.expires_in) || 3600);
    const expiresAt = Date.now() + expiresInSec * 1000;
    const scope = typeof body.scope === 'string' && body.scope ? body.scope : stored.scope;
    const user = stored.user || await fetchSpotifyProfile(accessToken);

    saveSpotifyAuth({
      accessToken,
      refreshToken,
      expiresAt,
      scope,
      clientId,
      user,
    });

    return {
      ok: true,
      accessToken,
      expiresAt,
      scope,
      user,
    };
  })();

  try {
    return await activeSpotifyRefreshPromise;
  } finally {
    activeSpotifyRefreshPromise = null;
  }
}

function registerIpcHandlers() {
  ipcMain.handle('slop:get-config', () => {
    const serverUrl = getServerUrl();
    const auth = readAuth();
    return {
      serverUrl,
      token: auth.token,
      user: auth.user,
    };
  });

  ipcMain.handle('slop:set-server-url', (_event, url) => {
    return setServerUrl(url);
  });

  ipcMain.handle('slop:google-signin', (_event, serverUrl) => {
    return runDesktopGoogleSignIn(serverUrl);
  });

  ipcMain.handle('slop:clear-auth', () => {
    return clearAuth();
  });

  ipcMain.handle('slop:load-local-backup', () => {
    return readJsonSafe(userDataFile('progress-backup.json'), null);
  });

  ipcMain.handle('slop:save-local-backup', (_event, data) => {
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Local backup payload must be an object.');
    }
    writeFileAtomic(userDataFile('progress-backup.json'), JSON.stringify(data));
    return { ok: true };
  });

  ipcMain.handle('slop:spotify-get-state', () => {
    const cfg = getSpotifyConfig();
    const auth = readSpotifyAuth();
    return {
      clientId: cfg.clientId || auth.clientId || '',
      port: cfg.port,
      redirectUri: cfg.redirectUri,
      accessToken: auth.accessToken,
      expiresAt: auth.expiresAt,
      hasRefreshToken: Boolean(auth.refreshToken),
      user: auth.user,
    };
  });

  ipcMain.handle('slop:spotify-set-config', (_event, cfg) => {
    return setSpotifyConfig(cfg || {});
  });

  ipcMain.handle('slop:spotify-signin', (_event, opts) => {
    return runDesktopSpotifySignIn(opts || {});
  });

  ipcMain.handle('slop:spotify-refresh', () => {
    return refreshDesktopSpotifyToken();
  });

  ipcMain.handle('slop:spotify-clear-auth', () => {
    return clearSpotifyAuth();
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: '#0a131a',
    title: 'Slopitaire // PRISM',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  if (!isSmokeTest) {
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.show();
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(parsed.toString());
      }
    } catch {}
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'app:' && parsed.hostname === 'slopitaire') return;
      event.preventDefault();
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(parsed.toString());
      }
    } catch {
      event.preventDefault();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  mainWindow = win;
  return win;
}

function runSmokeTest(win) {
  let finished = false;
  const smokeErrors = [];
  let pollTimer = null;
  const startedAt = Date.now();

  const fail = (reason, extra) => {
    if (finished) return;
    finished = true;
    if (pollTimer) clearTimeout(pollTimer);
    console.error('ELECTRON_SMOKE_FAIL', reason, extra || '');
    app.exit(1);
  };

  win.webContents.on('did-fail-load', (_ev, code, desc, url, isMainFrame) => {
    if (isMainFrame) {
      fail(`did-fail-load (${code}): ${desc} @ ${url}`);
    }
  });

  win.webContents.on('render-process-gone', (_ev, details) => {
    fail(`render-process-gone: ${details?.reason || 'unknown'}`);
  });

  win.webContents.on('console-message', (details) => {
    const level = details?.level;
    const isError = level === 'error' || level === 3;
    if (!isError) return;
    const message = details?.message ?? '';
    const sourceId = details?.sourceId ?? '';
    const line = details?.lineNumber ?? 0;
    smokeErrors.push({ message, sourceId, line });
  });

  const poll = async () => {
    if (finished) return;
    if (smokeErrors.length > 0) {
      fail('renderer console error', JSON.stringify(smokeErrors));
      return;
    }
    try {
      const state = await win.webContents.executeJavaScript(`(() => {
        const cards = document.querySelectorAll('.card').length;
        const hasSolver = (typeof Solver !== 'undefined' && !!Solver) || !!window.Solver;
        const hasCast = (typeof Cast !== 'undefined' && !!Cast) || !!window.Cast;
        const hasAccount = (typeof Account !== 'undefined' && !!Account) || !!window.Account;
        const hasDesktop = !!window.slopDesktop && window.slopDesktop.isElectron === true;
        // 'files' when the pre-rendered soundtrack loaded over app://, 'synth' if it fell back to live synthesis
        const music = (typeof Sound !== 'undefined' && Sound.musicState) ? Sound.musicState().mode : 'missing';
        // 'files' when every pre-rendered sound effect decoded, 'partial' / 'synth' when some or all fell back
        const sfx = (typeof Sound !== 'undefined' && Sound.sfxState) ? Sound.sfxState().mode : 'missing';
        return {
          ready: cards === 104 && hasSolver && hasCast && hasDesktop && music !== 'loading' && sfx !== 'loading',
          music,
          sfx,
          cards,
          hasSolver,
          hasCast,
          hasAccount,
          hasDesktop,
          origin: location.origin,
        };
      })()`, true);

      if (smokeErrors.length > 0) {
        fail('renderer console error', JSON.stringify(smokeErrors));
        return;
      }

      if (state && state.ready) {
        finished = true;
        const summary = {
          cards: state.cards,
          hasSolver: state.hasSolver,
          hasCast: state.hasCast,
          hasAccount: state.hasAccount,
          hasDesktop: state.hasDesktop,
          music: state.music,
          sfx: state.sfx,
          origin: state.origin,
        };
        console.log('ELECTRON_SMOKE_OK ' + JSON.stringify(summary));
        app.quit();
        return;
      }

      if (Date.now() - startedAt >= SMOKE_TIMEOUT_MS) {
        fail('timeout waiting for app readiness', JSON.stringify({ state, smokeErrors }));
        return;
      }
    } catch (err) {
      if (Date.now() - startedAt >= SMOKE_TIMEOUT_MS) {
        fail(`executeJavaScript error: ${err.message}`, JSON.stringify(smokeErrors));
        return;
      }
    }

    pollTimer = setTimeout(poll, SMOKE_POLL_MS);
  };

  win.loadURL('app://slopitaire/index.html?debug').catch((err) => {
    fail(`loadURL rejected: ${err.message}`);
  });
  pollTimer = setTimeout(poll, SMOKE_POLL_MS);
}

app.whenReady().then(() => {
  registerAppProtocol();
  registerIpcHandlers();

  const win = createMainWindow();
  if (isSmokeTest) {
    runSmokeTest(win);
  } else {
    win.loadURL('app://slopitaire/index.html');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const recreated = createMainWindow();
      recreated.loadURL('app://slopitaire/index.html');
    }
  });
});

app.on('will-quit', () => {
  closeActiveLoopback('Application shutting down.');
  closeActiveSpotifyLoopback('Application shutting down.');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
