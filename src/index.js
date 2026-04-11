require('dotenv').config();
const { EllenBot } = require('./bot');
const { ProactiveEngine } = require('./proactive');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = process.env.OWNER_TELEGRAM_ID;

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env');
  process.exit(1);
}
if (!OWNER_ID) {
  console.error('❌ OWNER_TELEGRAM_ID is not set in .env');
  process.exit(1);
}

async function main() {
  console.log('🦈 Starting Ellen...');

  const bot = new EllenBot(TOKEN, OWNER_ID);
  await bot.start();

  // Start proactive check-ins
  const proactive = new ProactiveEngine(bot);
  proactive.start();

  console.log('🦈 Ellen is online. "...whatever."');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🦈 Ellen is going to sleep...');
    proactive.stop();
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Prevent crashes from unhandled errors
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err.message || err);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err.message || err);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
