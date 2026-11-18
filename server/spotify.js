'use strict';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

function sendHtml(res, statusCode, html, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(html);
}

function normalizeLoopbackOrigin(origin) {
  return String(origin || '').replace(/^http:\/\/localhost(?=(?::\d+)?(?:\/|$))/i, 'http://127.0.0.1');
}

function getRequestOrigin(req, cfg) {
  if (cfg.publicBaseUrl) {
    return cfg.publicBaseUrl;
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = forwardedProto === 'https' || forwardedProto === 'http'
    ? forwardedProto
    : (req.socket && req.socket.encrypted ? 'https' : 'http');
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1:3000').split(',')[0].trim();
  const safeHost = /^[a-zA-Z0-9.:[\]-]+$/.test(rawHost) ? rawHost : '127.0.0.1:3000';
  return `${proto}://${safeHost}`;
}

function resolveRedirectUri(req, cfg) {
  if (cfg.spotifyRedirectUri) {
    return cfg.spotifyRedirectUri;
  }
  const normalizedOrigin = normalizeLoopbackOrigin(getRequestOrigin(req, cfg)).replace(/\/+$/, '');
  return `${normalizedOrigin}/api/spotify/callback`;
}

function renderSpotifyCallbackPage(payload) {
  const ok = payload.ok;
  const accent = ok ? '#1ed760' : '#ff6b8b';
  const badge = ok ? '◈ SPOTIFY LINKED' : '✕ SPOTIFY AUTH INTERRUPTED';
  const title = ok ? 'Spotify Connected' : 'Spotify Sign-In Failed';
  const heading = ok ? 'Spotify authorization received' : 'Spotify sign-in did not complete';
  const message = ok
    ? 'Returning your Spotify authorization to Slopitaire // PRISM. Popups close automatically.'
    : `Spotify returned an error: ${payload.error}`;

  const safePayload = safeInlineJson(payload);
  const inlineScript = `
    (function () {
      var payload = ${safePayload};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, window.location.origin);
        }
      } catch (e) {}
      try {
        if (typeof BroadcastChannel === 'function') {
          var ch = new BroadcastChannel('slopitaire-spotify');
          ch.postMessage(payload);
          ch.close();
        }
      } catch (e) {}
      try {
        localStorage.setItem('slopitaire.spotifyAuthResult', JSON.stringify(Object.assign({}, payload, { ts: Date.now() })));
      } catch (e) {}
      var hasOpener = false;
      try {
        hasOpener = Boolean(window.opener && !window.opener.closed);
      } catch (e) {}
      if (hasOpener) {
        var backLink = document.getElementById('spBackLink');
        var closeBtn = document.getElementById('spCloseBtn');
        if (backLink) backLink.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'inline-flex';
        setTimeout(function () {
          try { window.close(); } catch (e) {}
        }, 900);
      }
    })();
  `;

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
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #ecf8f5;
      background:
        radial-gradient(circle at 20% 20%, rgba(30, 215, 96, 0.16), transparent 45%),
        radial-gradient(circle at 80% 80%, rgba(44, 232, 162, 0.14), transparent 45%),
        linear-gradient(155deg, #0a131a 0%, #122330 100%);
    }
    .card {
      width: min(460px, 100%);
      background: rgba(12, 24, 34, 0.94);
      border: 1px solid rgba(44, 232, 162, 0.32);
      border-top: 3px solid ${accent};
      border-radius: 18px;
      padding: 28px 26px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${accent};
      border: 1px solid ${accent};
      background: rgba(10, 19, 26, 0.72);
      margin-bottom: 14px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
      line-height: 1.25;
      color: #ecf8f5;
    }
    p {
      margin: 0 0 16px;
      font-size: 14px;
      line-height: 1.55;
      color: rgba(236, 248, 245, 0.85);
    }
    .actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 18px;
      border-radius: 10px;
      border: 1px solid rgba(30, 215, 96, 0.45);
      background: rgba(30, 215, 96, 0.16);
      color: #ecf8f5;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
    }
    .btn:hover { background: rgba(30, 215, 96, 0.28); }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">${badge}</div>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    <div class="actions">
      <a id="spBackLink" class="btn" href="/">Back to Slopitaire</a>
      <button id="spCloseBtn" type="button" class="btn" style="display:none" onclick="window.close()">Close window</button>
    </div>
  </main>
  <script>${inlineScript}</script>
</body>
</html>`;
}

/**
 * Create the HTTP request handler for Spotify configuration and OAuth PKCE callbacks.
 */
function createSpotifyHandler(configOverrides = {}) {
  function getConfig() {
    return {
      spotifyClientId: String(configOverrides.spotifyClientId ?? configOverrides.clientId ?? process.env.SPOTIFY_CLIENT_ID ?? '').trim(),
      spotifyRedirectUri: String(configOverrides.spotifyRedirectUri ?? configOverrides.redirectUri ?? process.env.SPOTIFY_REDIRECT_URI ?? '').trim(),
      publicBaseUrl: String(configOverrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    };
  }

  async function handleRequest(req, res, url) {
    const pathname = url.pathname;
    const method = req.method.toUpperCase();
    const cfg = getConfig();

    if (method === 'GET' && pathname === '/api/spotify/config') {
      const clientId = cfg.spotifyClientId;
      const redirectUri = resolveRedirectUri(req, cfg);
      sendJson(res, 200, {
        ok: true,
        configured: Boolean(clientId),
        clientId: clientId || '',
        redirectUri,
      });
      return true;
    }

    if (method === 'GET' && pathname === '/api/spotify/callback') {
      const code = url.searchParams.get('code') || '';
      const state = url.searchParams.get('state') || '';
      const error = url.searchParams.get('error') || '';
      const payload = {
        type: 'slopitaire:spotify-callback',
        ok: Boolean(code && !error),
        code: code || '',
        state: state || '',
        error: error || (code ? '' : 'Missing authorization code'),
      };
      sendHtml(res, 200, renderSpotifyCallbackPage(payload));
      return true;
    }

    return false;
  }

  return {
    handleRequest,
    getConfig,
    resolveRedirectUri: (req) => resolveRedirectUri(req, getConfig()),
  };
}

module.exports = {
  createSpotifyHandler,
  safeInlineJson,
  normalizeLoopbackOrigin,
};
