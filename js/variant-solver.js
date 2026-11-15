/* Slopitaire — solvers for the Spider, FreeCell, Pyramid and TriPeaks variants.
 *  - deal():     the opening layout of a shuffled deck (the game deals from this too, so both always agree)
 *  - rate():     solve a fresh deal within a node budget, used to hand out verified-winnable deals
 *  - analyze():  exhaustive search from a mid-game position: 'win' | 'lose' | 'unknown'
 *  - progress(): can any useful move still be reached? 'progress' | 'stuck' | 'unknown'
 *  - plan():     the move list the ◈ Auto autopilot plays (a full win, or the best partial line it found)
 * Cards are ints. A 52-card deck uses suit = id/13|0 (0♥ 1♦ 2♣ 3♠), rank = id%13 + 1. Spider's 104 cards map
 * onto 1, 2 or 4 suits with spiderSuit(). Deck order: the last element is the top of the deck.
 * Self-contained so the game can also run it inside its Web Worker (via toString()).
 */
function variantSolverFactory() {
  'use strict';
  const now = Date.now;

  // ------------------------------------------------------------ cards
  const rankOf = (id) => (id % 13) + 1;
  const suitOf = (id) => (id / 13) | 0;
  // Spider: 8 runs of 13. 1 suit = all spades, 2 suits = spades & hearts, 4 suits = two of each.
  function spiderSuit(id, suits) {
    const g = (id / 13) | 0;
    return suits === 1 ? 3 : suits === 2 ? (g % 2 ? 0 : 3) : g % 4;
  }
  const redSuit = (s) => s < 2;

  // ------------------------------------------------------------ shared layouts
  // Pyramid: 7 rows, row r holds r+1 cards at index r(r+1)/2 + j. Card (r, j) is covered by (r+1, j) and (r+1, j+1).
  const PYR_COVER = [], PYR_ROW = [];
  for (let r = 0; r < 7; r++) {
    for (let j = 0; j <= r; j++) {
      PYR_ROW.push(r);
      const base = ((r + 1) * (r + 2)) / 2;
      PYR_COVER.push(r < 6 ? [base + j, base + j + 1] : []);
    }
  }
  // TriPeaks: rows of 3, 6, 9 and 10 (indices 0-2, 3-8, 9-17, 18-27): three peaks sharing a 10-card base.
  const TP_COVER = [], TP_ROW = [];
  for (let p = 0; p < 3; p++) { TP_COVER.push([3 + 2 * p, 4 + 2 * p]); TP_ROW.push(0); }
  for (let j = 0; j < 6; j++) { const k = 3 * (j >> 1) + (j & 1); TP_COVER.push([9 + k, 10 + k]); TP_ROW.push(1); }
  for (let k = 0; k < 9; k++) { TP_COVER.push([18 + k, 19 + k]); TP_ROW.push(2); }
  for (let k = 0; k < 10; k++) { TP_COVER.push([]); TP_ROW.push(3); }

  function deal(variant, deck) {
    const d = deck.slice();
    if (variant === 'spider') {
      const t = Array.from({ length: 10 }, () => []);
      for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) if (r < (c < 4 ? 6 : 5)) t[c].push(d.pop());
      return { t, dn: t.map((p) => p.length - 1), s: d, f: 0 };
    }
    if (variant === 'freecell') {
      const t = Array.from({ length: 8 }, () => []);
      for (let k = 0; k < 52; k++) t[k % 8].push(d.pop());
      return { t, c: [-1, -1, -1, -1], f: [0, 0, 0, 0] };
    }
    if (variant === 'pyramid') {
      const p = [];
      for (let k = 0; k < 28; k++) p.push(d.pop());
      return { p, s: d, w: [], pass: 1 };
    }
    if (variant === 'tripeaks') {
      const p = [];
      for (let k = 0; k < 28; k++) p.push(d.pop());
      const w = [d.pop()];
      return { p, s: d, w };
    }
    return null;
  }

  // ------------------------------------------------------------ binary max-heap of node indices by score
  function makeHeap() {
    const ids = [], pri = [];
    function up(i) {
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (pri[p] >= pri[i]) break;
        [ids[p], ids[i]] = [ids[i], ids[p]]; [pri[p], pri[i]] = [pri[i], pri[p]];
        i = p;
      }
    }
    function down(i) {
      const n = ids.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < n && pri[l] > pri[m]) m = l;
        if (r < n && pri[r] > pri[m]) m = r;
        if (m === i) break;
        [ids[m], ids[i]] = [ids[i], ids[m]]; [pri[m], pri[i]] = [pri[i], pri[m]];
        i = m;
      }
    }
    return {
      get size() { return ids.length; },
      push(id, p) { ids.push(id); pri.push(p); up(ids.length - 1); },
      pop() {
        const top = ids[0], last = ids.pop(), lp = pri.pop();
        if (ids.length) { ids[0] = last; pri[0] = lp; down(0); }
        return top;
      },
    };
  }

  // ------------------------------------------------------------ FreeCell
  // state: { t: 8 columns of ids (last = top), c: 4 cells (id or -1), f: foundation height per suit }
  const FC = {
    init(st) { return { t: st.t.map((p) => p.slice()), c: st.c.slice(), f: st.f.slice() }; },
    clone(s) { return { t: s.t.map((p) => p.slice()), c: s.c.slice(), f: s.f.slice() }; },
    key(s) {
      const cols = s.t.map((p) => String.fromCharCode(...p.map((c) => c + 48))).sort();
      const cells = s.c.filter((c) => c >= 0).sort((a, b) => a - b).join(',');
      return s.f.join(',') + '|' + cells + '|' + cols.join('|');
    },
    won(s) { return s.f[0] + s.f[1] + s.f[2] + s.f[3] === 52; },
    fits(lo, hi) { return rankOf(hi) === rankOf(lo) + 1 && redSuit(suitOf(hi)) !== redSuit(suitOf(lo)); },
    cap(free, empty) { return (free + 1) * (1 << empty); },
    safe(s, c) {
      const r = rankOf(c);
      if (r <= 2) return true;
      const red = redSuit(suitOf(c));
      for (let su = 0; su < 4; su++) if (redSuit(su) !== red && s.f[su] < r - 1) return false;
      return true;
    },
    homeable(s, c) { return s.f[suitOf(c)] === rankOf(c) - 1; },
    // moves sending a card to the foundation are listed first; the rest are tableau / cell shuffles
    moves(s) {
      const out = [];
      let free = 0, firstFree = -1, empty = 0, firstEmpty = -1;
      for (let k = 0; k < 4; k++) if (s.c[k] < 0) { free++; if (firstFree < 0) firstFree = k; }
      for (let i = 0; i < 8; i++) if (!s.t[i].length) { empty++; if (firstEmpty < 0) firstEmpty = i; }
      for (let i = 0; i < 8; i++) {
        const p = s.t[i];
        if (p.length && FC.homeable(s, p[p.length - 1])) out.push(['tf', i]);
      }
      for (let k = 0; k < 4; k++) if (s.c[k] >= 0 && FC.homeable(s, s.c[k])) out.push(['cf', k]);
      for (let i = 0; i < 8; i++) {
        const p = s.t[i], n = p.length;
        if (!n) continue;
        let run = 1;
        while (run < n && FC.fits(p[n - run], p[n - run - 1])) run++;
        for (let j = 0; j < 8; j++) {
          if (j === i) continue;
          const q = s.t[j];
          if (q.length) {
            const need = rankOf(q[q.length - 1]) - rankOf(p[n - 1]);
            if (need >= 1 && need <= run && need <= FC.cap(free, empty) && FC.fits(p[n - need], q[q.length - 1])) out.push(['tt', i, need, j]);
          } else if (j === firstEmpty) {
            const most = Math.min(run, FC.cap(free, empty - 1));
            for (let m = most; m >= 1; m--) if (m < n) out.push(['tt', i, m, j]);
          }
        }
      }
      for (let k = 0; k < 4; k++) {
        const c = s.c[k];
        if (c < 0) continue;
        for (let j = 0; j < 8; j++) {
          const q = s.t[j];
          if (q.length ? FC.fits(c, q[q.length - 1]) : j === firstEmpty) out.push(['ct', k, j]);
        }
      }
      if (firstFree >= 0) for (let i = 0; i < 8; i++) if (s.t[i].length) out.push(['tc', i, firstFree]);
      return out;
    },
    applyOne(s, m) {
      switch (m[0]) {
        case 'tf': { const c = s.t[m[1]].pop(); s.f[suitOf(c)]++; break; }
        case 'cf': { const c = s.c[m[1]]; s.c[m[1]] = -1; s.f[suitOf(c)]++; break; }
        case 'tt': { const mov = s.t[m[1]].splice(s.t[m[1]].length - m[2]); s.t[m[3]].push(...mov); break; }
        case 'ct': { s.t[m[2]].push(s.c[m[1]]); s.c[m[1]] = -1; break; }
        case 'tc': { s.c[m[2]] = s.t[m[1]].pop(); break; }
        default: break;
      }
    },
    // applies m, then every provably safe trip home (recorded so the autopilot replays them too)
    apply(s, m) {
      const n = FC.clone(s), seq = [m];
      FC.applyOne(n, m);
      for (let again = true; again;) {
        again = false;
        for (let i = 0; i < 8; i++) {
          const p = n.t[i];
          if (p.length && FC.homeable(n, p[p.length - 1]) && FC.safe(n, p[p.length - 1])) { const mm = ['tf', i]; FC.applyOne(n, mm); seq.push(mm); again = true; }
        }
        for (let k = 0; k < 4; k++) {
          if (n.c[k] >= 0 && FC.homeable(n, n.c[k]) && FC.safe(n, n.c[k])) { const mm = ['cf', k]; FC.applyOne(n, mm); seq.push(mm); again = true; }
        }
      }
      return { s: n, seq, prog: seq.some((x) => x[0] === 'tf' || x[0] === 'cf') };
    },
    score(s) {
      let home = s.f[0] + s.f[1] + s.f[2] + s.f[3], blocked = 0, free = 0, empty = 0;
      for (let k = 0; k < 4; k++) if (s.c[k] < 0) free++;
      for (const p of s.t) {
        if (!p.length) { empty++; continue; }
        let lo = 99;
        for (let k = 0; k < p.length; k++) {
          const r = rankOf(p[k]);
          if (r > lo) blocked++;
          else lo = r;
        }
      }
      return home * 6 - blocked * 3 + free * 2 + empty * 4;
    },
  };

  // ------------------------------------------------------------ Spider
  // state: { t: 10 columns (last = top), dn: face-down count per column, s: stock (last = next dealt), f: runs done }
  const SP = {
    suits: 4, full: false,
    init(st, opt) {
      SP.suits = opt.suits || 4;
      SP.full = !!opt.exhaustive;
      return { t: st.t.map((p) => p.slice()), dn: st.dn.slice(), s: st.s.slice(), f: st.f | 0 };
    },
    clone(s) { return { t: s.t.map((p) => p.slice()), dn: s.dn.slice(), s: s.s.slice(), f: s.f }; },
    // runs differing only by which physical copy of a card is where are the same position
    sym(c) { return SP.suits === 4 ? (c % 52) : SP.suits === 2 ? (c % 26) : (c % 13); },
    key(s) {
      return s.s.length + '|' + s.t.map((p, i) => s.dn[i] + ':' + String.fromCharCode(...p.map((c) => SP.sym(c) + 48))).join('|');
    },
    won(s) { return s.f >= 8; },
    suit(c) { return spiderSuit(c, SP.suits); },
    runLen(s, i) {
      const p = s.t[i], n = p.length;
      if (!n || s.dn[i] >= n) return 0;
      let run = 1;
      while (run < n - s.dn[i]) {
        const a = p[n - run], b = p[n - run - 1];
        if (rankOf(b) !== rankOf(a) + 1 || SP.suit(a) !== SP.suit(b)) break;
        run++;
      }
      return run;
    },
    moves(s) {
      const out = [];
      let empty = 0;
      for (let i = 0; i < 10; i++) if (!s.t[i].length) empty++;
      let firstEmpty = -1;
      for (let i = 0; i < 10; i++) if (!s.t[i].length) { firstEmpty = i; break; }
      for (let i = 0; i < 10; i++) {
        const p = s.t[i], n = p.length;
        const run = SP.runLen(s, i);
        if (!run) continue;
        for (let j = 0; j < 10; j++) {
          if (j === i) continue;
          const q = s.t[j];
          if (q.length) {
            const top = q[q.length - 1];
            const need = rankOf(top) - rankOf(p[n - 1]);
            if (need < 1 || need > run) continue;
            const base = p[n - need];
            // moving off a card that already continues the run only helps if the new spot is same-suit and the old one was not
            if (n - need - 1 >= s.dn[i] && n - need - 1 >= 0) {
              const under = p[n - need - 1];
              if (!SP.full && rankOf(under) === rankOf(base) + 1 && !(SP.suit(top) === SP.suit(base) && SP.suit(under) !== SP.suit(base))) continue;
            }
            out.push(['tt', i, need, j]);
          } else if (j === firstEmpty) {
            for (let m = run; m >= 1; m--) {
              if (m === n) continue;            // the whole column into an empty one changes nothing
              const under = p[n - m - 1];
              if (!SP.full && n - m - 1 >= s.dn[i] && rankOf(under) === rankOf(p[n - m]) + 1 && SP.suit(under) === SP.suit(p[n - m])) continue;
              out.push(['tt', i, m, j]);
            }
          }
        }
      }
      if (s.s.length && !empty) out.push(['deal']);
      return out;
    },
    settle(s, i, info) {
      const p = s.t[i];
      if (p.length >= 13 && s.dn[i] <= p.length - 13 && SP.runLen(s, i) >= 13 && rankOf(p[p.length - 13]) === 13) {
        p.splice(p.length - 13);
        s.f++;
        info.run = true;
      }
      if (p.length && s.dn[i] >= p.length) { s.dn[i] = p.length - 1; info.flip = true; }
    },
    apply(s, m) {
      const n = SP.clone(s), info = { run: false, flip: false };
      if (m[0] === 'deal') {
        for (let i = 0; i < 10; i++) n.t[i].push(n.s.pop());
        for (let i = 0; i < 10; i++) SP.settle(n, i, info);
        return { s: n, seq: [m], prog: true };
      }
      const mov = n.t[m[1]].splice(n.t[m[1]].length - m[2]);
      n.t[m[3]].push(...mov);
      if (n.dn[m[1]] > n.t[m[1]].length) n.dn[m[1]] = n.t[m[1]].length;
      SP.settle(n, m[1], info);
      SP.settle(n, m[3], info);
      return { s: n, seq: [m], prog: info.run || info.flip };
    },
    score(s) {
      let down = 0, links = 0, loose = 0, empty = 0;
      for (let i = 0; i < 10; i++) {
        const p = s.t[i];
        down += s.dn[i];
        if (!p.length) { empty++; continue; }
        for (let k = Math.max(1, s.dn[i] + 1); k < p.length; k++) {
          if (rankOf(p[k - 1]) === rankOf(p[k]) + 1) { if (SP.suit(p[k - 1]) === SP.suit(p[k])) links += 3; else links += 1; } else loose++;
        }
      }
      return s.f * 120 - down * 9 + links * 2 - loose * 2 + empty * 8 - s.s.length * 0.35;
    },
  };

  // ------------------------------------------------------------ Pyramid
  // The talon is kept in draw order: waste cards first, then the stock from its top down. Removing a talon card only
  // ever happens to the waste top, so state = pyramid cards left, talon cards removed, how many are drawn, pass count.
  const PY = {
    maxPasses: Infinity,
    init(st, opt) {
      PY.maxPasses = opt.maxPasses == null ? Infinity : opt.maxPasses;
      const talon = st.w.concat(st.s.slice().reverse());
      let mask = 0;
      for (let i = 0; i < 28; i++) if (st.p[i] >= 0) mask |= (1 << i);
      PY.cards = st.p.slice();
      PY.talon = talon;
      return { m: mask >>> 0, r: 0, ptr: st.w.length, pass: st.pass || 1 };
    },
    key(s) { return s.m + ':' + s.r + ':' + s.ptr + (PY.maxPasses === Infinity ? '' : ':' + s.pass); },
    won(s) { return s.m === 0; },
    exposed(s, i) {
      if (!((s.m >>> i) & 1)) return false;
      const cv = PYR_COVER[i];
      return !cv.length || (!((s.m >>> cv[0]) & 1) && !((s.m >>> cv[1]) & 1));
    },
    wasteTop(s) { for (let k = s.ptr - 1; k >= 0; k--) if (!((s.r >>> k) & 1)) return k; return -1; },
    stockLeft(s) { for (let k = s.ptr; k < PY.talon.length; k++) if (!((s.r >>> k) & 1)) return k; return -1; },
    moves(s) {
      const out = [], ex = [];
      for (let i = 27; i >= 0; i--) if (PY.exposed(s, i)) ex.push(i);
      const wt = PY.wasteTop(s), wr = wt >= 0 ? rankOf(PY.talon[wt]) : 0;
      for (const i of ex) if (rankOf(PY.cards[i]) === 13) out.push(['k', i]);
      if (wr === 13) out.push(['k', -1]);
      for (let a = 0; a < ex.length; a++) {
        const ra = rankOf(PY.cards[ex[a]]);
        for (let b = a + 1; b < ex.length; b++) if (ra + rankOf(PY.cards[ex[b]]) === 13) out.push(['p', ex[a], ex[b]]);
        if (wr && ra + wr === 13) out.push(['p', ex[a], -1]);
      }
      if (PY.stockLeft(s) >= 0) out.push(['d']);
      else if (wt >= 0 && s.pass < PY.maxPasses) out.push(['r']);
      return out;
    },
    apply(s, m) {
      const n = { m: s.m, r: s.r, ptr: s.ptr, pass: s.pass };
      const take = (a) => { if (a < 0) n.r = (n.r | (1 << PY.wasteTop(n))) >>> 0; else n.m = (n.m & ~(1 << a)) >>> 0; };
      if (m[0] === 'k') take(m[1]);
      else if (m[0] === 'p') { take(m[1]); take(m[2]); }
      else if (m[0] === 'd') n.ptr = PY.stockLeft(n) + 1;
      else if (m[0] === 'r') { n.ptr = 0; n.pass++; }
      return { s: n, seq: [m], prog: m[0] === 'k' || m[0] === 'p' };
    },
    score(s) {
      let left = 0;
      for (let i = 0; i < 28; i++) if ((s.m >>> i) & 1) left += 1 + (6 - PYR_ROW[i]) * 0.15;
      return -left * 10 - s.pass * 2;
    },
  };

  // ------------------------------------------------------------ TriPeaks
  // state: m = peak cards left (bitmask), k = stock cards left, top = waste top card
  const TP = {
    init(st) {
      let mask = 0;
      for (let i = 0; i < 28; i++) if (st.p[i] >= 0) mask |= (1 << i);
      TP.cards = st.p.slice();
      TP.stock = st.s.slice();
      return { m: mask >>> 0, k: st.s.length, top: st.w.length ? st.w[st.w.length - 1] : -1 };
    },
    key(s) { return s.m + ':' + s.k + ':' + (s.top < 0 ? -1 : rankOf(s.top)); },
    won(s) { return s.m === 0; },
    exposed(s, i) {
      if (!((s.m >>> i) & 1)) return false;
      const cv = TP_COVER[i];
      return !cv.length || (!((s.m >>> cv[0]) & 1) && !((s.m >>> cv[1]) & 1));
    },
    adj(a, b) { const d = Math.abs(rankOf(a) - rankOf(b)); return d === 1 || d === 12; },
    moves(s) {
      const out = [];
      if (s.top >= 0) {
        for (let i = 0; i < 28; i++) if (TP.exposed(s, i) && TP.adj(TP.cards[i], s.top)) out.push(['t', i]);
      }
      // uncover-first: plays from higher rows reach the peaks
      out.sort((a, b) => TP_ROW[a[1]] - TP_ROW[b[1]]);
      if (s.k > 0) out.push(['d']);
      return out;
    },
    apply(s, m) {
      if (m[0] === 'd') return { s: { m: s.m, k: s.k - 1, top: TP.stock[s.k - 1] }, seq: [m], prog: true };
      return { s: { m: (s.m & ~(1 << m[1])) >>> 0, k: s.k, top: TP.cards[m[1]] }, seq: [m], prog: true };
    },
    score(s) {
      let left = 0;
      for (let i = 0; i < 28; i++) if ((s.m >>> i) & 1) left += 1 + (3 - TP_ROW[i]) * 0.2;
      return -left * 10 + s.k * 0.6;
    },
  };

  const ENGINES = { freecell: FC, spider: SP, pyramid: PY, tripeaks: TP };

  // Position keys can run past 150 characters (Spider); visited sets store a 64-bit hash of them instead (two
  // independent 32-bit mixes), which cuts their memory several times over at a negligible collision risk.
  function hkey(str) {
    let a = 0x811c9dc5, b = 0x9747b28c;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 13;
    }
    return (a >>> 0).toString(36) + ':' + (b >>> 0).toString(36);
  }

  // Lazy depth-first search for the exhaustive checks (analyze / progress). Only the current line of play is held
  // in memory (one frame per depth, moves generated on entry), plus the hashed visited set.
  function dfs(variant, st, opt) {
    const E = ENGINES[variant];
    if (!E || !st) return { result: 'unknown', nodes: 0 };
    const limit = opt.limit || 250000, ms = opt.ms || 4000, goal = opt.goal || 'win';
    const t0 = now();
    const root = E.init(st, opt);
    if (goal === 'win' && E.won(root)) return { result: 'win', nodes: 0 };
    const seen = new Set([hkey(E.key(root))]);
    const stack = [{ s: root, moves: E.moves(root), i: 0 }];
    let nodes = 0, steps = 0;
    while (stack.length) {
      if (nodes >= limit || ((++steps & 255) === 0 && now() - t0 > ms)) return { result: 'unknown', nodes };
      const f = stack[stack.length - 1];
      if (f.i >= f.moves.length) { stack.pop(); continue; }
      const r = E.apply(f.s, f.moves[f.i++]);
      if (goal === 'progress' && r.prog) return { result: 'win', nodes };
      const k = hkey(E.key(r.s));
      if (seen.has(k)) continue;
      seen.add(k);
      nodes++;
      if (goal === 'win' && E.won(r.s)) return { result: 'win', nodes };
      stack.push({ s: r.s, moves: E.moves(r.s), i: 0 });
    }
    return { result: 'lose', nodes };
  }

  // ------------------------------------------------------------ search
  // Best-first search from st. goal 'win' looks for a finished game; goal 'progress' for any move that sends a card
  // home / reveals one / removes one. Returns { result, nodes, plan, best } where result is 'win' | 'lose' | 'unknown'
  // ('lose' only after every reachable position was seen). best is the path to the highest-scoring position.
  function search(variant, st, opt = {}) {
    const E = ENGINES[variant];
    if (!E || !st) return { result: 'unknown', nodes: 0, plan: null, best: null };
    const limit = opt.limit || 50000, ms = opt.ms || 4000, goal = opt.goal || 'win';
    const greedy = opt.greedy !== false;
    const t0 = now();
    const root = E.init(st, opt);
    if (goal === 'win' && E.won(root)) return { result: 'win', nodes: 0, plan: [], best: [] };
    const states = [root], parent = [-1], via = [null], depth = [0], score = [E.score(root)];
    const seen = new Set([hkey(E.key(root))]);
    const heap = makeHeap();
    heap.push(0, score[0]);
    let nodes = 0, bestId = 0, steps = 0;
    const path = (id, tail) => {
      const out = tail ? tail.slice() : [];
      const chunks = [];
      for (let k = id; k > 0; k = parent[k]) chunks.push(via[k]);
      for (let k = chunks.length - 1; k >= 0; k--) out.push(...chunks[k]);
      return out;
    };
    const order = (pri, d) => (greedy ? pri : pri - d * 0.5);
    while (heap.size) {
      if (nodes >= limit || ((++steps & 255) === 0 && now() - t0 > ms)) {
        return { result: 'unknown', nodes, plan: null, best: bestId > 0 ? path(bestId) : null };
      }
      const id = heap.pop();
      const s = states[id];
      nodes++;
      for (const m of E.moves(s)) {
        const r = E.apply(s, m);
        if (goal === 'progress' && r.prog) return { result: 'win', nodes, plan: path(id, r.seq), best: null };
        const k = hkey(E.key(r.s));
        if (seen.has(k)) continue;
        seen.add(k);
        const cid = states.length;
        states.push(r.s); parent.push(id); via.push(r.seq); depth.push(depth[id] + 1);
        const sc = E.score(r.s);
        score.push(sc);
        if (goal === 'win' && E.won(r.s)) return { result: 'win', nodes, plan: path(cid), best: null };
        if (sc > score[bestId]) bestId = cid;
        heap.push(cid, order(sc, depth[cid]));
      }
      // free memory of expanded states we will never revisit (keys stay in `seen`)
      if (id !== bestId) states[id] = null;
    }
    return { result: 'lose', nodes, plan: null, best: bestId > 0 ? path(bestId) : null };
  }

  function rate(variant, deck, opt = {}) {
    const st = deal(variant, deck);
    const r = search(variant, st, Object.assign({ limit: 25000, ms: 3000 }, opt, { goal: 'win' }));
    return { won: r.result === 'win' ? true : r.result === 'lose' ? false : null, nodes: r.nodes };
  }
  function analyze(variant, st, opt = {}) {
    return dfs(variant, st, Object.assign({ limit: 250000, ms: 4000 }, opt, { goal: 'win', exhaustive: true }));
  }
  function progress(variant, st, opt = {}) {
    const r = dfs(variant, st, Object.assign({ limit: 250000, ms: 4000 }, opt, { goal: 'progress', exhaustive: true }));
    return { result: r.result === 'win' ? 'progress' : r.result === 'lose' ? 'stuck' : 'unknown', nodes: r.nodes };
  }
  function plan(variant, st, opt = {}) {
    const r = search(variant, st, Object.assign({ limit: 60000, ms: 2500 }, opt, { goal: 'win' }));
    if (r.result === 'win') return r.plan;
    return r.best && r.best.length ? r.best : null;
  }

  return { deal, rate, analyze, progress, plan, search, spiderSuit, PYR_COVER, PYR_ROW, TP_COVER, TP_ROW };
}

// eslint-disable-next-line no-unused-vars
const VSolver = variantSolverFactory();
if (typeof module !== 'undefined' && module.exports) module.exports = { variantSolverFactory, VSolver };
