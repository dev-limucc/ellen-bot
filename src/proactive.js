const fs = require('fs');
const path = require('path');

const proactiveConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'flows', 'proactive.json'), 'utf-8')
);

class ProactiveEngine {
  constructor(bot) {
    this.bot = bot;
    this.config = proactiveConfig;
    this.interval = null;
    this.lastFired = null;
    this.recentIds = [];
  }

  start() {
    // Check every 15 minutes
    this.interval = setInterval(() => this._check(), 15 * 60 * 1000);
    console.log('  Proactive check-ins enabled');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  _check() {
    const now = new Date();
    const hours = now.getHours();
    const timeStr = `${String(hours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Active hours check
    if (timeStr < this.config.trigger.active_hours.start) return;
    if (timeStr > this.config.trigger.active_hours.end) return;
    if (timeStr > this.config.trigger.hard_cutoff) return;

    // Cooldown check
    if (this.lastFired) {
      const cooldownMs = this.config.trigger.cooldown_minutes * 60 * 1000;
      if (now.getTime() - this.lastFired.getTime() < cooldownMs) return;
    }

    // Silence threshold check
    const lastMsg = this.bot.getLastMessageTime(this.bot.ownerId);
    const silenceMs = now.getTime() - lastMsg;
    const thresholdMs = this.config.trigger.threshold_hours * 60 * 60 * 1000;

    if (silenceMs < thresholdMs) return;

    // Fire!
    this.lastFired = now;
    const message = this._pickMessage();
    this.bot.sendMessage(this.bot.ownerId, message.text).catch(err => {
      console.error('Proactive message failed:', err.message);
    });
  }

  _pickMessage() {
    const available = this.config.messages.filter(m => !this.recentIds.includes(m.id));
    const pool = available.length > 0 ? available : this.config.messages;

    // Weighted random
    const totalWeight = pool.reduce((sum, m) => sum + m.weight, 0);
    let random = Math.random() * totalWeight;
    let selected = pool[0];

    for (const msg of pool) {
      random -= msg.weight;
      if (random <= 0) {
        selected = msg;
        break;
      }
    }

    // Track to avoid repeats
    this.recentIds.push(selected.id);
    if (this.recentIds.length > (this.config.no_repeat_within || 3)) {
      this.recentIds.shift();
    }

    return this._formatMessage(selected);
  }

  _formatMessage(msg) {
    let text = msg.text;
    if (text.includes('{{random_shark_fact}}')) {
      const facts = this.config.shark_facts_pool;
      const fact = facts[Math.floor(Math.random() * facts.length)];
      text = text.replace('{{random_shark_fact}}', fact);
    }
    return { id: msg.id, text };
  }
}

module.exports = { ProactiveEngine };
