const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load proactive flow config
const proactiveConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'flows', 'proactive.json'), 'utf-8')
);

// ═══════════════════════════════════════
// Proactive Message Engine
// ═══════════════════════════════════════

class ProactiveEngine {
  constructor(config) {
    this.config = config;
    this.trigger = config.trigger;
    this.messages = config.messages;
    this.sharkFacts = config.shark_facts_pool;
    this.lastFired = null;
    this.recentIds = [];
    this.noRepeatWithin = config.no_repeat_within || 3;
  }

  shouldFire(lastMessageTime, currentTime) {
    const silenceMs = currentTime.getTime() - lastMessageTime.getTime();
    const thresholdMs = this.trigger.threshold_hours * 60 * 60 * 1000;

    // Check silence threshold
    if (silenceMs < thresholdMs) return false;

    // Check active hours
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const currentTimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    if (currentTimeStr < this.trigger.active_hours.start) return false;
    if (currentTimeStr > this.trigger.active_hours.end) return false;

    // Hard cutoff
    if (currentTimeStr > this.trigger.hard_cutoff) return false;

    // Cooldown check
    if (this.lastFired) {
      const cooldownMs = this.trigger.cooldown_minutes * 60 * 1000;
      if (currentTime.getTime() - this.lastFired.getTime() < cooldownMs) return false;
    }

    return true;
  }

  pickMessage() {
    // Filter out recently used messages
    const available = this.messages.filter(m => !this.recentIds.includes(m.id));
    if (available.length === 0) {
      // Reset if all used
      this.recentIds = [];
      return this._formatMessage(this.messages[Math.floor(Math.random() * this.messages.length)]);
    }

    // Weighted random selection
    const totalWeight = available.reduce((sum, m) => sum + m.weight, 0);
    let random = Math.random() * totalWeight;
    for (const msg of available) {
      random -= msg.weight;
      if (random <= 0) {
        this.recentIds.push(msg.id);
        if (this.recentIds.length > this.noRepeatWithin) {
          this.recentIds.shift();
        }
        return this._formatMessage(msg);
      }
    }
    return this._formatMessage(available[0]);
  }

  fire(lastMessageTime, currentTime) {
    if (!this.shouldFire(lastMessageTime, currentTime)) return null;
    this.lastFired = currentTime;
    return this.pickMessage();
  }

  _formatMessage(msg) {
    let text = msg.text;
    if (text.includes('{{random_shark_fact}}')) {
      const fact = this.sharkFacts[Math.floor(Math.random() * this.sharkFacts.length)];
      text = text.replace('{{random_shark_fact}}', fact);
    }
    return { id: msg.id, text };
  }
}

// ═══════════════════════════════════════
// TESTS
// ═══════════════════════════════════════

describe('Proactive Message Tests', () => {
  let engine;

  it('fires after 3hr silence (mocked)', () => {
    engine = new ProactiveEngine(proactiveConfig);
    const lastMsg = new Date('2026-04-12T10:00:00');
    const now = new Date('2026-04-12T13:01:00'); // 3hr 1min later, within active hours

    const result = engine.fire(lastMsg, now);
    assert.ok(result !== null, 'Should fire after 3+ hours of silence');
    assert.ok(result.text.length > 0, 'Should have message text');
  });

  it('does NOT fire before 3hr silence', () => {
    engine = new ProactiveEngine(proactiveConfig);
    const lastMsg = new Date('2026-04-12T10:00:00');
    const now = new Date('2026-04-12T12:30:00'); // Only 2.5hr later

    const result = engine.fire(lastMsg, now);
    assert.equal(result, null, 'Should not fire before 3 hours');
  });

  it('does NOT fire between 22:00-08:00', () => {
    engine = new ProactiveEngine(proactiveConfig);
    const lastMsg = new Date('2026-04-12T18:00:00');

    // Test 23:00 (after hard cutoff)
    const late = new Date('2026-04-12T23:30:00');
    assert.equal(engine.fire(lastMsg, late), null, 'Should not fire at 23:30');

    // Test 03:00
    engine = new ProactiveEngine(proactiveConfig);
    const veryLate = new Date('2026-04-13T03:00:00');
    assert.equal(engine.fire(lastMsg, veryLate), null, 'Should not fire at 03:00');

    // Test 07:00
    engine = new ProactiveEngine(proactiveConfig);
    const earlyMorning = new Date('2026-04-13T07:00:00');
    assert.equal(engine.fire(lastMsg, earlyMorning), null, 'Should not fire at 07:00');
  });

  it('fires within active hours', () => {
    engine = new ProactiveEngine(proactiveConfig);
    const lastMsg = new Date('2026-04-12T06:00:00');

    // Test 09:30 (within active hours)
    const morning = new Date('2026-04-12T09:30:00');
    const result = engine.fire(lastMsg, morning);
    assert.ok(result !== null, 'Should fire at 09:30');

    // Test 20:00 (still within active hours)
    engine = new ProactiveEngine(proactiveConfig);
    const lastMsg2 = new Date('2026-04-12T16:00:00');
    const evening = new Date('2026-04-12T20:00:00');
    const result2 = engine.fire(lastMsg2, evening);
    assert.ok(result2 !== null, 'Should fire at 20:00');
  });

  it('message matches Ellen voice (no peppy language)', () => {
    engine = new ProactiveEngine(proactiveConfig);
    const lastMsg = new Date('2026-04-12T08:00:00');
    const now = new Date('2026-04-12T12:00:00');

    // Fire multiple times to test variety
    for (let i = 0; i < 10; i++) {
      engine = new ProactiveEngine(proactiveConfig);
      engine.lastFired = null;
      const result = engine.fire(lastMsg, now);
      assert.ok(result !== null);

      // Check it doesn't contain peppy/AI language
      const forbidden = ['hope you', 'wonderful', 'amazing', 'fantastic',
        'how can I help', 'at your service', 'happy to'];
      for (const word of forbidden) {
        assert.ok(!result.text.toLowerCase().includes(word),
          `Proactive message should not be peppy: "${result.text}" contains "${word}"`);
      }
    }
  });

  it('shark fact format is correct', () => {
    engine = new ProactiveEngine(proactiveConfig);

    // Get the shark fact message specifically
    const sharkMsg = proactiveConfig.messages.find(m => m.id === 'shark_fact');
    assert.ok(sharkMsg, 'Should have shark_fact message template');
    assert.ok(sharkMsg.text.includes('{{random_shark_fact}}'),
      'Shark template should have fact placeholder');

    // Format it
    const formatted = engine._formatMessage(sharkMsg);
    assert.ok(!formatted.text.includes('{{random_shark_fact}}'),
      'Formatted message should replace placeholder');
    assert.ok(formatted.text.startsWith('shark fact incoming'),
      `Should start with intro: "${formatted.text}"`);
    assert.ok(formatted.text.length > 50,
      `Shark fact should have actual content: "${formatted.text}"`);
  });

  it('does not double-fire within 1hr (cooldown)', () => {
    engine = new ProactiveEngine(proactiveConfig);
    const lastMsg = new Date('2026-04-12T08:00:00');
    const firstFire = new Date('2026-04-12T11:30:00');

    // First fire should work
    const result1 = engine.fire(lastMsg, firstFire);
    assert.ok(result1 !== null, 'First fire should succeed');

    // Try again 30 minutes later — should be blocked by cooldown
    const secondAttempt = new Date('2026-04-12T12:00:00');
    const result2 = engine.fire(lastMsg, secondAttempt);
    assert.equal(result2, null, 'Should not fire within cooldown period');

    // Try 61 minutes after first fire — should work
    const thirdAttempt = new Date('2026-04-12T12:31:00');
    const result3 = engine.fire(lastMsg, thirdAttempt);
    assert.ok(result3 !== null, 'Should fire after cooldown expires');
  });

  it('shark facts pool has content', () => {
    assert.ok(proactiveConfig.shark_facts_pool.length >= 5,
      'Should have at least 5 shark facts');
    for (const fact of proactiveConfig.shark_facts_pool) {
      assert.ok(fact.length > 20, `Shark fact should be substantial: "${fact}"`);
    }
  });

  it('no repeat within configured window', () => {
    engine = new ProactiveEngine(proactiveConfig);
    const picked = [];

    for (let i = 0; i < proactiveConfig.no_repeat_within; i++) {
      const msg = engine.pickMessage();
      // Within the no-repeat window, IDs should be unique
      assert.ok(!picked.includes(msg.id),
        `Message ${msg.id} repeated within no-repeat window of ${proactiveConfig.no_repeat_within}`);
      picked.push(msg.id);
    }
  });
});

describe('Proactive Config Verification', () => {

  it('trigger config is complete', () => {
    assert.equal(proactiveConfig.trigger.type, 'user_silence');
    assert.equal(proactiveConfig.trigger.threshold_hours, 3);
    assert.equal(proactiveConfig.trigger.cooldown_minutes, 60);
    assert.equal(proactiveConfig.trigger.active_hours.start, '08:00');
    assert.equal(proactiveConfig.trigger.active_hours.end, '22:00');
    assert.equal(proactiveConfig.trigger.hard_cutoff, '23:00');
  });

  it('all message templates have required fields', () => {
    for (const msg of proactiveConfig.messages) {
      assert.ok(msg.id, 'Each message needs an id');
      assert.ok(msg.text, 'Each message needs text');
      assert.ok(typeof msg.weight === 'number', 'Each message needs a weight');
    }
  });
});
