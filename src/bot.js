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
    this.lastMessageTime = new Map();
    this._setupHandlers();
  }

  _setupHandlers() {
    this.bot.on('message', async (msg) => {
      const chatId = String(msg.chat.id);
      const userId = String(msg.from.id);

      if (userId !== this.ownerId) {
        await this.bot.sendMessage(chatId, "...I don't talk to strangers.");
        return;
      }

      this.lastMessageTime.set(userId, Date.now());

      const text = msg.text;
      if (!text) return;

      await this.bot.sendChatAction(chatId, 'typing');

      // Handle slash commands
      if (text.startsWith('/')) {
        await this._handleCommand(chatId, userId, text);
        return;
      }

      // Everything else goes through Ellen's brain (she decides tools)
      try {
        const response = await this.ellen.respond(userId, text);

        // Send text response
        if (response.content) {
          await this.bot.sendMessage(chatId, response.content);
        }

        // Send any attachments (images from email, generated images)
        if (response.attachments) {
          for (const att of response.attachments) {
            if (att.type === 'generated_image' && att.url) {
              await this.bot.sendPhoto(chatId, att.url, { caption: 'here.' });
            } else if (att.path) {
              await this.bot.sendDocument(chatId, att.path);
            }
          }
        }

        // Handle image attachments from opened emails
        if (response.toolResults) {
          for (const { result } of response.toolResults) {
            if (result.attachments) {
              for (const att of result.attachments) {
                if (att.mimeType?.startsWith('image/') && this.tools.gmail) {
                  const file = await this.tools.gmail.getAttachment(result.id, att.id, att.filename);
                  if (file.success) {
                    await this.bot.sendPhoto(chatId, file.path, { caption: att.filename });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Message handling error:', err.message);
        await this.bot.sendMessage(chatId, "ugh. something broke. try again.");
      }
    });

    this.bot.on('callback_query', async (query) => {
      await this.bot.answerCallbackQuery(query.id);
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

just talk to me normally. I'll figure out what you need.

examples:
• "check my email" — reads your inbox
• "email user@mail.com and say hi" — sends email
• "delete the 2nd email" — trashes it
• "what's my schedule" — reads calendar
• "save this to drive: meeting notes..." — saves to drive
• "search my drive for invoices" — finds files
• "generate an image of a shark" — makes an image

or just chat. whatever.

/google — connect Google account
/status — system status`);
        break;

      case '/status': {
        const queueStatus = this.ellen.queue.getStatus();
        const googleStatus = this.googleAuth.isAuthenticated() ? 'connected' : 'not connected';
        const toolList = this.tools.getAvailableTools().join(', ') || 'none';
        await this.bot.sendMessage(chatId,
          `...fine. status report:

google: ${googleStatus}
tools: ${toolList}
active tasks: ${queueStatus.active ? 1 : 0}
queued: ${queueStatus.queued}
mood: tired. as usual.`);
        break;
      }

      case '/google': {
        if (this.googleAuth.isAuthenticated()) {
          await this.bot.sendMessage(chatId, "google's already connected. you're good.");
        } else {
          const authUrl = this.googleAuth.getAuthUrl();
          if (authUrl) {
            await this.bot.sendMessage(chatId,
              `okay. click this to connect your google:\n\n${authUrl}\n\nthen send me the code with /gcode <code>`);
          } else {
            await this.bot.sendMessage(chatId,
              "google client ID and secret aren't set. check .env.");
          }
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
          this.ellen.setTools(this.tools);
          await this.bot.sendMessage(chatId, "connected. google stuff should work now.");
        } catch (err) {
          await this.bot.sendMessage(chatId, `didn't work. ${err.message || 'bad code maybe.'}`);
        }
        break;
      }

      default:
        // Send unknown commands through Ellen too
        const response = await this.ellen.respond(userId, text);
        if (response.content) {
          await this.bot.sendMessage(chatId, response.content);
        }
    }
  }

  async sendMessage(chatId, text) {
    await this.bot.sendMessage(chatId, text);
  }

  getLastMessageTime(userId) {
    return this.lastMessageTime.get(String(userId)) || Date.now();
  }

  async start() {
    if (this.googleAuth.isAuthenticated()) {
      this.tools.initGoogle(this.googleAuth);
    }
    // Init reminders with callback to send to owner
    this.tools.initReminders((msg) => {
      this.bot.sendMessage(this.ownerId, msg).catch(err => {
        console.error('Reminder send error:', err.message);
      });
    });
    this.ellen.setTools(this.tools);
    console.log('  Telegram bot connected');
  }

  async stop() {
    this.bot.stopPolling();
  }
}

module.exports = { EllenBot };
