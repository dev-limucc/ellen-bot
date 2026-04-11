const https = require('https');

const GLM_API_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';

class GLMClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async chat(messages, options = {}) {
    const body = JSON.stringify({
      model: options.model || 'glm-4.5-air',
      messages,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature || 0.8,
      top_p: 0.9
    });

    return new Promise((resolve, reject) => {
      const url = new URL(GLM_API_URL);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(json.error.message || 'GLM API error'));
              return;
            }
            if (json.choices && json.choices[0]) {
              resolve(json.choices[0].message.content);
            } else {
              reject(new Error('No response from GLM'));
            }
          } catch (e) {
            reject(new Error(`GLM parse error: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('GLM request timeout'));
      });
      req.write(body);
      req.end();
    });
  }
}

module.exports = { GLMClient };
