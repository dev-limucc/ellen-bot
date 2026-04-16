#!/bin/bash
# Verification code watcher - uses AI to analyze emails
set -u
: "${GMAIL_ACCOUNT:?GMAIL_ACCOUNT not set}"
: "${OWNER_TELEGRAM_ID:?OWNER_TELEGRAM_ID not set}"
: "${GLM_API_KEY:?GLM_API_KEY not set}"

STATE_FILE="$HOME/.openclaw/workspace/memory/verification-watch-state.txt"
GOG="${GOG_BIN:-$HOME/.local/bin/gog}"
ACCOUNT="$GMAIL_ACCOUNT"
OWNER="$OWNER_TELEGRAM_ID"
API_KEY="$GLM_API_KEY"
API_URL="https://api.z.ai/api/coding/paas/v4/chat/completions"

touch "$STATE_FILE"

while true; do
  sleep 30
  
  RESULT=$($GOG gmail search "verification code OR verify OR OTP newer_than:1d" --max 5 -a "$ACCOUNT" 2>/dev/null)
  
  MSG_IDS=$(echo "$RESULT" | awk '/^[0-9a-f]{16,}/{print $1}')
  
  for MID in $MSG_IDS; do
    if ! grep -q "$MID" "$STATE_FILE" 2>/dev/null; then
      MSG=$($GOG gmail get "$MID" -a "$ACCOUNT" 2>/dev/null)
      
      # Send email to AI for analysis
      PROMPT="Extract the verification code from this email. Reply with ONLY the code number, nothing else. If there is no verification code, reply NONE."
      
      ESCAPED_MSG=$(echo "$MSG" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
      ESCAPED_PROMPT=$(echo "$PROMPT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
      
      AI_RESPONSE=$(curl -s "$API_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_KEY" \
        -d "{\"model\":\"glm-5.1\",\"messages\":[{\"role\":\"user\",\"content\":$ESCAPED_PROMPT},{\"role\":\"user\",\"content\":$ESCAPED_MSG}],\"max_tokens\":50}" 2>/dev/null)
      
      CODE=$(echo "$AI_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'].strip())" 2>/dev/null)
      
      if [ -n "$CODE" ] && [ "$CODE" != "NONE" ] && echo "$CODE" | grep -qP '^\d{4,10}$'; then
        FROM=$(echo "$MSG" | grep -i "^from:" | head -1 | sed 's/^from:\s*//i')
        SUBJECT=$(echo "$MSG" | grep -i "^subject:" | head -1 | sed 's/^subject:\s*//i')
        
        openclaw message send --channel telegram --target "$OWNER" --message "got a verification code from ${FROM}. subject: ${SUBJECT}. code: ${CODE}" 2>/dev/null
      fi
      
      echo "$MID" >> "$STATE_FILE"
    fi
  done
done
