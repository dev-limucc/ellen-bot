const https = require('https');

class ImageGenTools {
  constructor() {
    this.apiKey = process.env.IMAGE_GEN_API_KEY;
  }

  async generate(prompt) {
    if (!this.apiKey) {
      // Use ZhipuAI CogView if GLM key is available
      if (process.env.GLM_API_KEY) {
        return this._generateCogView(prompt);
      }
      return { success: false, error: 'no image gen API key configured' };
    }

    // Generic image gen API call
    return this._generateCogView(prompt);
  }

  async _generateCogView(prompt) {
    const apiKey = this.apiKey || process.env.GLM_API_KEY;
    const body = JSON.stringify({
      model: 'cogview-3-flash',
      prompt
    });

    return new Promise((resolve) => {
      const url = new URL('https://open.bigmodel.cn/api/paas/v4/images/generations');
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.data && json.data[0]) {
              resolve({
                success: true,
                url: json.data[0].url,
                prompt
              });
            } else if (json.error) {
              resolve({ success: false, error: json.error.message });
            } else {
              resolve({ success: false, error: 'no image returned' });
            }
          } catch (e) {
            resolve({ success: false, error: e.message });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      req.setTimeout(60000, () => {
        req.destroy();
        resolve({ success: false, error: 'image generation timeout' });
      });
      req.write(body);
      req.end();
    });
  }
}

module.exports = { ImageGenTools };
