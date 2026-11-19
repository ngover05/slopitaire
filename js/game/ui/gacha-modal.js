/* Slopitaire — Prism Gacha modal (#gachaModal), reveal stage, shard exchange & live badges. */
'use strict';

(() => {
  const hasGacha = () => typeof Gacha !== 'undefined' && Gacha && typeof Gacha.getState === 'function';
  const hasCinematic = () => typeof GachaCinematic !== 'undefined' && !!GachaCinematic;

  let activeTab = 'banner';
  let exchangeFilter = 'all';
  let lastExchangeFilter = 'all';
  let lastResults = null;
  let justCraftedId = null;
  let isRevealing = false;
  let pullingSync = false;
  let controlsBound = false;
  let subscribed = false;
  let prevWalletPulls = null;
  let prevWalletShards = null;

  const isAnimOff = () => (typeof settings !== 'undefined' && settings.anim === 'off')
    || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const rarityLabel = (r) => ({ ssr: 'SSR', sr: 'SR', r: 'R' }[r] || String(r || 'R').toUpperCase());
  const rarityStars = (r) => (r === 'ssr' ? 5 : r === 'sr' ? 4 : 3);
  const typeLabel = (t) => ({ skin: 'Outfit', front: 'Card Front', back: 'Card Back' }[t] || t || '');

  function ensureSubscribed() {
    if (subscribed || !hasGacha() || typeof Gacha.onChange !== 'function') return;
    subscribed = true;
    Gacha.onChange(() => {
      syncGachaBadges();
      const gachaEl = $('#gachaModal');
      if (gachaEl && !gachaEl.classList.contains('hidden')) {
        if (isRevealing || pullingSync || GachaCinematic?.isOpen?.()) {
          refreshHeaderAndControls(Gacha.getState(), Gacha.getCollectionStats());
          GachaCinematic?.syncTheaterPullButtons?.();
        } else {
          refreshGachaModal();
        }
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
      wrap.innerHTML = c ? c.faceHTML(null, item.key) : '';
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

  function syncLiveEquipButtons() {
    if (!hasGacha()) return;
    document.querySelectorAll('#gachaModal .gacha-item-btn[data-item-id]').forEach((btn) => {
      const id = btn.dataset.itemId;
      if (!id || !Gacha.isUnlocked(id)) return;
      const eq = !!Gacha.isItemEquipped?.(id);
      btn.classList.toggle('is-equipped', eq);
      btn.classList.toggle('is-equip', !eq);
      btn.disabled = eq;
      btn.textContent = eq ? '✓ Equipped' : 'Equip';
    });
  }

  function makeEquipBtn(item, onDone) {
    const eq = !!(hasGacha() && Gacha.isItemEquipped?.(item.id));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.itemId = item.id;
    btn.className = 'btn gacha-item-btn' + (eq ? ' is-equipped' : ' is-equip');
    btn.disabled = eq;
    btn.textContent = eq ? '✓ Equipped' : 'Equip';
    btn.onclick = () => {
      Sound.ensure?.();
      if (hasGacha() && Gacha.equipItem?.(item.id)) {
        Sound.sfx?.click?.();
        if (typeof sparkleAt === 'function' && !isAnimOff()) sparkleAt(btn);
        syncLiveEquipButtons();
        onDone?.();
      }
    };
    return btn;
  }

  function popChip(el) {
    if (!el || isAnimOff()) return;
    el.classList.remove('is-popping');
    void el.offsetWidth;
    el.classList.add('is-popping');
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
    const shardsChip = $('#gachaShardsChip');
    const collCount = $('#gachaCollectionCount');
    const carryLbl = $('#gachaCarryLabel');
    const carryFill = $('#gachaCarryFill');
    const pityPill = $('#gachaPityPill');

    if (pullsVal) pullsVal.textContent = pulls.toLocaleString();
    if (pullsChip) {
      pullsChip.classList.toggle('has-value', pulls > 0);
      if (prevWalletPulls !== null && pulls !== prevWalletPulls) popChip(pullsChip);
    }
    if (shardsVal) shardsVal.textContent = shards.toLocaleString();
    if (shardsChip && prevWalletShards !== null && shards > prevWalletShards) popChip(shardsChip);
    prevWalletPulls = pulls;
    prevWalletShards = shards;

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
    if (btnPull1) {
      btnPull1.disabled = isRevealing || pulls < 1 || !hasGacha();
      btnPull1.classList.toggle('is-ssr-ready', ssrLeft === 1 && pulls >= 1);
    }
    if (btnMulti) {
      const multiCount = pulls >= 10 ? 10 : Math.max(2, Math.min(10, pulls));
      btnMulti.textContent = (pulls < 2 || pulls >= 10) ? '🌟 Pull ×10' : `🌟 Pull ×${multiCount}`;
      btnMulti.dataset.count = String(multiCount);
      btnMulti.disabled = isRevealing || pulls < 2 || !hasGacha();
      btnMulti.classList.toggle('is-ssr-ready', pulls >= ssrLeft);
    }
    if (btnSkip) btnSkip.classList.toggle('hidden', !isRevealing || !!GachaCinematic?.isOpen?.());
  }

  function renderFeatured() {
    const box = $('#gachaFeatured');
    if (!box) return;
    box.innerHTML = '';
    if (!hasGacha() || !Array.isArray(Gacha.POOL)) return;
    GachaCinematic?.bindHoloTilt?.(box);

    const pickFeatured = (rarity) => {
      const tier = Gacha.POOL.filter((it) => it.rarity === rarity);
      return tier.find((it) => !Gacha.isUnlocked(it.id)) || tier[0] || null;
    };

    const list = [pickFeatured('ssr'), pickFeatured('sr'), pickFeatured('r')].filter(Boolean);
    list.forEach((item) => {
      const owned = Gacha.isUnlocked(item.id);
      const card = document.createElement('div');
      card.className = `gacha-feat-card rarity-${item.rarity}` + (owned ? ' is-owned' : '');
      const glare = document.createElement('div');
      glare.className = 'gacha-holo-glare';
      glare.setAttribute('aria-hidden', 'true');
      const art = createItemArtEl(item);
      const info = document.createElement('div');
      info.className = 'gfc-info';
      const stars = '★'.repeat(rarityStars(item.rarity));
      info.innerHTML =
        `<div class="gfc-top">` +
          `<span class="gacha-rarity-tag is-${item.rarity}">${rarityLabel(item.rarity)}</span>` +
          `<span class="gfc-stars" aria-hidden="true">${stars}</span>` +
          `<span class="gfc-type">${esc(typeLabel(item.type))}</span>` +
        `</div>` +
        `<b class="gfc-name">${esc(item.shortName || item.name)}</b>` +
        `<small class="gfc-sub">${esc(owned ? '✓ Owned' : (item.subtitle || 'Featured drop'))}</small>`;
      card.append(glare, art, info);
      box.appendChild(card);
    });
  }

  function buildResultCard(res, sealed) {
    const card = document.createElement('div');
    card.className = `gacha-card rarity-${res.rarity}` + (sealed ? ' is-sealed' : ' is-revealed');
    card.dataset.sealTier = res.rarity;

    const rays = document.createElement('div');
    rays.className = 'gacha-card-rays';
    rays.setAttribute('aria-hidden', 'true');

    const glare = document.createElement('div');
    glare.className = 'gacha-holo-glare';
    glare.setAttribute('aria-hidden', 'true');

    const burst = document.createElement('div');
    burst.className = 'gacha-card-burst';
    burst.setAttribute('aria-hidden', 'true');

    const seal = document.createElement('div');
    seal.className = 'gacha-card-seal';
    seal.innerHTML =
      `<div class="gcs-sigil" aria-hidden="true">` +
        `<span class="gcs-ring"></span>` +
        `<span class="gcs-emblem">✦</span>` +
      `</div>` +
      `<span class="gcs-hint">PRISM SEAL</span>`;

    const face = document.createElement('div');
    face.className = 'gacha-card-face';

    const top = document.createElement('div');
    top.className = 'gcf-top';
    const rTag = document.createElement('span');
    rTag.className = `gacha-rarity-tag is-${res.rarity}`;
    rTag.textContent = rarityLabel(res.rarity);
    const status = document.createElement('span');
    status.className = 'gacha-status ' + (res.isNew ? 'is-new' : 'is-dupe');
    status.textContent = res.isNew ? '★ NEW!' : `+${res.shardsGained} ✧`;
    status.title = res.isNew ? 'New collection unlock!' : `Duplicate converted to +${res.shardsGained} Prism Shards`;
    top.append(rTag, status);

    const art = createItemArtEl(res.item);
    const stars = document.createElement('div');
    stars.className = 'gcf-stars';
    stars.setAttribute('aria-hidden', 'true');
    stars.textContent = '★'.repeat(rarityStars(res.rarity));

    const meta = document.createElement('div');
    meta.className = 'gcf-meta';
    meta.innerHTML =
      `<b class="gcf-name">${esc(res.item.shortName || res.item.name)}</b>` +
      `<small class="gcf-sub">${esc(res.item.subtitle || typeLabel(res.item.type))}</small>`;

    const act = makeEquipBtn(res.item, () => {
      if (!GachaCinematic?.isOpen?.()) refreshGachaModal();
    });
    face.append(top, art, stars, meta, act);
    card.append(rays, glare, burst, seal, face);
    return card;
  }

  function renderStageResults(results, sealed) {
    const stage = $('#gachaStage');
    const empty = $('#gachaStageEmpty');
    const grid = $('#gachaResultsGrid');
    const sumBar = $('#gachaStageSummary');
    const sumChips = $('#gachaStageSummaryChips');
    if (!stage || !grid) return [];
    GachaCinematic?.bindHoloTilt?.(grid);

    if (!Array.isArray(results) || !results.length) {
      stage.dataset.phase = 'idle';
      delete stage.dataset.bestRarity;
      empty?.classList.remove('hidden');
      sumBar?.classList.add('hidden');
      grid.classList.add('hidden');
      grid.innerHTML = '';
      return [];
    }

    empty?.classList.add('hidden');
    if (sumBar && sumChips) {
      if (!sealed && hasCinematic()) {
        sumChips.innerHTML = GachaCinematic.buildSummaryBadges(results).html;
        sumBar.classList.remove('hidden');
      } else {
        sumBar.classList.add('hidden');
      }
    }
    grid.classList.remove('hidden');
    grid.classList.toggle('is-single', results.length === 1);
    grid.innerHTML = '';
    return results.map((res, idx) => {
      const el = buildResultCard(res, sealed);
      el.style.setProperty('--ci', String(idx));
      grid.appendChild(el);
      return el;
    });
  }

  function skipReveal(silent = false) {
    if (hasCinematic() && GachaCinematic.isOpen()) {
      GachaCinematic.abort(silent);
    }
    isRevealing = false;
    if (lastResults?.length) {
      renderStageResults(lastResults, false);
      const stage = $('#gachaStage');
      if (stage) stage.dataset.phase = 'done';
    }
    if (!silent) refreshGachaModal();
  }

  function launchPullSequence(results, replay = false) {
    const bestRarity = results.some((r) => r.rarity === 'ssr') ? 'ssr'
      : results.some((r) => r.rarity === 'sr') ? 'sr' : 'r';
    const stage = $('#gachaStage');

    if (isAnimOff() || !hasCinematic()) {
      GachaCinematic?.abort?.(true);
      isRevealing = false;
      renderStageResults(results, false);
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

    isRevealing = true;
    if (stage) {
      stage.dataset.phase = 'charging';
      stage.dataset.bestRarity = bestRarity;
    }
    refreshHeaderAndControls(Gacha.getState(), Gacha.getCollectionStats());

    GachaCinematic.playPull({
      results,
      replay,
      buildCard: buildResultCard,
      buildArt: createItemArtEl,
      makeEquipBtn,
      onRevealDone: () => {
        isRevealing = false;
        renderStageResults(lastResults, false);
        if (stage) {
          stage.dataset.phase = 'done';
          stage.dataset.bestRarity = bestRarity;
        }
        if (hasGacha()) refreshHeaderAndControls(Gacha.getState(), Gacha.getCollectionStats());
      },
      onPullAgain: (nextCount) => runPull(nextCount),
      onClose: () => {
        isRevealing = false;
        refreshGachaModal();
      },
    });
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
    launchPullSequence(pulled.results, false);
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
      card.className = `gacha-ex-card rarity-${item.rarity}`
        + (owned ? ' is-owned' : ' is-locked')
        + (equipped ? ' is-equipped' : '')
        + (justCraftedId === item.id ? ' is-just-crafted' : '');

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
            justCraftedId = item.id;
            const cx = rect ? rect.left + rect.width * 0.5 : innerWidth * 0.5;
            const cy = rect ? rect.top + rect.height * 0.5 : innerHeight * 0.5;
            if (item.rarity === 'ssr' && !isAnimOff() && hasCinematic()) {
              refreshGachaModal();
              GachaCinematic.playCraftSpotlight(item, {
                makeEquipBtn,
                buildArt: createItemArtEl,
                onClose: () => refreshGachaModal(),
              });
            } else {
              (item.rarity === 'ssr' ? Sound.sfx?.newRecord : item.rarity === 'sr' ? () => Sound.sfx?.comboMilestone?.(3) : Sound.sfx?.aceIgnition)?.();
              FX?.supernova?.(cx, cy, item.rarity);
              toast(`Crafted ${item.name}! ✨`);
              refreshGachaModal();
            }
          } else {
            Sound.sfx?.invalid?.();
            toast('Not enough shards! ✧');
          }
        };
      }

      card.append(top, art, meta, actionBtn);
      grid.appendChild(card);
    });
    justCraftedId = null;
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
        if (isRevealing || GachaCinematic?.isOpen?.()) skipReveal(true);
        refreshGachaModal();
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

    const btnReplay = $('#btnGachaReplay');
    if (btnReplay) {
      btnReplay.onclick = () => {
        if (isRevealing || !lastResults?.length) return;
        Sound.ensure?.();
        Sound.sfx?.click?.();
        launchPullSequence(lastResults, true);
      };
    }
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

  let poolPortraitsQueued = false;
  function warmPoolPortraits() {
    if (poolPortraitsQueued || typeof Cast === 'undefined' || typeof CastSprites === 'undefined' || !hasGacha()) return;
    poolPortraitsQueued = true;
    const urls = [];
    Gacha.POOL.forEach((it) => {
      if (it.type !== 'skin' || !it.girl) return;
      const c = Cast.get?.(it.girl)?.getSkin?.(it.key)?.sprites?.corner;
      if (c) urls.push(c.normal, c.wink);
    });
    if (urls.length) CastSprites.queuePreload?.(urls.filter(Boolean));
  }

  function openGachaModal(initialTab) {
    if (initialTab === 'banner' || initialTab === 'exchange') activeTab = initialTab;
    else if (!activeTab) activeTab = 'banner';
    warmPoolPortraits();
    refreshGachaModal();
    showOverlay('gachaModal');
  }

  window.onGachaModalClosed = () => {
    if (isRevealing || GachaCinematic?.isOpen?.()) skipReveal(true);
    prevWalletPulls = null;
    prevWalletShards = null;
  };
  window.openGachaModal = openGachaModal;
  window.refreshGachaModal = refreshGachaModal;
  window.syncGachaBadges = syncGachaBadges;

  ensureSubscribed();
  syncGachaBadges();
})();
