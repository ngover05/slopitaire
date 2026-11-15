/* Slopitaire — the 5-zone companion body-click system. */
'use strict';

const TOUCH_REACT_CLASSES = ['react-headpat', 'react-boop', 'react-highfive', 'react-fluster', 'react-startle'];
const TOUCH_ZONES = {
  touchHead:  { cls: 'react-headpat',  label: 'HEADPAT ♡',    tone: 'gold',    hearts: true },
  touchFace:  { cls: 'react-boop',     label: 'BOOP! ☆',      tone: 'amber',   hearts: false },
  touchHands: { cls: 'react-highfive', label: 'HAND SYNC ✦',  tone: 'emerald', hearts: false },
  touchTorso: { cls: 'react-fluster',  label: 'DOKI!! ⚡',     tone: 'rose',    hearts: true },
  touchLegs:  { cls: 'react-startle',  label: 'WATCH IT! 💢', tone: 'danger',  hearts: false },
};

function spriteRectOf(containerEl) {
  if (!containerEl) return null;
  const moodHost = containerEl.closest?.('[data-mood]')
    || (containerEl.dataset?.mood ? containerEl : containerEl.parentElement);
  const curMood = moodHost?.dataset?.mood || 'normal';
  const candidates = [
    containerEl.querySelector?.(`.chara-img.m-${curMood}`),
    containerEl.querySelector?.('.chara-img.is-active'),
    containerEl.querySelector?.('.chara-img'),
    containerEl.querySelector?.('.chara'),
    containerEl,
  ];
  for (const el of candidates) {
    if (el && el.getBoundingClientRect) {
      const rect = el.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return rect;
    }
  }
  return null;
}

function detectTouchZone(clientX, clientY, containerEl, mode) {
  const r = spriteRectOf(containerEl);
  const rx = r ? Math.max(0, Math.min(1, (clientX - r.left) / r.width)) : 0.5;
  const ry = r ? Math.max(0, Math.min(1, (clientY - r.top) / r.height)) : 0.35;
  const effMode = mode || (settings.spriteMode === 'full' ? 'full' : 'corner');
  if (effMode === 'full') {
    if (ry < 0.16) return 'touchHead';
    if (ry < 0.28) return 'touchFace';
    if (ry < 0.56 && (rx < 0.27 || rx > 0.73)) return 'touchHands';
    if (ry < 0.48) return 'touchTorso';
    return 'touchLegs';
  }
  if (Companion.c.kind === 'cat') {
    if (ry < 0.36) return 'touchHead';
    if (ry < 0.58) return 'touchFace';
    if (rx < 0.24 || rx > 0.76) return 'touchHands';
    if (ry < 0.80) return 'touchTorso';
    return 'touchLegs';
  }
  if (ry < 0.24) return 'touchHead';
  if (ry < 0.47) return 'touchFace';
  if (ry < 0.86 && (rx < 0.25 || rx > 0.75)) return 'touchHands';
  if (ry < 0.78) return 'touchTorso';
  return 'touchLegs';
}

function handleCompanionTouch(e, targetEl, mode, quoteEl) {
  if (!targetEl) return null;
  Sound.ensure();
  noteActivity();
  const r = spriteRectOf(targetEl);
  const hasPt = e && typeof e.clientX === 'number' && typeof e.clientY === 'number'
    && !(e.clientX === 0 && e.clientY === 0 && e.detail === 0 && r && (r.left > 4 || r.top > 4));
  const cx = hasPt ? e.clientX : r ? Math.round(r.left + r.width * 0.5) : Math.round(innerWidth * 0.5);
  const cy = hasPt ? e.clientY : r ? Math.round(r.top + r.height * 0.35) : Math.round(innerHeight * 0.5);

  const effMode = mode || (settings.spriteMode === 'full' ? 'full' : 'corner');
  const zone = detectTouchZone(cx, cy, targetEl, effMode);
  const cfg = TOUCH_ZONES[zone] || TOUCH_ZONES.touchHead;

  (Sound.sfx[zone] || Sound.sfx.petGirl)?.(settings.companion);
  const line = Companion.react(zone, { force: true });
  const resolvedMood = Companion.c.moods[zone] || (EVENTS[zone] && EVENTS[zone][1]) || 'happy';

  targetEl.removeAttribute('title');
  targetEl.parentElement?.removeAttribute?.('title');
  if (targetEl !== Companion.body && targetEl.parentElement) {
    targetEl.parentElement.dataset.mood = resolvedMood;
    const singleImg = targetEl.querySelector('.girl-sprite.is-single .chara-img');
    if (singleImg && Companion.c.sprites) {
      const set = Companion.c.sprites.full || Companion.c.sprites.corner;
      if (set) singleImg.src = set[resolvedMood] || set.normal;
    }
  }

  targetEl.classList.remove('boing', ...TOUCH_REACT_CLASSES);
  void targetEl.offsetWidth;
  targetEl.classList.add(cfg.cls);

  if (quoteEl && line?.show) {
    quoteEl.textContent = line.show;
  } else if (targetEl.id === 'startMascot' && line?.show) {
    toast(line.show);
  }

  if (settings.anim !== 'off') {
    const rip = document.createElement('div');
    rip.className = 'touch-ripple';
    rip.dataset.zone = zone;
    rip.style.left = Math.round(cx) + 'px';
    rip.style.top = Math.round(cy) + 'px';
    document.body.appendChild(rip);
    const rm = () => { clearTimeout(rip._t); rip.remove(); };
    rip.addEventListener('animationend', rm, { once: true });
    rip._t = setTimeout(rm, 550);
  }

  if (cfg.hearts) FX.hearts(cx, cy, 12);
  else FX.burst(cx, cy, 14);
  PopupFX?.float(cx, cy - 18, cfg.label, '', cfg.tone);

  return { zone, mood: resolvedMood, line };
}

// clicks on the companion (and on the start / win / lose screen sprites); cards under her stay draggable
function bindCompanionTouch() {
  let suppressPet = false;
  $('#mascotBody').addEventListener('pointerdown', (e) => {
    suppressPet = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!G || busy || G.won || G.lost || overlayOpen() || !document.elementsFromPoint) return;
    const under = document.elementsFromPoint(e.clientX, e.clientY)
      .find((el) => !Companion.el.contains(el) && el.classList && el.classList.contains('card'));
    if (!under || !under.classList.contains('up')) return;
    const c = cards[+under.dataset.id];
    if (!c || !c.pile || !movableFrom(c)) return;
    suppressPet = true;
    const clearSuppress = () => setTimeout(() => { suppressPet = false; }, 60);
    window.addEventListener('pointerup', clearSuppress, { once: true });
    window.addEventListener('pointercancel', clearSuppress, { once: true });
    onDown(e, under);
  });
  $('#mascotBody').onclick = (e) => {
    if (suppressPet) { suppressPet = false; return; }
    handleCompanionTouch(e, $('#mascotBody'), settings.spriteMode === 'full' ? 'full' : 'corner');
  };
  const bindOverlayMascot = (sel, quoteSel) => {
    const el = $(sel);
    if (!el) return;
    el.onclick = (e) => { handleCompanionTouch(e, el, 'full', quoteSel ? $(quoteSel) : null); };
    el.parentElement?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) handleCompanionTouch(e, el, 'full', quoteSel ? $(quoteSel) : null);
    });
  };
  bindOverlayMascot('#startMascot', null);
  bindOverlayMascot('#winMascot', '#winQuote');
  bindOverlayMascot('#loseMascot', '#loseQuote');
}
