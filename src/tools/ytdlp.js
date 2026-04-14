'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SUPPORTED_RE = /^https?:\/\/(?:[\w-]+\.)+\w+/i;

function isUrl(text) { return SUPPORTED_RE.test((text || '').trim()); }

function extractFirstUrl(text) {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function checkAvailable() {
  return new Promise((resolve) => {
    const p = spawn('yt-dlp', ['--version']);
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('error', () => resolve({ ok: false, version: null }));
    p.on('close', (code) => resolve({ ok: code === 0, version: out.trim() || null }));
  });
}

function download({ url, mode = 'best', outDir, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const dir = outDir || process.env.ELLEN_DOWNLOADS_DIR || path.join(__dirname, '..', '..', 'downloads');
    ensureDir(dir);

    const args = [
      url,
      '-o', path.join(dir, '%(title).80s-%(id)s.%(ext)s'),
      '--no-playlist',
      '--no-warnings',
      '--newline',
    ];
    if (mode === 'audio') {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
    }

    const p = spawn('yt-dlp', args);
    let lastFile = null;
    let stderr = '';
    p.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      const lines = s.split('\n');
      for (const line of lines) {
        const dest = line.match(/\[(?:download|Merger|ExtractAudio)\]\s+(?:Destination:|Merging formats into)\s+"?(.+?\.\w+)"?\s*$/);
        if (dest) lastFile = dest[1];
        const pct = line.match(/(\d+(?:\.\d+)?)%/);
        if (pct && onProgress) onProgress(parseFloat(pct[1]));
      }
    });
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', (e) => reject(e));
    p.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp exit ${code}: ${stderr.slice(0, 300)}`));
      }
      resolve({ file: lastFile, dir, code });
    });
  });
}

module.exports = { isUrl, extractFirstUrl, download, checkAvailable };
