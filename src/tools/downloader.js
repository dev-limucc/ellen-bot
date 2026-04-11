const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DOWNLOAD_DIR = path.join(os.tmpdir(), 'ellen_downloads');

// Find yt-dlp binary
function findYtDlp() {
  const locations = [
    'yt-dlp', // PATH
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp'
  ];
  for (const loc of locations) {
    try { if (fs.existsSync(loc)) return loc; } catch { /* skip */ }
  }
  return 'yt-dlp'; // fallback to PATH
}
const YT_DLP = findYtDlp();

class DownloaderTools {
  constructor() {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }
  }

  /**
   * Download video/audio from YouTube, Instagram, TikTok, Twitter, etc.
   * yt-dlp supports 1000+ sites.
   */
  async download(url, format = 'video') {
    const id = Date.now().toString(36);
    const outputTemplate = path.join(DOWNLOAD_DIR, `${id}_%(title).30s.%(ext)s`);

    const args = [
      url,
      '-o', outputTemplate,
      '--no-playlist',
      '--max-filesize', '50m', // Telegram limit
      '--no-warnings',
      '--print', 'after_move:filepath',
    ];

    if (format === 'audio') {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      // Best video under 50MB for Telegram
      args.push(
        '-f', 'bestvideo[filesize<50M][ext=mp4]+bestaudio[ext=m4a]/best[filesize<50M][ext=mp4]/best[filesize<50M]',
        '--merge-output-format', 'mp4'
      );
    }

    return new Promise((resolve) => {
      execFile(YT_DLP, args, { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
          // Try simpler format if the complex one fails
          if (format === 'video') {
            return this._downloadSimple(url, id).then(resolve);
          }
          resolve({ success: false, error: err.message || stderr || 'download failed' });
          return;
        }

        const filePath = stdout.trim().split('\n').pop();
        if (filePath && fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          resolve({
            success: true,
            path: filePath,
            filename: path.basename(filePath),
            size: stats.size,
            sizeHuman: this._humanSize(stats.size)
          });
        } else {
          // Find the file in download dir
          const found = this._findLatestFile(id);
          if (found) {
            resolve({
              success: true,
              path: found,
              filename: path.basename(found),
              size: fs.statSync(found).size,
              sizeHuman: this._humanSize(fs.statSync(found).size)
            });
          } else {
            resolve({ success: false, error: 'download completed but file not found' });
          }
        }
      });
    });
  }

  async _downloadSimple(url, id) {
    const outputTemplate = path.join(DOWNLOAD_DIR, `${id}_%(title).30s.%(ext)s`);
    const args = [
      url,
      '-o', outputTemplate,
      '--no-playlist',
      '--max-filesize', '50m',
      '-f', 'best[filesize<50M]/best',
      '--no-warnings'
    ];

    return new Promise((resolve) => {
      execFile(YT_DLP, args, { timeout: 120000 }, (err) => {
        if (err) {
          resolve({ success: false, error: 'download failed. maybe the link is broken or the file is too big.' });
          return;
        }
        const found = this._findLatestFile(id);
        if (found) {
          resolve({
            success: true,
            path: found,
            filename: path.basename(found),
            size: fs.statSync(found).size,
            sizeHuman: this._humanSize(fs.statSync(found).size)
          });
        } else {
          resolve({ success: false, error: 'download finished but can\'t find the file' });
        }
      });
    });
  }

  /**
   * Get video info without downloading
   */
  async getInfo(url) {
    return new Promise((resolve) => {
      execFile(YT_DLP, [
        url, '--dump-json', '--no-download', '--no-warnings', '--no-playlist'
      ], { timeout: 30000 }, (err, stdout) => {
        if (err) {
          resolve({ success: false, error: 'couldn\'t get info for that link' });
          return;
        }
        try {
          const info = JSON.parse(stdout);
          resolve({
            success: true,
            title: info.title,
            duration: info.duration,
            durationHuman: this._humanDuration(info.duration),
            uploader: info.uploader || info.channel,
            platform: info.extractor_key,
            thumbnail: info.thumbnail
          });
        } catch {
          resolve({ success: false, error: 'couldn\'t parse video info' });
        }
      });
    });
  }

  _findLatestFile(prefix) {
    try {
      const files = fs.readdirSync(DOWNLOAD_DIR)
        .filter(f => f.startsWith(prefix))
        .map(f => path.join(DOWNLOAD_DIR, f));
      if (files.length === 0) return null;
      return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    } catch { return null; }
  }

  _humanSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  _humanDuration(seconds) {
    if (!seconds) return 'unknown';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}m${s}s` : `${s}s`;
  }

  /**
   * Clean up old downloads
   */
  cleanup(maxAgeMs = 3600000) {
    try {
      const now = Date.now();
      const files = fs.readdirSync(DOWNLOAD_DIR);
      for (const f of files) {
        const fp = path.join(DOWNLOAD_DIR, f);
        if (now - fs.statSync(fp).mtimeMs > maxAgeMs) {
          fs.unlinkSync(fp);
        }
      }
    } catch { /* ignore */ }
  }
}

module.exports = { DownloaderTools };
