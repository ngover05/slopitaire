'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DB_PATH = path.join(__dirname, 'data', 'slopitaire.db');

function resolveDbPath(customPath) {
  const raw = (customPath || process.env.SQLITE_PATH || DEFAULT_DB_PATH).trim();
  if (raw === ':memory:' || raw.startsWith('file:')) {
    return raw;
  }
  return path.resolve(raw);
}

function safeJsonParse(raw, fallback = null) {
  if (typeof raw !== 'string' || !raw.length) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function formatProgressRow(row) {
  if (!row) {
    return {
      settings: null,
      settingsUpdatedAt: 0,
      stats: null,
      statsUpdatedAt: 0,
      save: null,
      saveUpdatedAt: 0,
      gacha: null,
      gachaUpdatedAt: 0,
      updatedAt: 0,
    };
  }
  return {
    settings: safeJsonParse(row.settings_json, null),
    settingsUpdatedAt: Number(row.settings_updated_at) || 0,
    stats: safeJsonParse(row.stats_json, null),
    statsUpdatedAt: Number(row.stats_updated_at) || 0,
    save: safeJsonParse(row.save_json, null),
    saveUpdatedAt: Number(row.save_updated_at) || 0,
    gacha: safeJsonParse(row.gacha_json, null),
    gachaUpdatedAt: Number(row.gacha_updated_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

function initSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_sub TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      picture TEXT,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      mode TEXT NOT NULL,
      desktop_redirect TEXT,
      return_to TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

    CREATE TABLE IF NOT EXISTS desktop_tickets (
      ticket_hash TEXT PRIMARY KEY,
      raw_session_token TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_desktop_tickets_expires_at ON desktop_tickets(expires_at);

    CREATE TABLE IF NOT EXISTS user_progress (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings_json TEXT,
      settings_updated_at INTEGER NOT NULL DEFAULT 0,
      stats_json TEXT,
      stats_updated_at INTEGER NOT NULL DEFAULT 0,
      save_json TEXT,
      save_updated_at INTEGER NOT NULL DEFAULT 0,
      gacha_json TEXT,
      gacha_updated_at INTEGER NOT NULL DEFAULT 0,
      applied_delta_ids_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );
  `);

  const progressCols = new Set(
    db.prepare('PRAGMA table_info(user_progress)').all().map((c) => c.name)
  );
  if (!progressCols.has('gacha_json')) {
    db.exec('ALTER TABLE user_progress ADD COLUMN gacha_json TEXT');
  }
  if (!progressCols.has('gacha_updated_at')) {
    db.exec('ALTER TABLE user_progress ADD COLUMN gacha_updated_at INTEGER NOT NULL DEFAULT 0');
  }
}

function openDb(customPath) {
  const dbPath = resolveDbPath(customPath);
  if (dbPath !== ':memory:' && !dbPath.startsWith('file:')) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  initSchema(db);

  const stmts = {
    getUserBySub: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
    insertUser: db.prepare(`
      INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateUserLogin: db.prepare(`
      UPDATE users
      SET email = ?, name = ?, picture = ?, last_login_at = ?
      WHERE id = ?
    `),
    insertSession: db.prepare(`
      INSERT INTO sessions (token_hash, user_id, kind, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    getSessionWithUser: db.prepare(`
      SELECT
        s.token_hash, s.user_id, s.kind, s.created_at AS session_created_at, s.expires_at,
        u.id, u.google_sub, u.email, u.name, u.picture, u.created_at, u.last_login_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    insertOAuthState: db.prepare(`
      INSERT INTO oauth_states (state, code_verifier, mode, desktop_redirect, return_to, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    consumeOAuthState: db.prepare(`
      DELETE FROM oauth_states
      WHERE state = ? AND expires_at > ?
      RETURNING *
    `),
    insertDesktopTicket: db.prepare(`
      INSERT INTO desktop_tickets (ticket_hash, raw_session_token, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `),
    consumeDesktopTicket: db.prepare(`
      DELETE FROM desktop_tickets
      WHERE ticket_hash = ? AND expires_at > ?
      RETURNING *
    `),
    getProgress: db.prepare('SELECT * FROM user_progress WHERE user_id = ?'),
    upsertProgress: db.prepare(`
      INSERT INTO user_progress (
        user_id, settings_json, settings_updated_at,
        stats_json, stats_updated_at,
        save_json, save_updated_at,
        gacha_json, gacha_updated_at,
        applied_delta_ids_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        settings_json = excluded.settings_json,
        settings_updated_at = excluded.settings_updated_at,
        stats_json = excluded.stats_json,
        stats_updated_at = excluded.stats_updated_at,
        save_json = excluded.save_json,
        save_updated_at = excluded.save_updated_at,
        gacha_json = excluded.gacha_json,
        gacha_updated_at = excluded.gacha_updated_at,
        applied_delta_ids_json = excluded.applied_delta_ids_json,
        updated_at = excluded.updated_at
    `),
    pruneSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    pruneOAuthStates: db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?'),
    pruneDesktopTickets: db.prepare('DELETE FROM desktop_tickets WHERE expires_at <= ?'),
  };

  function pruneExpired(now = Date.now()) {
    stmts.pruneSessions.run(now);
    stmts.pruneOAuthStates.run(now);
    stmts.pruneDesktopTickets.run(now);
  }

  function getProgressForUser(userId) {
    const row = stmts.getProgress.get(userId);
    return formatProgressRow(row);
  }

  function upsertUserByGoogleSub({ id, sub, email, name, picture, now = Date.now() }) {
    const existing = stmts.getUserBySub.get(sub);
    if (existing) {
      stmts.updateUserLogin.run(email, name, picture || null, now, existing.id);
      return {
        id: existing.id,
        google_sub: sub,
        email,
        name,
        picture: picture || null,
        created_at: existing.created_at,
        last_login_at: now,
      };
    }
    stmts.insertUser.run(id, sub, email, name, picture || null, now, now);
    return {
      id,
      google_sub: sub,
      email,
      name,
      picture: picture || null,
      created_at: now,
      last_login_at: now,
    };
  }

  function runImmediateTransaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure if transaction already aborted
      }
      throw err;
    }
  }

  function close() {
    db.close();
  }

  return {
    db,
    dbPath,
    stmts,
    pruneExpired,
    getProgressForUser,
    upsertUserByGoogleSub,
    runImmediateTransaction,
    close,
  };
}

module.exports = {
  DEFAULT_DB_PATH,
  resolveDbPath,
  openDb,
  formatProgressRow,
  safeJsonParse,
};
