'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { start } = require('./bot');

function main() {
  console.log('🦈 Ellen Bot starting...');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN missing in .env');
    process.exit(1);
  }
  const bot = start({ token, ownerId, polling: true });
  bot.getMe()
    .then((me) => console.log(`🦈 Ellen running as @${me.username} (id ${me.id})`))
    .catch((e) => console.error('getMe failed:', e.message));

  process.on('SIGINT', () => {
    console.log('\n*yawns* shutting down...');
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { main };
