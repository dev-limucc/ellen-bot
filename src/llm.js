'use strict';

const crypto = require('crypto');

const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const GLM_MODEL = 'glm-4.5-flash';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeGlmJwt(apiKey) {
  const [id, secret] = apiKey.split('.');
  if (!id || !secret) throw new Error('GLM_API_KEY must be in id.secret format');
  const header = { alg: 'HS256', sign_type: 'SIGN' };
  const now = Date.now();
  const payload = {
    api_key: id,
    exp: now + 60 * 60 * 1000,
    timestamp: now,
  };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

async function callGlm({ system, messages, maxTokens = 512, temperature = 0.85 }) {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) throw new Error('GLM_API_KEY is not set');
  const token = makeGlmJwt(apiKey);

  const body = {
    model: GLM_MODEL,
    messages: [
      { role: 'system', content: system },
      ...messages,
    ],
    max_tokens: maxTokens,
    temperature,
    top_p: 0.9,
    thinking: { type: 'disabled' },
  };

  const res = await fetch(GLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GLM ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('GLM returned no content: ' + JSON.stringify(data).slice(0, 400));
  return content.trim();
}

async function callAnthropic({ system, messages, maxTokens = 512, temperature = 0.85 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.content?.[0]?.text;
  if (!content) throw new Error('Anthropic returned no content');
  return content.trim();
}

async function chat({ system, messages, model = 'glm-4-flash', maxTokens, temperature }) {
  if (model === 'claude-haiku-4-5' && process.env.ANTHROPIC_API_KEY) {
    return callAnthropic({ system, messages, maxTokens, temperature });
  }
  return callGlm({ system, messages, maxTokens, temperature });
}

module.exports = { chat, callGlm, callAnthropic, makeGlmJwt };
