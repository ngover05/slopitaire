/* Slopitaire — the background solver Worker (with a main-thread fallback). */
'use strict';

// After every change the position is handed to the exhaustive solver in a background worker. Only a full
// search that finds no winning line ends the game; if the search is too big to finish, play simply continues.
const Analyzer = (() => {
  let worker = null, blobUrl = null, running = false, activeType = null, onDone = null, failed = false, seqId = 0;
  function workerSrc() {
    return `const Solver = (${solverFactory.toString()})();
        const VSolver = (${variantSolverFactory.toString()})();
        const GENTLE_NODES = ${GENTLE_NODES}, GENTLE_BURY = ${GENTLE_BURY}, OBVIOUS_NODES = ${OBVIOUS_NODES};
        const DEAL_NODES = ${JSON.stringify(DEAL_NODES)};
        function rng(seed) {
          let a = seed >>> 0;
          return () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        }
        const randSeed = () => (1 + Math.random() * 999998) | 0;
        function shuffledDeck(seed, n = 52) {
          const r = rng(seed), d = [...Array(n).keys()];
          for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
          return d;
        }
        ${findVariantDealSrc}
        function openingBurial(deck) {
          let b = 0;
          Solver.deal(deck).t.forEach((col) => col.forEach((c, i) => {
            const r = (c % 13) + 1, over = col.length - 1 - i;
            if (r === 1) b += over; else if (r === 2) b += over / 2;
          }));
          return b;
        }
        function findDeal(j) {
          const t0 = performance.now(), draw = j.draw, maxPasses = j.maxPasses, kind = j.kind || '';
          const patience = kind ? 6000 : 0;
          let last = null, fallback = null;
          while (performance.now() - t0 < 60000) {
            const seed = randSeed(), deck = shuffledDeck(seed);
            last = { seed, deck };
            if (kind === 'gentle') {
              const r = Solver.rate(deck, draw, GENTLE_NODES, maxPasses);
              if (r.won === true) {
                if (openingBurial(deck) <= GENTLE_BURY) return { id: j.id, seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
                fallback = fallback || { seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
              } else if (!fallback && performance.now() - t0 > patience) {
                const r2 = Solver.rate(deck, draw, 25000, maxPasses);
                if (r2.won === true) fallback = { seed, deck, rated: { won: true, nodes: r2.nodes, ok: true } };
              }
            } else {
              const r = Solver.rate(deck, draw, 25000, maxPasses);
              if (r.won === true) {
                if (kind !== 'tricky' || r.nodes > OBVIOUS_NODES) return { id: j.id, seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
                fallback = fallback || { seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
              }
            }
            if (fallback && performance.now() - t0 > patience) return { id: j.id, ...fallback };
          }
          return fallback ? { id: j.id, ...fallback } : { id: j.id, seed: last.seed, deck: last.deck, rated: { won: false, nodes: 0, ok: false } };
        }
        onmessage = (e) => {
          const j = e.data;
          if (j.type === 'plan') {
            const plan = Solver.plan ? Solver.plan(j.st, j.draw, j.maxPasses, j.limit) : null;
            postMessage({ id: j.id, plan });
          } else if (j.type === 'findDeal') {
            postMessage(findDeal(j));
          } else if (j.type === 'vplan') {
            postMessage({ id: j.id, plan: VSolver.plan(j.variant, j.st, j.opt) });
          } else if (j.type === 'vfindDeal') {
            postMessage(findVariantDeal(j, randSeed, shuffledDeck));
          } else if (j.variant) {
            const o = Object.assign({}, j.opt, { limit: j.limit, ms: j.ms });
            const r = (j.mode === 'stuck' ? VSolver.progress : VSolver.analyze)(j.variant, j.state, o);
            postMessage({ id: j.id, result: r.result, nodes: r.nodes });
          } else {
            const r = (j.mode === 'stuck' ? Solver.progress : Solver.analyze)(j.state, j.draw, j.maxPasses, j.limit, j.ms);
            postMessage({ id: j.id, result: r.result, nodes: r.nodes });
          }
        };`;
  }
  function settle(val) {
    const cb = onDone;
    onDone = null;
    running = false;
    activeType = null;
    if (cb) cb(val);
  }
  function make() {
    try {
      if (!blobUrl) blobUrl = URL.createObjectURL(new Blob([workerSrc()], { type: 'text/javascript' }));
      worker = new Worker(blobUrl);
      worker.onmessage = (e) => { settle(e.data); };
      worker.onerror = () => { failed = true; worker = null; settle(null); };
    } catch (e) { failed = true; worker = null; }
  }
  function stop(onlyType) {
    if (onlyType && activeType !== onlyType) return;
    if (worker && running) { worker.terminate(); worker = null; }
    settle(null);
  }
  function run(job, cb) {
    stop();
    onDone = cb;
    if (!worker && !failed) make();
    if (worker) {
      running = true;
      activeType = job.type || 'analyze';
      worker.postMessage(job);
      return;
    }
    // no worker support: synchronous fallback
    if (job.type === 'vplan') {
      setTimeout(() => settle({ id: job.id, plan: VSolver.plan(job.variant, job.st, Object.assign({}, job.opt, { limit: 15000, ms: 400 })) }), 0);
    } else if (job.type === 'vfindDeal') {
      settle({ id: job.id, fallback: true });
    } else if (job.variant) {
      setTimeout(() => {
        const o = Object.assign({}, job.opt, { limit: 15000, ms: 150 });
        const r = (job.mode === 'stuck' ? VSolver.progress : VSolver.analyze)(job.variant, job.state, o);
        settle({ id: job.id, ...r });
      }, 0);
    } else if (job.type === 'plan') {
      setTimeout(() => {
        const plan = Solver.plan ? Solver.plan(job.st, job.draw, job.maxPasses, job.limit) : null;
        settle({ id: job.id, plan });
      }, 0);
    } else if (job.type === 'findDeal') {
      settle({ id: job.id, fallback: true });
    } else {
      setTimeout(() => {
        const r = (job.mode === 'stuck' ? Solver.progress : Solver.analyze)(job.state, job.draw, job.maxPasses, 15000, 150);
        settle({ id: job.id, ...r });
      }, 0);
    }
  }
  function plan(st, draw, maxPasses, limit) {
    const id = ++seqId;
    return new Promise((resolve) => {
      run({ id, type: 'plan', st, draw, maxPasses, limit }, (res) => {
        resolve(res && res.id === id ? res.plan : null);
      });
    });
  }
  function findDeal(draw, maxPasses, kind) {
    const id = ++seqId;
    return new Promise((resolve) => {
      run({ id, type: 'findDeal', draw, maxPasses, kind }, (res) => {
        resolve(res && res.id === id ? res : null);
      });
    });
  }
  function vplan(variant, st, opt) {
    const id = ++seqId;
    return new Promise((resolve) => {
      run({ id, type: 'vplan', variant, st, opt }, (res) => resolve(res && res.id === id ? res.plan : null));
    });
  }
  function vfindDeal(variant, kind, opt) {
    const id = ++seqId;
    return new Promise((resolve) => {
      run({ id, type: 'vfindDeal', variant, kind, opt }, (res) => resolve(res && res.id === id ? res : null));
    });
  }
  return { run, stop, plan, findDeal, vplan, vfindDeal };
})();
