const https = require('https');

class WebTools {
  constructor() {
    // Uses DuckDuckGo instant answer API (no key needed)
    // For full search, you'd add a search API key
  }

  async search(query) {
    return new Promise((resolve) => {
      const encoded = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const results = [];

            // Abstract/instant answer
            if (json.Abstract) {
              results.push({
                title: json.Heading || query,
                snippet: json.Abstract,
                url: json.AbstractURL
              });
            }

            // Related topics
            if (json.RelatedTopics) {
              for (const topic of json.RelatedTopics.slice(0, 5)) {
                if (topic.Text) {
                  results.push({
                    title: topic.Text.slice(0, 80),
                    snippet: topic.Text,
                    url: topic.FirstURL
                  });
                }
              }
            }

            if (results.length === 0 && json.AbstractText) {
              results.push({
                title: query,
                snippet: json.AbstractText,
                url: json.AbstractURL
              });
            }

            resolve({
              success: true,
              results,
              count: results.length,
              source: 'duckduckgo'
            });
          } catch {
            resolve({ success: false, error: 'search parse error', results: [] });
          }
        });
      }).on('error', (err) => {
        resolve({ success: false, error: err.message, results: [] });
      });
    });
  }
}

module.exports = { WebTools };
