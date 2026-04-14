'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'flows', 'reminders.json'), 'utf8'));

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// parse: "remind me in 5 minutes to drink water" / "remind me at 14:30 to call mom" / simple forms
function parseReminder(text, now = Date.now()) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase();

  let m = t.match(/remind\s+me\s+in\s+(\d+)\s*(second|seconds|sec|secs|s|minute|minutes|min|mins|m|hour|hours|hr|hrs|h|day|days|d)\s*(?:to\s+)?(.+)?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const body = (m[3] || '').trim() || 'reminder';
    let ms = n * 1000;
    if (/^min|^m$/i.test(unit)) ms = n * 60 * 1000;
    else if (/^h|^hour|^hr/i.test(unit)) ms = n * 60 * 60 * 1000;
    else if (/^d|^day/i.test(unit)) ms = n * 24 * 60 * 60 * 1000;
    return { fire_at: now + ms, text: body };
  }

  m = t.match(/remind\s+me\s+(?:tomorrow\s+)?at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to\s+)?(.+)?/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    const target = new Date(now);
    target.setHours(h, min, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);
    return { fire_at: target.getTime(), text: (m[4] || 'reminder').trim() };
  }

  return null;
}

function add({ user_id, text, fire_at, recurrence = null }) {
  const db = getDb();
  const info = db.prepare('INSERT INTO reminders (user_id,text,fire_at,recurrence,fired,created_at) VALUES (?,?,?,?,0,?)')
    .run(user_id, text, fire_at, recurrence, Date.now());
  return db.prepare('SELECT * FROM reminders WHERE id=?').get(info.lastInsertRowid);
}

function dueReminders(now = Date.now()) {
  const db = getDb();
  return db.prepare('SELECT * FROM reminders WHERE fired=0 AND fire_at<=?').all(now);
}

function markFired(id) {
  const db = getDb();
  db.prepare('UPDATE reminders SET fired=1 WHERE id=?').run(id);
}

function deliveryLine(text) {
  return pick(CFG.delivery_templates).replace('{text}', text);
}

function startScheduler({ deliver }) {
  const tickMs = (CFG.tick_seconds || 20) * 1000;
  const handle = setInterval(async () => {
    try {
      const due = dueReminders();
      for (const r of due) {
        try {
          await deliver(r.user_id, deliveryLine(r.text));
        } catch (e) {
          console.error('reminder deliver error', e);
        }
        markFired(r.id);
      }
    } catch (e) {
      console.error('reminder tick error', e);
    }
  }, tickMs);
  handle.unref?.();
  return () => clearInterval(handle);
}

module.exports = { parseReminder, add, dueReminders, markFired, deliveryLine, startScheduler };
