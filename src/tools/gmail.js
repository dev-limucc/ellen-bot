const { google } = require('googleapis');

class GmailTools {
  constructor(authClient) {
    this.gmail = google.gmail({ version: 'v1', auth: authClient });
  }

  async getUnread(maxResults = 10) {
    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults
      });

      const messages = res.data.messages || [];
      const detailed = [];

      for (const msg of messages.slice(0, 5)) {
        const detail = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date']
        });

        const headers = detail.data.payload.headers;
        detailed.push({
          id: msg.id,
          from: headers.find(h => h.name === 'From')?.value || 'unknown',
          subject: headers.find(h => h.name === 'Subject')?.value || '(no subject)',
          date: headers.find(h => h.name === 'Date')?.value || '',
          snippet: detail.data.snippet
        });
      }

      return {
        success: true,
        total: messages.length,
        messages: detailed
      };
    } catch (err) {
      return { success: false, error: err.message, messages: [] };
    }
  }

  async readMessage(messageId) {
    try {
      const res = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const headers = res.data.payload.headers;
      let body = '';

      // Extract text body
      if (res.data.payload.body?.data) {
        body = Buffer.from(res.data.payload.body.data, 'base64').toString('utf-8');
      } else if (res.data.payload.parts) {
        const textPart = res.data.payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        }
      }

      return {
        success: true,
        from: headers.find(h => h.name === 'From')?.value,
        subject: headers.find(h => h.name === 'Subject')?.value,
        date: headers.find(h => h.name === 'Date')?.value,
        body: body.slice(0, 2000) // Limit length
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async sendEmail(to, subject, body) {
    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    try {
      const res = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw }
      });
      return { success: true, messageId: res.data.id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async search(query, maxResults = 10) {
    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults
      });

      const messages = res.data.messages || [];
      const detailed = [];

      for (const msg of messages.slice(0, 5)) {
        const detail = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date']
        });

        const headers = detail.data.payload.headers;
        detailed.push({
          id: msg.id,
          from: headers.find(h => h.name === 'From')?.value || 'unknown',
          subject: headers.find(h => h.name === 'Subject')?.value || '(no subject)',
          snippet: detail.data.snippet
        });
      }

      return { success: true, total: messages.length, messages: detailed };
    } catch (err) {
      return { success: false, error: err.message, messages: [] };
    }
  }
}

module.exports = { GmailTools };
