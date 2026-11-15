/* Slopitaire — Klondike solver.
 *  - solve():   fast, move-pruned search used to hand out guaranteed-winnable deals on Easy.
 *  - analyze(): exhaustive search from any mid-game position, used to prove a game can no longer be won.
 * Cards are ints 0..51: suit = c/13|0 (0♥ 1♦ 2♣ 3♠), rank = c%13 + 1.
 * Deck order: the last element is the top of the deck. Dealing must match the game's deal().
 * Written as a self-contained factory so the game can also run it inside a Web Worker (via toString()).
 */
function solverFactory() {
  'use strict';

  const imul = Math.imul;
  const now = Date.now;

  // Precomputed card property tables (zero closure dependencies for Web Worker toString())
  const SUIT = new Uint8Array(52);
  const RANK = new Uint8Array(52);
  const IS_RED = new Uint8Array(52);
  for (let c = 0; c < 52; c++) {
    const s = (c / 13) | 0;
    SUIT[c] = s;
    RANK[c] = (c % 13) + 1;
    IS_RED[c] = s < 2 ? 1 : 0;
  }

  // Deterministic SplitMix32 PRNG for 96-bit Zobrist tables
  let rngState = 0x9e3779b9;
  function sm32() {
    rngState = (rngState + 0x9e3779b9) | 0;
    let z = rngState;
    z = imul(z ^ (z >>> 16), 0x85ebca6b);
    z = imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  }
  function makeTable(len) {
    const t = new Uint32Array(len);
    for (let i = 0; i < len; i++) t[i] = sm32();
    return t;
  }

  const CARD_H1 = makeTable(52), CARD_H2 = makeTable(52), CARD_H3 = makeTable(52);
  const IDX_H1 = makeTable(21), IDX_H2 = makeTable(21), IDX_H3 = makeTable(21);
  const DN_H1 = makeTable(7), DN_H2 = makeTable(7), DN_H3 = makeTable(7);
  const FND_H1 = makeTable(64), FND_H2 = makeTable(64), FND_H3 = makeTable(64);
  const STK_H1 = makeTable(25 * 64), STK_H2 = makeTable(25 * 64), STK_H3 = makeTable(25 * 64);
  const WST_H1 = makeTable(25 * 64), WST_H2 = makeTable(25 * 64), WST_H3 = makeTable(25 * 64);
  const PASS_H1 = makeTable(65), PASS_H2 = makeTable(65), PASS_H3 = makeTable(65);

  // Reusable open-addressed 96-bit hash table with O(1) stamp reset
  let seenCap = 4096;
  let seenMask = seenCap - 1;
  let seenStamps = new Uint32Array(seenCap);
  let seenKeys = new Uint32Array(seenCap * 3);
  let seenSize = 0;
  let seenCurStamp = 1;

  function seenReset() {
    seenSize = 0;
    seenCurStamp++;
    if (seenCurStamp > 0xffffffff) {
      seenStamps.fill(0);
      seenCurStamp = 1;
    }
  }

  function seenGrow() {
    const oldCap = seenCap;
    const oldStamps = seenStamps;
    const oldKeys = seenKeys;
    const oldStamp = seenCurStamp;
    seenCap = oldCap << 1;
    seenMask = seenCap - 1;
    seenStamps = new Uint32Array(seenCap);
    seenKeys = new Uint32Array(seenCap * 3);
    const newStamp = 1;
    for (let i = 0; i < oldCap; i++) {
      if (oldStamps[i] !== oldStamp) continue;
      const ob = i * 3;
      const k1 = oldKeys[ob], k2 = oldKeys[ob + 1], k3 = oldKeys[ob + 2];
      let slot = k1 & seenMask;
      while (seenStamps[slot] === newStamp) slot = (slot + 1) & seenMask;
      seenStamps[slot] = newStamp;
      const nb = slot * 3;
      seenKeys[nb] = k1;
      seenKeys[nb + 1] = k2;
      seenKeys[nb + 2] = k3;
    }
    seenCurStamp = newStamp;
  }

  // Flat 512-byte-per-depth state pool for zero-allocation search
  // Layout per state (488 bytes used, 512 stride):
  //   0..363:   t[0..6] (7 * 52 bytes)
  //   364..415: s (52 bytes)
  //   416..467: w (52 bytes)
  //   468..474: colLen[0..6]
  //   475..481: dn[0..6]
  //   482..485: f[0..3]
  //   486:      slen
  //   487:      wlen
  const OFF_S = 364;
  const OFF_W = 416;
  const OFF_CLEN = 468;
  const OFF_DN = 475;
  const OFF_F = 482;
  const OFF_SLEN = 486;
  const OFF_WLEN = 487;
  const STATE_BYTES = 488;

  let poolCap = 2048;
  let statePool = new Uint8Array(poolCap << 9);
  let pPool = new Int32Array(poolCap);

  function ensureStateDepth(d) {
    if (d < poolCap) return;
    let newCap = poolCap << 1;
    while (newCap <= d) newCap <<= 1;
    const ns = new Uint8Array(newCap << 9);
    ns.set(statePool);
    statePool = ns;
    const np = new Int32Array(newCap);
    np.set(pPool);
    pPool = np;
    poolCap = newCap;
  }

  function copyState(dstDepth, srcDepth) {
    const srcBase = srcDepth << 9;
    const dstBase = dstDepth << 9;
    statePool.copyWithin(dstBase, srcBase, srcBase + STATE_BYTES);
    pPool[dstDepth] = pPool[srcDepth];
  }

  function loadState(depth, st) {
    ensureStateDepth(depth);
    const base = depth << 9;
    const t = st.t, dn = st.dn, f = st.f, s = st.s, w = st.w;
    for (let i = 0; i < 7; i++) {
      const col = t[i], len = col.length;
      statePool[base + OFF_CLEN + i] = len;
      let dni = dn[i];
      if (!len) dni = 0;
      else if (dni >= len) dni = len - 1;
      statePool[base + OFF_DN + i] = dni;
      const cOff = base + i * 52;
      for (let k = 0; k < len; k++) statePool[cOff + k] = col[k];
    }
    for (let su = 0; su < 4; su++) statePool[base + OFF_F + su] = f[su];
    const slen = s.length;
    statePool[base + OFF_SLEN] = slen;
    for (let k = 0; k < slen; k++) statePool[base + OFF_S + k] = s[k];
    const wlen = w.length;
    statePool[base + OFF_WLEN] = wlen;
    for (let k = 0; k < wlen; k++) statePool[base + OFF_W + k] = w[k];
    pPool[depth] = st.p;
  }

  function loadDeck(depth, deck) {
    ensureStateDepth(depth);
    const base = depth << 9;
    let dTop = deck.length;
    for (let i = 0; i < 7; i++) {
      statePool[base + OFF_CLEN + i] = 0;
      statePool[base + OFF_DN + i] = i;
    }
    for (let i = 0; i < 7; i++) {
      for (let j = i; j < 7; j++) {
        const len = statePool[base + OFF_CLEN + j];
        statePool[base + j * 52 + len] = deck[--dTop];
        statePool[base + OFF_CLEN + j] = len + 1;
      }
    }
    statePool[base + OFF_F] = 0;
    statePool[base + OFF_F + 1] = 0;
    statePool[base + OFF_F + 2] = 0;
    statePool[base + OFF_F + 3] = 0;
    statePool[base + OFF_SLEN] = dTop;
    for (let k = 0; k < dTop; k++) statePool[base + OFF_S + k] = deck[k];
    statePool[base + OFF_WLEN] = 0;
    pPool[depth] = 1;
  }

  // Returns true if state at depth was unseen and inserted, false if already visited
  function seenInsertAt(depth, withPasses) {
    const base = depth << 9;
    let sum1 = 0, sum2 = 0, xor3 = 0;
    const clb = base + OFF_CLEN;
    const dnb = base + OFF_DN;
    for (let i = 0; i < 7; i++) {
      const len = statePool[clb + i];
      if (!len) continue;
      const dn = statePool[dnb + i];
      let c1, c2, c3;
      if (dn < 7) {
        c1 = DN_H1[dn]; c2 = DN_H2[dn]; c3 = DN_H3[dn];
      } else {
        c1 = imul(dn + 1, 0x9e3779b1);
        c2 = imul(dn + 1, 0xc2b2ae35);
        c3 = imul(dn + 1, 0x27d4eb2f);
      }
      const cOff = base + i * 52;
      if (len <= 21) {
        for (let k = 0; k < len; k++) {
          const c = statePool[cOff + k];
          c1 = imul(c1 ^ CARD_H1[c] ^ IDX_H1[k], 0x85ebca6b);
          c2 = imul(c2 ^ CARD_H2[c] ^ IDX_H2[k], 0xc2b2ae35);
          c3 = imul(c3 + (CARD_H3[c] ^ IDX_H3[k]), 0x27d4eb2f);
        }
      } else {
        for (let k = 0; k < len; k++) {
          const c = statePool[cOff + k];
          const ik = k < 21 ? IDX_H1[k] : imul(k + 1, 0x9e3779b1);
          const ik2 = k < 21 ? IDX_H2[k] : ik;
          const ik3 = k < 21 ? IDX_H3[k] : ik;
          c1 = imul(c1 ^ CARD_H1[c] ^ ik, 0x85ebca6b);
          c2 = imul(c2 ^ CARD_H2[c] ^ ik2, 0xc2b2ae35);
          c3 = imul(c3 + (CARD_H3[c] ^ ik3), 0x27d4eb2f);
        }
      }
      c1 ^= c2 >>> 11; c2 ^= c3 >>> 13; c3 ^= c1 >>> 17;
      c1 = imul(c1 ^ (c1 >>> 16), 0x85ebca6b);
      c2 = imul(c2 ^ (c2 >>> 16), 0xc2b2ae35);
      c3 = imul(c3 ^ (c3 >>> 16), 0x27d4eb2f);
      c1 ^= c1 >>> 15; c2 ^= c2 >>> 15; c3 ^= c3 >>> 15;
      sum1 = (sum1 + c1) | 0;
      sum2 = (sum2 + c2) | 0;
      xor3 ^= c3;
    }

    let h1 = sum1 ^ 0x243f6a88;
    let h2 = sum2 ^ 0x85a308d3;
    let h3 = xor3 ^ 0x13198a2e;
    const fb = base + OFF_F;
    const f0 = statePool[fb], f1 = 16 | statePool[fb + 1], f2 = 32 | statePool[fb + 2], f3 = 48 | statePool[fb + 3];
    h1 ^= FND_H1[f0] ^ FND_H1[f1] ^ FND_H1[f2] ^ FND_H1[f3];
    h2 ^= FND_H2[f0] ^ FND_H2[f1] ^ FND_H2[f2] ^ FND_H2[f3];
    h3 ^= FND_H3[f0] ^ FND_H3[f1] ^ FND_H3[f2] ^ FND_H3[f3];

    const slen = statePool[base + OFF_SLEN];
    const sb = base + OFF_S;
    if (slen <= 25) {
      for (let k = 0; k < slen; k++) {
        const off = (k << 6) | statePool[sb + k];
        h1 ^= STK_H1[off]; h2 ^= STK_H2[off]; h3 ^= STK_H3[off];
      }
    } else {
      for (let k = 0; k < slen; k++) {
        const c = statePool[sb + k];
        if (k < 25) {
          const off = (k << 6) | c;
          h1 ^= STK_H1[off]; h2 ^= STK_H2[off]; h3 ^= STK_H3[off];
        } else {
          const v = (k << 6) | c;
          h1 ^= imul(v, 0x9e3779b1);
          h2 ^= imul(v, 0x85ebca6b);
          h3 ^= imul(v, 0xc2b2ae35);
        }
      }
    }

    const wlen = statePool[base + OFF_WLEN];
    const wb = base + OFF_W;
    if (wlen <= 25) {
      for (let k = 0; k < wlen; k++) {
        const off = (k << 6) | statePool[wb + k];
        h1 ^= WST_H1[off]; h2 ^= WST_H2[off]; h3 ^= WST_H3[off];
      }
    } else {
      for (let k = 0; k < wlen; k++) {
        const c = statePool[wb + k];
        if (k < 25) {
          const off = (k << 6) | c;
          h1 ^= WST_H1[off]; h2 ^= WST_H2[off]; h3 ^= WST_H3[off];
        } else {
          const v = (k << 6) | c;
          h1 ^= imul(v, 0x27d4eb2f);
          h2 ^= imul(v, 0x165667b1);
          h3 ^= imul(v, 0x9e3779b1);
        }
      }
    }

    if (withPasses) {
      const p = pPool[depth];
      if (p >= 0 && p <= 64) {
        h1 ^= PASS_H1[p]; h2 ^= PASS_H2[p]; h3 ^= PASS_H3[p];
      } else {
        h1 ^= imul(p + 1, 0x9e3779b1);
        h2 ^= imul(p + 1, 0x85ebca6b);
        h3 ^= imul(p + 1, 0xc2b2ae35);
      }
    }

    h1 = imul(h1 ^ (h1 >>> 16), 0x85ebca6b) >>> 0;
    h2 = imul(h2 ^ (h2 >>> 16), 0xc2b2ae35) >>> 0;
    h3 = imul(h3 ^ (h3 >>> 16), 0x27d4eb2f) >>> 0;
    if ((h1 | h2 | h3) === 0) h1 = 1;

    if (seenSize * 3 >= seenCap * 2) seenGrow();
    let slot = h1 & seenMask;
    const stamp = seenCurStamp;
    while (seenStamps[slot] === stamp) {
      const b = slot * 3;
      if (seenKeys[b] === h1 && seenKeys[b + 1] === h2 && seenKeys[b + 2] === h3) return false;
      slot = (slot + 1) & seenMask;
    }
    seenStamps[slot] = stamp;
    const b = slot * 3;
    seenKeys[b] = h1;
    seenKeys[b + 1] = h2;
    seenKeys[b + 2] = h3;
    seenSize++;
    return true;
  }

  // Reusable packed-move buffer + iterative DFS frame stacks
  let moveBuf = new Int32Array(65536);
  function ensureMoveCap(needed) {
    if (needed <= moveBuf.length) return;
    let newCap = moveBuf.length << 1;
    while (newCap < needed) newCap <<= 1;
    const nb = new Int32Array(newCap);
    nb.set(moveBuf);
    moveBuf = nb;
  }

  let frameStart = new Int32Array(2048);
  let frameEnd = new Int32Array(2048);
  let frameCur = new Int32Array(2048);
  function ensureFrameCap(d) {
    if (d < frameStart.length) return;
    let newCap = frameStart.length << 1;
    while (newCap <= d) newCap <<= 1;
    const ns = new Int32Array(newCap); ns.set(frameStart); frameStart = ns;
    const ne = new Int32Array(newCap); ne.set(frameEnd); frameEnd = ne;
    const nc = new Int32Array(newCap); nc.set(frameCur); frameCur = nc;
  }

  function deal(deck) {
    const d = deck.slice(), t = [[], [], [], [], [], [], []];
    for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) t[j].push(d.pop());
    return { t, dn: [0, 1, 2, 3, 4, 5, 6], f: [0, 0, 0, 0], s: d, w: [], p: 1 };
  }

  function clone(st) {
    const t = st.t, dn = st.dn, f = st.f;
    return {
      t: [t[0].slice(), t[1].slice(), t[2].slice(), t[3].slice(), t[4].slice(), t[5].slice(), t[6].slice()],
      dn: [dn[0], dn[1], dn[2], dn[3], dn[4], dn[5], dn[6]],
      f: [f[0], f[1], f[2], f[3]],
      s: st.s.slice(),
      w: st.w.slice(),
      p: st.p,
    };
  }

  function fix(st, i) {
    const col = st.t[i];
    if (!col.length) st.dn[i] = 0;
    else if (st.dn[i] >= col.length) st.dn[i] = col.length - 1;
  }

  function safeAt(base, c) {
    const r = RANK[c];
    if (r <= 2) return true;
    const need = r - 1, fb = base + OFF_F;
    return IS_RED[c] ? (statePool[fb + 2] >= need && statePool[fb + 3] >= need) : (statePool[fb] >= need && statePool[fb + 1] >= need);
  }

  function autoplayAt(depth) {
    const base = depth << 9;
    const fb = base + OFF_F;
    const clb = base + OFF_CLEN;
    const dnb = base + OFF_DN;
    const wb = base + OFF_W;
    let moved = true;
    while (moved) {
      moved = false;
      for (let i = 0; i < 7; i++) {
        let len = statePool[clb + i];
        if (!len) continue;
        const c = statePool[base + i * 52 + len - 1];
        const s = SUIT[c];
        if (statePool[fb + s] === RANK[c] - 1 && safeAt(base, c)) {
          len--;
          statePool[clb + i] = len;
          statePool[fb + s]++;
          if (!len) statePool[dnb + i] = 0;
          else if (statePool[dnb + i] >= len) statePool[dnb + i] = len - 1;
          moved = true;
        }
      }
      const wlen = statePool[base + OFF_WLEN];
      if (wlen) {
        const c = statePool[wb + wlen - 1];
        const s = SUIT[c];
        if (statePool[fb + s] === RANK[c] - 1 && safeAt(base, c)) {
          statePool[base + OFF_WLEN] = wlen - 1;
          statePool[fb + s]++;
          moved = true;
        }
      }
    }
  }

  function safeObj(st, c) {
    const r = RANK[c];
    if (r <= 2) return true;
    const need = r - 1, f = st.f;
    return IS_RED[c] ? (f[2] >= need && f[3] >= need) : (f[0] >= need && f[1] >= need);
  }

  function autoplaySteps(st, out) {
    const t = st.t, dn = st.dn, f = st.f, w = st.w;
    let moved = true;
    while (moved) {
      moved = false;
      for (let i = 0; i < 7; i++) {
        const col = t[i];
        if (!col.length) continue;
        const c = col[col.length - 1];
        const s = SUIT[c];
        if (f[s] === RANK[c] - 1 && safeObj(st, c)) {
          col.pop();
          f[s]++;
          if (!col.length) dn[i] = 0;
          else if (dn[i] >= col.length) dn[i] = col.length - 1;
          out.push([0, i]);
          moved = true;
        }
      }
      if (w.length) {
        const c = w[w.length - 1];
        const s = SUIT[c];
        if (f[s] === RANK[c] - 1 && safeObj(st, c)) {
          w.pop();
          f[s]++;
          out.push([1]);
          moved = true;
        }
      }
    }
  }

  function applyPackedObj(st, pm, draw) {
    switch (pm & 7) {
      case 0: {
        const i = (pm >> 3) & 15;
        const col = st.t[i];
        const c = col.pop();
        st.f[SUIT[c]]++;
        fix(st, i);
        break;
      }
      case 1: {
        const c = st.w.pop();
        st.f[SUIT[c]]++;
        break;
      }
      case 2: {
        const fc = (pm >> 3) & 15;
        const idx = (pm >> 7) & 63;
        const tc = (pm >> 13) & 15;
        const src = st.t[fc], dst = st.t[tc];
        const slen = src.length;
        for (let k = idx; k < slen; k++) dst.push(src[k]);
        src.length = idx;
        fix(st, fc);
        break;
      }
      case 3: {
        st.t[(pm >> 3) & 15].push(st.w.pop());
        break;
      }
      case 5: {
        st.s = st.w.reverse();
        st.w = [];
        st.p++;
      } // falls through: recycle then draw
      // eslint-disable-next-line no-fallthrough
      case 4: {
        const s = st.s, w = st.w;
        const n = draw < s.length ? draw : s.length;
        for (let k = 0; k < n; k++) w.push(s.pop());
        break;
      }
      case 6: {
        const s = (pm >> 3) & 15;
        const tc = (pm >> 7) & 63;
        st.t[tc].push(s * 13 + st.f[s] - 1);
        st.f[s]--;
        break;
      }
    }
  }

  function applyPackedAt(depth, pm, draw) {
    const base = depth << 9;
    switch (pm & 7) {
      case 0: {
        const i = (pm >> 3) & 15;
        const len = statePool[base + OFF_CLEN + i] - 1;
        const c = statePool[base + i * 52 + len];
        statePool[base + OFF_CLEN + i] = len;
        statePool[base + OFF_F + SUIT[c]]++;
        if (!len) statePool[base + OFF_DN + i] = 0;
        else if (statePool[base + OFF_DN + i] >= len) statePool[base + OFF_DN + i] = len - 1;
        break;
      }
      case 1: {
        const wlen = statePool[base + OFF_WLEN] - 1;
        const c = statePool[base + OFF_W + wlen];
        statePool[base + OFF_WLEN] = wlen;
        statePool[base + OFF_F + SUIT[c]]++;
        break;
      }
      case 2: {
        const fc = (pm >> 3) & 15;
        const idx = (pm >> 7) & 63;
        const tc = (pm >> 13) & 15;
        const flen = statePool[base + OFF_CLEN + fc];
        let tlen = statePool[base + OFF_CLEN + tc];
        const srcOff = base + fc * 52;
        const dstOff = base + tc * 52;
        for (let k = idx; k < flen; k++) {
          statePool[dstOff + tlen++] = statePool[srcOff + k];
        }
        statePool[base + OFF_CLEN + tc] = tlen;
        statePool[base + OFF_CLEN + fc] = idx;
        if (!idx) statePool[base + OFF_DN + fc] = 0;
        else if (statePool[base + OFF_DN + fc] >= idx) statePool[base + OFF_DN + fc] = idx - 1;
        break;
      }
      case 3: {
        const tc = (pm >> 3) & 15;
        const wlen = statePool[base + OFF_WLEN] - 1;
        const c = statePool[base + OFF_W + wlen];
        statePool[base + OFF_WLEN] = wlen;
        const tlen = statePool[base + OFF_CLEN + tc];
        statePool[base + tc * 52 + tlen] = c;
        statePool[base + OFF_CLEN + tc] = tlen + 1;
        break;
      }
      case 5: {
        const wlen = statePool[base + OFF_WLEN];
        const sb = base + OFF_S, wb = base + OFF_W;
        for (let k = 0; k < wlen; k++) {
          statePool[sb + k] = statePool[wb + wlen - 1 - k];
        }
        statePool[base + OFF_SLEN] = wlen;
        statePool[base + OFF_WLEN] = 0;
        pPool[depth]++;
      } // falls through: recycle then draw
      // eslint-disable-next-line no-fallthrough
      case 4: {
        let slen = statePool[base + OFF_SLEN];
        let wlen = statePool[base + OFF_WLEN];
        const n = draw < slen ? draw : slen;
        const sb = base + OFF_S, wb = base + OFF_W;
        for (let k = 0; k < n; k++) {
          statePool[wb + wlen++] = statePool[sb + --slen];
        }
        statePool[base + OFF_SLEN] = slen;
        statePool[base + OFF_WLEN] = wlen;
        break;
      }
      case 6: {
        const su = (pm >> 3) & 15;
        const tc = (pm >> 7) & 63;
        const fVal = statePool[base + OFF_F + su];
        const c = su * 13 + fVal - 1;
        statePool[base + OFF_F + su] = fVal - 1;
        const tlen = statePool[base + OFF_CLEN + tc];
        statePool[base + tc * 52 + tlen] = c;
        statePool[base + OFF_CLEN + tc] = tlen + 1;
        break;
      }
    }
  }

  function unpackMove(pm) {
    switch (pm & 7) {
      case 0: return [0, (pm >> 3) & 15];
      case 1: return [1];
      case 2: return [2, (pm >> 3) & 15, (pm >> 7) & 63, (pm >> 13) & 15];
      case 3: return [3, (pm >> 3) & 15];
      case 4: return [4];
      case 5: return [5];
      case 6: return [6, (pm >> 3) & 15, (pm >> 7) & 63];
    }
  }

  // ---------------------------------------------------------------- move generator
  // When pruned=true, restricts tableau moves to those that reveal a face-down card, free a foundation play,
  // or relocate an entire column (used by rate() and fast pass of plan()).
  // When pruned=false, every legal move is generated with only provably harmless symmetry prunings:
  //  - "safe" foundation autoplay (a card whose opposite-colour foundations are high enough never needs to come back),
  //  - moving a column that already starts at the bottom into an empty column (pure symmetry),
  //  - choosing between several empty columns (symmetric), and columns are order-independent in the state key,
  //  - pulling an A or 2 back off a foundation (they can never usefully host anything).
  function genMovesAt(depth, maxPasses, start, pruned) {
    ensureMoveCap(start + 256);
    let sp = start;
    const base = depth << 9;
    const clb = base + OFF_CLEN;
    const dnb = base + OFF_DN;
    const fb = base + OFF_F;
    const wlen = statePool[base + OFF_WLEN];
    const slen = statePool[base + OFF_SLEN];

    for (let i = 0; i < 7; i++) {
      const len = statePool[clb + i];
      if (len) {
        const c = statePool[base + i * 52 + len - 1];
        if (statePool[fb + SUIT[c]] === RANK[c] - 1) moveBuf[sp++] = i << 3;
      }
    }
    if (wlen) {
      const c = statePool[base + OFF_W + wlen - 1];
      if (statePool[fb + SUIT[c]] === RANK[c] - 1) moveBuf[sp++] = 1;
    }
    for (let i = 0; i < 7; i++) {
      const len = statePool[clb + i];
      if (!len) continue;
      const dni = statePool[dnb + i];
      const cOff = base + i * 52;
      for (let idx = dni; idx < len; idx++) {
        if (pruned) {
          const reveal = idx === dni && idx > 0;
          let frees = false;
          if (idx > dni) {
            const prev = statePool[cOff + idx - 1];
            frees = statePool[fb + SUIT[prev]] === RANK[prev] - 1;
          }
          if (!reveal && !frees && idx !== 0) continue;
        }
        const c = statePool[cOff + idx], r = RANK[c];
        if (r === 13) {
          if (idx === 0) continue;
          for (let j = 0; j < 7; j++) {
            if (j !== i && !statePool[clb + j]) {
              moveBuf[sp++] = 2 | (i << 3) | (idx << 7) | (j << 13);
              break;
            }
          }
        } else {
          const red = IS_RED[c], needR = r + 1;
          for (let j = 0; j < 7; j++) {
            if (j === i) continue;
            const dlen = statePool[clb + j];
            if (!dlen) continue;
            const top = statePool[base + j * 52 + dlen - 1];
            if (IS_RED[top] !== red && RANK[top] === needR) {
              moveBuf[sp++] = 2 | (i << 3) | (idx << 7) | (j << 13);
            }
          }
        }
      }
    }
    if (wlen) {
      const c = statePool[base + OFF_W + wlen - 1], r = RANK[c];
      if (r === 13) {
        for (let j = 0; j < 7; j++) {
          if (!statePool[clb + j]) { moveBuf[sp++] = 3 | (j << 3); break; }
        }
      } else {
        const red = IS_RED[c], needR = r + 1;
        for (let j = 0; j < 7; j++) {
          const dlen = statePool[clb + j];
          if (!dlen) continue;
          const top = statePool[base + j * 52 + dlen - 1];
          if (IS_RED[top] !== red && RANK[top] === needR) moveBuf[sp++] = 3 | (j << 3);
        }
      }
    }
    if (slen) moveBuf[sp++] = 4;
    else if (wlen && pPool[depth] < maxPasses) moveBuf[sp++] = 5;
    if (!pruned) {
      for (let su = 0; su < 4; su++) {
        const fVal = statePool[fb + su];
        if (fVal < 3) continue;
        const c = su * 13 + fVal - 1, r = RANK[c];
        if (r === 13) {
          for (let j = 0; j < 7; j++) {
            if (!statePool[clb + j]) { moveBuf[sp++] = 6 | (su << 3) | (j << 7); break; }
          }
        } else {
          const red = IS_RED[c], needR = r + 1;
          for (let j = 0; j < 7; j++) {
            const dlen = statePool[clb + j];
            if (!dlen) continue;
            const top = statePool[base + j * 52 + dlen - 1];
            if (IS_RED[top] !== red && RANK[top] === needR) moveBuf[sp++] = 6 | (su << 3) | (j << 7);
          }
        }
      }
    }
    return sp;
  }

  /** @returns true (winnable), false (proven unwinnable), null (gave up) */
  function solve(deck, draw = 1, limit = 25000, maxPasses = Infinity) {
    return rate(deck, draw, limit, maxPasses).won;
  }

  /** Same search as solve(), also reporting how many positions it had to explore (a proxy for how tricky the deal is). */
  function rate(deck, draw = 1, limit = 25000, maxPasses = Infinity) {
    seenReset();
    loadDeck(0, deck);
    const limited = maxPasses !== Infinity;
    let nodes = 0, aborted = false;

    function dfs(depth, sp) {
      autoplayAt(depth);
      const fb = (depth << 9) + OFF_F;
      if (statePool[fb] + statePool[fb + 1] + statePool[fb + 2] + statePool[fb + 3] === 52) return true;
      if (++nodes > limit) { aborted = true; return false; }
      if (depth > 1500) return false;
      if (!seenInsertAt(depth, limited)) return false;

      const end = genMovesAt(depth, maxPasses, sp, true);
      const nextDepth = depth + 1;
      ensureStateDepth(nextDepth);
      for (let mi = sp; mi < end; mi++) {
        copyState(nextDepth, depth);
        applyPackedAt(nextDepth, moveBuf[mi], draw);
        if (dfs(nextDepth, end)) return true;
        if (aborted) return false;
      }
      return false;
    }

    const won = dfs(0, 0);
    return { won: won ? true : aborted ? null : false, nodes };
  }

  /**
   * Exhaustively search from a mid-game position.
   * state: { t: [7 arrays of cards, bottom→top], dn: [face-down count per column], f: [foundation rank per suit],
   *          s: stock (top = last), w: waste (top = last), p: current pass number }
   * @returns {{result: 'win'|'lose'|'unknown', nodes: number}}  'lose' is only returned when every line was tried.
   */
  function analyze(state, draw = 1, maxPasses = Infinity, limit = 250000, ms = 4000) {
    seenReset();
    loadState(0, state);
    const limited = maxPasses !== Infinity, t0 = now();
    let nodes = 0, steps = 0, fLen = 0, sp = 0;

    function enter(depth) {
      autoplayAt(depth);
      const fb = (depth << 9) + OFF_F;
      if (statePool[fb] + statePool[fb + 1] + statePool[fb + 2] + statePool[fb + 3] === 52) return true;
      if (!seenInsertAt(depth, limited)) return false;
      nodes++;
      const start = sp;
      const end = genMovesAt(depth, maxPasses, start, false);
      sp = end;
      ensureFrameCap(fLen);
      frameStart[fLen] = start;
      frameEnd[fLen] = end;
      frameCur[fLen] = start;
      fLen++;
      return false;
    }

    if (enter(0)) return { result: 'win', nodes };
    while (fLen > 0) {
      if (nodes > limit || ((++steps & 1023) === 0 && now() - t0 > ms)) return { result: 'unknown', nodes };
      const top = fLen - 1;
      const cur = frameCur[top];
      if (cur >= frameEnd[top]) {
        sp = frameStart[top];
        fLen--;
        continue;
      }
      frameCur[top] = cur + 1;
      const childDepth = top + 1;
      ensureStateDepth(childDepth);
      copyState(childDepth, top);
      applyPackedAt(childDepth, moveBuf[cur], draw);
      if (enter(childDepth)) return { result: 'win', nodes };
    }
    return { result: 'lose', nodes };
  }

  /**
   * "No moves left" check: can ANY sequence of legal moves still make progress, i.e. put another card on a
   * foundation or turn up a face-down tableau card? Shuffling cards around or cycling the stock is not progress.
   * @returns {{result: 'progress'|'stuck'|'unknown', nodes: number}}  'stuck' only when every line was tried.
   */
  function progress(state, draw = 1, maxPasses = Infinity, limit = 250000, ms = 4000) {
    seenReset();
    loadState(0, state);
    const limited = maxPasses !== Infinity, t0 = now();
    const f0 = statePool[OFF_F] + statePool[OFF_F + 1] + statePool[OFF_F + 2] + statePool[OFF_F + 3];
    const d0 = statePool[OFF_DN] + statePool[OFF_DN + 1] + statePool[OFF_DN + 2] + statePool[OFF_DN + 3]
             + statePool[OFF_DN + 4] + statePool[OFF_DN + 5] + statePool[OFF_DN + 6];
    let nodes = 0, steps = 0, fLen = 0, sp = 0;

    function enter(depth) {
      const base = depth << 9;
      const fb = base + OFF_F, dnb = base + OFF_DN;
      const fSum = statePool[fb] + statePool[fb + 1] + statePool[fb + 2] + statePool[fb + 3];
      const dSum = statePool[dnb] + statePool[dnb + 1] + statePool[dnb + 2] + statePool[dnb + 3]
                 + statePool[dnb + 4] + statePool[dnb + 5] + statePool[dnb + 6];
      if (fSum > f0 || dSum < d0) return true;
      if (!seenInsertAt(depth, limited)) return false;
      nodes++;
      const start = sp;
      const end = genMovesAt(depth, maxPasses, start, false);
      if (end > start && (moveBuf[start] & 7) <= 1) return true; // a foundation play is available right now
      sp = end;
      ensureFrameCap(fLen);
      frameStart[fLen] = start;
      frameEnd[fLen] = end;
      frameCur[fLen] = start;
      fLen++;
      return false;
    }

    if (enter(0)) return { result: 'progress', nodes };
    while (fLen > 0) {
      if (nodes > limit || ((++steps & 1023) === 0 && now() - t0 > ms)) return { result: 'unknown', nodes };
      const top = fLen - 1;
      const cur = frameCur[top];
      if (cur >= frameEnd[top]) {
        sp = frameStart[top];
        fLen--;
        continue;
      }
      frameCur[top] = cur + 1;
      const childDepth = top + 1;
      ensureStateDepth(childDepth);
      copyState(childDepth, top);
      applyPackedAt(childDepth, moveBuf[cur], draw);
      if (enter(childDepth)) return { result: 'progress', nodes };
    }
    return { result: 'stuck', nodes };
  }

  /**
   * Plan an explicit step-by-step winning sequence from `state` (or a raw 52-card `deck`).
   * Every safe foundation autoplay move is recorded explicitly as `[0, col]` or `[1]` so
   * replaying the returned steps sequentially from `state` never desynchronizes.
   * @returns {Array<number[]>|null}
   */
  function plan(state, draw = 1, maxPasses = Infinity, limit = 60000) {
    const baseState = Array.isArray(state) ? deal(state) : clone(state);
    for (let i = 0; i < 7; i++) fix(baseState, i);
    const limited = maxPasses !== Infinity;

    function search(pruned, nodeBudget) {
      seenReset();
      loadState(0, baseState);
      let nodes = 0, aborted = false;
      const chosen = [];

      function dfs(depth, sp) {
        autoplayAt(depth);
        const fb = (depth << 9) + OFF_F;
        if (statePool[fb] + statePool[fb + 1] + statePool[fb + 2] + statePool[fb + 3] === 52) return true;
        if (++nodes > nodeBudget) { aborted = true; return false; }
        if (depth > 1500) return false;
        if (!seenInsertAt(depth, limited)) return false;

        const end = genMovesAt(depth, maxPasses, sp, pruned);
        const nextDepth = depth + 1;
        ensureStateDepth(nextDepth);
        for (let mi = sp; mi < end; mi++) {
          const pm = moveBuf[mi];
          copyState(nextDepth, depth);
          applyPackedAt(nextDepth, pm, draw);
          chosen.push(pm);
          if (dfs(nextDepth, end)) return true;
          chosen.pop();
          if (aborted) return false;
        }
        return false;
      }

      if (!dfs(0, 0)) return null;

      // Reconstruct explicit move list including autoplay steps in O(winning path length)
      const out = [];
      const cur = clone(baseState);
      autoplaySteps(cur, out);
      for (let i = 0; i < chosen.length; i++) {
        const pm = chosen[i];
        out.push(unpackMove(pm));
        applyPackedObj(cur, pm, draw);
        autoplaySteps(cur, out);
      }
      return out;
    }

    const fastBudget = Math.min(limit, 35000);
    const fast = search(true, fastBudget);
    if (fast) return fast;
    return search(false, limit);
  }

  return { solve, rate, deal, analyze, progress, plan };
}
const Solver = solverFactory();

if (typeof module !== 'undefined') module.exports = Solver;
