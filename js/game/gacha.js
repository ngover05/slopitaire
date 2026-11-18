/* Slopitaire — Prism Gacha engine: reward pool, pity rolls, shard crafting, and unlock state. */
'use strict';

const Gacha = (() => {
  const POINTS_PER_PULL = 1500;
  const RATES = { ssr: 0.10, sr: 0.30, r: 0.60 };
  const PITY_SR = 5;
  const PITY_SSR = 10;
  const CRAFT_COSTS = { ssr: 200, sr: 100, r: 45 };
  const DUPE_SHARDS = { ssr: 100, sr: 40, r: 15 };
  const MAX_HISTORY = 20;

  const POOL = [];
  const ITEMS_BY_ID = new Map();
  const BY_RARITY = { ssr: [], sr: [], r: [] };

  function addItem(item) {
    POOL.push(item);
    ITEMS_BY_ID.set(item.id, item);
    BY_RARITY[item.rarity].push(item);
  }

  function buildPool() {
    if (typeof Cast !== 'undefined' && Array.isArray(Cast.girlKeys)) {
      Cast.girlKeys.forEach((girlKey) => {
        const c = Cast.get ? Cast.get(girlKey) : Cast.CAST?.[girlKey];
        if (!c || !Array.isArray(c.skinKeys)) return;
        c.skinKeys.forEach((skinKey) => {
          if (skinKey === 'default') return;
          const skin = (c.skins && c.skins[skinKey]) || {};
          const skinName = skin.name || skinKey;
          addItem({
            id: 'skin:' + girlKey + ':' + skinKey,
            type: 'skin',
            rarity: 'ssr',
            key: skinKey,
            girl: girlKey,
            name: c.name + ' · ' + skinName,
            shortName: c.name + ' (' + skinName + ')',
            subtitle: skin.subtitle || c.title || 'Companion Outfit',
            craftCost: CRAFT_COSTS.ssr,
            dupeShards: DUPE_SHARDS.ssr,
          });
        });
      });
    }

    if (typeof Art !== 'undefined' && Art.FRONTS) {
      Object.keys(Art.FRONTS).forEach((frontKey) => {
        if (frontKey === 'classic') return;
        const f = Art.FRONTS[frontKey] || {};
        const label = f.name || frontKey;
        addItem({
          id: 'front:' + frontKey,
          type: 'front',
          rarity: 'sr',
          key: frontKey,
          girl: null,
          name: label + ' Front',
          shortName: label,
          subtitle: f.subtitle || 'Custom Card Front',
          craftCost: CRAFT_COSTS.sr,
          dupeShards: DUPE_SHARDS.sr,
        });
      });
    }

    if (typeof Art !== 'undefined' && Art.BACKS) {
      Object.keys(Art.BACKS).forEach((backKey) => {
        if (backKey === 'sakura') return;
        const b = Art.BACKS[backKey] || {};
        const label = b.name || backKey;
        addItem({
          id: 'back:' + backKey,
          type: 'back',
          rarity: 'r',
          key: backKey,
          girl: null,
          name: label + ' Back',
          shortName: label,
          subtitle: b.subtitle || 'Custom Card Back',
          craftCost: CRAFT_COSTS.r,
          dupeShards: DUPE_SHARDS.r,
        });
      });
    }
  }

  buildPool();

  const toNonNegInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const clampInt = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function normalize(raw) {
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const unlockedSet = new Set();
    if (Array.isArray(src.unlocked)) {
      src.unlocked.forEach((id) => {
        if (typeof id === 'string' && ITEMS_BY_ID.has(id)) unlockedSet.add(id);
      });
    }
    const history = [];
    if (Array.isArray(src.history)) {
      for (let i = 0; i < src.history.length && history.length < MAX_HISTORY; i++) {
        const h = src.history[i];
        if (!h || typeof h !== 'object') continue;
        const item = ITEMS_BY_ID.get(h.id);
        if (!item) continue;
        history.push({
          id: item.id,
          rarity: item.rarity,
          isNew: Boolean(h.isNew),
          shardsGained: toNonNegInt(h.shardsGained),
          crafted: Boolean(h.crafted),
          at: toNonNegInt(h.at),
        });
      }
    }
    return {
      v: 1,
      pulls: toNonNegInt(src.pulls),
      shards: toNonNegInt(src.shards),
      pointCarry: clampInt(toNonNegInt(src.pointCarry), 0, POINTS_PER_PULL - 1),
      pitySsr: clampInt(toNonNegInt(src.pitySsr), 0, PITY_SSR - 1),
      pitySr: clampInt(toNonNegInt(src.pitySr), 0, PITY_SR - 1),
      totalPulls: toNonNegInt(src.totalPulls),
      unlocked: [...unlockedSet].sort(),
      history,
    };
  }

  let state = normalize(typeof Store !== 'undefined' ? Store.get('gacha', null) : null);
  let unlockedSet = new Set(state.unlocked);
  const listeners = new Set();

  function cloneState(src = state) {
    return {
      v: src.v,
      pulls: src.pulls,
      shards: src.shards,
      pointCarry: src.pointCarry,
      pitySsr: src.pitySsr,
      pitySr: src.pitySr,
      totalPulls: src.totalPulls,
      unlocked: src.unlocked.slice(),
      history: src.history.map((h) => Object.assign({}, h)),
    };
  }

  function saveState(opts) {
    if (typeof Store !== 'undefined' && Store.set) {
      Store.set('gacha', cloneState(state), opts);
    }
  }

  function notify() {
    if (!listeners.size) return;
    const snap = cloneState(state);
    [...listeners].forEach((fn) => {
      try { fn(snap); } catch (e) { console.error(e); }
    });
  }

  function getState() {
    return cloneState(state);
  }

  function setState(raw, opts) {
    state = normalize(raw);
    unlockedSet = new Set(state.unlocked);
    saveState(opts);
    notify();
    return getState();
  }

  function isSkinUnlocked(girlKey, skinKey) {
    if (skinKey === 'default') return true;
    if (!girlKey || !skinKey) return false;
    return unlockedSet.has('skin:' + girlKey + ':' + skinKey);
  }

  function isFrontUnlocked(frontKey) {
    if (frontKey === 'classic') return true;
    if (!frontKey) return false;
    return unlockedSet.has('front:' + frontKey);
  }

  function isBackUnlocked(backKey) {
    if (backKey === 'sakura') return true;
    if (!backKey) return false;
    return unlockedSet.has('back:' + backKey);
  }

  function isUnlocked(itemId) {
    if (typeof itemId !== 'string' || !itemId) return false;
    if (itemId === 'front:classic' || itemId === 'back:sakura') return true;
    if (itemId.startsWith('skin:')) {
      const parts = itemId.split(':');
      if (parts.length === 3 && parts[2] === 'default') {
        if (typeof Cast === 'undefined' || !Cast.CAST) return true;
        return Object.prototype.hasOwnProperty.call(Cast.CAST, parts[1]);
      }
    }
    return unlockedSet.has(itemId);
  }

  function getItem(itemId) {
    return ITEMS_BY_ID.get(itemId) || null;
  }

  function getCollectionStats() {
    const byRarity = {
      ssr: { owned: 0, total: 0 },
      sr: { owned: 0, total: 0 },
      r: { owned: 0, total: 0 },
    };
    const byType = {
      skin: { owned: 0, total: 0 },
      front: { owned: 0, total: 0 },
      back: { owned: 0, total: 0 },
    };
    let owned = 0;
    POOL.forEach((item) => {
      byRarity[item.rarity].total++;
      byType[item.type].total++;
      if (unlockedSet.has(item.id)) {
        owned++;
        byRarity[item.rarity].owned++;
        byType[item.type].owned++;
      }
    });
    return { total: POOL.length, owned, byRarity, byType };
  }

  function awardWin(finalScore, difficulty) {
    if (difficulty === 'auto') {
      return {
        pullsEarned: 0,
        autoExcluded: true,
        prevCarry: state.pointCarry,
        nextCarry: state.pointCarry,
        pointsAdded: 0,
        pointsPerPull: POINTS_PER_PULL,
        totalPullsAvailable: state.pulls,
        boostedMin: false,
      };
    }
    const prevCarry = state.pointCarry;
    const rawPts = Number(finalScore);
    const pts = Number.isFinite(rawPts) ? Math.max(0, Math.floor(rawPts)) : 0;
    const combined = prevCarry + pts;
    const rawPulls = Math.floor(combined / POINTS_PER_PULL);
    let pullsEarned;
    let nextCarry;
    let boostedMin;
    if (rawPulls >= 1) {
      pullsEarned = rawPulls;
      nextCarry = combined % POINTS_PER_PULL;
      boostedMin = false;
    } else {
      // Every manual win guarantees at least 1 pull even on fast/low-scoring clears.
      pullsEarned = 1;
      nextCarry = 0;
      boostedMin = true;
    }
    state.pulls += pullsEarned;
    state.pointCarry = nextCarry;
    if (pullsEarned > 0 && typeof Store !== 'undefined' && Store.recordGuestGachaDelta) {
      Store.recordGuestGachaDelta({ pullsEarned });
    }
    saveState({ immediate: true });
    notify();
    return {
      pullsEarned,
      autoExcluded: false,
      prevCarry,
      nextCarry,
      pointsAdded: pts,
      pointsPerPull: POINTS_PER_PULL,
      totalPullsAvailable: state.pulls,
      boostedMin,
    };
  }

  function rollRarity() {
    if (state.pitySsr >= PITY_SSR - 1) return 'ssr';
    if (state.pitySr >= PITY_SR - 1) return Math.random() < 0.25 ? 'ssr' : 'sr';
    const r = Math.random();
    if (r < RATES.ssr) return 'ssr';
    if (r < RATES.ssr + RATES.sr) return 'sr';
    return 'r';
  }

  function pushHistory(entry) {
    state.history.unshift(entry);
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
  }

  function rollOnce(at) {
    let rarity = rollRarity();
    let tierPool = BY_RARITY[rarity];
    if (!tierPool || !tierPool.length) {
      tierPool = POOL;
      rarity = POOL[0]?.rarity || rarity;
    }
    const item = tierPool[(Math.random() * tierPool.length) | 0];

    if (rarity === 'ssr') {
      state.pitySsr = 0;
      state.pitySr = 0;
    } else if (rarity === 'sr') {
      state.pitySsr = clampInt(state.pitySsr + 1, 0, PITY_SSR - 1);
      state.pitySr = 0;
    } else {
      state.pitySsr = clampInt(state.pitySsr + 1, 0, PITY_SSR - 1);
      state.pitySr = clampInt(state.pitySr + 1, 0, PITY_SR - 1);
    }
    state.totalPulls += 1;

    const isNew = !unlockedSet.has(item.id);
    let shardsGained = 0;
    if (isNew) {
      unlockedSet.add(item.id);
      state.unlocked = [...unlockedSet].sort();
    } else {
      shardsGained = item.dupeShards;
      state.shards += shardsGained;
    }

    pushHistory({
      id: item.id,
      rarity: item.rarity,
      isNew,
      shardsGained,
      crafted: false,
      at,
    });

    return { item, rarity: item.rarity, isNew, shardsGained };
  }

  function pull(count = 1) {
    if (!Number.isInteger(count) || count < 1 || count > 10) return null;
    if (state.pulls < count || !POOL.length) return null;

    state.pulls -= count;
    const now = Date.now();
    const results = [];
    let totalDupeShards = 0;
    for (let i = 0; i < count; i++) {
      const rolled = rollOnce(now);
      results.push(rolled);
      totalDupeShards += rolled.shardsGained;
    }
    if (typeof Store !== 'undefined' && Store.recordGuestGachaDelta) {
      Store.recordGuestGachaDelta({ pullsSpent: count, shardsEarned: totalDupeShards });
    }
    saveState({ immediate: true });
    notify();
    return { results, state: getState() };
  }

  function craft(itemId) {
    const item = ITEMS_BY_ID.get(itemId);
    if (!item) return { ok: false, reason: 'unknown' };
    if (unlockedSet.has(item.id)) return { ok: false, reason: 'owned' };
    if (state.shards < item.craftCost) return { ok: false, reason: 'insufficient' };

    state.shards -= item.craftCost;
    unlockedSet.add(item.id);
    state.unlocked = [...unlockedSet].sort();
    pushHistory({
      id: item.id,
      rarity: item.rarity,
      isNew: true,
      shardsGained: 0,
      crafted: true,
      at: Date.now(),
    });

    if (typeof Store !== 'undefined' && Store.recordGuestGachaDelta) {
      Store.recordGuestGachaDelta({ shardsSpent: item.craftCost });
    }
    saveState({ immediate: true });
    notify();
    return { ok: true, item, state: getState() };
  }

  function resolveItemSpec(itemId) {
    if (typeof itemId !== 'string' || !itemId) return null;
    const item = ITEMS_BY_ID.get(itemId);
    if (item) return item;
    if (itemId === 'front:classic') return { type: 'front', key: 'classic', girl: null };
    if (itemId === 'back:sakura') return { type: 'back', key: 'sakura', girl: null };
    if (itemId.startsWith('skin:')) {
      const parts = itemId.split(':');
      if (parts.length === 3 && parts[2] === 'default') {
        return { type: 'skin', key: 'default', girl: parts[1] };
      }
    }
    return null;
  }

  function equipItem(itemId) {
    if (!isUnlocked(itemId)) return false;
    const spec = resolveItemSpec(itemId);
    if (!spec) return false;
    if (spec.type === 'skin') {
      return typeof setGirlSkin === 'function' ? !!setGirlSkin(spec.girl, spec.key) : false;
    }
    if (spec.type === 'front' || spec.type === 'back') {
      if (typeof setSetting !== 'function' || typeof settings === 'undefined') return false;
      setSetting(spec.type, spec.key);
      return settings[spec.type] === spec.key;
    }
    return false;
  }

  function isItemEquipped(itemId) {
    const spec = resolveItemSpec(itemId);
    if (!spec) return false;
    if (spec.type === 'skin') {
      if (typeof skinFor === 'function') return skinFor(spec.girl) === spec.key;
      if (typeof settings !== 'undefined' && settings?.skins) {
        return (settings.skins[spec.girl] || 'default') === spec.key;
      }
      return false;
    }
    if (spec.type === 'front' || spec.type === 'back') {
      return typeof settings !== 'undefined' && settings?.[spec.type] === spec.key;
    }
    return false;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    POINTS_PER_PULL,
    RATES,
    PITY_SR,
    PITY_SSR,
    CRAFT_COSTS,
    DUPE_SHARDS,
    POOL,
    ITEMS_BY_ID,
    normalize,
    getState,
    setState,
    isUnlocked,
    isSkinUnlocked,
    isFrontUnlocked,
    isBackUnlocked,
    getItem,
    getCollectionStats,
    awardWin,
    pull,
    craft,
    equipItem,
    isItemEquipped,
    onChange,
  };
})();
window.Gacha = Gacha;
