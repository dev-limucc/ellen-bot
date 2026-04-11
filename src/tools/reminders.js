const fs = require('fs');
const path = require('path');

const REMINDERS_FILE = path.join(__dirname, '..', '..', '.reminders.json');

class ReminderTools {
  constructor(sendCallback) {
    this.sendCallback = sendCallback; // Function to send message to user
    this.reminders = [];
    this.timers = new Map();
    this._load();
    this._scheduleAll();
  }

  _load() {
    try {
      if (fs.existsSync(REMINDERS_FILE)) {
        this.reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf-8'));
        // Filter out expired reminders
        this.reminders = this.reminders.filter(r => r.status === 'active');
      }
    } catch { this.reminders = []; }
  }

  _save() {
    try {
      fs.writeFileSync(REMINDERS_FILE, JSON.stringify(this.reminders, null, 2));
    } catch (err) {
      console.error('Could not save reminders:', err.message);
    }
  }

  _scheduleAll() {
    for (const reminder of this.reminders) {
      if (reminder.status === 'active') {
        this._scheduleOne(reminder);
      }
    }
    if (this.reminders.length > 0) {
      console.log(`  ${this.reminders.length} reminder(s) loaded`);
    }
  }

  _scheduleOne(reminder) {
    const now = Date.now();
    const fireAt = new Date(reminder.time).getTime();
    const delay = fireAt - now;

    if (delay <= 0) {
      // Already past — fire immediately
      this._fire(reminder);
      return;
    }

    const timer = setTimeout(() => this._fire(reminder), delay);
    this.timers.set(reminder.id, timer);
  }

  _fire(reminder) {
    const voiceLines = [
      `hey. you told me to remind you: "${reminder.task}". so. here.`,
      `reminder: ${reminder.task}. ...you're welcome.`,
      `that thing you wanted to remember. ${reminder.task}. there.`,
      `${reminder.task}. you asked me to remind you. don't say I never do anything.`
    ];
    const msg = voiceLines[Math.floor(Math.random() * voiceLines.length)];

    if (this.sendCallback) {
      this.sendCallback(msg);
    }

    // Mark as fired
    reminder.status = 'fired';
    this.timers.delete(reminder.id);
    this._save();

    // Handle repeating reminders
    if (reminder.repeat && reminder.repeat !== 'none') {
      const next = this._getNextRepeat(reminder);
      if (next) {
        const newReminder = {
          ...reminder,
          id: `rem_${Date.now()}`,
          time: next.toISOString(),
          status: 'active'
        };
        this.reminders.push(newReminder);
        this._scheduleOne(newReminder);
        this._save();
      }
    }
  }

  _getNextRepeat(reminder) {
    const current = new Date(reminder.time);
    switch (reminder.repeat) {
      case 'daily': return new Date(current.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly': return new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly': {
        const next = new Date(current);
        next.setMonth(next.getMonth() + 1);
        return next;
      }
      default: return null;
    }
  }

  async setReminder(task, time, repeat = 'none') {
    const id = `rem_${Date.now()}`;
    const reminder = {
      id,
      task,
      time: new Date(time).toISOString(),
      repeat,
      status: 'active',
      created_at: new Date().toISOString()
    };

    this.reminders.push(reminder);
    this._scheduleOne(reminder);
    this._save();

    return {
      success: true,
      id,
      task,
      time: reminder.time,
      repeat
    };
  }

  async listReminders() {
    const active = this.reminders.filter(r => r.status === 'active');
    return {
      success: true,
      count: active.length,
      reminders: active.map(r => ({
        id: r.id,
        task: r.task,
        time: r.time,
        repeat: r.repeat
      }))
    };
  }

  async cancelReminder(index) {
    const active = this.reminders.filter(r => r.status === 'active');
    if (index < 1 || index > active.length) {
      return { success: false, error: 'invalid reminder number' };
    }
    const reminder = active[index - 1];
    reminder.status = 'cancelled';

    const timer = this.timers.get(reminder.id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(reminder.id);
    }

    this._save();
    return { success: true, task: reminder.task };
  }

  stopAll() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

module.exports = { ReminderTools };
