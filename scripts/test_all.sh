#!/bin/bash
# ═══════════════════════════════════════
# Ellen Bot — Run All Tests
# ═══════════════════════════════════════

set -e

echo "🦈 Running Ellen's test suite..."
echo ""

echo "── Personality Tests ──"
node --test tests/test_personality.js
echo ""

echo "── Task Queue Tests ──"
node --test tests/test_task_queue.js
echo ""

echo "── Deflection Tests ──"
node --test tests/test_deflections.js
echo ""

echo "── Tool Tests ──"
node --test tests/test_tools.js
echo ""

echo "── Proactive Message Tests ──"
node --test tests/test_proactive.js
echo ""

echo "🦈 ...all done. whatever."
