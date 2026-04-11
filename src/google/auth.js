const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '..', '..', '.google-token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
];

class GoogleAuth {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = 'urn:ietf:wg:oauth:2.0:oob';
    this.oauth2Client = null;
    this._authenticated = false;

    if (this.clientId && this.clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );

      // Try loading saved token
      this._loadSavedToken();
    }
  }

  _loadSavedToken() {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
        this.oauth2Client.setCredentials(token);
        this._authenticated = true;
        console.log('  Google auth loaded from saved token');
      }
    } catch (err) {
      console.warn('  Could not load saved Google token:', err.message);
    }
  }

  _saveToken(token) {
    try {
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
    } catch (err) {
      console.warn('  Could not save Google token:', err.message);
    }
  }

  getAuthUrl() {
    if (!this.oauth2Client) return null;

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
  }

  async handleCode(code) {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth not configured');
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this._saveToken(tokens);
    this._authenticated = true;
    return tokens;
  }

  isAuthenticated() {
    return this._authenticated;
  }

  getClient() {
    return this.oauth2Client;
  }
}

module.exports = { GoogleAuth };
