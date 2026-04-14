#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "🦈 Ellen Bot Setup"
echo "─────────────────"

# 1) Node check
NODE_VER="$(node --version 2>/dev/null || echo 'missing')"
echo "Node.js          $NODE_VER"

# 2) Required tools
have() { command -v "$1" >/dev/null 2>&1; }
YTDLP_OK="❌"; have yt-dlp && YTDLP_OK="✅ $(yt-dlp --version 2>/dev/null)"
FFMPEG_OK="❌"; have ffmpeg && FFMPEG_OK="✅ $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $1, $3}')"
echo "yt-dlp           $YTDLP_OK"
echo "ffmpeg           $FFMPEG_OK"

# 3) .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env             created from example (fill in tokens)"
else
  echo ".env             ✅ present"
fi

# 4) npm install
if [ ! -d node_modules ]; then
  echo
  echo "→ installing npm deps..."
  npm install --silent
fi
echo "node_modules     ✅"

# 5) DB init via require
node -e "require('./src/db').getDb(); console.log('db init       ✅');"

# 6) Telegram + GLM live check
node -e "
require('dotenv').config();
(async () => {
  const tok = process.env.TELEGRAM_BOT_TOKEN;
  if (!tok) { console.log('Telegram        ❌ TELEGRAM_BOT_TOKEN missing'); process.exit(0); }
  const r = await fetch('https://api.telegram.org/bot' + tok + '/getMe').then(r => r.json()).catch(e => ({ok:false, error:e.message}));
  if (r.ok) console.log('Telegram        ✅ @' + r.result.username);
  else console.log('Telegram        ❌ ' + (r.description || r.error));
})();
"

node -e "
require('dotenv').config();
const { callGlm } = require('./src/llm');
(async () => {
  if (!process.env.GLM_API_KEY) { console.log('GLM             ❌ key missing'); return; }
  try {
    const out = await callGlm({ system: 'reply with one word: ok', messages: [{ role: 'user', content: 'ping' }], maxTokens: 10 });
    console.log('GLM             ✅ ' + out.slice(0, 30));
  } catch (e) {
    console.log('GLM             ❌ ' + e.message.slice(0, 80));
  }
})();
"

# 7) Pending integrations
echo "Google Drive     ⏳ pending (need GOOGLE_REFRESH_TOKEN)"
echo "Google Calendar  ⏳ pending (need GOOGLE_REFRESH_TOKEN)"
echo "Gmail            ⏳ pending (need GOOGLE_REFRESH_TOKEN)"
echo "Instagram        ⏳ pending (need INSTAGRAM_ACCESS_TOKEN)"
echo "Image gen        ⏳ pending (need IMAGE_API_KEY)"
echo "Web search       ⏳ pending (need SEARCH_API_KEY)"
echo "GitHub push      ⏳ pending (need GITHUB_TOKEN)"

# 8) Tests
echo
echo "→ running tests..."
bash scripts/test_all.sh

echo
echo "─────────────────"
echo "🦈 Ellen is ready."
