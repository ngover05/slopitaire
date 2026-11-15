'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { openDb } = require('./db');
const { createAuthHandler } = require('./auth');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.opus': 'audio/ogg',
  '.webp': 'image/webp',
};

const STATIC_PREFIXES = ['css', 'js', 'images', 'audio'];

function loadDotEnv(envPath = path.join(WORKSPACE_ROOT, '.env')) {
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const line = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(process.env, key) && process.env[key] !== undefined) {
      continue;
    }

    let val = line.slice(eqIdx + 1).trim();
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else if (val.length >= 2 && val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    } else {
      const commentIdx = val.search(/\s+#/);
      if (commentIdx >= 0) {
        val = val.slice(0, commentIdx).trim();
      }
    }
    process.env[key] = val;
  }

  return true;
}

function parseAllowedOrigins(rawValue) {
  const set = new Set();
  if (typeof rawValue !== 'string' || !rawValue.trim()) return set;
  for (const part of rawValue.split(',')) {
    const trimmed = part.trim().replace(/\/+$/, '');
    if (trimmed) set.add(trimmed);
  }
  return set;
}

function getCurrentRequestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = forwardedProto === 'https' || forwardedProto === 'http'
    ? forwardedProto
    : (req.socket && req.socket.encrypted ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host || !/^[a-zA-Z0-9.:[\]-]+$/.test(host)) return '';
  return `${proto}://${host}`;
}

function isOriginAllowed(origin, req, allowedOriginsSet) {
  if (!origin) return false;
  if (origin === 'app://slopitaire') return true;
  if (/^http:\/\/localhost(?::\d{1,5})?$/i.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(?::\d{1,5})?$/i.test(origin)) return true;
  const currentOrigin = getCurrentRequestOrigin(req);
  if (currentOrigin && origin === currentOrigin) return true;
  if (allowedOriginsSet.has(origin)) return true;
  return false;
}

function applyCorsHeaders(req, res, allowedOriginsSet) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (!origin) return { hasOrigin: false, allowed: false };
  const allowed = isOriginAllowed(origin, req, allowedOriginsSet);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Slopitaire-CSRF');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  return { hasOrigin: true, allowed };
}

function resolveStaticFile(pathname, rootDir) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { errorStatus: 400 };
  }
  if (decoded.includes('\0')) return { errorStatus: 400 };

  if (decoded === '/' || decoded === '/index.html') {
    return { filePath: path.join(rootDir, 'index.html') };
  }

  const trimmed = decoded.replace(/^\/+/, '');
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx <= 0) return { errorStatus: 404 };

  const prefix = trimmed.slice(0, slashIdx);
  if (!STATIC_PREFIXES.includes(prefix)) return { errorStatus: 404 };

  const baseDir = path.resolve(rootDir, prefix);
  const candidate = path.resolve(rootDir, trimmed);
  if (!candidate.startsWith(baseDir + path.sep)) {
    return { errorStatus: 403 };
  }
  return { filePath: candidate };
}

function parseByteRange(rangeHeader, fileSize) {
  if (typeof rangeHeader !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return { invalid: true };

  const startStr = match[1];
  const endStr = match[2];
  if (!startStr && !endStr) return { invalid: true };
  if (fileSize === 0) return { invalid: true };

  let start;
  let end;
  if (startStr === '') {
    const suffixLen = Number(endStr);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return { invalid: true };
    start = Math.max(0, fileSize - suffixLen);
    end = fileSize - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? fileSize - 1 : Math.min(fileSize - 1, Number(endStr));
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= fileSize) {
    return { invalid: true };
  }
  return { start, end };
}

function serveStaticRequest(req, res, url, rootDir) {
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  if (url.pathname === '/healthz') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(method === 'HEAD' ? undefined : 'ok\n');
    return;
  }

  const resolved = resolveStaticFile(url.pathname, rootDir);
  if (resolved.errorStatus) {
    res.writeHead(resolved.errorStatus, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(resolved.errorStatus === 404 ? 'Not Found' : 'Invalid Request');
    return;
  }

  fs.stat(resolved.filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(resolved.filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const baseHeaders = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    };

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, stat.size);
      if (range && range.invalid) {
        res.writeHead(416, {
          ...baseHeaders,
          'Content-Range': `bytes */${stat.size}`,
        });
        res.end();
        return;
      }
      if (range) {
        const len = range.end - range.start + 1;
        res.writeHead(206, {
          ...baseHeaders,
          'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
          'Content-Length': len,
        });
        if (method === 'HEAD') {
          res.end();
          return;
        }
        const stream = fs.createReadStream(resolved.filePath, { start: range.start, end: range.end });
        stream.on('error', () => {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
        stream.pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length': stat.size,
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(resolved.filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  });
}

function createAppServer(options = {}) {
  const staticRoot = path.resolve(options.staticRoot || WORKSPACE_ROOT);
  const serveStatic = options.serveStatic !== undefined
    ? Boolean(options.serveStatic)
    : (process.argv.includes('--static') || process.env.SERVE_STATIC === '1');
  const store = options.store || openDb(options.sqlitePath);
  const ownsStore = !options.store;
  const authHandler = createAuthHandler(store, options.authConfig || {});

  const server = http.createServer(async (req, res) => {
    const allowedOriginsSet = parseAllowedOrigins(options.allowedOrigins ?? process.env.ALLOWED_ORIGINS ?? '');
    const hostHeader = String(req.headers.host || '127.0.0.1');
    let reqUrl;
    try {
      reqUrl = new URL(req.url || '/', `http://${hostHeader}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Malformed request URL' }));
      return;
    }

    if (reqUrl.pathname.startsWith('/api/')) {
      const cors = applyCorsHeaders(req, res, allowedOriginsSet);
      if (req.method.toUpperCase() === 'OPTIONS') {
        if (cors.hasOrigin && !cors.allowed) {
          res.writeHead(403, { 'Cache-Control': 'no-store' });
          res.end();
          return;
        }
        if (cors.allowed) {
          res.setHeader('Access-Control-Max-Age', '600');
        }
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      const handled = await authHandler.handleRequest(req, res, reqUrl);
      if (!handled) {
        res.writeHead(404, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(JSON.stringify({ ok: false, error: 'API route not found' }));
      }
      return;
    }

    if (serveStatic) {
      serveStaticRequest(req, res, reqUrl, staticRoot);
      return;
    }

    res.writeHead(404, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });

  async function close() {
    await new Promise((resolve) => server.close(() => resolve()));
    if (ownsStore) {
      store.close();
    }
  }

  return {
    server,
    store,
    authHandler,
    close,
    serveStatic,
  };
}

function startServer(options = {}) {
  const preEnvApiPort = process.env.API_PORT;
  const preEnvPort = process.env.PORT;
  if (options.loadEnv !== false) {
    loadDotEnv(options.envPath);
  }

  const serveStatic = options.serveStatic !== undefined
    ? Boolean(options.serveStatic)
    : (process.argv.includes('--static') || process.env.SERVE_STATIC === '1');

  let defaultPort = 3000;
  if (preEnvApiPort !== undefined) {
    defaultPort = Number(preEnvApiPort);
  } else if (serveStatic && preEnvPort !== undefined) {
    defaultPort = Number(preEnvPort);
  } else if (process.env.API_PORT !== undefined && process.env.API_PORT !== '') {
    defaultPort = Number(process.env.API_PORT);
  } else if (serveStatic && process.env.PORT !== undefined && process.env.PORT !== '') {
    defaultPort = Number(process.env.PORT);
  }

  const port = options.port !== undefined ? Number(options.port) : defaultPort;
  const host = options.host || process.env.API_HOST || '0.0.0.0';
  const app = createAppServer({ ...options, serveStatic });

  return new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(port, host, () => {
      app.server.removeListener('error', reject);
      const addr = app.server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        ...app,
        host,
        port: boundPort,
        baseUrl: `http://${host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host}:${boundPort}`,
      });
    });
  });
}

if (require.main === module) {
  startServer()
    .then((running) => {
      const cfg = running.authHandler.getConfig();
      const oauthState = running.authHandler.isOAuthConfigured(cfg) ? 'configured' : 'unconfigured (guest mode)';
      console.log(
        `[slopitaire-api] listening on http://${running.host}:${running.port} ` +
        `(static=${running.serveStatic ? 'on' : 'off'}, googleOAuth=${oauthState}, db=${running.store.dbPath})`
      );

      const shutdown = async () => {
        try {
          await running.close();
        } finally {
          process.exit(0);
        }
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error('[slopitaire-api] failed to start:', err);
      process.exit(1);
    });
}

module.exports = {
  createAppServer,
  startServer,
  loadDotEnv,
  parseAllowedOrigins,
  isOriginAllowed,
};
