/* Slopitaire — companion sprite markup (TV-anime PNG stacks or Mochi's SVG) and background sprite preloading. */
const CastSprites = (() => {
  'use strict';
  const MOODS = ['normal', 'happy', 'wink', 'oops', 'sad', 'thinking', 'special', 'hype', 'smug', 'shock', 'cheer'];
  const preloaded = new Set();
  const queued = new Set();
  const preloadQueue = [];
  let preloadScheduled = false;
  const PRELOAD_BATCH = 3;

  const deferPreload = typeof requestIdleCallback === 'function'
    ? (fn) => requestIdleCallback(fn, { timeout: 300 })
    : (fn) => setTimeout(fn, 60);

  function preloadUrl(src) {
    if (!src || preloaded.has(src)) return;
    preloaded.add(src);
    if (typeof Image === 'undefined') return;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }

  function preloadUrls(urls) {
    for (let i = 0; i < urls.length; i++) preloadUrl(urls[i]);
  }

  function drainPreloadQueue() {
    preloadScheduled = false;
    let count = 0;
    while (preloadQueue.length && count < PRELOAD_BATCH) {
      const src = preloadQueue.shift();
      queued.delete(src);
      if (!preloaded.has(src)) {
        preloadUrl(src);
        count++;
      }
    }
    if (preloadQueue.length) {
      preloadScheduled = true;
      deferPreload(drainPreloadQueue);
    }
  }

  function queuePreload(urls, front = false) {
    let added = false;
    if (front) {
      for (let i = urls.length - 1; i >= 0; i--) {
        const src = urls[i];
        if (!src || preloaded.has(src) || queued.has(src)) continue;
        queued.add(src);
        preloadQueue.unshift(src);
        added = true;
      }
    } else {
      for (let i = 0; i < urls.length; i++) {
        const src = urls[i];
        if (!src || preloaded.has(src) || queued.has(src)) continue;
        queued.add(src);
        preloadQueue.push(src);
        added = true;
      }
    }
    if (added && !preloadScheduled) {
      preloadScheduled = true;
      deferPreload(drainPreloadQueue);
    }
  }

  // Renders either Mochi's SVG or TV-anime PNG sprite stacks (zero-flicker GPU mood switching).
  function spriteHTML(c, mode = 'corner', fixedMood = null, skinOverride = null) {
    if (c.kind === 'cat') return Art.mascotSVG();
    const skin = typeof c.getSkin === 'function'
      ? c.getSkin(skinOverride)
      : { sprites: c.sprites, faceStyle: c.faceStyle };
    const sprites = (skin && skin.sprites) || c.sprites;
    const faceStyle = (skin && skin.faceStyle !== undefined) ? skin.faceStyle : c.faceStyle;
    const cornerSet = (sprites && sprites.corner) || {};
    if (mode === 'face') {
      if (fixedMood) {
        const src = cornerSet[fixedMood] || cornerSet.normal;
        return `<div class="chara girl-sprite is-face is-single" style="${faceStyle || ''}" aria-hidden="true">` +
          `<img class="chara-img face-idle is-active" src="${src}" alt="" draggable="false" decoding="async">` +
        `</div>`;
      }
      return `<div class="chara girl-sprite is-face" style="${faceStyle || ''}" aria-hidden="true">` +
        `<img class="chara-img face-idle" src="${cornerSet.normal}" alt="" draggable="false" decoding="async">` +
        `<img class="chara-img face-wink" src="${cornerSet.wink}" alt="" draggable="false" decoding="async">` +
      `</div>`;
    }
    const set = (sprites && sprites[mode]) || cornerSet;
    if (fixedMood) {
      const src = set[fixedMood] || set.normal;
      return `<div class="chara girl-sprite is-${mode} is-single" aria-hidden="true">` +
        `<img class="chara-img is-active" src="${src}" alt="" draggable="false" decoding="async">` +
      `</div>`;
    }
    const bySrc = new Map();
    MOODS.forEach((m) => {
      const src = set[m] || set.normal;
      if (!bySrc.has(src)) bySrc.set(src, []);
      bySrc.get(src).push('m-' + m);
    });
    const imgs = [...bySrc.entries()].map(([src, cls]) =>
      `<img class="chara-img ${cls.join(' ')}" src="${src}" alt="" draggable="false" decoding="async">`
    ).join('');
    return `<div class="chara girl-sprite is-${mode}" aria-hidden="true">${imgs}</div>`;
  }

  return { MOODS, deferPreload, preloadUrls, queuePreload, spriteHTML };
})();
