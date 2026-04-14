#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "🦈 Ellen test suite"
echo "==="

echo "→ unit tests"
node --test tests/test_*.js

echo
echo "→ telegram self-test"
node scripts/test_telegram.js

echo
echo "🦈 all green"
