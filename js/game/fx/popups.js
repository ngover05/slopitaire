/* Slopitaire — the 4-layer Hyper Pop-Up FX engine (#popupLayer, #eventFeed, #calloutBanner). */
'use strict';

const PopupFX = (() => {
  const layer = $('#popupLayer');
  const feed = $('#eventFeed');
  const bannerEl = $('#calloutBanner');
  let bannerT = null, stampT = null, lastStampAt = 0;
  const recentFloats = [];

  // Character-signature stamp dictionary across all 8 companions
  const STAMP_WORDS = {
    sakura: {
      'UNREAL!': 'YATTA~!! ★', "LET'S GO!": "LET'S SHINE!", 'LOCKED IN!': 'SPARKLING!', 'CLUTCH!': 'ENCORE SAVE!',
      'NICE!': 'DAISUKI! ♡', 'GENIUS!': 'STAR PLAY!', 'CLEAN!': 'SO SHINY!', 'SO FAST!': 'HYPER BEAT!',
      'WHOA!': 'KIRAKIRA!', 'OOPS!': 'FWAH?!', 'HELLO!': 'YOROSHIKU! ♡',
    },
    yuki: {
      'UNREAL!': 'OPTIMAL!!', "LET'S GO!": 'FULL SYNC!', 'LOCKED IN!': 'CALIBRATED!', 'CLUTCH!': 'CALCULATED!',
      'NICE!': 'PRECISE!', 'GENIUS!': '200 IQ!', 'CLEAN!': 'FLAWLESS!', 'SO FAST!': 'ZERO LAG!',
      'WHOA!': 'VERIFIED!', 'OOPS!': 'RECALIBRATE!', 'HELLO!': 'ONLINE! ◈',
    },
    rin: {
      'UNREAL!': 'UNSTOPPABLE!', "LET'S GO!": 'SHOWTIME!', 'LOCKED IN!': 'NOT BAD~!', 'CLUTCH!': 'BARELY!!',
      'NICE!': 'HMPH, NICE!', 'GENIUS!': 'BIG BRAIN!', 'CLEAN!': 'TOO EASY!', 'SO FAST!': 'KEEP UP!',
      'WHOA!': 'OHHO~?!', 'OOPS!': 'BAKA!!', 'HELLO!': 'READY?! ⚡',
    },
    mio: {
      'UNREAL!': 'S-SUGOI!! ♡', "LET'S GO!": 'Y-YATTA~!', 'LOCKED IN!': 'IN TUNE! ♪', 'CLUTCH!': 'P-PHEW~!!',
      'NICE!': 'U-UM, NICE!', 'GENIUS!': 'AMAZING…!', 'CLEAN!': 'SO NEAT! ♡', 'SO FAST!': 'F-FAST!!',
      'WHOA!': 'WAH…! ✨', 'OOPS!': 'E-EEP!!', 'HELLO!': 'H-HELLO… ♡',
    },
    ayame: {
      'UNREAL!': 'ECSTASY!! ♡', "LET'S GO!": 'ONLY MINE! ♡', 'LOCKED IN!': 'BOUND TO ME!', 'CLUTCH!': 'NEVER PART!',
      'NICE!': 'UFUFU~ ♡', 'GENIUS!': 'MY GENIUS! ♡', 'CLEAN!': 'DEVOTED! ♡', 'SO FAST!': 'HEARTBEAT!!',
      'WHOA!': 'FATE~ ♡', 'OOPS!': 'STAY HERE…', 'HELLO!': 'FOREVER~ ♡',
    },
    kira: {
      'UNREAL!': 'GODLIKE AURA!', "LET'S GO!": 'BREACH IN!', 'LOCKED IN!': 'ROOT LOCKED!', 'CLUTCH!': 'ZERO-DAY!',
      'NICE!': 'CLEAN HACK!', 'GENIUS!': 'OUTPLAYED!', 'CLEAN!': 'TRACE ZERO!', 'SO FAST!': 'OVERCLOCK!',
      'WHOA!': 'JACKPOT!', 'OOPS!': 'GLITCH…', 'HELLO!': 'LINKED IN ◈',
    },
    kaede: {
      'UNREAL!': 'SO PROUD!! ♡', "LET'S GO!": 'WONDERFUL! ♡', 'LOCKED IN!': 'GOOD KID~ ♡', 'CLUTCH!': 'SAFE NOW~ ♡',
      'NICE!': 'ARA, NICE! ♡', 'GENIUS!': 'CLEVER~! ♡', 'CLEAN!': 'LOVELY! ✨', 'SO FAST!': 'MY, SO QUICK!',
      'WHOA!': 'ARA ARA~ ♡', 'OOPS!': 'THERE, THERE', 'HELLO!': 'WELCOME~ ♡',
    },
    mochi: {
      'UNREAL!': 'APEX NYA!!', "LET'S GO!": 'ZOOMIES!! 🐾', 'LOCKED IN!': 'PURR-FECT!', 'CLUTCH!': '9 LIVES!!',
      'NICE!': 'NYA~! ♡', 'GENIUS!': 'CLEVER PAWS!', 'CLEAN!': 'TIDY PAWS!', 'SO FAST!': 'TURBO PAWS!',
      'WHOA!': 'MEOW-ZA!', 'OOPS!': 'MRRP?!', 'HELLO!': 'NYAA~! 🐾',
    },
  };

  const mode = () => (settings.popups === 'off' || settings.anim === 'off' ? 'off' : settings.popups === 'normal' ? 'normal' : 'max');

  function posOf(target) {
    if (target && typeof target.x === 'number' && typeof target.y === 'number') return { x: target.x, y: target.y };
    if (target && target.getBoundingClientRect) {
      const r = target.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.34 };
      if (target.dataset && target.dataset.id != null) {
        const c = cards[+target.dataset.id];
        if (c && c.x != null) {
          const br = board.getBoundingClientRect();
          return { x: br.left + c.x + (M.cw || 80) * 0.5, y: br.top + c.y + (M.ch || 110) * 0.34 };
        }
      }
    }
    return { x: innerWidth * 0.5, y: innerHeight * 0.44 };
  }

  // Layer 1: Spatial World Floating Pop-Ups (.pop-float)
  function float(target, main, opts = {}) {
    let normTarget = target, normMain = main, normOpts = opts || {};
    if (typeof target === 'number' && typeof main === 'number') {
      const [, , text, tag, tone] = arguments;
      normTarget = { x: target, y: main };
      normMain = text;
      normOpts = (tag && typeof tag === 'object')
        ? tag
        : { tag: tag || '', kind: tone || 'emerald', tone: tone || 'emerald', important: true };
    }
    const m = mode();
    if (m === 'off' || !layer || !normMain) return null;
    if (m === 'normal' && !normOpts.important) return null;
    const raw = posOf(normTarget);
    const padX = Math.min(56, Math.max(24, innerWidth * 0.08));
    const x = Math.max(padX, Math.min(Math.max(padX, innerWidth - padX), raw.x));
    const baseY = Math.max(54, Math.min(Math.max(54, innerHeight - 48), raw.y));
    const now = Date.now();
    for (let i = recentFloats.length - 1; i >= 0; i--) {
      if (now - recentFloats[i].t > 360) recentFloats.splice(i, 1);
    }
    let stack = 0;
    for (const f of recentFloats) {
      if (Math.abs(f.x - x) < 92 && Math.abs(f.y - baseY) < 76) stack++;
    }
    const dir = baseY < 132 ? 1 : -1;
    const y = Math.max(48, Math.min(Math.max(48, innerHeight - 42), baseY + dir * Math.min(stack, 4) * 26));
    recentFloats.push({ x, y: baseY, t: now });

    const active = layer.querySelectorAll('.pop-float');
    if (active.length >= 18) active[0].remove();

    const kind = normOpts.kind || 'score';
    const el = document.createElement('div');
    el.className = 'pop-float';
    el.dataset.kind = kind;
    if (normOpts.tone) el.dataset.tone = normOpts.tone;
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
    el.innerHTML = `<span class="pf-tag">${esc(normOpts.tag || '')}</span><b class="pf-main">${esc(normMain)}</b>`;
    layer.appendChild(el);
    if (kind === 'score') Sound.sfx.popupScore?.(normOpts.mult || 1);
    setTimeout(() => el.remove(), 1050);
    return el;
  }

  // Layer 2: Left-Edge Tactical Event & Medal Ticker (#eventFeed > .event-pill)
  function dismissPill(el) {
    if (!el || el.classList.contains('leaving')) return;
    clearTimeout(el._lt);
    clearTimeout(el._rt);
    el.classList.add('leaving');
    el._rt = setTimeout(() => el.remove(), 240);
  }

  function pill(ic, title, sub = '', tone = 'emerald', opts = {}) {
    const m = mode();
    if (m === 'off' || !feed || !title) return null;
    if (m === 'normal' && !opts.medal && !opts.always && tone !== 'danger') return null;
    const active = [...feed.querySelectorAll('.event-pill:not(.leaving)')];
    while (active.length >= 4) dismissPill(active.shift());

    const el = document.createElement('div');
    el.className = 'event-pill';
    el.dataset.tone = tone;
    el.innerHTML = `<span class="ep-ic">${esc(ic)}</span><div class="ep-body"><b class="ep-title">${esc(title)}</b><span class="ep-sub">${esc(sub)}</span></div>`;
    feed.appendChild(el);
    if (opts.medal) Sound.sfx.badgeUnlock?.();
    el._lt = setTimeout(() => dismissPill(el), 2080);
    return el;
  }

  function award(key, ic, title, sub = '', tone = 'amber') {
    if (!G) return null;
    if (!G.medals) G.medals = new Set();
    if (G.medals.has(key)) return null;
    G.medals.add(key);
    return pill(ic, title, sub, tone, { medal: true });
  }

  // Layer 3: Sub-HUD Kinetic Callout Banner (#calloutBanner)
  function banner(kicker, title, tone = 'emerald', major = false) {
    const m = mode();
    if (m === 'off' || !bannerEl || !title) return null;
    if (m === 'normal' && !major) return null;
    bannerEl.dataset.tone = tone;
    bannerEl.innerHTML = `<span class="cb-kicker">${esc(kicker)}</span><b class="cb-title">${esc(title)}</b>`;
    bannerEl.classList.remove('show');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
    Sound.sfx.bannerSlam?.();
    clearTimeout(bannerT);
    bannerT = setTimeout(() => bannerEl.classList.remove('show'), 1180);
    return bannerEl;
  }

  // Layer 4: Mini Companion Reaction Stamp (#popupLayer > .react-pop)
  function stamp(word, mood = 'wink', tone = 'emerald', major = false) {
    const m = mode();
    if (m === 'off' || !layer || !settings.mascot || !word) return null;
    if (m === 'normal' && !major) return null;
    const now = Date.now();
    if (!major && now - lastStampAt < 180) return null;
    lastStampAt = now;

    const c = Companion.c;
    const pack = STAMP_WORDS[c.key] || STAMP_WORDS[c.kind === 'cat' ? 'mochi' : 'sakura'];
    const label = (pack && pack[word]) || word;
    const face = Cast.faceHTML ? Cast.faceHTML(c.key, mood) : c.html('face', mood);

    clearTimeout(stampT);
    layer.querySelectorAll('.react-pop').forEach((n) => n.remove());

    const el = document.createElement('div');
    el.className = 'react-pop';
    el.dataset.tone = tone;
    el.dataset.partner = c.key;
    el.dataset.mood = mood;
    el.innerHTML = `<div class="rp-face">${face}</div><div class="rp-stamp"><span class="rp-kicker">${esc(c.name)}</span><b class="rp-word">${esc(label)}</b></div>`;
    layer.appendChild(el);
    Sound.sfx.reactStamp?.();
    stampT = setTimeout(() => { el.remove(); }, 1260);
    return el;
  }

  function clear() {
    clearTimeout(bannerT);
    clearTimeout(stampT);
    recentFloats.length = 0;
    if (layer) layer.innerHTML = '';
    if (feed) feed.innerHTML = '';
    if (bannerEl) bannerEl.classList.remove('show');
  }

  return { posOf, float, pill, award, banner, stamp, clear, STAMP_WORDS };
})();
