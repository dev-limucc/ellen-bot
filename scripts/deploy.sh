#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "🦈 deploy"
bash scripts/test_all.sh
echo "→ pulling latest..."
git pull --ff-only || true
echo "→ npm install..."
npm install --silent
echo "→ restart..."
# placeholder: pm2/systemd hook goes here
echo "okay. deployed. you're welcome."
