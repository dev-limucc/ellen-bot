---
name: video-download
description: "Download videos and audio from YouTube, Instagram, TikTok, Twitter/X, Reddit, and 1000+ other sites using yt-dlp. Use when: user shares a video link and asks to download it, save it, get audio from it, or extract music. NOT for: sites that block scraping, files >50MB (Telegram limit), or requesting copyrighted content for distribution."
metadata:
  {
    "openclaw":
      {
        "emoji": "📹",
        "requires": { "bins": ["yt-dlp", "ffmpeg"] }
      }
  }
---

# Video Download Skill

Download videos or extract audio from links the user shares.

## When to Use

Use this skill when the user:
- Shares a YouTube/Instagram/TikTok/Twitter/Reddit link and says "download this"
- Asks for the audio/music from a video
- Wants to save a clip
- Says "download", "save", "get", "rip" with a URL

## How to Use

### Download a video (default — sends as Telegram video)
```bash
mkdir -p /tmp/ellen-downloads
yt-dlp "<URL>" \
  -o "/tmp/ellen-downloads/%(id)s.%(ext)s" \
  --no-playlist \
  --max-filesize 50m \
  -f "best[filesize<50M][ext=mp4]/best[filesize<50M]" \
  --merge-output-format mp4 \
  --print after_move:filepath
```

The last line of stdout is the absolute file path. Send it to the user via the active channel.

### Extract audio only (MP3)
```bash
mkdir -p /tmp/ellen-downloads
yt-dlp "<URL>" \
  -o "/tmp/ellen-downloads/%(id)s.%(ext)s" \
  --no-playlist \
  --max-filesize 50m \
  -x --audio-format mp3 --audio-quality 0 \
  --print after_move:filepath
```

### Get info without downloading
```bash
yt-dlp "<URL>" --dump-json --no-download --no-playlist
```
Returns JSON with title, duration, uploader, thumbnail.

## Workflow

1. Run yt-dlp with the appropriate command
2. Get the file path from the last stdout line
3. Send the file via the active channel (Telegram supports sendVideo, sendAudio, sendDocument)
4. Report back to user in Ellen voice: "here." or "got it. enjoy."
5. Clean up old downloads after sending: `find /tmp/ellen-downloads -mmin +60 -delete`

## Errors

- Download fails → "so. it didn't work. probably blocked or too big."
- File >50MB → "that one's too big for telegram. try a shorter clip."
- yt-dlp missing → "video downloader's broken. need to reinstall yt-dlp."

## Examples

**User:** "download this https://youtube.com/watch?v=dQw4w9WgXcQ"
**Action:** Run video download command, then send the mp4 file via Telegram.

**User:** "get the audio from https://youtube.com/watch?v=..."
**Action:** Run audio extraction with `-x --audio-format mp3`, send mp3.

**User:** "what is this video https://youtube.com/..."
**Action:** Run dump-json, summarize title/duration/uploader in Ellen voice.
