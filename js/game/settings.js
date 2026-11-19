/* Slopitaire — player settings: defaults, validation, boot migration, and applying changes to the app. */
'use strict';

const DEFAULTS = {
  variant: 'klondike', spiderSuits: 1,
  difficulty: 'medium', draw: 1,
  tapMove: true, autoFound: false, autoFinish: true, dropGuides: true, showStats: true, leftHanded: false,
  theme: 'prism', front: 'classic', back: 'sakura', bgFx: true, popups: 'max', petals: true, anim: 'normal', perf: 'auto', mascot: true,
  muted: false, music: 'pulse', musicVol: 0.5, sfxVol: 0.7, spotifyAutoMuteBgm: true,
  companion: 'sakura', skins: {}, spriteMode: 'corner', chatter: 'all', voice: true, voiceLang: 'ja', voiceNames: {}, voiceVol: 0.9, cutins: true, detectLoss: 'solver',
};
const hadRawMeta = Store.get('meta', null) !== null;
const hadSavedSettings = Store.get('settings', null) !== null;
const hadSavedStats = Store.get('stats', null) !== null;
const hadSavedSave = Store.get('save', null) !== null;
const VALID_THEMES = new Set(THEME_KEYS);
const VALID_MUSIC = new Set(['pulse', 'redline', 'horizon', 'zenith', 'bounce', 'lofi', 'lullaby', 'spotify', 'off']);
const VALID_POPUPS = new Set(['max', 'normal', 'off']);
const VALID_PERF = new Set(['auto', 'high', 'lite']);
// Phones and tablets (touch-only) or very low-spec machines get the lighter rendering & audio path by default.
const LOW_POWER_DEVICE = (() => {
  try {
    const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
    const touchOnly = mq('(pointer: coarse)') && !mq('(any-pointer: fine)');
    const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
    return touchOnly || (!!mem && mem <= 2) || (!!cores && cores <= 2);
  } catch (e) { return false; }
})();
// lite mode: no backdrop blur or animated glow filters, 1x canvases, a slower backdrop, fewer synth voices
const perfLite = () => settings.perf === 'lite' || (settings.perf === 'auto' && LOW_POWER_DEVICE);
function normalizeSettings(raw) {
  const next = Object.assign({}, DEFAULTS, (raw && typeof raw === 'object') ? raw : {});
  if (!DIFF[next.difficulty]) next.difficulty = 'medium';
  if (next.draw !== 1 && next.draw !== 3) next.draw = 1;
  if (!VARIANTS[next.variant]) next.variant = 'klondike';
  if (![1, 2, 4].includes(next.spiderSuits)) next.spiderSuits = 1;
  if (!next.voiceNames || typeof next.voiceNames !== 'object') next.voiceNames = {};
  if (next.spriteMode !== 'corner' && next.spriteMode !== 'full') next.spriteMode = 'corner';
  delete next.voiceName;
  // game-end detection used to be on/off; it is now 'solver' (unwinnable), 'stuck' (no useful move left) or 'off'
  if (next.detectLoss === true) next.detectLoss = 'solver';
  else if (!['solver', 'stuck', 'off'].includes(next.detectLoss)) next.detectLoss = 'off';
  if (!VALID_THEMES.has(next.theme)) next.theme = 'prism';
  if (!VALID_MUSIC.has(next.music)) next.music = 'pulse';
  next.spotifyAutoMuteBgm = next.spotifyAutoMuteBgm !== false;
  if (!VALID_POPUPS.has(next.popups)) next.popups = 'max';
  if (!VALID_PERF.has(next.perf)) next.perf = 'auto';
  if (typeof Art !== 'undefined' && Art.FRONTS && !Object.prototype.hasOwnProperty.call(Art.FRONTS, next.front)) next.front = 'classic';
  if (typeof Art !== 'undefined' && Art.BACKS && !Object.prototype.hasOwnProperty.call(Art.BACKS, next.back)) next.back = 'sakura';
  if (typeof Gacha !== 'undefined') {
    if (!Gacha.isFrontUnlocked(next.front)) next.front = 'classic';
    if (!Gacha.isBackUnlocked(next.back)) next.back = 'sakura';
  }
  if (typeof Cast !== 'undefined' && Array.isArray(Cast.keys) && !Cast.keys.includes(next.companion)) next.companion = 'sakura';
  const rawSkins = (next.skins && typeof next.skins === 'object' && !Array.isArray(next.skins)) ? next.skins : {};
  const cleanSkins = {};
  if (typeof Cast !== 'undefined' && Cast.CAST) {
    Object.keys(rawSkins).forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(Cast.CAST, k)) return;
      const c = Cast.CAST[k];
      if (!c || c.kind !== 'girl') return;
      const val = rawSkins[k];
      if (typeof val === 'string' && c.skins && Object.prototype.hasOwnProperty.call(c.skins, val)) {
        if (typeof Gacha !== 'undefined' && !Gacha.isSkinUnlocked(k, val)) return;
        cleanSkins[k] = val;
      }
    });
  } else {
    Object.keys(rawSkins).forEach((k) => {
      if (typeof rawSkins[k] === 'string' && rawSkins[k]) {
        if (typeof Gacha !== 'undefined' && !Gacha.isSkinUnlocked(k, rawSkins[k])) return;
        cleanSkins[k] = rawSkins[k];
      }
    });
  }
  next.skins = cleanSkins;
  next.prismV1 = true;
  next.hyperPopV1 = true;
  return next;
}
const rawBootSettings = Store.get('settings', {});
let settings = normalizeSettings(rawBootSettings);
const voiceNameFor = (k) => settings.voiceNames[k || settings.companion] || '';
const PARTNER_TONES = { kira: 'emerald', mio: 'emerald', ayame: 'danger', yuki: 'violet', tanner: 'amber', joel: 'amber' };
const DECK_TONES = {
  cyber: 'emerald', kira: 'emerald', mio: 'emerald', hearts: 'emerald',
  ayame: 'danger',
  yuki: 'violet', rin: 'violet', stars: 'violet', neko: 'violet',
  tanner: 'amber', joel: 'amber',
};
const partnerTone = (k) => PARTNER_TONES[k] || 'amber';
function skinFor(charKey) {
  const k = charKey || settings.companion;
  const raw = (settings.skins && typeof settings.skins === 'object' && Object.prototype.hasOwnProperty.call(settings.skins, k))
    ? settings.skins[k]
    : 'default';
  if (typeof Cast !== 'undefined' && Cast.CAST) {
    const c = Cast.CAST[k];
    if (!c || c.kind !== 'girl') return 'default';
    if (c.skins && Object.prototype.hasOwnProperty.call(c.skins, raw)) {
      if (raw !== 'default' && typeof Gacha !== 'undefined' && !Gacha.isSkinUnlocked(k, raw)) return 'default';
      return raw;
    }
    return 'default';
  }
  if (raw !== 'default' && typeof Gacha !== 'undefined' && !Gacha.isSkinUnlocked(k, raw)) return 'default';
  return raw || 'default';
}
function setGirlSkin(charKey, skinKey, quiet) {
  if (typeof Cast === 'undefined' || !Cast.CAST || !Object.prototype.hasOwnProperty.call(Cast.CAST, charKey)) return false;
  const c = Cast.CAST[charKey];
  if (!c || c.kind !== 'girl' || !c.skins || !Object.prototype.hasOwnProperty.call(c.skins, skinKey)) return false;
  if (typeof Gacha !== 'undefined' && !Gacha.isSkinUnlocked(charKey, skinKey)) {
    if (!quiet && typeof Sound !== 'undefined') Sound.sfx?.invalid?.();
    return false;
  }
  const skin = c.skins[skinKey];
  settings.skins = Object.assign({}, settings.skins, { [charKey]: skinKey });
  saveSettings();
  applySettings('skins');
  if (!quiet) {
    Sound.sfx.modeSwitch?.();
    const sub = skin.subtitle ? `${skin.name.toUpperCase()} · ${skin.subtitle.toUpperCase()}` : skin.name.toUpperCase();
    PopupFX?.pill('🎀', `OUTFIT // ${c.name.toUpperCase()}`, sub, partnerTone(charKey), { always: true });
    if (settings.companion === charKey) Companion.react('themeChange');
  }
  return true;
}
function setAllGirlSkins(skinKey, quiet) {
  if (typeof Cast === 'undefined' || !Cast.CAST || !Array.isArray(Cast.girlKeys)) return false;
  const nextSkins = Object.assign({}, settings.skins);
  let updated = 0;
  Cast.girlKeys.forEach((k) => {
    const c = Cast.CAST[k];
    if (c && c.skins && Object.prototype.hasOwnProperty.call(c.skins, skinKey)
        && (typeof Gacha === 'undefined' || Gacha.isSkinUnlocked(k, skinKey))) {
      nextSkins[k] = skinKey;
      updated++;
    }
  });
  if (!updated) {
    if (!quiet && typeof Sound !== 'undefined') Sound.sfx?.invalid?.();
    if (!quiet && typeof toast === 'function') toast('Unlock outfits in Prism Gacha first! 🎰');
    return false;
  }
  settings.skins = nextSkins;
  saveSettings();
  applySettings('skins');
  if (!quiet) {
    Sound.sfx.modeSwitch?.();
    const tone = skinKey === 'casual' ? 'emerald' : 'amber';
    PopupFX?.pill('🎀', `OUTFITS // ALL ${skinKey.toUpperCase()}`, `${updated} COMPANIONS UPDATED`, tone, { always: true });
    if (Cast.get(settings.companion)?.kind === 'girl') Companion.react('themeChange');
  }
  return true;
}
const saveSettings = (opts) => Store.set('settings', settings, opts);
if (!rawBootSettings?.prismV1 || !rawBootSettings?.hyperPopV1 || !VALID_THEMES.has(rawBootSettings?.theme) || !VALID_MUSIC.has(rawBootSettings?.music) || !VALID_POPUPS.has(rawBootSettings?.popups)) {
  if (!rawBootSettings?.prismV1) {
    settings.theme = 'prism';
    settings.music = 'pulse';
    settings.chatter = 'all';
  }
  if (!rawBootSettings?.hyperPopV1) {
    settings.popups = 'max';
  }
  saveSettings(hadSavedSettings ? undefined : { fromRemote: true });
}
if (!hadRawMeta && (hadSavedSettings || hadSavedStats || hadSavedSave)) {
  const m = Store.getMeta();
  if (hadSavedSettings && !m.settingsUpdatedAt) m.settingsUpdatedAt = 1;
  if (hadSavedStats && !m.statsUpdatedAt) m.statsUpdatedAt = 1;
  if (hadSavedSave && !m.saveUpdatedAt) m.saveUpdatedAt = 1;
  Store.setMeta(m);
}
const moveMs = () => ({ normal: 220, fast: 120, off: 0 }[settings.anim] ?? 220);

function setSetting(key, v, quiet) {
  if ((key === 'front' && typeof Gacha !== 'undefined' && !Gacha.isFrontUnlocked(v))
      || (key === 'back' && typeof Gacha !== 'undefined' && !Gacha.isBackUnlocked(v))) {
    if (!quiet && typeof Sound !== 'undefined') Sound.sfx?.invalid?.();
    return;
  }
  if (!quiet && key === 'muted' && v === true) (Sound.sfx.toggleOff || Sound.sfx.click)?.();
  settings[key] = v;
  saveSettings();
  applySettings(key);
  if (!quiet) {
    if (key === 'music') {
      Sound.sfx.modeSwitch?.();
      if (v === 'spotify') {
        PopupFX?.pill('🎧', 'MUSIC // SPOTIFY DECK', 'YOUR MUSIC IN-GAME', 'emerald', { always: true });
        Companion.react('musicChange');
        window.Spotify?.setDrawerOpen?.(true);
      } else {
        PopupFX?.pill('♪', `TRACK // ${cleanOptLabel(MUSIC_OPTS, v)}`, v === 'off' ? 'BGM MUTED' : 'SYNTH ENGINE SYNCED', 'emerald', { always: true });
        if (settings.music !== 'off') Companion.react('musicChange');
      }
    } else if (key === 'theme') {
      Sound.sfx.modeSwitch?.();
      const T = THEME_DEFS[v] || THEME_DEFS.prism;
      PopupFX?.pill(T.icon, `THEME // ${T.name.toUpperCase()}`, 'STAGE PALETTE ACTIVE', 'amber', { always: true });
      Companion.react('themeChange');
    } else if (key === 'spriteMode') {
      Sound.sfx.modeSwitch?.();
      PopupFX?.pill('↕', v === 'full' ? 'SPRITE // FULL-BODY' : 'SPRITE // CORNER', `${Companion.c.name.toUpperCase()} VIEW`, 'emerald', { always: true });
      Companion.react('themeChange');
    } else if (key === 'front') {
      Sound.sfx.modeSwitch?.();
      const F = Art.FRONTS?.[v] || Art.FRONTS?.classic;
      const fTone = DECK_TONES[v] || 'amber';
      PopupFX?.pill('♠', `CARD FRONT // ${(F?.name || v).toUpperCase()}`, F?.subtitle || 'DECK FACE ACTIVE', fTone, { always: true });
      Companion.react('themeChange');
    } else if (key === 'back') {
      Sound.sfx.modeSwitch?.();
      const B = Art.BACKS?.[v] || Art.BACKS?.sakura;
      const bTone = DECK_TONES[v] || 'amber';
      PopupFX?.pill('❖', `CARD BACK // ${(B?.name || v).toUpperCase()}`, 'CARD SLEEVE ACTIVE', bTone, { always: true });
      Companion.react('themeChange');
    } else if (key === 'muted' && v === true) {
      /* toggleOff fired right before muting */
    } else if (typeof v === 'boolean') {
      ((v ? Sound.sfx.toggleOn : Sound.sfx.toggleOff) || Sound.sfx.click)?.();
    } else if (v === 'off') {
      (Sound.sfx.toggleOff || Sound.sfx.click)?.();
    } else {
      (Sound.sfx.toggleOn || Sound.sfx.click)?.();
    }
  }
  updateSettingsNote();
  if (key === 'difficulty' || key === 'draw' || key === 'variant' || key === 'spiderSuits') buildStartPickers();
  // rows that only apply to one game appear / disappear with it
  if (key === 'variant' && DOM.settingsModal && !DOM.settingsModal.classList.contains('hidden')) {
    const panel = DOM.settingsModal.querySelector('.panel'), y = panel ? panel.scrollTop : 0;
    buildSettings();
    if (panel) panel.scrollTop = y;
  }
}

function applySettings(key) {
  const all = !key;
  document.body.dataset.theme = settings.theme;
  document.body.dataset.themeTone = themeTone(settings.theme);
  document.body.classList.toggle('perf-lite', perfLite());
  if (key === 'perf') { StageBG.resize(); FX.resize(); }
  if (all || key === 'front') {
    const frontKey = (Art.FRONTS && Object.prototype.hasOwnProperty.call(Art.FRONTS, settings.front)) ? settings.front : 'classic';
    const F = Art.FRONTS[frontKey];
    const root = document.documentElement.style;
    root.setProperty('--card-front-bg', F.bg);
    root.setProperty('--card-front-border', F.border);
    root.setProperty('--card-rk-font', F.font);
    root.setProperty('--card-rk-weight', F.weight || '400');
    document.body.dataset.cardFront = frontKey;
    document.body.dataset.cardDark = F.dark ? '1' : '0';
    if (typeof refreshCardFaces === 'function') refreshCardFaces();
  }
  if (all || key === 'back') document.documentElement.style.setProperty('--card-back', Art.backDataURI(settings.back));
  const ms = moveMs();
  document.documentElement.style.setProperty('--move', ms + 'ms');
  document.documentElement.style.setProperty('--flip', (settings.anim === 'off' ? 0 : settings.anim === 'fast' ? 180 : 300) + 'ms');
  if (all || key === 'theme' || key === 'petals' || key === 'anim' || key === 'perf') buildPetals();
  if (all || key === 'theme' || key === 'bgFx' || key === 'anim' || key === 'perf') StageBG.refreshTheme();
  if (settings.popups === 'off' || settings.anim === 'off') PopupFX?.clear();
  DOM.mascot.classList.toggle('hidden', !settings.mascot);
  if (all || key === 'companion' || key === 'spriteMode' || key === 'skins') Companion.render();
  if (key === 'companion') {
    document.querySelectorAll('select[data-voice-select]').forEach((s) => s._fill());
    document.querySelectorAll('.cast-pick .cast-opt').forEach((x) => {
      x.classList.toggle('on', x.dataset.partner === settings.companion);
    });
  }
  if (all || key === 'skins') {
    if (key === 'skins' && typeof buildStartPickers === 'function') buildStartPickers();
    if (DOM.settingsModal && !DOM.settingsModal.classList.contains('hidden')) {
      if (typeof refreshSettingsCast === 'function') refreshSettingsCast();
    }
  }
  if (all || key === 'skins' || key === 'companion') {
    if (DOM.settingsModal && !DOM.settingsModal.classList.contains('hidden')) {
      if (typeof refreshSettingsOutfit === 'function') refreshSettingsOutfit();
    }
    if (DOM.skinsModal && !DOM.skinsModal.classList.contains('hidden')) {
      if (typeof refreshSkinsModal === 'function') refreshSkinsModal();
    }
  }
  if (key === 'mascot') {
    if (settings.mascot) { scheduleMascotMeasure(); updatePeek(); }
    else { mascotBox.w = 0; mascotBox.h = 0; updatePeek(); }
  }
  if ((key === 'voice' && !settings.voice) || (key === 'muted' && settings.muted) || (key === 'mascot' && !settings.mascot)) Companion.silence();
  if (key === 'voiceLang') {
    settings.voiceNames = {}; saveSettings();
    document.querySelectorAll('select[data-voice-select]').forEach((s) => s._fill());
  }
  if (key === 'voice' || key === 'voiceLang' || key === 'companion') document.querySelectorAll('#settingsBody .row').forEach((r) => {
    if (r.querySelector('.row-t')?.textContent === 'Voice lines') r.querySelector('.row-h').textContent = voiceHint();
  });
  document.body.classList.toggle('hide-stats', !settings.showStats);
  Sound.configure({ muted: settings.muted, sfx: settings.sfxVol, music: settings.musicVol, track: settings.music, lite: perfLite() });
  DOM.soundIc.textContent = settings.muted ? '🔇' : '♪';
  if (all || key === 'muted') window.Spotify?.onGameMuteChanged?.(settings.muted);
  if (all || key === 'spotifyAutoMuteBgm') window.Spotify?.syncAudioPolicy?.();
  if (key === 'leftHanded' && G) { slotsDirty = true; layout(); }
  if (key === 'autoFinish' && G) maybeAutoFinish();
  if (key === 'detectLoss') scheduleCheck();
  if (all || key === 'theme') {
    const meta = document.querySelector('meta[name="theme-color"]');
    const cs = getComputedStyle(document.body);
    if (meta) meta.content = cs.getPropertyValue('--bg1').trim() || cs.getPropertyValue('--accent2').trim() || '#0a131a';
  }
}

if (typeof Gacha !== 'undefined') {
  Gacha.onChange?.(() => {
    const prevJson = JSON.stringify(settings);
    const next = normalizeSettings(settings);
    if (JSON.stringify(next) !== prevJson) {
      settings = next;
      saveSettings({ fromRemote: true });
      try {
        applySettings();
        if (typeof DOM !== 'undefined' && DOM.startScreen && !DOM.startScreen.classList.contains('hidden') && typeof buildStartPickers === 'function') {
          buildStartPickers();
        }
      } catch (e) {
        if (typeof document !== 'undefined' && typeof DOM !== 'undefined') throw e;
      }
    }
  });
}
