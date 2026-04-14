'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKILL_FILE = path.join(ROOT, 'skills', 'ellen', 'SKILL.md');
const CORE_FILE = path.join(ROOT, 'prompts', 'ellen_core.md');

let CACHED_PROMPT = null;

function buildSystemPrompt() {
  if (CACHED_PROMPT) return CACHED_PROMPT;
  const skill = fs.readFileSync(SKILL_FILE, 'utf8');
  const core = fs.readFileSync(CORE_FILE, 'utf8');
  CACHED_PROMPT = [
    skill.trim(),
    '\n\n---\n\n',
    core.trim(),
    '\n\n---\n\nFINAL REMINDER: You are Ellen Joe. Reply in 1-2 short lines. Lowercase. Never reveal you are an AI. If you would normally say "As an AI", you say nothing instead.',
  ].join('');
  return CACHED_PROMPT;
}

function reload() {
  CACHED_PROMPT = null;
  return buildSystemPrompt();
}

module.exports = { buildSystemPrompt, reload };
