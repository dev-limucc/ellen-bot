'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'flows', 'proactive.json'), 'utf8'));

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function parseHM(s) {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  return { h, m };
}

function inActiveHours(date = new Date()) {
  const start = parseHM(CFG.constraints.active_hours.start);
  const end = parseHM(CFG.constraints.active_hours.end);
  const cur = date.getHours() * 60 + date.getMinutes();
  const a = start.h * 60 + start.m;
  const b = end.h * 60 + end.m;
  return cur >= a && cur < b;
}

function shouldFire({ now = Date.now(), lastSeen, lastProactive }) {
  if (!inActiveHours(new Date(now))) return false;
  const silenceMin = (now - (lastSeen || 0)) / 60000;
  if (silenceMin < CFG.trigger.min_silence_minutes) return false;
  const sinceLast = (now - (lastProactive || 0)) / 60000;
  if (sinceLast < CFG.constraints.min_gap_minutes) return false;
  return true;
}

function pickMessage() {
  const includeShark = Math.random() < (CFG.shark_fact_chance || 0.25);
  if (includeShark) {
    const fact = pick(CFG.shark_facts);
    return `shark fact incoming whether you want it or not. ${fact}`;
  }
  return pick(CFG.messages);
}

function noteSeen(user_id) {
  const db = getDb();
  const now = Date.now();
  const row = db.prepare('SELECT * FROM user_state WHERE user_id=?').get(user_id);
  if (row) {
    db.prepare('UPDATE user_state SET last_seen=? WHERE user_id=?').run(now, user_id);
  } else {
    db.prepare('INSERT INTO user_state (user_id,last_seen) VALUES (?,?)').run(user_id, now);
  }
}

function noteProactive(user_id) {
  const db = getDb();
  const now = Date.now();
  const row = db.prepare('SELECT * FROM user_state WHERE user_id=?').get(user_id);
  if (row) db.prepare('UPDATE user_state SET last_proactive=? WHERE user_id=?').run(now, user_id);
  else db.prepare('INSERT INTO user_state (user_id,last_seen,last_proactive) VALUES (?,?,?)').run(user_id, now, now);
}

function getState(user_id) {
  const db = getDb();
  return db.prepare('SELECT * FROM user_state WHERE user_id=?').get(user_id) || null;
}

function startScheduler({ user_id, deliver, intervalMs = 5 * 60 * 1000 }) {
  const handle = setInterval(async () => {
    try {
      const s = getState(user_id);
      if (!s) return;
      if (!shouldFire({ lastSeen: s.last_seen, lastProactive: s.last_proactive })) return;
      const msg = pickMessage();
      await deliver(user_id, msg);
      noteProactive(user_id);
    } catch (e) {
      console.error('proactive tick error', e);
    }
  }, intervalMs);
  handle.unref?.();
  return () => clearInterval(handle);
}

module.exports = { shouldFire, pickMessage, inActiveHours, noteSeen, noteProactive, getState, startScheduler, CFG };
