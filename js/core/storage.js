/* Slopitaire — localStorage wrapper with sync timestamps and guest stat deltas. */
'use strict';

const META_KEYS = new Set(['settings', 'stats', 'save', 'gacha']);
const defaultMeta = () => ({ settingsUpdatedAt: 0, statsUpdatedAt: 0, saveUpdatedAt: 0, gachaUpdatedAt: 0, guestDelta: null, guestGachaDelta: null, deltaId: null, pendingResetStats: false });
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
    if (!STAT_KEY_SET.has(diff) || (field !== 'played' && field !== 'won')) return;
    const meta = Store.getMeta();
    if (!meta.deltaId) meta.deltaId = newDeltaId();
    if (!meta.guestDelta || typeof meta.guestDelta !== 'object') meta.guestDelta = {};
    if (!meta.guestDelta[diff] || typeof meta.guestDelta[diff] !== 'object') meta.guestDelta[diff] = { played: 0, won: 0 };
    meta.guestDelta[diff][field] = (Number(meta.guestDelta[diff][field]) || 0) + 1;
    Store.setMeta(meta);
  },
  recordGuestGachaDelta(delta) {
    if (window.Account?.isSignedIn?.()) return;
    if (!delta || typeof delta !== 'object') return;
    const toNonNegInt = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    };
    const pullsEarned = toNonNegInt(delta.pullsEarned);
    const pullsSpent = toNonNegInt(delta.pullsSpent);
    const shardsEarned = toNonNegInt(delta.shardsEarned);
    const shardsSpent = toNonNegInt(delta.shardsSpent);
    if (!pullsEarned && !pullsSpent && !shardsEarned && !shardsSpent) return;
    const meta = Store.getMeta();
    if (!meta.deltaId) meta.deltaId = newDeltaId();
    const prev = (meta.guestGachaDelta && typeof meta.guestGachaDelta === 'object') ? meta.guestGachaDelta : {};
    meta.guestGachaDelta = {
      pullsEarned: toNonNegInt(prev.pullsEarned) + pullsEarned,
      pullsSpent: toNonNegInt(prev.pullsSpent) + pullsSpent,
      shardsEarned: toNonNegInt(prev.shardsEarned) + shardsEarned,
      shardsSpent: toNonNegInt(prev.shardsSpent) + shardsSpent,
    };
    Store.setMeta(meta);
  },
  set(k, v, opts) {
    try { localStorage.setItem('slopitaire.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
    if (!opts?.fromRemote && META_KEYS.has(k)) {
      const meta = Store.getMeta();
      meta[k + 'UpdatedAt'] = Date.now();
      if (opts?.resetStats) {
        meta.guestDelta = null;
        // Keep deltaId when guest gacha deltas are still pending so sign-in merge stays idempotent
        if (!meta.guestGachaDelta) meta.deltaId = null;
        if (window.Account?.isSignedIn?.()) meta.pendingResetStats = true;
      }
      Store.setMeta(meta);
      window.Account?.onLocalChange?.(k, v, opts);
    }
  },
};
