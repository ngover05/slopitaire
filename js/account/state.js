/* Slopitaire account — sign-in & sync state, the game hooks it was started with, and the local progress snapshot. */
'use strict';

const DEFAULT_SERVER_URL = 'http://localhost:3000';
const SYNC_DEBOUNCE_MS = 900;
const BACKUP_DEBOUNCE_MS = 400;
const STATUS_TIMEOUT_MS = 6000;

// per-variant stat keys, as in statKey() in js/game/config.js and DIFFICULTIES in server/merge.js
const DIFF_KEYS = ['easy', 'medium', 'hard', 'auto'].flatMap((d) => [d, ...['spider', 'freecell', 'pyramid', 'tripeaks'].map((v) => `${v}_${d}`)]);

const isElectron = () => Boolean(window.slopDesktop && window.slopDesktop.isElectron === true);

const accountState = {
  initialized: false,
  configured: null, // null = checking, true = ready, false = unconfigured
  setupHint: '',
  online: true,
  user: null,
  token: null,
  serverUrl: DEFAULT_SERVER_URL,
  syncStatus: 'signed_out', // 'signed_out' | 'unconfigured' | 'synced' | 'syncing' | 'offline' | 'error'
  lastSyncedAt: 0,
  syncError: '',
  signingIn: false,
};

let accountDeps = {};
let syncDirty = false;
let changeSeq = 0;
let syncTimer = null;
let backupTimer = null;
let syncInFlight = null;
let resyncQueued = false;
let microtaskQueued = false;
let mountedSettingsContainer = null;
let authPopupCleanup = null;

function apiBase() {
  if (!isElectron()) return '';
  return (accountState.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
}

function defaultMetaState() {
  return {
    settingsUpdatedAt: 0,
    statsUpdatedAt: 0,
    saveUpdatedAt: 0,
    gachaUpdatedAt: 0,
    guestDelta: null,
    guestGachaDelta: null,
    deltaId: null,
    pendingResetStats: false,
  };
}

function readMetaSafe() {
  if (typeof accountDeps.getMeta === 'function') return accountDeps.getMeta();
  try {
    const raw = localStorage.getItem('slopitaire.meta');
    return Object.assign(defaultMetaState(), raw ? JSON.parse(raw) : null);
  } catch (e) {
    return defaultMetaState();
  }
}

function writeMetaSafe(meta) {
  if (typeof accountDeps.setMeta === 'function') {
    accountDeps.setMeta(meta);
    return;
  }
  try {
    localStorage.setItem('slopitaire.meta', JSON.stringify(meta));
  } catch (e) { /* storage unavailable */ }
}

function getSnapshot() {
  const readJson = (k, d) => {
    try { const v = localStorage.getItem('slopitaire.' + k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  };
  const readGacha = () => {
    if (typeof Gacha !== 'undefined' && Gacha.getState) return Gacha.getState();
    if (typeof Store !== 'undefined' && Store.get) return Store.get('gacha', null);
    return readJson('gacha', null);
  };
  if (typeof accountDeps.getLocalState === 'function') {
    const snap = accountDeps.getLocalState() || {};
    const hasFlatMeta = snap.settingsUpdatedAt !== undefined
      || snap.statsUpdatedAt !== undefined
      || snap.saveUpdatedAt !== undefined
      || snap.gachaUpdatedAt !== undefined
      || snap.guestDelta !== undefined
      || snap.guestGachaDelta !== undefined
      || snap.deltaId !== undefined
      || snap.resetStats !== undefined
      || snap.pendingResetStats !== undefined;
    const meta = snap.meta || (hasFlatMeta ? {
      settingsUpdatedAt: Number(snap.settingsUpdatedAt) || 0,
      statsUpdatedAt: Number(snap.statsUpdatedAt) || 0,
      saveUpdatedAt: Number(snap.saveUpdatedAt) || 0,
      gachaUpdatedAt: Number(snap.gachaUpdatedAt) || 0,
      guestDelta: snap.guestDelta ?? null,
      guestGachaDelta: snap.guestGachaDelta ?? null,
      deltaId: snap.deltaId ?? null,
      pendingResetStats: Boolean(snap.resetStats ?? snap.pendingResetStats),
    } : readMetaSafe());
    return {
      settings: snap.settings ?? null,
      stats: snap.stats ?? {},
      save: snap.save ?? null,
      gacha: snap.gacha !== undefined ? snap.gacha : readGacha(),
      meta,
    };
  }
  return {
    settings: readJson('settings', null),
    stats: readJson('stats', {}),
    save: readJson('save', null),
    gacha: readGacha(),
    meta: readMetaSafe(),
  };
}

function isSignedIn() {
  if (!accountState.user) return false;
  if (isElectron()) return Boolean(accountState.token);
  return true;
}

function statusMeta() {
  if (isSignedIn()) {
    if (accountState.signingIn || accountState.syncStatus === 'syncing') return { key: 'syncing', label: 'Syncing…' };
    if (accountState.syncStatus === 'offline') return { key: 'offline', label: 'Offline' };
    if (accountState.syncStatus === 'error') return { key: 'error', label: 'Offline' };
    return { key: 'synced', label: 'Synced' };
  }
  if (accountState.configured === false) return { key: 'unconfigured', label: 'Setup required' };
  if (!accountState.online) return { key: 'offline', label: 'Offline' };
  return { key: 'signed_out', label: 'Not signed in' };
}
