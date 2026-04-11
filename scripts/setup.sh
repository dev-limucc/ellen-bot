#!/bin/bash
# ═══════════════════════════════════════
# Ellen Bot — Full Setup Script
# ═══════════════════════════════════════
# Usage: bash scripts/setup.sh
# ═══════════════════════════════════════

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

pass() { echo -e "  ${GREEN}✅ $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
header() { echo -e "\n${BOLD}$1${NC}"; }

echo ""
echo "🦈 Ellen Bot Setup"
echo "═══════════════════════════════════════"

# ─── Step 1: Check Node.js ───
header "Checking prerequisites..."

if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    pass "Node.js $NODE_VERSION"
  else
    fail "Node.js $NODE_VERSION (need v20+)"
    echo "    Install: https://nodejs.org/"
    exit 1
  fi
else
  fail "Node.js not found"
  echo "    Install: https://nodejs.org/"
  exit 1
fi

if command -v npm &> /dev/null; then
  pass "npm $(npm -v)"
else
  fail "npm not found"
  exit 1
fi

# ─── Step 2: Install OpenClaw ───
header "Installing OpenClaw..."

if command -v openclaw &> /dev/null; then
  pass "OpenClaw already installed ($(openclaw --version 2>/dev/null || echo 'unknown version'))"
else
  echo "  Installing openclaw globally..."
  npm install -g openclaw 2>/dev/null && pass "OpenClaw installed" || warn "OpenClaw not available in npm yet — skipping global install"
fi

# ─── Step 3: Install project dependencies ───
header "Installing project dependencies..."

npm install 2>/dev/null && pass "Dependencies installed" || fail "npm install failed"

# ─── Step 4: Install MCP servers ───
header "Installing MCP servers..."

MCP_SERVERS=(
  "@anthropic/mcp-server-google-drive"
  "@anthropic/mcp-server-google-calendar"
  "@composio/mcp-server-instagram"
  "@anthropic/mcp-server-image-gen"
  "@anthropic/mcp-server-web-search"
  "@anthropic/mcp-server-scheduler"
)

for server in "${MCP_SERVERS[@]}"; do
  npx -y "$server" --version &>/dev/null 2>&1 && pass "$server" || warn "$server (will install on first use via npx)"
done

# ─── Step 5: Setup .env ───
header "Setting up environment..."

if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env created from .env.example — fill in your API keys!"
else
  pass ".env already exists"
fi

# Check critical env vars
check_env() {
  if [ -f .env ]; then
    value=$(grep "^$1=" .env | cut -d= -f2-)
    if [ -n "$value" ] && [ "$value" != "" ]; then
      pass "$2"
      return 0
    fi
  fi
  fail "$2 (missing — edit .env)"
  return 1
}

header "Checking environment variables..."
check_env "TELEGRAM_BOT_TOKEN" "Telegram bot token" || true
check_env "OWNER_TELEGRAM_ID" "Owner Telegram ID" || true
check_env "GLM_API_KEY" "GLM API key" || true
check_env "ANTHROPIC_API_KEY" "Anthropic API key" || true
check_env "GOOGLE_CLIENT_ID" "Google Client ID" || true
check_env "GOOGLE_CLIENT_SECRET" "Google Client Secret" || true

# ─── Step 6: Verify Ellen config ───
header "Verifying Ellen configuration..."

if [ -f "skills/ellen/SKILL.md" ]; then
  pass "Ellen personality loaded"
else
  fail "SKILL.md missing"
fi

if [ -f "config/openclaw.json" ]; then
  pass "OpenClaw config present"
else
  fail "openclaw.json missing"
fi

if [ -f "config/mcp_servers.json" ]; then
  pass "MCP servers configured"
else
  fail "mcp_servers.json missing"
fi

# ─── Step 7: Run tests ───
header "Running test suite..."

TEST_RESULT=0
npm test 2>&1 && pass "All tests passing" || { fail "Some tests failing"; TEST_RESULT=1; }

# ─── Summary ───
echo ""
echo "═══════════════════════════════════════"
echo "🦈 Setup Summary"
echo "═══════════════════════════════════════"
echo ""

[ -f "skills/ellen/SKILL.md" ] && pass "Ellen personality loaded" || fail "Ellen personality missing"
[ -f "config/openclaw.json" ] && pass "OpenClaw configured" || fail "OpenClaw config missing"
[ -f "config/mcp_servers.json" ] && pass "MCP servers configured" || fail "MCP servers missing"
check_env "TELEGRAM_BOT_TOKEN" "Telegram connected" || true
check_env "GOOGLE_CLIENT_ID" "Google Drive MCP" || true
check_env "GOOGLE_CLIENT_SECRET" "Google Calendar MCP" || true
check_env "INSTAGRAM_ACCESS_TOKEN" "Instagram MCP" || true

if [ "$TEST_RESULT" -eq 0 ]; then
  pass "All tests passing"
else
  fail "Some tests failing — run: npm test"
fi

echo ""
echo "🦈 Ellen says: \"...setup done. you're welcome.\""
echo ""
