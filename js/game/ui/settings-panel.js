/* Slopitaire — the settings panel. */
'use strict';

const THEMES = [['prism', '◈ Prism Core'], ['night', '🌌 Astral Violet'], ['sakura', '🌸 Neo Blossom'], ['ramune', '⚡ Cobalt Surge'], ['matcha', '🌿 Jade Circuit']];
const MUSIC_OPTS = [['pulse', '◈ Prism Pulse (165)'], ['redline', '🔥 Redline Rush (178)'], ['horizon', '⚡ Horizon Drive (152)'], ['zenith', '✦ Zenith Core (190)'], ['bounce', '🐾 Neko Bounce (118)'], ['lofi', '🌸 Pastel Lo-fi (76)'], ['lullaby', '🌙 Starlight (64)'], ['spotify', '🎧 Spotify'], ['off', 'Off']];
const SCHEMA = [
  { title: 'Gameplay', items: [
    { key: 'variant', label: 'Game', type: 'seg', options: VARIANT_KEYS.map((k) => [k, `${VARIANTS[k].icon} ${VARIANTS[k].label}`]), hint: () => VARIANTS[settings.variant].tagline, nextGame: true },
    { key: 'difficulty', label: 'Difficulty', type: 'seg', options: Object.keys(DIFF).map((k) => [k, `${DIFF[k].icon} ${DIFF[k].label}`]), hint: () => diffDesc(settings.variant, settings.difficulty), nextGame: true },
    { key: 'draw', label: 'Draw mode', type: 'seg', options: [[1, '1 card'], [3, '3 cards']], hint: 'Draw one card at a time, or three (harder!).', nextGame: true, when: () => settings.variant === 'klondike' },
    { key: 'spiderSuits', label: 'Spider suits', type: 'seg', options: [[1, '1 suit'], [2, '2 suits'], [4, '4 suits']], hint: () => SUIT_HINT[settings.spiderSuits], nextGame: true, when: () => settings.variant === 'spider' },
    { key: 'tapMove', label: 'Tap to auto-move', type: 'toggle', hint: 'Click a card to send it to the best spot.' },
    { key: 'autoFound', label: 'Auto-play to foundations', type: 'toggle', hint: 'Safely sends cards home for you (Klondike & FreeCell).', when: () => settings.variant === 'klondike' || settings.variant === 'freecell' },
    { key: 'autoFinish', label: 'Auto-finish', type: 'toggle', hint: 'Finish automatically once the rest plays itself.', when: () => settings.variant === 'klondike' || settings.variant === 'freecell' },
    { key: 'dropGuides', label: 'Highlight valid drops', type: 'toggle', hint: 'Glow where a dragged card can land.' },
    { key: 'leftHanded', label: 'Left-handed layout', type: 'toggle', hint: 'Mirror the top row (stock on the right side).', when: () => settings.variant !== 'tripeaks' },
    { key: 'detectLoss', label: 'End game when', type: 'seg', options: [['solver', 'Unwinnable'], ['stuck', 'No moves left'], ['off', 'Never']], hint: () => LOSS_HINT[settings.detectLoss] },
  ] },
  { title: 'Look & feel', items: [
    { key: 'theme', label: 'Theme', type: 'seg', options: THEMES },
    { key: 'bgFx', label: 'Prism stage effects', type: 'toggle', hint: 'Ambient circuit-board backdrop with slowly drifting lights.' },
    { key: 'popups', label: 'Pop-up FX', type: 'seg', options: [['max', 'Hyper'], ['normal', 'Standard'], ['off', 'Minimal']], hint: 'Floating score tags, live medal feed, banners & companion stamps.' },
    { key: 'front', label: 'Card front', type: 'fronts', hint: 'Face art, Aces & court cards (Classic, Cyber, every companion & Mochi).' },
    { key: 'back', label: 'Card back', type: 'backs', hint: 'Sleeve pattern & emblem on the back of every card (mix & match freely).' },
    { key: 'anim', label: 'Animations', type: 'seg', options: [['normal', 'Normal'], ['fast', 'Fast'], ['off', 'Off']] },
    { key: 'perf', label: 'Graphics quality', type: 'seg', options: [['auto', 'Auto'], ['high', 'High'], ['lite', 'Battery saver']],
      hint: () => `Battery saver drops blur & glow effects and lightens the music synth for smoother play on phones.${settings.perf === 'auto' ? (LOW_POWER_DEVICE ? ' Auto: using Battery saver on this device.' : ' Auto: using High on this device.') : ''}` },
    { key: 'petals', label: 'Falling petals', type: 'toggle' },
    { key: 'showStats', label: 'Show time, moves & score', type: 'toggle' },
  ] },
  { title: 'Companion & voice', items: [
    { key: 'companion', label: 'Partner', type: 'cast' },
    { key: 'skins', label: 'Outfit', type: 'skin', hint: () => outfitHint() },
    { key: 'spriteMode', label: 'Sprite style', type: 'seg', options: [['corner', 'Corner bust'], ['full', 'Full body']], hint: 'Waist-up in the corner, or full-body standing sprite.' },
    { key: 'mascot', label: 'Show companion', type: 'toggle' },
    { key: 'chatter', label: 'Reactions', type: 'seg', options: [['all', 'Every action'], ['some', 'Some'], ['quiet', 'Big moments']], hint: 'How often your partner talks.' },
    { key: 'voice', label: 'Voice lines', type: 'toggle', hint: () => voiceHint() },
    { key: 'voiceLang', label: 'Voice language', type: 'seg', options: [['ja', '日本語'], ['en', 'English']], hint: 'Bubbles stay readable either way.' },
    { key: 'voiceVol', label: 'Voice volume', type: 'range' },
    { key: 'cutins', label: 'Anime cut-ins', type: 'toggle', hint: 'Dramatic splash for combo surges, full suits and victory.' },
  ] },
  { title: 'Audio', items: [
    { key: 'muted', label: 'Mute everything', type: 'toggle' },
    { key: 'music', label: 'Music', type: 'seg', options: MUSIC_OPTS },
    { key: 'musicVol', label: 'Music volume', type: 'range' },
    { key: 'sfxVol', label: 'Sound effects volume', type: 'range' },
    { key: 'spotifyAutoMuteBgm', label: 'Auto-pause BGM for Spotify', type: 'toggle', hint: 'Pause built-in music while Spotify plays (keeps card SFX & voices).' },
  ] },
];

function makeSeg(options, get, set) {
  const seg = document.createElement('div'); seg.className = 'seg';
  const refresh = () => [...seg.children].forEach((b, i) => b.classList.toggle('on', options[i][0] === get()));
  options.forEach(([v, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.onclick = () => { set(v); refresh(); };
    seg.appendChild(b);
  });
  refresh();
  return seg;
}

function buildSettings() {
  const body = $('#settingsBody'); body.innerHTML = '';
  window.Account?.renderSettingsSection?.(body);
  for (const sec of SCHEMA) {
    const h = document.createElement('h3'); h.textContent = sec.title; body.appendChild(h);
    for (const it of sec.items) {
      if (it.when && !it.when()) continue;
      const row = document.createElement('div'); row.className = 'row';
      row.dataset.setting = it.key;
      const hint = typeof it.hint === 'function' ? it.hint() : it.hint;
      row.innerHTML = `<div class="row-l"><div class="row-t">${it.label}</div>${hint ? `<div class="row-h">${hint}</div>` : ''}</div>`;
      const ctl = document.createElement('div'); ctl.className = 'row-c';
      if (it.type === 'seg') {
        const segEl = makeSeg(it.options, () => settings[it.key], (v) => {
          setSetting(it.key, v);
          if (typeof it.hint === 'function') row.querySelector('.row-h').textContent = it.hint();
        });
        segEl.dataset.setting = it.key;
        ctl.appendChild(segEl);
      } else if (it.type === 'toggle') {
        ctl.innerHTML = `<label class="tgl"><input type="checkbox" ${settings[it.key] ? 'checked' : ''}><span></span></label>`;
        ctl.querySelector('input').onchange = (e) => {
          const on = e.target.checked;
          if (it.key === 'muted' && on) (Sound.sfx.toggleOff || Sound.sfx.click)?.();
          setSetting(it.key, on, true);
          if (!(it.key === 'muted' && on)) ((on ? Sound.sfx.toggleOn : Sound.sfx.toggleOff) || Sound.sfx.click)?.();
        };
      } else if (it.type === 'range') {
        ctl.innerHTML = `<input type="range" min="0" max="1" step="0.05" value="${settings[it.key]}" aria-label="${it.label}">`;
        const inp = ctl.querySelector('input');
        inp.oninput = () => setSetting(it.key, +inp.value, true);
        inp.onchange = () => Sound.sfx.click();
      } else if (it.type === 'voices') {
        const sel = document.createElement('select');
        sel.className = 'voice-select'; sel.setAttribute('aria-label', 'Voice');
        const fill = () => {
          const names = Voice.voicesFor(settings.voiceLang);
          const fallback = names.length ? [] : Voice.voicesFor('en'); // no Japanese voice → English is used
          sel.innerHTML = `<option value="">Auto (best available)</option>` +
            names.concat(fallback).map((n) => `<option ${n === voiceNameFor() ? 'selected' : ''}>${n.replace(/</g, '')}</option>`).join('');
        };
        fill(); Voice.onVoices(fill);
        sel.onchange = () => { setSetting('voiceNames', Object.assign({}, settings.voiceNames, { [settings.companion]: sel.value })); Companion.react('hello'); };
        sel.dataset.voiceSelect = '1'; sel._fill = fill;
        ctl.appendChild(sel);
      } else if (it.type === 'cast') {
        row.style.flexWrap = 'wrap';
        const pk = makeCastPicker(); pk.classList.add('settings-cast');
        row.appendChild(pk); body.appendChild(row);
        continue;
      } else if (it.type === 'skin') {
        row.appendChild(ctl);
        renderSettingsOutfitRow(row);
        body.appendChild(row);
        continue;
      } else if (it.type === 'fronts') {
        ctl.appendChild(buildDeckGrid('front'));
      } else if (it.type === 'backs') {
        ctl.appendChild(buildDeckGrid('back'));
      }
      row.appendChild(ctl); body.appendChild(row);
    }
    if (sec.title === 'Audio') window.SpotifyUI?.renderSettingsRow?.(body);
  }
  // stats
  const h = document.createElement('h3'); h.textContent = 'Stats ♡'; body.appendChild(h);
  const st = getStats();
  // the selected game, plus every other game that has been played
  const shown = VARIANT_KEYS.filter((v) => v === settings.variant || Object.keys(DIFF).some((d) => st[statKey(v, d)].played > 0));
  const rows = shown.map((v) => `<tr class="stats-group"><td colspan="7">${VARIANTS[v].icon} ${VARIANTS[v].label}</td></tr>` + Object.keys(DIFF).map((k) => {
    const s = st[statKey(v, k)];
    return `<tr><td>${DIFF[k].icon} ${DIFF[k].label}</td><td>${s.played}</td><td>${s.won}</td><td>${s.played ? Math.round(s.won / s.played * 100) : 0}%</td><td>${fmtTime(s.bestTime)}</td><td>${s.bestScore || '—'}</td><td>${s.bestStreak}</td></tr>`;
  }).join('')).join('');
  const wrap = document.createElement('div');
  wrap.innerHTML = `<table class="stats-table"><tr><th></th><th>Played</th><th>Won</th><th>Win%</th><th>Best time</th><th>Best score</th><th>Streak</th></tr>${rows}</table>
      <div style="text-align:right;margin-top:8px"><button class="btn" type="button" id="btnResetStats">Reset stats</button></div>`;
  body.appendChild(wrap);
  $('#btnResetStats').onclick = async () => {
    hideOverlay('settingsModal');
    const ok = await ask('Reset all stats? This cannot be undone.', [{ label: 'Reset', value: true, primary: true }, { label: 'Cancel', value: false }]);
    if (ok) { Store.set('stats', {}, { immediate: true, resetStats: true }); toast('Stats reset ✿'); }
    openSettings();
  };
  updateSettingsNote();
}

const SUIT_HINT = {
  1: 'All spades: the classic warm-up.',
  2: 'Spades & hearts: runs must still be one suit to lift.',
  4: 'All four suits: the real thing (deals are not verified).',
};
const LOSS_HINT = {
  solver: 'A solver checks every line in the background and ends the game as soon as it can no longer be won.',
  stuck: 'Keep playing until no move can put a card home or turn one face-up (shuffling cards around does not count).',
  off: 'Never end the game automatically.',
};
function voiceHint() {
  if (Voice.hasClips(settings.companion) || Cast.get(settings.companion).kind === 'cat') return 'Every partner has their own recorded voice.';
  if (!Voice.supported) return 'Your browser has no speech voices — bubbles only.';
  if (settings.voiceLang === 'ja' && !Voice.available('ja')) return "Uses your browser's voices. No Japanese voice found, so English is used.";
  return "Uses your browser's built-in voices (Chrome & Edge sound best).";
}

function outfitHint() {
  const c = Cast.get(settings.companion);
  if (!c || c.kind !== 'girl') return `Cyber Lucky Neko — browse outfits for all ${Cast.girlKeys.length} companions.`;
  const activeKey = skinFor(c.key);
  const s = c.getSkin ? c.getSkin(activeKey) : null;
  return s ? `${c.name}: ${s.name}${s.subtitle ? ' — ' + s.subtitle : ''}` : `${c.name}: Default`;
}

function renderSettingsOutfitRow(row) {
  if (!row) return;
  const c = Cast.get(settings.companion);
  const isGirl = c && c.kind === 'girl';
  const hintEl = row.querySelector('.row-h');
  if (hintEl) hintEl.textContent = outfitHint();
  const ctl = row.querySelector('.row-c');
  if (!ctl) return;
  ctl.innerHTML = '';
  ctl.classList.add('skin-row-ctl');
  if (isGirl) {
    const keys = (c.skinKeys && c.skinKeys.length) ? c.skinKeys : ['default'];
    const opts = keys.map((sk) => {
      const locked = typeof Gacha !== 'undefined' && Gacha.isSkinUnlocked && !Gacha.isSkinUnlocked(c.key, sk);
      return [sk, `${locked ? '🔒 ' : ''}${c.skins?.[sk]?.name || sk}`];
    });
    const segEl = makeSeg(opts, () => skinFor(c.key), (sk) => {
      Sound.ensure();
      const locked = typeof Gacha !== 'undefined' && Gacha.isSkinUnlocked && !Gacha.isSkinUnlocked(c.key, sk);
      if (locked) {
        Sound.sfx.click?.();
        toast('Locked — pull or craft in Prism Gacha! 🎰');
        window.openGachaModal?.('banner');
        return;
      }
      setGirlSkin(c.key, sk);
    });
    [...segEl.children].forEach((b, idx) => {
      const sk = keys[idx];
      const locked = typeof Gacha !== 'undefined' && Gacha.isSkinUnlocked && !Gacha.isSkinUnlocked(c.key, sk);
      b.classList.toggle('is-locked', !!locked);
    });
    segEl.dataset.setting = 'skins';
    ctl.appendChild(segEl);
  } else {
    const note = document.createElement('span');
    note.className = 'skin-cat-note';
    note.textContent = 'Mochi stays classic cyber-neko';
    ctl.appendChild(note);
  }
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'btn settings-skins-btn';
  allBtn.id = 'btnSettingsSkins';
  allBtn.textContent = '🎀 All Outfits…';
  allBtn.onclick = () => {
    Sound.ensure();
    openSkinsModal(settings.companion);
  };
  const gachaBtn = document.createElement('button');
  gachaBtn.type = 'button';
  gachaBtn.className = 'btn settings-gacha-btn';
  gachaBtn.id = 'btnSettingsGacha';
  const pulls = (typeof Gacha !== 'undefined' && Gacha.getState) ? (Gacha.getState().pulls || 0) : 0;
  gachaBtn.classList.toggle('has-pulls', pulls > 0);
  gachaBtn.textContent = pulls > 0 ? `🎰 Gacha (${pulls}🎫)` : '🎰 Gacha';
  gachaBtn.onclick = () => {
    Sound.ensure();
    Sound.sfx.click?.();
    window.openGachaModal?.('banner');
  };
  ctl.append(allBtn, gachaBtn);
}

function refreshSettingsOutfit() {
  renderSettingsOutfitRow($('#settingsBody .row[data-setting="skins"]'));
}

function refreshSettingsDecks() {
  const frontRow = $('#settingsBody .row[data-setting="front"] .row-c');
  if (frontRow) {
    frontRow.innerHTML = '';
    frontRow.appendChild(buildDeckGrid('front'));
  }
  const backRow = $('#settingsBody .row[data-setting="back"] .row-c');
  if (backRow) {
    backRow.innerHTML = '';
    backRow.appendChild(buildDeckGrid('back'));
  }
}

window.refreshSettingsOutfit = refreshSettingsOutfit;
window.refreshSettingsDecks = refreshSettingsDecks;

function refreshSettingsCast() {
  const existing = $('#settingsBody .settings-cast');
  if (!existing) return;
  const fresh = makeCastPicker();
  fresh.classList.add('settings-cast');
  existing.replaceWith(fresh);
}

function makeCastPicker() {
  const wrap = document.createElement('div'); wrap.className = 'cast-pick';
  Cast.keys.forEach((k) => {
    const c = Cast.get(k), b = document.createElement('button');
    const sk = c.kind === 'girl' ? skinFor(k) : 'default';
    const hasCustom = c.kind === 'girl' && sk !== 'default';
    b.type = 'button'; b.className = 'cast-opt' + (settings.companion === k ? ' on' : '');
    b.dataset.partner = k;
    b.dataset.mood = 'happy';
    if (hasCustom) b.dataset.skin = sk;
    const skinLabel = hasCustom ? (c.skins?.[sk]?.name || sk).toUpperCase() : '';
    const tag = hasCustom ? `<span class="cast-skin-tag">${esc(skinLabel)}</span>` : '';
    b.innerHTML = `${tag}<div class="cast-face">${c.html('face')}</div><b>${c.name}</b><small>${c.title}</small>`;
    b.onclick = () => {
      Sound.ensure();
      if (!settings.mascot) setSetting('mascot', true, true);
      setSetting('companion', k, true);
      (Sound.sfx.partnerSelect || Sound.sfx.click)?.(k);
      document.querySelectorAll('.cast-pick').forEach((p) => p.querySelectorAll('.cast-opt').forEach((x) => x.classList.toggle('on', x.dataset.partner === k)));
      const picked = Cast.get(k);
      const pTone = typeof partnerTone === 'function' ? partnerTone(k) : 'amber';
      PopupFX?.pill('♡', `PARTNER // ${picked.name.toUpperCase()}`, picked.title.toUpperCase(), pTone, { always: true });
      PopupFX?.stamp('HELLO!', picked.moods?.hello || 'happy', pTone === 'danger' ? 'amber' : pTone, true);
      Companion.react('hello');
    };
    wrap.appendChild(b);
  });
  return wrap;
}

function isDeckUnlocked(kind, key) {
  if (typeof Gacha === 'undefined') return true;
  if (kind === 'front') return Gacha.isFrontUnlocked ? Gacha.isFrontUnlocked(key) : true;
  return Gacha.isBackUnlocked ? Gacha.isBackUnlocked(key) : true;
}

function buildDeckGrid(kind) {
  if (kind === 'front') {
    return makeDeckPicker('front', Art.FRONTS, settings.front, 'fronts', 'front-opt', (k, F) => {
      const sw = document.createElement('span');
      sw.className = 'deck-card front-swatch';
      sw.style.setProperty('--card-front-bg', F.bg);
      sw.style.setProperty('--card-front-border', F.border);
      sw.style.setProperty('--card-rk-font', F.font);
      sw.style.setProperty('--card-rk-weight', F.weight || '400');
      sw.innerHTML = Art.frontPreviewSVG(k);
      return sw;
    });
  }
  return makeDeckPicker('back', Art.BACKS, settings.back, 'backs', 'back-opt', (k) => {
    const sw = document.createElement('span');
    sw.className = 'deck-card back-swatch';
    sw.style.setProperty('--img', Art.backDataURI(k));
    return sw;
  });
}

function makeDeckPicker(kind, map, currentKey, gridClass, optClass, buildThumb) {
  const wrap = document.createElement('div');
  wrap.className = `deck-grid ${gridClass}`;
  Object.keys(map).forEach((k) => {
    const item = map[k];
    const unlocked = isDeckUnlocked(kind, k);
    const gId = `${kind}:${k}`;
    const gItem = (typeof Gacha !== 'undefined' && Gacha.getItem) ? Gacha.getItem(gId) : null;
    const craftCost = gItem?.craftCost ?? (kind === 'front' ? 100 : 45);
    const active = unlocked && currentKey === k;

    const b = document.createElement('button');
    b.type = 'button';
    b.className = `deck-opt ${optClass}` + (active ? ' on' : '') + (unlocked ? '' : ' is-locked');
    b.dataset.deck = k;
    b.title = unlocked ? item.name : `${item.name} (Locked — ${craftCost}✧)`;
    b.setAttribute('aria-label', unlocked ? `Card ${kind}: ${item.name}` : `Card ${kind}: ${item.name} (Locked, ${craftCost} Shards)`);
    b.setAttribute('aria-pressed', String(active));
    const thumb = buildThumb(k, item);
    const lbl = document.createElement('span');
    lbl.className = 'deck-lbl';
    lbl.textContent = item.name;
    b.append(thumb, lbl);
    if (!unlocked) {
      const lockPill = document.createElement('span');
      lockPill.className = 'deck-lock-pill';
      lockPill.textContent = `🔒 ${craftCost}✧`;
      b.appendChild(lockPill);
    }
    b.onclick = async () => {
      if (isDeckUnlocked(kind, k)) {
        setSetting(kind, k);
        wrap.querySelectorAll('.deck-opt').forEach((x) => {
          const isAct = x === b;
          x.classList.toggle('on', isAct);
          x.setAttribute('aria-pressed', String(isAct));
        });
        return;
      }
      Sound.ensure();
      Sound.sfx.click?.();
      const state = (typeof Gacha !== 'undefined' && Gacha.getState) ? Gacha.getState() : { shards: 0 };
      const shards = Math.max(0, Number(state.shards) || 0);
      if (typeof Gacha !== 'undefined' && Gacha.craft && shards >= craftCost) {
        const choice = await ask(
          `Unlock <b>${esc(item.name)}</b> for <b>${craftCost} ✧</b>?<br><small style="opacity:.78">You have ${shards.toLocaleString()} ✧</small>`,
          [
            { label: `✧ Craft & Equip (${craftCost}✧)`, value: 'craft', primary: true },
            { label: '🎰 Open Gacha', value: 'gacha' },
            { label: 'Cancel', value: null },
          ]
        );
        if (choice === 'craft') {
          const res = Gacha.craft(gId);
          if (res && res.ok) {
            Sound.sfx.newRecord?.();
            setSetting(kind, k);
            refreshSettingsDecks();
          } else if (res && res.reason === 'owned') {
            setSetting(kind, k);
            refreshSettingsDecks();
          } else {
            Sound.sfx.invalid?.();
            toast('Not enough shards! ✧');
          }
        } else if (choice === 'gacha') {
          window.openGachaModal?.('banner');
        }
      } else {
        toast(`Locked (${shards}/${craftCost} ✧) — pull in Prism Gacha! 🎰`);
        window.openGachaModal?.('banner');
      }
    };
    wrap.appendChild(b);
  });
  return wrap;
}

function updateSettingsNote() {
  const pending = G && (G.difficulty !== settings.difficulty || G.variant !== settings.variant
    || (settings.variant === 'klondike' && G.draw !== settings.draw) || (settings.variant === 'spider' && G.suits !== settings.spiderSuits));
  DOM.settingsNote.classList.toggle('hidden', !pending);
}

const cleanOptLabel = (list, key) => {
  const hit = list.find((x) => x[0] === key);
  return hit ? hit[1].replace(/^[^\wA-Za-z0-9]+\s*/, '').toUpperCase() : String(key).toUpperCase();
};

function openSettings() { buildSettings(); showOverlay('settingsModal'); }
