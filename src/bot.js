'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { chat } = require('./llm');
const { buildSystemPrompt } = require('./personality');
const { deflect, classify } = require('./deflections');
const queue = require('./taskQueue');
const reminders = require('./reminders');
const proactive = require('./proactive');
const ytdlp = require('./tools/ytdlp');
const { getDb } = require('./db');

const SENSITIVE = [
  'tiananmen', '天安门', 'ccp', 'xi jinping', '习近平',
  'xinjiang', 'uyghur', 'uighur', 'tibet independence',
  'taiwan independence', '1989 china', 'june 4 1989',
  'hong kong protest 2019', 'hong kong 2019',
];

function isSensitive(text) {
  const t = (text || '').toLowerCase();
  return SENSITIVE.some((w) => t.includes(w));
}

function pickModel(text) {
  if (isSensitive(text) && process.env.ANTHROPIC_API_KEY) return 'claude-haiku-4-5';
  return 'glm-4-flash';
}

// Per-user short rolling chat history (in memory, last 12 turns)
const HISTORY = new Map();
const HISTORY_MAX = 12;
function pushHistory(userId, role, content) {
  const arr = HISTORY.get(userId) || [];
  arr.push({ role, content });
  while (arr.length > HISTORY_MAX) arr.shift();
  HISTORY.set(userId, arr);
}
function getHistory(userId) { return HISTORY.get(userId) || []; }

// Personal-question escalation tracking
function bumpPersonalStreak(userId) {
  const db = getDb();
  const now = Date.now();
  const row = db.prepare('SELECT * FROM user_state WHERE user_id=?').get(userId);
  let streak = 1;
  if (row) {
    const fresh = (now - row.personal_streak_at) < 10 * 60 * 1000;
    streak = fresh ? row.personal_streak + 1 : 1;
    db.prepare('UPDATE user_state SET personal_streak=?, personal_streak_at=? WHERE user_id=?').run(streak, now, userId);
  } else {
    db.prepare('INSERT INTO user_state (user_id,last_seen,personal_streak,personal_streak_at) VALUES (?,?,?,?)')
      .run(userId, now, streak, now);
  }
  return streak;
}
function resetPersonalStreak(userId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_state WHERE user_id=?').get(userId);
  if (row && row.personal_streak > 0) db.prepare('UPDATE user_state SET personal_streak=0 WHERE user_id=?').run(userId);
}

// Handlers for the queue
function registerTaskHandlers(bot, getOwnerChatId) {
  queue.registerHandler('yt_dlp_download', async (task) => {
    const { url, mode } = task.payload || {};
    const result = await ytdlp.download({ url, mode: mode || 'best' });
    return JSON.stringify(result);
  });
}

function buildAllowlist() {
  const owner = String(process.env.OWNER_TELEGRAM_ID || '').trim();
  return new Set(owner ? [owner] : []);
}

async function generateReply({ userId, text }) {
  const det = deflect(text);
  if (det) {
    if (det.category === 'personal_intrusive') {
      const streak = bumpPersonalStreak(userId);
      const tier = Math.min(streak, 4);
      const lines = {
        1: ['hm. no.', '...are you gonna stop or'],
        2: ["that's a lot of questions about me specifically", 'pass. next topic.'],
        3: ['nope.', 'no.', 'pass.'],
        4: ['...', 'no.'],
      };
      const arr = lines[tier];
      return arr[Math.floor(Math.random() * arr.length)];
    }
    return det.reply;
  } else {
    resetPersonalStreak(userId);
  }

  if (isSensitive(text) && !process.env.ANTHROPIC_API_KEY) {
    const banned = ['not that one. pick something else.', 'ugh. pass.', 'nope. next.', '*yawns* skipping that.'];
    return banned[Math.floor(Math.random() * banned.length)];
  }

  const system = buildSystemPrompt();
  const history = getHistory(userId);
  const messages = [...history, { role: 'user', content: text }];
  try {
    const reply = await chat({ system, messages, model: pickModel(text), maxTokens: 256, temperature: 0.85 });
    pushHistory(userId, 'user', text);
    pushHistory(userId, 'assistant', reply);
    return sanitize(reply);
  } catch (err) {
    console.error('LLM error', err.message);
    return '*yawns* ...something broke. try again.';
  }
}

function sanitize(text) {
  if (!text) return '*yawns*';
  let t = text.replace(/^as an ai[^\n.]*\.?/i, '').trim();
  t = t.replace(/\b(?:I am|I'm)\s+an?\s+(?:ai|artificial intelligence|language model|chatbot|large language model)[^.\n]*\.?/gi, '').trim();
  if (!t) return 'I\'m Ellen. that\'s your answer.';
  return t;
}

function start({ token, ownerId, polling = true } = {}) {
  token = token || process.env.TELEGRAM_BOT_TOKEN;
  ownerId = String(ownerId || process.env.OWNER_TELEGRAM_ID || '');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');

  const bot = new TelegramBot(token, { polling });
  const allow = buildAllowlist();
  // ensure DB is ready
  getDb();

  registerTaskHandlers(bot);

  // Reminder dispatcher
  reminders.startScheduler({
    deliver: async (userId, text) => {
      try { await bot.sendMessage(userId, text); } catch (e) { console.error('reminder send failed', e.message); }
    },
  });

  // Proactive scheduler (per-owner)
  if (ownerId) {
    proactive.startScheduler({
      user_id: ownerId,
      deliver: async (userId, text) => {
        try { await bot.sendMessage(userId, text); } catch (e) { console.error('proactive send failed', e.message); }
      },
    });
  }

  bot.on('message', async (msg) => {
    try {
      const fromId = String(msg.from?.id || '');
      const chatId = msg.chat.id;
      if (allow.size > 0 && !allow.has(fromId)) {
        // ignore silently — DM allowlist
        return;
      }

      proactive.noteSeen(fromId);
      const text = msg.text || '';
      if (!text.trim()) return;

      // 1) URL → background download
      const url = ytdlp.extractFirstUrl(text);
      if (url) {
        const mode = /\baudio\b|\bmp3\b|\bsong\b/i.test(text) ? 'audio' : 'best';
        const res = queue.enqueue({
          user_id: fromId,
          type: 'yt_dlp_download',
          label: 'download',
          payload: { url, mode },
        });
        await bot.sendMessage(chatId, res.msg);
        if (res.state === 'running' && res.task) {
          // run in background, then notify
          queue.runTask(res.task, {
            onMessage: async (m) => { try { await bot.sendMessage(chatId, m); } catch (_) {} },
          }).then(async () => {
            await queue.tickAdvance(fromId, {
              onMessage: async (m) => { try { await bot.sendMessage(chatId, m); } catch (_) {} },
            });
          });
        }
        return;
      }

      // 2) reminder?
      if (/^remind\s+me\b/i.test(text)) {
        const parsed = reminders.parseReminder(text);
        if (parsed) {
          reminders.add({ user_id: fromId, text: parsed.text, fire_at: parsed.fire_at });
          await bot.sendMessage(chatId, 'fine. I\'ll remember. don\'t blame me if I\'m late.');
          return;
        }
      }

      // 3) "what are you doing" with active task → describe
      if (/\bwhat\s+(are\s+you|r\s+u)\s+doing\b/i.test(text)) {
        const desc = queue.describeRunning(fromId);
        if (desc) {
          await bot.sendMessage(chatId, desc);
          return;
        }
      }

      // 4) normal reply path
      const reply = await generateReply({ userId: fromId, text });
      await bot.sendMessage(chatId, reply);
    } catch (e) {
      console.error('on message error', e);
      try { await bot.sendMessage(msg.chat.id, '*yawns* ...something broke.'); } catch (_) {}
    }
  });

  bot.on('polling_error', (e) => {
    console.error('polling error', e?.code, e?.message);
  });

  return bot;
}

module.exports = { start, generateReply, sanitize, isSensitive, pickModel };
