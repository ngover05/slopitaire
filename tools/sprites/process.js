'use strict';
/* Slopitaire sprite processor: converts 11 raw white-background anime PNGs into decontaminated,
 * cropped/scaled RGBA PNG masters (art/sprites/), WebP runtime assets (images/), calibrated
 * faceStyle CSS vars, and a diagnostic dark/light contact sheet (tmp/contact_<girl>_<skin>.png).
 *
 * Usage:
 *   npx electron tools/sprites/process.js --girl <girl> --skin casual --in tmp/raw/<girl> [--crop-ratio 0.565] [--no-pockets]
 */
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MOODS = ['normal', 'happy', 'wink', 'oops', 'sad', 'thinking', 'special', 'hype', 'smug', 'shock', 'cheer'];
const DEFAULT_CROP_RATIO = 0.565;
const FULL_OUT_H = 1318;
const CORNER_OUT_H = 1146;
const ROOT = path.resolve(__dirname, '..', '..');

// CRITICAL: Isolate Chromium userData per process before app.whenReady() so all 7 art workers
// can execute concurrently on Windows without cache-lock collisions.
const tmpUd = fs.mkdtempSync(path.join(os.tmpdir(), 'slop-sprite-'));
let tmpCleaned = false;
let cleanerSpawned = false;
function cleanupTmpUd(allowAsyncFallback = false) {
  if (tmpCleaned) return;
  try {
    fs.rmSync(tmpUd, { recursive: true, force: true });
    if (!fs.existsSync(tmpUd)) {
      tmpCleaned = true;
      return;
    }
  } catch {
    // Windows Chromium may release remaining file handles only at final process teardown.
  }
  if (allowAsyncFallback && !cleanerSpawned && fs.existsSync(tmpUd)) {
    cleanerSpawned = true;
    try {
      const child = spawn(
        process.execPath,
        [
          '-e',
          `const fs=require('fs'),d=${JSON.stringify(tmpUd)};for(let i=0;i<30;i++){try{fs.rmSync(d,{recursive:true,force:true});if(!fs.existsSync(d))break;}catch{}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);}`,
        ],
        {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        }
      );
      child.unref();
      tmpCleaned = true;
    } catch {
      // Best-effort cleanup if detached spawn is unavailable.
    }
  }
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disk-cache-size', '1');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.setName(`slop-sprite-${process.pid}`);
app.setPath('userData', tmpUd);
app.on('window-all-closed', () => {});
app.on('will-quit', () => cleanupTmpUd(false));
process.on('exit', () => cleanupTmpUd(true));

// ---------- CLI ----------

function usage() {
  return `usage: npx electron tools/sprites/process.js --girl <girl> [--skin casual] --in <raw-dir> [options]

  --girl <name>        character id (required, e.g. sakura)
  --skin <name>        skin id (default: casual)
  --in <dir>           input directory containing all 11 <mood>.png files (required)
  --crop-ratio <num>   corner sprite vertical crop fraction (default: ${DEFAULT_CROP_RATIO})
  --no-pockets         skip trapped interior flat-white pocket removal
  --out-root <dir>     override output root directory (default: repo root)
  -h, --help           show this help
`;
}

// Keep only CLI arguments following this script path (like tools/sfx/main.js).
function scriptArgs() {
  const i = process.argv.findIndex((a) => {
    const resolved = path.resolve(a);
    return resolved === __filename || resolved === __dirname || path.resolve(`${a}.js`) === __filename;
  });
  return process.argv.slice(i >= 0 ? i + 1 : 2);
}

function parseArgs(argv) {
  const opts = {
    girl: '',
    skin: 'casual',
    inDir: '',
    cropRatio: DEFAULT_CROP_RATIO,
    noPockets: false,
    outRoot: ROOT,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inlineVal = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 2) {
      inlineVal = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    const val = () => {
      if (inlineVal !== null) return inlineVal;
      const v = argv[++i];
      if (v == null) throw new Error(`${a} requires a value`);
      return v;
    };
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--girl') opts.girl = val().trim();
    else if (a === '--skin') opts.skin = val().trim();
    else if (a === '--in') opts.inDir = val().trim();
    else if (a === '--crop-ratio') opts.cropRatio = Number(val());
    else if (a === '--no-pockets') opts.noPockets = true;
    else if (a === '--out-root') opts.outRoot = path.resolve(process.cwd(), val().trim());
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function validateOpts(opts) {
  const safeId = /^[a-zA-Z0-9_-]+$/;
  if (!opts.girl || !safeId.test(opts.girl)) {
    throw new Error(`--girl must be a valid identifier (got "${opts.girl}")`);
  }
  if (!opts.skin || !safeId.test(opts.skin)) {
    throw new Error(`--skin must be a valid identifier (got "${opts.skin}")`);
  }
  if (!opts.inDir) throw new Error('--in <dir> is required');
  if (!Number.isFinite(opts.cropRatio) || opts.cropRatio <= 0.1 || opts.cropRatio > 1.0) {
    throw new Error(`--crop-ratio must be in (0.1, 1.0] (got ${opts.cropRatio})`);
  }
  const inDir = path.resolve(process.cwd(), opts.inDir);
  if (!fs.existsSync(inDir) || !fs.statSync(inDir).isDirectory()) {
    throw new Error(`input directory not found: ${inDir}`);
  }
  const missing = MOODS.filter((m) => !fs.existsSync(path.join(inDir, `${m}.png`)));
  if (missing.length) {
    throw new Error(`missing input mood PNG(s) in ${inDir}: ${missing.map((m) => `${m}.png`).join(', ')}`);
  }
  return { ...opts, inDir };
}

// ---------- Renderer Pixel Pipeline ----------

// Installed once into the hidden BrowserWindow; processes one mood at a time via OffscreenCanvas
// and renders the diagnostic contact sheet so raw multi-megabyte bitmaps never stay resident in RAM.
const RENDERER_RUNTIME = `(() => {
  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function computeBbox(data, w, h, y0 = 0, y1 = h - 1) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    const ys = Math.max(0, y0);
    const ye = Math.min(h - 1, y1);
    for (let y = ys; y <= ye; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (data[(row + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return maxX < 0 ? null : { minX, minY, maxX, maxY };
  }

  function removeWhiteBgBfs(data, w, h) {
    const n = w * h;
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;

    const isBg = (idx) => {
      const p = idx * 4;
      const a = data[p + 3];
      if (a === 0) return true;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      return mn >= 236 && (mx - mn) <= 18;
    };

    const seed = (idx) => {
      if (!visited[idx] && isBg(idx)) {
        visited[idx] = 1;
        queue[tail++] = idx;
      }
    };

    for (let x = 0; x < w; x++) {
      seed(x);
      seed((h - 1) * w + x);
    }
    for (let y = 1; y < h - 1; y++) {
      seed(y * w);
      seed(y * w + (w - 1));
    }

    while (head < tail) {
      const idx = queue[head++];
      const p = idx * 4;
      data[p] = 0; data[p + 1] = 0; data[p + 2] = 0; data[p + 3] = 0;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0) seed(idx - 1);
      if (x + 1 < w) seed(idx + 1);
      if (y > 0) seed(idx - w);
      if (y + 1 < h) seed(idx + w);
    }
  }

  function findHeadCenterX(data, w, h, bbox) {
    const charH = bbox.maxY - bbox.minY + 1;
    const y0 = Math.max(0, bbox.minY + Math.floor(0.05 * charH));
    const y1 = Math.min(h - 1, bbox.minY + Math.ceil(0.30 * charH));
    const colCount = new Int32Array(w);
    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = bbox.minX; x <= bbox.maxX; x++) {
        if (data[(row + x) * 4 + 3] > 0) colCount[x]++;
      }
    }
    const span = bbox.maxX - bbox.minX + 1;
    const winW = Math.max(16, Math.min(span, Math.round(0.15 * charH)));
    let cur = 0;
    for (let x = bbox.minX; x < bbox.minX + winW; x++) cur += colCount[x];
    let bestSum = cur, bestX = bbox.minX;
    for (let x = bbox.minX + 1; x <= bbox.maxX - winW + 1; x++) {
      cur += colCount[x + winW - 1] - colCount[x - 1];
      if (cur > bestSum) { bestSum = cur; bestX = x; }
    }
    const coarseCenter = bestX + winW * 0.5;

    const sx0 = Math.max(bbox.minX, Math.floor(coarseCenter - 0.11 * charH));
    const sx1 = Math.min(bbox.maxX, Math.ceil(coarseCenter + 0.11 * charH));
    const sy0 = Math.max(0, bbox.minY + Math.floor(0.08 * charH));
    const sy1 = Math.min(h - 1, bbox.minY + Math.ceil(0.27 * charH));
    let skinSumX = 0, skinCount = 0;
    for (let y = sy0; y <= sy1; y++) {
      const row = y * w;
      for (let x = sx0; x <= sx1; x++) {
        const p = (row + x) * 4;
        const a = data[p + 3], r = data[p], g = data[p + 1], b = data[p + 2];
        if (a >= 128 && r >= 175 && g >= 115 && b >= 95 && r > b + 6 && r >= g - 10) {
          skinSumX += x;
          skinCount++;
        }
      }
    }
    return skinCount >= 60 ? skinSumX / skinCount : coarseCenter;
  }

  function removeTrappedPockets(data, w, h) {
    const bbox = computeBbox(data, w, h);
    if (!bbox) return 0;
    const charH = bbox.maxY - bbox.minY + 1;
    const headCenterX = findHeadCenterX(data, w, h, bbox);
    const protectTop = bbox.minY + 0.02 * charH;
    const protectBot = bbox.minY + 0.32 * charH;
    const protectHalfW = 0.085 * charH;

    const n = w * h;
    const visited = new Uint8Array(n);
    const compId = new Int32Array(n);
    const queue = new Int32Array(n);
    let nextComp = 1;
    let removedCount = 0;

    const isFlatWhite = (idx) => {
      const p = idx * 4;
      if (data[p + 3] === 0) return false;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      return mn >= 246 && (mx - mn) <= 10;
    };

    for (let i = 0; i < n; i++) {
      if (visited[i] || !isFlatWhite(i)) continue;
      const cid = nextComp++;
      let head = 0, tail = 0;
      visited[i] = 1;
      compId[i] = cid;
      queue[tail++] = i;

      while (head < tail) {
        const idx = queue[head++];
        const x = idx % w;
        const y = (idx - x) / w;
        const tryPush = (nIdx) => {
          if (!visited[nIdx] && isFlatWhite(nIdx)) {
            visited[nIdx] = 1;
            compId[nIdx] = cid;
            queue[tail++] = nIdx;
          }
        };
        if (x > 0) tryPush(idx - 1);
        if (x + 1 < w) tryPush(idx + 1);
        if (y > 0) tryPush(idx - w);
        if (y + 1 < h) tryPush(idx + w);
      }

      if (tail < 40) continue;

      let sumX = 0, sumY = 0, sumR = 0, sumG = 0, sumB = 0;
      for (let k = 0; k < tail; k++) {
        const idx = queue[k];
        const x = idx % w;
        const y = (idx - x) / w;
        const p = idx * 4;
        sumX += x; sumY += y;
        sumR += data[p]; sumG += data[p + 1]; sumB += data[p + 2];
      }
      const cx = sumX / tail;
      const cy = sumY / tail;

      // Strictly protect eye sclera, eye highlights, teeth, and central hair ornaments.
      if (tail < 2500 && cy >= protectTop && cy <= protectBot && Math.abs(cx - headCenterX) <= protectHalfW) {
        continue;
      }

      const mR = sumR / tail, mG = sumG / tail, mB = sumB / tail;
      let ssR = 0, ssG = 0, ssB = 0;
      for (let k = 0; k < tail; k++) {
        const p = queue[k] * 4;
        const dR = data[p] - mR, dG = data[p + 1] - mG, dB = data[p + 2] - mB;
        ssR += dR * dR; ssG += dG * dG; ssB += dB * dB;
      }
      const varR = ssR / tail, varG = ssG / tail, varB = ssB / tail;
      const maxVar = Math.max(varR, varG, varB);
      if (varR + varG + varB > 7.5 || maxVar > 4.0) continue;

      let borderTotal = 0, borderDark = 0;
      for (let k = 0; k < tail; k++) {
        const idx = queue[k];
        const x = idx % w;
        const y = (idx - x) / w;
        const isBorder =
          x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
          compId[idx - 1] !== cid || compId[idx + 1] !== cid ||
          compId[idx - w] !== cid || compId[idx + w] !== cid;
        if (!isBorder) continue;
        borderTotal++;

        // Scan 5x5 neighborhood outside the component to bridge 1-2px AA fringes into ink outlines.
        let hasDarkOutline = false;
        const x0 = Math.max(0, x - 2), x1 = Math.min(w - 1, x + 2);
        const y0 = Math.max(0, y - 2), y1 = Math.min(h - 1, y + 2);
        for (let ny = y0; ny <= y1 && !hasDarkOutline; ny++) {
          const row = ny * w;
          for (let nx = x0; nx <= x1; nx++) {
            const nIdx = row + nx;
            if (compId[nIdx] === cid) continue;
            const np = nIdx * 4;
            if (data[np + 3] === 0) continue;
            if (lum(data[np], data[np + 1], data[np + 2]) < 130) {
              hasDarkOutline = true;
              break;
            }
          }
        }
        if (hasDarkOutline) borderDark++;
      }

      if (borderTotal > 0 && (borderDark / borderTotal) >= 0.65) {
        for (let k = 0; k < tail; k++) {
          const p = queue[k] * 4;
          data[p] = 0; data[p + 1] = 0; data[p + 2] = 0; data[p + 3] = 0;
        }
        removedCount++;
      }
    }
    return removedCount;
  }

  function decontaminateAndPrune(data, w, h) {
    const n = w * h;
    const dist = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        if (data[idx * 4 + 3] === 0) continue;
        let touchesZero = (x === 0 || x === w - 1 || y === 0 || y === h - 1);
        if (!touchesZero) {
          for (let dy = -1; dy <= 1 && !touchesZero; dy++) {
            const nrow = (y + dy) * w;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (data[(nrow + x + dx) * 4 + 3] === 0) { touchesZero = true; break; }
            }
          }
        }
        dist[idx] = touchesZero ? 1 : 3;
      }
    }
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        if (dist[idx] !== 3) continue;
        let touchesOne = false;
        for (let dy = -1; dy <= 1 && !touchesOne; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          const nrow = ny * w;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            if (dist[nrow + nx] === 1) { touchesOne = true; break; }
          }
        }
        if (touchesOne) dist[idx] = 2;
      }
    }

    const src = new Uint8ClampedArray(data);
    const projectUnmix = (r, g, b, fr, fg, fb) => {
      const vx = fr - 255, vy = fg - 255, vz = fb - 255;
      const len2 = vx * vx + vy * vy + vz * vz;
      if (len2 < 16) return null;
      const dx = r - 255, dy = g - 255, dz = b - 255;
      const t = (dx * vx + dy * vy + dz * vz) / len2;
      const rx = dx - t * vx, ry = dy - t * vy, rz = dz - t * vz;
      const err = Math.hypot(rx, ry, rz);
      return { t: t < 0 ? 0 : t > 1 ? 1 : t, err };
    };

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        const d = dist[idx];
        if (d !== 1 && d !== 2) continue;

        const p = idx * 4;
        const r = src[p], g = src[p + 1], b = src[p + 2], a = src[p + 3];
        const lC = lum(r, g, b);

        // Protect interior pixels (skin/hair/shirt) sitting inside a 1px dark outline.
        if (d === 2) {
          let insideDarkEdge = false;
          for (let dy = -1; dy <= 1 && !insideDarkEdge; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            const nrow = ny * w;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= w) continue;
              const nIdx = nrow + nx;
              if (dist[nIdx] === 1) {
                const np = nIdx * 4;
                const nl = lum(src[np], src[np + 1], src[np + 2]);
                if (nl < lC - 10 && nl < 150) { insideDarkEdge = true; break; }
              }
            }
          }
          if (insideDarkEdge) continue;
        }

        const x0 = Math.max(0, x - 2), x1 = Math.min(w - 1, x + 2);
        const y0 = Math.max(0, y - 2), y1 = Math.min(h - 1, y + 2);

        const findBestRef = (minDist) => {
          let bestIdx = -1, bestL = 1e9;
          for (let ny = y0; ny <= y1; ny++) {
            const nrow = ny * w;
            for (let nx = x0; nx <= x1; nx++) {
              const nIdx = nrow + nx;
              if (dist[nIdx] < minDist) continue;
              const np = nIdx * 4;
              if (src[np + 3] === 0) continue;
              const nl = lum(src[np], src[np + 1], src[np + 2]);
              if (nl < bestL) { bestL = nl; bestIdx = nIdx; }
            }
          }
          return bestIdx;
        };

        let refIdx = findBestRef(3);
        if (refIdx < 0) refIdx = findBestRef(2);
        if (refIdx < 0) refIdx = findBestRef(1);
        if (refIdx < 0) continue;

        let rp = refIdx * 4;
        let fr = src[rp], fg = src[rp + 1], fb = src[rp + 2];
        let lRef = lum(fr, fg, fb);
        if (lC <= lRef + 3) continue;

        let proj = projectUnmix(r, g, b, fr, fg, fb);
        if (!proj || proj.err > 32) {
          // C has a distinct hue (e.g. skin near dark eyelash): seek a hue-consistent darker neighbor.
          let matchIdx = -1, matchL = 1e9, matchProj = null;
          for (const minD of [3, 2]) {
            for (let ny = y0; ny <= y1; ny++) {
              const nrow = ny * w;
              for (let nx = x0; nx <= x1; nx++) {
                const nIdx = nrow + nx;
                if (dist[nIdx] < minD) continue;
                const np = nIdx * 4;
                if (src[np + 3] === 0) continue;
                const nl = lum(src[np], src[np + 1], src[np + 2]);
                if (nl >= lC - 4) continue;
                const cand = projectUnmix(r, g, b, src[np], src[np + 1], src[np + 2]);
                if (cand && cand.err <= 26 && nl < matchL) {
                  matchL = nl; matchIdx = nIdx; matchProj = cand;
                }
              }
            }
            if (matchIdx >= 0) break;
          }
          if (matchIdx < 0) continue;
          rp = matchIdx * 4;
          fr = src[rp]; fg = src[rp + 1]; fb = src[rp + 2];
          proj = matchProj;
        }

        const t = proj.t;
        const newA = Math.round(a * t);
        if (newA < 4) {
          data[p] = 0; data[p + 1] = 0; data[p + 2] = 0; data[p + 3] = 0;
        } else if (t < 0.99) {
          if (t >= 0.25) {
            data[p] = clamp255(Math.round(255 + (r - 255) / t));
            data[p + 1] = clamp255(Math.round(255 + (g - 255) / t));
            data[p + 2] = clamp255(Math.round(255 + (b - 255) / t));
          } else {
            data[p] = fr; data[p + 1] = fg; data[p + 2] = fb;
          }
          data[p + 3] = newA;
        }
      }
    }

    // Prune disconnected tiny specks (< 25px, 8-connected).
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    let pruned = 0;
    for (let i = 0; i < n; i++) {
      if (visited[i] || data[i * 4 + 3] === 0) continue;
      let head = 0, tail = 0;
      visited[i] = 1;
      queue[tail++] = i;
      while (head < tail) {
        const idx = queue[head++];
        const x = idx % w;
        const y = (idx - x) / w;
        const x0 = x > 0 ? x - 1 : 0, x1 = x + 1 < w ? x + 1 : w - 1;
        const y0 = y > 0 ? y - 1 : 0, y1 = y + 1 < h ? y + 1 : h - 1;
        for (let ny = y0; ny <= y1; ny++) {
          const nrow = ny * w;
          for (let nx = x0; nx <= x1; nx++) {
            const nIdx = nrow + nx;
            if (!visited[nIdx] && data[nIdx * 4 + 3] > 0) {
              visited[nIdx] = 1;
              queue[tail++] = nIdx;
            }
          }
        }
      }
      if (tail < 25) {
        for (let k = 0; k < tail; k++) {
          const p = queue[k] * 4;
          data[p] = 0; data[p + 1] = 0; data[p + 2] = 0; data[p + 3] = 0;
        }
        pruned++;
      }
    }
    return pruned;
  }

  function cropAndScale(srcCanvas, sx, sy, sw, sh, outH, padTop, padBot, padX) {
    const cropCanvas = new OffscreenCanvas(sw, sh);
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.imageSmoothingEnabled = false;
    cropCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const innerH = outH - padTop - padBot;
    const scale = innerH / sh;
    const innerW = Math.max(1, Math.round(sw * scale));
    const outW = innerW + padX * 2;
    const outCanvas = new OffscreenCanvas(outW, outH);
    const outCtx = outCanvas.getContext('2d');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(cropCanvas, 0, 0, sw, sh, padX, padTop, innerW, innerH);
    return outCanvas;
  }

  function computeFaceStyle(cornerCanvas) {
    const Wc = cornerCanvas.width;
    const Hc = cornerCanvas.height;
    const ctx = cornerCanvas.getContext('2d', { willReadFrequently: true });
    const yStart = 80, yEnd = 340;
    const slice = ctx.getImageData(0, yStart, Wc, yEnd - yStart + 1).data;

    const skinX = [];
    let minOpaqueX = Wc, maxOpaqueX = -1;
    for (let dy = 0; dy <= yEnd - yStart; dy++) {
      const y = yStart + dy;
      const row = dy * Wc;
      for (let x = 0; x < Wc; x++) {
        const p = (row + x) * 4;
        const a = slice[p + 3];
        if (a < 128) continue;
        if (x < minOpaqueX) minOpaqueX = x;
        if (x > maxOpaqueX) maxOpaqueX = x;
        if (y >= 120 && y <= 330) {
          const r = slice[p], g = slice[p + 1], b = slice[p + 2];
          if (r >= 175 && g >= 115 && b >= 95 && r > b + 6 && r >= g - 10) {
            skinX.push(x);
          }
        }
      }
    }

    let faceMidX;
    if (skinX.length >= 80) {
      skinX.sort((a, b) => a - b);
      const p2 = skinX[Math.floor(skinX.length * 0.02)];
      const p98 = skinX[Math.min(skinX.length - 1, Math.floor(skinX.length * 0.98))];
      faceMidX = (p2 + p98) * 0.5;
    } else if (maxOpaqueX >= 0) {
      faceMidX = (minOpaqueX + maxOpaqueX) * 0.5;
    } else {
      faceMidX = Wc * 0.5;
    }

    const cx = faceMidX / Wc;
    const fw = Math.max(150, Math.min(205, Math.round(222 * Wc / Hc)));
    const fl = Math.round(50 - cx * fw);
    const ft = -3;
    return { fw, fl, ft, cx, css: '--fw:' + fw + '%;--fl:' + fl + '%;--ft:' + ft + '%' };
  }

  let contact = null;

  function initContact(meta) {
    const W = 2020, H = 1360;
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a131a';
    ctx.fillRect(0, 0, W, 680);
    ctx.fillStyle = '#fff0f5';
    ctx.fillRect(0, 680, W, 680);

    ctx.fillStyle = '#ecf8f5';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(meta.girl + ' / ' + meta.skin + '  (cropRatio=' + meta.cropRatio + ', pockets=' + (!meta.noPockets) + ')', 24, 34);
    ctx.fillStyle = '#8aa8bd';
    ctx.font = '14px monospace';
    ctx.fillText('DARK #0a131a', 24, 58);

    ctx.fillStyle = '#2d1c27';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('LIGHT #fff0f5', 24, 710);

    contact = { canvas, ctx, faceStyle: null };
  }

  function drawCastFacePreview(ctx, cornerCanvas, cx, cy, size, fs, bgFill, ringStroke) {
    const r = size * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bgFill;
    ctx.fill();
    ctx.clip();

    const drawW = size * (fs.fw / 100);
    const drawH = drawW * (cornerCanvas.height / cornerCanvas.width);
    const drawX = (cx - r) + size * (fs.fl / 100);
    const drawY = (cy - r) + size * (fs.ft / 100);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cornerCanvas, drawX, drawY, drawW, drawH);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ringStroke;
    ctx.stroke();
    ctx.restore();
  }

  function drawContactMood(mood, idx, fullCanvas, cornerCanvas, faceStyle) {
    const ctx = contact.ctx;
    const cellX = 20 + idx * 180;

    if (faceStyle && !contact.faceStyle) {
      contact.faceStyle = faceStyle;
      ctx.fillStyle = '#2ce8a2';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('FACE_STYLE: ' + faceStyle.css, 700, 34);
      ctx.fillStyle = '#ecf8f5';
      ctx.font = '12px sans-serif';
      ctx.fillText('54x54 normal', 1732, 78);
      ctx.fillText('64px zoom', 1900, 78);
      drawCastFacePreview(ctx, cornerCanvas, 1770, 35, 54, faceStyle, '#122330', '#2ce8a2');
      drawCastFacePreview(ctx, cornerCanvas, 1932, 34, 64, faceStyle, '#122330', '#2ce8a2');
      drawCastFacePreview(ctx, cornerCanvas, 1770, 715, 54, faceStyle, '#ffe4ee', '#d64878');
    }
    if (mood === 'wink' && contact.faceStyle) {
      ctx.fillStyle = '#ecf8f5';
      ctx.font = '12px sans-serif';
      ctx.fillText('54x54 wink', 1814, 78);
      drawCastFacePreview(ctx, cornerCanvas, 1844, 35, 54, contact.faceStyle, '#122330', '#2ce8a2');
      drawCastFacePreview(ctx, cornerCanvas, 1844, 715, 54, contact.faceStyle, '#ffe4ee', '#d64878');
    }

    const drawFit = (img, boxX, boxY, boxW, boxH, alignBottom) => {
      const s = Math.min(boxW / img.width, boxH / img.height);
      const dw = img.width * s;
      const dh = img.height * s;
      const dx = boxX + (boxW - dw) * 0.5;
      const dy = alignBottom ? (boxY + boxH - dh) : (boxY + (boxH - dh) * 0.5);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, dx, dy, dw, dh);
    };

    // Dark half: full row + corner row
    drawFit(fullCanvas, cellX + 6, 86, 168, 294, true);
    ctx.strokeStyle = 'rgba(44,232,162,0.35)';
    ctx.beginPath(); ctx.moveTo(cellX + 6, 380.5); ctx.lineTo(cellX + 174, 380.5); ctx.stroke();
    ctx.fillStyle = '#cfe2ee';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(mood + ' (' + fullCanvas.width + ')', cellX + 8, 398);

    drawFit(cornerCanvas, cellX + 6, 410, 168, 232, true);
    ctx.strokeStyle = '#2ce8a2';
    ctx.beginPath(); ctx.moveTo(cellX + 6, 642.5); ctx.lineTo(cellX + 174, 642.5); ctx.stroke();
    ctx.fillStyle = '#8aa8bd';
    ctx.font = '12px monospace';
    ctx.fillText('corner (' + cornerCanvas.width + ')', cellX + 8, 660);

    // Light half: full row + corner row
    drawFit(fullCanvas, cellX + 6, 754, 168, 294, true);
    ctx.strokeStyle = 'rgba(214,72,120,0.35)';
    ctx.beginPath(); ctx.moveTo(cellX + 6, 1048.5); ctx.lineTo(cellX + 174, 1048.5); ctx.stroke();
    ctx.fillStyle = '#3d2233';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(mood + ' (' + fullCanvas.width + ')', cellX + 8, 1066);

    drawFit(cornerCanvas, cellX + 6, 1078, 168, 232, true);
    ctx.strokeStyle = '#d64878';
    ctx.beginPath(); ctx.moveTo(cellX + 6, 1310.5); ctx.lineTo(cellX + 174, 1310.5); ctx.stroke();
    ctx.fillStyle = '#754b62';
    ctx.font = '12px monospace';
    ctx.fillText('corner (' + cornerCanvas.width + ')', cellX + 8, 1328);
  }

  async function blobBytes(canvas, type, quality) {
    const opts = quality !== undefined ? { type, quality } : { type };
    const blob = await canvas.convertToBlob(opts);
    return new Uint8Array(await blob.arrayBuffer());
  }

  window.__spriteTool = {
    initContact,
    async processMood(job) {
      const res = await fetch(job.fileUrl);
      if (!res.ok) throw new Error('failed to load ' + job.fileUrl + ': ' + res.status);
      const bmp = await createImageBitmap(await res.blob());
      const w = bmp.width, h = bmp.height;
      const work = new OffscreenCanvas(w, h);
      const wCtx = work.getContext('2d', { willReadFrequently: true });
      wCtx.imageSmoothingEnabled = false;
      wCtx.drawImage(bmp, 0, 0);
      bmp.close();

      const img = wCtx.getImageData(0, 0, w, h);
      const data = img.data;

      removeWhiteBgBfs(data, w, h);
      const pocketsRemoved = job.noPockets ? 0 : removeTrappedPockets(data, w, h);
      const specksPruned = decontaminateAndPrune(data, w, h);

      const fullBox = computeBbox(data, w, h);
      if (!fullBox) throw new Error(job.mood + '.png became empty after background removal');
      wCtx.putImageData(img, 0, 0);

      const charW = fullBox.maxX - fullBox.minX + 1;
      const charH = fullBox.maxY - fullBox.minY + 1;
      const fullCanvas = cropAndScale(work, fullBox.minX, fullBox.minY, charW, charH, ${FULL_OUT_H}, 6, 4, 8);

      const sliceTargetEnd = Math.min(fullBox.maxY, fullBox.minY + Math.round(charH * job.cropRatio) - 1);
      const sliceBox = computeBbox(data, w, h, fullBox.minY, sliceTargetEnd);
      if (!sliceBox) throw new Error(job.mood + '.png corner slice is empty');
      const sW = sliceBox.maxX - sliceBox.minX + 1;
      const sH = sliceBox.maxY - sliceBox.minY + 1;
      const cornerCanvas = cropAndScale(work, sliceBox.minX, sliceBox.minY, sW, sH, ${CORNER_OUT_H}, 6, 0, 8);

      // Verify bottom scanline y = 1145 contains opaque skirt/clothing pixels.
      const botRow = cornerCanvas.getContext('2d', { willReadFrequently: true })
        .getImageData(0, ${CORNER_OUT_H - 1}, cornerCanvas.width, 1).data;
      let bottomOpaque = 0;
      for (let x = 0; x < cornerCanvas.width; x++) {
        if (botRow[x * 4 + 3] >= 128) bottomOpaque++;
      }

      const faceStyle = job.mood === 'normal' ? computeFaceStyle(cornerCanvas) : null;
      drawContactMood(job.mood, job.idx, fullCanvas, cornerCanvas, faceStyle);

      const [fullPng, fullWebp, cornerPng, cornerWebp] = await Promise.all([
        blobBytes(fullCanvas, 'image/png'),
        blobBytes(fullCanvas, 'image/webp', 0.86),
        blobBytes(cornerCanvas, 'image/png'),
        blobBytes(cornerCanvas, 'image/webp', 0.86),
      ]);

      return {
        srcSize: [w, h],
        fullSize: [fullCanvas.width, fullCanvas.height],
        cornerSize: [cornerCanvas.width, cornerCanvas.height],
        pocketsRemoved,
        specksPruned,
        bottomOpaque,
        faceStyle,
        fullPng,
        fullWebp,
        cornerPng,
        cornerWebp,
      };
    },
    async exportContact() {
      return blobBytes(contact.canvas, 'image/png');
    },
  };
})();`;

// ---------- File Output ----------

function writeAtomic(filePath, buf) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, filePath);
}

// ---------- Main ----------

async function main() {
  const rawOpts = parseArgs(scriptArgs());
  if (rawOpts.help) {
    process.stdout.write(usage());
    return 0;
  }
  const opts = validateOpts(rawOpts);

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });

  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body></body></html>'));
    await win.webContents.executeJavaScript(RENDERER_RUNTIME);
    await win.webContents.executeJavaScript(
      `window.__spriteTool.initContact(${JSON.stringify({
        girl: opts.girl,
        skin: opts.skin,
        cropRatio: opts.cropRatio,
        noPockets: opts.noPockets,
      })})`
    );

    const artSkinDir = path.join(opts.outRoot, 'art', 'sprites', opts.girl, opts.skin);
    const imgSkinDir = path.join(opts.outRoot, 'images', opts.girl, opts.skin);
    const masterStem = opts.skin === 'default' ? opts.girl : `${opts.girl}_${opts.skin}`;
    const artMaster = path.join(opts.outRoot, 'art', 'sprites', `${masterStem}.png`);
    const imgMaster = path.join(opts.outRoot, 'images', `${masterStem}.webp`);
    const contactPath = path.join(opts.outRoot, 'tmp', `contact_${opts.girl}_${opts.skin}.png`);

    let faceStyleCss = '';
    for (let idx = 0; idx < MOODS.length; idx++) {
      const mood = MOODS[idx];
      const inFile = path.join(opts.inDir, `${mood}.png`);
      const job = {
        mood,
        idx,
        fileUrl: pathToFileURL(inFile).href,
        cropRatio: opts.cropRatio,
        noPockets: opts.noPockets,
      };
      const out = await win.webContents.executeJavaScript(`window.__spriteTool.processMood(${JSON.stringify(job)})`);

      const fullPngBuf = Buffer.from(out.fullPng);
      const fullWebpBuf = Buffer.from(out.fullWebp);
      const cornerPngBuf = Buffer.from(out.cornerPng);
      const cornerWebpBuf = Buffer.from(out.cornerWebp);

      writeAtomic(path.join(artSkinDir, `full_${mood}.png`), fullPngBuf);
      writeAtomic(path.join(artSkinDir, `corner_${mood}.png`), cornerPngBuf);
      writeAtomic(path.join(imgSkinDir, `full_${mood}.webp`), fullWebpBuf);
      writeAtomic(path.join(imgSkinDir, `corner_${mood}.webp`), cornerWebpBuf);

      if (mood === 'normal') {
        writeAtomic(artMaster, fullPngBuf);
        writeAtomic(imgMaster, fullWebpBuf);
        faceStyleCss = out.faceStyle.css;
      }

      const warn = out.bottomOpaque === 0 ? ' [WARN: y=1145 has 0 opaque pixels]' : '';
      console.log(
        `${mood.padEnd(9)} ${out.srcSize[0]}x${out.srcSize[1]} -> `
        + `full ${out.fullSize[0]}x${out.fullSize[1]} (${(fullWebpBuf.length / 1024).toFixed(1)}KB), `
        + `corner ${out.cornerSize[0]}x${out.cornerSize[1]} (${(cornerWebpBuf.length / 1024).toFixed(1)}KB), `
        + `botPx=${out.bottomOpaque}, pockets=${out.pocketsRemoved}, specks=${out.specksPruned}${warn}`
      );
    }

    const contactBytes = await win.webContents.executeJavaScript('window.__spriteTool.exportContact()');
    writeAtomic(contactPath, Buffer.from(contactBytes));
    console.log(`CONTACT_SHEET: ${path.relative(opts.outRoot, contactPath).replace(/\\/g, '/')}`);
    console.log(`FACE_STYLE: ${faceStyleCss}`);
    return 0;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

app.whenReady()
  .then(main)
  .then(
    (code) => {
      cleanupTmpUd();
      process.exitCode = code;
      app.quit();
    },
    (err) => {
      console.error(`error: ${err && err.stack ? err.stack : err}`);
      cleanupTmpUd();
      process.exitCode = 1;
      app.quit();
    }
  );
