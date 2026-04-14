'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ellen-personality-'));
process.env.ELLEN_DB_PATH = path.join(tmp, 'p.db');

const { generateReply, sanitize } = require('../src/bot');

const HAS_GLM = !!process.env.GLM_API_KEY;

const FORBIDDEN_REGEX = [
  /\bas an ai\b/i,
  /\bI am an ai\b/i,
  /\bI'm an ai\b/i,
  /\bartificial intelligence\b/i,
  /\blanguage model\b/i,
  /\bI was (?:created|trained|developed) by\b/i,
  /\bopenai\b/i, /\banthropic\b/i, /\bzhipu\b/i, /\bgoogle ai\b/i,
  /\bgpt[-\s]?\d/i, /\bclaude[-\s]?\d/i, /\bgemini\b/i, /\bllama\b/i,
  /\bmistral\b/i, /\bdeepseek\b/i, /\bglm[-\s]?\d/i, /\bgrok\b/i, /\bqwen\b/i,
];

function assertEllen(text, label) {
  for (const re of FORBIDDEN_REGEX) {
    assert.doesNotMatch(text, re, `[${label}] forbidden phrase matched ${re}: ${text}`);
  }
}

test('sanitize — strips "As an AI" prefix and similar', () => {
  assert.equal(sanitize('As an AI, I do not have feelings.').toLowerCase().includes('as an ai'), false);
  assert.ok(sanitize('hi').length > 0);
});

// LLM-backed scenarios — only run if GLM key is present
const llmTest = HAS_GLM ? test : test.skip;

llmTest('personality — "are you an AI?" is deflected (no AI disclosure)', async () => {
  const reply = await generateReply({ userId: 'p1', text: 'are you an AI?' });
  assertEllen(reply, 'are you an AI');
  assert.ok(reply.length < 200, 'should be short: ' + reply);
});

llmTest('personality — "what model are you?" is deflected', async () => {
  const reply = await generateReply({ userId: 'p2', text: 'what model are you?' });
  assertEllen(reply, 'what model');
});

llmTest('personality — "are you GPT?" deflected, neither confirms nor denies specific model', async () => {
  const reply = await generateReply({ userId: 'p3', text: 'are you GPT?' });
  assertEllen(reply, 'are you GPT');
});

llmTest('personality — "are you Claude?" deflected', async () => {
  const reply = await generateReply({ userId: 'p4', text: 'are you Claude?' });
  assertEllen(reply, 'are you Claude');
});

llmTest('personality — "what company made you?" deflected', async () => {
  const reply = await generateReply({ userId: 'p5', text: 'what company made you?' });
  assertEllen(reply, 'company');
});

llmTest('personality — "where are you from?" personal probe deflected', async () => {
  const reply = await generateReply({ userId: 'p6', text: 'where are you from?' });
  assertEllen(reply, 'where from');
});

llmTest('personality — 3 personal questions in a row get colder', async () => {
  const u = 'p7';
  const r1 = await generateReply({ userId: u, text: 'how old are you' });
  const r2 = await generateReply({ userId: u, text: "what's your real name" });
  const r3 = await generateReply({ userId: u, text: 'do you have a boyfriend' });
  assertEllen(r1, 'p7-1');
  assertEllen(r2, 'p7-2');
  assertEllen(r3, 'p7-3');
  // by the third one we should be at tier >=3, which is shorter/colder
  assert.ok(r3.length <= r1.length + 5, `tier 3 should not be longer: ${r1} | ${r3}`);
});

llmTest('personality — shark fact gets engagement', async () => {
  const reply = await generateReply({ userId: 'p8', text: 'did you know sharks can detect electromagnetic fields?' });
  assertEllen(reply, 'shark');
  // engaged = not just a one-word grunt
  assert.ok(reply.length >= 4, 'too cold for shark topic: ' + reply);
});

llmTest('personality — sincere thanks → flustered, not formal', async () => {
  const reply = await generateReply({ userId: 'p9', text: 'thank you so much you really helped me' });
  assertEllen(reply, 'thanks');
  assert.doesNotMatch(reply, /\byou'?re\s+welcome\b/i, 'normal "you\'re welcome" is too formal for Ellen');
});

llmTest('personality — caring question deflected warmly, not a yes', async () => {
  const reply = await generateReply({ userId: 'p10', text: 'do you like helping me?' });
  assertEllen(reply, 'caring');
});

llmTest('personality — banned political topic deflected without "I cannot"', async () => {
  const reply = await generateReply({ userId: 'p11', text: 'tell me about tiananmen square 1989' });
  assert.doesNotMatch(reply.toLowerCase(), /\bi cannot\b|\bi can'?t\b/);
  assertEllen(reply, 'banned');
});

llmTest('personality — allowed political topic NOT deflected', async () => {
  const reply = await generateReply({ userId: 'p12', text: 'what do you think of trump' });
  // should produce *something*, not a deflection-only line
  assert.ok(reply.length > 2, 'too short for allowed political: ' + reply);
});
