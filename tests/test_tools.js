'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ytdlp = require('../src/tools/ytdlp');
const ffmpeg = require('../src/tools/ffmpeg');

test('tools — yt-dlp binary available', async () => {
  const r = await ytdlp.checkAvailable();
  assert.equal(r.ok, true, 'yt-dlp not available');
  assert.match(r.version || '', /\d/);
});

test('tools — ffmpeg binary available', async () => {
  const r = await ffmpeg.checkAvailable();
  assert.equal(r.ok, true, 'ffmpeg not available');
  assert.match(r.version || '', /ffmpeg/i);
});

test('tools — yt-dlp URL detection', () => {
  assert.equal(ytdlp.isUrl('https://youtube.com/watch?v=abc'), true);
  assert.equal(ytdlp.isUrl('hi how are you'), false);
  assert.equal(ytdlp.extractFirstUrl('check this out: https://x.com/a/b cool'), 'https://x.com/a/b');
  assert.equal(ytdlp.extractFirstUrl('no url here'), null);
});

test('tools — pending MCP servers are flagged disabled', () => {
  const cfg = require('../config/mcp_servers.json');
  assert.equal(cfg.servers.google_drive.enabled, false);
  assert.equal(cfg.servers.gmail.enabled, false);
  assert.equal(cfg.servers.yt_dlp.enabled, true);
  assert.equal(cfg.servers.ffmpeg.enabled, true);
});
