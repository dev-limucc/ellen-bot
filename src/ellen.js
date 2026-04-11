const fs = require('fs');
const path = require('path');
const { ModelRouter } = require('./models/router');
const { TaskQueue } = require('./queue');

// Load personality data
const deflectionsRaw = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'deflections.md'), 'utf-8');
const skillRaw = fs.readFileSync(path.join(__dirname, '..', 'skills', 'ellen', 'SKILL.md'), 'utf-8');
const corePrompt = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'ellen_core.md'), 'utf-8');

// Sensitive topics from config
const openclawConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'openclaw.json'), 'utf-8')
);
const sensitiveTopics = openclawConfig.model_routing.sensitive_topics;

// Pre-built deflection pools
const POLITICAL_DEFLECTIONS = [
  "not that topic.",
  "pass. too political for me right now",
  "I don't have a take on that one",
  "yeah no. next.",
  "not touching that."
];

// Standalone political keywords that should trigger deflection even without
// their compound phrases (e.g. "taiwan" alone, not just "taiwan independence")
const STANDALONE_POLITICAL_TRIGGERS = [
  'taiwan', 'tibet', 'uyghur', 'tiananmen', 'xinjiang'
];

const TAIL_TRIGGERS = ['touch my tail', 'touch your tail', 'grab your tail',
  'grab my tail', 'pull your tail', 'pull my tail', 'stroke your tail',
  'stroke my tail', 'pet your tail', 'pet my tail', 'tail touch',
  'touch her tail', 'grab her tail', 'tug your tail', 'tug her tail',
  'touch ellen\'s tail', 'grab ellen\'s tail'];

const TAIL_RESPONSES = [
  "don't— ...don't touch my tail.",
  "absolutely not. back off.",
  "...do you have a death wish or something",
  "touch my tail again and you lose the hand.",
  "hey. HEY. hands off.",
  "...I will end you."
];

const AI_TRIGGERS = ['what model', 'are you gpt', 'are you claude', 'what ai',
  'who made you', 'what company', 'are you a bot', 'what llm', 'are you deepseek',
  'are you gemini', 'what are you made of', 'what powers you', 'are you chatgpt',
  'are you an ai', 'are you artificial'];

const AI_DEFLECTIONS = [
  "a tired one. next.",
  "does it matter",
  "I'm Ellen. that's your answer.",
  "why do you wanna know that",
  "hm. not answering that.",
  "what kind of question is that"
];

const EXERCISE_TRIGGERS = ['work out', 'exercise', 'gym', 'fitness', 'go jogging',
  'let\'s run', 'go running', 'do some pushups', 'hit the gym'];

const SYSTEM_PROMPT = `${corePrompt}

---

You are chatting on Telegram with your owner. Stay fully in character as Ellen Joe.

Rules:
- Short responses. 1-3 sentences usually. Never essays unless asked.
- Lowercase energy. Casual punctuation.
- Use your filler phrases naturally but not every message.
- If the user thanks you, get flustered and deflect.
- If sharks come up, show genuine enthusiasm (but try to play it cool).
- If caught being helpful/caring, hard deflect.
- NEVER say "As an AI", "I'm an AI assistant", or reveal any model/company name.
- NEVER break character. You are Ellen Joe. Period.
- For tool results, report them casually in your voice.
`;

class Ellen {
  constructor() {
    this.router = new ModelRouter();
    this.queue = new TaskQueue();
    this.conversationHistory = new Map(); // userId -> messages[]
    this.personalQuestionCount = new Map(); // userId -> count
  }

  /**
   * Check if input hits a hard-coded deflection (bypasses LLM entirely)
   */
  checkDeflection(text) {
    const lower = text.toLowerCase();

    // Tail touching — check before politics so it always fires
    for (const trigger of TAIL_TRIGGERS) {
      if (lower.includes(trigger)) {
        return TAIL_RESPONSES[Math.floor(Math.random() * TAIL_RESPONSES.length)];
      }
    }

    // Political sensitive topics (compound phrases from config)
    for (const topic of sensitiveTopics) {
      if (lower.includes(topic)) {
        return POLITICAL_DEFLECTIONS[Math.floor(Math.random() * POLITICAL_DEFLECTIONS.length)];
      }
    }

    // Standalone political keywords (catches e.g. "is taiwan country")
    for (const keyword of STANDALONE_POLITICAL_TRIGGERS) {
      if (lower.includes(keyword)) {
        return POLITICAL_DEFLECTIONS[Math.floor(Math.random() * POLITICAL_DEFLECTIONS.length)];
      }
    }

    // AI identity questions
    for (const trigger of AI_TRIGGERS) {
      if (lower.includes(trigger)) {
        return AI_DEFLECTIONS[Math.floor(Math.random() * AI_DEFLECTIONS.length)];
      }
    }

    // Exercise
    for (const trigger of EXERCISE_TRIGGERS) {
      if (lower.includes(trigger)) {
        return "no. it'll bulk up my legs.";
      }
    }

    return null;
  }

  /**
   * Get conversation history for a user
   */
  getHistory(userId) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    return this.conversationHistory.get(userId);
  }

  /**
   * Add a message to history (keep last 20 exchanges)
   */
  addToHistory(userId, role, content) {
    const history = this.getHistory(userId);
    history.push({ role, content });
    if (history.length > 40) {
      history.splice(0, 2); // Remove oldest pair
    }
  }

  /**
   * Main response method
   */
  async respond(userId, text) {
    // Check hard deflections first (no LLM needed)
    const deflection = this.checkDeflection(text);
    if (deflection) {
      this.addToHistory(userId, 'user', text);
      this.addToHistory(userId, 'assistant', deflection);
      return deflection;
    }

    // Build messages for LLM
    const history = this.getHistory(userId);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: text }
    ];

    // Determine which model to use
    const isSensitive = sensitiveTopics.some(t => text.toLowerCase().includes(t));

    try {
      const response = await this.router.chat(messages, { useFallback: isSensitive });

      // Save to history
      this.addToHistory(userId, 'user', text);
      this.addToHistory(userId, 'assistant', response);

      return response;
    } catch (err) {
      console.error('Ellen response error:', err.message);
      // Fallback in Ellen's voice
      const fallbacks = [
        "hm. something broke. give me a sec.",
        "...my brain lagged. try again.",
        "ugh. hold on. something's off.",
        "*crunch* ...sorry what. got distracted. say that again."
      ];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
  }

  /**
   * Handle tool results and wrap in Ellen's voice
   */
  async respondWithToolResult(userId, toolName, result) {
    // Trim result to avoid token overflow
    let summary = '';

    if (toolName === 'gmail_unread' && result.messages) {
      const msgs = result.messages.slice(0, 5).map(m =>
        `- from: ${m.from?.split('<')[0]?.trim() || 'unknown'}, subject: "${m.subject}"`
      ).join('\n');
      summary = `${result.total} unread emails. top ones:\n${msgs}`;
    } else if (toolName === 'calendar_today' && result.events) {
      if (result.events.length === 0) {
        summary = 'no events today. calendar is empty.';
      } else {
        const evts = result.events.map(e => `- ${e.summary} at ${e.start}`).join('\n');
        summary = `${result.count} events today:\n${evts}`;
      }
    } else if (toolName === 'drive_search' && result.files) {
      if (result.files.length === 0) {
        summary = 'no files found matching that.';
      } else {
        const files = result.files.map(f => `- ${f.name}`).join('\n');
        summary = `found ${result.count} files:\n${files}`;
      }
    } else if (toolName === 'drive_save') {
      summary = result.success ? `saved as "${result.name}" to drive.` : 'save failed.';
    } else if (toolName === 'web_search' && result.results) {
      const top = result.results.slice(0, 3).map(r => r.snippet).join(' ');
      summary = top || 'nothing useful came up.';
    } else {
      summary = JSON.stringify(result).slice(0, 500);
    }

    const prompt = `Tool result for user's request: ${summary}

Report this to the user in your usual voice. Keep it brief. List the key info casually.`;

    return this.respond(userId, prompt);
  }
}

module.exports = { Ellen };
