# Ellen Bot Project

A Telegram AI assistant in the voice of Ellen Joe (Zenless Zone Zero). One owner: `@imnotyouraverage`.

## Stack

- **Runtime:** Node.js 18+ (this machine: v22)
- **Telegram:** `node-telegram-bot-api` (long polling, allowlist DM only)
- **LLM:** GLM-4-Flash via Z.ai BigModel API (JWT auth, OpenAI-compat schema)
- **Fallback LLM:** Claude Haiku 4.5 — used for sensitive topics ONLY when an `ANTHROPIC_API_KEY` is present; otherwise the deflection layer fires before any LLM call so no fallback is needed.
- **Storage:** `better-sqlite3` for task queue, reminders, last-seen timestamps
- **Background tools:** `yt-dlp`, `ffmpeg` via child_process

## Personality

Lives in `skills/ellen/SKILL.md`. The full file is loaded as the system prompt. `prompts/ellen_core.md` adds hard rules. `prompts/deflections.md` and `prompts/task_responses.md` are used by the deterministic pre-LLM layer.

## Architecture (single-process)

```
src/index.js          startup: load config, init db, wire bot, start schedulers
src/bot.js            telegram message handler, allowlist, dispatch
src/llm.js            GLM client (JWT auth) + Anthropic client (optional)
src/personality.js    builds the system prompt from SKILL.md + ellen_core.md
src/deflections.js    pre-LLM filter: identity, model, banned political, personal probe
src/db.js             sqlite init + migrations
src/taskQueue.js      queue with max 1 active + 5 queued
src/reminders.js      polling-based reminder dispatcher
src/proactive.js      silence-based check-in scheduler
src/tools/ytdlp.js    background download
src/tools/ffmpeg.js   compress / convert / extract audio
```

## Run

```bash
bash scripts/setup.sh     # install deps + run tests
bash scripts/test_all.sh  # tests only
npm start                 # start the bot
```

All credentials in `.env`. Never commit it.

## What's live vs. pending

- **Live:** Telegram, GLM, deflections, task queue, reminders, proactive, yt-dlp, ffmpeg
- **Pending (need credentials):** Google Drive / Calendar / Gmail (need refresh token from OAuth flow), Instagram, image gen, web search, Composio, Anthropic fallback, GitHub push
