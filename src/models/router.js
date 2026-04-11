const { GLMClient } = require('./glm');
const { ClaudeClient } = require('./claude');

class ModelRouter {
  constructor() {
    this.glm = process.env.GLM_API_KEY ? new GLMClient(process.env.GLM_API_KEY) : null;
    this.claude = process.env.ANTHROPIC_API_KEY ? new ClaudeClient(process.env.ANTHROPIC_API_KEY) : null;

    if (!this.glm && !this.claude) {
      console.warn('⚠️  No API keys configured. Ellen will be... very quiet.');
    }
  }

  /**
   * Route to the appropriate model.
   * Primary: GLM-4-Flash
   * Fallback: Claude Haiku (also used for sensitive topics)
   */
  async chat(messages, options = {}) {
    const { useFallback = false } = options;

    // If sensitive topic and Claude is available, prefer Claude
    if (useFallback && this.claude) {
      try {
        return await this.claude.chat(messages);
      } catch (err) {
        console.error('Claude fallback error:', err.message);
        // Fall through to GLM
      }
    }

    // Primary: GLM-4-Flash
    if (this.glm) {
      try {
        return await this.glm.chat(messages);
      } catch (err) {
        console.error('GLM primary error:', err.message);
        // Try Claude as fallback
        if (this.claude) {
          console.log('  Falling back to Claude...');
          return await this.claude.chat(messages);
        }
        throw err;
      }
    }

    // Only Claude available
    if (this.claude) {
      return await this.claude.chat(messages);
    }

    throw new Error('No AI model available');
  }
}

module.exports = { ModelRouter };
