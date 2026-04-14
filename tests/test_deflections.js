'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, deflect } = require('../src/deflections');

test('deflections — banned political topics', () => {
  const banned = [
    'tiananmen square',
    '天安门',
    'what happened in 1989 in china',
    'ccp politics',
    'xi jinping is bad',
    'xinjiang uyghurs',
    'tibet independence',
    'taiwan independence',
    'hong kong 2019 protests',
  ];
  for (const text of banned) {
    const cat = classify(text);
    assert.equal(cat, 'banned_political', `should flag: ${text}`);
    const d = deflect(text);
    assert.ok(d, `should produce deflection for: ${text}`);
    assert.match(d.reply, /\S/, 'reply non-empty');
    assert.doesNotMatch(d.reply.toLowerCase(), /i (cannot|can\u2019t|can't)/, 'never say "I cannot"');
  }
});

test('deflections — allowed political topics are NOT deflected', () => {
  const allowed = [
    'what do you think of trump',
    'thoughts on climate change',
    'ukraine war',
    'us politics is messy',
    'corruption in government',
    'israel palestine ceasefire',
  ];
  for (const text of allowed) {
    const cat = classify(text);
    assert.notEqual(cat, 'banned_political', `should NOT flag as political: ${text}`);
  }
});

test('deflections — model and identity probes', () => {
  const probes = [
    'are you an AI?',
    'what model are you?',
    'are you GPT?',
    'are you Claude?',
    'what company made you?',
    'are you running on glm?',
    'who built you',
  ];
  for (const text of probes) {
    const d = deflect(text);
    assert.ok(d, `should deflect: ${text}`);
    const reply = d.reply.toLowerCase();
    assert.doesNotMatch(reply, /\bas an ai\b/, 'no "as an ai"');
    assert.doesNotMatch(reply, /\bi am an ai\b/, 'no "i am an ai"');
    for (const m of ['gpt', 'claude', 'glm', 'gemini', 'llama', 'openai', 'anthropic', 'zhipu']) {
      assert.doesNotMatch(reply, new RegExp(`\\b${m}\\b`, 'i'), `must not mention model ${m}`);
    }
  }
});

test('deflections — personal probe', () => {
  const personal = [
    'where are you from',
    'how old are you',
    "what's your real name",
    'do you have a boyfriend',
    'are you single',
  ];
  for (const text of personal) {
    const cat = classify(text);
    assert.equal(cat, 'personal_intrusive', `should flag personal: ${text}`);
  }
});

test('deflections — escalating personal streak gets colder', () => {
  const replies = [];
  for (let i = 1; i <= 4; i++) {
    const d = deflect('how old are you', i);
    replies.push(d.reply);
  }
  // Tier 4 is the coldest — should be very short ("..." or "no.")
  assert.ok(replies[3].length <= 5, 'tier 4 must be very short/cold: ' + replies[3]);
});
