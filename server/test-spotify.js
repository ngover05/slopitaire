'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { startServer } = require('./index');

function httpGetRaw(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function extractInlineScript(html) {
  const openIdx = html.lastIndexOf('<script>');
  const closeIdx = html.lastIndexOf('</script>');
  assert.ok(openIdx !== -1 && closeIdx > openIdx, 'Expected inline <script> block in callback HTML');
  return html.slice(openIdx + '<script>'.length, closeIdx);
}

function runCallbackScriptInVm(html, { withOpener = true } = {}) {
  const scriptSrc = extractInlineScript(html);
  const postedToOpener = [];
  const postedToChannel = [];
  const stored = {};
  const timeouts = [];
  let closed = false;
  const elements = {
    spBackLink: { style: { display: '' } },
    spCloseBtn: { style: { display: 'none' } },
  };

  class MockBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.closed = false;
    }
    postMessage(msg) {
      postedToChannel.push({ channel: this.name, msg });
    }
    close() {
      this.closed = true;
    }
  }

  const sandbox = {
    window: {
      location: { origin: 'http://127.0.0.1:3000' },
      opener: withOpener
        ? {
            closed: false,
            postMessage(msg, targetOrigin) {
              postedToOpener.push({ msg, targetOrigin });
            },
          }
        : null,
      close() {
        closed = true;
      },
    },
    BroadcastChannel: MockBroadcastChannel,
    localStorage: {
      setItem(key, value) {
        stored[key] = value;
      },
    },
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    setTimeout(fn, delay) {
      timeouts.push({ fn, delay });
      return 1;
    },
    Object,
    JSON,
    Date,
    Boolean,
  };

  vm.runInNewContext(scriptSrc, sandbox);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  return {
    postedToOpener: clone(postedToOpener),
    postedToChannel: clone(postedToChannel),
    stored: clone(stored),
    timeouts,
    elements: clone(elements),
    isClosed: () => closed,
  };
}

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopitaire-spotify-test-'));
  const prevEnv = {
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  };

  let server1 = null;
  let server2 = null;
  let server3 = null;

  try {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_REDIRECT_URI;
    delete process.env.PUBLIC_BASE_URL;

    // 1. Unconfigured server + localhost -> 127.0.0.1 normalization + CORS + Callback HTML
    server1 = await startServer({
      loadEnv: false,
      port: 0,
      host: '127.0.0.1',
      sqlitePath: path.join(tmpDir, 'test1.db'),
      serveStatic: false,
      spotifyConfig: {
        spotifyClientId: '',
        spotifyRedirectUri: '',
      },
    });
    assert.ok(server1.spotifyHandler, 'Expected spotifyHandler on server object');

    const unconfRes = await fetch(`${server1.baseUrl}/api/spotify/config`);
    assert.equal(unconfRes.status, 200);
    assert.equal(unconfRes.headers.get('cache-control'), 'no-store');
    assert.equal(unconfRes.headers.get('x-content-type-options'), 'nosniff');
    const unconfJson = await unconfRes.json();
    assert.deepEqual(unconfJson, {
      ok: true,
      configured: false,
      clientId: '',
      redirectUri: `${server1.baseUrl}/api/spotify/callback`,
    });

    // Host: localhost:8080 must normalize to http://127.0.0.1:8080/api/spotify/callback
    const localhostNormRes = await httpGetRaw(`${server1.baseUrl}/api/spotify/config`, {
      Host: 'localhost:8080',
    });
    assert.equal(localhostNormRes.status, 200);
    assert.equal(
      JSON.parse(localhostNormRes.body).redirectUri,
      'http://127.0.0.1:8080/api/spotify/callback'
    );

    // 2. CORS headers on /api/spotify/config
    const corsAppGet = await fetch(`${server1.baseUrl}/api/spotify/config`, {
      headers: { Origin: 'app://slopitaire' },
    });
    assert.equal(corsAppGet.status, 200);
    assert.equal(corsAppGet.headers.get('access-control-allow-origin'), 'app://slopitaire');
    assert.equal(corsAppGet.headers.get('access-control-allow-credentials'), 'true');

    const corsLoopbackGet = await fetch(`${server1.baseUrl}/api/spotify/config`, {
      headers: { Origin: 'http://127.0.0.1:43821' },
    });
    assert.equal(corsLoopbackGet.status, 200);
    assert.equal(corsLoopbackGet.headers.get('access-control-allow-origin'), 'http://127.0.0.1:43821');

    const corsLoopbackOpts = await fetch(`${server1.baseUrl}/api/spotify/config`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:43821',
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert.equal(corsLoopbackOpts.status, 204);
    assert.equal(corsLoopbackOpts.headers.get('access-control-allow-origin'), 'http://127.0.0.1:43821');

    const corsEvilOpts = await fetch(`${server1.baseUrl}/api/spotify/config`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(corsEvilOpts.status, 403);
    assert.equal(corsEvilOpts.headers.get('access-control-allow-origin'), null);

    // Unknown /api/spotify/* route returns 404
    const unknownRoute = await fetch(`${server1.baseUrl}/api/spotify/unknown`);
    assert.equal(unknownRoute.status, 404);

    // 3. Callback success
    const cbSuccessRes = await fetch(
      `${server1.baseUrl}/api/spotify/callback?code=sp_auth_code_123&state=slop_sp_state_abc`
    );
    assert.equal(cbSuccessRes.status, 200);
    assert.ok((cbSuccessRes.headers.get('content-type') || '').includes('text/html'));
    assert.equal(cbSuccessRes.headers.get('cache-control'), 'no-store');
    assert.equal(cbSuccessRes.headers.get('x-content-type-options'), 'nosniff');
    const cbSuccessHtml = await cbSuccessRes.text();
    assert.ok(cbSuccessHtml.includes('href="/"'), 'Expected link back to /');
    assert.ok(cbSuccessHtml.includes("BroadcastChannel('slopitaire-spotify')"));
    assert.ok(cbSuccessHtml.includes('slopitaire.spotifyAuthResult'));

    const vmWithOpener = runCallbackScriptInVm(cbSuccessHtml, { withOpener: true });
    assert.equal(vmWithOpener.postedToOpener.length, 1);
    assert.deepEqual(vmWithOpener.postedToOpener[0].msg, {
      type: 'slopitaire:spotify-callback',
      ok: true,
      code: 'sp_auth_code_123',
      state: 'slop_sp_state_abc',
      error: '',
    });
    assert.equal(vmWithOpener.postedToOpener[0].targetOrigin, 'http://127.0.0.1:3000');
    assert.equal(vmWithOpener.postedToChannel.length, 1);
    assert.deepEqual(vmWithOpener.postedToChannel[0].msg, vmWithOpener.postedToOpener[0].msg);
    const storedSuccess = JSON.parse(vmWithOpener.stored['slopitaire.spotifyAuthResult']);
    assert.equal(storedSuccess.ok, true);
    assert.equal(storedSuccess.code, 'sp_auth_code_123');
    assert.equal(storedSuccess.state, 'slop_sp_state_abc');
    assert.equal(storedSuccess.error, '');
    assert.equal(typeof storedSuccess.ts, 'number');
    assert.equal(vmWithOpener.timeouts.length, 1);
    assert.ok(vmWithOpener.timeouts[0].delay >= 800 && vmWithOpener.timeouts[0].delay <= 1200);
    vmWithOpener.timeouts[0].fn();
    assert.equal(vmWithOpener.isClosed(), true);

    const vmNoOpener = runCallbackScriptInVm(cbSuccessHtml, { withOpener: false });
    assert.equal(vmNoOpener.postedToOpener.length, 0);
    assert.equal(vmNoOpener.postedToChannel.length, 1);
    assert.equal(vmNoOpener.timeouts.length, 0);
    assert.notEqual(vmNoOpener.elements.spBackLink.style.display, 'none');

    // 4. Callback error (?error=access_denied)
    const cbErrRes = await fetch(
      `${server1.baseUrl}/api/spotify/callback?error=access_denied&state=slop_sp_state_err`
    );
    assert.equal(cbErrRes.status, 200);
    assert.equal(cbErrRes.headers.get('cache-control'), 'no-store');
    assert.equal(cbErrRes.headers.get('x-content-type-options'), 'nosniff');
    const cbErrHtml = await cbErrRes.text();
    const vmErr = runCallbackScriptInVm(cbErrHtml, { withOpener: true });
    assert.deepEqual(vmErr.postedToOpener[0].msg, {
      type: 'slopitaire:spotify-callback',
      ok: false,
      code: '',
      state: 'slop_sp_state_err',
      error: 'access_denied',
    });

    // Missing code & missing error defaults to 'Missing authorization code'
    const cbMissingRes = await fetch(`${server1.baseUrl}/api/spotify/callback?state=s1`);
    assert.equal(cbMissingRes.status, 200);
    const vmMissing = runCallbackScriptInVm(await cbMissingRes.text(), { withOpener: false });
    assert.deepEqual(vmMissing.postedToChannel[0].msg, {
      type: 'slopitaire:spotify-callback',
      ok: false,
      code: '',
      state: 's1',
      error: 'Missing authorization code',
    });

    // 5. XSS payload escaping in code/state/error
    const xssCode = '</script><script>alert(1)</script>';
    const xssError = '</script><img src=x onerror=alert("xss")>&foo=1';
    const xssState = '<script>bad</script>';
    const cbXssRes = await fetch(
      `${server1.baseUrl}/api/spotify/callback?code=${encodeURIComponent(xssCode)}&error=${encodeURIComponent(xssError)}&state=${encodeURIComponent(xssState)}`
    );
    assert.equal(cbXssRes.status, 200);
    const cbXssHtml = await cbXssRes.text();
    // Ensure only the single legitimate closing </script> at the end of inline script exists
    assert.equal(cbXssHtml.match(/<\/script>/gi).length, 1, 'XSS payload must not emit extra </script> tags');
    assert.equal(cbXssHtml.includes('<img src=x'), false, 'XSS HTML tag must be escaped');
    assert.equal(cbXssHtml.includes('<script>alert(1)'), false, 'XSS script tag must be escaped');

    const vmXss = runCallbackScriptInVm(cbXssHtml, { withOpener: true });
    assert.deepEqual(vmXss.postedToOpener[0].msg, {
      type: 'slopitaire:spotify-callback',
      ok: false,
      code: xssCode,
      state: xssState,
      error: xssError,
    });

    await server1.close();
    server1 = null;

    // 6. Configured via spotifyConfig + PUBLIC_BASE_URL localhost normalization
    server2 = await startServer({
      loadEnv: false,
      port: 0,
      host: '127.0.0.1',
      sqlitePath: path.join(tmpDir, 'test2.db'),
      serveStatic: false,
      spotifyConfig: {
        spotifyClientId: 'spotify-client-abc123',
        publicBaseUrl: 'http://localhost:8080',
      },
    });

    const conf2Res = await fetch(`${server2.baseUrl}/api/spotify/config`);
    assert.equal(conf2Res.status, 200);
    assert.deepEqual(await conf2Res.json(), {
      ok: true,
      configured: true,
      clientId: 'spotify-client-abc123',
      redirectUri: 'http://127.0.0.1:8080/api/spotify/callback',
    });

    await server2.close();
    server2 = null;

    // 7. Configured dynamically via process.env.SPOTIFY_CLIENT_ID & SPOTIFY_REDIRECT_URI
    process.env.SPOTIFY_CLIENT_ID = 'env-spotify-client-id';
    process.env.SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:9090/api/spotify/callback';
    server3 = await startServer({
      loadEnv: false,
      port: 0,
      host: '127.0.0.1',
      sqlitePath: path.join(tmpDir, 'test3.db'),
      serveStatic: false,
    });

    const conf3Res = await fetch(`${server3.baseUrl}/api/spotify/config`);
    assert.equal(conf3Res.status, 200);
    assert.deepEqual(await conf3Res.json(), {
      ok: true,
      configured: true,
      clientId: 'env-spotify-client-id',
      redirectUri: 'http://127.0.0.1:9090/api/spotify/callback',
    });

    console.log('ALL SPOTIFY SERVER TESTS PASSED');
  } finally {
    if (server1) await server1.close();
    if (server2) await server2.close();
    if (server3) await server3.close();

    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
