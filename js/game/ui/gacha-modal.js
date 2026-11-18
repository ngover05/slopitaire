/* Slopitaire — Prism Gacha modal (#gachaModal), reveal stage, shard exchange & live badges. */
'use strict';

(() => {
  const hasGacha = () => typeof Gacha !== 'undefined' && Gacha && typeof Gacha.getState === 'function';

  let activeTab = 'banner';
  let exchangeFilter = 'all';
  let lastExchangeFilter = 'all';
  let lastResults = null;
  let isRevealing = false;
  let pullingSync = false;
  let revealTimers = [];
  let revealCtx = null;
  let controlsBound = false;
  let subscribed = false;

  const isAnimOff = () => (typeof settings !== 'undefined' && settings.anim === 'off')
    || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const rarityLabel = (r) => ({ ssr: 'SSR', sr: 'SR', r: 'R' }[r] || String(r || 'R').toUpperCase());
  const typeLabel = (t) => ({ skin: 'Outfit', front: 'Card Front', back: 'Card Back' }[t] || t || '');

  function clearRevealTimers() {
    while (revealTimers.length) clearTimeout(revealTimers.pop());
  }

  function ensureSubscribed() {
    if (subscribed || !hasGacha() || typeof Gacha.onChange !== 'function') return;
    subscribed = true;
    Gacha.onChange(() => {
      syncGachaBadges();
      const gachaEl = $('#gachaModal');
      if (gachaEl && !gachaEl.classList.contains('hidden')) {
        if (isRevealing || pullingSync) refreshHeaderAndControls(Gacha.getState(), Gacha.getCollectionStats());
        else refreshGachaModal();
      }
      const skinsEl = $('#skinsModal');
      if (skinsEl && !skinsEl.classList.contains('hidden')) window.refreshSkinsModal?.();
      const settingsEl = $('#settingsModal');
      if (settingsEl && !settingsEl.classList.contains('hidden')) {
        window.refreshSettingsOutfit?.();
        window.refreshSettingsDecks?.();
      }
    });
  }

  function syncGachaBadges() {
    const state = hasGacha() ? Gacha.getState() : null;
    const pulls = Math.max(0, Number(state?.pulls) || 0);
    const shards = Math.max(0, Number(state?.shards) || 0);

    const btnGacha = $('#btnGacha');
    const badge = $('#gachaBadge');
    if (btnGacha) {
      btnGacha.classList.toggle('has-pulls', pulls > 0);
      btnGacha.title = pulls > 0
        ? `Prism Gacha (G) — ${pulls} pull${pulls === 1 ? '' : 's'} ready`
        : 'Prism Gacha (G)';
    }
    if (badge) {
      badge.textContent = pulls > 0 ? (pulls > 99 ? '99+' : String(pulls)) : '';
      badge.classList.toggle('hidden', pulls <= 0);
    }

    const startBtn = $('#btnStartGacha');
    const startCount = $('#startGachaCount');
    if (startBtn) startBtn.classList.toggle('has-pulls', pulls > 0);
    if (startCount) {
      startCount.textContent = pulls > 0 ? `${pulls}🎫` : '';
      startCount.classList.toggle('hidden', pulls <= 0);
    }

    const skinsGacha = $('#btnSkinsGacha');
    if (skinsGacha) {
      skinsGacha.classList.toggle('has-pulls', pulls > 0);
      skinsGacha.textContent = pulls > 0
        ? `🎰 Prism Gacha (${pulls}🎫)`
        : shards > 0
          ? `🎰 Prism Gacha (${shards}✧)`
          : '🎰 Prism Gacha';
    }

    const settingsGacha = $('#btnSettingsGacha');
    if (settingsGacha) {
      settingsGacha.classList.toggle('has-pulls', pulls > 0);
      settingsGacha.textContent = pulls > 0 ? `🎰 Gacha (${pulls}🎫)` : '🎰 Gacha';
    }
  }

  function createItemArtEl(item) {
    if (!item) return document.createElement('div');
    if (item.type === 'skin') {
      const wrap = document.createElement('div');
      wrap.className = 'gacha-art gacha-art-skin';
      wrap.dataset.partner = item.girl || '';
      const c = (typeof Cast !== 'undefined' && Cast.get) ? Cast.get(item.girl) : null;
      wrap.innerHTML = c ? c.faceHTML('cheer', item.key) : '';
      return wrap;
    }
    if (item.type === 'front') {
      const F = (typeof Art !== 'undefined' && Art.FRONTS && Art.FRONTS[item.key]) || {};
      const sw = document.createElement('div');
      sw.className = 'deck-card front-swatch gacha-art-card';
      sw.style.setProperty('--card-front-bg', F.bg || '#ffffff');
      sw.style.setProperty('--card-front-border', F.border || 'rgba(135, 165, 160, .45)');
      sw.style.setProperty('--card-rk-font', F.font || 'inherit');
      sw.style.setProperty('--card-rk-weight', F.weight || '400');
      sw.innerHTML = (typeof Art !== 'undefined' && Art.frontPreviewSVG) ? Art.frontPreviewSVG(item.key) : '';
      return sw;
    }
    const sw = document.createElement('div');
    sw.className = 'deck-card back-swatch gacha-art-card';
    sw.style.setProperty('--img', (typeof Art !== 'undefined' && Art.backDataURI) ? Art.backDataURI(item.key) : '');
    return sw;
  }

  function makeEquipBtn(item, onDone) {
    const eq = !!(hasGacha() && Gacha.isItemEquipped?.(item.id));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn gacha-item-btn' + (eq ? ' is-equipped' : ' is-equip');
    btn.disabled = eq;
    btn.textContent = eq ? '✓ Equipped' : 'Equip';
    btn.onclick = () => {
      Sound.ensure?.();
      if (hasGacha() && Gacha.equipItem?.(item.id)) {
        Sound.sfx?.click?.();
        onDone?.();
      }
    };
    return btn;
  }

  function refreshHeaderAndControls(state, stats) {
    const modal = $('#gachaModal');
    if (modal) modal.classList.toggle('is-anim-off', isAnimOff());

    const pulls = Math.max(0, Number(state?.pulls) || 0);
    const shards = Math.max(0, Number(state?.shards) || 0);
    const carry = Math.max(0, Number(state?.pointCarry) || 0);
    const perPull = (hasGacha() && Gacha.POINTS_PER_PULL) ? Gacha.POINTS_PER_PULL : 1500;
    const pitySsrMax = (hasGacha() && Gacha.PITY_SSR) ? Gacha.PITY_SSR : 10;
    const pitySrMax = (hasGacha() && Gacha.PITY_SR) ? Gacha.PITY_SR : 5;
    const ssrLeft = Math.max(1, pitySsrMax - (Number(state?.pitySsr) || 0));
    const srLeft = Math.max(1, pitySrMax - (Number(state?.pitySr) || 0));

    const pullsVal = $('#gachaPullsVal');
    const pullsChip = $('#gachaPullsChip');
    const shardsVal = $('#gachaShardsVal');
    const collCount = $('#gachaCollectionCount');
    const carryLbl = $('#gachaCarryLabel');
    const carryFill = $('#gachaCarryFill');
    const pityPill = $('#gachaPityPill');

    if (pullsVal) pullsVal.textContent = pulls.toLocaleString();
    if (pullsChip) pullsChip.classList.toggle('has-value', pulls > 0);
    if (shardsVal) shardsVal.textContent = shards.toLocaleString();
    if (collCount) collCount.textContent = `${stats?.owned || 0} / ${stats?.total || 0}`;
    if (carryLbl) carryLbl.textContent = `Next pull: ${carry.toLocaleString()} / ${perPull.toLocaleString()} pts`;
    if (carryFill) carryFill.style.transform = `scaleX(${Math.max(0, Math.min(1, carry / Math.max(1, perPull))).toFixed(4)})`;

    if (pityPill) {
      pityPill.classList.toggle('is-guaranteed-ssr', ssrLeft === 1);
      pityPill.classList.toggle('is-guaranteed-sr', ssrLeft > 1 && srLeft === 1);
      pityPill.textContent = ssrLeft === 1
        ? '★ NEXT PULL: GUARANTEED SSR!'
        : srLeft === 1
          ? `✦ NEXT PULL: SR+ · SSR in ${ssrLeft}`
          : `SR+ in ${srLeft} · SSR in ${ssrLeft}`;
    }

    const btnPull1 = $('#btnGachaPull1');
    const btnMulti = $('#btnGachaPullMulti');
    const btnSkip = $('#btnGachaSkip');
    if (btnPull1) btnPull1.disabled = isRevealing || pulls < 1 || !hasGacha();
    if (btnMulti) {
      const multiCount = pulls >= 10 ? 10 : Math.max(2, Math.min(10, pulls));
      btnMulti.textContent = (pulls < 2 || pulls >= 10) ? '🌟 Pull ×10' : `🌟 Pull ×${multiCount}`;
      btnMulti.dataset.count = String(multiCount);
      btnMulti.disabled = isRevealing || pulls < 2 || !hasGacha();
    }
    if (btnSkip) btnSkip.classList.toggle('hidden', !isRevealing);
  }

  function renderFeatured() {
    const box = $('#gachaFeatured');
    if (!box) return;
    box.innerHTML = '';
    if (!hasGacha() || !Array.isArray(Gacha.POOL)) return;

    const pickFeatured = (rarity) => {
      const tier = Gacha.POOL.filter((it) => it.rarity === rarity);
      return tier.find((it) => !Gacha.isUnlocked(it.id)) || tier[0] || null;
    };

    const list = [pickFeatured('ssr'), pickFeatured('sr'), pickFeatured('r')].filter(Boolean);
    list.forEach((item) => {
      const owned = Gacha.isUnlocked(item.id);
      const card = document.createElement('div');
      card.className = `gacha-feat-card rarity-${item.rarity}` + (owned ? ' is-owned' : '');
      const art = createItemArtEl(item);
      const info = document.createElement('div');
      info.className = 'gfc-info';
      info.innerHTML =
        `<div class="gfc-top">` +
          `<span class="gacha-rarity-tag is-${item.rarity}">${rarityLabel(item.rarity)}</span>` +
          `<span class="gfc-type">${esc(typeLabel(item.type))}</span>` +
        `</div>` +
        `<b class="gfc-name">${esc(item.shortName || item.name)}</b>` +
        `<small class="gfc-sub">${esc(owned ? '✓ Owned' : (item.subtitle || 'Featured drop'))}</small>`;
      card.append(art, info);
      box.appendChild(card);
    });
  }

  function buildResultCard(res, sealed) {
    const card = document.createElement('div');
    card.className = `gacha-card rarity-${res.rarity}` + (sealed ? ' is-sealed' : ' is-revealed');

    const seal = document.createElement('div');
    seal.className = 'gacha-card-seal';
    seal.innerHTML =
      `<span class="gcs-emblem">✦</span>` +
      `<span class="gacha-rarity-tag is-${res.rarity}">${rarityLabel(res.rarity)}</span>`;

    const face = document.createElement('div');
    face.className = 'gacha-card-face';

    const top = document.createElement('div');
    top.className = 'gcf-top';
    const rTag = document.createElement('span');
    rTag.className = `gacha-rarity-tag is-${res.rarity}`;
    rTag.textContent = rarityLabel(res.rarity);
    const status = document.createElement('span');
    status.className = 'gacha-status ' + (res.isNew ? 'is-new' : 'is-dupe');
    status.textContent = res.isNew ? '★ NEW!' : `DUPLICATE → +${res.shardsGained} ✧`;
    top.append(rTag, status);

    const art = createItemArtEl(res.item);
    const meta = document.createElement('div');
    meta.className = 'gcf-meta';
    meta.innerHTML =
      `<b class="gcf-name">${esc(res.item.shortName || res.item.name)}</b>` +
      `<small class="gcf-sub">${esc(res.item.subtitle || typeLabel(res.item.type))}</small>`;

    const act = makeEquipBtn(res.item, () => refreshGachaModal());
    face.append(top, art, meta, act);
    card.append(seal, face);
    return card;
  }

  function renderStageResults(results, sealed) {
    const stage = $('#gachaStage');
    const empty = $('#gachaStageEmpty');
    const grid = $('#gachaResultsGrid');
    if (!stage || !grid) return [];

    if (!Array.isArray(results) || !results.length) {
      stage.dataset.phase = 'idle';
      delete stage.dataset.bestRarity;
      empty?.classList.remove('hidden');
      grid.classList.add('hidden');
      grid.innerHTML = '';
      return [];
    }

    empty?.classList.add('hidden');
    grid.classList.remove('hidden');
    grid.classList.toggle('is-single', results.length === 1);
    grid.innerHTML = '';
    const cards = results.map((res) => {
      const el = buildResultCard(res, sealed);
      grid.appendChild(el);
      return el;
    });
    return cards;
  }

  function revealCardAt(idx, cardEl, res, ctx) {
    if (!cardEl || !cardEl.classList.contains('is-sealed')) return;
    cardEl.classList.remove('is-sealed');
    cardEl.classList.add('is-revealed');
    if (res.rarity === 'ssr') {
      Sound.sfx?.newRecord?.();
      if (ctx && !ctx.celebratedSsr) {
        ctx.celebratedSsr = true;
        FX?.celebrate?.();
        StageBG?.pulse?.('#ffe169', 1.35);
      }
      if (typeof sparkleAt === 'function') sparkleAt(cardEl);
    } else if (res.rarity === 'sr') {
      Sound.sfx?.comboMilestone?.(2);
      if (typeof sparkleAt === 'function') sparkleAt(cardEl);
    } else {
      (Sound.sfx?.revealCard || Sound.sfx?.flip)?.(idx + 1);
    }
  }

  function completeReveal() {
    clearRevealTimers();
    isRevealing = false;
    revealCtx = null;
    const stage = $('#gachaStage');
    if (stage && lastResults?.length) stage.dataset.phase = 'done';
    refreshGachaModal();
  }

  function skipReveal(silent = false) {
    clearRevealTimers();
    if (revealCtx) {
      const { cards, results, bestRarity } = revealCtx;
      cards.forEach((c) => {
        c.classList.remove('is-sealed');
        c.classList.add('is-revealed');
      });
      if (!silent) {
        if (bestRarity === 'ssr' && !revealCtx.celebratedSsr) {
          revealCtx.celebratedSsr = true;
          Sound.sfx?.newRecord?.();
          FX?.celebrate?.();
          StageBG?.pulse?.('#ffe169', 1.25);
        } else if (bestRarity === 'sr') {
          Sound.sfx?.comboMilestone?.(2);
        }
      }
    }
    completeReveal();
  }

  function runPull(count) {
    if (isRevealing || !hasGacha()) return;
    Sound.ensure?.();
    pullingSync = true;
    let pulled = null;
    try {
      pulled = Gacha.pull(count);
    } finally {
      pullingSync = false;
    }
    if (!pulled || !Array.isArray(pulled.results) || !pulled.results.length) {
      Sound.sfx?.invalid?.();
      toast('Not enough pulls! Win deals to earn more 🎫');
      return;
    }

    lastResults = pulled.results;
    const bestRarity = pulled.results.some((r) => r.rarity === 'ssr') ? 'ssr'
      : pulled.results.some((r) => r.rarity === 'sr') ? 'sr' : 'r';
    const stage = $('#gachaStage');
    const instant = isAnimOff();

    if (instant) {
      renderStageResults(pulled.results, false);
      if (stage) {
        stage.dataset.phase = 'done';
        stage.dataset.bestRarity = bestRarity;
      }
      if (bestRarity === 'ssr') {
        Sound.sfx?.newRecord?.();
        FX?.celebrate?.();
        StageBG?.pulse?.('#ffe169', 1.25);
      } else if (bestRarity === 'sr') {
        Sound.sfx?.comboMilestone?.(2);
        StageBG?.pulse?.('#9d8cff', 0.85);
      } else {
        Sound.sfx?.revealCard?.(1);
      }
      refreshGachaModal();
      return;
    }

    clearRevealTimers();
    isRevealing = true;
    const cards = renderStageResults(pulled.results, true);
    revealCtx = { cards, results: pulled.results, bestRarity, celebratedSsr: false };
    refreshHeaderAndControls(Gacha.getState(), Gacha.getCollectionStats());

    if (stage) {
      stage.dataset.phase = 'charging';
      stage.dataset.bestRarity = bestRarity;
    }
    if (bestRarity === 'ssr' || bestRarity === 'sr') Sound.sfx?.cutin?.();
    else Sound.sfx?.modeSwitch?.();
    StageBG?.pulse?.(bestRarity === 'ssr' ? '#ffe169' : bestRarity === 'sr' ? '#9d8cff' : '#2ce8a2', bestRarity === 'ssr' ? 1.2 : 0.75);

    const fast = typeof settings !== 'undefined' && settings.anim === 'fast';
    const chargeMs = fast ? 240 : 420;
    const stepMs = fast ? 105 : pulled.results.length > 1 ? 165 : 220;

    revealTimers.push(setTimeout(() => {
      if (stage) stage.dataset.phase = 'revealing';
    }, chargeMs));

    pulled.results.forEach((res, i) => {
      revealTimers.push(setTimeout(() => {
        revealCardAt(i, cards[i], res, revealCtx);
      }, chargeMs + i * stepMs));
    });

    revealTimers.push(setTimeout(() => {
      completeReveal();
    }, chargeMs + pulled.results.length * stepMs + 220));
  }

  function renderExchange(state) {
    const grid = $('#gachaExchangeGrid');
    if (!grid) return;
    const prevScroll = lastExchangeFilter === exchangeFilter ? grid.scrollTop : 0;
    lastExchangeFilter = exchangeFilter;
    grid.innerHTML = '';

    document.querySelectorAll('#gachaFilters .gacha-filter').forEach((b) => {
      const on = b.dataset.filter === exchangeFilter;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });

    if (!hasGacha() || !Array.isArray(Gacha.POOL)) return;
    const shards = Math.max(0, Number(state?.shards) || 0);
    const items = exchangeFilter === 'all'
      ? Gacha.POOL
      : Gacha.POOL.filter((it) => it.type === exchangeFilter);

    items.forEach((item) => {
      const owned = Gacha.isUnlocked(item.id);
      const equipped = owned && Gacha.isItemEquipped?.(item.id);
      const card = document.createElement('div');
      card.className = `gacha-ex-card rarity-${item.rarity}` + (owned ? ' is-owned' : ' is-locked') + (equipped ? ' is-equipped' : '');

      const top = document.createElement('div');
      top.className = 'gec-top';
      top.innerHTML =
        `<span class="gacha-rarity-tag is-${item.rarity}">${rarityLabel(item.rarity)}</span>` +
        `<span class="gec-state ${equipped ? 'is-eq' : owned ? 'is-own' : 'is-lock'}">${equipped ? '✓ EQUIPPED' : owned ? 'OWNED' : '🔒 LOCKED'}</span>`;

      const art = createItemArtEl(item);
      const meta = document.createElement('div');
      meta.className = 'gec-meta';
      meta.innerHTML =
        `<b class="gec-name">${esc(item.name)}</b>` +
        `<small class="gec-sub">${esc(item.subtitle || typeLabel(item.type))}</small>`;

      let actionBtn;
      if (owned) {
        actionBtn = makeEquipBtn(item, () => refreshGachaModal());
      } else {
        actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.className = 'btn gacha-item-btn is-craft';
        actionBtn.disabled = shards < item.craftCost;
        actionBtn.textContent = `✧ Craft (${item.craftCost})`;
        actionBtn.onclick = () => {
          Sound.ensure?.();
          const rect = actionBtn.getBoundingClientRect?.();
          pullingSync = true;
          let res = null;
          try {
            res = Gacha.craft(item.id);
          } finally {
            pullingSync = false;
          }
          if (res && res.ok) {
            (item.rarity === 'ssr' ? Sound.sfx?.newRecord : Sound.sfx?.modeSwitch)?.();
            if (rect) FX?.burst?.(rect.left + rect.width / 2, rect.top + rect.height / 2);
            toast(`Crafted ${item.name}! ✨`);
            refreshGachaModal();
          } else {
            Sound.sfx?.invalid?.();
            toast('Not enough shards! ✧');
          }
        };
      }

      card.append(top, art, meta, actionBtn);
      grid.appendChild(card);
    });
    if (prevScroll) grid.scrollTop = prevScroll;
  }

  function syncTabs() {
    document.querySelectorAll('#gachaModal .gacha-tab').forEach((b) => {
      const on = b.dataset.tab === activeTab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('#gachaBannerPanel')?.classList.toggle('hidden', activeTab !== 'banner');
    $('#gachaExchangePanel')?.classList.toggle('hidden', activeTab !== 'exchange');
  }

  function bindGachaControls() {
    if (controlsBound) return;
    controlsBound = true;

    document.querySelectorAll('#gachaModal .gacha-tab').forEach((b) => {
      b.onclick = () => {
        const nextTab = b.dataset.tab === 'exchange' ? 'exchange' : 'banner';
        Sound.ensure?.();
        Sound.sfx?.click?.();
        if (nextTab === activeTab) return;
        activeTab = nextTab;
        if (isRevealing) skipReveal(true);
        else refreshGachaModal();
      };
    });

    document.querySelectorAll('#gachaFilters .gacha-filter').forEach((b) => {
      b.onclick = () => {
        Sound.ensure?.();
        Sound.sfx?.click?.();
        exchangeFilter = b.dataset.filter || 'all';
        if (hasGacha()) renderExchange(Gacha.getState());
      };
    });

    const btnPull1 = $('#btnGachaPull1');
    if (btnPull1) btnPull1.onclick = () => runPull(1);

    const btnMulti = $('#btnGachaPullMulti');
    if (btnMulti) {
      btnMulti.onclick = () => {
        const count = Number(btnMulti.dataset.count) || 10;
        runPull(count);
      };
    }

    const btnSkip = $('#btnGachaSkip');
    if (btnSkip) btnSkip.onclick = () => { Sound.sfx?.click?.(); skipReveal(false); };
  }

  function refreshGachaModal() {
    ensureSubscribed();
    bindGachaControls();
    syncGachaBadges();
    syncTabs();

    if (!hasGacha()) {
      refreshHeaderAndControls({ pulls: 0, shards: 0, pointCarry: 0, pitySsr: 0, pitySr: 0 }, { owned: 0, total: 0 });
      return;
    }

    const state = Gacha.getState();
    const stats = Gacha.getCollectionStats();
    refreshHeaderAndControls(state, stats);
    if (activeTab === 'banner') {
      renderFeatured();
      if (!isRevealing && lastResults) {
        renderStageResults(lastResults, false);
      }
    } else {
      renderExchange(state);
    }
  }

  function openGachaModal(initialTab) {
    if (initialTab === 'banner' || initialTab === 'exchange') activeTab = initialTab;
    else if (!activeTab) activeTab = 'banner';
    refreshGachaModal();
    showOverlay('gachaModal');
  }

  window.onGachaModalClosed = () => {
    if (isRevealing) skipReveal(true);
  };
  window.openGachaModal = openGachaModal;
  window.refreshGachaModal = refreshGachaModal;
  window.syncGachaBadges = syncGachaBadges;

  ensureSubscribed();
  syncGachaBadges();
})();
