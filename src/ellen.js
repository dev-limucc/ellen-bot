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

    // Political sensitive topics
    for (const topic of sensitiveTopics) {
      if (lower.includes(topic)) {
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
    const prompt = `The tool "${toolName}" just returned this result: ${JSON.stringify(result)}

Report this to the user in your usual voice. Keep it brief. Don't say "the tool returned" — just tell them what happened casually.`;

    return this.respond(userId, prompt);
  }
}

module.exports = { Ellen };
