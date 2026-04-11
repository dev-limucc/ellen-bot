const fs = require('fs');
const path = require('path');
const { ModelRouter } = require('./models/router');
const { TaskQueue } = require('./queue');
const { getToolDefinitions, executeTool } = require('./tools/registry');

// Load personality data
const corePrompt = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'ellen_core.md'), 'utf-8');

// Sensitive topics from config
const openclawConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'openclaw.json'), 'utf-8')
);
const sensitiveTopics = openclawConfig.model_routing.sensitive_topics;

// Hard-coded deflection pools (bypass LLM entirely for safety/speed)
const POLITICAL_DEFLECTIONS = [
  "not that topic.",
  "pass. too political for me right now",
  "I don't have a take on that one",
  "yeah no. next.",
  "not touching that."
];

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

When you need to use a tool, call it. When you get results, summarize them casually in your voice.
Don't announce tool usage. Just do it and report back naturally.
If a tool fails, say it casually — "didn't work" or "something broke, not my fault."
`;

class Ellen {
  constructor() {
    this.router = new ModelRouter();
    this.queue = new TaskQueue();
    this.tools = null; // Set by bot after init
    this.conversationHistory = new Map();
  }

  setTools(toolManager) {
    this.tools = toolManager;
  }

  /**
   * Check if input hits a hard-coded deflection (bypasses LLM entirely)
   */
  checkDeflection(text) {
    const lower = text.toLowerCase();

    // Tail touching
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

    // Standalone political keywords
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

  getHistory(userId) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    return this.conversationHistory.get(userId);
  }

  addToHistory(userId, role, content) {
    const history = this.getHistory(userId);
    history.push({ role, content });
    if (history.length > 40) {
      history.splice(0, 2);
    }
  }

  /**
   * Main response method — LLM decides whether to use tools
   */
  async respond(userId, text, extraContext = null) {
    // Check hard deflections first
    const deflection = this.checkDeflection(text);
    if (deflection) {
      this.addToHistory(userId, 'user', text);
      this.addToHistory(userId, 'assistant', deflection);
      return { type: 'text', content: deflection };
    }

    // Build messages
    const history = this.getHistory(userId);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: extraContext ? `${text}\n\n[Context: ${extraContext}]` : text }
    ];

    // Get available tool definitions
    const availableTools = this.tools ? this.tools.getAvailableTools() : [];
    const toolDefs = getToolDefinitions(availableTools);

    const isSensitive = sensitiveTopics.some(t => text.toLowerCase().includes(t));

    try {
      const response = await this.router.chat(messages, {
        useFallback: isSensitive,
        tools: toolDefs.length > 0 ? toolDefs : undefined
      });

      // LLM wants to call a tool
      if (response.type === 'tool_calls' && response.tool_calls) {
        return await this._handleToolCalls(userId, text, response, messages);
      }

      // Regular text response
      const content = response.content || response;
      this.addToHistory(userId, 'user', text);
      this.addToHistory(userId, 'assistant', content);
      return { type: 'text', content };

    } catch (err) {
      console.error('Ellen response error:', err.message);
      const fallbacks = [
        "hm. something broke. give me a sec.",
        "...my brain lagged. try again.",
        "ugh. hold on. something's off.",
        "*crunch* ...sorry what. got distracted. say that again."
      ];
      return { type: 'text', content: fallbacks[Math.floor(Math.random() * fallbacks.length)] };
    }
  }

  /**
   * Handle tool calls from LLM, execute them, feed results back
   */
  async _handleToolCalls(userId, originalText, response, messages) {
    const results = [];

    for (const toolCall of response.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs = {};

      try {
        fnArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        fnArgs = {};
      }

      console.log(`  Tool call: ${fnName}(${JSON.stringify(fnArgs)})`);

      // Execute the tool
      const result = await executeTool(fnName, fnArgs, this.tools);
      results.push({ toolCall, result });
    }

    // Build tool result messages and send back to LLM for Ellen-voice summary
    const toolResultMessages = [
      ...messages,
      { role: 'assistant', content: response.content || '', tool_calls: response.tool_calls },
    ];

    for (const { toolCall, result } of results) {
      toolResultMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(this._trimResult(toolCall.function.name, result))
      });
    }

    try {
      // Get Ellen's voiced response to the tool results
      const followUp = await this.router.chat(toolResultMessages, {});
      const content = followUp.content || followUp;

      this.addToHistory(userId, 'user', originalText);
      this.addToHistory(userId, 'assistant', content);

      // Check if any results contain images/attachments to send
      const attachments = [];
      for (const { result } of results) {
        if (result.attachments) {
          for (const att of result.attachments) {
            if (att.mimeType?.startsWith('image/')) {
              attachments.push(att);
            }
          }
        }
        if (result.url && result.prompt) {
          // Image generation result
          attachments.push({ type: 'generated_image', url: result.url });
        }
      }

      return { type: 'text', content, attachments, toolResults: results };

    } catch (err) {
      console.error('Tool follow-up error:', err.message);
      // Fallback: summarize results ourselves
      const summaries = results.map(({ toolCall, result }) =>
        `${toolCall.function.name}: ${result.success ? 'done' : 'failed'}`
      ).join(', ');

      const fallback = `okay. ${summaries}. you're welcome.`;
      this.addToHistory(userId, 'user', originalText);
      this.addToHistory(userId, 'assistant', fallback);
      return { type: 'text', content: fallback };
    }
  }

  /**
   * Trim tool results to avoid token overflow
   */
  _trimResult(toolName, result) {
    if (!result.success) return result;

    // Trim email message bodies
    if (result.messages) {
      return {
        ...result,
        messages: result.messages.map(m => ({
          ...m,
          snippet: m.snippet?.slice(0, 100),
          body: m.body?.slice(0, 500),
          from: m.from?.split('<')[0]?.trim()
        }))
      };
    }

    // Trim email body
    if (result.body) {
      return { ...result, body: result.body.slice(0, 800) };
    }

    // Trim search results
    if (result.results) {
      return {
        ...result,
        results: result.results.slice(0, 3).map(r => ({
          ...r,
          snippet: r.snippet?.slice(0, 200)
        }))
      };
    }

    return result;
  }
}

module.exports = { Ellen };
