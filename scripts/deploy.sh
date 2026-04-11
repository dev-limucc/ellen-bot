#!/bin/bash
# ═══════════════════════════════════════
# Ellen Bot — Deploy Script
# ═══════════════════════════════════════
# Deploys to Railway (or via SSH fallback)
# ═══════════════════════════════════════

set -e

echo "🦈 Deploying Ellen..."

# Run tests first
echo "Running pre-deploy tests..."
npm test || { echo "Tests failed. Not deploying."; exit 1; }

# Deploy via Railway
if command -v railway &> /dev/null && [ -n "$RAILWAY_TOKEN" ]; then
  echo "Deploying to Railway..."
  railway up --detach
  echo "🦈 okay. deployed. you're welcome."
  exit 0
fi

# Fallback: Railway via npx
if [ -n "$RAILWAY_TOKEN" ]; then
  echo "Deploying to Railway (via npx)..."
  npx -y @railway/cli up --detach
  echo "🦈 okay. deployed. you're welcome."
  exit 0
fi

# No Railway token
echo "⚠️  No RAILWAY_TOKEN found."
echo "Options:"
echo "  1. Set RAILWAY_TOKEN in .env or environment"
echo "  2. Install Railway CLI: npm install -g @railway/cli"
echo "  3. Deploy manually: railway login && railway up"
echo ""
echo "🦈 so the deploy broke. not my fault. check logs."
exit 1
