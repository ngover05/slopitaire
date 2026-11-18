'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { startServer, loadDotEnv } = require('./index');

function createMockGoogleOidc() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const kid = 'mock-google-kid-1';
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const authCodes = new Map();
  let nextTokenOverrides = null;

  function signIdToken(claims, overrideKid = kid) {
    const header = { alg: 'RS256', typ: 'JWT', kid: overrideKid };
    const encHeader = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
    const encPayload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const signingInput = `${encHeader}.${encPayload}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKey).toString('base64url');
    return `${signingInput}.${sig}`;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/jwks') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/authorize') {
      const params = url.searchParams;
      assert.equal(params.get('response_type'), 'code');
      assert.equal(params.get('scope'), 'openid email profile');
      assert.equal(params.get('access_type'), 'online');
      assert.equal(params.get('prompt'), 'select_account');
      assert.equal(params.get('code_challenge_method'), 'S256');
      const code = crypto.randomBytes(16).toString('base64url');
      authCodes.set(code, {
        clientId: params.get('client_id'),
        redirectUri: params.get('redirect_uri'),
        codeChallenge: params.get('code_challenge'),
        overrides: nextTokenOverrides,
      });
      nextTokenOverrides = null;

      const callbackUrl = new URL(params.get('redirect_uri'));
      callbackUrl.searchParams.set('code', code);
      callbackUrl.searchParams.set('state', params.get('state'));
      res.writeHead(302, { Location: callbackUrl.toString() });
      res.end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/token') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        const code = body.get('code');
        const record = authCodes.get(code);
        authCodes.delete(code);
        if (!record) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }
        assert.equal(body.get('grant_type'), 'authorization_code');
        assert.equal(body.get('client_id'), record.clientId);
        assert.equal(body.get('redirect_uri'), record.redirectUri);

        const verifier = body.get('code_verifier') || '';
        const computedChallenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        if (computedChallenge !== record.codeChallenge) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_pkce_verifier' }));
          return;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const ov = record.overrides || {};
        const claims = {
          iss: ov.iss ?? 'https://accounts.google.com',
          aud: ov.aud ?? record.clientId,
          sub: ov.sub ?? 'google-user-sub-12345',
          email: ov.email ?? 'sakura@slopitaire.test',
          email_verified: ov.email_verified ?? true,
          name: ov.name ?? 'Sakura Prism',
          picture: ov.picture ?? 'https://lh3.googleusercontent.com/a/default-user',
          iat: nowSec,
          exp: ov.exp ?? (nowSec + 3600),
        };
        const idToken = ov.tamperSig
          ? signIdToken(claims).slice(0, -4) + 'AAAA'
          : signIdToken(claims, ov.kid || kid);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          id_token: idToken,
        }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return {
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();
      const base = `http://127.0.0.1:${port}`;
      return {
        baseUrl: base,
        authEndpoint: `${base}/authorize`,
        tokenEndpoint: `${base}/token`,
        jwksUri: `${base}/jwks`,
        setNextTokenOverrides(ov) {
          nextTokenOverrides = ov;
        },
        close() {
          return new Promise((resolve) => server.close(resolve));
        },
      };
    },
  };
}

function extractCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const map = {};
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) {
      map[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return { raw, map };
}

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopitaire-auth-test-'));
  const dbPath = path.join(tmpDir, 'nested', 'slopitaire-test.db');
  let mockOidc = null;
  let unconfiguredServer = null;
  let server1 = null;
  let server2 = null;

  try {
    // 1. Test loadDotEnv without overriding existing process.env
    const testEnvFile = path.join(tmpDir, '.env');
    fs.writeFileSync(
      testEnvFile,
      'SLOP_TEST_PRESET=from-file\nSLOP_TEST_NEW="hello\\nworld"\n# comment\nSLOP_TEST_COMMENT=val # trailing\n',
      'utf8'
    );
    process.env.SLOP_TEST_PRESET = 'from-env';
    delete process.env.SLOP_TEST_NEW;
    delete process.env.SLOP_TEST_COMMENT;
    loadDotEnv(testEnvFile);
    assert.equal(process.env.SLOP_TEST_PRESET, 'from-env');
    assert.equal(process.env.SLOP_TEST_NEW, 'hello\nworld');
    assert.equal(process.env.SLOP_TEST_COMMENT, 'val');
    delete process.env.SLOP_TEST_PRESET;
    delete process.env.SLOP_TEST_NEW;
    delete process.env.SLOP_TEST_COMMENT;

    // 2. Test unconfigured 503 mode
    unconfiguredServer = await startServer({
      loadEnv: false,
      port: 0,
      host: '127.0.0.1',
      sqlitePath: path.join(tmpDir, 'unconfigured.db'),
      serveStatic: false,
      authConfig: {
        googleClientId: '',
        googleClientSecret: '',
      },
    });

    const healthUnconf = await fetch(`${unconfiguredServer.baseUrl}/api/healthz`);
    assert.equal(healthUnconf.status, 200);
    assert.deepEqual(await healthUnconf.json(), { ok: true, oauthConfigured: false });

    const statusUnconf = await fetch(`${unconfiguredServer.baseUrl}/api/auth/status`);
    assert.equal(statusUnconf.status, 200);
    const statusUnconfJson = await statusUnconf.json();
    assert.equal(statusUnconfJson.configured, false);
    assert.equal(statusUnconfJson.provider, 'google');
    assert.equal(statusUnconfJson.user, null);
    assert.equal(statusUnconfJson.progress, null);
    assert.ok(typeof statusUnconfJson.setupHint === 'string' && statusUnconfJson.setupHint.length > 0);

    const startUnconfHtml = await fetch(`${unconfiguredServer.baseUrl}/api/auth/google/start?mode=popup`, {
      headers: { Accept: 'text/html' },
    });
    assert.equal(startUnconfHtml.status, 503);
    const startUnconfBody = await startUnconfHtml.text();
    assert.ok(startUnconfBody.includes('GOOGLE_CLIENT_ID'));
    assert.ok(startUnconfBody.includes("BroadcastChannel('slopitaire-auth')"));

    const startUnconfJson = await fetch(`${unconfiguredServer.baseUrl}/api/auth/google/start?mode=popup`, {
      headers: { Accept: 'application/json' },
    });
    assert.equal(startUnconfJson.status, 503);
    assert.equal((await startUnconfJson.json()).configured, false);

    assert.equal((await fetch(`${unconfiguredServer.baseUrl}/api/progress`)).status, 401);
    assert.equal(
      (await fetch(`${unconfiguredServer.baseUrl}/api/progress/sync`, { method: 'POST', body: '{}' })).status,
      401
    );

    await unconfiguredServer.close();
    unconfiguredServer = null;

    // 3. Spin up Mock Google OIDC & primary API+Static server
    mockOidc = await createMockGoogleOidc().start();
    const authConfig = {
      googleClientId: 'test-google-client-id.apps.googleusercontent.com',
      googleClientSecret: 'test-google-client-secret',
      googleAuthEndpoint: mockOidc.authEndpoint,
      googleTokenEndpoint: mockOidc.tokenEndpoint,
      googleJwksUri: mockOidc.jwksUri,
    };

    server1 = await startServer({
      loadEnv: false,
      port: 0,
      host: '127.0.0.1',
      sqlitePath: dbPath,
      serveStatic: true,
      allowedOrigins: 'https://allowed.slopitaire.example',
      authConfig,
    });

    // 4. Test CORS preflight & static serving + Opus byte Range
    const corsApp = await fetch(`${server1.baseUrl}/api/progress/sync`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'app://slopitaire',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization, X-Slopitaire-CSRF',
      },
    });
    assert.equal(corsApp.status, 204);
    assert.equal(corsApp.headers.get('access-control-allow-origin'), 'app://slopitaire');
    assert.equal(corsApp.headers.get('access-control-allow-credentials'), 'true');
    assert.ok(corsApp.headers.get('access-control-allow-headers').includes('X-Slopitaire-CSRF'));

    const corsLocalhost = await fetch(`${server1.baseUrl}/api/auth/status`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(corsLocalhost.status, 204);
    assert.equal(corsLocalhost.headers.get('access-control-allow-origin'), 'http://localhost:5173');

    const corsCustom = await fetch(`${server1.baseUrl}/api/auth/status`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://allowed.slopitaire.example' },
    });
    assert.equal(corsCustom.status, 204);
    assert.equal(corsCustom.headers.get('access-control-allow-origin'), 'https://allowed.slopitaire.example');

    const corsEvil = await fetch(`${server1.baseUrl}/api/auth/status`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(corsEvil.status, 403);
    assert.equal(corsEvil.headers.get('access-control-allow-origin'), null);

    const staticHealth = await fetch(`${server1.baseUrl}/healthz`);
    assert.equal(staticHealth.status, 200);
    assert.equal(await staticHealth.text(), 'ok\n');

    const staticIndex = await fetch(`${server1.baseUrl}/`);
    assert.equal(staticIndex.status, 200);
    assert.ok((staticIndex.headers.get('content-type') || '').includes('text/html'));
    assert.ok((await staticIndex.text()).includes('Slopitaire'));

    const voiceDir = path.join(__dirname, '..', 'audio', 'voice', 'sakura', 'en');
    const opusName = fs.readdirSync(voiceDir).find((f) => f.endsWith('.opus'));
    assert.ok(opusName, 'Expected at least one opus in audio/voice/sakura/en');
    const opusRangeRes = await fetch(`${server1.baseUrl}/audio/voice/sakura/en/${opusName}`, {
      headers: { Range: 'bytes=0-63' },
    });
    assert.equal(opusRangeRes.status, 206);
    assert.equal(opusRangeRes.headers.get('content-type'), 'audio/ogg');
    assert.ok((opusRangeRes.headers.get('content-range') || '').startsWith('bytes 0-63/'));
    assert.equal((await opusRangeRes.arrayBuffer()).byteLength, 64);

    const opusBadRangeRes = await fetch(`${server1.baseUrl}/audio/voice/sakura/en/${opusName}`, {
      headers: { Range: 'bytes=999999999-' },
    });
    assert.equal(opusBadRangeRes.status, 416);

    // Raw socket traversal test (fetch normalizes /.. before sending, so use raw http.request)
    const traversalStatus = await new Promise((resolve, reject) => {
      const target = new URL(server1.baseUrl);
      const req = http.request({
        hostname: target.hostname,
        port: target.port,
        path: '/js/../server/index.js',
        method: 'GET',
      }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.ok(traversalStatus === 403 || traversalStatus === 404);

    // 5. Test desktop_redirect & return_to strict validation
    assert.equal(
      (await fetch(`${server1.baseUrl}/api/auth/google/start?mode=desktop&desktop_redirect=${encodeURIComponent('https://evil.com/auth/callback')}`)).status,
      400
    );
    assert.equal(
      (await fetch(`${server1.baseUrl}/api/auth/google/start?mode=desktop&desktop_redirect=${encodeURIComponent('http://localhost:45678/auth/callback')}`)).status,
      400
    );
    assert.equal(
      (await fetch(`${server1.baseUrl}/api/auth/google/start?mode=desktop&desktop_redirect=${encodeURIComponent('http://127.0.0.1:99999/auth/callback')}`)).status,
      400
    );
    assert.equal(
      (await fetch(`${server1.baseUrl}/api/auth/google/start?mode=redirect&return_to=${encodeURIComponent('//evil.com')}`)).status,
      400
    );

    // Helper to step through OAuth start -> mock authorize -> callback
    async function runOAuthFlow(startQuery, tokenOverrides = null) {
      if (tokenOverrides) mockOidc.setNextTokenOverrides(tokenOverrides);
      const startRes = await fetch(`${server1.baseUrl}/api/auth/google/start?${startQuery}`, { redirect: 'manual' });
      assert.equal(startRes.status, 302);
      const stateCookies = extractCookies(startRes);
      const stateCookieVal = stateCookies.map.slop_oauth_state;
      assert.ok(stateCookieVal, 'Expected slop_oauth_state cookie');

      const authLoc = startRes.headers.get('location');
      const authRes = await fetch(authLoc, { redirect: 'manual' });
      assert.equal(authRes.status, 302);
      const callbackLoc = authRes.headers.get('location');

      const callbackRes = await fetch(callbackLoc, {
        redirect: 'manual',
        headers: { Cookie: `slop_oauth_state=${encodeURIComponent(stateCookieVal)}` },
      });
      return { callbackRes, callbackLoc, stateCookieVal };
    }

    // 6. Test state mismatch rejection
    {
      const startRes = await fetch(`${server1.baseUrl}/api/auth/google/start?mode=popup`, { redirect: 'manual' });
      const authRes = await fetch(startRes.headers.get('location'), { redirect: 'manual' });
      const badCookieCallback = await fetch(authRes.headers.get('location'), {
        redirect: 'manual',
        headers: { Cookie: 'slop_oauth_state=wrong-state-cookie' },
      });
      assert.equal(badCookieCallback.status, 400);
    }

    // 7. Test bad aud and email_verified=false rejection
    {
      const { callbackRes: badAudRes } = await runOAuthFlow('mode=popup', { aud: 'other-app-client-id' });
      assert.equal(badAudRes.status, 401);

      const { callbackRes: unverifiedRes } = await runOAuthFlow('mode=popup', { email_verified: false });
      assert.equal(unverifiedRes.status, 401);

      const { callbackRes: badSigRes } = await runOAuthFlow('mode=popup', { tamperSig: true });
      assert.equal(badSigRes.status, 401);
    }

    // 8b. Positive Web Redirect OAuth2 flow with return_to
    const redirectFlow = await runOAuthFlow('mode=redirect&return_to=%2F%3Ffrom%3Dgoogle');
    assert.equal(redirectFlow.callbackRes.status, 302);
    assert.equal(redirectFlow.callbackRes.headers.get('location'), '/?from=google');
    const redirectCookies = extractCookies(redirectFlow.callbackRes);
    assert.ok(redirectCookies.map.slop_session, 'Expected slop_session cookie on redirect flow');

    // 8. Positive Web Popup OAuth2 + PKCE flow
    const popupFlow = await runOAuthFlow('mode=popup');
    assert.equal(popupFlow.callbackRes.status, 200);
    const popupHtml = await popupFlow.callbackRes.text();
    assert.ok(popupHtml.includes("BroadcastChannel('slopitaire-auth')"));
    assert.ok(popupHtml.includes('window.opener'));
    assert.ok(popupHtml.includes('slopitaire.authPing'));

    const sessionCookies = extractCookies(popupFlow.callbackRes);
    const webSessionCookie = sessionCookies.map.slop_session;
    assert.ok(webSessionCookie, 'Expected slop_session cookie');

    // Replaying the consumed callback URL must fail (single-use state)
    const replayRes = await fetch(popupFlow.callbackLoc, {
      redirect: 'manual',
      headers: { Cookie: `slop_oauth_state=${encodeURIComponent(popupFlow.stateCookieVal)}` },
    });
    assert.equal(replayRes.status, 400);

    const webCookieHeader = `slop_session=${encodeURIComponent(webSessionCookie)}`;

    // Verify authenticated /api/auth/status
    const statusAuthed = await fetch(`${server1.baseUrl}/api/auth/status`, {
      headers: { Cookie: webCookieHeader },
    });
    assert.equal(statusAuthed.status, 200);
    const statusAuthedJson = await statusAuthed.json();
    assert.equal(statusAuthedJson.configured, true);
    assert.equal(statusAuthedJson.user.email, 'sakura@slopitaire.test');
    assert.equal(statusAuthedJson.user.name, 'Sakura Prism');

    // 9. CSRF rejection on cookie-authenticated POST/PUT
    const noCsrfSync = await fetch(`${server1.baseUrl}/api/progress/sync`, {
      method: 'POST',
      headers: { Cookie: webCookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { theme: 'prism' }, settingsUpdatedAt: 1000 }),
    });
    assert.equal(noCsrfSync.status, 403);

    const noCsrfLogout = await fetch(`${server1.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: webCookieHeader },
    });
    assert.equal(noCsrfLogout.status, 403);

    // 10. Progress Sync + guestDelta idempotency + timestamp resolution + save clear
    const sync1Res = await fetch(`${server1.baseUrl}/api/progress/sync`, {
      method: 'POST',
      headers: {
        Cookie: webCookieHeader,
        'Content-Type': 'application/json',
        'X-Slopitaire-CSRF': '1',
      },
      body: JSON.stringify({
        settings: { theme: 'sakura', companion: 'sakura' },
        settingsUpdatedAt: 1000,
        stats: {
          easy: { played: 2, won: 1, bestTime: 120, bestScore: 900, streak: 1, bestStreak: 1 },
        },
        statsUpdatedAt: 1000,
        save: { v: 1, difficulty: 'medium', draw: 1, deck: [0, 1, 2], state: { stock: [3] } },
        saveUpdatedAt: 1000,
      }),
    });
    assert.equal(sync1Res.status, 200);
    const sync1Json = await sync1Res.json();
    assert.equal(sync1Json.ok, true);
    assert.equal(sync1Json.progress.settings.theme, 'sakura');
    assert.equal(sync1Json.progress.stats.easy.played, 2);
    assert.equal(sync1Json.progress.save.difficulty, 'medium');

    // Guest delta idempotency (delta-1)
    const syncDeltaPayload = {
      stats: {
        easy: { played: 3, won: 2, bestTime: 95, bestScore: 1250, streak: 2, bestStreak: 2 },
      },
      statsUpdatedAt: 2000,
      guestDelta: {
        easy: { played: 3, won: 2 },
      },
      deltaId: 'delta-idempotent-1',
    };

    const sync2Res = await fetch(`${server1.baseUrl}/api/progress/sync`, {
      method: 'POST',
      headers: {
        Cookie: webCookieHeader,
        'Content-Type': 'application/json',
        'X-Slopitaire-CSRF': '1',
      },
      body: JSON.stringify(syncDeltaPayload),
    });
    assert.equal(sync2Res.status, 200);
    const sync2Json = await sync2Res.json();
    assert.equal(sync2Json.progress.stats.easy.played, 5); // 2 + 3
    assert.equal(sync2Json.progress.stats.easy.won, 3); // 1 + 2
    assert.equal(sync2Json.progress.stats.easy.bestTime, 95);
    assert.equal(sync2Json.progress.stats.easy.bestScore, 1250);
    assert.equal(sync2Json.progress.stats.easy.streak, 2);
    assert.equal(sync2Json.progress.stats.easy.bestStreak, 2);

    // Retry with SAME deltaId must NOT add again
    const sync2RetryRes = await fetch(`${server1.baseUrl}/api/progress/sync`, {
      method: 'POST',
      headers: {
        Cookie: webCookieHeader,
        'Content-Type': 'application/json',
        'X-Slopitaire-CSRF': '1',
      },
      body: JSON.stringify(syncDeltaPayload),
    });
    assert.equal(sync2RetryRes.status, 200);
    const sync2RetryJson = await sync2RetryRes.json();
    assert.equal(sync2RetryJson.progress.stats.easy.played, 5);
    assert.equal(sync2RetryJson.progress.stats.easy.won, 3);

    // Stale timestamps must NOT overwrite newer settings, save, or streak
    const staleSyncRes = await fetch(`${server1.baseUrl}/api/progress/sync`, {
      method: 'POST',
      headers: {
        Cookie: webCookieHeader,
        'Content-Type': 'application/json',
        'X-Slopitaire-CSRF': '1',
      },
      body: JSON.stringify({
        settings: { theme: 'matcha', companion: 'rin' },
        settingsUpdatedAt: 500,
        stats: {
          easy: { played: 1, won: 0, bestTime: 200, bestScore: 100, streak: 0, bestStreak: 0 },
        },
        statsUpdatedAt: 500,
        save: { v: 1, difficulty: 'hard', draw: 3, deck: [9], state: {} },
        saveUpdatedAt: 500,
      }),
    });
    assert.equal(staleSyncRes.status, 200);
    const staleSyncJson = await staleSyncRes.json();
    assert.equal(staleSyncJson.progress.settings.theme, 'sakura');
    assert.equal(staleSyncJson.progress.stats.easy.streak, 2);
    assert.equal(staleSyncJson.progress.save.difficulty, 'medium');

    // Explicit null save with higher timestamp clears cloud save (win clears save)
    const winClearRes = await fetch(`${server1.baseUrl}/api/progress/sync`, {
      method: 'POST',
      headers: {
        Cookie: webCookieHeader,
        'Content-Type': 'application/json',
        'X-Slopitaire-CSRF': '1',
      },
      body: JSON.stringify({
        save: null,
        saveUpdatedAt: 3000,
      }),
    });
    assert.equal(winClearRes.status, 200);
    const winClearJson = await winClearRes.json();
    assert.equal(winClearJson.progress.save, null);
    assert.equal(winClearJson.progress.saveUpdatedAt, 3000);

    // PUT /api/progress updates settings
    const putRes = await fetch(`${server1.baseUrl}/api/progress`, {
      method: 'PUT',
      headers: {
        Cookie: webCookieHeader,
        'Content-Type': 'application/json',
        'X-Slopitaire-CSRF': '1',
      },
      body: JSON.stringify({
        settings: { theme: 'night', companion: 'kira' },
        settingsUpdatedAt: 4000,
      }),
    });
    assert.equal(putRes.status, 200);
    const putJson = await putRes.json();
    assert.equal(putJson.progress.settings.theme, 'night');
    assert.equal(putJson.progress.settings.companion, 'kira');

    // Oversized (>512KB) payload returns 413
    const hugeBody = JSON.stringify({ settings: { pad: 'x'.repeat(520 * 1024) }, settingsUpdatedAt: 5000 });
    const hugeRes = await fetch(`${server1.baseUrl}/api/progress/sync`, {
      method: 'POST',
      headers: {
        Cookie: webCookieHeader,
        'Content-Type': 'application/json',
        'X-Slopitaire-CSRF': '1',
      },
      body: hugeBody,
    });
    assert.equal(hugeRes.status, 413);

    // 11. Desktop Loopback OAuth2 Flow + Ticket Exchange + Bearer Auth
    const desktopFlow = await runOAuthFlow(
      `mode=desktop&desktop_redirect=${encodeURIComponent('http://127.0.0.1:45678/auth/callback')}`
    );
    assert.equal(desktopFlow.callbackRes.status, 302);
    const desktopRedirectLoc = new URL(desktopFlow.callbackRes.headers.get('location'));
    assert.equal(desktopRedirectLoc.origin, 'http://127.0.0.1:45678');
    assert.equal(desktopRedirectLoc.pathname, '/auth/callback');
    const ticket = desktopRedirectLoc.searchParams.get('ticket');
    assert.ok(ticket && ticket.length > 20, 'Expected desktop ticket');

    const exchangeRes = await fetch(`${server1.baseUrl}/api/auth/token-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    assert.equal(exchangeRes.status, 200);
    const exchangeJson = await exchangeRes.json();
    assert.equal(exchangeJson.ok, true);
    assert.ok(typeof exchangeJson.token === 'string' && exchangeJson.token.length > 20);
    assert.equal(exchangeJson.user.email, 'sakura@slopitaire.test');
    assert.equal(exchangeJson.progress.settings.theme, 'night');

    // Single-use ticket cannot be reused
    const exchangeReuseRes = await fetch(`${server1.baseUrl}/api/auth/token-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    assert.equal(exchangeReuseRes.status, 401);

    const bearerHeader = `Bearer ${exchangeJson.token}`;

    // Bearer progress GET & resetStats (no CSRF header required for Bearer)
    const bearerGetRes = await fetch(`${server1.baseUrl}/api/progress`, {
      headers: { Authorization: bearerHeader },
    });
    assert.equal(bearerGetRes.status, 200);

    const resetRes = await fetch(`${server1.baseUrl}/api/progress/sync`, {
      method: 'POST',
      headers: {
        Authorization: bearerHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resetStats: true,
        statsUpdatedAt: 6000,
      }),
    });
    assert.equal(resetRes.status, 200);
    const resetJson = await resetRes.json();
    for (const diff of ['easy', 'medium', 'hard', 'auto']) {
      assert.deepEqual(resetJson.progress.stats[diff], {
        played: 0,
        won: 0,
        bestTime: 0,
        bestScore: 0,
        streak: 0,
        bestStreak: 0,
      });
    }
    assert.ok(resetJson.progress.statsUpdatedAt >= 6000);

    // 12. SQLite Persistence Across DB Reload
    await server1.close();
    server1 = null;

    server2 = await startServer({
      loadEnv: false,
      port: 0,
      host: '127.0.0.1',
      sqlitePath: dbPath,
      serveStatic: false,
      authConfig,
    });

    const reloadProgressRes = await fetch(`${server2.baseUrl}/api/progress`, {
      headers: { Authorization: bearerHeader },
    });
    assert.equal(reloadProgressRes.status, 200);
    const reloadProgressJson = await reloadProgressRes.json();
    assert.equal(reloadProgressJson.progress.settings.theme, 'night');
    assert.equal(reloadProgressJson.progress.settings.companion, 'kira');
    assert.equal(reloadProgressJson.progress.save, null);
    assert.equal(reloadProgressJson.progress.stats.easy.played, 0);

    // 13. Logout invalidates both web cookie & desktop bearer sessions
    const webLogoutRes = await fetch(`${server2.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: webCookieHeader,
        'X-Slopitaire-CSRF': '1',
      },
    });
    assert.equal(webLogoutRes.status, 200);
    assert.equal((await fetch(`${server2.baseUrl}/api/progress`, { headers: { Cookie: webCookieHeader } })).status, 401);

    const bearerLogoutRes = await fetch(`${server2.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: bearerHeader },
    });
    assert.equal(bearerLogoutRes.status, 200);
    assert.equal((await fetch(`${server2.baseUrl}/api/progress`, { headers: { Authorization: bearerHeader } })).status, 401);

    console.log('ALL AUTH & SYNC TESTS PASSED');
  } finally {
    if (unconfiguredServer) await unconfiguredServer.close();
    if (server1) await server1.close();
    if (server2) await server2.close();
    if (mockOidc) await mockOidc.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
