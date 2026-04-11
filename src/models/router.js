const { GLMClient } = require('./glm');
const { ClaudeClient } = require('./claude');
const { GeminiClient } = require('./gemini');

class ModelRouter {
  constructor() {
    this.glm = process.env.GLM_API_KEY ? new GLMClient(process.env.GLM_API_KEY) : null;
    this.gemini = process.env.GEMINI_API_KEY ? new GeminiClient(process.env.GEMINI_API_KEY) : null;
    this.claude = process.env.ANTHROPIC_API_KEY ? new ClaudeClient(process.env.ANTHROPIC_API_KEY) : null;

    const available = [];
    if (this.glm) available.push('GLM (primary)');
    if (this.gemini) available.push('Gemini Flash');
    if (this.claude) available.push('Claude Haiku');

    if (available.length === 0) {
      console.warn('⚠️  No API keys configured. Ellen will be... very quiet.');
    } else {
      console.log('  Models:', available.join(', '));
    }
  }

  /**
   * Chat with tool support.
   * Returns { type: 'text', content } or { type: 'tool_calls', tool_calls }
   */
  async chat(messages, options = {}) {
    const { useFallback = false, tools } = options;

    if (useFallback) {
      if (this.claude) {
        try { return await this.claude.chat(messages); }
        catch (err) { console.error('Claude fallback error:', err.message); }
      }
      if (this.gemini) {
        try { return await this.gemini.chat(messages); }
        catch (err) { console.error('Gemini fallback error:', err.message); }
      }
    }

    // Primary: GLM (supports function calling)
    if (this.glm) {
      try {
        return await this.glm.chat(messages, { tools });
      } catch (err) {
        console.error('GLM primary error:', err.message);
      }
    }

    // Fallbacks don't support tool calling, so just text
    if (this.gemini) {
      try {
        const r = await this.gemini.chat(messages);
        return { type: 'text', content: r };
      } catch (err) { console.error('Gemini error:', err.message); }
    }

    if (this.claude) {
      try {
        const r = await this.claude.chat(messages);
        return { type: 'text', content: r };
      } catch (err) { console.error('Claude error:', err.message); }
    }

    throw new Error('No AI model available');
  }
}

module.exports = { ModelRouter };
