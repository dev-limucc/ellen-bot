const https = require('https');

const GLM_API_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';

class GLMClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async chat(messages, options = {}) {
    const body = {
      model: options.model || 'glm-4.5-air',
      messages,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature || 0.8,
      top_p: 0.9
    };

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    return this._request(body);
  }

  async _request(body) {
    const data = JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const url = new URL(GLM_API_URL);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            if (json.error) {
              reject(new Error(json.error.message || 'GLM API error'));
              return;
            }
            if (json.choices && json.choices[0]) {
              const choice = json.choices[0];
              // Return full message object when tool calls are present
              if (choice.message.tool_calls) {
                resolve({
                  type: 'tool_calls',
                  tool_calls: choice.message.tool_calls,
                  content: choice.message.content
                });
              } else {
                resolve({
                  type: 'text',
                  content: choice.message.content
                });
              }
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
      req.write(data);
      req.end();
    });
  }
}

module.exports = { GLMClient };
