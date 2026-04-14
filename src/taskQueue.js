'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');

const RESPONSES_FILE = path.join(__dirname, '..', 'prompts', 'task_responses.md');
const QUEUE_CFG_FILE = path.join(__dirname, '..', 'flows', 'task_queue.json');

const QUEUE_CFG = JSON.parse(fs.readFileSync(QUEUE_CFG_FILE, 'utf8'));
const MAX_ACTIVE = QUEUE_CFG.limits.max_active;
const MAX_QUEUE = QUEUE_CFG.limits.max_queue;

let LINES = null;
function loadLines() {
  if (LINES) return LINES;
  const raw = fs.readFileSync(RESPONSES_FILE, 'utf8');
  const out = {};
  let current = null;
  for (const line of raw.split('\n')) {
    const h = line.match(/^##\s+(\S+)/);
    if (h) { current = h[1]; out[current] = []; continue; }
    const it = line.match(/^-\s+(.+)$/);
    if (it && current) out[current].push(it[1].trim());
  }
  LINES = out;
  return out;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function fmt(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

function line(category, vars = {}) {
  const lines = loadLines();
  const arr = lines[category];
  if (!arr || arr.length === 0) return '';
  return fmt(pick(arr), vars);
}

// Internal handler registry: type -> async function(task) returning string result
const handlers = new Map();

function registerHandler(type, fn) { handlers.set(type, fn); }

// Create a queue/active task. Returns { state: 'running'|'queued'|'rejected', task, msg }
function enqueue({ user_id, type, label, payload }) {
  const db = getDb();
  const now = Date.now();
  const counts = db.prepare("SELECT status, COUNT(*) as n FROM tasks WHERE user_id=? AND status IN ('running','queued') GROUP BY status").all(user_id);
  let running = 0, queued = 0;
  for (const r of counts) {
    if (r.status === 'running') running = r.n;
    if (r.status === 'queued') queued = r.n;
  }
  const totalPending = running + queued;
  if (totalPending >= MAX_ACTIVE + MAX_QUEUE) {
    return { state: 'rejected', task: null, msg: line('queue_full', { n: totalPending }) };
  }
  const status = running < MAX_ACTIVE ? 'running' : 'queued';
  const startedAt = status === 'running' ? now : null;
  const info = db.prepare(
    'INSERT INTO tasks (user_id,type,label,payload,status,created_at,started_at) VALUES (?,?,?,?,?,?,?)'
  ).run(user_id, type, label, JSON.stringify(payload || {}), status, now, startedAt);
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(info.lastInsertRowid);
  if (status === 'running') {
    return { state: 'running', task, msg: line('starting') };
  }
  const position = queued + 1;
  return { state: 'queued', task, msg: line('queue_position', { n: position }) };
}

function listActiveAndQueued(user_id) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM tasks WHERE user_id=? AND status IN ('running','queued') ORDER BY id ASC")
    .all(user_id);
}

function currentRunning(user_id) {
  const db = getDb();
  return db.prepare("SELECT * FROM tasks WHERE user_id=? AND status='running' ORDER BY id ASC LIMIT 1").get(user_id);
}

function describeRunning(user_id) {
  const t = currentRunning(user_id);
  if (!t) return null;
  return line('mid_task_query', { task: t.label });
}

function cancel(taskId) {
  const db = getDb();
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId);
  if (!t || t.status === 'done' || t.status === 'failed') return false;
  db.prepare("UPDATE tasks SET status='cancelled', finished_at=? WHERE id=?").run(Date.now(), taskId);
  return true;
}

async function runTask(task, { onMessage } = {}) {
  const db = getDb();
  const handler = handlers.get(task.type);
  if (!handler) {
    db.prepare("UPDATE tasks SET status='failed', error=?, finished_at=? WHERE id=?").run('no handler for type ' + task.type, Date.now(), task.id);
    if (onMessage) onMessage(line('failed', { task: task.label, reason: 'no handler' }));
    return;
  }
  try {
    let payload = {};
    try { payload = JSON.parse(task.payload || '{}'); } catch (_) {}
    const result = await handler({ ...task, payload }, {
      progress: (n) => db.prepare('UPDATE tasks SET progress=? WHERE id=?').run(Math.max(0, Math.min(100, n)), task.id),
    });
    db.prepare("UPDATE tasks SET status='done', result=?, finished_at=?, progress=100 WHERE id=?").run(typeof result === 'string' ? result : JSON.stringify(result || {}), Date.now(), task.id);
    if (onMessage) {
      const flavors = ['done_casual', 'done_sassy', 'done_sleepy'];
      onMessage(line(pick(flavors), { task: task.label }));
    }
  } catch (err) {
    db.prepare("UPDATE tasks SET status='failed', error=?, finished_at=? WHERE id=?").run(String(err && err.message || err), Date.now(), task.id);
    if (onMessage) onMessage(line('failed', { task: task.label, reason: String(err && err.message || err).slice(0, 80) }));
  }
}

async function tickAdvance(user_id, opts) {
  const db = getDb();
  const running = db.prepare("SELECT * FROM tasks WHERE user_id=? AND status='running'").all(user_id);
  if (running.length >= MAX_ACTIVE) return null;
  const next = db.prepare("SELECT * FROM tasks WHERE user_id=? AND status='queued' ORDER BY id ASC LIMIT 1").get(user_id);
  if (!next) return null;
  db.prepare("UPDATE tasks SET status='running', started_at=? WHERE id=?").run(Date.now(), next.id);
  await runTask({ ...next, status: 'running' }, opts);
  return next;
}

function clearAll(user_id) {
  const db = getDb();
  db.prepare("DELETE FROM tasks WHERE user_id=?").run(user_id);
}

module.exports = {
  enqueue,
  listActiveAndQueued,
  currentRunning,
  describeRunning,
  cancel,
  runTask,
  tickAdvance,
  registerHandler,
  clearAll,
  line,
  MAX_ACTIVE,
  MAX_QUEUE,
};
