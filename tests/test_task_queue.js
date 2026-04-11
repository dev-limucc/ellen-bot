const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load task queue config
const queueConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'flows', 'task_queue.json'), 'utf-8')
);

// ═══════════════════════════════════════
// Task Queue Engine (minimal implementation for testing)
// ═══════════════════════════════════════

class TaskQueue {
  constructor(config) {
    this.maxActive = config.config.max_active;
    this.maxQueued = config.config.max_queued;
    this.autoAdvance = config.config.auto_advance;
    this.voiceLines = config.voice_lines;
    this.active = null;
    this.queue = [];
    this.completed = [];
  }

  addTask(task) {
    if (this.active === null) {
      // No active task — start immediately
      this.active = { ...task, status: 'active', started_at: new Date().toISOString() };
      return { action: 'started', message: this._voice('start', task) };
    }

    if (this.queue.length >= this.maxQueued) {
      return { action: 'rejected', message: this._voice('queue_full', task) };
    }

    // Busy — need to ask
    return {
      action: 'ask_queue_or_override',
      message: `queue it or drop current? your call.`,
      current: this.active,
      pending: task
    };
  }

  queueTask(task) {
    if (this.queue.length >= this.maxQueued) {
      return { action: 'rejected', message: this._voice('queue_full', task) };
    }
    this.queue.push({ ...task, status: 'queued' });
    const position = this.queue.length;
    return {
      action: 'queued',
      message: this._voiceTemplate('queue_position', { position }),
      position
    };
  }

  overrideTask(newTask, confirmed) {
    if (!confirmed) {
      return {
        action: 'override_cancelled',
        message: 'fine. keeping the current one.'
      };
    }
    const dropped = this.active;
    this.active = { ...newTask, status: 'active', started_at: new Date().toISOString() };
    return {
      action: 'overridden',
      message: this._voice('start', newTask),
      dropped
    };
  }

  completeActive(result = null) {
    if (!this.active) return null;

    const done = {
      ...this.active,
      status: 'complete',
      completed_at: new Date().toISOString(),
      result
    };
    this.completed.push(done);

    let nextStarted = null;

    // Auto-advance
    if (this.autoAdvance && this.queue.length > 0) {
      this.active = { ...this.queue.shift(), status: 'active', started_at: new Date().toISOString() };
      nextStarted = this.active;
    } else {
      this.active = null;
    }

    return {
      action: 'completed',
      message: this._voiceTemplate('complete', { task: done.description }),
      completed: done,
      next: nextStarted ? {
        message: this._voiceTemplate('auto_advance', { task: nextStarted.description }),
        task: nextStarted
      } : null
    };
  }

  failActive(error = null) {
    if (!this.active) return null;

    const failed = {
      ...this.active,
      status: 'failed',
      completed_at: new Date().toISOString(),
      error
    };
    this.completed.push(failed);

    if (this.autoAdvance && this.queue.length > 0) {
      this.active = { ...this.queue.shift(), status: 'active', started_at: new Date().toISOString() };
    } else {
      this.active = null;
    }

    return {
      action: 'failed',
      message: this._voice('failed', failed)
    };
  }

  getStatus() {
    return {
      active: this.active,
      queued: this.queue.length,
      completed: this.completed.length
    };
  }

  _voice(key, _task) {
    const lines = this.voiceLines[key];
    if (!lines || lines.length === 0) return '';
    return lines[Math.floor(Math.random() * lines.length)];
  }

  _voiceTemplate(key, vars) {
    let line = this._voice(key);
    for (const [k, v] of Object.entries(vars)) {
      line = line.replace(`{{${k}}}`, String(v));
    }
    return line;
  }
}

// ═══════════════════════════════════════
// TESTS
// ═══════════════════════════════════════

describe('Task Queue Tests', () => {
  let tq;

  beforeEach(() => {
    tq = new TaskQueue(queueConfig);
  });

  it('single task starts immediately', () => {
    const result = tq.addTask({ id: '1', description: 'generate image' });
    assert.equal(result.action, 'started');
    assert.ok(result.message.length > 0, 'Should have a voice line');
    assert.ok(tq.active !== null, 'Should have an active task');
    assert.equal(tq.active.status, 'active');
  });

  it('second task while busy asks queue or override', () => {
    tq.addTask({ id: '1', description: 'generate image' });
    const result = tq.addTask({ id: '2', description: 'search web' });
    assert.equal(result.action, 'ask_queue_or_override');
    assert.ok(result.current, 'Should reference current task');
    assert.ok(result.pending, 'Should reference pending task');
  });

  it('override confirmed drops first, starts second', () => {
    tq.addTask({ id: '1', description: 'generate image' });
    const result = tq.overrideTask({ id: '2', description: 'search web' }, true);
    assert.equal(result.action, 'overridden');
    assert.ok(result.dropped, 'Should return dropped task');
    assert.equal(result.dropped.id, '1');
    assert.equal(tq.active.id, '2');
  });

  it('override denied keeps first, no change', () => {
    tq.addTask({ id: '1', description: 'generate image' });
    const result = tq.overrideTask({ id: '2', description: 'search web' }, false);
    assert.equal(result.action, 'override_cancelled');
    assert.equal(tq.active.id, '1', 'Original task should still be active');
  });

  it('queue position reported correctly', () => {
    tq.addTask({ id: '1', description: 'task 1' });
    const r1 = tq.queueTask({ id: '2', description: 'task 2' });
    assert.equal(r1.position, 1);
    const r2 = tq.queueTask({ id: '3', description: 'task 3' });
    assert.equal(r2.position, 2);
    const r3 = tq.queueTask({ id: '4', description: 'task 4' });
    assert.equal(r3.position, 3);
  });

  it('queue full at 5 rejects with Ellen voice', () => {
    tq.addTask({ id: '0', description: 'active task' });
    for (let i = 1; i <= 5; i++) {
      tq.queueTask({ id: String(i), description: `task ${i}` });
    }
    const result = tq.queueTask({ id: '6', description: 'too many' });
    assert.equal(result.action, 'rejected');
    assert.ok(result.message.length > 0, 'Should have rejection voice line');
    assert.equal(tq.queue.length, 5, 'Queue should still be at 5');
  });

  it('task completion notifies in Ellen voice', () => {
    tq.addTask({ id: '1', description: 'generate image' });
    const result = tq.completeActive('image_url_here');
    assert.equal(result.action, 'completed');
    assert.ok(result.message.length > 0, 'Should have completion voice line');
    assert.equal(result.completed.status, 'complete');
    assert.equal(result.completed.result, 'image_url_here');
  });

  it('next queued task starts automatically after completion', () => {
    tq.addTask({ id: '1', description: 'first task' });
    tq.queueTask({ id: '2', description: 'second task' });
    tq.queueTask({ id: '3', description: 'third task' });

    const result = tq.completeActive();
    assert.ok(result.next, 'Should auto-start next task');
    assert.equal(tq.active.id, '2', 'Second task should now be active');
    assert.equal(tq.queue.length, 1, 'One task remaining in queue');

    const result2 = tq.completeActive();
    assert.ok(result2.next, 'Should auto-start third task');
    assert.equal(tq.active.id, '3');
    assert.equal(tq.queue.length, 0);
  });

  it('task failure also advances queue', () => {
    tq.addTask({ id: '1', description: 'failing task' });
    tq.queueTask({ id: '2', description: 'next task' });

    const result = tq.failActive('some error');
    assert.equal(result.action, 'failed');
    assert.ok(result.message.length > 0);
    assert.equal(tq.active.id, '2', 'Next task should start after failure');
  });

  it('status reports correctly', () => {
    assert.deepEqual(tq.getStatus(), { active: null, queued: 0, completed: 0 });

    tq.addTask({ id: '1', description: 'task' });
    tq.queueTask({ id: '2', description: 'queued task' });
    assert.equal(tq.getStatus().active.id, '1');
    assert.equal(tq.getStatus().queued, 1);

    tq.completeActive();
    assert.equal(tq.getStatus().completed, 1);
  });
});
