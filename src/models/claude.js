const https = require('https');

class ClaudeClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async chat(messages, options = {}) {
    // Separate system message from conversation
    let system = '';
    const conversationMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system += msg.content + '\n';
      } else {
        conversationMessages.push(msg);
      }
    }

    // Ensure messages alternate user/assistant
    const cleanMessages = this._cleanMessages(conversationMessages);

    const body = JSON.stringify({
      model: options.model || 'claude-haiku-4-5-20251001',
      max_tokens: options.maxTokens || 2048,
      system: system.trim(),
      messages: cleanMessages
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(json.error.message || 'Claude API error'));
              return;
            }
            if (json.content && json.content[0]) {
              resolve(json.content[0].text);
            } else {
              reject(new Error('No response from Claude'));
            }
          } catch (e) {
            reject(new Error(`Claude parse error: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Claude request timeout'));
      });
      req.write(body);
      req.end();
    });
  }

  /**
   * Ensure messages strictly alternate user/assistant,
   * starting with user. Required by Claude API.
   */
  _cleanMessages(messages) {
    if (messages.length === 0) {
      return [{ role: 'user', content: 'hello' }];
    }

    const clean = [];
    for (const msg of messages) {
      if (msg.role !== 'user' && msg.role !== 'assistant') continue;
      // Skip if same role as previous
      if (clean.length > 0 && clean[clean.length - 1].role === msg.role) {
        clean[clean.length - 1].content += '\n' + msg.content;
      } else {
        clean.push({ ...msg });
      }
    }

    // Must start with user
    if (clean.length === 0 || clean[0].role !== 'user') {
      clean.unshift({ role: 'user', content: '...' });
    }

    return clean;
  }
}

module.exports = { ClaudeClient };
