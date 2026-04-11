# 🦈 Ellen Bot

![Tests](https://github.com/imnotyouraverage/ellen-bot/actions/workflows/test.yml/badge.svg)

**Ellen Joe** — a cool, aloof, secretly helpful AI assistant from Zenless Zone Zero.
Powered by OpenClaw with MCP tool integration. Connected to Telegram.

She'll help you with your stuff. Just don't expect her to be excited about it.

---

## Prerequisites

- **Node.js** v20+
- **Telegram Bot Token** (from [@BotFather](https://t.me/BotFather))
- **API Keys** for the models and services you want to use

## Quick Start

```bash
# Clone
git clone https://github.com/imnotyouraverage/ellen-bot.git
cd ellen-bot

# One-command setup
bash scripts/setup.sh

# Fill in your API keys
nano .env   # or open in your editor

# Start Ellen
npm start
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `OWNER_TELEGRAM_ID` | Yes | Your Telegram numeric user ID |
| `GLM_API_KEY` | Yes | ZhipuAI GLM-4-Flash API key (primary model) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (fallback model) |
| `GOOGLE_CLIENT_ID` | For Drive/Cal | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Drive/Cal | Google OAuth client secret |
| `INSTAGRAM_ACCESS_TOKEN` | For IG | Instagram Graph API token |
| `COMPOSIO_API_KEY` | For IG | Composio platform API key |
| `IMAGE_GEN_API_KEY` | For images | Image generation service API key |
| `RAILWAY_TOKEN` | For deploy | Railway deploy token |

## Running Tests

```bash
# All tests
npm test

# Or run the full suite with labels
bash scripts/test_all.sh

# Individual test files
npm run test:personality
npm run test:queue
npm run test:deflections
npm run test:tools
npm run test:proactive
```

## Project Structure

```
ellen-bot/
├── .github/workflows/     CI/CD (test on push, deploy on merge)
├── skills/ellen/          Ellen's personality and tool instructions
├── flows/                 Proactive messages, reminders, task queue
├── prompts/               Core personality, deflections, task voice
├── tests/                 Full test suite (personality, queue, tools...)
├── config/                OpenClaw, model routing, MCP servers
├── scripts/               Setup, test, deploy scripts
└── memory/                Session and persistent memory
```

## Customizing Ellen

Edit [skills/ellen/SKILL.md](skills/ellen/SKILL.md) to change Ellen's personality.
The file controls her voice, mood triggers, deflection rules, and task queue behavior.

Key sections:
- **Core Personality** — dominance order of her traits
- **Mood Triggers** — how she reacts to specific topics
- **Speech Patterns** — filler phrases, lowercase energy
- **Deflection Rules** — what she refuses to engage with
- **Proactive Messages** — idle check-in message pool
- **Task Queue Rules** — background task limits and voice

## MCP Tools

Ellen has access to these tools via MCP servers:

| Tool | What it does |
|---|---|
| Google Drive | Save, find, upload, download files |
| Google Calendar | Create events, read schedule, reminders |
| Instagram | Read DMs, post content, check notifications |
| Image Generation | Generate images as background tasks |
| Web Search | Search, news, fact checking |
| Task Scheduler | Proactive messages, reminders, monitoring |

## Troubleshooting

**Tests failing?**
```bash
npm test 2>&1 | head -50   # See which tests fail
```

**Ellen not responding on Telegram?**
- Check `TELEGRAM_BOT_TOKEN` is correct
- Check `OWNER_TELEGRAM_ID` matches your Telegram user ID
- Make sure the bot is started: `npm start`

**MCP tools not working?**
- Run `bash scripts/setup.sh` to verify all connections
- Check that relevant API keys are set in `.env`
- Google tools need OAuth setup first

**OpenClaw not found?**
```bash
npm install -g openclaw
```

**Deploy failing?**
- Check `RAILWAY_TOKEN` is set
- Run `railway login` if using CLI directly
- Check deploy logs: `railway logs`

---

*"...you read the whole readme? hm. thorough."* — Ellen
