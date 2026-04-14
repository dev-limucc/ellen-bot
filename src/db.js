'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let _db = null;

function getDb() {
  if (_db) return _db;
  const dbPath = process.env.ELLEN_DB_PATH || path.join(__dirname, '..', 'data', 'ellen.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      fire_at INTEGER NOT NULL,
      recurrence TEXT,
      fired INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders(fire_at, fired);

    CREATE TABLE IF NOT EXISTS user_state (
      user_id TEXT PRIMARY KEY,
      last_seen INTEGER NOT NULL,
      last_proactive INTEGER NOT NULL DEFAULT 0,
      personal_streak INTEGER NOT NULL DEFAULT 0,
      personal_streak_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const exists = db.prepare("SELECT value FROM meta WHERE key='first_run'").get();
  if (!exists) {
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('first_run', String(Date.now()));
  }
}

function reset() {
  if (_db) { try { _db.close(); } catch (_) {} _db = null; }
}

module.exports = { getDb, reset };
