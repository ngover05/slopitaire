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
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEFAULT_SERVER_URL = 'http://localhost:3000';
const SIGNIN_TIMEOUT_MS = 120000;
const TOKEN_EXCHANGE_TIMEOUT_MS = 15000;
const SMOKE_TIMEOUT_MS = 8000;
const SMOKE_POLL_MS = 100;

const isSmokeTest = process.argv.includes('--smoke-test');

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

function closeActiveLoopback(reason) {
  if (!activeLoopback) return;
  const current = activeLoopback;
  activeLoopback = null;
  if (current.timer) clearTimeout(current.timer);
  try {
    current.server.close();
    current.server.closeAllConnections?.();
  } catch {}
  if (reason && current.cancel) {
    current.cancel(new Error(reason));
  }
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
        return {
          ready: cards === 104 && hasSolver && hasCast && hasDesktop,
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
