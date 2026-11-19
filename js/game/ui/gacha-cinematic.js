/* Slopitaire — Prism Gacha summon theater (#gachaTheater): warp gate, comets, fake-outs & cascade flips. */
'use strict';

const GachaCinematic = (() => {
  let timers = [];
  let session = null;
  let controlsWired = false;

  const isFast = () => typeof settings !== 'undefined' && settings.anim === 'fast';

  function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    while (timers.length) clearTimeout(timers.pop());
  }

  function spawnMeteors(results, fakeoutSession, fast) {
    const box = $('#gtMeteors');
    if (!box) return 0;
    box.innerHTML = '';
    const single = results.length === 1;
    const step = fast ? 36 : 64;
    const dur = fast ? 320 : 520;

    results.forEach((res, i) => {
      const m = document.createElement('div');
      let visualTier = res.rarity;
      if (fakeoutSession && visualTier === 'ssr') visualTier = fakeoutSession.initialTier;
      else if (res._sealFakeout) visualTier = res._sealTier;
      m.className = `gt-meteor tier-${visualTier}` + (single ? ' is-hero' : '');
      const spreadX = single ? 0 : ((i % 5) - 2) * 72 + ((i * 29) % 34) - 17;
      const spreadY = single ? 0 : (Math.floor(i / 5) - 0.5) * 64;
      const delay = i * step;
      m.style.setProperty('--m-delay', `${delay}ms`);
      m.style.setProperty('--m-dur', `${dur}ms`);
      m.style.setProperty('--m-ox', `${spreadX}px`);
      m.style.setProperty('--m-oy', `${spreadY}px`);
      box.appendChild(m);

      schedule(() => {
        Sound.sfx?.comboTick?.(Math.min(32, 5 + i * 3));
        const core = $('#gtCoreStage .gt-crystal-wrap');
        if (core) {
          core.classList.remove('is-hit');
          void core.offsetWidth;
          core.classList.add('is-hit');
        }
        if (i % 2 === 0 || single) FX?.burst?.(innerWidth * 0.5, innerHeight * 0.5, single ? 22 : 9);
      }, delay + Math.round(dur * 0.84));
    });

    return (results.length - 1) * step + dur;
  }

  function triggerImpact(tier) {
    const impact = $('#gtImpact');
    const theater = $('#gachaTheater');
    if (impact) {
      impact.dataset.tier = tier;
      impact.classList.remove('is-firing');
      void impact.offsetWidth;
      impact.classList.add('is-firing');
    }
    if (theater) {
      theater.classList.remove('is-shaking');
      void theater.offsetWidth;
      theater.classList.add('is-shaking');
    }
    Sound.sfx?.kingLock?.();
    Sound.sfx?.comboMilestone?.(tier === 'ssr' ? 4 : tier === 'sr' ? 3 : 1);
    const pulseCol = tier === 'ssr' ? '#ffe169' : tier === 'sr' ? '#c4b5ff' : '#2ce8a2';
    StageBG?.pulse?.(pulseCol, tier === 'ssr' ? 1.5 : tier === 'sr' ? 1.1 : 0.8);
    FX?.supernova?.(innerWidth * 0.5, innerHeight * 0.5, tier);
  }

  function syncTheaterPullButtons() {
    const hasGacha = typeof Gacha !== 'undefined' && Gacha && typeof Gacha.getState === 'function';
    const pulls = hasGacha ? Math.max(0, Number(Gacha.getState()?.pulls) || 0) : 0;
    const btn1 = $('#btnTheaterPull1');
    const btnM = $('#btnTheaterPullMulti');
    if (btn1) {
      btn1.disabled = pulls < 1;
      btn1.textContent = pulls > 0 ? `🎫 Pull ×1 (${pulls})` : '🎫 Pull ×1';
    }
    if (btnM) {
      const multiCount = pulls >= 10 ? 10 : Math.max(2, Math.min(10, pulls));
      btnM.dataset.count = String(multiCount);
      btnM.disabled = pulls < 2;
      btnM.textContent = (pulls < 2 || pulls >= 10) ? '🌟 Pull ×10' : `🌟 Pull ×${multiCount}`;
    }
  }

  function revealTheaterCard(idx, quiet = false) {
    if (!session) return false;
    const cardEl = session.cards[idx];
    const res = session.results[idx];
    if (!cardEl || !res || !cardEl.classList.contains('is-sealed')) return false;

    cardEl.classList.remove('is-sealed', 'is-cracking');
    cardEl.classList.add('is-flipping', 'is-revealed');
    cardEl.dataset.sealTier = res.rarity;

    if (!quiet) {
      const rect = cardEl.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      if (res.rarity === 'ssr') FX?.supernova?.(cx, cy, 'ssr');
      else if (res.rarity === 'sr') { Sound.sfx?.comboMilestone?.(2); FX?.supernova?.(cx, cy, 'sr'); }
      else { (Sound.sfx?.autoStep || Sound.sfx?.revealCard)?.(idx + 2); if (rect.width > 0) FX?.burst?.(cx, cy, 10); }
    }
    return true;
  }

  function enterSummary(opts = {}) {
    clearTimers();
    if (session) session.inProgress = false;
    if (GachaSpotlight.isActive()) GachaSpotlight.close();
    if (!session) return;

    const { cards, results, bestRarity } = session;
    cards.forEach((c, i) => {
      c.classList.remove('is-sealed', 'is-cracking');
      c.classList.add('is-revealed');
      c.dataset.sealTier = results[i].rarity;
    });

    if (opts.celebrateIfMissed && bestRarity === 'ssr' && !session.celebratedSsr) {
      session.celebratedSsr = true;
      Sound.sfx?.newRecord?.();
      FX?.celebrate?.();
      FX?.fountain?.('ssr');
      StageBG?.pulse?.('#ffe169', 1.35);
    } else if (opts.celebrateIfMissed && bestRarity === 'sr' && !session.celebratedSr) {
      session.celebratedSr = true;
      Sound.sfx?.comboMilestone?.(2);
    }

    const theater = $('#gachaTheater');
    $('#gtCoreStage')?.classList.add('hidden');
    $('#gtArena')?.classList.remove('hidden');
    if (theater) {
      theater.dataset.phase = 'summary';
      theater.dataset.tier = bestRarity;
    }

    const { counts, html } = GachaSpotlight.buildSummaryBadges(results);
    if ($('#gtSummaryKicker')) {
      $('#gtSummaryKicker').textContent = session.replay ? '🎬 PRISM REPLAY // COMPLETE' : '◈ PRISM WARP // COMPLETE';
    }
    if ($('#gtSummaryTitle')) {
      $('#gtSummaryTitle').textContent = counts.ssr > 0
        ? (counts.ssr > 1 ? `★ ${counts.ssr}× SSR SUPERNOVA JACKPOT!! ★` : '★ SSR PRISM JACKPOT!! ★')
        : counts.sr > 0 ? '✦ SUPER RARE RESONANCE! ✦' : 'PRISM SIGNALS ACQUIRED';
    }
    if ($('#gtSummaryChips')) $('#gtSummaryChips').innerHTML = html;

    $('#btnTheaterFlipAll')?.classList.add('hidden');
    $('#btnTheaterSkip')?.classList.add('hidden');
    $('#btnTheaterPull1')?.classList.remove('hidden');
    $('#btnTheaterPullMulti')?.classList.remove('hidden');
    $('#btnTheaterDone')?.classList.remove('hidden');
    syncTheaterPullButtons();

    session.inProgress = false;
    session.onRevealDone?.();
  }

  function stepCascade() {
    if (!session || !session.inProgress) return;
    const { cards, results } = session;
    const fast = isFast();

    while (session.cursor < cards.length && !cards[session.cursor].classList.contains('is-sealed')) session.cursor++;
    if (session.cursor >= cards.length) {
      schedule(() => enterSummary(), fast ? 140 : 240);
      return;
    }

    const idx = session.cursor++;
    const cardEl = cards[idx];
    const res = results[idx];

    const finishFlip = () => {
      if (!session || !session.inProgress) return;
      if (res.rarity === 'ssr') {
        session.celebratedSsr = true;
        revealTheaterCard(idx, true);
        GachaSpotlight.open(res, { makeEquipBtn: session.makeEquipBtn, buildArt: session.buildArt, standalone: false }).then(() => {
          if (session && session.inProgress) schedule(stepCascade, fast ? 90 : 160);
        });
        return;
      }
      if (res.rarity === 'sr') session.celebratedSr = true;
      revealTheaterCard(idx);
      schedule(stepCascade, res.rarity === 'sr' ? (fast ? 135 : 235) : (fast ? 85 : 145));
    };

    if (cardEl.dataset.fakeout === '1' && cardEl.classList.contains('is-sealed')) {
      cardEl.classList.add('is-cracking');
      cardEl.dataset.sealTier = res.rarity;
      Sound.sfx?.aceIgnition?.();
      schedule(finishFlip, fast ? 175 : 290);
    } else {
      finishFlip();
    }
  }

  function fastFlipRemaining() {
    if (!session || !session.inProgress) return;
    clearTimers();
    if (GachaSpotlight.isActive()) GachaSpotlight.close();
    let stepIdx = 0;
    session.cards.forEach((cardEl, i) => {
      if (!cardEl.classList.contains('is-sealed')) return;
      const delay = stepIdx++ * 38;
      schedule(() => {
        if (session.results[i].rarity === 'ssr') session.celebratedSsr = true;
        if (session.results[i].rarity === 'sr') session.celebratedSr = true;
        revealTheaterCard(i);
      }, delay);
    });
    schedule(() => enterSummary({ celebrateIfMissed: true }), stepIdx * 38 + 180);
  }

  function closeTheater() {
    clearTimers();
    if (GachaSpotlight.isActive()) GachaSpotlight.close();
    const theater = $('#gachaTheater');
    if (theater) {
      theater.classList.add('hidden');
      theater.dataset.phase = 'idle';
      theater.classList.remove('is-shaking');
    }
    if ($('#gtCardsGrid')) $('#gtCardsGrid').innerHTML = '';
    if ($('#gtMeteors')) $('#gtMeteors').innerHTML = '';
    const doneCb = session?.onClose;
    session = null;
    doneCb?.();
  }

  function abort(silent = false) {
    if (!session && $('#gachaTheater')?.classList.contains('hidden')) return;
    if (session?.inProgress && !silent) { enterSummary({ celebrateIfMissed: true }); return; }
    if (session?.inProgress) { session.inProgress = false; session.onRevealDone?.(); }
    closeTheater();
  }

  function onEscape() {
    const th = $('#gachaTheater');
    if (!th || th.classList.contains('hidden')) return false;
    Sound.sfx?.click?.();
    if ((GachaSpotlight.isActive() && !session?.standaloneSpot) || session?.inProgress) {
      enterSummary({ celebrateIfMissed: true });
    } else {
      closeTheater();
    }
    return true;
  }

  function wireControls() {
    if (controlsWired) return;
    controlsWired = true;
    GachaSpotlight.bindHoloTilt($('#gtCardsGrid'));

    $('#gtSpotlight')?.addEventListener('click', (e) => {
      if (e.target?.closest?.('button')) return;
      Sound.sfx?.click?.();
      GachaSpotlight.close();
    });

    $('#gachaTheater')?.addEventListener('click', (e) => {
      if (!session?.inProgress || e.target?.closest?.('button, .gacha-card, #gtSpotlight')) return;
      const phase = $('#gachaTheater')?.dataset.phase;
      if (phase === 'warp' || phase === 'fakeout') { Sound.sfx?.click?.(); session.jumpToArena?.(); }
    });

    const on = (sel, fn) => { const b = $(sel); if (b) b.onclick = fn; };
    on('#btnTheaterSkip', () => { Sound.sfx?.click?.(); if (session?.standaloneSpot) closeTheater(); else enterSummary({ celebrateIfMissed: true }); });
    on('#btnTheaterFlipAll', () => { Sound.sfx?.click?.(); fastFlipRemaining(); });
    on('#btnTheaterDone', () => { Sound.sfx?.click?.(); closeTheater(); });
    on('#btnTheaterPull1', () => session?.onPullAgain?.(1));
    on('#btnTheaterPullMulti', (e) => session?.onPullAgain?.(Number(e.currentTarget.dataset.count) || 10));

    window.addEventListener('keydown', (e) => {
      const th = $('#gachaTheater');
      if (!th || th.classList.contains('hidden')) return;
      if ((e.key === ' ' || e.key === 'Enter') && !e.target?.closest?.('button')) {
        if (GachaSpotlight.isActive()) {
          e.preventDefault(); e.stopImmediatePropagation(); Sound.sfx?.click?.(); GachaSpotlight.close();
        } else if (session?.inProgress) {
          e.preventDefault(); e.stopImmediatePropagation();
          const phase = th.dataset.phase;
          if (phase === 'warp' || phase === 'fakeout') session.jumpToArena?.();
          else fastFlipRemaining();
        }
      }
    }, true);
  }

  function preparePullCards(results, doCoreFakeout, opts) {
    const grid = $('#gtCardsGrid');
    grid.innerHTML = '';
    grid.classList.toggle('is-single', results.length === 1);
    return results.map((res, idx) => {
      delete res._sealFakeout;
      delete res._sealTier;
      if (!doCoreFakeout && results.length > 1 && (res.rarity === 'ssr' || res.rarity === 'sr') && Math.random() < 0.32) {
        res._sealFakeout = true;
        res._sealTier = res.rarity === 'ssr' ? (Math.random() < 0.5 ? 'sr' : 'r') : 'r';
      }
      const cardEl = opts.buildCard(res, true);
      cardEl.dataset.sealTier = res._sealFakeout ? res._sealTier : res.rarity;
      if (res._sealFakeout) cardEl.dataset.fakeout = '1';
      cardEl.style.setProperty('--ci', String(idx));
      cardEl.addEventListener('click', (ev) => {
        if (ev.target?.closest?.('button') || !cardEl.classList.contains('is-sealed') || !session?.inProgress) return;
        if (res.rarity === 'ssr') {
          session.celebratedSsr = true;
          revealTheaterCard(idx);
          GachaSpotlight.open(res, { makeEquipBtn: opts.makeEquipBtn, buildArt: opts.buildArt, standalone: false });
        } else {
          if (res.rarity === 'sr') session.celebratedSr = true;
          revealTheaterCard(idx);
        }
      });
      grid.appendChild(cardEl);
      return cardEl;
    });
  }

  function resetTheaterUI(theater, initialTier, count, replay) {
    theater.classList.remove('hidden', 'is-shaking');
    theater.dataset.phase = 'warp';
    theater.dataset.tier = initialTier;
    $('#gtCoreStage')?.classList.remove('hidden');
    $('#gtArena')?.classList.add('hidden');
    $('#gtSpotlight')?.classList.add('hidden');
    $('#btnTheaterSkip')?.classList.remove('hidden');
    $('#btnTheaterFlipAll')?.classList.toggle('hidden', count <= 1);
    $('#btnTheaterPull1')?.classList.add('hidden');
    $('#btnTheaterPullMulti')?.classList.add('hidden');
    $('#btnTheaterDone')?.classList.add('hidden');
    if ($('#gtTickerTop')) {
      $('#gtTickerTop').textContent = replay
        ? '🎬 PRISM REPLAY // DIMENSIONAL WARP RECONSTRUCTION 🎬'
        : `◈ PRISM DIMENSIONAL WARP // ${count === 1 ? 'SOLO VECTOR' : `${count}× ORBITAL BARRAGE`} ◈`;
    }
    if ($('#gtChargeReadout')) $('#gtChargeReadout').textContent = count === 1 ? 'LOCKING PRISM VECTOR…' : `CONVERGING ${count} PRISM SIGNALS…`;
    if ($('#gtSummaryKicker')) $('#gtSummaryKicker').textContent = '◈ PRISM WARP // UNSEALING';
    if ($('#gtSummaryTitle')) $('#gtSummaryTitle').textContent = count === 1 ? 'UNSEALING PRISM CORE' : 'TAP CARDS OR WATCH REVEAL';
    if ($('#gtSummaryChips')) $('#gtSummaryChips').innerHTML = '';
  }

  function playPull(opts) {
    wireControls();
    clearTimers();
    if (GachaSpotlight.isActive()) GachaSpotlight.close();

    const { results, buildArt, makeEquipBtn, onRevealDone, onPullAgain, onClose, replay = false } = opts;
    const theater = $('#gachaTheater');
    if (!theater || !$('#gtCardsGrid') || !Array.isArray(results) || !results.length) { onRevealDone?.(); return; }

    GachaSpotlight.preloadAssets(results);
    const bestRarity = results.some((r) => r.rarity === 'ssr') ? 'ssr' : results.some((r) => r.rarity === 'sr') ? 'sr' : 'r';
    const fast = isFast();
    const doCoreFakeout = bestRarity === 'ssr' ? Math.random() < 0.45 : (bestRarity === 'sr' && Math.random() < 0.34);
    const initialTier = doCoreFakeout ? (bestRarity === 'ssr' ? (Math.random() < 0.55 ? 'sr' : 'r') : 'r') : bestRarity;

    const cards = preparePullCards(results, doCoreFakeout, opts);
    session = {
      cards, results, bestRarity, makeEquipBtn, buildArt, onRevealDone, onPullAgain, onClose, replay,
      cursor: 0, inProgress: true, celebratedSsr: false, celebratedSr: false, jumpToArena: null,
    };
    resetTheaterUI(theater, initialTier, results.length, replay);

    Sound.sfx?.recycle?.();
    if (results.length > 1) Sound.sfx?.shuffle?.(); else Sound.sfx?.almostWon?.();

    const meteorSpan = spawnMeteors(results, doCoreFakeout ? { initialTier } : null, fast);
    const warpMs = Math.max(fast ? 480 : 860, meteorSpan + (fast ? 90 : 160));
    const fakeoutMs = doCoreFakeout ? (fast ? 340 : 580) : 0;

    let arenaLaunched = false;
    const launchArena = () => {
      if (arenaLaunched || !session?.inProgress) return;
      arenaLaunched = true;
      clearTimers();
      theater.dataset.tier = bestRarity;
      triggerImpact(bestRarity);
      theater.dataset.phase = 'shatter';
      schedule(() => {
        if (!session?.inProgress) return;
        $('#gtCoreStage')?.classList.add('hidden');
        $('#gtArena')?.classList.remove('hidden');
        theater.dataset.phase = 'revealing';
        schedule(stepCascade, results.length === 1 ? (fast ? 120 : 210) : (fast ? 150 : 250));
      }, fast ? 180 : 290);
    };
    session.jumpToArena = launchArena;

    if (doCoreFakeout) {
      schedule(() => {
        if (arenaLaunched || !session?.inProgress) return;
        theater.dataset.phase = 'fakeout';
        theater.dataset.tier = bestRarity;
        if ($('#gtTickerTop')) $('#gtTickerTop').textContent = '⚠ ANOMALY DETECTED // PRISM OVERLOAD — RARITY BREAK!! ⚠';
        if ($('#gtChargeReadout')) $('#gtChargeReadout').textContent = bestRarity === 'ssr' ? '★ CRITICAL OVERLOAD // SSR DETECTED!! ★' : '✦ RESONANCE SURGE // SR+!! ✦';
        Sound.sfx?.cutin?.();
        Sound.sfx?.aceIgnition?.();
        FX?.supernova?.(innerWidth * 0.5, innerHeight * 0.5, bestRarity);
      }, warpMs);
    } else {
      schedule(() => {
        if (arenaLaunched || !session?.inProgress || !$('#gtChargeReadout')) return;
        if (bestRarity === 'ssr') $('#gtChargeReadout').textContent = '★ GOLDEN SUPERNOVA LOCKED!! ★';
        else if (bestRarity === 'sr') $('#gtChargeReadout').textContent = '✦ HIGH-ENERGY RESONANCE! ✦';
      }, Math.round(warpMs * 0.62));
    }

    schedule(launchArena, warpMs + fakeoutMs);
  }

  function playCraftSpotlight(item, opts = {}) {
    wireControls();
    clearTimers();
    const theater = $('#gachaTheater');
    if (!theater || !item) return;

    GachaSpotlight.preloadAssets([{ item }]);
    session = {
      cards: [], results: [{ item, rarity: item.rarity, isNew: true, shardsGained: 0 }],
      bestRarity: item.rarity, inProgress: false, standaloneSpot: true, onClose: opts.onClose,
    };

    theater.classList.remove('hidden', 'is-shaking');
    theater.dataset.phase = 'spotlight';
    theater.dataset.tier = item.rarity || 'ssr';
    $('#gtCoreStage')?.classList.add('hidden');
    $('#gtArena')?.classList.add('hidden');
    $('#btnTheaterSkip')?.classList.remove('hidden');

    GachaSpotlight.open(
      { item, rarity: item.rarity, isNew: true, shardsGained: 0, crafted: true },
      { makeEquipBtn: opts.makeEquipBtn, buildArt: opts.buildArt, standalone: true }
    ).then(() => { if (session?.standaloneSpot) closeTheater(); });
  }

  return {
    playPull,
    playCraftSpotlight,
    bindHoloTilt: (el) => GachaSpotlight.bindHoloTilt(el),
    buildSummaryBadges: (res) => GachaSpotlight.buildSummaryBadges(res),
    syncTheaterPullButtons,
    onEscape,
    abort,
    isOpen: () => !$('#gachaTheater')?.classList.contains('hidden'),
  };
})();
window.GachaCinematic = GachaCinematic;
