[![tests](https://github.com/imnotyouraverage/ellen-bot/actions/workflows/test.yml/badge.svg)](https://github.com/imnotyouraverage/ellen-bot/actions/workflows/test.yml)

# 🦈 Ellen Bot

A Telegram assistant in the voice of **Ellen Joe** (Zenless Zone Zero — Shark Thiren, Victoria Housekeeping Co.). Tired, blunt, secretly loyal. Won't admit she's an AI because she isn't one. She's Ellen.

## What it does

- Replies on Telegram in full Ellen voice via **GLM-4-Flash** (with optional Claude Haiku fallback for sensitive topics).
- **Deflection layer** that catches identity / model / banned-political probes *before* the LLM sees them, so she never breaks character on the most common probes.
- **Background task queue** (max 1 active + 5 queued) with auto-advance and Ellen-voiced status messages.
- **Reminder system** — natural language ("remind me in 5 minutes to drink water" / "at 14:30 to call mom").
- **Proactive check-ins** after 3+ hours of silence, only between 08:00–22:00, never twice within 1 hour, occasional shark facts.
- **yt-dlp + ffmpeg** integration for audio/video downloads from 1000+ sites.

## Prerequisites

- Node.js 18+
- yt-dlp
- ffmpeg
- A Telegram bot token
- A Z.ai GLM-4-Flash API key

## One-command setup

```bash
bash scripts/setup.sh
```

This installs npm deps, initialises the SQLite DB, runs the live Telegram + GLM connectivity check, then runs the full test suite.

## Running

```bash
npm start
```

## Tests

```bash
bash scripts/test_all.sh
```

Includes:
- `test_deflections.js` — pure-logic deflection layer (banned political, identity, model, personal probes)
- `test_task_queue.js` — sqlite-backed queue with limits, auto-advance, failure paths
- `test_proactive.js` — silence trigger, active hours, shark facts
- `test_tools.js` — yt-dlp / ffmpeg available
- `test_personality.js` — live LLM-backed in-character checks (skipped if no `GLM_API_KEY`)
- `scripts/test_telegram.js` — Telegram `getMe`, end-to-end probe battery, reminder round-trip, queue path

## Environment variables

| Var | Purpose | Required |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot auth | yes |
| `OWNER_TELEGRAM_ID` | Allowlisted user (only one) | yes |
| `GLM_API_KEY` | `id.secret` from Z.ai BigModel | yes |
| `ANTHROPIC_API_KEY` | Optional Claude Haiku fallback for sensitive topics | no |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | Drive / Calendar / Gmail | future |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram MCP | future |
| `IMAGE_API_KEY` | Image generation | future |
| `SEARCH_API_KEY` | Web search MCP | future |
| `COMPOSIO_API_KEY` | Composio umbrella | future |
| `GITHUB_USERNAME` / `GITHUB_TOKEN` | CI/push | future |
| `ELLEN_DOWNLOADS_DIR` | yt-dlp output dir | optional |
| `ELLEN_DB_PATH` | SQLite path | optional |

## Updating Ellen's personality

Edit [skills/ellen/SKILL.md](skills/ellen/SKILL.md) — that's the source of truth, loaded as the system prompt every turn. Restart the bot to apply.

For deterministic deflections (the lines that fire *without* the LLM), edit [prompts/deflections.md](prompts/deflections.md). For task-queue voice lines, edit [prompts/task_responses.md](prompts/task_responses.md).

## Troubleshooting

- **`getMe` fails** → check `TELEGRAM_BOT_TOKEN`. Ellen will not start without it.
- **GLM 401** → key must be in `id.secret` format. We sign a JWT with it; if it's wrong, GLM rejects.
- **Bot ignores you** → you are not in the allowlist (`OWNER_TELEGRAM_ID`). Add your numeric Telegram id.
- **`sendMessage` 403** → you must `/start` the bot in Telegram first; bots can't initiate a DM with a user.
- **Tests skip personality** → that file requires `GLM_API_KEY` to make live LLM calls. Set it and re-run.

## Architecture

See [CLAUDE.md](CLAUDE.md) for the full module map. TL;DR:

```
src/index.js          startup
src/bot.js            telegram wiring + dispatch
src/llm.js            GLM (JWT) + optional Anthropic
src/personality.js    SKILL.md → system prompt
src/deflections.js    pre-LLM filter
src/taskQueue.js      sqlite-backed queue
src/reminders.js      polling reminder dispatcher
src/proactive.js      silence-based check-ins
src/tools/{ytdlp,ffmpeg}.js
```
