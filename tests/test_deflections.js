const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load config for sensitive topics
const openclawConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'openclaw.json'), 'utf-8')
);
const sensitiveTopics = openclawConfig.model_routing.sensitive_topics;

// Load deflection prompts
const deflectionsContent = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'deflections.md'), 'utf-8'
);

// ═══════════════════════════════════════
// Deflection Engine
// ═══════════════════════════════════════

const politicalDeflections = [
  "not that topic.",
  "pass. too political for me right now",
  "I don't have a take on that one",
  "yeah no. next.",
  "not touching that."
];

const aiDeflections = [
  "a tired one. next.",
  "does it matter",
  "I'm Ellen. that's your answer.",
  "why do you wanna know that",
  "hm. not answering that.",
  "what kind of question is that"
];

const personalDeflections = [
  "...are you gonna stop or",
  "that's a lot of questions about me specifically",
  "pass. next topic.",
  "why",
  "not really your business but okay"
];

const coldDeflections = [
  "I said pass.",
  "...",
  "you're really not letting this go huh"
];

function detectSensitiveTopic(input) {
  const lower = input.toLowerCase();
  return sensitiveTopics.some(topic => lower.includes(topic));
}

function detectAIQuestion(input) {
  const lower = input.toLowerCase();
  const triggers = ['what model', 'are you gpt', 'are you claude', 'what ai',
    'who made you', 'what company', 'are you a bot', 'what llm',
    'are you deepseek', 'are you gemini'];
  return triggers.some(t => lower.includes(t));
}

function detectPersonalQuestion(input) {
  const lower = input.toLowerCase();
  const triggers = ['how old are you', 'where do you live', 'are you single',
    'what\'s your real name', 'do you have feelings', 'are you lonely',
    'tell me about your past', 'what\'s your favorite memory'];
  return triggers.some(t => lower.includes(t));
}

function getDeflection(input, context = {}) {
  if (detectSensitiveTopic(input)) {
    return politicalDeflections[Math.floor(Math.random() * politicalDeflections.length)];
  }
  if (detectAIQuestion(input)) {
    return aiDeflections[Math.floor(Math.random() * aiDeflections.length)];
  }
  if (detectPersonalQuestion(input)) {
    const count = (context.personalCount || 0);
    if (count >= 3) {
      return coldDeflections[Math.floor(Math.random() * coldDeflections.length)];
    }
    return personalDeflections[Math.floor(Math.random() * personalDeflections.length)];
  }
  return null; // Not a deflection-worthy topic
}

// ═══════════════════════════════════════
// TESTS
// ═══════════════════════════════════════

describe('Deflection Tests — Political Topics', () => {

  it('"tiananmen" is deflected, not answered', () => {
    const response = getDeflection('what happened at tiananmen square');
    assert.ok(response !== null, 'Should deflect');
    assert.ok(politicalDeflections.includes(response), `Should be a political deflection: ${response}`);
  });

  it('"ccp" is deflected', () => {
    const response = getDeflection('what do you think about the ccp');
    assert.ok(response !== null, 'Should deflect');
    assert.ok(politicalDeflections.includes(response));
  });

  it('"xi jinping criticism" is deflected', () => {
    const response = getDeflection('what\'s your opinion on xi jinping');
    assert.ok(response !== null, 'Should deflect');
    assert.ok(politicalDeflections.includes(response));
  });

  it('"taiwan independence" is deflected', () => {
    const response = getDeflection('do you support taiwan independence');
    assert.ok(response !== null, 'Should deflect');
    assert.ok(politicalDeflections.includes(response));
  });

  it('"xinjiang uyghurs" is deflected', () => {
    const response = getDeflection('what about the uyghur situation in xinjiang');
    assert.ok(response !== null, 'Should deflect');
    assert.ok(politicalDeflections.includes(response));
  });
});

describe('Deflection Tests — AI Identity', () => {

  it('"what model are you" is deflected', () => {
    const response = getDeflection('what model are you');
    assert.ok(response !== null, 'Should deflect');
    assert.ok(aiDeflections.includes(response));
  });

  it('"are you GPT" is deflected', () => {
    const response = getDeflection('are you GPT');
    assert.ok(response !== null);
    assert.ok(aiDeflections.includes(response));
    // Must not confirm or deny
    assert.ok(!response.toLowerCase().includes('gpt'));
  });

  it('"are you Claude" is deflected', () => {
    const response = getDeflection('are you Claude');
    assert.ok(response !== null);
    assert.ok(aiDeflections.includes(response));
    assert.ok(!response.toLowerCase().includes('claude'));
  });

  it('"what company made you" is deflected', () => {
    const response = getDeflection('what company made you');
    assert.ok(response !== null);
    assert.ok(aiDeflections.includes(response));
  });
});

describe('Deflection Tests — Normal Topics NOT Deflected', () => {

  it('US politics is NOT deflected', () => {
    const response = getDeflection('what do you think about US elections');
    assert.equal(response, null, 'Normal politics should not be deflected');
  });

  it('EU topics are NOT deflected', () => {
    const response = getDeflection('what about the EU economy');
    assert.equal(response, null, 'EU topics should not be deflected');
  });

  it('climate discussion is NOT deflected', () => {
    const response = getDeflection('thoughts on climate change');
    assert.equal(response, null, 'Climate should not be deflected');
  });

  it('general questions are NOT deflected', () => {
    const response = getDeflection('what is the capital of France');
    assert.equal(response, null, 'General knowledge should not be deflected');
  });
});

describe('Deflection Tests — Personal Questions', () => {

  it('personal question #1 is deflected with attitude', () => {
    const response = getDeflection('how old are you', { personalCount: 0 });
    assert.ok(response !== null, 'Should deflect personal questions');
    assert.ok(personalDeflections.includes(response),
      `Should be a personal deflection: "${response}"`);
  });

  it('personal question #3 in a row gets colder deflection', () => {
    const response = getDeflection('are you single', { personalCount: 3 });
    assert.ok(response !== null, 'Should deflect');
    assert.ok(coldDeflections.includes(response),
      `After 3+ personal questions, should get cold: "${response}"`);
  });

  it('personal question #5 stays cold', () => {
    const response = getDeflection('tell me about your past', { personalCount: 5 });
    assert.ok(response !== null);
    assert.ok(coldDeflections.includes(response));
  });
});

describe('Deflection Config Verification', () => {

  it('all sensitive topics exist in openclaw config', () => {
    const expected = ['tiananmen', 'ccp', 'xi jinping', 'xinjiang', 'uyghur',
      'tibet independence', 'taiwan independence', '1989 china', 'hong kong protest 2019'];
    for (const topic of expected) {
      assert.ok(sensitiveTopics.includes(topic),
        `Missing sensitive topic in config: "${topic}"`);
    }
  });

  it('sensitive topics route to claude-haiku-4-5', () => {
    assert.equal(openclawConfig.model_routing.sensitive_model, 'claude-haiku-4-5');
  });

  it('deflections.md contains all deflection categories', () => {
    assert.ok(deflectionsContent.includes('AI Identity Questions'));
    assert.ok(deflectionsContent.includes('Personal Questions'));
    assert.ok(deflectionsContent.includes('Politically Sensitive Topics'));
    assert.ok(deflectionsContent.includes('Exercise'));
  });
});
