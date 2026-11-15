/* Slopitaire — Companion Skins wardrobe modal (#skinsModal). */
'use strict';

(() => {
  const PREVIEW_MOODS = ['normal', 'happy', 'wink', 'smug', 'hype', 'shock', 'cheer', 'special'];
  const MOOD_LABELS = {
    normal: 'Normal',
    happy: 'Happy',
    wink: 'Wink',
    smug: 'Smug',
    hype: 'Hype',
    shock: 'Shock',
    cheer: 'Cheer',
    special: 'Special',
  };

  let selectedGirl = 'sakura';
  let previewMood = 'happy';
  let previewQuoteGirl = '';
  let showcaseBound = false;

  function resolveGirlKey(candidate) {
    const girls = (typeof Cast !== 'undefined' && Array.isArray(Cast.girlKeys)) ? Cast.girlKeys : [];
    if (!girls.length) return 'sakura';
    if (candidate && girls.includes(candidate)) return candidate;
    if (typeof settings !== 'undefined' && girls.includes(settings.companion)) return settings.companion;
    return girls.includes('sakura') ? 'sakura' : girls[0];
  }

  function defaultMoodFor(girlKey) {
    const c = Cast.get(girlKey);
    const m = c?.moods?.hello || 'happy';
    return PREVIEW_MOODS.includes(m) ? m : 'happy';
  }

  function syncMoodUi() {
    const stage = $('#skinsStage');
    const mascotWrap = stage?.querySelector('.skins-mascot');
    if (stage) stage.dataset.mood = previewMood;
    if (mascotWrap) mascotWrap.dataset.mood = previewMood;
    document.querySelectorAll('#skinsMoodBar .skins-mood-btn').forEach((btn) => {
      const on = btn.dataset.mood === previewMood;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function triggerShowcaseBoing() {
    const mascotEl = $('#skinsMascot');
    if (!mascotEl) return;
    mascotEl.classList.remove('boing', 'react-headpat', 'react-boop', 'react-highfive', 'react-fluster', 'react-startle');
    void mascotEl.offsetWidth;
    mascotEl.classList.add('boing');
  }

  function interactWithPreview(e) {
    const mascotEl = $('#skinsMascot');
    if (!mascotEl) return;
    const activeSkinKey = skinFor(selectedGirl);
    const quoteEl = $('#skinsPreviewQuote');
    if (typeof handleCompanionTouch === 'function') {
      handleCompanionTouch(e, mascotEl, 'full', quoteEl, {
        charKey: selectedGirl,
        skinKey: activeSkinKey,
        onMood: (m) => {
          previewMood = m || previewMood;
          syncMoodUi();
        },
      });
    } else {
      const idx = PREVIEW_MOODS.indexOf(previewMood);
      previewMood = PREVIEW_MOODS[(idx + 1) % PREVIEW_MOODS.length];
      syncMoodUi();
      triggerShowcaseBoing();
    }
  }

  function bindSkinsShowcase() {
    if (showcaseBound) return;
    showcaseBound = true;

    const btnAllCasual = $('#btnSkinsAllCasual');
    if (btnAllCasual) {
      btnAllCasual.onclick = () => {
        Sound.ensure();
        setAllGirlSkins('casual');
      };
    }

    const btnAllDefault = $('#btnSkinsAllDefault');
    if (btnAllDefault) {
      btnAllDefault.onclick = () => {
        Sound.ensure();
        setAllGirlSkins('default');
      };
    }

    const mascotEl = $('#skinsMascot');
    if (mascotEl) {
      mascotEl.onclick = (e) => interactWithPreview(e);
      mascotEl.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          interactWithPreview(e);
        }
      };
    }

    const mascotWrap = $('#skinsStage .skins-mascot');
    if (mascotWrap) {
      mascotWrap.addEventListener('click', (e) => {
        if (e.target === mascotWrap) interactWithPreview(e);
      });
    }

    const makePartnerBtn = $('#btnSkinsMakePartner');
    if (makePartnerBtn) {
      makePartnerBtn.onclick = () => {
        if (settings.companion === selectedGirl) return;
        Sound.ensure();
        if (!settings.mascot) setSetting('mascot', true, true);
        setSetting('companion', selectedGirl, true);
        (Sound.sfx.partnerSelect || Sound.sfx.click)?.(selectedGirl);
        document.querySelectorAll('.cast-pick .cast-opt').forEach((x) => {
          x.classList.toggle('on', x.dataset.partner === selectedGirl);
        });
        const picked = Cast.get(selectedGirl);
        const rawTone = typeof partnerTone === 'function' ? partnerTone(selectedGirl) : 'amber';
        PopupFX?.pill('♡', `PARTNER // ${picked.name.toUpperCase()}`, picked.title.toUpperCase(), rawTone, { always: true });
        PopupFX?.stamp('HELLO!', picked.moods?.hello || 'happy', rawTone === 'danger' ? 'amber' : rawTone, true);
        Companion.react('hello');
        refreshSkinsModal();
      };
    }
  }

  function renderMoodBar() {
    const bar = $('#skinsMoodBar');
    if (!bar) return;
    if (!bar.children.length) {
      PREVIEW_MOODS.forEach((m) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'skins-mood-btn';
        b.dataset.mood = m;
        b.textContent = MOOD_LABELS[m] || m;
        b.onclick = () => {
          Sound.ensure();
          Sound.sfx.click?.();
          previewMood = m;
          syncMoodUi();
          triggerShowcaseBoing();
        };
        bar.appendChild(b);
      });
    }
    syncMoodUi();
  }

  function refreshSkinsModal() {
    if (typeof Cast === 'undefined' || !Array.isArray(Cast.girlKeys) || !Cast.girlKeys.length) return;
    bindSkinsShowcase();

    const girls = Cast.girlKeys;
    selectedGirl = resolveGirlKey(selectedGirl);
    const c = Cast.get(selectedGirl);
    const activeSkinKey = skinFor(selectedGirl);
    const skinKeys = (Array.isArray(c.skinKeys) && c.skinKeys.length) ? c.skinKeys : ['default'];
    const activeSkin = (c.getSkin ? c.getSkin(activeSkinKey) : null) || {
      key: 'default',
      name: 'Default',
      subtitle: c.title || '',
    };

    if (typeof c.preload === 'function') {
      skinKeys.forEach((sk) => c.preload('full', sk));
    }

    // 1. Heroine roster tabs
    const roster = $('#skinsRoster');
    if (roster) {
      roster.innerHTML = '';
      girls.forEach((gk) => {
        const gc = Cast.get(gk);
        const gSkinKey = skinFor(gk);
        const gSkinObj = gc.getSkin ? gc.getSkin(gSkinKey) : null;
        const badgeLabel = (gSkinObj?.name || gSkinKey || 'default').toUpperCase();
        const isSelected = gk === selectedGirl;
        const isCustom = gSkinKey !== 'default';

        const tab = document.createElement('button');
        tab.type = 'button';
        tab.role = 'tab';
        tab.className = 'skin-tab' + (isSelected ? ' on' : '') + (isCustom ? ' is-custom' : '');
        tab.dataset.girl = gk;
        tab.setAttribute('aria-selected', String(isSelected));
        tab.setAttribute('aria-label', `${gc.name}: ${badgeLabel}`);
        tab.innerHTML =
          `<span class="st-face">${gc.faceHTML(null, gSkinKey)}</span>` +
          `<span class="st-meta">` +
            `<b class="st-name">${esc(gc.name)}</b>` +
            `<span class="st-badge${isCustom ? ' is-custom' : ''}">${esc(badgeLabel)}</span>` +
          `</span>`;
        tab.onclick = () => {
          Sound.ensure();
          Sound.sfx.click?.();
          if (selectedGirl !== gk) {
            selectedGirl = gk;
            previewMood = defaultMoodFor(gk);
            previewQuoteGirl = '';
          }
          refreshSkinsModal();
        };
        roster.appendChild(tab);
      });
    }

    // 2. Bulk toggle button states
    const casualAvailable = girls.filter((gk) => !!Cast.get(gk)?.skins?.casual).length;
    const allCasual = casualAvailable > 0 && girls.every((gk) => !Cast.get(gk)?.skins?.casual || skinFor(gk) === 'casual');
    const allDefault = girls.every((gk) => skinFor(gk) === 'default');
    const btnAllCasual = $('#btnSkinsAllCasual');
    const btnAllDefault = $('#btnSkinsAllDefault');
    if (btnAllCasual) {
      btnAllCasual.disabled = casualAvailable === 0;
      btnAllCasual.classList.toggle('on', allCasual);
    }
    if (btnAllDefault) {
      btnAllDefault.classList.toggle('on', allDefault);
    }

    // 3. Live interactive showcase
    const stage = $('#skinsStage');
    const mascotWrap = stage?.querySelector('.skins-mascot');
    const mascotEl = $('#skinsMascot');
    const kickerEl = $('#skinsStageKicker');
    const quoteEl = $('#skinsPreviewQuote');

    if (stage) {
      stage.dataset.partner = selectedGirl;
      stage.dataset.mood = previewMood;
    }
    if (mascotWrap) {
      mascotWrap.dataset.partner = selectedGirl;
      mascotWrap.dataset.mood = previewMood;
      mascotWrap.classList.toggle('is-girl', c.kind === 'girl');
    }
    if (kickerEl) {
      kickerEl.textContent = `${c.name.toUpperCase()} // ${(activeSkin.name || activeSkinKey).toUpperCase()}`;
    }
    if (mascotEl) {
      const needsRender = !mascotEl.querySelector('.girl-sprite')
        || mascotEl.dataset.partner !== selectedGirl
        || mascotEl.dataset.skin !== activeSkinKey;
      if (needsRender) {
        mascotEl.dataset.partner = selectedGirl;
        mascotEl.dataset.skin = activeSkinKey;
        mascotEl.innerHTML = c.html('full', null, activeSkinKey);
        triggerShowcaseBoing();
      }
    }
    if (quoteEl && previewQuoteGirl !== selectedGirl) {
      previewQuoteGirl = selectedGirl;
      quoteEl.textContent = `${c.title} — tap ${c.name} to interact ♡`;
    }
    renderMoodBar();

    // 4. Wardrobe meta & skin cards
    const metaEl = $('#skinsGirlMeta');
    if (metaEl) {
      const outfitWord = skinKeys.length === 1 ? '1 outfit' : `${skinKeys.length} outfits`;
      metaEl.innerHTML =
        `<div class="sgm-title"><b>${esc(c.name)}</b><span>${esc(c.title)}</span></div>` +
        `<span class="sgm-count">${esc(outfitWord)}</span>`;
    }

    const optsEl = $('#skinsOptions');
    if (optsEl) {
      optsEl.innerHTML = '';
      skinKeys.forEach((sk) => {
        const s = c.skins?.[sk] || { key: sk, name: sk, subtitle: c.title };
        const isEquipped = sk === activeSkinKey;
        const card = document.createElement('button');
        card.type = 'button';
        card.role = 'radio';
        card.className = 'skin-card' + (isEquipped ? ' on' : '');
        card.dataset.skin = sk;
        card.setAttribute('aria-checked', String(isEquipped));
        card.innerHTML =
          `<span class="sc-face">${c.faceHTML(null, sk)}</span>` +
          `<span class="sc-info">` +
            `<span class="sc-top">` +
              `<b class="sc-name">${esc(s.name || sk)}</b>` +
              (isEquipped ? `<span class="sc-badge">EQUIPPED</span>` : '') +
            `</span>` +
            `<small class="sc-sub">${esc(s.subtitle || c.title || '')}</small>` +
          `</span>`;
        card.onclick = () => {
          Sound.ensure();
          if (skinFor(selectedGirl) === sk) {
            Sound.sfx.click?.();
            triggerShowcaseBoing();
            return;
          }
          setGirlSkin(selectedGirl, sk);
        };
        optsEl.appendChild(card);
      });
      if (skinKeys.length < 2) {
        const note = document.createElement('div');
        note.className = 'skins-empty-note';
        note.textContent = 'Additional outfits unlock as wardrobe assets load ✨';
        optsEl.appendChild(note);
      }
    }

    // 5. Footer partner button
    const makePartnerBtn = $('#btnSkinsMakePartner');
    if (makePartnerBtn) {
      const isActive = settings.companion === selectedGirl;
      makePartnerBtn.textContent = isActive ? '✓ Active partner' : '♡ Make active partner';
      makePartnerBtn.disabled = isActive;
      makePartnerBtn.classList.toggle('is-active', isActive);
    }
  }

  function openSkinsModal(initialGirl) {
    selectedGirl = resolveGirlKey(initialGirl);
    previewMood = defaultMoodFor(selectedGirl);
    previewQuoteGirl = '';
    refreshSkinsModal();
    showOverlay('skinsModal');
  }

  window.openSkinsModal = openSkinsModal;
  window.refreshSkinsModal = refreshSkinsModal;
})();
