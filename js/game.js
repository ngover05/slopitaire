/* Slopitaire — kawaii Klondike solitaire. Game logic, rendering, input and UI. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const board = $('#board');

  // ---------------------------------------------------------------- storage
  const META_KEYS = new Set(['settings', 'stats', 'save']);
  const defaultMeta = () => ({ settingsUpdatedAt: 0, statsUpdatedAt: 0, saveUpdatedAt: 0, guestDelta: null, deltaId: null, pendingResetStats: false });
  const newDeltaId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10));

  const Store = {
    get(k, d) { try { const v = localStorage.getItem('slopitaire.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    getMeta() {
      const raw = Store.get('meta', null);
      return Object.assign(defaultMeta(), (raw && typeof raw === 'object') ? raw : null);
    },
    setMeta(m) {
      const next = Object.assign(defaultMeta(), (m && typeof m === 'object') ? m : null);
      try { localStorage.setItem('slopitaire.meta', JSON.stringify(next)); } catch (e) { /* storage unavailable */ }
      return next;
    },
    recordGuestStat(diff, field) {
      if (window.Account?.isSignedIn?.()) return;
      if (!DIFF[diff] || (field !== 'played' && field !== 'won')) return;
      const meta = Store.getMeta();
      if (!meta.deltaId) meta.deltaId = newDeltaId();
      if (!meta.guestDelta || typeof meta.guestDelta !== 'object') meta.guestDelta = {};
      if (!meta.guestDelta[diff] || typeof meta.guestDelta[diff] !== 'object') meta.guestDelta[diff] = { played: 0, won: 0 };
      meta.guestDelta[diff][field] = (Number(meta.guestDelta[diff][field]) || 0) + 1;
      Store.setMeta(meta);
    },
    set(k, v, opts) {
      try { localStorage.setItem('slopitaire.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
      if (!opts?.fromRemote && META_KEYS.has(k)) {
        const meta = Store.getMeta();
        meta[k + 'UpdatedAt'] = Date.now();
        if (opts?.resetStats) {
          meta.guestDelta = null;
          meta.deltaId = null;
          if (window.Account?.isSignedIn?.()) meta.pendingResetStats = true;
        }
        Store.setMeta(meta);
        window.Account?.onLocalChange?.(k, v, opts);
      }
    },
  };

  // ---------------------------------------------------------------- config
  const DIFF = {
    easy: {
      label: 'Easy', icon: '🌸', solvable: true, undo: true, undoCost: 0, hints: Infinity,
      passes: { 1: Infinity, 3: Infinity }, mult: 1, deals: 'gentle',
      desc: 'Gentle, always-winnable deals ♡ Unlimited undo, hints & redeals.',
    },
    medium: {
      label: 'Medium', icon: '⭐', solvable: false, undo: true, undoCost: 10, hints: 3,
      passes: { 1: 3, 3: Infinity }, mult: 1.5,
      desc: 'Random deals. Undo costs 10 pts, 3 hints. Draw-1 allows 3 passes.',
    },
    hard: {
      label: 'Hard', icon: '🔥', solvable: true, undo: false, undoCost: 0, hints: 0,
      passes: { 1: 1, 3: 3 }, mult: 2, deals: 'tricky',
      desc: 'Tricky winnable deals, no undo, no hints. 1 pass (draw-1) or 3 passes (draw-3).',
    },
    auto: {
      label: 'Auto', icon: '◈', solvable: true, undo: true, undoCost: 0, hints: Infinity,
      passes: { 1: Infinity, 3: Infinity }, mult: 1, autoPlay: true,
      desc: 'AI autopilot plays a winnable deal at a steady pace ◈',
    },
  };
  const DEFAULTS = {
    difficulty: 'medium', draw: 1,
    tapMove: true, autoFound: false, autoFinish: true, dropGuides: true, showStats: true, leftHanded: false,
    theme: 'prism', back: 'sakura', bgFx: true, popups: 'max', petals: true, anim: 'normal', mascot: true,
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
  function normalizeSettings(raw) {
    const next = Object.assign({}, DEFAULTS, (raw && typeof raw === 'object') ? raw : {});
    if (!DIFF[next.difficulty]) next.difficulty = 'medium';
    if (next.draw !== 1 && next.draw !== 3) next.draw = 1;
    if (!next.voiceNames || typeof next.voiceNames !== 'object') next.voiceNames = {};
    if (next.spriteMode !== 'corner' && next.spriteMode !== 'full') next.spriteMode = 'corner';
    delete next.voiceName;
    // game-end detection used to be on/off; it is now 'solver' (unwinnable), 'stuck' (no useful move left) or 'off'
    if (next.detectLoss === true) next.detectLoss = 'solver';
    else if (!['solver', 'stuck', 'off'].includes(next.detectLoss)) next.detectLoss = 'off';
    if (!VALID_THEMES.has(next.theme)) next.theme = 'prism';
    if (!VALID_MUSIC.has(next.music)) next.music = 'pulse';
    if (!VALID_POPUPS.has(next.popups)) next.popups = 'max';
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

  // companion events: [priority, default expression]. Priority decides who may interrupt whom.
  const EVENTS = {
    pick: [1, 'thinking'], draw: [1, 'normal'], place: [1, 'happy'],
    recycle: [2, 'thinking'], noRedeal: [2, 'sad'], reveal: [2, 'wink'],
    clearCol: [2, 'smug'], foundation: [2, 'happy'],
    aceFound: [2, 'cheer'], kingPlace: [2, 'smug'], multiMove: [2, 'hype'], fastPlay: [2, 'smug'],
    chain5: [2, 'smug'], musicChange: [2, 'cheer'], themeChange: [2, 'wink'],
    invalid: [2, 'oops'], undo: [2, 'wink'], undoBlocked: [2, 'sad'], hint: [2, 'wink'], hintNone: [2, 'sad'],
    idle: [2, 'thinking'], settings: [2, 'wink'],
    combo: [3, 'hype'], chain10: [3, 'cheer'], chain20: [3, 'hype'], chainBreak: [3, 'shock'],
    clutch: [3, 'smug'], halfway: [3, 'cheer'], almostWon: [3, 'hype'],
    suitDone: [3, 'cheer'], noMoves: [3, 'sad'], autoFinish: [3, 'hype'], pet: [3, 'cheer'],
    touchHead: [3, 'happy'], touchFace: [3, 'wink'], touchHands: [3, 'cheer'],
    touchTorso: [3, 'oops'], touchLegs: [3, 'shock'],
    chain30: [4, 'hype'],
    start: [4, 'happy'], startEasy: [4, 'wink'], restart: [4, 'wink'], welcome: [4, 'happy'],
    win: [4, 'cheer'], hello: [4, 'wink'], lost: [4, 'sad'],
  };

  // ---------------------------------------------------------------- cards & slots
  const SUIT_NAMES = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
  const SUIT_SYMS = ['♥', '♦', '♣', '♠'];
  const cards = Array.from({ length: 52 }, (_, id) => ({
    id, suit: (id / 13) | 0, rank: (id % 13) + 1, red: ((id / 13) | 0) < 2,
    up: false, el: null, x: null, y: null, z: 0, zt: null, pile: null, idx: 0,
    _rx: null, _ry: null, _rz: null, _rup: false,
  }));
  const slots = { stock: null, waste: null, found: [], tab: [] };
  const DOM = {
    comboHud: $('#comboHud'),
    comboCount: $('#comboCount'),
    comboTier: $('#comboTier'),
    comboMult: $('#comboMult'),
    comboFill: $('#comboFill'),
    chipDiff: $('#chipDiff'),
    chipDraw: $('#chipDraw'),
    moves: $('#moves'),
    score: $('#score'),
    passes: $('#passes'),
    chipDeal: $('#chipDeal'),
    time: $('#time'),
    btnUndo: $('#btnUndo'),
    btnHint: $('#btnHint'),
    hintBadge: $('#hintBadge'),
    btnAutoFinish: $('#btnAutoFinish'),
    shuffleNote: $('#shuffleNote'),
    soundIc: $('#soundIc'),
    toast: $('#toast'),
    cutin: $('#cutin'),
    mascot: $('#mascot'),
    startMascot: $('#startMascot'),
    winMascot: $('#winMascot'),
    loseMascot: $('#loseMascot'),
    startScreen: $('#startScreen'),
    settingsModal: $('#settingsModal'),
    winModal: $('#winModal'),
    loseModal: $('#loseModal'),
    confirmModal: $('#confirmModal'),
    btnContinue: $('#btnContinue'),
    btnSpriteMode: $('#btnSpriteMode'),
    settingsNote: $('#settingsNote'),
    winFinalScore: $('#winFinalScore'),
    winSub: $('#winSub'),
    winStats: $('#winStats'),
    winKicker: $('#winKicker'),
    winGrade: $('#winGrade'),
    winRecords: $('#winRecords'),
    winPartnerName: $('#winPartnerName'),
    winQuote: $('#winQuote'),
    loseKicker: $('#loseKicker'),
    losePartnerName: $('#losePartnerName'),
    loseQuote: $('#loseQuote'),
    loseSub: $('#loseSub'),
    loseProgText: $('#loseProgText'),
    loseProgFill: $('#loseProgFill'),
    loseStats: $('#loseStats'),
    loseActions: $('#loseActions'),
  };
  const OVERLAYS = {
    startScreen: DOM.startScreen,
    settingsModal: DOM.settingsModal,
    winModal: DOM.winModal,
    loseModal: DOM.loseModal,
    confirmModal: DOM.confirmModal,
  };

  function mkSlot(kind, i, label) {
    const s = document.createElement('div');
    s.className = 'slot slot-' + kind; s.dataset.kind = kind; s.dataset.i = i;
    s.innerHTML = `<span class="slot-ic">${label}</span>`;
    board.appendChild(s);
    return s;
  }
  function buildTable() {
    slots.stock = mkSlot('stock', 0, '↻');
    slots.waste = mkSlot('waste', 0, '');
    for (let i = 0; i < 4; i++) slots.found.push(mkSlot('found', i, 'A'));
    for (let i = 0; i < 7; i++) slots.tab.push(mkSlot('tab', i, 'K'));
    cards.forEach((c) => {
      const el = document.createElement('div');
      el.className = 'card'; el.dataset.id = c.id;
      el.setAttribute('aria-label', Art.RANKS[c.rank - 1] + ' of ' + SUIT_NAMES[c.suit]);
      el.innerHTML = `<div class="card-inner"><div class="card-face front">${Art.cardFace(c)}</div><div class="card-face back"></div></div>`;
      board.appendChild(el);
      c.el = el;
    });
  }

  // ---------------------------------------------------------------- deck / rng
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randSeed = () => (1 + Math.random() * 999998) | 0;
  function shuffledDeck(seed) {
    const r = rng(seed), d = [...Array(52).keys()];
    for (let i = 51; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }

  // ---------------------------------------------------------------- state
  let G = null;          // current game
  let StageBG = null;    // dynamic Prism stage renderer
  let PopupFX = null;    // 4-layer Hyper Pop-Up FX engine
  let busy = false;      // dealing / auto-finishing
  let dealToken = 0;
  let autoT = null, finishT = null, hintT = null, breakT = null;
  const AUTO_STEP_MS = 580;
  const SWAP_LIMIT = 3;   // tableau shuffles of one card (without revealing anything) before the combo is killed
  let autoStepT = null, autoQueue = [], autoPaused = false, gameStepSeq = 0, autoLastSeq = 0;
  const autoVisited = new Set();

  function newState(difficulty, draw, deck, seed, verified) {
    const prevBest = (Store.get('stats', {})?.[difficulty]?.bestScore) || 0;
    return {
      difficulty, draw, deck, seed, verified,
      stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []],
      wasteFan: 0, score: 0, moves: 0, passes: 1, elapsed: 0, started: false, won: false,
      history: [], hintsLeft: DIFF[difficulty].hints, hintIdx: 0,
      chain: 0, maxChain: 0, chainUntil: 0, chainDur: 9500, lastMoveAt: 0,
      warnedChain: false, halfwaySaid: false, almostSaid: false, combo: 0, lastFoundT: 0, swaps: {},
      medals: new Set(), dealFirstMoveAt: 0, openerMoves: 0, prevBestScore: prevBest,
      homed: new Set(),  // cards that already scored a foundation placement this deal
    };
  }

  function tierOf(combo) {
    if (combo >= 30) return { tier: 4, label: 'APEX!', mult: 3.0 };
    if (combo >= 20) return { tier: 3, label: 'BLITZ', mult: 2.0 };
    if (combo >= 10) return { tier: 2, label: 'BOOST', mult: 1.5 };
    if (combo >= 5) return { tier: 1, label: 'SURGE', mult: 1.2 };
    return { tier: 0, label: combo > 0 ? 'ACTIVE' : 'IDLE', mult: 1.0 };
  }

  function syncComboHud(pulse = false) {
    const ch = G ? G.chain : 0;
    const { tier, label, mult } = tierOf(ch);
    const hud = DOM.comboHud;
    if (hud) {
      DOM.comboCount.textContent = String(ch).padStart(3, '0');
      DOM.comboTier.textContent = label;
      DOM.comboMult.textContent = '×' + mult.toFixed(1);
      hud.dataset.tier = String(tier);
      if (!G || ch === 0 || !G.warnedChain) hud.classList.remove('danger');
      if (pulse) {
        hud.classList.remove('break', 'pulse');
        void hud.offsetWidth;
        hud.classList.add('pulse');
      }
      const fill = DOM.comboFill;
      if (fill) {
        if (G && G.won && ch > 0) {
          fill.style.transform = 'scaleX(1)';
        } else if (G && ch > 0 && G.chainDur > 0) {
          const ratio = Math.max(0, Math.min(1, (G.chainUntil - Date.now()) / G.chainDur));
          fill.style.transform = `scaleX(${ratio.toFixed(3)})`;
        } else {
          fill.style.transform = 'scaleX(0)';
        }
      }
    }
    document.body.dataset.comboTier = String(tier);
    document.body.dataset.chainTier = String(tier);
    Sound.setIntensity?.(tier);
    StageBG?.ensureLoop();
  }

  function breakChain(reason = 'timeout') {
    if (!G || G.chain <= 0) return;
    const old = G.chain;
    G.chain = 0;
    G.chainUntil = 0;
    G.warnedChain = false;
    G.combo = 0;
    syncComboHud(false);
    const hud = DOM.comboHud;
    if (hud) {
      hud.classList.remove('pulse', 'danger', 'break');
      void hud.offsetWidth;
      hud.classList.add('break');
      clearTimeout(breakT);
      breakT = setTimeout(() => hud.classList.remove('break'), 520);
    }
    if (old >= 4) {
      PopupFX?.pill('✕', 'COMBO RESET', `LOST ×${old} STREAK`, 'danger');
    }
    if (old >= 5) {
      (Sound.sfx.comboBreak || Sound.sfx.chainBreak)?.(old);
      Companion.react('chainBreak');
      PopupFX?.banner('STREAK BROKEN', 'COMBO RESET', 'danger', true);
      PopupFX?.stamp('OOPS!', 'shock', 'amber', true);
    }
    StageBG?.pulse('#ff6b57', old >= 10 ? 0.85 : 0.45);
    return reason;
  }
  function pileOf(ref) {
    switch (ref.t) {
      case 'stock': return G.stock;
      case 'waste': return G.waste;
      case 'found': return G.found[ref.i];
      default: return G.tab[ref.i];
    }
  }
  const passLimit = () => DIFF[G.difficulty].passes[G.draw];
  const canRecycle = () => G.passes < passLimit();

  function snap() {
    const ids = (p) => p.map((c) => c.id);
    return {
      stock: ids(G.stock), waste: ids(G.waste), found: G.found.map(ids), tab: G.tab.map(ids),
      up: cards.filter((c) => c.up).map((c) => c.id),
      score: G.score, moves: G.moves, passes: G.passes, wasteFan: G.wasteFan,
      homed: [...G.homed],
    };
  }
  function restore(s) {
    const cs = (a) => a.map((id) => cards[id]);
    G.stock = cs(s.stock); G.waste = cs(s.waste); G.found = s.found.map(cs); G.tab = s.tab.map(cs);
    cards.forEach((c) => { c.up = false; });
    s.up.forEach((id) => { cards[id].up = true; });
    G.score = s.score; G.moves = s.moves; G.passes = s.passes; G.wasteFan = s.wasteFan;
    // older saves have no list: every card currently on a foundation has scored
    G.homed = new Set(Array.isArray(s.homed) ? s.homed : s.found.flat());
  }
  function pushHistory() {
    G.history.push(snap());
    if (G.history.length > 400) G.history.shift();
  }

  // ---------------------------------------------------------------- layout
  let M = {}, layoutDirty = true, slotsDirty = true, lastMeasW = -1, lastMeasH = -1, lastLeftHanded = null;
  function measure(force) {
    if (!force && !layoutDirty && M.W > 0 && M.H > 0) return false;
    const W = board.clientWidth, H = board.clientHeight;
    layoutDirty = false;
    const br = board.getBoundingClientRect();
    if (W === lastMeasW && H === lastMeasH && M.cw) {
      M.boardLeft = br.left;
      M.boardTop = br.top;
      return false;
    }
    lastMeasW = W; lastMeasH = H;
    const narrow = W < 600, gr = narrow ? 0.08 : 0.14;
    let cw = Math.min(W / (7 + 8 * gr), H / 5.5, 116);
    cw = Math.max(cw, 28);
    const ch = cw * 1.4, gap = cw * gr;
    const tall = H > W * 1.2;
    const topY = Math.max(gap, 6);
    const tabY = topY + ch + Math.max(gap * 1.8, 10);
    const upF = tall ? 0.32 : 0.27;
    M = {
      W, H, cw, ch, gap, offX: (W - (7 * cw + 6 * gap)) / 2, topY, tabY, upF,
      downGap: ch * 0.11, upGap: ch * upF, cardH: ch,
      boardLeft: br.left, boardTop: br.top,
    };
    board.style.setProperty('--cw', cw + 'px');
    board.style.setProperty('--ch', ch + 'px');
    slotsDirty = true;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      c._rx = null; c._ry = null; c._rz = null; c._rup = null;
    }
    return true;
  }
  const colX = (i) => M.offX + i * (M.cw + M.gap);
  function slotCol(kind, i) {
    const L = settings.leftHanded;
    if (kind === 'stock') return L ? 6 : 0;
    if (kind === 'waste') return L ? 5 : 1;
    if (kind === 'found') return L ? i : 3 + i;
    return i;
  }
  function slotEl(ref) {
    if (ref.t === 'found') return slots.found[ref.i];
    if (ref.t === 'tab') return slots.tab[ref.i];
    return slots[ref.t];
  }
  function placeSlot(el, x, y) {
    if (el._rx === x && el._ry === y) return;
    el._rx = x; el._ry = y;
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
  }

  function place(c, x, y, z, ref, idx, inst) {
    c.pile = ref; c.idx = idx;
    if (c._rup !== c.up) {
      c._rup = c.up;
      c.el.classList.toggle('up', c.up);
    }
    const moved = c.x !== null && (Math.abs(c.x - x) > 0.5 || Math.abs(c.y - y) > 0.5);
    c.x = x; c.y = y; c.z = z;
    if (c._rx !== x || c._ry !== y) {
      c._rx = x; c._ry = y;
      c.el.style.transform = `translate3d(${x}px,${y}px,0)`;
    }
    if (moved && !inst && moveMs() > 0) {
      const topZ = 4000 + z;
      if (c._rz !== topZ) {
        c._rz = topZ;
        c.el.style.zIndex = topZ;
      }
      clearTimeout(c.zt);
      c.zt = setTimeout(() => {
        c.zt = null;
        if (c._rz !== c.z) {
          c._rz = c.z;
          c.el.style.zIndex = c.z;
        }
      }, moveMs() + 90);
    } else if (!c.zt && c._rz !== z) {
      c._rz = z;
      c.el.style.zIndex = z;
    }
  }

  function layout(opts = {}) {
    if (!G) return;
    measure(!!opts.remeasure);
    const inst = !!opts.instant;
    if (inst) board.classList.add('no-anim');
    const { cw, ch, topY, tabY, gap, H } = M;

    const sx = colX(slotCol('stock')), wx = colX(slotCol('waste'));
    if (slotsDirty || lastLeftHanded !== settings.leftHanded) {
      lastLeftHanded = settings.leftHanded;
      slotsDirty = false;
      placeSlot(slots.stock, sx, topY);
      placeSlot(slots.waste, wx, topY);
      for (let i = 0; i < 4; i++) placeSlot(slots.found[i], colX(slotCol('found', i)), topY);
      for (let i = 0; i < 7; i++) placeSlot(slots.tab[i], colX(i), tabY);
    }

    const thick = (j) => Math.floor(j / 8) * 0.8;
    G.stock.forEach((c, j) => place(c, sx - thick(j), topY - thick(j), 10 + j, { t: 'stock', i: 0 }, j, inst));

    const n = G.waste.length, fan = G.draw === 3 ? Math.min(G.wasteFan, n, 3) : 1;
    const dir = settings.leftHanded ? -1 : 1;
    G.waste.forEach((c, j) => {
      const k = j - (n - fan);
      place(c, wx + (k > 0 ? k * cw * 0.3 * dir : 0), topY, 60 + j, { t: 'waste', i: 0 }, j, inst);
    });

    G.found.forEach((p, i) => {
      const fx = colX(slotCol('found', i));
      p.forEach((c, j) => place(c, fx, topY, 120 + j, { t: 'found', i }, j, inst));
    });

    const downOff = ch * 0.11, upOff = ch * M.upF;
    G.tab.forEach((p, i) => {
      let total = 0;
      for (let j = 0; j < p.length - 1; j++) total += p[j].up ? upOff : downOff;
      const avail = H - tabY - gap - ch;
      const s = total > avail && total > 0 ? Math.max(0.2, avail / total) : 1;
      let y = tabY;
      p.forEach((c, j) => {
        place(c, colX(i), y, 200 + j, { t: 'tab', i }, j, inst);
        y += (c.up ? upOff : downOff) * s;
      });
    });

    if (inst) { void board.offsetHeight; board.classList.remove('no-anim'); }
    updateStockSlot();
    updatePeek();
  }

  function updateStockSlot() {
    if (!G) return;
    const dead = !G.stock.length && !canRecycle();
    slots.stock.classList.toggle('dead', dead);
    slots.stock.firstChild.textContent = dead ? '✕' : '↻';
  }

  // ---------------------------------------------------------------- rules
  function canDrop(mov, ref) {
    const c = mov[0];
    if (ref.t === 'found') {
      if (mov.length !== 1) return false;
      const p = G.found[ref.i];
      if (!p.length) return c.rank === 1;
      const top = p[p.length - 1];
      return top.suit === c.suit && top.rank === c.rank - 1;
    }
    if (ref.t === 'tab') {
      const p = G.tab[ref.i];
      if (!p.length) return c.rank === 13;
      const top = p[p.length - 1];
      return top.up && top.red !== c.red && top.rank === c.rank + 1;
    }
    return false;
  }
  function movableFrom(c) {
    const ref = c.pile; if (!ref || !c.up) return null;
    const p = pileOf(ref);
    if (ref.t === 'tab') {
      const seq = p.slice(c.idx);
      for (let k = 1; k < seq.length; k++) {
        if (!seq[k].up || seq[k].red === seq[k - 1].red || seq[k].rank !== seq[k - 1].rank - 1) return null;
      }
      return seq;
    }
    if ((ref.t === 'waste' || ref.t === 'found') && c.idx === p.length - 1) return [c];
    return null;
  }
  function foundTarget(c) {
    for (let i = 0; i < 4; i++) if (canDrop([c], { t: 'found', i })) return { t: 'found', i };
    return null;
  }
  function bestTarget(mov, src) {
    if (mov.length === 1 && src.t !== 'found') { const f = foundTarget(mov[0]); if (f) return f; }
    let empty = null;
    for (let i = 0; i < 7; i++) {
      if (src.t === 'tab' && src.i === i) continue;
      if (!canDrop(mov, { t: 'tab', i })) continue;
      if (G.tab[i].length) return { t: 'tab', i };
      if (empty === null) empty = i;
    }
    if (empty !== null && !(src.t === 'tab' && mov[0].idx === 0)) return { t: 'tab', i: empty };
    return null;
  }
  function foundRankOfSuit(s) {
    for (const p of G.found) if (p.length && p[0].suit === s) return p.length;
    return 0;
  }
  function safeToFound(c) {
    if (c.rank <= 2) return true;
    const opp = c.red ? [2, 3] : [0, 1];
    return opp.every((s) => foundRankOfSuit(s) >= c.rank - 1);
  }
  function autoFoundStep(onlySafe) {
    const cand = [];
    if (G.waste.length) cand.push({ c: G.waste[G.waste.length - 1], src: { t: 'waste', i: 0 }, idx: G.waste.length - 1 });
    G.tab.forEach((p, i) => { if (p.length) cand.push({ c: p[p.length - 1], src: { t: 'tab', i }, idx: p.length - 1 }); });
    cand.sort((a, b) => a.c.rank - b.c.rank);
    for (const k of cand) {
      if (onlySafe && !safeToFound(k.c)) continue;
      const d = foundTarget(k.c);
      if (d) return { src: k.src, idx: k.idx, dst: d };
    }
    return null;
  }

  // ---------------------------------------------------------------- actions
  function startClock() {
    if (G.started) return;
    G.started = true;
    const st = getStats(); st[G.difficulty].played++;
    Store.recordGuestStat(G.difficulty, 'played');
    Store.set('stats', st);
  }

  function moveCards(src, idx, dst, opts = {}) {
    if (opts.record !== false) pushHistory();
    clearHints(); G.hintIdx = 0;
    const sp = pileOf(src), dp = pileOf(dst);
    const dpWasEmpty = dp.length === 0;
    const mov = sp.splice(idx);
    dp.push(...mov);
    if (src.t === 'waste') G.wasteFan = Math.max(G.waste.length ? 1 : 0, G.wasteFan - 1);

    const now = Date.now();
    const retreating = src.t === 'found' && dst.t === 'tab';
    // A card pulled back off a foundation and sent home again already scored once. Without this, the round trip
    // (-15, then +10 × combo multiplier) gains points at ×2.0 and above and pumps the combo for free.
    const reHome = dst.t === 'found' && src.t !== 'found' && G.homed.has(mov[0].id);
    const prevChain = G.chain;
    const dtPrev = G.lastMoveAt > 0 ? now - G.lastMoveAt : 0;
    // Anti-farming: shuffling a card between tableau piles without turning anything face-up would pump the combo
    // for free. Each such move is counted per card; past SWAP_LIMIT the combo dies and further shuffles add nothing.
    // Real progress (a face-down card turned up, or a card sent home) clears the counts.
    let swapSpam = false;
    if (!opts.auto && G.difficulty !== 'auto' && src.t === 'tab' && dst.t === 'tab') {
      if (sp.length && !sp[sp.length - 1].up) G.swaps = {};
      else {
        G.swaps = G.swaps || {};
        const n = (G.swaps[mov[0].id] = (G.swaps[mov[0].id] || 0) + 1);
        swapSpam = n > SWAP_LIMIT;
      }
    } else if (dst.t === 'found' && !retreating && !reHome) G.swaps = {};
    let remRatio = 0, wasClutch = false, wasClutchPop = false, wasFast = false;
    if (swapSpam) {
      if (G.chain > 0) breakChain('swap');
      PopupFX?.float(mov[0].el, '✕ CARD SHUFFLE', { kind: 'warn', tag: 'NO COMBO', important: true });
    } else if (!opts.auto && !retreating && !reHome) {
      remRatio = G.chain > 0 && G.chainDur > 0 ? (G.chainUntil - now) / G.chainDur : 0;
      wasClutch = G.chain >= 5 && remRatio > 0 && remRatio < 0.22;
      wasClutchPop = prevChain >= 3 && remRatio > 0 && remRatio < 0.28;
      wasFast = dtPrev > 0 && dtPrev < 1450 && G.chain >= 2;
      const gain = dst.t === 'found' && mov[0].rank === 13 ? 2 : 1;
      G.chain += gain;
      if (G.chain > G.maxChain) G.maxChain = G.chain;
      G.chainDur = Math.max(5500, 9500 - Math.min(G.chain, 30) * 100);
      G.chainUntil = now + G.chainDur;
      G.warnedChain = false;
      G.lastMoveAt = now;
      if (!G.dealFirstMoveAt) G.dealFirstMoveAt = now;
      G.openerMoves = (G.openerMoves || 0) + 1;
      syncComboHud(true);
      Sound.sfx.comboTick?.(G.chain);
      if (wasClutch || wasClutchPop) Sound.sfx.comboSave?.();
    }

    const { mult } = tierOf(G.chain);
    let movePts = 0, flipPts = 0;
    if (dst.t === 'found' && src.t !== 'found') {
      if (!reHome) { movePts = Math.round(10 * mult); G.score += movePts; G.homed.add(mov[0].id); }
    } else if (src.t === 'waste' && dst.t === 'tab') { movePts = Math.round(5 * mult); G.score += movePts; }
    else if (retreating) G.score = Math.max(0, G.score - 15);
    let flipped = false, flippedRank = 1;
    if (src.t === 'tab' && sp.length && !sp[sp.length - 1].up) {
      sp[sp.length - 1].up = true;
      flippedRank = sp[sp.length - 1].rank;
      flipPts = Math.round(5 * mult);
      G.score += flipPts;
      flipped = true;
    }

    const suitCompleted = dst.t === 'found' && mov[0].rank === 13 && src.t !== 'found' && !reHome;
    const acePlaced = dst.t === 'found' && mov[0].rank === 1 && src.t !== 'found' && !reHome;
    const kingLocked = dst.t === 'tab' && dpWasEmpty && mov[0].rank === 13 && !retreating;
    const clearedCol = src.t === 'tab' && !sp.length;

    G.moves++;
    gameStepSeq++;
    startClock();
    layout();

    if (dst.t === 'found') {
      Sound.sfx.foundation(mov[0].rank, G.chain);
      if (acePlaced && !opts.auto) Sound.sfx.aceIgnition?.();
      StageBG?.pulse(mov[0].red ? '#ffb638' : '#2ce8a2', suitCompleted ? 1.0 : 0.65);
      setTimeout(() => sparkleAt(slotEl(dst)), moveMs() * 0.8);
    } else {
      if (mov.length >= 2 && Sound.sfx.multiPlace) Sound.sfx.multiPlace(mov.length, G.chain);
      else Sound.sfx.place(G.chain);
      if (kingLocked && !opts.auto) Sound.sfx.kingLock?.();
      StageBG?.pulse(null, 0.28);
    }
    if (flipped) {
      setTimeout(() => {
        if (Sound.sfx.revealCard) Sound.sfx.revealCard(flippedRank);
        else Sound.sfx.flip();
      }, 90);
    }
    if (suitCompleted && !opts.auto) Sound.sfx.suitDone?.();
    if (clearedCol && !opts.auto) Sound.sfx.clearCol?.();

    // 4-Layer Arcade Pop-Up FX triggers
    const dstEl = mov[0]?.el || slotEl(dst);
    const srcEl = sp.length ? sp[sp.length - 1].el : slotEl(src);
    if (movePts > 0 && (!opts.auto || G.moves % 2 === 0)) {
      const sLbl = mult > 1 ? `+${movePts} ×${mult.toFixed(1)}` : `+${movePts}`;
      PopupFX?.float(dstEl, sLbl, {
        kind: 'score',
        tag: dst.t === 'found' ? 'FOUNDATION' : 'SCORE',
        important: !opts.auto && (mult >= 1.5 || dst.t === 'found'),
        mult,
      });
    }
    if (!opts.auto) {
      const sym = SUIT_SYMS[mov[0].suit];
      if (acePlaced) {
        PopupFX?.float(dstEl, `◈ ACE ONLINE! ${sym}`, { kind: 'ace', tag: SUIT_NAMES[mov[0].suit].toUpperCase(), important: true });
      } else if (dst.t === 'found' && src.t !== 'found' && !reHome) {
        if (mov[0].rank === 13) PopupFX?.float(dstEl, `★ SUIT COMPLETE! ${sym}`, { kind: 'ace', tag: '13 / 13', important: true });
        else if (mov[0].rank >= 11) PopupFX?.float(dstEl, `ROYAL LOCK! ${sym}`, { kind: 'ace', tag: mov[0].rank === 11 ? 'JACK' : 'QUEEN', important: true });
        else if (mov[0].rank === 7) PopupFX?.float(dstEl, `HALF SUIT! ${sym}`, { kind: 'ace', tag: '7 / 13', important: true });
      }
      if (kingLocked) PopupFX?.float(dstEl, '♛ KING ANCHOR!', { kind: 'king', tag: 'EMPTY COL', important: true });
      if (mov.length >= 2) {
        PopupFX?.float(dstEl, mov.length >= 5 ? `MEGA STACK ×${mov.length}!` : `STACK ×${mov.length}!`, {
          kind: 'stack', tag: 'TRANSFER', important: mov.length >= 3,
        });
      }
      if (flipped) {
        const fMain = flippedRank === 1 ? 'ACE REVEALED!' : flippedRank >= 11 ? 'ROYAL FLIP!' : `FLIP! +${flipPts}`;
        const fTag = flippedRank === 1 || flippedRank >= 11 ? `+${flipPts}` : 'REVEAL';
        PopupFX?.float(srcEl, fMain, { kind: 'flip', tag: fTag, important: true });
      }
      if (clearedCol) PopupFX?.float(slotEl(src), '⚡ COLUMN CLEAR!', { kind: 'clear', tag: 'OPEN LANE', important: true });
      if (wasClutchPop) {
        PopupFX?.float(dstEl, '🔥 CLUTCH SAVE!', { kind: 'clutch', tag: `${Math.max(1, Math.round(remRatio * 100))}% LEFT`, important: true });
      } else if (!retreating && dtPrev > 0 && dtPrev < 1800 && G.chain >= 2) {
        const spLbl = dtPrev < 650 ? '⚡ BLITZ SPEED!' : dtPrev < 1150 ? '⚡ SNAP!' : '⚡ QUICK!';
        PopupFX?.float(dstEl, spLbl, { kind: 'speed', tag: `${(dtPrev / 1000).toFixed(1)}s`, important: dtPrev < 950 });
      }
    }

    const totalFound = G.found.reduce((s, p) => s + p.length, 0);
    if (totalFound >= 1) PopupFX?.award('found1', '◈', 'FIRST FOUNDATION', '1 / 52 ARCHIVED', 'emerald');
    if (totalFound >= 13) PopupFX?.award('found13', '◈', '25% CLEARED (13/52)', 'QUARTER DECK HOME', 'emerald');
    if (totalFound >= 26) PopupFX?.award('found26', '⚡', 'HALFWAY THERE (26/52)', '50% DECK ARCHIVED', 'amber');
    if (totalFound >= 39) PopupFX?.award('found39', '🔥', 'FINAL STRETCH (39/52)', '75% DECK ARCHIVED', 'gold');
    for (const ms of [250, 500, 1000, 2500, 5000]) {
      if (G.score >= ms) PopupFX?.award('score_' + ms, '★', 'SCORE MILESTONE', `${ms.toLocaleString()} PTS`, ms >= 1000 ? 'gold' : 'amber');
    }
    if (G.prevBestScore > 0 && G.score > G.prevBestScore) {
      PopupFX?.award('newBest', '👑', 'NEW BEST SCORE!', `${G.score} PTS RECORD`, 'gold');
    }

    if (!opts.auto) {
      if (G.openerMoves === 3 && G.dealFirstMoveAt && now - G.dealFirstMoveAt < 6000) {
        PopupFX?.award('lightningOpener', '⚡', 'LIGHTNING OPENER', '3 MOVES IN <6S', 'amber');
      }
      if (mov.length >= 5) PopupFX?.award('fullStack', '❖', 'FULL STACK TRANSFER', `${mov.length} CARDS AT ONCE`, 'violet');
      if (flipped && src.t === 'tab' && sp.every((c) => c.up)) {
        PopupFX?.award('colUnlock_' + src.i, '🔓', 'COLUMN UNLOCKED', `LANE ${src.i + 1} UNLOCKED`, 'emerald');
      }
      if (G.tab.filter((p) => p.length && p[0].up && p[0].rank === 13).length >= 4) {
        PopupFX?.award('fourKings', '♛', 'FOUR KINGS ANCHORED', 'ROYAL QUAD FORMATION', 'gold');
      }

      if (dst.t === 'found' && !reHome) {
        G.combo = now - (G.lastFoundT || 0) < 4500 ? (G.combo || 0) + 1 : 1;
        G.lastFoundT = now;
      } else G.combo = 0;

      const willWin = G.found.every((p) => p.length === 13);
      const crossed = (m) => prevChain < m && G.chain >= m;
      const crossedHigh = G.chain >= 30 && (crossed(30) || (prevChain >= 30 && Math.floor((G.chain - 30) / 15) > Math.floor((prevChain - 30) / 15)));
      let milestoneFired = false;

      if (!retreating && !reHome) {
        if (crossedHigh) {
          milestoneFired = true;
          (Sound.sfx.comboMilestone || Sound.sfx.chainMilestone)?.(4);
          StageBG?.pulse('#ffe169', 1.2);
          PopupFX?.pill('★', 'APEX! ×3.0', `${G.chain} HIT STREAK`, 'gold', { medal: true });
          if (!willWin) { Companion.react('chain30'); cutIn(`APEX COMBO ×${G.chain}!!`); }
        } else if (crossed(25)) {
          PopupFX?.pill('🔥', '25 HIT STREAK', 'APPROACHING APEX', 'gold', { medal: true });
        } else if (crossed(20)) {
          milestoneFired = true;
          (Sound.sfx.comboMilestone || Sound.sfx.chainMilestone)?.(3);
          StageBG?.pulse('#ffb638', 1.0);
          PopupFX?.pill('🔥', 'BLITZ ×2.0', '20 HIT STREAK', 'gold', { medal: true });
          if (!willWin) { Companion.react('chain20'); cutIn(`BLITZ ×${G.chain}!`); }
        } else if (crossed(15)) {
          PopupFX?.pill('⚡', '15 HIT STREAK', 'BOOST SUSTAINED', 'amber', { medal: true });
        } else if (crossed(10)) {
          milestoneFired = true;
          (Sound.sfx.comboMilestone || Sound.sfx.chainMilestone)?.(2);
          StageBG?.pulse('#2ce8a2', 0.9);
          PopupFX?.pill('⚡', 'BOOST ×1.5', '10 HIT STREAK', 'amber', { medal: true });
          if (!willWin) { Companion.react('chain10'); cutIn(`BOOST ×${G.chain}!`); }
        } else if (crossed(5)) {
          milestoneFired = true;
          (Sound.sfx.comboMilestone || Sound.sfx.chainMilestone)?.(1);
          StageBG?.pulse('#2ce8a2', 0.7);
          PopupFX?.pill('◈', 'SURGE ×1.2', '5 HIT STREAK', 'emerald', { medal: true });
          if (!willWin) Companion.react('chain5');
        }
      }

      const hitAlmost = !willWin && totalFound >= 44 && !G.almostSaid;
      const hitHalfway = !willWin && totalFound >= 26 && totalFound < 44 && !G.halfwaySaid;
      const hitStretch = !willWin && dst.t === 'found' && totalFound === 39;
      if (hitAlmost) { G.almostSaid = true; Sound.sfx.almostWon?.(); }
      else if (hitHalfway) { G.halfwaySaid = true; Sound.sfx.halfway?.(); }

      if (!willWin) {
        // Layer 3: Sub-HUD Kinetic Callout Banner
        if (suitCompleted) PopupFX?.banner('13 / 13 HARMONIZED', 'SUIT COMPLETE', 'gold', true);
        else if (crossedHigh) PopupFX?.banner('APEX MULTIPLIER ×3.0', `${G.chain}x COMBO`, 'gold', true);
        else if (crossed(20)) PopupFX?.banner('BLITZ MULTIPLIER ×2.0', '20x COMBO', 'gold', true);
        else if (crossed(15)) PopupFX?.banner('BOOST SUSTAINED', '15x COMBO', 'amber', false);
        else if (crossed(10)) PopupFX?.banner('BOOST MULTIPLIER ×1.5', '10x COMBO', 'amber', true);
        else if (crossed(5)) PopupFX?.banner('SURGE MULTIPLIER ×1.2', '5x COMBO', 'emerald', false);
        else if (hitStretch || hitAlmost) PopupFX?.banner('ENDGAME CONVERGENCE', 'FINAL STRETCH', 'gold', true);
        else if (hitHalfway) PopupFX?.banner('26 / 52 ARCHIVED', 'HALFWAY', 'amber', true);
        else if (wasClutchPop) PopupFX?.banner('LAST-SECOND EXTENSION', 'CLUTCH SAVE', 'amber', true);
        else if (mov.length >= 5) PopupFX?.banner(`${mov.length}-CARD SEQUENCE`, 'MEGA STACK', 'gold', true);
        else if (acePlaced) PopupFX?.banner('FOUNDATION IGNITED', 'ACE ONLINE', 'emerald', false);
        else if (clearedCol) PopupFX?.banner('TABLEAU LANE OPEN', 'COLUMN CLEAR', 'emerald', false);
        else if (kingLocked) PopupFX?.banner('COLUMN SECURED', 'KING ANCHOR', 'amber', false);

        // Layer 4: Mini Companion Reaction Stamp
        if (crossedHigh) PopupFX?.stamp('UNREAL!', 'hype', 'gold', true);
        else if (crossed(20) || suitCompleted || hitAlmost) PopupFX?.stamp("LET'S GO!", 'cheer', 'gold', true);
        else if (crossed(10) || hitHalfway) PopupFX?.stamp('LOCKED IN!', 'hype', 'amber', true);
        else if (wasClutchPop || wasClutch) PopupFX?.stamp('CLUTCH!', 'smug', 'amber', true);
        else if (crossed(5) || acePlaced) PopupFX?.stamp('NICE!', 'cheer', 'emerald', false);
        else if (mov.length >= 4) PopupFX?.stamp('GENIUS!', 'smug', 'gold', false);
        else if (clearedCol || kingLocked) PopupFX?.stamp('CLEAN!', 'smug', 'emerald', false);
        else if (wasFast) PopupFX?.stamp('SO FAST!', 'hype', 'emerald', false);
        else if (flipped && (flippedRank === 1 || flippedRank >= 12)) PopupFX?.stamp('WHOA!', 'wink', 'amber', false);
      }

      if (willWin) {
        /* win() reacts */
      } else if (milestoneFired) {
        if (suitCompleted && G.chain < 10) cutIn('SUIT COMPLETE!');
      } else if (suitCompleted) {
        Companion.react('suitDone');
        cutIn('SUIT COMPLETE!');
      } else if (hitAlmost) {
        Companion.react('almostWon');
      } else if (hitHalfway) {
        Companion.react('halfway');
      } else if (wasClutch) {
        Companion.react('clutch');
      } else if (dst.t === 'found' && G.combo >= 3) {
        Companion.react('combo');
        if (G.combo === 4) cutIn(`COMBO ×${G.combo}!`);
      } else if (acePlaced) {
        Companion.react('aceFound');
      } else if (clearedCol) {
        Companion.react('clearCol');
      } else if (kingLocked) {
        Companion.react('kingPlace');
      } else if (mov.length >= 4) {
        Companion.react('multiMove');
      } else if (wasFast && Companion.lastEv !== 'fastPlay') {
        Companion.react('fastPlay');
      } else if (dst.t === 'found') {
        Companion.react('foundation');
      } else if (flipped) {
        Companion.react('reveal');
      } else {
        Companion.react('place');
      }
    }
    afterMove();
  }

  function drawStock() {
    if (!G || busy || G.won || G.lost) return;
    noteActivity(); clearHints(); G.hintIdx = 0;
    if (!G.stock.length) {
      if (!G.waste.length) {
        Sound.sfx.stockEmpty?.();
        PopupFX?.float(slots.stock, 'STOCK EMPTY', { kind: 'warn', important: true });
        shakeEl(slots.stock);
        return;
      }
      if (!canRecycle()) {
        Sound.sfx.stockEmpty?.();
        Sound.sfx.invalid();
        PopupFX?.float(slots.stock, 'STOCK EMPTY', { kind: 'warn', tag: '0 PASSES', important: true });
        PopupFX?.stamp('OOPS!', 'sad', 'amber', false);
        if (G.chain >= 3) breakChain('recycle');
        Companion.react('noRedeal');
        shakeEl(slots.stock);
        return;
      }
      pushHistory();
      Sound.sfx.stockEmpty?.();
      G.stock = G.waste.reverse(); G.waste = [];
      G.stock.forEach((c) => { c.up = false; });
      G.passes++; G.wasteFan = 0;
      if (G.draw === 1) G.score = Math.max(0, G.score - 20);
      G.moves++; gameStepSeq++; startClock();
      Sound.sfx.recycle();
      const lim = passLimit();
      PopupFX?.float(slots.stock, '↻ REDEAL', {
        kind: 'info',
        tag: lim === Infinity ? `PASS ${G.passes}` : `${Math.max(0, lim - G.passes)} LEFT`,
        important: true,
      });
      if (G.chain >= 3) breakChain('recycle');
      Companion.react('recycle');
      layout(); afterMove();
      return;
    }
    pushHistory();
    const n = Math.min(G.draw, G.stock.length);
    for (let k = 0; k < n; k++) { const c = G.stock.pop(); c.up = true; G.waste.push(c); }
    G.wasteFan = n;
    G.moves++; gameStepSeq++; startClock();
    if (G.chain > 0) {
      const now = Date.now();
      G.chainUntil = Math.min(now + G.chainDur, G.chainUntil + 2400);
      if (G.chainDur > 0 && (G.chainUntil - now) / G.chainDur >= 0.22) {
        G.warnedChain = false;
        DOM.comboHud?.classList.remove('danger');
      }
      syncComboHud(false);
    }
    if (n > 1 && Sound.sfx.drawTriple) Sound.sfx.drawTriple();
    else Sound.sfx.draw();
    Companion.react('draw');
    layout();
    if (n > 1) PopupFX?.float(slots.waste, `DRAW ×${n}`, { kind: 'info', tag: 'FAN' });
    afterMove();
  }

  function afterMove() {
    updateHUD();
    if (checkWin()) return;
    if (!busy && settings.autoFound && !(G.difficulty === 'auto' && !autoPaused)) {
      clearTimeout(autoT);
      autoT = setTimeout(() => {
        if (!G || G.won || busy || drag) return;
        const m = autoFoundStep(true);
        if (m) moveCards(m.src, m.idx, m.dst, { record: false, auto: true });
      }, moveMs() + 60);
    }
    maybeAutoFinish();
    saveGame();
    scheduleCheck();
    if (G && G.difficulty === 'auto' && !autoPaused && !busy && !G.won && !G.lost) scheduleAutoStep(AUTO_STEP_MS);
  }

  function undo() {
    if (!G || busy || G.won) return;
    if (!DIFF[G.difficulty].undo) {
      toast('No undo in Hard mode~ (｀・ω・´)');
      Sound.sfx.invalid();
      PopupFX?.float(DOM.btnUndo, 'LOCKED', { kind: 'warn', tag: 'HARD MODE', important: true });
      Companion.react('undoBlocked');
      return;
    }
    if (!G.history.length) return;
    clearTimeout(autoT); clearHints(); G.hintIdx = 0; G.combo = 0;
    if (G.lost) { G.lost = false; board.classList.remove('lost'); }
    restore(G.history.pop());
    gameStepSeq++;
    resetAutoPlan();
    const cost = DIFF[G.difficulty].undoCost;
    G.score = Math.max(0, G.score - cost);
    Sound.sfx.undo();
    PopupFX?.float(DOM.btnUndo, '↶ REWIND', { kind: 'warn', tag: cost ? `-${cost} PTS` : 'UNDO', important: true });
    if (G.chain > 0) breakChain('miss');
    Companion.react('undo');
    layout(); updateHUD(); maybeAutoFinish(); saveGame();
    scheduleCheck();
    if (G && G.difficulty === 'auto' && !autoPaused && !busy && !G.won && !G.lost) scheduleAutoStep(AUTO_STEP_MS);
  }

  // ---------------------------------------------------------------- unwinnable-game detection & Worker solver
  // After every change the position is handed to the exhaustive solver in a background worker. Only a full
  // search that finds no winning line ends the game; if the search is too big to finish, play simply continues.
  const GENTLE_NODES = 300, GENTLE_BURY = 5, OBVIOUS_NODES = 150;
  const Analyzer = (() => {
    let worker = null, blobUrl = null, running = false, activeType = null, onDone = null, failed = false, seqId = 0;
    function workerSrc() {
      return `const Solver = (${solverFactory.toString()})();
        const GENTLE_NODES = ${GENTLE_NODES}, GENTLE_BURY = ${GENTLE_BURY}, OBVIOUS_NODES = ${OBVIOUS_NODES};
        function rng(seed) {
          let a = seed >>> 0;
          return () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        }
        const randSeed = () => (1 + Math.random() * 999998) | 0;
        function shuffledDeck(seed) {
          const r = rng(seed), d = [...Array(52).keys()];
          for (let i = 51; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
          return d;
        }
        function openingBurial(deck) {
          let b = 0;
          Solver.deal(deck).t.forEach((col) => col.forEach((c, i) => {
            const r = (c % 13) + 1, over = col.length - 1 - i;
            if (r === 1) b += over; else if (r === 2) b += over / 2;
          }));
          return b;
        }
        function findDeal(j) {
          const t0 = performance.now(), draw = j.draw, maxPasses = j.maxPasses, kind = j.kind || '';
          const patience = kind ? 6000 : 0;
          let last = null, fallback = null;
          while (performance.now() - t0 < 60000) {
            const seed = randSeed(), deck = shuffledDeck(seed);
            last = { seed, deck };
            if (kind === 'gentle') {
              const r = Solver.rate(deck, draw, GENTLE_NODES, maxPasses);
              if (r.won === true) {
                if (openingBurial(deck) <= GENTLE_BURY) return { id: j.id, seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
                fallback = fallback || { seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
              } else if (!fallback && performance.now() - t0 > patience) {
                const r2 = Solver.rate(deck, draw, 25000, maxPasses);
                if (r2.won === true) fallback = { seed, deck, rated: { won: true, nodes: r2.nodes, ok: true } };
              }
            } else {
              const r = Solver.rate(deck, draw, 25000, maxPasses);
              if (r.won === true) {
                if (kind !== 'tricky' || r.nodes > OBVIOUS_NODES) return { id: j.id, seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
                fallback = fallback || { seed, deck, rated: { won: true, nodes: r.nodes, ok: true } };
              }
            }
            if (fallback && performance.now() - t0 > patience) return { id: j.id, ...fallback };
          }
          return fallback ? { id: j.id, ...fallback } : { id: j.id, seed: last.seed, deck: last.deck, rated: { won: false, nodes: 0, ok: false } };
        }
        onmessage = (e) => {
          const j = e.data;
          if (j.type === 'plan') {
            const plan = Solver.plan ? Solver.plan(j.st, j.draw, j.maxPasses, j.limit) : null;
            postMessage({ id: j.id, plan });
          } else if (j.type === 'findDeal') {
            postMessage(findDeal(j));
          } else {
            const r = (j.mode === 'stuck' ? Solver.progress : Solver.analyze)(j.state, j.draw, j.maxPasses, j.limit, j.ms);
            postMessage({ id: j.id, result: r.result, nodes: r.nodes });
          }
        };`;
    }
    function settle(val) {
      const cb = onDone;
      onDone = null;
      running = false;
      activeType = null;
      if (cb) cb(val);
    }
    function make() {
      try {
        if (!blobUrl) blobUrl = URL.createObjectURL(new Blob([workerSrc()], { type: 'text/javascript' }));
        worker = new Worker(blobUrl);
        worker.onmessage = (e) => { settle(e.data); };
        worker.onerror = () => { failed = true; worker = null; settle(null); };
      } catch (e) { failed = true; worker = null; }
    }
    function stop(onlyType) {
      if (onlyType && activeType !== onlyType) return;
      if (worker && running) { worker.terminate(); worker = null; }
      settle(null);
    }
    function run(job, cb) {
      stop();
      onDone = cb;
      if (!worker && !failed) make();
      if (worker) {
        running = true;
        activeType = job.type || 'analyze';
        worker.postMessage(job);
        return;
      }
      // no worker support: synchronous fallback
      if (job.type === 'plan') {
        setTimeout(() => {
          const plan = Solver.plan ? Solver.plan(job.st, job.draw, job.maxPasses, job.limit) : null;
          settle({ id: job.id, plan });
        }, 0);
      } else if (job.type === 'findDeal') {
        settle({ id: job.id, fallback: true });
      } else {
        setTimeout(() => {
          const r = (job.mode === 'stuck' ? Solver.progress : Solver.analyze)(job.state, job.draw, job.maxPasses, 15000, 150);
          settle({ id: job.id, ...r });
        }, 0);
      }
    }
    function plan(st, draw, maxPasses, limit) {
      const id = ++seqId;
      return new Promise((resolve) => {
        run({ id, type: 'plan', st, draw, maxPasses, limit }, (res) => {
          resolve(res && res.id === id ? res.plan : null);
        });
      });
    }
    function findDeal(draw, maxPasses, kind) {
      const id = ++seqId;
      return new Promise((resolve) => {
        run({ id, type: 'findDeal', draw, maxPasses, kind }, (res) => {
          resolve(res && res.id === id ? res : null);
        });
      });
    }
    return { run, stop, plan, findDeal };
  })();

  let stateVer = 0, checkT = null;
  function solverState() {
    const ids = (p) => p.map((c) => c.id);
    const f = [0, 0, 0, 0];
    G.found.forEach((p) => { if (p.length) f[p[0].suit] = p.length; });
    return {
      t: G.tab.map(ids),
      dn: G.tab.map((p) => { const k = p.findIndex((c) => c.up); return k < 0 ? p.length : k; }),
      f, s: ids(G.stock), w: ids(G.waste), p: G.passes,
    };
  }
  function scheduleCheck() {
    const ver = ++stateVer;
    clearTimeout(checkT);
    const mode = settings.detectLoss;
    if (mode === 'off' || !G || G.won || G.lost || !G.started) { Analyzer.stop('analyze'); return; }
    checkT = setTimeout(() => {
      if (ver !== stateVer || !G || G.won || G.lost || busy) return;
      Analyzer.run({ id: ver, mode, state: solverState(), draw: G.draw, maxPasses: passLimit(), limit: 250000, ms: 4000 }, (r) => {
        if (!r || r.id !== stateVer || !G || G.won || G.lost || busy || settings.detectLoss !== mode) return;
        G.analysis = r.result;
        if ((mode === 'solver' && r.result === 'lose') || (mode === 'stuck' && r.result === 'stuck')) declareLost(mode);
      });
    }, 350);
  }

  let loseModalT = null;
  const LOSS_TEXT = {
    solver: { banner: 'SOLVER VERIFIED', kicker: '⚠ DEADLOCK DETECTED // NO WINNING PATH', sub: 'Every legal branch was checked — no winning path remains from here.' },
    stuck: { banner: 'NO MOVES LEFT', kicker: '⚠ DEADLOCK DETECTED // NO MOVES LEFT', sub: 'Every legal move was checked — no card can reach a foundation or turn face-up anymore.' },
  };
  function declareLost(mode = 'solver') {
    G.lost = true; G.lossMode = mode; stopAutoStep();
    clearTimeout(loseModalT);
    G.chain = 0; G.chainUntil = 0; G.warnedChain = false;
    syncComboHud(false);
    clearHints(); clearTimeout(autoT); clearTimeout(finishT);
    DOM.btnAutoFinish.classList.add('hidden');
    const st = getStats(); st[G.difficulty].streak = 0; Store.set('stats', st);
    board.classList.add('lost');
    updateHUD(); saveGame();
    Sound.sfx.lose(); Companion.react('lost');
    StageBG?.pulse('#ff5c6c', 1.1);
    PopupFX?.banner((LOSS_TEXT[mode] || LOSS_TEXT.solver).banner, 'DEADLOCK!', 'danger', true);
    loseModalT = setTimeout(showLost, settings.anim === 'off' ? 120 : 1100);
  }
  function showLost() {
    if (!G || !G.lost) return;
    const c = Companion.c, girl = c.kind === 'girl', d = DIFF[G.difficulty];
    const lt = LOSS_TEXT[G.lossMode] || LOSS_TEXT.solver;
    StageBG?.pulse('#ff5c6c', 1.1);
    PopupFX?.banner(lt.banner, 'DEADLOCK!', 'danger', true);
    const kick = DOM.loseKicker;
    if (kick) kick.textContent = lt.kicker;

    const lm = DOM.loseMascot;
    if (lm) {
      lm.dataset.partner = c.key;
      lm.removeAttribute('title');
      lm.innerHTML = c.html('full');
      lm.parentElement.dataset.partner = c.key;
      lm.parentElement.removeAttribute('title');
      lm.parentElement.classList.toggle('is-girl', girl);
      lm.parentElement.dataset.mood = 'sad';
    }
    const pn = DOM.losePartnerName, pq = DOM.loseQuote;
    if (pn) pn.textContent = c.name;
    if (pq) pq.textContent = c.line('lost')?.show || 'Every path is blocked… let us try a fresh deal! ♡';

    const sub = DOM.loseSub;
    if (sub) {
      sub.innerHTML = `<b>${d.icon} ${d.label}</b> · Draw ${G.draw} · ${lt.sub}`;
    }

    const foundCards = G.found.reduce((a, p) => a + p.length, 0);
    const pct = Math.round((foundCards / 52) * 100);
    const pt = DOM.loseProgText, pf = DOM.loseProgFill;
    if (pt) pt.textContent = `${foundCards} / 52 (${pct}%)`;
    if (pf) pf.style.width = pct + '%';

    const ls = DOM.loseStats;
    if (ls) {
      ls.innerHTML = [
        [`${foundCards} / 52`, 'Cards Home'],
        [G.score.toLocaleString(), 'Score'],
        [`×${G.maxChain || 0}`, 'Max Combo'],
        [fmtTime(G.elapsed) === '—' ? '0:00' : fmtTime(G.elapsed), 'Time'],
      ].map(([b, l], i) => `<div class="win-stat" style="--i:${i}"><b>${b}</b><span>${l}</span></div>`).join('');
    }

    const act = DOM.loseActions;
    if (act) {
      act.innerHTML = '';
      const canUndo = d.undo && G.history.length > 0;
      const addBtn = (label, primary, onClick, closeAttr) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn big' + (primary ? ' primary' : '');
        if (closeAttr) b.dataset.close = closeAttr;
        b.textContent = label;
        b.onclick = onClick;
        act.appendChild(b);
      };
      if (canUndo) {
        addBtn('↶ Rewind Move', true, () => { Sound.sfx.click(); hideOverlay('loseModal', true); undo(); });
      }
      addBtn('✿ New Deal', !canUndo, () => { Sound.sfx.click(); newGame(); });
      addBtn('↻ Retry Deal', false, () => { Sound.sfx.click(); newGame({ restart: true }); });
      addBtn('👁 Inspect Board', false, () => { Sound.sfx.click(); hideOverlay('loseModal'); }, 'loseModal');
    }
    showOverlay('loseModal');
  }

  function tapCard(c) {
    if (c.pile.t === 'stock') { drawStock(); return; }
    if (!settings.tapMove) return;
    const mov = movableFrom(c); if (!mov) return;
    const dst = bestTarget(mov, c.pile);
    if (dst) moveCards(c.pile, c.idx, dst);
    else {
      mov.forEach(shakeCard);
      Sound.sfx.invalid();
      PopupFX?.float(c.el, '✕ NO MOVE', { kind: 'warn' });
      PopupFX?.stamp('OOPS!', 'oops', 'amber', false);
      if (G.chain > 0) breakChain('miss');
      Companion.react('invalid');
    }
  }

  function shakeCard(c) { shakeEl(c.el); }
  function shakeEl(el) {
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  }

  // ---------------------------------------------------------------- hints
  function findHints() {
    const out = [];
    const tops = [];
    if (G.waste.length) tops.push({ src: { t: 'waste', i: 0 }, idx: G.waste.length - 1 });
    G.tab.forEach((p, i) => { if (p.length) tops.push({ src: { t: 'tab', i }, idx: p.length - 1 }); });
    for (const t of tops) {
      const c = pileOf(t.src)[t.idx], d = foundTarget(c);
      if (d) out.push({ ...t, dst: d, pri: 100 - c.rank });
    }
    G.tab.forEach((p, i) => {
      const fu = p.findIndex((c) => c.up); if (fu < 0) return;
      for (let idx = fu; idx < p.length; idx++) {
        const seq = p.slice(idx);
        let pri = 0;
        if (idx === fu && fu > 0) pri = 80;
        else if (idx === 0) pri = 30;
        else if (foundTarget(p[idx - 1])) pri = 60;
        if (!pri) continue;
        for (let j = 0; j < 7; j++) {
          if (j === i || !canDrop(seq, { t: 'tab', i: j })) continue;
          if (idx === 0 && !G.tab[j].length) continue;
          out.push({ src: { t: 'tab', i }, idx, dst: { t: 'tab', i: j }, pri });
          break;
        }
      }
    });
    if (G.waste.length) {
      const c = G.waste[G.waste.length - 1];
      for (let j = 0; j < 7; j++) {
        if (!canDrop([c], { t: 'tab', i: j })) continue;
        out.push({ src: { t: 'waste', i: 0 }, idx: G.waste.length - 1, dst: { t: 'tab', i: j }, pri: G.tab[j].length ? 50 : 45 });
        break;
      }
    }
    if (G.stock.length || (G.waste.length && canRecycle())) out.push({ draw: true, pri: 10 });
    return out.sort((a, b) => b.pri - a.pri);
  }
  function clearHints() {
    clearTimeout(hintT);
    board.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
  }
  function hint() {
    if (!G || G.won || G.lost || busy) return;
    noteActivity();
    const d = DIFF[G.difficulty];
    if (d.hints === 0) {
      toast('Hints are off in Hard mode ✧');
      Sound.sfx.invalid();
      PopupFX?.float(DOM.btnHint, 'HINTS OFF', { kind: 'warn', tag: 'HARD MODE', important: true });
      Companion.react('hintNone');
      return;
    }
    const list = findHints();
    if (!list.length) {
      Companion.react('noMoves'); Sound.sfx.invalid();
      PopupFX?.float(DOM.btnHint, 'NO MOVES', { kind: 'warn', important: true });
      toast(d.undo ? 'No moves left… try Undo or a New game' : 'No moves left… time for a New game ✿');
      return;
    }
    if (d.hints !== Infinity) {
      if (G.hintsLeft <= 0) {
        toast('No hints left this game (｡•́︿•̀｡)');
        Sound.sfx.invalid();
        PopupFX?.float(DOM.btnHint, '0 HINTS', { kind: 'warn', important: true });
        Companion.react('hintNone');
        return;
      }
      G.hintsLeft--;
    }
    const h = list[G.hintIdx % list.length]; G.hintIdx++;
    clearHints();
    let targetEl = null;
    if (h.draw) {
      targetEl = G.stock.length ? G.stock[G.stock.length - 1].el : slots.stock;
      targetEl.classList.add('hint');
    } else {
      const seq = pileOf(h.src).slice(h.idx);
      seq.forEach((c) => c.el.classList.add('hint'));
      const dp = pileOf(h.dst);
      targetEl = dp.length ? dp[dp.length - 1].el : slotEl(h.dst);
      targetEl.classList.add('hint');
      targetEl = seq[0]?.el || targetEl;
    }
    Sound.sfx.hint();
    PopupFX?.float(targetEl, '✧ HINT', {
      kind: 'info',
      tag: d.hints === Infinity ? 'GUIDE' : `${G.hintsLeft} LEFT`,
      important: true,
    });
    Companion.react('hint');
    hintT = setTimeout(clearHints, 1800);
    updateHUD(); saveGame();
  }

  // ---------------------------------------------------------------- auto finish & win
  function maybeAutoFinish() {
    const btn = DOM.btnAutoFinish;
    if (!G || G.won || busy) { btn.classList.add('hidden'); return; }
    const ready = !G.stock.length && !G.waste.length && G.tab.every((p) => p.every((c) => c.up));
    if (!ready) { btn.classList.add('hidden'); return; }
    PopupFX?.award('autoReady', '✨', 'AUTO-FINISH READY', 'ALL CARDS REVEALED', 'gold');
    if (settings.autoFinish) runAutoFinish();
    else btn.classList.remove('hidden');
  }
  function runAutoFinish() {
    if (busy || !G || G.won) return;
    DOM.btnAutoFinish.classList.add('hidden');
    clearTimeout(autoT);
    pushHistory();
    busy = true;
    Companion.react('autoFinish');
    PopupFX?.banner('ALL CARDS REVEALED', 'AUTO-FINISH!', 'gold', true);
    PopupFX?.stamp("LET'S GO!", 'hype', 'gold', true);
    const stepMs = settings.anim === 'off' ? 40 : settings.anim === 'fast' ? 70 : 110;
    let stepCount = 0;
    const tick = () => {
      if (!G || G.won) { busy = false; return; }
      const m = autoFoundStep(false);
      if (!m) { busy = false; updateHUD(); return; }
      Sound.sfx.autoStep?.(stepCount++);
      moveCards(m.src, m.idx, m.dst, { record: false, auto: true });
      if (!G.won) finishT = setTimeout(tick, stepMs);
    };
    finishT = setTimeout(tick, 150);
  }
  function stopAutoFinish() { clearTimeout(finishT); busy = false; }

  function checkWin() {
    if (!G.found.every((p) => p.length === 13)) return false;
    win();
    return true;
  }
  let winModalT = null, winScoreRaf = null;
  function rollWinScore(target) {
    if (winScoreRaf) { cancelAnimationFrame(winScoreRaf); winScoreRaf = null; }
    const el = DOM.winFinalScore;
    if (!el) return;
    if (settings.anim === 'off' || target <= 0) {
      el.textContent = target.toLocaleString();
      return;
    }
    const t0 = Date.now(), dur = 850;
    el.textContent = '0';
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (p < 1) winScoreRaf = requestAnimationFrame(step);
      else { el.textContent = target.toLocaleString(); winScoreRaf = null; }
    };
    winScoreRaf = requestAnimationFrame(step);
  }
  function showWinModal(opts = {}) {
    if (!G) return;
    const c = Companion.c, girl = c.kind === 'girl', d = DIFF[G.difficulty];
    const st = getStats(), s = st[G.difficulty];
    const bonus = opts.bonus !== undefined ? opts.bonus : Math.max(0, Math.round(1500 - G.elapsed * 3));
    const finalScore = opts.finalScore !== undefined ? opts.finalScore : Math.round((G.score + bonus) * d.mult);
    const recTime = !!opts.recTime, recScore = !!opts.recScore;
    const maxCombo = G.maxChain || 0;
    const grade = (G.elapsed <= 150 && maxCombo >= 15) ? 'S+'
      : (G.elapsed <= 240 || maxCombo >= 12) ? 'S'
      : G.elapsed <= 390 ? 'A' : 'B';

    const wm = DOM.winMascot;
    if (wm) {
      wm.dataset.partner = c.key;
      wm.removeAttribute('title');
      wm.innerHTML = c.html('full');
      wm.parentElement.dataset.partner = c.key;
      wm.parentElement.removeAttribute('title');
      wm.parentElement.classList.toggle('is-girl', girl);
      wm.parentElement.dataset.mood = 'cheer';
    }
    const pn = DOM.winPartnerName, pq = DOM.winQuote;
    if (pn) pn.textContent = c.name;
    if (pq) pq.textContent = c.line('win')?.show || 'Stage cleared! ♡';

    const wk = DOM.winKicker;
    if (wk) wk.textContent = grade === 'S+' ? '◈ FLAWLESS PRISM CLEAR' : '◈ STAGE CLEAR';
    const wg = DOM.winGrade;
    if (wg) { wg.textContent = grade; wg.dataset.grade = grade; }

    DOM.winSub.innerHTML = `<b>${d.icon} ${d.label}</b> · Draw ${G.draw}${d.mult !== 1 ? ` · ×${d.mult}` : ''} · Deal #${G.seed}`;

    const wr = DOM.winRecords;
    if (wr) {
      const badges = [];
      if (recScore) badges.push('<span class="record">★ NEW SCORE RECORD ★</span>');
      if (recTime) badges.push('<span class="record">⚡ NEW BEST TIME ⚡</span>');
      wr.innerHTML = badges.join('');
    }

    const rate = Math.round((s.won / Math.max(1, s.played)) * 100);
    const clearTime = fmtTime(G.elapsed) === '—' ? '0:00' : fmtTime(G.elapsed);
    DOM.winStats.innerHTML = [
      [G.score.toLocaleString(), 'Base Score'],
      [`+${bonus.toLocaleString()}`, `Time Bonus${d.mult !== 1 ? ` (×${d.mult})` : ''}`],
      [clearTime, 'Clear Time'],
      [String(G.moves), 'Total Moves'],
      [`×${maxCombo}`, 'Max Combo'],
      [`🔥 ${s.streak}`, `Win Streak (${rate}%)`],
    ].map(([b, l], i) => `<div class="win-stat" style="--i:${i}"><b>${b}</b><span>${l}</span></div>`).join('');

    showOverlay('winModal');
    rollWinScore(finalScore);
  }
  function win() {
    G.won = true; busy = false; clearTimeout(finishT); clearTimeout(autoT); stopAutoStep();
    clearTimeout(winModalT);
    G.warnedChain = false;
    syncComboHud(false);
    DOM.btnAutoFinish.classList.add('hidden');
    const d = DIFF[G.difficulty];
    const bonus = Math.max(0, Math.round(1500 - G.elapsed * 3));
    const finalScore = Math.round((G.score + bonus) * d.mult);
    const st = getStats(), s = st[G.difficulty];
    const prevBest = s.bestScore || 0;
    const recTime = !s.bestTime || G.elapsed < s.bestTime;
    const recScore = finalScore > prevBest;
    s.won++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (recTime) s.bestTime = G.elapsed;
    if (recScore) s.bestScore = finalScore;
    Store.recordGuestStat(G.difficulty, 'won');
    Store.set('stats', st, { immediate: true }); Store.set('save', null, { immediate: true });
    updateHUD();
    Sound.sfx.win(); Companion.react('win'); cutIn('VICTORY!!'); FX.celebrate();
    PopupFX?.banner('STAGE CLEARED', 'VICTORY!!', 'gold', true);
    PopupFX?.stamp('UNREAL!', 'cheer', 'gold', true);
    if (recScore) PopupFX?.award('newBest', '👑', 'NEW BEST SCORE!', `${finalScore} PTS RECORD`, 'gold');
    StageBG?.pulse('#ffe169', 1.4);
    G.found.forEach((p, i) => setTimeout(() => p[p.length - 1]?.el.classList.add('celebrate'), i * 120));
    winModalT = setTimeout(() => {
      if (!G || !G.won) return;
      if (recTime || recScore) Sound.sfx.newRecord?.();
      showWinModal({ bonus, finalScore, recTime, recScore });
    }, settings.anim === 'off' ? 120 : 1700);
  }

  // ---------------------------------------------------------------- Auto difficulty autopilot (580ms steady cadence)
  let autoPlanSeq = 0;
  function stopAutoStep() {
    clearTimeout(autoStepT);
    autoStepT = null;
    autoPlanSeq++;
    Analyzer.stop('plan');
  }
  function resetAutoPlan() {
    stopAutoStep();
    autoQueue = [];
    autoVisited.clear();
    autoLastSeq = gameStepSeq;
  }
  function anyOverlayOpen() {
    if (overlayOpen()) return true;
    const ov = document.querySelector?.('.overlay:not(.hidden)');
    return !!ov;
  }
  function scheduleAutoStep(delay = AUTO_STEP_MS) {
    stopAutoStep();
    if (!G || G.difficulty !== 'auto' || G.won || G.lost || autoPaused || busy || document.hidden || anyOverlayOpen()) return;
    autoStepT = setTimeout(runAutoTick, delay);
  }
  function tryExecPlanStep(m) {
    if (!m || !G) return false;
    switch (m[0]) {
      case 0: {
        const col = m[1], p = G.tab[col];
        if (!p || !p.length || !p[p.length - 1].up) return false;
        const dst = foundTarget(p[p.length - 1]);
        if (!dst) return false;
        moveCards({ t: 'tab', i: col }, p.length - 1, dst);
        return true;
      }
      case 1: {
        if (!G.waste.length) return false;
        const dst = foundTarget(G.waste[G.waste.length - 1]);
        if (!dst) return false;
        moveCards({ t: 'waste', i: 0 }, G.waste.length - 1, dst);
        return true;
      }
      case 2: {
        const fc = m[1], idx = m[2], tc = m[3];
        const sp = G.tab[fc];
        if (!sp || idx < 0 || idx >= sp.length || !sp[idx].up) return false;
        const seq = movableFrom(sp[idx]);
        if (!seq || !canDrop(seq, { t: 'tab', i: tc })) return false;
        moveCards({ t: 'tab', i: fc }, idx, { t: 'tab', i: tc });
        return true;
      }
      case 3: {
        const tc = m[1];
        if (!G.waste.length) return false;
        const c = G.waste[G.waste.length - 1];
        if (!canDrop([c], { t: 'tab', i: tc })) return false;
        moveCards({ t: 'waste', i: 0 }, G.waste.length - 1, { t: 'tab', i: tc });
        return true;
      }
      case 4: {
        if (!G.stock.length) return false;
        drawStock();
        return true;
      }
      case 5: {
        if (G.stock.length || !G.waste.length || !canRecycle()) return false;
        autoQueue.unshift([4]);
        drawStock();
        return true;
      }
      case 6: {
        const suit = m[1], tc = m[2];
        const fi = G.found.findIndex((p) => p.length && p[0].suit === suit);
        if (fi < 0) return false;
        const fp = G.found[fi], c = fp[fp.length - 1];
        if (!canDrop([c], { t: 'tab', i: tc })) return false;
        moveCards({ t: 'found', i: fi }, fp.length - 1, { t: 'tab', i: tc });
        return true;
      }
      default:
        return false;
    }
  }
  function execAutoFallback() {
    const af = autoFoundStep(true);
    if (af) { moveCards(af.src, af.idx, af.dst); return true; }
    const hints = findHints();
    const passCtx = `${G.passes}:${G.stock.length}:${G.waste.length}`;
    for (const h of hints) {
      if (h.draw) { drawStock(); return true; }
      const sp = pileOf(h.src), c = sp[h.idx];
      const sig = `${passCtx}:${c.id}->${h.dst.t}${h.dst.i}`;
      if (autoVisited.has(sig)) continue;
      autoVisited.add(sig);
      moveCards(h.src, h.idx, h.dst);
      return true;
    }
    return false;
  }
  async function runAutoTick() {
    autoStepT = null;
    if (!G || G.difficulty !== 'auto' || G.won || G.lost || autoPaused || document.hidden || anyOverlayOpen()) return false;
    if (busy || drag) { scheduleAutoStep(220); return false; }

    if (gameStepSeq !== autoLastSeq) autoQueue = [];
    const seq = gameStepSeq;
    const tickTok = ++autoPlanSeq;

    if (!autoQueue.length && Solver.plan) {
      const planned = await Analyzer.plan(solverState(), G.draw, passLimit(), 65000);
      if (tickTok !== autoPlanSeq || seq !== gameStepSeq || !G || G.difficulty !== 'auto' || G.won || G.lost || autoPaused || busy || drag || document.hidden || anyOverlayOpen()) {
        return false;
      }
      if (Array.isArray(planned) && planned.length) {
        autoQueue = planned.slice();
        autoVisited.clear();
      }
    }

    let moved = false;
    if (autoQueue.length) {
      moved = tryExecPlanStep(autoQueue.shift());
      if (!moved && Solver.plan) {
        autoQueue = [];
        const replanned = await Analyzer.plan(solverState(), G.draw, passLimit(), 65000);
        if (tickTok !== autoPlanSeq || seq !== gameStepSeq || !G || G.difficulty !== 'auto' || G.won || G.lost || autoPaused || busy || drag || document.hidden || anyOverlayOpen()) {
          return false;
        }
        if (Array.isArray(replanned) && replanned.length) {
          autoQueue = replanned.slice();
          moved = tryExecPlanStep(autoQueue.shift());
        }
      }
    }
    if (!moved) moved = execAutoFallback();
    autoLastSeq = gameStepSeq;
    if (moved && G && G.difficulty === 'auto' && !G.won && !G.lost && !busy && !autoPaused) {
      scheduleAutoStep(AUTO_STEP_MS);
    }
    return moved;
  }
  function toggleAutoPause() {
    if (!G || G.difficulty !== 'auto' || G.won || G.lost) return autoPaused;
    Sound.ensure();
    autoPaused = !autoPaused;
    ((autoPaused ? Sound.sfx.toggleOff : Sound.sfx.toggleOn) || Sound.sfx.click)?.();
    PopupFX?.pill(
      autoPaused ? '⏸' : '▶',
      autoPaused ? 'AUTOPILOT PAUSED' : 'AUTOPILOT ACTIVE',
      autoPaused ? 'CLICK ◈ AUTO TO RESUME' : 'STEADY PACE ENGAGED',
      autoPaused ? 'amber' : 'emerald',
      { always: true }
    );
    updateHUD();
    if (autoPaused) stopAutoStep();
    else scheduleAutoStep(260);
    return autoPaused;
  }

  // ---------------------------------------------------------------- new game / deal
  // Keeps dealing until the solver finds an actual winning line under this difficulty's pass limit, then checks the
  // deal fits the difficulty. The solver's effort is the difficulty signal: ~100 positions means its first, most
  // natural line of play simply wins; hundreds+ means the win needs a non-obvious line.
  //  - gentle (Easy): solved within GENTLE_NODES and aces/2s not buried deep in the opening tableau (~20% of deals, ~3 ms per check)
  //  - tricky (Hard): needs more than OBVIOUS_NODES, so the obvious line does not win (~75% of 1-pass-winnable deals)
  // If no ideal deal turns up in time, the best winnable one seen is used.
  // cards stacked on top of each ace in the opening tableau (half weight for 2s)
  function openingBurial(deck) {
    let b = 0;
    Solver.deal(deck).t.forEach((col) => col.forEach((c, i) => {
      const r = (c % 13) + 1, over = col.length - 1 - i;
      if (r === 1) b += over; else if (r === 2) b += over / 2;
    }));
    return b;
  }
  async function findWinnableSync(draw, tok, maxPasses = Infinity, kind = '') {
    const t0 = performance.now(), patience = kind ? 6000 : 0;
    let last = null, fallback = null;
    while (performance.now() - t0 < 60000) {
      const seed = randSeed(), deck = shuffledDeck(seed);
      last = { seed, deck };
      if (kind === 'gentle') {
        const r = Solver.rate(deck, draw, GENTLE_NODES, maxPasses);
        if (r.won === true) {
          if (openingBurial(deck) <= GENTLE_BURY) return { seed, deck, ok: true };
          fallback = fallback || { seed, deck, ok: true };
        } else if (!fallback && performance.now() - t0 > patience && Solver.solve(deck, draw, 25000, maxPasses) === true) {
          fallback = { seed, deck, ok: true };
        }
      } else {
        const r = Solver.rate(deck, draw, 25000, maxPasses);
        if (r.won === true) {
          if (kind !== 'tricky' || r.nodes > OBVIOUS_NODES) return { seed, deck, ok: true };
          fallback = fallback || { seed, deck, ok: true };
        }
      }
      if (fallback && performance.now() - t0 > patience) return fallback;
      await new Promise((r) => setTimeout(r, 0));
      if (tok !== dealToken) break;
    }
    return fallback || { ...last, ok: false };
  }
  async function findWinnable(draw, tok, maxPasses = Infinity, kind = '') {
    const res = await Analyzer.findDeal(draw, maxPasses, kind);
    if (tok !== dealToken) return { ok: false };
    if (res && !res.fallback && Array.isArray(res.deck)) {
      return { seed: res.seed, deck: res.deck, ok: !!(res.rated && res.rated.ok) };
    }
    return findWinnableSync(draw, tok, maxPasses, kind);
  }

  async function newGame(opts = {}) {
    const tok = ++dealToken;
    Analyzer.stop();
    DOM.shuffleNote.classList.add('hidden');
    stopAutoStep(); autoPaused = false;
    clearTimeout(winModalT); clearTimeout(loseModalT);
    if (winScoreRaf) { cancelAnimationFrame(winScoreRaf); winScoreRaf = null; }
    hideAllOverlays(); clearHints(); stopAutoFinish(); clearTimeout(autoT);
    DOM.btnAutoFinish.classList.add('hidden');
    Sound.ensure();
    if (G && G.started && !G.won) { const st = getStats(); st[G.difficulty].streak = 0; Store.set('stats', st); }
    const restart = opts.restart && G;
    const difficulty = restart ? G.difficulty : settings.difficulty;
    const draw = restart ? G.draw : settings.draw;
    let deck, seed, verified = false;
    if (restart) { deck = G.deck; seed = G.seed; verified = G.verified; }
    else if (DIFF[difficulty].solvable) {
      busy = true;
      const note = DOM.shuffleNote; const noteT = setTimeout(() => note.classList.remove('hidden'), 250);
      Sound.sfx.shuffle();
      const r = await findWinnable(draw, tok, DIFF[difficulty].passes[draw], DIFF[difficulty].deals);
      clearTimeout(noteT); note.classList.add('hidden');
      if (tok !== dealToken) return;
      ({ deck, seed } = r); verified = r.ok;
    } else { seed = randSeed(); deck = shuffledDeck(seed); }

    G = newState(difficulty, draw, deck, seed, verified);
    gameStepSeq++; resetAutoPlan();
    syncComboHud(false);
    board.classList.remove('lost'); scheduleCheck();
    const d = deck.slice();
    cards.forEach((c) => { c.up = false; c._rx = null; c._ry = null; c._rz = null; c._rup = false; });
    for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) G.tab[j].push(cards[d.pop()]);
    G.stock = d.map((id) => cards[id]);
    board.classList.remove('empty');
    updateHUD();
    animateDeal(tok);
    PopupFX?.pill('✿', `DEAL #${G.seed} LIVE`, `${DIFF[G.difficulty].label.toUpperCase()} · DRAW ${G.draw}${G.verified ? ' · VERIFIED' : ''}`, 'emerald');
    Companion.react(restart ? 'restart' : DIFF[difficulty].solvable && verified ? 'startEasy' : 'start');
    saveGame();
  }

  function animateDeal(tok) {
    busy = true;
    measure();
    const sx = colX(slotCol('stock')), sy = M.topY;
    board.classList.add('no-anim');
    cards.forEach((c, k) => {
      c.el.classList.remove('up', 'celebrate', 'hint', 'shake');
      clearTimeout(c.zt); c.zt = null;
      c.x = sx; c.y = sy; c.z = 10 + k;
      c._rx = sx; c._ry = sy; c._rz = 10 + k; c._rup = false;
      c.el.style.transform = `translate3d(${sx}px,${sy}px,0)`;
      c.el.style.zIndex = 10 + k;
    });
    void board.offsetHeight;
    board.classList.remove('no-anim');
    const step = settings.anim === 'off' ? 0 : settings.anim === 'fast' ? 18 : 36;
    let k = 0;
    for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) { G.tab[j][i].el.style.transitionDelay = (k * step) + 'ms'; k++; }
    layout();
    if (step) Sound.sfx.deal(k, step / 1000);
    setTimeout(() => {
      cards.forEach((c) => { c.el.style.transitionDelay = ''; });
      if (tok !== dealToken) return;
      G.tab.forEach((p) => { p[p.length - 1].up = true; });
      layout(); Sound.sfx.flip();
      busy = false;
      saveGame();
      scheduleAutoStep(AUTO_STEP_MS);
    }, k * step + moveMs() + 40);
  }

  // ---------------------------------------------------------------- save / load
  function saveGame() {
    if (!G) return;
    if (G.won || (G.lost && !DIFF[G.difficulty].undo)) { Store.set('save', null); return; }
    Store.set('save', {
      v: 1, difficulty: G.difficulty, draw: G.draw, deck: G.deck, seed: G.seed, verified: G.verified,
      state: snap(), elapsed: G.elapsed, started: G.started, hintsLeft: G.hintsLeft === Infinity ? -1 : G.hintsLeft,
      maxChain: G.maxChain || 0, halfwaySaid: !!G.halfwaySaid, almostSaid: !!G.almostSaid,
      medals: G.medals ? [...G.medals] : [],
      history: G.history.slice(-80),
    });
  }
  function loadGame(sv) {
    dealToken++;
    Analyzer.stop();
    busy = false;
    DOM.shuffleNote.classList.add('hidden');
    autoPaused = false;
    G = newState(sv.difficulty, sv.draw, sv.deck, sv.seed, sv.verified);
    board.classList.remove('lost');
    restore(sv.state);
    gameStepSeq++; resetAutoPlan();
    G.elapsed = sv.elapsed || 0; G.started = !!sv.started; G.history = sv.history || [];
    G.hintsLeft = sv.hintsLeft === -1 ? Infinity : sv.hintsLeft;
    G.maxChain = sv.maxChain || 0;
    G.medals = new Set(Array.isArray(sv.medals) ? sv.medals : []);
    const totalFound = G.found.reduce((s, p) => s + p.length, 0);
    G.halfwaySaid = !!sv.halfwaySaid || totalFound >= 26;
    G.almostSaid = !!sv.almostSaid || totalFound >= 44;
    // a save made mid-deal may have face-down tableau tops
    G.tab.forEach((p) => { if (p.length) p[p.length - 1].up = true; });
    board.classList.remove('empty');
    cards.forEach((c) => { c.x = null; c._rx = null; c._ry = null; c._rz = null; c._rup = null; });
    syncComboHud(false);
    layout({ instant: true }); updateHUD(); maybeAutoFinish();
    PopupFX?.pill('✿', `DEAL #${G.seed} RESUMED`, `${DIFF[G.difficulty].label.toUpperCase()} · DRAW ${G.draw}`, 'emerald');
    Companion.react('welcome');
    scheduleCheck();
    scheduleAutoStep(AUTO_STEP_MS);
  }
  function validSave(sv) {
    return sv && sv.v === 1 && DIFF[sv.difficulty] && (sv.draw === 1 || sv.draw === 3) && Array.isArray(sv.deck) && sv.state;
  }

  // ---------------------------------------------------------------- stats
  function getStats() {
    const base = () => ({ played: 0, won: 0, bestTime: 0, bestScore: 0, streak: 0, bestStreak: 0 });
    const st = Store.get('stats', {}) || {};
    for (const k of Object.keys(DIFF)) st[k] = Object.assign(base(), st[k]);
    return st;
  }
  const fmtTime = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');

  // ---------------------------------------------------------------- HUD
  function updateHUD() {
    if (!G) return;
    const d = DIFF[G.difficulty];
    const cd = DOM.chipDiff;
    if (G.difficulty === 'auto') {
      cd.textContent = autoPaused ? '◈ Auto ⏸' : '◈ Auto ▶';
      cd.className = 'chip diff-auto is-auto' + (autoPaused ? ' is-paused' : '');
      cd.title = autoPaused ? 'Autopilot paused — click to resume' : 'Autopilot active — click to pause';
      cd.setAttribute('role', 'button');
      cd.tabIndex = 0;
    } else {
      cd.textContent = `${d.icon} ${d.label}`;
      cd.className = 'chip diff-' + G.difficulty;
      cd.title = '';
      cd.removeAttribute('role');
      cd.removeAttribute('tabindex');
    }
    DOM.chipDraw.textContent = `Draw ${G.draw}`;
    DOM.moves.textContent = G.moves;
    DOM.score.textContent = G.score;
    const lim = passLimit();
    DOM.passes.textContent = lim === Infinity ? '∞' : Math.max(0, lim - G.passes);
    DOM.chipDeal.textContent = `#${G.seed}${G.verified ? ' ✓' : ''}`;
    DOM.chipDeal.title = G.verified ? 'Deal number — verified winnable' : 'Deal number';
    DOM.time.textContent = fmtTime(G.elapsed) === '—' ? '0:00' : fmtTime(G.elapsed);
    DOM.btnUndo.disabled = !d.undo || !G.history.length || G.won;
    DOM.btnHint.disabled = d.hints === 0 || G.won || !!G.lost;
    DOM.hintBadge.textContent = d.hints === Infinity || d.hints === 0 ? '' : G.hintsLeft;
    updateStockSlot();
    syncComboHud(false);
  }

  // ---------------------------------------------------------------- input: drag & tap
  let drag = null, guideEls = [];
  function onDown(e, targetEl) {
    if (!G || busy || G.won || G.lost) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    Sound.ensure(); noteActivity();
    const hit = targetEl || e.target;
    const cardEl = hit.closest('.card');
    if (cardEl) {
      const c = cards[+cardEl.dataset.id];
      if (!c.pile) return;
      if (c.pile.t === 'stock') { drawStock(); return; }
      const mov = movableFrom(c);
      if (!mov) return;
      e.preventDefault();
      drag = {
        c, mov, src: c.pile, idx: c.idx,
        sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, lastX: e.clientX, tilt: 0,
        pendingX: e.clientX, pendingY: e.clientY, hasPending: false, raf: 0,
        started: false, id: e.pointerId,
      };
    } else if (hit.closest('.slot-stock')) drawStock();
  }
  function flushDrag() {
    if (!drag) return;
    drag.raf = 0;
    if (!drag.hasPending) return;
    drag.hasPending = false;
    const cx = drag.pendingX, cy = drag.pendingY;
    drag.dx = cx - drag.sx; drag.dy = cy - drag.sy;
    if (!drag.started) {
      if (Math.hypot(drag.dx, drag.dy) < 6) return;
      drag.started = true; clearHints();
      for (let k = 0; k < drag.mov.length; k++) {
        const c = drag.mov[k];
        c.el.classList.add('dragging');
        clearTimeout(c.zt); c.zt = null;
        c._rx = null; c._ry = null; c._rz = 9000 + k;
        c.el.style.zIndex = 9000 + k;
      }
      document.body.classList.add('is-dragging');
      if (settings.dropGuides) showGuides(drag.mov, drag.src);
      if (drag.mov.length >= 2 && Sound.sfx.multiPick) Sound.sfx.multiPick(drag.mov.length);
      else Sound.sfx.pick();
      Companion.react('pick');
    }
    drag.tilt = drag.tilt * 0.7 + Math.max(-8, Math.min(8, (cx - drag.lastX) * 0.8)) * 0.3;
    drag.lastX = cx;
    const rot = settings.anim === 'off' ? 0 : drag.tilt;
    const rotStr = rot === 0 ? '' : ` rotate(${rot.toFixed(2)}deg)`;
    for (let k = 0; k < drag.mov.length; k++) {
      const c = drag.mov[k];
      c.el.style.transform = `translate3d(${c.x + drag.dx}px,${c.y + drag.dy}px,0)${rotStr}`;
    }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.pendingX = e.clientX;
    drag.pendingY = e.clientY;
    drag.hasPending = true;
    if (!drag.raf) drag.raf = requestAnimationFrame(flushDrag);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.raf) { cancelAnimationFrame(drag.raf); drag.raf = 0; }
    if (drag.hasPending) flushDrag();
    const d = drag; drag = null;
    document.body.classList.remove('is-dragging');
    clearGuides();
    if (!d.started) { tapCard(d.c); return; }
    d.mov.forEach((c) => {
      c.el.classList.remove('dragging');
      c.x += d.dx; c.y += d.dy;
      c._rx = null; c._ry = null; c._rz = null;
    });
    const dst = e.type === 'pointercancel' ? null : findDrop(d.mov, d.src);
    if (dst) moveCards(d.src, d.idx, dst);
    else {
      layout();
      if (Math.hypot(d.dx, d.dy) > M.cw * 0.6) {
        Sound.sfx.invalid();
        PopupFX?.float(d.c.el, '✕ INVALID DROP', { kind: 'warn' });
        PopupFX?.stamp('OOPS!', 'oops', 'amber', false);
        if (G.chain > 0) breakChain('miss');
        Companion.react('invalid');
      }
    }
  }
  function overlap(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function findDrop(mov, src) {
    const c0 = mov[0], r = { x: c0.x, y: c0.y, w: M.cw, h: M.ch };
    let best = null, bestA = 0;
    const consider = (ref, x, y, h) => {
      if (src.t === ref.t && src.i === ref.i) return;
      if (!canDrop(mov, ref)) return;
      const a = overlap(r, { x, y, w: M.cw, h });
      if (a > bestA) { bestA = a; best = ref; }
    };
    for (let i = 0; i < 4; i++) consider({ t: 'found', i }, colX(slotCol('found', i)), M.topY, M.ch);
    for (let i = 0; i < 7; i++) {
      const p = G.tab[i], top = p[p.length - 1];
      consider({ t: 'tab', i }, colX(i), top ? top.y : M.tabY, M.ch * (top ? 1.3 : 1));
    }
    return bestA > M.cw * M.ch * 0.06 ? best : null;
  }
  function showGuides(mov, src) {
    clearGuides();
    const refs = [];
    for (let i = 0; i < 4; i++) refs.push({ t: 'found', i });
    for (let i = 0; i < 7; i++) refs.push({ t: 'tab', i });
    refs.forEach((ref) => {
      if ((ref.t === src.t && ref.i === src.i) || !canDrop(mov, ref)) return;
      const p = pileOf(ref);
      const el = p.length ? p[p.length - 1].el : slotEl(ref);
      el.classList.add('drop-ok');
      guideEls.push(el);
    });
  }
  function clearGuides() {
    for (let i = 0; i < guideEls.length; i++) guideEls[i].classList.remove('drop-ok');
    guideEls.length = 0;
  }

  // ---------------------------------------------------------------- mascot
  let mascotBox = { w: 0, h: 0, right: 0, bottom: 0, vw: 0, vh: 0, dirty: true, peek: null };
  let mascotMeasureRaf = 0;
  function measureMascotBox() {
    mascotBox.dirty = false;
    const el = Companion.el;
    if (!el || !settings.mascot) {
      mascotBox.w = 0; mascotBox.h = 0;
      return;
    }
    const box = Companion.body.offsetWidth ? Companion.body : el;
    const w = box.offsetWidth, h = box.offsetHeight;
    if (!w || !h) {
      mascotBox.w = 0; mascotBox.h = 0;
      return;
    }
    const cs = getComputedStyle(el);
    mascotBox.w = w;
    mascotBox.h = h;
    mascotBox.right = parseFloat(cs.right) || 0;
    mascotBox.bottom = parseFloat(cs.bottom) || 0;
    mascotBox.vw = innerWidth;
    mascotBox.vh = innerHeight;
  }
  function scheduleMascotMeasure() {
    mascotBox.dirty = true;
    if (mascotMeasureRaf) return;
    mascotMeasureRaf = requestAnimationFrame(() => {
      mascotMeasureRaf = 0;
      measureMascotBox();
      updatePeek();
    });
  }

  const Companion = {
    el: DOM.mascot, bubble: $('#bubble'), body: $('#mascotBody'),
    t: null, mt: null, tt: null, lineUntil: 0, linePri: 0, lastEv: '', lastEvT: 0,
    get c() { return Cast.get(settings.companion); },
    render() {
      const c = this.c, girl = c.kind === 'girl';
      const mode = settings.spriteMode === 'full' ? 'full' : 'corner';
      if (c.preload) c.preload(mode);
      this.el.dataset.partner = c.key;
      this.body.dataset.partner = c.key;
      this.el.removeAttribute('title');
      this.body.removeAttribute('title');
      this.body.innerHTML = c.html(mode);
      this.el.classList.toggle('is-girl', girl);
      this.el.classList.toggle('is-full', girl && mode === 'full');
      const btn = DOM.btnSpriteMode;
      if (btn) {
        btn.classList.toggle('hidden', !girl);
        btn.textContent = mode === 'full' ? '↕ Corner' : '↕ Full';
        btn.removeAttribute('title');
      }
      const img = this.body.querySelector('img');
      if (img && !img.complete) img.addEventListener('load', scheduleMascotMeasure, { once: true });
      const sm = DOM.startMascot;
      if (sm) {
        const startMood = c.moods.hello || 'happy';
        sm.dataset.partner = c.key;
        sm.removeAttribute('title');
        sm.innerHTML = girl ? c.html('full', startMood) : c.html('full');
        sm.parentElement.dataset.partner = c.key;
        sm.parentElement.removeAttribute('title');
        sm.parentElement.classList.toggle('is-girl', girl);
        sm.parentElement.dataset.mood = startMood;
      }
      const wm = DOM.winMascot;
      if (wm) {
        wm.dataset.partner = c.key;
        wm.removeAttribute('title');
        wm.parentElement.dataset.partner = c.key;
        wm.parentElement.removeAttribute('title');
        wm.parentElement.classList.toggle('is-girl', girl);
        wm.parentElement.dataset.mood = 'cheer';
        wm.innerHTML = DOM.winModal && !DOM.winModal.classList.contains('hidden') ? c.html('full') : '';
      }
      const lm = DOM.loseMascot;
      if (lm) {
        lm.dataset.partner = c.key;
        lm.removeAttribute('title');
        lm.parentElement.dataset.partner = c.key;
        lm.parentElement.removeAttribute('title');
        lm.parentElement.classList.toggle('is-girl', girl);
        lm.parentElement.dataset.mood = 'sad';
        lm.innerHTML = DOM.loseModal && !DOM.loseModal.classList.contains('hidden') ? c.html('full') : '';
      }
      const ci = DOM.cutin;
      if (ci) ci.dataset.partner = c.key;
      scheduleMascotMeasure();
      updatePeek();
    },
    mood(m, ms = 1300) {
      this.el.dataset.mood = m;
      clearTimeout(this.mt);
      this.mt = setTimeout(() => { this.el.dataset.mood = 'normal'; }, ms);
    },
    boing() {
      const b = this.body;
      b.classList.remove('boing', 'react-headpat', 'react-boop', 'react-highfive', 'react-fluster', 'react-startle');
      void b.offsetWidth;
      b.classList.add('boing');
    },
    talk(on, ms) {
      this.el.classList.toggle('talking', on);
      clearTimeout(this.tt);
      if (on) this.tt = setTimeout(() => this.el.classList.remove('talking'), ms || 6000);
      if (!on) updatePeek();
    },
    react(ev, opts) {
      const force = !!(opts && opts.force);
      if (!settings.mascot && !force) return null;
      const [pri0, mood0] = EVENTS[ev] || [2, 'normal'];
      const pri = force ? Math.max(pri0, 4) : pri0;
      const c = this.c, mood = c.moods[ev] || mood0;
      this.mood(mood, pri >= 3 ? 2600 : 1300);
      if (pri >= 2 && !force) this.boing();
      if (!force) {
        const ch = settings.chatter;
        if (ch === 'quiet' && pri < 3) return null;
        if (ch === 'some' && (pri < 2 || (pri === 2 && Math.random() > 0.45))) return null;
      }
      const now = Date.now();
      const milestone = /^(chain|musicChange|themeChange|suitDone|win|lost)/.test(ev);
      if (!force && !milestone && now < this.lineUntil && this.linePri > pri) return null; // don't talk over something more important
      if (!force && ev === this.lastEv && pri === 1 && now - this.lastEvT < 280) return null;
      this.lastEv = ev; this.lastEvT = now;
      const line = c.line(ev) || (force ? c.line('pet') : null);
      if (!line) return null;
      // speak first: if she's mid-sentence with something as important, skip this line entirely
      // (bubble included) so voice and text never get chopped or fall out of sync
      if (force) {
        this.speak(line, 4, true);
      } else if (milestone) {
        this.speak(line, Math.max(pri, 4));
      } else if (this.speak(line, pri) === 'busy') {
        return null;
      }
      const ms = pri >= 4 ? 5200 : Math.max(1500, Math.min(4500, 900 + line.show.length * 45));
      this.bubble.textContent = line.show;
      this.bubble.classList.add('show');
      clearTimeout(this.t);
      this.t = setTimeout(() => this.bubble.classList.remove('show'), ms);
      this.lineUntil = now + ms * (force ? 0.35 : pri <= 2 ? 0.45 : 0.65);
      this.linePri = force ? 3 : pri;
      return line;
    },
    speak(line, pri, force = false) {
      const flap = Math.min(1800, 300 + line.show.length * 35);
      if (settings.muted || !settings.voice) { this.talk(true, flap); return true; }
      if (this.c.kind === 'cat') { Sound.sfx.nya(); this.talk(true, 450); return true; }
      const speakOpts = {
        char: this.c.key, lang: settings.voiceLang, name: voiceNameFor(), slot: this.c.voice.slot || 0, volume: settings.voiceVol, pri,
        onstart: () => { this.talk(true); Sound.duck(true); },
        onend: () => { this.talk(false); Sound.duck(false); },
      };
      let r = Voice.speak(line, this.c.voice, speakOpts);
      if (force && r === 'busy') {
        Voice.stop();
        r = Voice.speak(line, this.c.voice, speakOpts);
      }
      if (r === 'busy') return r;
      if (!r) this.talk(true, flap);
      else this.talk(true, 7000); // until onend (with a safety timeout)
      return true;
    },
    silence() { Voice.stop(); this.talk(false); Sound.duck(false); },
  };

  // ---------------------------------------------------------------- 5-Zone Companion Body-Click System
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

  let cutT = null;
  function cutIn(text) {
    if (!settings.cutins || !settings.mascot || settings.anim === 'off') return;
    Sound.sfx.cutin?.();
    const el = DOM.cutin, c = Companion.c;
    const mood = /APEX|BLITZ|BOOST/i.test(text) ? 'hype'
      : /SUIT/i.test(text) ? 'cheer'
      : /VICTORY|WIN/i.test(text) ? 'cheer'
      : (c.key === 'rin' || c.key === 'kira' || c.key === 'ayame') ? 'smug'
      : (c.key === 'sakura' || c.key === 'kaede') ? 'cheer'
      : c.key === 'mio' ? 'happy' : 'wink';
    el.dataset.partner = c.key;
    el.querySelector('.cutin-girl').innerHTML = c.html('corner', mood);
    el.dataset.mood = mood;
    el.querySelector('.cutin-text').textContent = text;
    el.classList.remove('hidden', 'play'); void el.offsetWidth; el.classList.add('play');
    clearTimeout(cutT); cutT = setTimeout(() => el.classList.add('hidden'), 1900);
  }

  // duck the companion down when tableau cards reach her corner
  function updatePeek() {
    const el = Companion.el;
    if (!G || !settings.mascot || board.classList.contains('empty')) {
      if (mascotBox.peek !== false) { mascotBox.peek = false; el.classList.remove('peek'); }
      return;
    }
    if (!mascotBox.w || !mascotBox.h) {
      if (mascotBox.dirty) scheduleMascotMeasure();
      if (mascotBox.peek !== false) { mascotBox.peek = false; el.classList.remove('peek'); }
      return;
    }
    const w = mascotBox.w, h = mascotBox.h;
    const L = mascotBox.vw - mascotBox.right - w, T = mascotBox.vh - mascotBox.bottom - h;
    const minX = L + w * 0.12, maxX = L + w * 0.88, minBottomY = T + h * 0.30;
    const avail = M.H - M.tabY - M.gap - M.cardH;
    let hit = false;
    for (let i = 0; i < 7; i++) {
      const p = G.tab[i], len = p.length;
      if (!len) continue;
      const x = M.boardLeft + colX(i);
      if (x >= maxX || x + M.cw <= minX) continue;
      let dn = 0;
      while (dn < len - 1 && !p[dn].up) dn++;
      const total = dn * M.downGap + Math.max(0, len - dn - 1) * M.upGap;
      const s = total > avail && total > 0 ? Math.max(0.2, avail / total) : 1;
      const bottomY = M.boardTop + M.tabY + total * s + M.cardH;
      if (bottomY > minBottomY) { hit = true; break; }
    }
    if (mascotBox.peek !== hit) {
      mascotBox.peek = hit;
      el.classList.toggle('peek', hit);
    }
  }

  // ---------------------------------------------------------------- effects
  const FX = (() => {
    const cv = $('#fx'), cx = cv.getContext('2d');
    let parts = [], raf = null, W = 0, H = 0, dpr = 1;
    const COLORS = ['#2ce8a2', '#ffb638', '#ffe169', '#4dffb5', '#ff8e6e', '#9d8cff', '#ff5c8a', '#ffffff'];
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
    }
    resize(); addEventListener('resize', resize);
    function add(p) { parts.push(p); if (!raf) raf = requestAnimationFrame(loop); }
    const HEART_COLORS = ['#ff5c8a', '#ff8fab', '#ffe169', '#ffb638', '#4dffb5', '#ffffff'];
    function burst(x, y, n = 16) {
      if (settings.anim === 'off') return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 1.6 + Math.random() * 3.8;
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, g: 0.09, life: 0, max: 35 + Math.random() * 25,
          size: 3 + Math.random() * 4.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
          shape: pick(['diamond', 'star', 'heart']), color: pick(COLORS) });
      }
    }
    function hearts(x, y, n = 12) {
      if (settings.anim === 'off') return;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1, s = 1.3 + Math.random() * 2.8;
        add({ x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 14,
          vx: Math.cos(a) * s * 0.75, vy: Math.sin(a) * s - 0.9, g: -0.015, life: 0, max: 42 + Math.random() * 26,
          size: 4.2 + Math.random() * 4.8, rot: (Math.random() - 0.5) * 0.5, vr: (Math.random() - 0.5) * 0.08,
          sway: Math.random() * Math.PI * 2, shape: i % 4 === 3 ? 'star' : 'heart', color: pick(HEART_COLORS) });
      }
    }
    function celebrate() {
      const n = settings.anim === 'off' ? 60 : 210;
      for (let i = 0; i < n; i++) {
        add({ x: Math.random() * W, y: -20 - Math.random() * H * 0.8, vx: (Math.random() - 0.5) * 2.2, vy: 1 + Math.random() * 2.6,
          g: 0.02, life: 0, max: 420 + Math.random() * 240, size: 5 + Math.random() * 7, rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.16, shape: pick(['diamond', 'star', 'heart', 'petal', 'circle']), color: pick(COLORS),
          sway: Math.random() * Math.PI * 2 });
      }
    }
    function shape(s, r) {
      cx.beginPath();
      if (s === 'circle') cx.arc(0, 0, Math.max(0.5, r * 0.55), 0, Math.PI * 2);
      else if (s === 'diamond') {
        cx.moveTo(0, -r * 1.15); cx.lineTo(r * 0.72, 0); cx.lineTo(0, r * 1.15); cx.lineTo(-r * 0.72, 0);
        cx.closePath();
      } else if (s === 'star') {
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; cx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        cx.closePath();
      } else if (s === 'heart') {
        cx.moveTo(0, r * 0.9);
        cx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.35);
        cx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.9);
      } else cx.ellipse(0, 0, Math.max(0.5, r), Math.max(0.5, r * 0.55), 0, 0, Math.PI * 2);
      cx.fill();
    }
    function loop() {
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, W, H);
      let w = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.life++; p.vy += p.g;
        if (p.sway !== undefined) { p.sway += 0.05; p.x += Math.sin(p.sway) * 0.9; p.vy = Math.min(p.vy, 3); }
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        const alpha = Math.min(1, (p.max - p.life) / 30);
        if (alpha <= 0 || p.y > H + 40) continue;
        cx.save(); cx.globalAlpha = alpha; cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.color;
        shape(p.shape, p.size); cx.restore();
        parts[w++] = p;
      }
      parts.length = w;
      if (w) raf = requestAnimationFrame(loop);
      else { cx.clearRect(0, 0, W, H); raf = null; }
    }
    return { burst, hearts, celebrate };
  })();
  function sparkleAt(el) {
    const r = el.getBoundingClientRect();
    FX.burst(r.left + r.width / 2, r.top + r.height / 2);
  }

  // ---------------------------------------------------------------- 4-Layer Hyper Pop-Up FX (#popupLayer, #eventFeed, #calloutBanner)
  PopupFX = (() => {
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

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
      ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
    ));
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

  // ---------------------------------------------------------------- Prism dynamic stage (#bgCanvas) & combo timer loop
  StageBG = (() => {
    const cv = $('#bgCanvas'), cx = cv ? cv.getContext('2d') : null;
    const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const PALETTES = {
      prism:  { a: [44, 232, 162],  b: [255, 182, 56],  acc: [255, 225, 105], dark: true },
      night:  { a: [157, 140, 255], b: [255, 142, 110], acc: [196, 181, 255], dark: true },
      sakura: { a: [255, 92, 138],  b: [46, 196, 182],  acc: [255, 143, 177], dark: false },
      ramune: { a: [41, 121, 255],  b: [255, 171, 0],   acc: [92, 164, 255],  dark: false },
      matcha: { a: [31, 184, 121],  b: [255, 127, 80],  acc: [78, 214, 154],  dark: false },
    };
    let pal = { a: [44, 232, 162], b: [255, 182, 56], acc: [255, 225, 105], dark: true };
    let W = 0, H = 0, dpr = 1, raf = null, lastWall = Date.now(), hiddenAt = 0, resizeRaf = 0;
    // The backdrop drifts slowly, so it is redrawn at ~30 fps instead of every display refresh (60–144 Hz):
    // each redraw composites several full-screen layers. The combo timer still updates every frame.
    const STAGE_FRAME_MS = 1000 / 30;
    let stageAccMs = STAGE_FRAME_MS;
    let timeSec = 0, pulseBoost = 0, pulseRGB = [44, 232, 162];
    // Calm ambient backdrop: a faint, static circuit-board pattern with a few lights gliding along its traces and two
    // slowly drifting colour glows. Nothing is tied to the music's beat or scrolls toward the player.
    let traces = [], traceLayer = null;
    let glowA = null, glowB = null, glowPulse = null, glowPulseKey = '';
    const haloCache = new Map();
    const lights = [];

    function makeRadialCanvas(size, rgb) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      const r = size / 2;
      const gr = g.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
      gr.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, size, size);
      return c;
    }
    function haloFor(rgb) {
      const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
      let c = haloCache.get(key);
      if (!c) {
        if (haloCache.size > 16) haloCache.clear();
        c = makeRadialCanvas(128, rgb);
        haloCache.set(key, c);
      }
      return c;
    }
    function buildGlows() {
      glowA = makeRadialCanvas(256, pal.a);
      glowB = makeRadialCanvas(256, pal.b);
      glowPulse = makeRadialCanvas(256, pulseRGB);
      glowPulseKey = `${pulseRGB[0]},${pulseRGB[1]},${pulseRGB[2]}`;
      haloCache.clear();
      haloFor(pal.a);
      haloFor(pal.b);
      haloFor(pal.acc);
    }

    function parseRGB(str, fallback) {
      if (!str) return fallback;
      const s = str.trim();
      const m6 = /^#([0-9a-f]{6})$/i.exec(s);
      if (m6) { const n = parseInt(m6[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
      const m3 = /^#([0-9a-f]{3})$/i.exec(s);
      if (m3) { const h = m3[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]; }
      const mr = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
      if (mr) return [+mr[1], +mr[2], +mr[3]];
      return fallback;
    }
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

    function refreshTheme() {
      const base = PALETTES[settings.theme] || PALETTES.prism;
      const cs = getComputedStyle(document.body);
      const a = parseRGB(cs.getPropertyValue('--beam-a') || cs.getPropertyValue('--accent'), base.a);
      const b = parseRGB(cs.getPropertyValue('--beam-b') || cs.getPropertyValue('--accent2'), base.b);
      const acc = parseRGB(cs.getPropertyValue('--accent'), base.acc);
      const bg = parseRGB(cs.getPropertyValue('--bg1') || cs.getPropertyValue('--bg2') || cs.getPropertyValue('--bg'), null);
      const dark = bg ? (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) / 255 < 0.45 : base.dark;
      pal = { a, b, acc, dark };
      buildGlows();
      paintTraces();
      if (!shouldAnimate()) renderStatic();
      ensureLoop();
    }

    // ---- circuit traces: grid runs that start straight and take occasional 45° bends, never overlapping
    function buildTraces() {
      let seed = 0x5eed1e;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const g = Math.max(34, Math.min(56, Math.min(W, H) / 14));
      const cols = Math.ceil(W / g) + 1, rows = Math.ceil(H / g) + 1;
      const used = new Set();
      const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
      const out = [], count = Math.round((cols * rows) / 9);
      for (let n = 0; n < count * 3 && out.length < count; n++) {
        let x = (rnd() * cols) | 0, y = (rnd() * rows) | 0;
        if (used.has(x + ',' + y)) continue;
        let d = ((rnd() * 4) | 0) * 2;
        const pts = [[x, y]], cells = [x + ',' + y];
        const len = 4 + ((rnd() * 10) | 0);
        for (let s = 0; s < len; s++) {
          if (s > 1 && rnd() < 0.28) d = (d + (rnd() < 0.5 ? 1 : 7)) % 8;
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1], k = nx + ',' + ny;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || used.has(k) || cells.includes(k)) break;
          const last = pts[pts.length - 1], prev = pts[pts.length - 2];
          const straight = prev && last[0] - prev[0] === DIRS[d][0] && last[1] - prev[1] === DIRS[d][1];
          if (straight) { last[0] = nx; last[1] = ny; } else pts.push([nx, ny]);
          x = nx; y = ny; cells.push(k);
        }
        if (cells.length < 4) continue;
        cells.forEach((k) => used.add(k));
        const p = pts.map(([px, py]) => [px * g, py * g]);
        const segs = []; let total = 0;
        for (let i = 1; i < p.length; i++) { const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); segs.push(l); total += l; }
        out.push({ p, segs, total, alt: rnd() < 0.5 });
      }
      traces = out;
    }
    function paintTraces() {
      if (!cv || !W || !H) return;
      traceLayer = traceLayer || document.createElement('canvas');
      traceLayer.width = Math.max(1, Math.floor(W * dpr)); traceLayer.height = Math.max(1, Math.floor(H * dpr));
      const t = traceLayer.getContext('2d');
      t.setTransform(dpr, 0, 0, dpr, 0, 0);
      t.clearRect(0, 0, W, H);
      t.lineCap = 'round'; t.lineJoin = 'round';
      const k = pal.dark ? 1 : 0.75;
      for (const tr of traces) {
        const rgb = tr.alt ? pal.b : pal.a;
        t.strokeStyle = rgba(rgb, 0.11 * k); t.lineWidth = 1.4;
        t.beginPath(); t.moveTo(tr.p[0][0], tr.p[0][1]);
        for (let i = 1; i < tr.p.length; i++) t.lineTo(tr.p[i][0], tr.p[i][1]);
        t.stroke();
        for (const end of [tr.p[0], tr.p[tr.p.length - 1]]) {   // solder pads
          t.strokeStyle = rgba(rgb, 0.18 * k); t.lineWidth = 1.2;
          t.beginPath(); t.arc(end[0], end[1], 3.2, 0, Math.PI * 2); t.stroke();
        }
      }
    }
    function pointOn(tr, dist) {
      let d = Math.max(0, Math.min(tr.total, dist));
      for (let i = 0; i < tr.segs.length; i++) {
        if (d <= tr.segs[i] || i === tr.segs.length - 1) {
          const f = tr.segs[i] ? Math.min(1, d / tr.segs[i]) : 0, a = tr.p[i], b = tr.p[i + 1];
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
        d -= tr.segs[i];
      }
      return tr.p[0];
    }
    function spawnLight(rgb) {
      if (!traces.length || lights.length > 24) return;
      const tr = traces[(Math.random() * traces.length) | 0];
      lights.push({ tr, d: 0, speed: 38 + Math.random() * 34, rgb: rgb || (tr.alt ? pal.b : pal.a), rev: Math.random() < 0.5 });
    }

    function resize() {
      if (!cv || !cx) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      cv.width = Math.max(1, Math.floor(W * dpr));
      cv.height = Math.max(1, Math.floor(H * dpr));
      buildTraces(); lights.length = 0; paintTraces();
      stageAccMs = STAGE_FRAME_MS;  // resizing cleared the canvas: redraw on the next frame
      if (!shouldAnimate()) renderStatic();
    }

    function shouldAnimate() {
      return !!(cv && cx && settings.bgFx && settings.anim !== 'off' && !reduceMQ.matches && !document.hidden);
    }
    function needsComboTick() {
      return !!(G && G.chain > 0 && !G.won && !G.lost && !document.hidden);
    }

    // a game event (card home, combo milestone, ...): a soft glow plus a light or two sent along the traces
    function pulse(colorHex, power = 0.6) {
      const rgb = colorHex ? parseRGB(colorHex, pal.a) : (Math.random() < 0.5 ? pal.a : pal.b);
      pulseBoost = Math.min(1, Math.max(pulseBoost, power * 0.7));
      pulseRGB = rgb;
      const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
      if (key !== glowPulseKey) {
        glowPulseKey = key;
        glowPulse = makeRadialCanvas(256, rgb);
      }
      if (shouldAnimate()) { spawnLight(rgb); if (power >= 0.8) spawnLight(rgb); }
    }

    function tickCombo(now, dtMs) {
      if (!G || G.chain <= 0 || G.won || G.lost) return;
      if (busy || overlayOpen() || document.hidden) {
        G.chainUntil += dtMs;
        return;
      }
      const rem = G.chainUntil - now;
      const ratio = G.chainDur > 0 ? Math.max(0, Math.min(1, rem / G.chainDur)) : 0;
      const fill = DOM.comboFill;
      if (fill) fill.style.transform = `scaleX(${ratio.toFixed(3)})`;
      if (G.chain >= 8 && ratio > 0 && ratio < 0.22 && !G.warnedChain) {
        G.warnedChain = true;
        Sound.sfx.warning?.();
        DOM.comboHud?.classList.add('danger');
      }
      if (rem <= 0) breakChain('timeout');
    }

    function drawStage(dt, isStatic) {
      if (!cv || !cx || W <= 0 || H <= 0) return;
      if (!glowA) buildGlows();
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, W, H);
      const { tier } = tierOf(G ? G.chain : 0);
      const aMul = (!settings.bgFx ? 0.4 : 1) * (pal.dark ? 1 : 0.62);
      if (!isStatic) { timeSec += dt; pulseBoost = Math.max(0, pulseBoost - dt * 0.9); }

      cx.save();
      cx.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over';

      // 1) two soft glows drifting on a ~40 s loop, breathing very slowly
      const R = Math.max(W, H) * 0.62, R2 = R * 2;
      const ax = W * (0.24 + 0.06 * Math.sin(timeSec * 0.15));
      const ay = H * (0.30 + 0.05 * Math.cos(timeSec * 0.12));
      const aa = 0.13 + 0.025 * Math.sin(timeSec * 0.2);
      const bx = W * (0.78 + 0.05 * Math.cos(timeSec * 0.13));
      const by = H * (0.72 + 0.05 * Math.sin(timeSec * 0.11));
      const ba = 0.11 + 0.025 * Math.cos(timeSec * 0.17);
      cx.globalAlpha = Math.max(0, Math.min(1, (aa + tier * 0.012) * aMul));
      cx.drawImage(glowA, ax - R, ay - R, R2, R2);
      cx.globalAlpha = Math.max(0, Math.min(1, (ba + tier * 0.012) * aMul));
      cx.drawImage(glowB, bx - R, by - R, R2, R2);
      if (pulseBoost > 0.02 && glowPulse) {
        const pr = R * 0.8, pr2 = pr * 2;
        cx.globalAlpha = Math.max(0, Math.min(1, pulseBoost * 0.12 * aMul));
        cx.drawImage(glowPulse, W / 2 - pr, H / 2 - pr, pr2, pr2);
      }
      cx.globalAlpha = 1;

      // 2) the static circuit pattern
      if (traceLayer) { cx.globalAlpha = settings.bgFx ? 1 : 0.6; cx.drawImage(traceLayer, 0, 0, W, H); cx.globalAlpha = 1; }

      // 3) lights gliding along traces; a few more of them as the combo climbs
      if (settings.bgFx && !isStatic) {
        const want = 6 + tier * 2;
        if (lights.length < want && Math.random() < dt * 1.2) spawnLight();
        for (let i = lights.length - 1; i >= 0; i--) {
          const L = lights[i];
          L.d += dt * L.speed;
          if (L.d >= L.tr.total) { lights.splice(i, 1); continue; }
          const fade = Math.min(1, L.d / 30, (L.tr.total - L.d) / 30);
          const at = (dd) => pointOn(L.tr, L.rev ? L.tr.total - dd : dd);
          for (let k = 3; k >= 1; k--) {                                 // short fading tail
            const dd = L.d - k * 7;
            if (dd < 0) continue;
            const [x, y] = at(dd);
            cx.fillStyle = rgba(L.rgb, (0.16 / k) * fade * aMul);
            cx.beginPath(); cx.arc(x, y, 1.8, 0, Math.PI * 2); cx.fill();
          }
          const [hx, hy] = at(L.d);
          cx.globalAlpha = Math.max(0, Math.min(1, 0.3 * fade * aMul));
          cx.drawImage(haloFor(L.rgb), hx - 11, hy - 11, 22, 22);
          cx.globalAlpha = 1;
          cx.fillStyle = rgba(L.rgb, 0.75 * fade * aMul);
          cx.beginPath(); cx.arc(hx, hy, 2.2, 0, Math.PI * 2); cx.fill();
        }
      }
      cx.restore();
    }

    function renderStatic() {
      drawStage(0, true);
    }

    function loop() {
      raf = null;
      if (document.hidden) return;
      const now = Date.now();
      const dtMs = Math.max(0, now - lastWall);
      lastWall = now;
      tickCombo(now, dtMs);
      const anim = shouldAnimate();
      if (anim) {
        stageAccMs += dtMs;
        if (stageAccMs >= STAGE_FRAME_MS - 1) {
          drawStage(Math.min(0.05, stageAccMs / 1000), false);
          stageAccMs = 0;
        }
      }
      if (anim || needsComboTick()) raf = requestAnimationFrame(loop);
    }

    function ensureLoop() {
      if (document.hidden) {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        return;
      }
      if (!shouldAnimate() && !needsComboTick()) {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        return;
      }
      if (!raf) {
        lastWall = Date.now();
        stageAccMs = STAGE_FRAME_MS;
        raf = requestAnimationFrame(loop);
      }
    }

    function onVisibility() {
      const now = Date.now();
      if (document.hidden) {
        hiddenAt = now;
        if (raf) { cancelAnimationFrame(raf); raf = null; }
      } else {
        if (hiddenAt && G && G.chain > 0 && !G.won && !G.lost) {
          G.chainUntil += Math.max(0, now - hiddenAt);
        }
        hiddenAt = 0;
        lastWall = now;
        if (!shouldAnimate()) renderStatic();
        ensureLoop();
      }
    }

    resize();
    // a window drag fires many resize events; rebuild the circuit pattern once per frame at most
    addEventListener('resize', () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; resize(); });
    });
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', () => { if (!shouldAnimate()) renderStatic(); ensureLoop(); });
    return { refreshTheme, resize, pulse, ensureLoop, onVisibility, renderStatic };
  })();

  function buildPetals() {
    const box = $('#petals'); box.innerHTML = '';
    if (!settings.petals || settings.anim === 'off') return;
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div'); p.className = 'petal';
      const dur = 10 + Math.random() * 12;
      p.style.left = (Math.random() * 105 - 5) + 'vw';
      p.style.animationDuration = dur + 's';
      p.style.animationDelay = -(Math.random() * dur) + 's';
      p.style.setProperty('--drift', (Math.random() * 16 - 4) + 'vw');
      p.style.setProperty('--s', (0.6 + Math.random() * 0.8).toFixed(2));
      p.innerHTML = `<i style="animation-duration:${(2 + Math.random() * 3).toFixed(2)}s"></i>`;
      box.appendChild(p);
    }
  }

  let toastT = null;
  function toast(msg, ms = 2200) {
    const t = DOM.toast; t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------------------------------------------------------------- overlays
  let askResolve = null;
  function showOverlay(id, silent) {
    const el = OVERLAYS[id] || $('#' + id);
    const wasHidden = el.classList.contains('hidden');
    el.classList.remove('hidden');
    stopAutoStep();
    if (wasHidden && !silent) Sound.sfx.modalOpen?.();
  }
  function hideOverlay(id, silent) {
    const el = OVERLAYS[id] || $('#' + id);
    if (!el) return;
    const wasOpen = !el.classList.contains('hidden');
    el.classList.add('hidden');
    if (id === 'winModal' && DOM.winMascot) DOM.winMascot.innerHTML = '';
    if (id === 'loseModal' && DOM.loseMascot) DOM.loseMascot.innerHTML = '';
    if (wasOpen && !silent) {
      Sound.sfx.modalClose?.();
      if (id === 'loseModal' && G && G.lost) toast('Board locked — press New or Undo ✿', 3000);
    }
    if (id === 'confirmModal' && askResolve) { const r = askResolve; askResolve = null; r(null); }
    scheduleAutoStep(AUTO_STEP_MS);
  }
  function hideAllOverlays() { ['startScreen', 'settingsModal', 'winModal', 'loseModal', 'confirmModal'].forEach((id) => hideOverlay(id, true)); }
  function overlayOpen() { return ['startScreen', 'settingsModal', 'winModal', 'loseModal', 'confirmModal'].some((id) => !(OVERLAYS[id] || $('#' + id))?.classList.contains('hidden')); }

  function ask(text, buttons) {
    return new Promise((res) => {
      if (askResolve) askResolve(null);
      askResolve = res;
      $('#confirmText').innerHTML = text;
      const box = $('#confirmBtns'); box.innerHTML = '';
      buttons.forEach((b) => {
        const el = document.createElement('button');
        el.className = 'btn' + (b.primary ? ' primary' : '');
        el.textContent = b.label;
        el.onclick = () => { Sound.sfx.click(); const r = askResolve; askResolve = null; hideOverlay('confirmModal'); if (r) r(b.value); };
        box.appendChild(el);
      });
      showOverlay('confirmModal');
    });
  }

  async function requestNewGame() {
    if (busy && !(G && G.won)) return;
    if (G && G.started && !G.won) {
      const ans = await ask('Start over? Your current game will be lost (；ω；)', [
        { label: 'New deal ✿', value: 'new', primary: true },
        { label: 'Restart this deal', value: 'restart' },
        { label: 'Keep playing', value: null },
      ]);
      if (ans === 'new') newGame();
      else if (ans === 'restart') newGame({ restart: true });
      return;
    }
    newGame();
  }

  // ---------------------------------------------------------------- settings UI
  const THEMES = [['prism', '◈ Prism Core'], ['night', '🌌 Astral Violet'], ['sakura', '🌸 Neo Blossom'], ['ramune', '⚡ Cobalt Surge'], ['matcha', '🌿 Jade Circuit']];
  const MUSIC_OPTS = [['pulse', '◈ Prism Pulse (165)'], ['redline', '🔥 Redline Rush (178)'], ['horizon', '⚡ Horizon Drive (152)'], ['zenith', '✦ Zenith Core (190)'], ['bounce', '🐾 Neko Bounce (118)'], ['lofi', '🌸 Pastel Lo-fi (76)'], ['lullaby', '🌙 Starlight (64)'], ['off', 'Off']];
  const SCHEMA = [
    { title: 'Gameplay', items: [
      { key: 'difficulty', label: 'Difficulty', type: 'seg', options: Object.keys(DIFF).map((k) => [k, `${DIFF[k].icon} ${DIFF[k].label}`]), hint: () => DIFF[settings.difficulty].desc, nextGame: true },
      { key: 'draw', label: 'Draw mode', type: 'seg', options: [[1, '1 card'], [3, '3 cards']], hint: 'Draw one card at a time, or three (harder!).', nextGame: true },
      { key: 'tapMove', label: 'Tap to auto-move', type: 'toggle', hint: 'Click a card to send it to the best spot.' },
      { key: 'autoFound', label: 'Auto-play to foundations', type: 'toggle', hint: 'Safely sends cards home for you.' },
      { key: 'autoFinish', label: 'Auto-finish', type: 'toggle', hint: 'Finish automatically once every card is revealed.' },
      { key: 'dropGuides', label: 'Highlight valid drops', type: 'toggle', hint: 'Glow where a dragged card can land.' },
      { key: 'leftHanded', label: 'Left-handed layout', type: 'toggle', hint: 'Stock on the right side.' },
      { key: 'detectLoss', label: 'End game when', type: 'seg', options: [['solver', 'Unwinnable'], ['stuck', 'No moves left'], ['off', 'Never']], hint: () => LOSS_HINT[settings.detectLoss] },
    ] },
    { title: 'Look & feel', items: [
      { key: 'theme', label: 'Theme', type: 'seg', options: THEMES },
      { key: 'bgFx', label: 'Prism stage effects', type: 'toggle', hint: 'Ambient circuit-board backdrop with slowly drifting lights.' },
      { key: 'popups', label: 'Pop-up FX', type: 'seg', options: [['max', 'Hyper'], ['normal', 'Standard'], ['off', 'Minimal']], hint: 'Floating score tags, live medal feed, banners & companion stamps.' },
      { key: 'back', label: 'Card back', type: 'backs' },
      { key: 'anim', label: 'Animations', type: 'seg', options: [['normal', 'Normal'], ['fast', 'Fast'], ['off', 'Off']] },
      { key: 'petals', label: 'Falling petals', type: 'toggle' },
      { key: 'showStats', label: 'Show time, moves & score', type: 'toggle' },
    ] },
    { title: 'Companion & voice', items: [
      { key: 'companion', label: 'Partner', type: 'cast' },
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
        } else if (it.type === 'backs') {
          const wrap = document.createElement('div'); wrap.className = 'backs';
          Object.keys(Art.BACKS).forEach((k) => {
            const b = document.createElement('button'); b.type = 'button';
            b.className = 'back-opt' + (settings.back === k ? ' on' : '');
            b.title = Art.BACKS[k].name; b.setAttribute('aria-label', Art.BACKS[k].name);
            b.style.setProperty('--img', Art.backDataURI(k));
            b.onclick = () => { setSetting('back', k); wrap.querySelectorAll('.back-opt').forEach((x) => x.classList.toggle('on', x === b)); };
            wrap.appendChild(b);
          });
          ctl.appendChild(wrap);
        }
        row.appendChild(ctl); body.appendChild(row);
      }
    }
    // stats
    const h = document.createElement('h3'); h.textContent = 'Stats ♡'; body.appendChild(h);
    const st = getStats();
    const rows = Object.keys(DIFF).map((k) => {
      const s = st[k];
      return `<tr><td>${DIFF[k].icon} ${DIFF[k].label}</td><td>${s.played}</td><td>${s.won}</td><td>${s.played ? Math.round(s.won / s.played * 100) : 0}%</td><td>${fmtTime(s.bestTime)}</td><td>${s.bestScore || '—'}</td><td>${s.bestStreak}</td></tr>`;
    }).join('');
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

  const LOSS_HINT = {
    solver: 'A solver checks every line in the background and ends the game as soon as it can no longer be won.',
    stuck: 'Keep playing until no move can put a card home or turn one face-up (shuffling cards around does not count).',
    off: 'Never end the game automatically.',
  };
  function voiceHint() {
    if (Voice.hasClips(settings.companion) || Cast.get(settings.companion).kind === 'cat') return 'Every partner has her own recorded voice.';
    if (!Voice.supported) return 'Your browser has no speech voices — bubbles only.';
    if (settings.voiceLang === 'ja' && !Voice.available('ja')) return "Uses your browser's voices. No Japanese voice found, so English is used.";
    return "Uses your browser's built-in voices (Chrome & Edge sound best).";
  }

  function makeCastPicker() {
    const wrap = document.createElement('div'); wrap.className = 'cast-pick';
    Cast.keys.forEach((k) => {
      const c = Cast.get(k), b = document.createElement('button');
      b.type = 'button'; b.className = 'cast-opt' + (settings.companion === k ? ' on' : '');
      b.dataset.partner = k;
      b.dataset.mood = 'happy';
      b.innerHTML = `<div class="cast-face">${c.html('face')}</div><b>${c.name}</b><small>${c.title}</small>`;
      b.onclick = () => {
        Sound.ensure();
        if (!settings.mascot) setSetting('mascot', true, true);
        setSetting('companion', k, true);
        (Sound.sfx.partnerSelect || Sound.sfx.click)?.(k);
        document.querySelectorAll('.cast-pick').forEach((p) => p.querySelectorAll('.cast-opt').forEach((x, i) => x.classList.toggle('on', Cast.keys[i] === k)));
        const picked = Cast.get(k);
        const pTone = k === 'kira' || k === 'mio' ? 'emerald' : k === 'ayame' ? 'danger' : k === 'yuki' ? 'violet' : 'amber';
        PopupFX?.pill('♡', `PARTNER // ${picked.name.toUpperCase()}`, picked.title.toUpperCase(), pTone, { always: true });
        PopupFX?.stamp('HELLO!', picked.moods?.hello || 'happy', pTone === 'danger' ? 'amber' : pTone, true);
        Companion.react('hello');
      };
      wrap.appendChild(b);
    });
    return wrap;
  }

  function updateSettingsNote() {
    const pending = G && (G.difficulty !== settings.difficulty || G.draw !== settings.draw);
    DOM.settingsNote.classList.toggle('hidden', !pending);
  }

  const cleanOptLabel = (list, key) => {
    const hit = list.find((x) => x[0] === key);
    return hit ? hit[1].replace(/^[^\wA-Za-z0-9]+\s*/, '').toUpperCase() : String(key).toUpperCase();
  };

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
    if (key === 'difficulty' || key === 'draw') buildStartPickers();
  }

  function applySettings(key) {
    const all = !key;
    document.body.dataset.theme = settings.theme;
    if (all || key === 'back') document.documentElement.style.setProperty('--card-back', Art.backDataURI(settings.back));
    const ms = moveMs();
    document.documentElement.style.setProperty('--move', ms + 'ms');
    document.documentElement.style.setProperty('--flip', (settings.anim === 'off' ? 0 : settings.anim === 'fast' ? 180 : 300) + 'ms');
    if (all || key === 'petals' || key === 'anim') buildPetals();
    if (all || key === 'theme' || key === 'bgFx' || key === 'anim') StageBG.refreshTheme();
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
    Sound.configure({ muted: settings.muted, sfx: settings.sfxVol, music: settings.musicVol, track: settings.music });
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

  function openSettings() { buildSettings(); showOverlay('settingsModal'); }

  function getLocalState() {
    return {
      settings,
      stats: Store.get('stats', {}),
      save: Store.get('save', null),
      meta: Store.getMeta(),
    };
  }

  function applyMergedProgress(p) {
    if (!p || typeof p !== 'object') return;
    const prevSettingsJson = JSON.stringify(settings);
    const prevStatsJson = JSON.stringify(Store.get('stats', {}) || {});
    const prevLeftHanded = settings.leftHanded;
    const prevDetectLoss = settings.detectLoss;
    const prevAutoFinish = settings.autoFinish;

    if (p.settings !== undefined && p.settings && typeof p.settings === 'object') {
      settings = normalizeSettings(p.settings);
      Store.set('settings', settings, { fromRemote: true });
    }

    if (p.stats !== undefined) {
      const nextStats = (p.stats && typeof p.stats === 'object') ? p.stats : {};
      Store.set('stats', nextStats, { fromRemote: true });
    }

    if (p.save !== undefined) {
      const nextSave = validSave(p.save) ? p.save : null;
      Store.set('save', nextSave, { fromRemote: true });
    }

    const curMeta = Store.getMeta();
    const nextMeta = Object.assign({}, curMeta);
    if (typeof p.settingsUpdatedAt === 'number') nextMeta.settingsUpdatedAt = p.settingsUpdatedAt;
    if (typeof p.statsUpdatedAt === 'number') nextMeta.statsUpdatedAt = p.statsUpdatedAt;
    if (typeof p.saveUpdatedAt === 'number') nextMeta.saveUpdatedAt = p.saveUpdatedAt;
    Store.setMeta(nextMeta);

    const nextSettingsJson = JSON.stringify(settings);
    const nextStatsJson = JSON.stringify(Store.get('stats', {}) || {});
    const settingsChanged = prevSettingsJson !== nextSettingsJson;
    const statsChanged = prevStatsJson !== nextStatsJson;

    if (settingsChanged) {
      applySettings();
      buildStartPickers();
    }

    const sv = Store.get('save', null);
    const canContinue = (G && !G.won && G.started) || validSave(sv);
    DOM.btnContinue.classList.toggle('hidden', !canContinue);

    if (G) {
      G.prevBestScore = Math.max(G.prevBestScore || 0, getStats()?.[G.difficulty]?.bestScore || 0);
      if (prevLeftHanded !== settings.leftHanded) { slotsDirty = true; layout(); }
      if (prevAutoFinish !== settings.autoFinish) maybeAutoFinish();
      if (prevDetectLoss !== settings.detectLoss) scheduleCheck();
      updateHUD();
    }

    if (DOM.settingsModal && !DOM.settingsModal.classList.contains('hidden') && (settingsChanged || statsChanged)) {
      const panel = DOM.settingsModal.querySelector('.panel');
      const scrollY = panel ? panel.scrollTop : 0;
      buildSettings();
      if (panel) panel.scrollTop = scrollY;
    }
  }

  function onAuthChanged() {
    if (DOM.settingsModal && !DOM.settingsModal.classList.contains('hidden')) {
      window.Account?.renderSettingsSection?.($('#settingsBody'));
    }
  }

  // ---------------------------------------------------------------- start screen
  function buildStartPickers() {
    const dp = $('#diffPick'); dp.innerHTML = '';
    Object.keys(DIFF).forEach((k) => {
      const d = DIFF[k], b = document.createElement('button');
      b.type = 'button';
      b.className = 'diff-card' + (settings.difficulty === k ? ' on' : '');
      b.innerHTML = `<span class="dc-ic">${d.icon}</span><span class="dc-name">${d.label}</span><span class="dc-desc">${d.desc}</span>`;
      b.onclick = () => { Sound.ensure(); setSetting('difficulty', k); };
      dp.appendChild(b);
    });
    const cp = $('#castPick'), picker = makeCastPicker();
    cp.replaceWith(picker); picker.id = 'castPick';
    const wrap = $('#drawPick'); const fresh = makeSeg([[1, '1 card'], [3, '3 cards']], () => settings.draw, (v) => { Sound.ensure(); setSetting('draw', v); });
    wrap.replaceWith(fresh); fresh.id = 'drawPick';
  }
  function showStart(silent) {
    buildStartPickers();
    const sv = Store.get('save', null);
    const canContinue = (G && !G.won && G.started) || validSave(sv);
    DOM.btnContinue.classList.toggle('hidden', !canContinue);
    showOverlay('startScreen', silent);
  }

  // ---------------------------------------------------------------- idle / timer
  let lastActivity = Date.now(), idleSaid = false;
  function noteActivity() { lastActivity = Date.now(); idleSaid = false; }
  setInterval(() => {
    if (!G || G.won || G.lost || document.hidden || overlayOpen()) return;
    if (G.started && !busy) {
      G.elapsed++;
      DOM.time.textContent = fmtTime(G.elapsed);
      if (G.elapsed % 10 === 0) saveGame();
    }
    if (!idleSaid && Date.now() - lastActivity > 45000) {
      idleSaid = true;
      Companion.react('idle');
    }
  }, 1000);

  // ---------------------------------------------------------------- wiring
  function init() {
    Art.injectDefs();
    buildTable();
    applySettings();
    measure();

    board.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    board.addEventListener('contextmenu', (e) => e.preventDefault());
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        layoutDirty = true;
        scheduleMascotMeasure();
        if (G && !drag) layout({ instant: true });
      }).observe(board);
      window.addEventListener('resize', scheduleMascotMeasure);
    } else {
      window.addEventListener('resize', () => {
        layoutDirty = true;
        scheduleMascotMeasure();
        if (G) layout({ instant: true });
      });
    }

    // any first interaction unlocks audio
    const unlock = () => { Sound.ensure(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    // subtle digital UI & face-up card hover tick delegation
    document.addEventListener('pointerenter', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const t = e.target;
      if (!t || t.nodeType !== 1) return;
      if (!t.disabled && t.matches('.btn, .cast-opt, .diff-card, .seg button, .back-opt, .chip.is-auto')) {
        Sound.sfx.hover?.();
      } else if (!drag && t.classList.contains('card') && t.classList.contains('up')) {
        Sound.sfx.cardHover?.();
      }
    }, true);

    DOM.chipDiff.onclick = () => { if (G && G.difficulty === 'auto') toggleAutoPause(); };
    DOM.chipDiff.onkeydown = (e) => {
      if (G && G.difficulty === 'auto' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleAutoPause();
      }
    };
    $('#btnNew').onclick = () => { Sound.sfx.click(); requestNewGame(); };
    DOM.btnUndo.onclick = undo;
    DOM.btnHint.onclick = hint;
    const btnAcct = $('#btnAccount');
    if (btnAcct) btnAcct.onclick = () => { Sound.ensure(); openSettings(); };
    $('#btnSettings').onclick = () => { Sound.ensure(); openSettings(); Companion.react('settings'); };
    $('#btnSound').onclick = () => {
      Sound.ensure();
      const nextMuted = !settings.muted;
      if (nextMuted) (Sound.sfx.toggleOff || Sound.sfx.click)?.();
      setSetting('muted', nextMuted, true);
      if (!nextMuted) (Sound.sfx.toggleOn || Sound.sfx.click)?.();
      toast(settings.muted ? 'Sound off 🔇' : 'Sound on ♪');
    };
    $('#btnHome').onclick = () => { showStart(); };
    $('#btnAutoFinish').onclick = runAutoFinish;
    $('#btnPlay').onclick = () => {
      Sound.ensure();
      if (G && G.started && !G.won) { hideOverlay('startScreen', true); requestNewGame(); } else newGame();
    };
    $('#btnContinue').onclick = () => {
      Sound.ensure();
      hideOverlay('startScreen');
      if (G && !G.won && G.started) return;
      const sv = Store.get('save', null);
      if (validSave(sv)) loadGame(sv); else newGame();
    };
    $('#btnStartSettings').onclick = () => { Sound.ensure(); openSettings(); };
    $('#btnSettingsNew').onclick = () => { hideOverlay('settingsModal', true); hideOverlay('startScreen', true); requestNewGame(); };
    $('#btnWinNew').onclick = () => { Sound.sfx.click(); newGame(); };
    document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => { hideOverlay(b.dataset.close); }; });
    ['settingsModal', 'winModal', 'loseModal', 'confirmModal'].forEach((id) => {
      $('#' + id)?.addEventListener('pointerdown', (e) => { if (e.target.id === id) hideOverlay(id); });
    });
    const btnSprite = $('#btnSpriteMode');
    if (btnSprite) {
      btnSprite.onclick = (e) => {
        e.stopPropagation();
        Sound.ensure();
        setSetting('spriteMode', settings.spriteMode === 'full' ? 'corner' : 'full');
        Companion.boing();
      };
    }

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

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#confirmModal').classList.contains('hidden')) hideOverlay('confirmModal');
        else if (!$('#settingsModal').classList.contains('hidden')) hideOverlay('settingsModal');
        else if (!$('#winModal').classList.contains('hidden')) hideOverlay('winModal');
        else if (!$('#loseModal')?.classList.contains('hidden')) hideOverlay('loseModal');
        return;
      }
      if (overlayOpen() || e.target.closest('input')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
      else if (e.ctrlKey || e.metaKey || e.altKey) return;
      else if (k === 'u') undo();
      else if (k === 'h') hint();
      else if (k === 'n') requestNewGame();
      else if (k === 'm') $('#btnSound').click();
      else if (k === ' ' || k === 'd') { e.preventDefault(); drawStock(); }
    });

    document.addEventListener('visibilitychange', () => {
      StageBG.onVisibility();
      if (document.hidden) { stopAutoStep(); saveGame(); Sound.suspend(); Companion.silence(); }
      else { Sound.resume(); scheduleAutoStep(AUTO_STEP_MS); }
    });
    window.addEventListener('pagehide', saveGame);

    syncComboHud(false);
    showStart(true);

    // developer hook for automated testing: open index.html?debug
    if (/[?&]debug\b/.test(location.search)) {
      window.__slop = {
        get G() { return G; },
        get combo() { return G ? G.chain : 0; },
        get chain() { return G ? G.chain : 0; },
        get autoPaused() { return autoPaused; },
        cards, settings, setSetting, newGame, moveCards, drawStock, undo,
        autoFoundStep, layout, win, showWinModal, declareLost, showLost, findHints,
        Companion, cutIn, scheduleCheck, detectTouchZone, handleCompanionTouch, FX,
        StageBG, PopupFX, tierOf, syncComboHud, breakChain,
        toggleAutoPause, runAutoTick, solverState,
        Account: window.Account, Store,
      };
    }

    window.Account?.init?.({
      getLocalState,
      applyMergedProgress,
      onAuthChanged,
      toast,
      PopupFX,
      Sound,
      getMeta: Store.getMeta,
      setMeta: Store.setMeta,
      openSettings,
    });
  }

  init();
})();
