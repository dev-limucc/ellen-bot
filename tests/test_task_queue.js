'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Use a throwaway sqlite DB for this test file
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ellen-test-'));
process.env.ELLEN_DB_PATH = path.join(tmpDir, 'tq.db');

const { reset } = require('../src/db');
const queue = require('../src/taskQueue');

test('task queue — single task starts immediately', () => {
  const r = queue.enqueue({ user_id: 'u1', type: 'noop', label: 'hello', payload: {} });
  assert.equal(r.state, 'running');
  assert.ok(r.task);
  assert.equal(r.task.status, 'running');
  assert.match(r.msg, /\S/);
});

test('task queue — second task while running gets queued', () => {
  const r2 = queue.enqueue({ user_id: 'u1', type: 'noop', label: 'second', payload: {} });
  assert.equal(r2.state, 'queued');
  const list = queue.listActiveAndQueued('u1');
  assert.equal(list.length, 2);
  assert.equal(list[0].status, 'running');
  assert.equal(list[1].status, 'queued');
});

test('task queue — fill to 6 (1 active + 5 queued) is fine, 7th rejected', () => {
  // already have 2 (u1). Add 4 more.
  for (let i = 0; i < 4; i++) {
    const r = queue.enqueue({ user_id: 'u1', type: 'noop', label: 'fill' + i, payload: {} });
    assert.equal(r.state, 'queued');
  }
  // 7th
  const reject = queue.enqueue({ user_id: 'u1', type: 'noop', label: 'overflow', payload: {} });
  assert.equal(reject.state, 'rejected');
  assert.match(reject.msg, /one brain|drop|too much|full/i);
});

test('task queue — describe running returns mid-task line', () => {
  const desc = queue.describeRunning('u1');
  assert.ok(desc);
  assert.match(desc, /still|running|patience|going|yawn|isn't done/i);
});

test('task queue — runs handler and auto-advances', async () => {
  // fresh user
  const u = 'u2';
  let counter = 0;
  queue.registerHandler('counter', async (task, ctx) => {
    counter += 1;
    ctx.progress(50);
    return 'ok';
  });
  // enqueue 2 tasks, second queued
  const a = queue.enqueue({ user_id: u, type: 'counter', label: 'a' });
  assert.equal(a.state, 'running');
  const b = queue.enqueue({ user_id: u, type: 'counter', label: 'b' });
  assert.equal(b.state, 'queued');

  const messages = [];
  await queue.runTask(a.task, { onMessage: (m) => messages.push(m) });
  assert.equal(counter, 1);
  assert.match(messages[messages.length - 1], /done|ready|finished|here/i);

  // advance: should run b
  const advanced = await queue.tickAdvance(u, { onMessage: (m) => messages.push(m) });
  assert.ok(advanced);
  assert.equal(counter, 2);
});

test('task queue — failed task produces failed line', async () => {
  const u = 'u3';
  queue.registerHandler('boom', async () => { throw new Error('kaboom'); });
  const r = queue.enqueue({ user_id: u, type: 'boom', label: 'x' });
  const msgs = [];
  await queue.runTask(r.task, { onMessage: (m) => msgs.push(m) });
  assert.match(msgs[0], /didn't work|broke|failed|nope/i);
});

test.after(() => {
  reset();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});
