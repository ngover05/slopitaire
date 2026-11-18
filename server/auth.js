'use strict';

const crypto = require('node:crypto');
const { mergeProgress, MergeValidationError } = require('./merge');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TICKET_TTL_MS = 60 * 1000; // 60 seconds
const MAX_PROGRESS_BODY_BYTES = 512 * 1024; // 512 KB
const MAX_SMALL_BODY_BYTES = 16 * 1024; // 16 KB
const DEFAULT_JWKS_CACHE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_JWKS_CACHE_MS = 60 * 60 * 1000; // 1 hour
const DESKTOP_REDIRECT_RE = /^http:\/\/127\.0\.0\.1:(\d{4,5})\/auth\/callback$/;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeInlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function parseCookies(cookieHeader) {
  const out = {};
  if (typeof cookieHeader !== 'string' || !cookieHeader.trim()) return out;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

function serializeCookie(name, value, opts = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) segments.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
  if (opts.httpOnly !== false) segments.push('HttpOnly');
  if (opts.sameSite) segments.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) segments.push('Secure');
  return segments.join('; ');
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        req.pause();
        fail(new HttpError(413, 'Request body exceeds size limit'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Invalid JSON request body'));
      }
    });

    req.on('error', (err) => fail(new HttpError(400, err.message || 'Request stream error')));
    req.on('aborted', () => fail(new HttpError(400, 'Request aborted')));
  });
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

function sendRedirect(res, location, extraHeaders = {}) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end();
}

function acceptsJsonOnly(req) {
  const accept = String(req.headers.accept || '').toLowerCase();
  return accept.includes('application/json') && !accept.includes('text/html');
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

function isHttpsRequest(req, cfg) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (forwardedProto === 'https') return true;
  if (forwardedProto === 'http') return false;
  if (req.socket && req.socket.encrypted) return true;
  if (cfg.publicBaseUrl && cfg.publicBaseUrl.startsWith('https://')) return true;
  return false;
}

function resolveRedirectUri(req, cfg) {
  if (cfg.googleRedirectUri) return cfg.googleRedirectUri;
  return `${getRequestOrigin(req, cfg)}/api/auth/google/callback`;
}

function isValidReturnTo(value) {
  if (typeof value !== 'string' || !value.length) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  if (/[\x00-\x1f\x7f]/.test(value)) return false;
  return true;
}

function isValidDesktopRedirect(value) {
  if (typeof value !== 'string') return false;
  const match = DESKTOP_REDIRECT_RE.exec(value);
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function sanitizePublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture || null,
  };
}

function renderPrismPage({ title, heading, message, tone = 'emerald', detailHtml = '', actionHtml = '', script = '' }) {
  const accent = tone === 'amber' ? '#ffb638' : tone === 'danger' ? '#ff6b8b' : '#2ce8a2';
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
        radial-gradient(circle at 20% 20%, rgba(44, 232, 162, 0.16), transparent 45%),
        radial-gradient(circle at 80% 80%, rgba(255, 182, 56, 0.14), transparent 45%),
        linear-gradient(155deg, #0a131a 0%, #122330 100%);
    }
    .card {
      width: min(480px, 100%);
      background: rgba(12, 24, 34, 0.92);
      border: 1px solid rgba(44, 232, 162, 0.35);
      border-top: 3px solid ${accent};
      border-radius: 18px;
      padding: 28px 26px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    }
    .brand {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: ${accent};
      margin-bottom: 10px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
      line-height: 1.25;
      color: #ecf8f5;
    }
    p {
      margin: 0 0 14px;
      font-size: 14px;
      line-height: 1.55;
      color: rgba(236, 248, 245, 0.85);
    }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: rgba(19, 38, 52, 0.9);
      border: 1px solid rgba(44, 232, 162, 0.22);
      border-radius: 8px;
    }
    code { padding: 2px 6px; font-size: 12px; color: #2ce8a2; }
    pre {
      padding: 12px;
      margin: 12px 0 16px;
      font-size: 12px;
      line-height: 1.45;
      overflow-x: auto;
      color: #cfece4;
    }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 18px;
      border-radius: 10px;
      border: 1px solid rgba(44, 232, 162, 0.45);
      background: rgba(44, 232, 162, 0.16);
      color: #ecf8f5;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
    }
    .btn:hover { background: rgba(44, 232, 162, 0.28); }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">◈ Slopitaire // PRISM</div>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    ${detailHtml}
    ${actionHtml ? `<div class="actions">${actionHtml}</div>` : ''}
  </main>
  ${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

function createJwksVerifier() {
  const cache = new Map(); // uri -> { expiresAt, keys }

  function parseMaxAgeMs(cacheControl) {
    if (!cacheControl) return DEFAULT_JWKS_CACHE_MS;
    const match = /max-age=(\d+)/i.exec(cacheControl);
    if (!match) return DEFAULT_JWKS_CACHE_MS;
    const sec = Number(match[1]);
    if (!Number.isFinite(sec) || sec <= 0) return 0;
    return Math.min(MAX_JWKS_CACHE_MS, sec * 1000);
  }

  async function fetchJwks(jwksUri, forceRefresh = false) {
    const now = Date.now();
    const cached = cache.get(jwksUri);
    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached.keys;
    }

    let res;
    try {
      res = await fetch(jwksUri, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new HttpError(502, 'Failed to reach Google JWKS endpoint');
    }
    if (!res.ok) {
      throw new HttpError(502, `Failed to fetch Google JWKS (${res.status})`);
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.keys)) {
      throw new HttpError(502, 'Invalid JWKS response from Google');
    }
    const maxAgeMs = parseMaxAgeMs(res.headers.get('cache-control'));
    if (maxAgeMs > 0) {
      cache.set(jwksUri, { expiresAt: now + maxAgeMs, keys: data.keys });
    } else {
      cache.delete(jwksUri);
    }
    return data.keys;
  }

  async function verifyIdToken(idToken, cfg) {
    if (typeof idToken !== 'string') {
      throw new HttpError(401, 'Missing id_token');
    }
    const parts = idToken.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new HttpError(401, 'Malformed id_token JWT');
    }

    let header;
    let payload;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      throw new HttpError(401, 'Invalid id_token encoding');
    }

    if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
      throw new HttpError(401, 'Unsupported id_token algorithm or missing kid');
    }

    const findMatchingKey = (keys) => keys.find(
      (k) => k && k.kty === 'RSA' && k.kid === header.kid && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256')
    );

    let keys = await fetchJwks(cfg.googleJwksUri, false);
    let jwk = findMatchingKey(keys);
    if (!jwk) {
      keys = await fetchJwks(cfg.googleJwksUri, true);
      jwk = findMatchingKey(keys);
    }
    if (!jwk) {
      throw new HttpError(401, 'Unable to find matching Google signing key');
    }

    let publicKey;
    try {
      publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    } catch {
      throw new HttpError(401, 'Invalid Google JWK');
    }

    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    const signature = Buffer.from(parts[2], 'base64url');
    const verified = crypto.verify('RSA-SHA256', signingInput, publicKey, signature);
    if (!verified) {
      throw new HttpError(401, 'Invalid id_token signature');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!payload || !validIssuers.includes(payload.iss)) {
      throw new HttpError(401, 'Invalid id_token issuer');
    }
    if (payload.aud !== cfg.googleClientId) {
      throw new HttpError(401, 'Invalid id_token audience');
    }
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= nowSec - 30) {
      throw new HttpError(401, 'Expired id_token');
    }
    if (payload.email_verified !== true) {
      throw new HttpError(401, 'Google email is not verified');
    }
    if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new HttpError(401, 'Missing Google subject claim');
    }
    if (typeof payload.email !== 'string' || !payload.email.trim()) {
      throw new HttpError(401, 'Missing Google email claim');
    }

    const email = payload.email.trim();
    const name = typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : email.split('@')[0];
    const picture = typeof payload.picture === 'string' && /^https?:\/\//i.test(payload.picture)
      ? payload.picture
      : null;

    return {
      sub: payload.sub.trim(),
      email,
      name,
      picture,
    };
  }

  return { verifyIdToken };
}

function createAuthHandler(store, configOverrides = {}) {
  const jwksVerifier = createJwksVerifier();

  function getConfig() {
    return {
      googleClientId: String(configOverrides.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? '').trim(),
      googleClientSecret: String(configOverrides.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? '').trim(),
      googleRedirectUri: String(configOverrides.googleRedirectUri ?? process.env.GOOGLE_REDIRECT_URI ?? '').trim(),
      publicBaseUrl: String(configOverrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, ''),
      sessionSecret: String(configOverrides.sessionSecret ?? process.env.SESSION_SECRET ?? '').trim(),
      googleAuthEndpoint: String(configOverrides.googleAuthEndpoint ?? process.env.GOOGLE_AUTH_ENDPOINT ?? 'https://accounts.google.com/o/oauth2/v2/auth').trim(),
      googleTokenEndpoint: String(configOverrides.googleTokenEndpoint ?? process.env.GOOGLE_TOKEN_ENDPOINT ?? 'https://oauth2.googleapis.com/token').trim(),
      googleJwksUri: String(configOverrides.googleJwksUri ?? process.env.GOOGLE_JWKS_URI ?? 'https://www.googleapis.com/oauth2/v3/certs').trim(),
    };
  }

  function isOAuthConfigured(cfg) {
    return Boolean(cfg.googleClientId && cfg.googleClientSecret);
  }

  function resolveAuth(req) {
    const authHeader = String(req.headers.authorization || '');
    const bearerMatch = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
    const cookies = parseCookies(req.headers.cookie);
    const now = Date.now();

    let rawToken = null;
    let authType = null;
    if (bearerMatch) {
      rawToken = bearerMatch[1];
      authType = 'bearer';
    } else if (typeof cookies.slop_session === 'string' && cookies.slop_session.length > 0) {
      rawToken = cookies.slop_session;
      authType = 'cookie';
    }

    if (!rawToken) {
      return { auth: null, cookies };
    }

    const tokenHash = sha256Hex(rawToken);
    const row = store.stmts.getSessionWithUser.get(tokenHash, now);
    if (!row) {
      return { auth: null, cookies };
    }

    return {
      auth: {
        authType,
        tokenHash,
        user: {
          id: row.id,
          google_sub: row.google_sub,
          email: row.email,
          name: row.name,
          picture: row.picture || null,
        },
      },
      cookies,
    };
  }

  function requireCsrfIfCookie(req, auth) {
    if (auth && auth.authType === 'cookie') {
      if (String(req.headers['x-slopitaire-csrf'] || '') !== '1') {
        throw new HttpError(403, 'Missing required X-Slopitaire-CSRF header');
      }
    }
  }

  function buildPopupNotifyScript(payload, autoClose = false) {
    const safePayload = safeInlineJson(payload);
    return `
      (function () {
        var msg = ${safePayload};
        try {
          var ch = new BroadcastChannel('slopitaire-auth');
          ch.postMessage(msg);
          ch.close();
        } catch (e) {}
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(msg, window.location.origin);
          }
        } catch (e) {}
        try {
          localStorage.setItem('slopitaire.authPing', String(Date.now()));
        } catch (e) {}
        ${autoClose ? 'setTimeout(function () { try { window.close(); } catch (e) {} }, 120);' : ''}
      })();
    `;
  }

  function sendNotConfiguredResponse(req, res, cfg, mode) {
    const setupHint = 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable Google Sign-In.';
    if (acceptsJsonOnly(req)) {
      sendJson(res, 503, {
        ok: false,
        configured: false,
        provider: 'google',
        error: 'Google OAuth2 is not configured on this server.',
        setupHint,
      });
      return;
    }

    const callbackUrl = resolveRedirectUri(req, cfg);
    const script = mode === 'popup'
      ? buildPopupNotifyScript({ type: 'slopitaire:auth-complete', ok: false, error: 'not_configured' }, false)
      : '';

    const html = renderPrismPage({
      title: 'Google Sync Setup Required',
      heading: 'Google Sign-In is not configured yet',
      message: 'This Slopitaire server does not have Google OAuth2 credentials in its environment yet. Guest play continues to work normally with local saves.',
      tone: 'amber',
      detailHtml: `<p>To enable Google accounts and cloud sync, add these keys to <code>.env</code> and authorize the callback URL in Google Cloud Console:</p>
<pre>GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
# Authorized redirect URI:
${escapeHtml(callbackUrl)}</pre>`,
      actionHtml: mode === 'popup'
        ? '<button type="button" class="btn" onclick="window.close()">Close window</button>'
        : '<a class="btn" href="/">Back to Slopitaire</a>',
      script,
    });
    sendHtml(res, 503, html);
  }

  async function handleRequest(req, res, url) {
    const pathname = url.pathname;
    const method = req.method.toUpperCase();
    const cfg = getConfig();

    try {
      if (method === 'GET' && pathname === '/api/healthz') {
        sendJson(res, 200, { ok: true, oauthConfigured: isOAuthConfigured(cfg) });
        return true;
      }

      if (method === 'GET' && pathname === '/api/auth/status') {
        const configured = isOAuthConfigured(cfg);
        const { auth } = resolveAuth(req);
        const payload = {
          configured,
          provider: 'google',
          user: auth ? sanitizePublicUser(auth.user) : null,
          progress: auth ? store.getProgressForUser(auth.user.id) : null,
        };
        if (!configured) {
          payload.setupHint = 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable Google Sign-In.';
        }
        sendJson(res, 200, payload);
        return true;
      }

      if (method === 'GET' && pathname === '/api/auth/google/start') {
        const mode = url.searchParams.get('mode') || 'popup';
        if (!['popup', 'redirect', 'desktop'].includes(mode)) {
          throw new HttpError(400, 'Invalid auth mode');
        }

        if (!isOAuthConfigured(cfg)) {
          sendNotConfiguredResponse(req, res, cfg, mode);
          return true;
        }

        let desktopRedirect = null;
        if (mode === 'desktop') {
          const rawDesktopRedirect = url.searchParams.get('desktop_redirect') || '';
          if (!isValidDesktopRedirect(rawDesktopRedirect)) {
            throw new HttpError(400, 'Invalid desktop_redirect URL');
          }
          desktopRedirect = rawDesktopRedirect;
        }

        let returnTo = null;
        const rawReturnTo = url.searchParams.get('return_to');
        if (rawReturnTo !== null && rawReturnTo !== '') {
          if (!isValidReturnTo(rawReturnTo)) {
            throw new HttpError(400, 'Invalid return_to path');
          }
          returnTo = rawReturnTo;
        }

        const now = Date.now();
        store.pruneExpired(now);

        const state = crypto.randomBytes(32).toString('base64url');
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

        store.stmts.insertOAuthState.run(
          state,
          codeVerifier,
          mode,
          desktopRedirect,
          returnTo,
          now,
          now + STATE_TTL_MS
        );

        const redirectUri = resolveRedirectUri(req, cfg);
        const authUrl = new URL(cfg.googleAuthEndpoint);
        authUrl.searchParams.set('client_id', cfg.googleClientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid email profile');
        authUrl.searchParams.set('access_type', 'online');
        authUrl.searchParams.set('prompt', 'select_account');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        const https = isHttpsRequest(req, cfg);
        const stateCookie = serializeCookie('slop_oauth_state', state, {
          path: '/api/auth',
          maxAge: STATE_TTL_MS / 1000,
          httpOnly: true,
          sameSite: 'Lax',
          secure: https,
        });

        sendRedirect(res, authUrl.toString(), { 'Set-Cookie': stateCookie });
        return true;
      }

      if (method === 'GET' && pathname === '/api/auth/google/callback') {
        if (!isOAuthConfigured(cfg)) {
          sendNotConfiguredResponse(req, res, cfg, 'redirect');
          return true;
        }

        const https = isHttpsRequest(req, cfg);
        const clearStateCookie = serializeCookie('slop_oauth_state', '', {
          path: '/api/auth',
          maxAge: 0,
          httpOnly: true,
          sameSite: 'Lax',
          secure: https,
        });

        const cookies = parseCookies(req.headers.cookie);
        const state = url.searchParams.get('state') || '';
        const code = url.searchParams.get('code') || '';
        const oauthError = url.searchParams.get('error') || '';

        if (!state || !cookies.slop_oauth_state || !timingSafeEqualStr(cookies.slop_oauth_state, state)) {
          sendHtml(
            res,
            400,
            renderPrismPage({
              title: 'Sign-In State Mismatch',
              heading: 'Sign-in verification failed',
              message: 'Your OAuth state cookie did not match or expired. Please try signing in again from Slopitaire.',
              tone: 'danger',
              actionHtml: '<a class="btn" href="/">Back to Slopitaire</a>',
            }),
            { 'Set-Cookie': clearStateCookie }
          );
          return true;
        }

        const now = Date.now();
        const stateRow = store.stmts.consumeOAuthState.get(state, now);
        if (!stateRow) {
          sendHtml(
            res,
            400,
            renderPrismPage({
              title: 'Sign-In Session Expired',
              heading: 'Sign-in session expired',
              message: 'That login attempt has already been used or expired. Please start Google Sign-In again.',
              tone: 'danger',
              actionHtml: '<a class="btn" href="/">Back to Slopitaire</a>',
            }),
            { 'Set-Cookie': clearStateCookie }
          );
          return true;
        }

        if (oauthError) {
          if (stateRow.mode === 'desktop' && stateRow.desktop_redirect) {
            const target = `${stateRow.desktop_redirect}?error=${encodeURIComponent(oauthError)}`;
            sendRedirect(res, target, { 'Set-Cookie': clearStateCookie });
            return true;
          }
          if (stateRow.mode === 'popup') {
            sendHtml(
              res,
              400,
              renderPrismPage({
                title: 'Google Sign-In Cancelled',
                heading: 'Google Sign-In was cancelled',
                message: `Google returned: ${oauthError}`,
                tone: 'amber',
                actionHtml: '<button type="button" class="btn" onclick="window.close()">Close window</button>',
                script: buildPopupNotifyScript({ type: 'slopitaire:auth-complete', ok: false, error: oauthError }, false),
              }),
              { 'Set-Cookie': clearStateCookie }
            );
            return true;
          }
          sendRedirect(res, stateRow.return_to || '/', { 'Set-Cookie': clearStateCookie });
          return true;
        }

        if (!code) {
          sendHtml(
            res,
            400,
            renderPrismPage({
              title: 'Missing Authorization Code',
              heading: 'Google sign-in incomplete',
              message: 'No authorization code was returned by Google. Please try again.',
              tone: 'danger',
              actionHtml: '<a class="btn" href="/">Back to Slopitaire</a>',
            }),
            { 'Set-Cookie': clearStateCookie }
          );
          return true;
        }

        const redirectUri = resolveRedirectUri(req, cfg);
        let tokenRes;
        try {
          tokenRes = await fetch(cfg.googleTokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code,
              client_id: cfg.googleClientId,
              client_secret: cfg.googleClientSecret,
              redirect_uri: redirectUri,
              code_verifier: stateRow.code_verifier,
            }),
            signal: AbortSignal.timeout(15000),
          });
        } catch {
          sendHtml(
            res,
            502,
            renderPrismPage({
              title: 'Google Token Exchange Failed',
              heading: 'Could not reach Google OAuth2 server',
              message: 'Network error while exchanging the authorization code with Google. Please try again.',
              tone: 'danger',
              actionHtml: stateRow.mode === 'popup'
                ? '<button type="button" class="btn" onclick="window.close()">Close window</button>'
                : '<a class="btn" href="/">Back to Slopitaire</a>',
              script: stateRow.mode === 'popup'
                ? buildPopupNotifyScript({ type: 'slopitaire:auth-complete', ok: false, error: 'token_network_error' }, false)
                : '',
            }),
            { 'Set-Cookie': clearStateCookie }
          );
          return true;
        }

        let tokenBody = null;
        try {
          tokenBody = await tokenRes.json();
        } catch {
          tokenBody = null;
        }

        if (!tokenRes.ok || !tokenBody || typeof tokenBody.id_token !== 'string') {
          sendHtml(
            res,
            502,
            renderPrismPage({
              title: 'Google Token Exchange Failed',
              heading: 'Could not complete Google Sign-In',
              message: 'Google rejected or failed the authorization code exchange. Please check your OAuth credentials and redirect URI.',
              tone: 'danger',
              actionHtml: stateRow.mode === 'popup'
                ? '<button type="button" class="btn" onclick="window.close()">Close window</button>'
                : '<a class="btn" href="/">Back to Slopitaire</a>',
              script: stateRow.mode === 'popup'
                ? buildPopupNotifyScript({ type: 'slopitaire:auth-complete', ok: false, error: 'token_exchange_failed' }, false)
                : '',
            }),
            { 'Set-Cookie': clearStateCookie }
          );
          return true;
        }

        let claims;
        try {
          claims = await jwksVerifier.verifyIdToken(tokenBody.id_token, cfg);
        } catch (err) {
          sendHtml(
            res,
            err instanceof HttpError ? err.statusCode : 401,
            renderPrismPage({
              title: 'Identity Verification Failed',
              heading: 'Google identity verification failed',
              message: err.message || 'Invalid ID token.',
              tone: 'danger',
              actionHtml: stateRow.mode === 'popup'
                ? '<button type="button" class="btn" onclick="window.close()">Close window</button>'
                : '<a class="btn" href="/">Back to Slopitaire</a>',
              script: stateRow.mode === 'popup'
                ? buildPopupNotifyScript({ type: 'slopitaire:auth-complete', ok: false, error: 'id_token_invalid' }, false)
                : '',
            }),
            { 'Set-Cookie': clearStateCookie }
          );
          return true;
        }

        const user = store.upsertUserByGoogleSub({
          id: crypto.randomUUID(),
          sub: claims.sub,
          email: claims.email,
          name: claims.name,
          picture: claims.picture,
          now,
        });

        const rawSessionToken = crypto.randomBytes(32).toString('base64url');
        const sessionHash = sha256Hex(rawSessionToken);
        const sessionKind = stateRow.mode === 'desktop' ? 'desktop' : 'web';
        store.stmts.insertSession.run(sessionHash, user.id, sessionKind, now, now + SESSION_TTL_MS);

        if (stateRow.mode === 'desktop') {
          const ticket = crypto.randomBytes(32).toString('base64url');
          const ticketHash = sha256Hex(ticket);
          store.stmts.insertDesktopTicket.run(ticketHash, rawSessionToken, now, now + TICKET_TTL_MS);
          const target = `${stateRow.desktop_redirect}?ticket=${encodeURIComponent(ticket)}`;
          sendRedirect(res, target, { 'Set-Cookie': clearStateCookie });
          return true;
        }

        const sessionCookie = serializeCookie('slop_session', rawSessionToken, {
          path: '/',
          maxAge: SESSION_TTL_MS / 1000,
          httpOnly: true,
          sameSite: 'Lax',
          secure: https,
        });

        if (stateRow.mode === 'redirect') {
          sendRedirect(res, stateRow.return_to || '/', {
            'Set-Cookie': [clearStateCookie, sessionCookie],
          });
          return true;
        }

        const popupHtml = renderPrismPage({
          title: 'Signed In',
          heading: `Welcome, ${user.name}!`,
          message: 'Google Sign-In succeeded and your PRISM cloud sync is ready. This window will close automatically.',
          tone: 'emerald',
          actionHtml: '<button type="button" class="btn" onclick="window.close()">Close window</button>',
          script: buildPopupNotifyScript({ type: 'slopitaire:auth-complete', ok: true }, true),
        });
        sendHtml(res, 200, popupHtml, {
          'Set-Cookie': [clearStateCookie, sessionCookie],
        });
        return true;
      }

      if (method === 'POST' && pathname === '/api/auth/token-exchange') {
        const body = await readJsonBody(req, MAX_SMALL_BODY_BYTES);
        const ticket = typeof body?.ticket === 'string' ? body.ticket.trim() : '';
        if (!ticket) {
          throw new HttpError(400, 'Missing desktop ticket');
        }

        const now = Date.now();
        store.pruneExpired(now);
        const ticketRow = store.stmts.consumeDesktopTicket.get(sha256Hex(ticket), now);
        if (!ticketRow) {
          throw new HttpError(401, 'Invalid or expired desktop auth ticket');
        }

        const tokenHash = sha256Hex(ticketRow.raw_session_token);
        const sessionRow = store.stmts.getSessionWithUser.get(tokenHash, now);
        if (!sessionRow) {
          throw new HttpError(401, 'Session is no longer valid');
        }

        sendJson(res, 200, {
          ok: true,
          token: ticketRow.raw_session_token,
          user: sanitizePublicUser(sessionRow),
          progress: store.getProgressForUser(sessionRow.user_id),
        });
        return true;
      }

      if (method === 'POST' && pathname === '/api/auth/logout') {
        const { auth, cookies } = resolveAuth(req);
        if ((auth && auth.authType === 'cookie') || (!auth && cookies.slop_session)) {
          if (String(req.headers['x-slopitaire-csrf'] || '') !== '1') {
            throw new HttpError(403, 'Missing required X-Slopitaire-CSRF header');
          }
        }
        if (auth) {
          store.stmts.deleteSession.run(auth.tokenHash);
        }
        const https = isHttpsRequest(req, cfg);
        const clearSessionCookie = serializeCookie('slop_session', '', {
          path: '/',
          maxAge: 0,
          httpOnly: true,
          sameSite: 'Lax',
          secure: https,
        });
        sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie });
        return true;
      }

      if (method === 'GET' && pathname === '/api/progress') {
        const { auth } = resolveAuth(req);
        if (!auth) {
          throw new HttpError(401, 'Authentication required');
        }
        sendJson(res, 200, {
          ok: true,
          progress: store.getProgressForUser(auth.user.id),
        });
        return true;
      }

      if ((method === 'POST' && pathname === '/api/progress/sync') || (method === 'PUT' && pathname === '/api/progress')) {
        const { auth } = resolveAuth(req);
        if (!auth) {
          throw new HttpError(401, 'Authentication required');
        }
        requireCsrfIfCookie(req, auth);

        const body = await readJsonBody(req, MAX_PROGRESS_BODY_BYTES);
        const merged = store.runImmediateTransaction(() => {
          const existingRow = store.stmts.getProgress.get(auth.user.id);
          const result = mergeProgress(existingRow, body, Date.now());
          store.stmts.upsertProgress.run(
            auth.user.id,
            result.row.settings_json,
            result.row.settings_updated_at,
            result.row.stats_json,
            result.row.stats_updated_at,
            result.row.save_json,
            result.row.save_updated_at,
            result.row.gacha_json,
            result.row.gacha_updated_at,
            result.row.applied_delta_ids_json,
            result.row.updated_at
          );
          return result;
        });

        sendJson(res, 200, {
          ok: true,
          progress: merged.progress,
        });
        return true;
      }

      return false;
    } catch (err) {
      if (err instanceof HttpError || err instanceof MergeValidationError) {
        if (pathname === '/api/auth/google/start' || pathname === '/api/auth/google/callback') {
          if (!acceptsJsonOnly(req)) {
            sendHtml(
              res,
              err.statusCode,
              renderPrismPage({
                title: 'Authentication Error',
                heading: 'Sign-in request invalid',
                message: err.message,
                tone: 'danger',
                actionHtml: '<a class="btn" href="/">Back to Slopitaire</a>',
              })
            );
            return true;
          }
        }
        sendJson(res, err.statusCode, { ok: false, error: err.message });
        return true;
      }
      sendJson(res, 500, { ok: false, error: 'Internal server error' });
      return true;
    }
  }

  return {
    handleRequest,
    resolveAuth,
    getConfig,
    isOAuthConfigured,
  };
}

module.exports = {
  createAuthHandler,
  sha256Hex,
  parseCookies,
  serializeCookie,
  isValidDesktopRedirect,
  isValidReturnTo,
};
