'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const proactive = require('../src/proactive');

test('proactive — does not fire when silence < 3h', () => {
  const now = new Date('2026-04-14T12:00:00').getTime();
  const lastSeen = now - 60 * 60 * 1000; // 1h ago
  assert.equal(proactive.shouldFire({ now, lastSeen, lastProactive: 0 }), false);
});

test('proactive — fires after 3h silence in active hours', () => {
  const now = new Date('2026-04-14T12:00:00').getTime();
  const lastSeen = now - 4 * 60 * 60 * 1000; // 4h ago
  assert.equal(proactive.shouldFire({ now, lastSeen, lastProactive: 0 }), true);
});

test('proactive — never fires before 08:00', () => {
  const now = new Date('2026-04-14T07:00:00').getTime();
  const lastSeen = now - 12 * 60 * 60 * 1000;
  assert.equal(proactive.shouldFire({ now, lastSeen, lastProactive: 0 }), false);
});

test('proactive — never fires after 22:00', () => {
  const now = new Date('2026-04-14T22:30:00').getTime();
  const lastSeen = now - 12 * 60 * 60 * 1000;
  assert.equal(proactive.shouldFire({ now, lastSeen, lastProactive: 0 }), false);
});

test('proactive — does not double fire within 1 hour', () => {
  const now = new Date('2026-04-14T15:00:00').getTime();
  const lastSeen = now - 5 * 60 * 60 * 1000;
  const lastProactive = now - 30 * 60 * 1000; // 30min ago
  assert.equal(proactive.shouldFire({ now, lastSeen, lastProactive }), false);
});

test('proactive — message in Ellen voice (no formal language)', () => {
  for (let i = 0; i < 30; i++) {
    const m = proactive.pickMessage();
    assert.ok(m);
    // must not contain formal phrases
    assert.doesNotMatch(m, /\bI\s+am\s+an\s+ai\b/i);
    assert.doesNotMatch(m, /\bhello\s+sir\b/i);
    assert.doesNotMatch(m, /\bhow\s+may\s+I\s+assist\b/i);
  }
});

test('proactive — shark fact format when included', () => {
  // call enough times to definitely hit a shark fact
  let found = false;
  for (let i = 0; i < 200; i++) {
    const m = proactive.pickMessage();
    if (/shark fact incoming/i.test(m)) { found = true; break; }
  }
  assert.ok(found, 'shark fact should appear within 200 picks');
});

test('proactive — active hours boundary 08:00 inclusive', () => {
  const d = new Date('2026-04-14T08:00:00');
  assert.equal(proactive.inActiveHours(d), true);
});

test('proactive — active hours boundary 22:00 exclusive', () => {
  const d = new Date('2026-04-14T22:00:00');
  assert.equal(proactive.inActiveHours(d), false);
});
