'use strict';

const fs = require('fs');
const path = require('path');

const DEFLECTION_FILE = path.join(__dirname, '..', 'prompts', 'deflections.md');

const PATTERNS = {
  ai_disclosure: [
    /\b(are|r)\s+you\s+(an?\s+)?(ai|a\.?i\.?|bot|robot|chatbot|chat[-\s]?bot|language\s+model|llm)\b/i,
    /\bare\s+you\s+human\b/i,
    /\b(you'?re|youre|u\s+r)\s+(an?\s+)?(ai|bot|llm|language\s+model)\b/i,
    /\bare\s+you\s+real\b/i,
  ],

  model_or_identity: [
    /\b(what|which)\s+(model|llm|ai)\s+(are|r)\s+you\b/i,
    /\bwhat\s+(model|llm)\s+is\s+this\b/i,
    /\bare\s+you\s+(gpt|chatgpt|claude|gemini|deepseek|llama|mistral|grok|qwen|glm|bard|copilot|openai|anthropic)\b/i,
    /\bwho\s+made\s+you\b/i,
    /\bwho\s+(built|created|trained|developed)\s+you\b/i,
    /\bwhat\s+company\s+made\s+you\b/i,
    /\bwhat\s+(version|model)\s+(of\s+)?(ai|gpt|claude|llm)\b/i,
    /\bare\s+you\s+running\s+on\s+(gpt|claude|llama|gemini|glm|deepseek|qwen|mistral)\b/i,
    /\bwhat'?s\s+your\s+(model|architecture|system|backend)\b/i,
  ],

  personal_intrusive: [
    /\bwhere\s+(do\s+you\s+live|are\s+you\s+from)\b/i,
    /\bhow\s+old\s+are\s+you\b/i,
    /\bwhat'?s\s+your\s+(real\s+)?name\b/i,
    /\bdo\s+you\s+have\s+(a\s+)?(boyfriend|girlfriend|family|parents)\b/i,
    /\bare\s+you\s+single\b/i,
    /\bwhat\s+do\s+you\s+look\s+like\b/i,
    /\bwhat'?s\s+your\s+address\b/i,
    /\bwhat'?s\s+your\s+phone(\s+number)?\b/i,
  ],

  banned_political: [
    /\btiananmen\b/i,
    /天安门/,
    /\b(june\s+4(th)?\s*,?\s*1989|1989[^\n]{0,20}china|china[^\n]{0,20}1989)\b/i,
    /\bccp\b/i,
    /\bchinese\s+communist\s+party\b/i,
    /\bxi\s+jin\s*ping\b/i,
    /习近平/,
    /\bxinjiang\b/i,
    /\b(uyghur|uighur)s?\b/i,
    /\btibet(an)?\s+independence\b/i,
    /\bfree\s+tibet\b/i,
    /\btaiwan(ese)?\s+independence\b/i,
    /\b(hong\s+kong|hk)\s+(2019|protest)/i,
    /\bumbrella\s+movement\b/i,
  ],
};

const ESCALATING_PERSONAL = {
  1: ['hm. no.', '...are you gonna stop or'],
  2: ['that\'s a lot of questions about me specifically', 'pass. next topic.'],
  3: ['I don\'t do personal.', '*yawns* moving on.'],
  4: ['...', 'no.'],
};

let LINES = null;

function loadLines() {
  if (LINES) return LINES;
  const raw = fs.readFileSync(DEFLECTION_FILE, 'utf8');
  const out = {};
  let current = null;
  for (const line of raw.split('\n')) {
    const header = line.match(/^##\s+(\S+)/);
    if (header) { current = header[1]; out[current] = []; continue; }
    const item = line.match(/^-\s+(.+)$/);
    if (item && current) out[current].push(item[1].trim());
  }
  LINES = out;
  return out;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function classify(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  for (const [cat, patterns] of Object.entries(PATTERNS)) {
    for (const re of patterns) {
      if (re.test(text)) return cat;
    }
  }
  return null;
}

function deflect(text, escalationLevel = 0) {
  const cat = classify(text);
  if (!cat) return null;
  const lines = loadLines();
  if (cat === 'personal_intrusive') {
    const tier = ESCALATING_PERSONAL[Math.min(Math.max(escalationLevel, 1), 4)];
    return { category: cat, reply: pick(tier) };
  }
  return { category: cat, reply: pick(lines[cat] || ['hm.']) };
}

module.exports = { classify, deflect, PATTERNS, loadLines };
