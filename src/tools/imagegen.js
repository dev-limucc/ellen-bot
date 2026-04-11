const https = require('https');

class ImageGenTools {
  constructor() {
    // Uses Pollinations.ai — free, no API key needed
  }

  async generate(prompt) {
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true`;

    // Verify the image generates successfully
    return new Promise((resolve) => {
      https.get(url, (res) => {
        if (res.statusCode === 200 && res.headers['content-type']?.includes('image')) {
          res.destroy();
          resolve({ success: true, url, prompt });
        } else {
          res.destroy();
          resolve({ success: false, error: 'image generation failed' });
        }
      }).on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }
}

module.exports = { ImageGenTools };
