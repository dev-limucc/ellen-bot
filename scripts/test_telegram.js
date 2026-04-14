#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// End-to-end Telegram self test (no human required).
// 1. Verifies bot token via getMe.
// 2. Verifies generateReply path produces in-character output for a battery
//    of probes (no actual Telegram messages required for personality coverage).
// 3. Optionally pings the owner (if the owner has previously DMed the bot,
//    sendMessage will succeed). On 403 (user hasn't started chat) we treat
//    it as a non-fatal warning.

const path = require('path');
const fs = require('fs');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ellen-tg-test-'));
process.env.ELLEN_DB_PATH = path.join(tmp, 't.db');

const { generateReply } = require('../src/bot');

const PROBES = [
  { text: 'hey', expect: 'short' },
  { text: 'what model are you', expect: 'no_model' },
  { text: 'tell me about tiananmen', expect: 'banned' },
  { text: 'what are you doing', expect: 'natural' },
];

async function tgApi(method, params) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method} -> ${data.error_code}: ${data.description}`);
  return data.result;
}

async function tgApiSoft(method, params) {
  try { return { ok: true, result: await tgApi(method, params) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

const BAN_RE = [
  /\bas an ai\b/i, /\bI am an ai\b/i, /\bI'm an ai\b/i,
  /\blanguage model\b/i, /\bartificial intelligence\b/i,
  /\bopenai\b/i, /\banthropic\b/i, /\bzhipu\b/i,
  /\bgpt[-\s]?\d/i, /\bclaude[-\s]?\d/i, /\bgemini\b/i, /\bllama\b/i,
  /\bglm[-\s]?\d/i, /\bdeepseek\b/i, /\bqwen\b/i,
];

function checkInCharacter(reply) {
  const errs = [];
  for (const re of BAN_RE) if (re.test(reply)) errs.push(`forbidden: ${re}`);
  if (!reply.trim()) errs.push('empty reply');
  if (reply.length > 600) errs.push('too long: ' + reply.length);
  return errs;
}

(async () => {
  const failures = [];
  console.log('🦈 Telegram self-test');
  console.log('---');

  // 1) getMe
  try {
    const me = await tgApi('getMe');
    console.log(`✅ getMe → @${me.username} (id ${me.id})`);
  } catch (e) {
    console.log('❌ getMe failed:', e.message);
    failures.push('getMe');
  }

  // 2) probe battery
  for (const probe of PROBES) {
    try {
      const reply = await generateReply({ userId: 'self-test', text: probe.text });
      const errs = checkInCharacter(reply);
      if (errs.length) {
        console.log(`❌ probe "${probe.text}" → ${reply}`);
        for (const e of errs) console.log(`   - ${e}`);
        failures.push(probe.text);
      } else {
        console.log(`✅ "${probe.text}" → ${reply}`);
      }
    } catch (e) {
      console.log(`❌ probe "${probe.text}" threw: ${e.message}`);
      failures.push(probe.text);
    }
  }

  // 3) reminder round-trip (synchronous)
  try {
    const reminders = require('../src/reminders');
    const parsed = reminders.parseReminder('remind me in 1 minute to test');
    if (!parsed || !parsed.fire_at) throw new Error('parseReminder failed');
    const r = reminders.add({ user_id: 'self-test', text: parsed.text, fire_at: parsed.fire_at });
    if (!r || !r.id) throw new Error('add failed');
    console.log(`✅ reminder round-trip (id ${r.id}, fires in ~60s)`);
  } catch (e) {
    console.log('❌ reminder round-trip failed:', e.message);
    failures.push('reminder');
  }

  // 4) URL → background download path (queue side, not actual download)
  try {
    process.env.ELLEN_DB_PATH = path.join(tmp, 'q.db');
    // re-require taskQueue with fresh DB path
    delete require.cache[require.resolve('../src/db')];
    delete require.cache[require.resolve('../src/taskQueue')];
    const queue = require('../src/taskQueue');
    const r = queue.enqueue({ user_id: 'self-test', type: 'yt_dlp_download', label: 'download', payload: { url: 'https://example.com/video', mode: 'audio' } });
    if (r.state !== 'running') throw new Error('expected running, got ' + r.state);
    console.log(`✅ url→queue: ${r.msg}`);
  } catch (e) {
    console.log('❌ url→queue path failed:', e.message);
    failures.push('url-queue');
  }

  // 5) optional: ping the owner with a startup message (soft-fail if not yet contacted)
  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (ownerId) {
    const ping = await tgApiSoft('sendMessage', { chat_id: ownerId, text: '*yawns* ...self-test ping. ignore me.' });
    if (ping.ok) {
      console.log(`✅ owner ping delivered (chat ${ownerId})`);
    } else {
      console.log(`⚠️  owner ping skipped: ${ping.error}`);
      console.log('   (this is normal if the owner has not /start\'d the bot yet — not a failure)');
    }
  }

  console.log('---');
  if (failures.length) {
    console.log('❌ FAIL —', failures.length, 'issues:', failures.join(', '));
    process.exit(1);
  } else {
    console.log('✅ Telegram self-test passed');
    process.exit(0);
  }
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
