const https = require('https');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async chat(messages, options = {}) {
    // Convert OpenAI-style messages to Gemini format
    let systemInstruction = '';
    const contents = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += msg.content + '\n';
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Ensure we have at least one user message
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: '...' }] });
    }

    // Ensure alternating roles
    const cleaned = this._cleanContents(contents);

    const body = JSON.stringify({
      contents: cleaned,
      systemInstruction: systemInstruction ? {
        parts: [{ text: systemInstruction.trim() }]
      } : undefined,
      generationConfig: {
        temperature: options.temperature || 0.8,
        maxOutputTokens: options.maxTokens || 2048,
        topP: 0.9
      }
    });

    return new Promise((resolve, reject) => {
      const url = `${GEMINI_API_URL}?key=${this.apiKey}`;
      const parsed = new URL(url);

      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(json.error.message || 'Gemini API error'));
              return;
            }
            if (json.candidates && json.candidates[0]?.content?.parts?.[0]?.text) {
              resolve(json.candidates[0].content.parts[0].text);
            } else {
              reject(new Error('No response from Gemini'));
            }
          } catch (e) {
            reject(new Error(`Gemini parse error: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Gemini request timeout'));
      });
      req.write(body);
      req.end();
    });
  }

  /**
   * Ensure contents alternate user/model roles
   */
  _cleanContents(contents) {
    if (contents.length === 0) return [{ role: 'user', parts: [{ text: '...' }] }];

    const cleaned = [];
    for (const msg of contents) {
      if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === msg.role) {
        // Merge same-role messages
        cleaned[cleaned.length - 1].parts[0].text += '\n' + msg.parts[0].text;
      } else {
        cleaned.push({ ...msg, parts: [...msg.parts] });
      }
    }

    // Must start with user
    if (cleaned[0].role !== 'user') {
      cleaned.unshift({ role: 'user', parts: [{ text: '...' }] });
    }

    return cleaned;
  }
}

module.exports = { GeminiClient };
