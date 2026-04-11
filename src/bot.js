const TelegramBot = require('node-telegram-bot-api');
const { Ellen } = require('./ellen');
const { ToolManager } = require('./tools/manager');
const { GoogleAuth } = require('./google/auth');

class EllenBot {
  constructor(token, ownerId) {
    this.token = token;
    this.ownerId = String(ownerId);
    this.bot = new TelegramBot(token, { polling: true });
    this.ellen = new Ellen();
    this.tools = new ToolManager();
    this.googleAuth = new GoogleAuth();
    this.lastMessageTime = new Map(); // userId -> timestamp
    this._setupHandlers();
  }

  _setupHandlers() {
    // Only respond to owner
    this.bot.on('message', async (msg) => {
      const chatId = String(msg.chat.id);
      const userId = String(msg.from.id);

      if (userId !== this.ownerId) {
        await this.bot.sendMessage(chatId, "...I don't talk to strangers.");
        return;
      }

      // Track last message time for proactive engine
      this.lastMessageTime.set(userId, Date.now());

      const text = msg.text;
      if (!text) return;

      // Show typing indicator
      await this.bot.sendChatAction(chatId, 'typing');

      // Check for commands
      if (text.startsWith('/')) {
        await this._handleCommand(chatId, userId, text);
        return;
      }

      // Check for tool invocations in natural language
      try {
        const toolResult = await this._checkToolIntent(text);
        if (toolResult) {
          if (!toolResult.result.success) {
            await this.bot.sendMessage(chatId, "so. it didn't work. not my fault though.");
            return;
          }
          const response = await this.ellen.respondWithToolResult(userId, toolResult.tool, toolResult.result);
          await this.bot.sendMessage(chatId, response);
          return;
        }
      } catch (err) {
        console.error('Tool intent error:', err.message);
      }

      // Normal conversation
      const response = await this.ellen.respond(userId, text);
      await this.bot.sendMessage(chatId, response);
    });

    // Handle callback queries (for inline buttons)
    this.bot.on('callback_query', async (query) => {
      const chatId = String(query.message.chat.id);
      const data = query.data;

      if (data === 'queue_yes') {
        await this.bot.answerCallbackQuery(query.id, { text: 'queued.' });
        await this.bot.sendMessage(chatId, "fine. queued it.");
      } else if (data === 'queue_no') {
        await this.bot.answerCallbackQuery(query.id, { text: 'dropped.' });
        await this.bot.sendMessage(chatId, "okay. dropped.");
      } else if (data.startsWith('confirm_post_')) {
        await this.bot.answerCallbackQuery(query.id, { text: 'posting...' });
        await this.bot.sendMessage(chatId, "okay okay, posting. don't blame me if it flops.");
      } else if (data === 'cancel_post') {
        await this.bot.answerCallbackQuery(query.id, { text: 'cancelled.' });
        await this.bot.sendMessage(chatId, "cancelled. probably for the best.");
      }
    });

    this.bot.on('polling_error', (err) => {
      console.error('Telegram polling error:', err.message);
    });
  }

  async _handleCommand(chatId, userId, text) {
    const [cmd, ...args] = text.split(' ');
    const arg = args.join(' ');

    switch (cmd) {
      case '/start':
        await this.bot.sendMessage(chatId,
          "...oh. you're here.\n\nI'm Ellen. I'll help with stuff I guess. don't make it weird.\n\ntype /help if you need it.");
        break;

      case '/help':
        await this.bot.sendMessage(chatId,
          `okay fine. here's what I can do:

/remind <time> <thing> — I'll remind you
/schedule — show your calendar
/save <text> — save something to Drive
/find <query> — search your Drive
/search <query> — web search
/imagine <prompt> — generate an image
/queue — check task queue
/google — connect Google account
/status — how I'm doing (not great)

or just... talk to me. I guess.`);
        break;

      case '/status': {
        const queueStatus = this.ellen.queue.getStatus();
        const googleStatus = this.googleAuth.isAuthenticated() ? 'connected' : 'not connected';
        await this.bot.sendMessage(chatId,
          `...fine. status report:

active tasks: ${queueStatus.active ? 1 : 0}
queued: ${queueStatus.queued}
completed today: ${queueStatus.completed}
google: ${googleStatus}
mood: tired. as usual.`);
        break;
      }

      case '/remind': {
        if (!arg) {
          await this.bot.sendMessage(chatId, "remind you about what. you didn't say anything.");
          return;
        }
        // Parse time and task from arg
        const response = await this.ellen.respond(userId,
          `The user wants to set a reminder: "${arg}". Parse the time and task, set it, and confirm in your voice.`);
        await this.bot.sendMessage(chatId, response);
        break;
      }

      case '/schedule': {
        if (!this.googleAuth.isAuthenticated()) {
          await this.bot.sendMessage(chatId, "google's not connected. do /google first.");
          return;
        }
        const events = await this.tools.calendar.getToday();
        const response = await this.ellen.respondWithToolResult(userId, 'calendar', events);
        await this.bot.sendMessage(chatId, response);
        break;
      }

      case '/save': {
        if (!arg) {
          await this.bot.sendMessage(chatId, "save what. you gave me nothing.");
          return;
        }
        if (!this.googleAuth.isAuthenticated()) {
          await this.bot.sendMessage(chatId, "google's not connected. do /google first.");
          return;
        }
        const result = await this.tools.drive.saveNote(arg);
        const response = await this.ellen.respondWithToolResult(userId, 'drive_save', result);
        await this.bot.sendMessage(chatId, response);
        break;
      }

      case '/find': {
        if (!arg) {
          await this.bot.sendMessage(chatId, "find what.");
          return;
        }
        if (!this.googleAuth.isAuthenticated()) {
          await this.bot.sendMessage(chatId, "google's not connected. do /google first.");
          return;
        }
        const files = await this.tools.drive.search(arg);
        const response = await this.ellen.respondWithToolResult(userId, 'drive_search', files);
        await this.bot.sendMessage(chatId, response);
        break;
      }

      case '/search': {
        if (!arg) {
          await this.bot.sendMessage(chatId, "search for what. use your words.");
          return;
        }
        await this.bot.sendChatAction(chatId, 'typing');
        const results = await this.tools.web.search(arg);
        const response = await this.ellen.respondWithToolResult(userId, 'web_search', results);
        await this.bot.sendMessage(chatId, response);
        break;
      }

      case '/imagine': {
        if (!arg) {
          await this.bot.sendMessage(chatId, "imagine what. give me a prompt.");
          return;
        }
        const queueResult = this.ellen.queue.addTask({
          id: `img_${Date.now()}`,
          type: 'image_gen',
          description: `generate image: ${arg}`
        });

        if (queueResult.action === 'started') {
          await this.bot.sendMessage(chatId, "okay okay, on it. don't hover.");
          // Run image gen in background
          this.tools.imageGen.generate(arg).then(async (result) => {
            this.ellen.queue.completeActive(result);
            if (result.url) {
              await this.bot.sendPhoto(chatId, result.url, { caption: "btw. your image is ready." });
            } else {
              await this.bot.sendMessage(chatId, "btw. your image is ready. you're welcome.");
            }
          }).catch(async () => {
            this.ellen.queue.failActive('generation failed');
            await this.bot.sendMessage(chatId, "so. the image thing didn't work. try a different prompt maybe.");
          });
        } else {
          await this.bot.sendMessage(chatId, queueResult.message);
        }
        break;
      }

      case '/queue': {
        const status = this.ellen.queue.getStatus();
        if (!status.active && status.queued === 0) {
          await this.bot.sendMessage(chatId, "nothing running. I'm free. unfortunately.");
        } else {
          let msg = '';
          if (status.active) msg += `active: ${status.active.description}\n`;
          if (status.queued > 0) msg += `queued: ${status.queued} tasks\n`;
          msg += `completed: ${status.completed}`;
          await this.bot.sendMessage(chatId, msg);
        }
        break;
      }

      case '/google': {
        const authUrl = this.googleAuth.getAuthUrl();
        if (this.googleAuth.isAuthenticated()) {
          await this.bot.sendMessage(chatId, "google's already connected. you're good.");
        } else if (authUrl) {
          await this.bot.sendMessage(chatId,
            `okay. click this to connect your google:\n\n${authUrl}\n\nthen send me the code it gives you with /gcode <code>`);
        } else {
          await this.bot.sendMessage(chatId,
            "google client ID and secret aren't set. check your .env file.");
        }
        break;
      }

      case '/gcode': {
        if (!arg) {
          await this.bot.sendMessage(chatId, "you forgot the code.");
          return;
        }
        try {
          await this.googleAuth.handleCode(arg.trim());
          this.tools.initGoogle(this.googleAuth);
          await this.bot.sendMessage(chatId, "connected. google stuff should work now.");
        } catch (err) {
          await this.bot.sendMessage(chatId, `didn't work. ${err.message || 'bad code maybe. try again.'}`);
        }
        break;
      }

      default:
        await this.bot.sendMessage(chatId, "...I don't know that command. try /help.");
    }
  }

  async _checkToolIntent(text) {
    if (!this.googleAuth.isAuthenticated()) return null;
    const lower = text.toLowerCase();

    // Gmail triggers
    const gmailTriggers = ['check my mail', 'check my email', 'check my gmail',
      'read my mail', 'read my email', 'read my gmail', 'any new mail',
      'any new email', 'unread mail', 'unread email', 'inbox',
      'check mail', 'check email', 'new emails', 'new messages in mail',
      'do i have mail', 'do i have email', 'any emails'];
    if (gmailTriggers.some(t => lower.includes(t))) {
      try {
        const result = await this.tools.gmail.getUnread();
        return { tool: 'gmail_unread', result };
      } catch (err) {
        return { tool: 'gmail_unread', result: { success: false, error: err.message } };
      }
    }

    // Calendar triggers
    const calTriggers = ['my schedule', 'my calendar', 'what do i have today',
      'any meetings', 'any events', "today's schedule", 'what\'s on my calendar',
      'am i busy', 'am i free', 'what\'s today look like', 'plans for today'];
    if (calTriggers.some(t => lower.includes(t))) {
      try {
        const result = await this.tools.calendar.getToday();
        return { tool: 'calendar_today', result };
      } catch (err) {
        return { tool: 'calendar_today', result: { success: false, error: err.message } };
      }
    }

    // Drive search triggers
    const driveSearchMatch = lower.match(/(?:find|search|look for|where is|find me)\s+(?:the\s+)?(?:file|doc|document|sheet)?\s*(?:called|named|about)?\s*["""]?(.+?)["""]?\s*(?:in|on|from)?\s*(?:drive|google drive)?$/);
    if (driveSearchMatch) {
      try {
        const result = await this.tools.drive.search(driveSearchMatch[1].trim());
        return { tool: 'drive_search', result };
      } catch (err) {
        return { tool: 'drive_search', result: { success: false, error: err.message } };
      }
    }

    // Save note triggers
    const saveMatch = lower.match(/(?:save|note|remember|write down|jot down)\s+(?:this|that)?\s*:?\s*(.+)/);
    if (saveMatch && (lower.startsWith('save') || lower.startsWith('note') || lower.startsWith('remember') || lower.startsWith('write down') || lower.startsWith('jot down'))) {
      try {
        const result = await this.tools.drive.saveNote(saveMatch[1].trim());
        return { tool: 'drive_save', result };
      } catch (err) {
        return { tool: 'drive_save', result: { success: false, error: err.message } };
      }
    }

    // Web search triggers
    const searchMatch = lower.match(/(?:search|look up|google|what is|what's|who is|who's)\s+(.+)/);
    if (searchMatch && (lower.startsWith('search') || lower.startsWith('look up') || lower.startsWith('google '))) {
      try {
        const result = await this.tools.web.search(searchMatch[1].trim());
        return { tool: 'web_search', result };
      } catch (err) {
        return { tool: 'web_search', result: { success: false, error: err.message } };
      }
    }

    return null;
  }

  async sendMessage(chatId, text) {
    await this.bot.sendMessage(chatId, text);
  }

  getLastMessageTime(userId) {
    return this.lastMessageTime.get(String(userId)) || Date.now();
  }

  async start() {
    // If Google auth was restored from a saved token, initialize tools now
    if (this.googleAuth.isAuthenticated()) {
      this.tools.initGoogle(this.googleAuth);
    }
    console.log('  Telegram bot connected');
  }

  async stop() {
    this.bot.stopPolling();
  }
}

module.exports = { EllenBot };
