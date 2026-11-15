/* Slopitaire — player settings: defaults, validation, boot migration, and applying changes to the app. */
'use strict';

const DEFAULTS = {
  variant: 'klondike', spiderSuits: 1,
  difficulty: 'medium', draw: 1,
  tapMove: true, autoFound: false, autoFinish: true, dropGuides: true, showStats: true, leftHanded: false,
  theme: 'prism', back: 'sakura', bgFx: true, popups: 'max', petals: true, anim: 'normal', perf: 'auto', mascot: true,
  muted: false, music: 'pulse', musicVol: 0.5, sfxVol: 0.7,
  companion: 'sakura', spriteMode: 'corner', chatter: 'all', voice: true, voiceLang: 'ja', voiceNames: {}, voiceVol: 0.9, cutins: true, detectLoss: 'solver',
};
const hadRawMeta = Store.get('meta', null) !== null;
const hadSavedSettings = Store.get('settings', null) !== null;
const hadSavedStats = Store.get('stats', null) !== null;
const hadSavedSave = Store.get('save', null) !== null;
const VALID_THEMES = new Set(['prism', 'night', 'sakura', 'ramune', 'matcha']);
const VALID_MUSIC = new Set(['pulse', 'redline', 'horizon', 'zenith', 'bounce', 'lofi', 'lullaby', 'off']);
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
  if (!VALID_POPUPS.has(next.popups)) next.popups = 'max';
  if (!VALID_PERF.has(next.perf)) next.perf = 'auto';
  if (typeof Art !== 'undefined' && Art.BACKS && !Art.BACKS[next.back]) next.back = 'sakura';
  if (typeof Cast !== 'undefined' && Array.isArray(Cast.keys) && !Cast.keys.includes(next.companion)) next.companion = 'sakura';
  next.prismV1 = true;
  next.hyperPopV1 = true;
  return next;
}
const rawBootSettings = Store.get('settings', {});
let settings = normalizeSettings(rawBootSettings);
const voiceNameFor = (k) => settings.voiceNames[k || settings.companion] || '';
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
  if (!quiet && key === 'muted' && v === true) (Sound.sfx.toggleOff || Sound.sfx.click)?.();
  settings[key] = v;
  saveSettings();
  applySettings(key);
  if (!quiet) {
    if (key === 'music') {
      Sound.sfx.modeSwitch?.();
      PopupFX?.pill('♪', `TRACK // ${cleanOptLabel(MUSIC_OPTS, v)}`, v === 'off' ? 'BGM MUTED' : 'SYNTH ENGINE SYNCED', 'emerald', { always: true });
      if (settings.music !== 'off') Companion.react('musicChange');
    } else if (key === 'theme') {
      Sound.sfx.modeSwitch?.();
      PopupFX?.pill('◈', `THEME // ${cleanOptLabel(THEMES, v)}`, 'STAGE PALETTE ACTIVE', 'amber', { always: true });
      Companion.react('themeChange');
    } else if (key === 'spriteMode') {
      Sound.sfx.modeSwitch?.();
      PopupFX?.pill('↕', v === 'full' ? 'SPRITE // FULL-BODY' : 'SPRITE // CORNER', `${Companion.c.name.toUpperCase()} VIEW`, 'emerald', { always: true });
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
  document.body.classList.toggle('perf-lite', perfLite());
  if (key === 'perf') { StageBG.resize(); FX.resize(); }
  if (all || key === 'back') document.documentElement.style.setProperty('--card-back', Art.backDataURI(settings.back));
  const ms = moveMs();
  document.documentElement.style.setProperty('--move', ms + 'ms');
  document.documentElement.style.setProperty('--flip', (settings.anim === 'off' ? 0 : settings.anim === 'fast' ? 180 : 300) + 'ms');
  if (all || key === 'petals' || key === 'anim' || key === 'perf') buildPetals();
  if (all || key === 'theme' || key === 'bgFx' || key === 'anim' || key === 'perf') StageBG.refreshTheme();
  if (settings.popups === 'off' || settings.anim === 'off') PopupFX?.clear();
  DOM.mascot.classList.toggle('hidden', !settings.mascot);
  if (all || key === 'companion' || key === 'spriteMode') Companion.render();
  if (key === 'companion') document.querySelectorAll('select[data-voice-select]').forEach((s) => s._fill());
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
  if (key === 'leftHanded' && G) { slotsDirty = true; layout(); }
  if (key === 'autoFinish' && G) maybeAutoFinish();
  if (key === 'detectLoss') scheduleCheck();
  if (all || key === 'theme') {
    const meta = document.querySelector('meta[name="theme-color"]');
    const cs = getComputedStyle(document.body);
    if (meta) meta.content = cs.getPropertyValue('--bg1').trim() || cs.getPropertyValue('--accent2').trim() || '#0a131a';
  }
}
