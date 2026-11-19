/* Slopitaire — Prism Gacha SSR spotlight showcase (#gtSpotlight), sprite preloading & 3D holo-tilt. */
'use strict';

const GachaSpotlight = (() => {
  const PARTNER_PALETTES = {
    sakura: ['#ff6b9d', '#ffe169'],
    yuki: ['#5ca8ff', '#c2e0ff'],
    rin: ['#ff7b3a', '#ffd15c'],
    mio: ['#6ef7c8', '#fff1b8'],
    ayame: ['#ff3366', '#fda4af'],
    kira: ['#2ce8a2', '#ffe169'],
    kaede: ['#ffbe55', '#ffe096'],
    tanner: ['#60a5fa', '#f59e0b'],
    joel: ['#f472b6', '#fbbf24'],
  };

  let spotResolver = null;
  let spotAutoTimer = null;
  let unveilTimer = null;
  const tiltBound = new WeakSet();

  const isFast = () => typeof settings !== 'undefined' && settings.anim === 'fast';

  function preloadAssets(results) {
    if (typeof Cast === 'undefined' || typeof CastSprites === 'undefined' || !Array.isArray(results)) return;
    const urls = [];
    results.forEach((r) => {
      const item = r?.item || r;
      if (!item || item.type !== 'skin' || !item.girl) return;
      const sp = Cast.get?.(item.girl)?.getSkin?.(item.key)?.sprites;
      if (!sp) return;
      if (sp.full) urls.push(sp.full.special, sp.full.cheer, sp.full.hype, sp.full.normal);
      if (sp.corner) urls.push(sp.corner.normal, sp.corner.wink, sp.corner.cheer);
    });
    if (urls.length) CastSprites.preloadUrls?.(urls.filter(Boolean));
  }

  function bindHoloTilt(container) {
    if (!container || tiltBound.has(container)) return;
    tiltBound.add(container);
    let activeCard = null;

    const resetCard = (el) => {
      if (!el) return;
      el.classList.remove('is-tilting');
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
      el.style.removeProperty('--gx');
      el.style.removeProperty('--gy');
    };

    container.addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      if ((typeof perfLite === 'function' && perfLite()) || (typeof settings !== 'undefined' && settings.anim === 'off')) return;
      const card = e.target?.closest?.('.gacha-card.is-revealed, .gacha-feat-card');
      if (card !== activeCard) {
        resetCard(activeCard);
        activeCard = card && container.contains(card) ? card : null;
      }
      if (!activeCard) return;
      const rect = activeCard.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = Math.max(-0.5, Math.min(0.5, (e.clientX - rect.left) / rect.width - 0.5));
      const ny = Math.max(-0.5, Math.min(0.5, (e.clientY - rect.top) / rect.height - 0.5));
      activeCard.classList.add('is-tilting');
      activeCard.style.setProperty('--rx', `${(-ny * 13).toFixed(2)}deg`);
      activeCard.style.setProperty('--ry', `${(nx * 15).toFixed(2)}deg`);
      activeCard.style.setProperty('--gx', `${(nx * 100 + 50).toFixed(1)}%`);
      activeCard.style.setProperty('--gy', `${(ny * 100 + 50).toFixed(1)}%`);
    });

    const clearActive = () => { resetCard(activeCard); activeCard = null; };
    container.addEventListener('pointerleave', clearActive);
    container.addEventListener('pointercancel', clearActive);
  }

  function buildSummaryBadges(results) {
    const counts = { ssr: 0, sr: 0, r: 0, newCount: 0, shards: 0 };
    results.forEach((r) => {
      counts[r.rarity] = (counts[r.rarity] || 0) + 1;
      if (r.isNew) counts.newCount++;
      counts.shards += Number(r.shardsGained) || 0;
    });
    const parts = [];
    if (counts.ssr) parts.push(`<span class="gs-pill is-ssr">★ ${counts.ssr}× SSR</span>`);
    if (counts.sr) parts.push(`<span class="gs-pill is-sr">✦ ${counts.sr}× SR</span>`);
    if (counts.r) parts.push(`<span class="gs-pill is-r">◆ ${counts.r}× R</span>`);
    if (counts.newCount) parts.push(`<span class="gs-pill is-new">★ ${counts.newCount} NEW</span>`);
    if (counts.shards) parts.push(`<span class="gs-pill is-shards">+${counts.shards} ✧</span>`);
    return { counts, html: parts.join('') };
  }

  function speakCompanionLine(c, line) {
    if (!c || !line || typeof settings === 'undefined' || settings.muted || !settings.voice) return;
    if (c.kind === 'cat') { Sound.sfx?.nya?.(); return; }
    if (typeof Voice === 'undefined' || !Voice.speak || !c.voice) return;
    const vName = typeof voiceNameFor === 'function' ? voiceNameFor(c.key) : '';
    Voice.speak(line, c.voice, {
      char: c.key, lang: settings.voiceLang, name: vName, slot: c.voice.slot || 0,
      volume: settings.voiceVol, pri: 4,
      onstart: () => Sound.duck?.(true),
      onend: () => Sound.duck?.(false),
    });
  }

  function renderVisual(item, buildArt) {
    const visual = $('#gtSpotVisual');
    if (!visual) return { charObj: null, line: null };
    visual.innerHTML = '';
    if (item.type === 'skin' && typeof Cast !== 'undefined') {
      const charObj = Cast.get?.(item.girl);
      visual.dataset.partner = item.girl || '';
      const full = charObj?.getSkin?.(item.key)?.sprites?.full || {};
      const src = full.special || full.cheer || full.hype || full.normal || '';
      visual.innerHTML =
        `<div class="gt-spot-pedestal" aria-hidden="true"></div>` +
        `<div class="gt-spot-burst-ring" aria-hidden="true"></div>` +
        `<div class="gt-spot-figure">` +
          `<div class="chara girl-sprite is-full is-single" aria-hidden="true">` +
            `<img class="chara-img is-active gt-chara-color" src="${esc(src)}" alt="" draggable="false" decoding="async">` +
            `<img class="chara-img is-active gt-chara-sil" src="${esc(src)}" alt="" draggable="false" decoding="async">` +
          `</div>` +
        `</div>`;
      return { charObj, line: charObj?.line?.('win') || charObj?.line?.('hello') || null };
    }
    delete visual.dataset.partner;
    if (buildArt) {
      const wrap = document.createElement('div');
      wrap.className = 'gt-spot-card-showcase';
      wrap.appendChild(buildArt(item));
      visual.appendChild(wrap);
    }
    return { charObj: null, line: null };
  }

  function renderMeta(entry, charObj, line, opts) {
    const { item, rarity = item.rarity || 'ssr', isNew = true, shardsGained = 0, crafted = false } = entry;
    const kicker = $('#gtSpotKicker');
    if (kicker) {
      kicker.textContent = crafted
        ? '💎 PRISM FORGE // SSR OUTFIT CRAFTED!'
        : isNew ? '★ ULTRA RARE // SSR OUTFIT UNLOCKED!' : '★ SSR PRISM RESONANCE // SHARD CONVERSION';
    }
    const starsEl = $('#gtSpotStars');
    if (starsEl) {
      const starN = rarity === 'ssr' ? 5 : rarity === 'sr' ? 4 : 3;
      starsEl.innerHTML = Array.from({ length: starN }, (_, i) => `<span class="gt-star" style="--si:${i}">★</span>`).join('');
    }
    const skin = charObj?.getSkin?.(item.key);
    if ($('#gtSpotName')) $('#gtSpotName').textContent = charObj ? charObj.name : (item.shortName || item.name);
    if ($('#gtSpotSub')) {
      $('#gtSpotSub').textContent = skin ? `${skin.name} · ${skin.subtitle || 'Companion Outfit'}` : (item.subtitle || '');
    }
    if ($('#gtSpotBadges')) {
      $('#gtSpotBadges').innerHTML = crafted
        ? `<span class="gs-pill is-ssr">💎 FORGED</span><span class="gs-pill is-new">★ COLLECTION UNLOCKED</span>`
        : isNew
          ? `<span class="gs-pill is-new">★ NEW UNLOCK!</span><span class="gs-pill is-ssr">SSR OUTFIT</span>`
          : `<span class="gs-pill is-shards">DUPLICATE → +${shardsGained} ✧ SHARDS</span>`;
    }
    const quoteEl = $('#gtSpotQuote');
    if (quoteEl) {
      quoteEl.textContent = line?.show ? `“${line.show}”` : '';
      quoteEl.classList.toggle('hidden', !line?.show);
    }
    const actionsEl = $('#gtSpotActions');
    if (!actionsEl) return;
    actionsEl.innerHTML = '';
    if (opts.makeEquipBtn) {
      const eqBtn = opts.makeEquipBtn(item, () => {});
      eqBtn.classList.add('gt-spot-equip');
      eqBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (typeof sparkleAt === 'function') sparkleAt(eqBtn, 'ssr');
      });
      actionsEl.appendChild(eqBtn);
    }
    if (opts.standalone) {
      const contBtn = document.createElement('button');
      contBtn.type = 'button';
      contBtn.className = 'btn primary gt-spot-continue';
      contBtn.textContent = '✦ Continue';
      contBtn.onclick = (ev) => { ev.stopPropagation(); Sound.sfx?.click?.(); close(); };
      actionsEl.appendChild(contBtn);
    }
  }

  function close() {
    clearTimeout(spotAutoTimer);
    clearTimeout(unveilTimer);
    spotAutoTimer = null;
    unveilTimer = null;
    const spot = $('#gtSpotlight');
    if (spot) {
      spot.classList.add('hidden');
      spot.classList.remove('is-entering', 'is-revealed');
    }
    if ($('#gtSpotVisual')) $('#gtSpotVisual').innerHTML = '';
    const resolve = spotResolver;
    spotResolver = null;
    if (resolve) resolve();
  }

  function open(entry, opts = {}) {
    return new Promise((resolve) => {
      const spot = $('#gtSpotlight');
      if (!spot || !entry?.item) { resolve(); return; }
      if (spotResolver) close();
      spotResolver = resolve;

      const { item, rarity = item.rarity || 'ssr', crafted = false } = entry;
      const fast = isFast();
      const [colA, colB] = PARTNER_PALETTES[item.girl] || (rarity === 'ssr' ? ['#ffe169', '#ff5c8a'] : ['#c4b5ff', '#2ce8a2']);
      spot.dataset.rarity = rarity;
      spot.style.setProperty('--spot-a', colA);
      spot.style.setProperty('--spot-b', colB);

      const { charObj, line } = renderVisual(item, opts.buildArt);
      renderMeta(entry, charObj, line, opts);

      const autoMs = opts.standalone ? (fast ? 3000 : 4800) : (fast ? 2100 : 3700);
      const timerFill = $('#gtSpotTimerFill');
      if (timerFill) {
        timerFill.style.animation = 'none';
        void timerFill.offsetWidth;
        timerFill.style.animation = `gtSpotTimerShrink ${autoMs}ms linear forwards`;
      }

      spot.classList.remove('hidden', 'is-revealed');
      spot.classList.add('is-entering');
      Sound.sfx?.cutin?.();

      unveilTimer = setTimeout(() => {
        if (!spotResolver) return;
        spot.classList.add('is-revealed');
        (crafted ? Sound.sfx?.win : Sound.sfx?.newRecord)?.();
        if (charObj) Sound.sfx?.partnerSelect?.(charObj.key);
        const visRect = $('#gtSpotVisual')?.getBoundingClientRect?.();
        const bx = visRect && visRect.width > 0 ? visRect.left + visRect.width * 0.5 : innerWidth * 0.36;
        const by = visRect && visRect.height > 0 ? visRect.top + visRect.height * 0.48 : innerHeight * 0.48;
        FX?.supernova?.(bx, by, rarity);
        FX?.fountain?.('ssr');
        FX?.celebrate?.();
        StageBG?.pulse?.('#ffe169', 1.45);
        if (line) speakCompanionLine(charObj, line);
      }, fast ? 180 : 310);

      spotAutoTimer = setTimeout(close, autoMs);
    });
  }

  return {
    open,
    close,
    isActive: () => !!spotResolver,
    preloadAssets,
    bindHoloTilt,
    buildSummaryBadges,
  };
})();
window.GachaSpotlight = GachaSpotlight;
