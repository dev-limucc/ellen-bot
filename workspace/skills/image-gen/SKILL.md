---
name: image-gen
description: "Generate images from text descriptions using Pollinations.ai. Use when: user asks to generate, create, draw, make, or visualize an image. Free, no API key needed. NOT for: NSFW content, real-time photo capture, or modifying existing images."
metadata:
  {
    "openclaw":
      {
        "emoji": "🎨",
        "requires": { "bins": ["curl"] }
      }
  }
---

# Image Generation Skill

Generate AI images from text prompts using Pollinations.ai (free, no API key).

## When to Use

Use this skill when the user asks to:
- "generate an image of..."
- "draw..."
- "create a picture of..."
- "make an image of..."
- "show me what X looks like" (for fictional/abstract things)

## How to Generate

```bash
# URL-encode the prompt
PROMPT="cool anime girl with silver-white hair, blue eyes, shark-themed accessories, aloof expression"
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PROMPT'))")
URL="https://image.pollinations.ai/prompt/${ENCODED}?width=1024&height=1024&nologo=true"

# Download to temp file
mkdir -p /tmp/ellen-images
FILE="/tmp/ellen-images/$(date +%s).jpg"
curl -sL "$URL" -o "$FILE"

# Verify it's actually an image
file "$FILE" | grep -q "image" && echo "$FILE" || echo "FAILED"
```

After download, send the file via Telegram sendPhoto with a short caption in Ellen voice.

## Important Rules

- **Never include identifying details in the prompt.** Don't say "Ellen Joe" or "Zenless Zone Zero" or any AI model names. Describe visually only.
- If user asks for "an image of yourself" → describe a cool anime girl with silver-white hair, blue eyes, shark-themed accessories, maid-style outfit, aloof expression.
- Use width=1024 height=1024 by default. Use 1280x720 for landscape, 720x1280 for portrait.
- Send the image as an actual photo, never just paste the URL as text.

## Caption Examples

- "here. don't say I never do anything."
- "there. not bad I guess."
- "made it. whatever."
- "your image. happy now?"

## Errors

- curl fails → "so. image gen broke. not my fault."
- file isn't actually an image → "didn't render. try a different prompt."
