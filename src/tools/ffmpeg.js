'use strict';

const { spawn } = require('child_process');
const path = require('path');

function checkAvailable() {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-version']);
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('error', () => resolve({ ok: false, version: null }));
    p.on('close', (code) => resolve({ ok: code === 0, version: out.split('\n')[0] || null }));
  });
}

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', (e) => reject(e));
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffmpeg exit ' + code + ': ' + stderr.slice(0, 300)));
      resolve(true);
    });
  });
}

async function compress(input, output, crf = 28) {
  await run(['-i', input, '-vcodec', 'libx264', '-crf', String(crf), '-preset', 'fast', output]);
  return output;
}

async function extractAudio(input, output) {
  await run(['-i', input, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', output]);
  return output;
}

async function convert(input, output) {
  await run(['-i', input, output]);
  return output;
}

module.exports = { checkAvailable, compress, extractAudio, convert, run };
