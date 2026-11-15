/* Slopitaire — the companion cast: the roster (js/cast/characters/*.js), picking voice lines without repeats, and
 * fallbacks for events a companion has no lines for. */
const Cast = (() => {
  'use strict';
  const { MOODS, deferPreload, preloadUrls, queuePreload, spriteHTML } = CastSprites;

  // Lines for the variant events (each character file adds them next to the Klondike ones):
  //   startSpider / startFreecell / startPyramid / startTripeaks  a new deal of that game
  //   spiderRun    a King-to-Ace run of one suit lifted off the table     spiderDeal  a new row dealt
  //   dealBlocked  tried to deal while a column is empty                  supermove   FreeCell: 3+ cards moved at once
  //   cellsFull    FreeCell: all four free cells taken                   cellsClear  ...and all four free again
  //   pairMatch    Pyramid: a pair adding up to 13 removed               kingSolo    Pyramid: a King removed alone
  //   rowClear     Pyramid: a whole row of the pyramid gone              peakClear   TriPeaks: a peak's top card played
  //   runBanked    TriPeaks: a run of 5+ cashed in by drawing            wrapPlay    TriPeaks: King ↔ Ace wraparound
  const FALLBACK = {
    startEasy: 'start', restart: 'start', welcome: 'start', hello: 'start', combo: 'foundation', suitDone: 'foundation',
    clearCol: 'reveal', hintNone: 'noMoves', undoBlocked: 'invalid', noRedeal: 'noMoves', settings: 'pick', autoFinish: 'win',
    chain5: 'combo', chain10: 'combo', chain20: 'combo', chain30: 'combo', chainBreak: 'invalid',
    combo5: 'chain5', combo10: 'chain10', combo20: 'chain20', combo30: 'chain30', comboBreak: 'chainBreak',
    kingPlace: 'clearCol', aceFound: 'foundation', fastPlay: 'place', clutch: 'combo',
    multiMove: 'place', halfway: 'foundation', almostWon: 'autoFinish', musicChange: 'settings', themeChange: 'settings',
    touchHead: 'pet', touchFace: 'pet', touchHands: 'pet', touchTorso: 'pet', touchLegs: 'pet',
    startSpider: 'start', startFreecell: 'start', startPyramid: 'start', startTripeaks: 'start',
    spiderRun: 'suitDone', spiderDeal: 'draw', dealBlocked: 'invalid', cellsFull: 'invalid', cellsClear: 'clearCol',
    supermove: 'multiMove', pairMatch: 'place', kingSolo: 'kingPlace', rowClear: 'clearCol', peakClear: 'suitDone',
    runBanked: 'combo', wrapPlay: 'fastPlay',
  };

  // filled in by js/cast/characters/*.js, in script order
  const CAST = window.CastRoster || {};

  const RING_SIZE = 5;
  const showOf = (l) => (Array.isArray(l) ? l[0] : l);
  const inTail = (arr, val, cap) => {
    const start = arr.length > cap ? arr.length - cap : 0;
    for (let i = arr.length - 1; i >= start; i--) {
      if (arr[i] === val) return true;
    }
    return false;
  };
  const pushRing = (arr, val, cap) => {
    const idx = arr.indexOf(val);
    if (idx !== -1) arr.splice(idx, 1);
    arr.push(val);
    while (arr.length > cap) arr.shift();
  };

  Object.keys(CAST).forEach((k) => {
    const c = CAST[k];
    c.key = k;
    c.html = (mode = 'corner', fixedMood = null) => spriteHTML(c, mode, fixedMood);
    c.faceHTML = (fixedMood = null) => spriteHTML(c, 'face', fixedMood);
    c.svg = (crop) => spriteHTML(c, crop ? 'face' : 'corner');
    c.preload = (mode) => {
      if (!c.sprites) return;
      const activeMode = mode === 'full' ? 'full' : 'corner';
      const immediate = [c.sprites.corner.normal, c.sprites.corner.wink];
      if (c.sprites[activeMode] && c.sprites[activeMode].normal) {
        immediate.push(c.sprites[activeMode].normal);
      }
      preloadUrls(immediate);
      const primary = Object.values(c.sprites[activeMode]);
      const secondary = Object.values(c.sprites[activeMode === 'full' ? 'corner' : 'full']);
      queuePreload([...primary, ...secondary], true);
    };
    const recentGlobal = [];
    const recentByEv = Object.create(null);
    c.line = (ev) => {
      const key = c.lines[ev] ? ev : FALLBACK[ev];
      const pool = key ? c.lines[key] : null;
      if (!pool || !pool.length) return null;
      const evHist = recentByEv[key] || (recentByEv[key] = []);
      const evCap = Math.min(RING_SIZE, Math.max(0, pool.length - 1));
      let n1 = 0, n2 = 0;
      for (let i = 0; i < pool.length; i++) {
        const s = showOf(pool[i]);
        if (evCap > 0 && inTail(evHist, s, evCap)) continue;
        n2++;
        if (!inTail(recentGlobal, s, RING_SIZE)) n1++;
      }
      let l;
      if (n1 > 0) {
        let pick = (Math.random() * n1) | 0;
        for (let i = 0; i < pool.length; i++) {
          const item = pool[i];
          const s = showOf(item);
          if ((evCap <= 0 || !inTail(evHist, s, evCap)) && !inTail(recentGlobal, s, RING_SIZE)) {
            if (pick-- === 0) { l = item; break; }
          }
        }
      } else if (n2 > 0) {
        let pick = (Math.random() * n2) | 0;
        for (let i = 0; i < pool.length; i++) {
          const item = pool[i];
          if (evCap <= 0 || !inTail(evHist, showOf(item), evCap)) {
            if (pick-- === 0) { l = item; break; }
          }
        }
      } else {
        l = pool[(Math.random() * pool.length) | 0];
      }
      const line = Array.isArray(l) ? { show: l[0], ja: l[1], en: l[2] } : { show: l, ja: 'にゃ', en: 'nya' };
      pushRing(evHist, line.show, RING_SIZE);
      pushRing(recentGlobal, line.show, RING_SIZE);
      return line;
    };
  });

  // Warm the partner-picker face sprites in small batches so partner cards appear smoothly.
  deferPreload(() => {
    const faceUrls = [];
    Object.values(CAST).forEach((c) => {
      if (c.sprites) faceUrls.push(c.sprites.corner.normal, c.sprites.corner.wink);
    });
    queuePreload(faceUrls);
  });

  const get = (k) => CAST[k] || CAST.sakura;
  const faceHTML = (kOrC, mood = 'wink') => {
    const c = kOrC && typeof kOrC === 'object' ? kOrC : get(kOrC);
    return spriteHTML(c, 'face', mood);
  };
  return { get, faceHTML, keys: Object.keys(CAST), CAST, MOODS };
})();
