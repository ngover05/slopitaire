/* Slopitaire — per-variant, per-difficulty play statistics. */
'use strict';

function getStats() {
  const base = () => ({ played: 0, won: 0, bestTime: 0, bestScore: 0, streak: 0, bestStreak: 0 });
  const st = Store.get('stats', {}) || {};
  for (const k of STAT_KEYS) st[k] = Object.assign(base(), st[k]);
  return st;
}
