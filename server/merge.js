'use strict';

// Stats are kept per game variant and difficulty. Klondike keeps the bare difficulty keys it always had;
// the other variants use '<variant>_<difficulty>' (e.g. 'spider_hard'). Must match statKey() in js/game/config.js.
const BASE_DIFFICULTIES = ['easy', 'medium', 'hard', 'auto'];
const VARIANTS = ['spider', 'freecell', 'pyramid', 'tripeaks'];
const DIFFICULTIES = [
  ...BASE_DIFFICULTIES,
  ...VARIANTS.flatMap((v) => BASE_DIFFICULTIES.map((d) => `${v}_${d}`)),
];
const MAX_DELTA_IDS = 32;
const MAX_GACHA_UNLOCKED = 256;
const MAX_GACHA_HISTORY = 20;
const GACHA_ID_RE = /^(skin:[a-z0-9_]+:[a-z0-9_]+|front:[a-z0-9_]+|back:[a-z0-9_]+)$/;
const VALID_GACHA_RARITIES = new Set(['ssr', 'sr', 'r']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

class MergeValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MergeValidationError';
    this.statusCode = 400;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toTimestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function toNonNegInt(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function minPositive(a, b) {
  const x = toNonNegInt(a);
  const y = toNonNegInt(b);
  if (x > 0 && y > 0) return Math.min(x, y);
  return x > 0 ? x : y;
}

function baseDiffStats() {
  return {
    played: 0,
    won: 0,
    bestTime: 0,
    bestScore: 0,
    streak: 0,
    bestStreak: 0,
  };
}

function emptyStats() {
  return Object.fromEntries(DIFFICULTIES.map((d) => [d, baseDiffStats()]));
}

function sanitizeDiffStats(raw) {
  if (!isPlainObject(raw)) return baseDiffStats();
  const played = toNonNegInt(raw.played);
  const won = Math.min(played, toNonNegInt(raw.won));
  const bestTime = toNonNegInt(raw.bestTime);
  const bestScore = toNonNegInt(raw.bestScore);
  const rawStreak = toNonNegInt(raw.streak);
  const bestStreak = Math.max(toNonNegInt(raw.bestStreak), rawStreak);
  const streak = Math.min(bestStreak, rawStreak);
  return { played, won, bestTime, bestScore, streak, bestStreak };
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > 10) return null;
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, depth + 1));
  }
  if (t === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k) || v === undefined || typeof v === 'function' || typeof v === 'symbol') {
        continue;
      }
      out[k] = sanitizeJsonValue(v, depth + 1);
    }
    return out;
  }
  return null;
}

function sanitizeSettings(raw) {
  if (!isPlainObject(raw)) return null;
  return sanitizeJsonValue(raw, 0);
}

function sanitizeSave(raw) {
  if (raw === null) return null;
  if (!isPlainObject(raw)) return null;
  return sanitizeJsonValue(raw, 0);
}

function sanitizeGachaHistoryItem(item) {
  if (!isPlainObject(item) || typeof item.id !== 'string' || !GACHA_ID_RE.test(item.id)) {
    return null;
  }
  const inferredRarity = item.id.startsWith('skin:') ? 'ssr' : item.id.startsWith('front:') ? 'sr' : 'r';
  return {
    id: item.id,
    rarity: VALID_GACHA_RARITIES.has(item.rarity) ? item.rarity : inferredRarity,
    isNew: Boolean(item.isNew),
    shardsGained: toNonNegInt(item.shardsGained),
    crafted: Boolean(item.crafted),
    at: toTimestamp(item.at),
  };
}

function sanitizeGacha(raw) {
  if (!isPlainObject(raw)) return null;
  const unlockedSet = new Set();
  if (Array.isArray(raw.unlocked)) {
    for (const id of raw.unlocked) {
      if (typeof id === 'string' && GACHA_ID_RE.test(id)) {
        unlockedSet.add(id);
      }
    }
  }
  const unlocked = Array.from(unlockedSet).sort().slice(0, MAX_GACHA_UNLOCKED);

  const history = [];
  if (Array.isArray(raw.history)) {
    for (const entry of raw.history) {
      if (history.length >= MAX_GACHA_HISTORY) break;
      const clean = sanitizeGachaHistoryItem(entry);
      if (clean) history.push(clean);
    }
  }

  return {
    v: 1,
    pulls: toNonNegInt(raw.pulls),
    shards: toNonNegInt(raw.shards),
    pointCarry: Math.min(1499, toNonNegInt(raw.pointCarry)),
    pitySsr: Math.min(9, toNonNegInt(raw.pitySsr)),
    pitySr: Math.min(4, toNonNegInt(raw.pitySr)),
    totalPulls: toNonNegInt(raw.totalPulls),
    unlocked,
    history,
  };
}

function parseJsonColumn(raw, fallback) {
  if (typeof raw !== 'string' || !raw.length) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function mergeProgress(existingRow, payload, now = Date.now()) {
  if (!isPlainObject(payload)) {
    throw new MergeValidationError('Sync payload must be a JSON object');
  }

  const hasSettings = Object.prototype.hasOwnProperty.call(payload, 'settings') && payload.settings !== undefined;
  const hasStats = Object.prototype.hasOwnProperty.call(payload, 'stats') && payload.stats !== undefined;
  const hasSave = Object.prototype.hasOwnProperty.call(payload, 'save') && payload.save !== undefined;
  const hasGacha = Object.prototype.hasOwnProperty.call(payload, 'gacha') && payload.gacha !== undefined;
  const hasGachaDelta = Object.prototype.hasOwnProperty.call(payload, 'gachaDelta') && payload.gachaDelta !== undefined;

  if (hasSettings && payload.settings !== null && !isPlainObject(payload.settings)) {
    throw new MergeValidationError('settings must be an object or null');
  }
  if (hasStats && payload.stats !== null && !isPlainObject(payload.stats)) {
    throw new MergeValidationError('stats must be an object or null');
  }
  if (hasSave && payload.save !== null && !isPlainObject(payload.save)) {
    throw new MergeValidationError('save must be an object or null');
  }
  if (hasGacha && payload.gacha !== null && !isPlainObject(payload.gacha)) {
    throw new MergeValidationError('gacha must be an object or null');
  }
  if (hasGachaDelta && payload.gachaDelta !== null && !isPlainObject(payload.gachaDelta)) {
    throw new MergeValidationError('gachaDelta must be an object or null');
  }

  const cloudSettings = existingRow ? sanitizeSettings(parseJsonColumn(existingRow.settings_json, null)) : null;
  const cloudSettingsUpdatedAt = existingRow ? toTimestamp(Number(existingRow.settings_updated_at)) : 0;

  const cloudStatsRaw = existingRow ? parseJsonColumn(existingRow.stats_json, null) : null;
  const cloudStatsUpdatedAt = existingRow ? toTimestamp(Number(existingRow.stats_updated_at)) : 0;

  const cloudSave = existingRow ? sanitizeSave(parseJsonColumn(existingRow.save_json, null)) : null;
  const cloudSaveUpdatedAt = existingRow ? toTimestamp(Number(existingRow.save_updated_at)) : 0;

  const cloudGacha = existingRow ? sanitizeGacha(parseJsonColumn(existingRow.gacha_json, null)) : null;
  const cloudGachaUpdatedAt = existingRow ? toTimestamp(Number(existingRow.gacha_updated_at)) : 0;

  const existingDeltaIds = existingRow ? parseJsonColumn(existingRow.applied_delta_ids_json, []) : [];
  let appliedDeltaIds = Array.isArray(existingDeltaIds)
    ? existingDeltaIds.filter((id) => typeof id === 'string' && id.length > 0).slice(-MAX_DELTA_IDS)
    : [];

  const deltaId = typeof payload.deltaId === 'string' ? payload.deltaId.trim().slice(0, 128) : '';
  const hasGuestDelta = isPlainObject(payload.guestDelta);
  const hasGachaDeltaObj = isPlainObject(payload.gachaDelta);
  const canApplyDelta = Boolean((hasGuestDelta || hasGachaDeltaObj) && deltaId.length > 0 && !appliedDeltaIds.includes(deltaId));
  let deltaConsumed = false;

  // 1. Settings: higher settingsUpdatedAt wins
  const clientSettingsUpdatedAt = toTimestamp(payload.settingsUpdatedAt);
  let nextSettings = cloudSettings;
  let nextSettingsUpdatedAt = cloudSettingsUpdatedAt;
  if (hasSettings && payload.settings !== null) {
    if (clientSettingsUpdatedAt > cloudSettingsUpdatedAt) {
      nextSettings = sanitizeSettings(payload.settings);
      nextSettingsUpdatedAt = clientSettingsUpdatedAt;
    } else if (cloudSettings === null && cloudSettingsUpdatedAt === 0) {
      nextSettings = sanitizeSettings(payload.settings);
      nextSettingsUpdatedAt = clientSettingsUpdatedAt;
    }
  }

  // 2. Stats: resetStats or non-destructive per-difficulty merge + idempotent guestDelta
  const clientStatsUpdatedAt = toTimestamp(payload.statsUpdatedAt);
  let nextStats = null;
  let nextStatsUpdatedAt = cloudStatsUpdatedAt;

  if (payload.resetStats === true) {
    nextStats = emptyStats();
    nextStatsUpdatedAt = Math.max(now, clientStatsUpdatedAt || 0);
  } else {
    const canApplyGuestDelta = canApplyDelta && hasGuestDelta;

    const shouldProduceStats = Boolean(
      isPlainObject(cloudStatsRaw) ||
      (hasStats && payload.stats !== null) ||
      canApplyGuestDelta
    );

    if (shouldProduceStats) {
      const merged = {};
      const clientStatsObj = isPlainObject(payload.stats) ? payload.stats : {};
      const cloudStatsObj = isPlainObject(cloudStatsRaw) ? cloudStatsRaw : {};
      const deltaObj = canApplyGuestDelta ? payload.guestDelta : {};
      const clientStatsNewer = clientStatsUpdatedAt > cloudStatsUpdatedAt || !isPlainObject(cloudStatsRaw);

      for (const diff of DIFFICULTIES) {
        const cloudDiff = sanitizeDiffStats(cloudStatsObj[diff]);
        const clientDiff = sanitizeDiffStats(clientStatsObj[diff]);
        const rawDeltaDiff = canApplyGuestDelta && isPlainObject(deltaObj[diff]) ? deltaObj[diff] : null;
        const deltaPlayed = rawDeltaDiff ? toNonNegInt(rawDeltaDiff.played) : 0;
        const deltaWon = rawDeltaDiff ? toNonNegInt(rawDeltaDiff.won) : 0;

        let played;
        let won;
        if (canApplyGuestDelta) {
          played = Math.max(cloudDiff.played + deltaPlayed, clientDiff.played);
          won = Math.min(played, Math.max(cloudDiff.won + deltaWon, clientDiff.won));
        } else {
          played = Math.max(cloudDiff.played, clientDiff.played);
          won = Math.min(played, Math.max(cloudDiff.won, clientDiff.won));
        }

        const bestScore = Math.max(cloudDiff.bestScore, clientDiff.bestScore);
        const bestStreak = Math.max(cloudDiff.bestStreak, clientDiff.bestStreak);
        const bestTime = minPositive(cloudDiff.bestTime, clientDiff.bestTime);
        const chosenStreak = clientStatsNewer ? clientDiff.streak : cloudDiff.streak;
        const streak = Math.min(bestStreak, chosenStreak);

        merged[diff] = { played, won, bestTime, bestScore, streak, bestStreak };
      }

      nextStats = merged;
      nextStatsUpdatedAt = Math.max(cloudStatsUpdatedAt, clientStatsUpdatedAt);
      if (nextStatsUpdatedAt === 0) {
        const hasAnyStat = DIFFICULTIES.some((d) => {
          const s = merged[d];
          return s.played > 0 || s.won > 0 || s.bestTime > 0 || s.bestScore > 0 || s.streak > 0 || s.bestStreak > 0;
        });
        if (hasAnyStat) nextStatsUpdatedAt = 1;
      }
      if (canApplyGuestDelta) {
        deltaConsumed = true;
      }
    }
  }

  // 3. Save: higher saveUpdatedAt wins (explicit null allowed to clear save on win/loss)
  const clientSaveUpdatedAt = toTimestamp(payload.saveUpdatedAt);
  let nextSave = cloudSave;
  let nextSaveUpdatedAt = cloudSaveUpdatedAt;
  if (hasSave) {
    if (clientSaveUpdatedAt > cloudSaveUpdatedAt) {
      nextSave = sanitizeSave(payload.save);
      nextSaveUpdatedAt = clientSaveUpdatedAt;
    } else if (cloudSave === null && cloudSaveUpdatedAt === 0 && payload.save !== null) {
      nextSave = sanitizeSave(payload.save);
      nextSaveUpdatedAt = clientSaveUpdatedAt || 1;
    }
  }

  // 4. Gacha: always preserve unlocked union, apply guest gachaDelta once via deltaId, and take newer counters
  const clientGacha = (hasGacha && payload.gacha !== null) ? sanitizeGacha(payload.gacha) : null;
  const clientGachaUpdatedAt = toTimestamp(payload.gachaUpdatedAt);
  const canApplyGachaDelta = canApplyDelta && hasGachaDeltaObj;

  let nextGacha = null;
  let nextGachaUpdatedAt = cloudGachaUpdatedAt;
  if (cloudGacha !== null || clientGacha !== null || canApplyGachaDelta) {
    const unlocked = Array.from(new Set([
      ...(cloudGacha ? cloudGacha.unlocked : []),
      ...(clientGacha ? clientGacha.unlocked : []),
    ])).sort().slice(0, MAX_GACHA_UNLOCKED);

    const clientNewer = Boolean(
      clientGacha !== null &&
      (cloudGacha === null || clientGachaUpdatedAt > cloudGachaUpdatedAt)
    );
    const winner = clientNewer ? clientGacha : (cloudGacha || clientGacha);

    let pulls;
    let shards;
    let totalPulls;
    if (canApplyGachaDelta && (cloudGacha !== null || clientGacha === null)) {
      const d = payload.gachaDelta;
      const basePulls = cloudGacha ? cloudGacha.pulls : 0;
      const baseShards = cloudGacha ? cloudGacha.shards : 0;
      const baseTotalPulls = cloudGacha ? cloudGacha.totalPulls : 0;
      const pullsEarned = toNonNegInt(d.pullsEarned);
      const pullsSpent = toNonNegInt(d.pullsSpent);
      const shardsEarned = toNonNegInt(d.shardsEarned);
      const shardsSpent = toNonNegInt(d.shardsSpent);
      pulls = Math.max(0, basePulls + pullsEarned - pullsSpent);
      shards = Math.max(0, baseShards + shardsEarned - shardsSpent);
      totalPulls = Math.max(baseTotalPulls + pullsSpent, clientGacha?.totalPulls || 0);
    } else {
      pulls = winner.pulls;
      shards = winner.shards;
      totalPulls = Math.max(cloudGacha?.totalPulls || 0, clientGacha?.totalPulls || 0);
    }

    nextGacha = {
      v: 1,
      pulls,
      shards,
      pointCarry: winner ? winner.pointCarry : 0,
      pitySsr: winner ? winner.pitySsr : 0,
      pitySr: winner ? winner.pitySr : 0,
      totalPulls,
      unlocked,
      history: winner ? winner.history.slice(0, MAX_GACHA_HISTORY) : [],
    };

    nextGachaUpdatedAt = Math.max(cloudGachaUpdatedAt, clientGachaUpdatedAt);
    if (nextGachaUpdatedAt === 0) {
      nextGachaUpdatedAt = 1;
    }
    if (canApplyGachaDelta) {
      deltaConsumed = true;
    }
  }

  if (deltaConsumed) {
    appliedDeltaIds.push(deltaId);
    if (appliedDeltaIds.length > MAX_DELTA_IDS) {
      appliedDeltaIds = appliedDeltaIds.slice(-MAX_DELTA_IDS);
    }
  }

  const updatedAt = Math.max(now, nextSettingsUpdatedAt, nextStatsUpdatedAt, nextSaveUpdatedAt, nextGachaUpdatedAt);

  return {
    row: {
      settings_json: nextSettings !== null ? JSON.stringify(nextSettings) : null,
      settings_updated_at: nextSettingsUpdatedAt,
      stats_json: nextStats !== null ? JSON.stringify(nextStats) : null,
      stats_updated_at: nextStatsUpdatedAt,
      save_json: nextSave !== null ? JSON.stringify(nextSave) : null,
      save_updated_at: nextSaveUpdatedAt,
      gacha_json: nextGacha !== null ? JSON.stringify(nextGacha) : null,
      gacha_updated_at: nextGachaUpdatedAt,
      applied_delta_ids_json: JSON.stringify(appliedDeltaIds),
      updated_at: updatedAt,
    },
    progress: {
      settings: nextSettings,
      settingsUpdatedAt: nextSettingsUpdatedAt,
      stats: nextStats,
      statsUpdatedAt: nextStatsUpdatedAt,
      save: nextSave,
      saveUpdatedAt: nextSaveUpdatedAt,
      gacha: nextGacha,
      gachaUpdatedAt: nextGachaUpdatedAt,
      updatedAt,
    },
    appliedDeltaIds,
  };
}

module.exports = {
  DIFFICULTIES,
  MAX_DELTA_IDS,
  MergeValidationError,
  mergeProgress,
  emptyStats,
  sanitizeSettings,
  sanitizeSave,
  sanitizeGacha,
  isPlainObject,
};
