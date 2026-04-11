const fs = require('fs');
const path = require('path');

const queueConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'flows', 'task_queue.json'), 'utf-8')
);

class TaskQueue {
  constructor() {
    this.maxActive = queueConfig.config.max_active;
    this.maxQueued = queueConfig.config.max_queued;
    this.autoAdvance = queueConfig.config.auto_advance;
    this.voiceLines = queueConfig.voice_lines;
    this.active = null;
    this.queue = [];
    this.completed = [];
    this.onComplete = null; // Callback for task completion
  }

  addTask(task) {
    if (this.active === null) {
      this.active = { ...task, status: 'active', started_at: new Date().toISOString() };
      return { action: 'started', message: this._voice('start') };
    }

    if (this.queue.length >= this.maxQueued) {
      return { action: 'rejected', message: this._voice('queue_full') };
    }

    return {
      action: 'ask_queue_or_override',
      message: "queue it or drop the current one? your call.",
      current: this.active,
      pending: task
    };
  }

  queueTask(task) {
    if (this.queue.length >= this.maxQueued) {
      return { action: 'rejected', message: this._voice('queue_full') };
    }
    this.queue.push({ ...task, status: 'queued' });
    return {
      action: 'queued',
      position: this.queue.length,
      message: this._voiceTemplate('queue_position', { position: this.queue.length })
    };
  }

  overrideTask(newTask, confirmed) {
    if (!confirmed) {
      return { action: 'override_cancelled', message: 'fine. keeping the current one.' };
    }
    const dropped = this.active;
    this.active = { ...newTask, status: 'active', started_at: new Date().toISOString() };
    return { action: 'overridden', message: this._voice('start'), dropped };
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

    return { action: 'failed', message: this._voice('failed') };
  }

  getStatus() {
    return {
      active: this.active,
      queued: this.queue.length,
      completed: this.completed.length
    };
  }

  _voice(key) {
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

module.exports = { TaskQueue };
