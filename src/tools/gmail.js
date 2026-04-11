const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const os = require('os');

class GmailTools {
  constructor(authClient) {
    this.gmail = google.gmail({ version: 'v1', auth: authClient });
    this.lastReadMessages = []; // Track last fetched messages for "delete first one" etc.
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

      this.lastReadMessages = detailed;
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

      // Get attachments info
      const attachments = this._getAttachmentInfo(res.data.payload);

      return {
        success: true,
        id: messageId,
        from: headers.find(h => h.name === 'From')?.value,
        subject: headers.find(h => h.name === 'Subject')?.value,
        date: headers.find(h => h.name === 'Date')?.value,
        body: body.slice(0, 2000),
        attachments
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

  async trashMessage(messageId) {
    try {
      await this.gmail.users.messages.trash({ userId: 'me', id: messageId });
      return { success: true, action: 'trashed' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async deleteMessage(messageId) {
    try {
      await this.gmail.users.messages.delete({ userId: 'me', id: messageId });
      return { success: true, action: 'deleted permanently' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async markAsRead(messageId) {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { removeLabelIds: ['UNREAD'] }
      });
      return { success: true, action: 'marked as read' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async markAsUnread(messageId) {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { addLabelIds: ['UNREAD'] }
      });
      return { success: true, action: 'marked as unread' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async starMessage(messageId) {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { addLabelIds: ['STARRED'] }
      });
      return { success: true, action: 'starred' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async replyToMessage(messageId, replyBody) {
    try {
      // Get original message for threading
      const original = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Message-ID', 'References', 'In-Reply-To']
      });

      const headers = original.data.payload.headers;
      const from = headers.find(h => h.name === 'From')?.value || '';
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const messageIdHeader = headers.find(h => h.name === 'Message-ID')?.value || '';
      const references = headers.find(h => h.name === 'References')?.value || '';
      const threadId = original.data.threadId;

      // Extract email address from "Name <email>" format
      const toMatch = from.match(/<(.+)>/) || [null, from];
      const to = toMatch[1];

      const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
      const refHeader = references ? `${references} ${messageIdHeader}` : messageIdHeader;

      const raw = Buffer.from(
        `To: ${to}\r\nSubject: ${replySubject}\r\nIn-Reply-To: ${messageIdHeader}\r\nReferences: ${refHeader}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${replyBody}`
      ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const res = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, threadId }
      });

      return { success: true, messageId: res.data.id, to, subject: replySubject };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getAttachment(messageId, attachmentId, filename) {
    try {
      const res = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId
      });

      // Decode base64 data
      const data = Buffer.from(res.data.data, 'base64url');
      const tmpPath = path.join(os.tmpdir(), `ellen_${Date.now()}_${filename}`);
      fs.writeFileSync(tmpPath, data);

      return { success: true, path: tmpPath, filename, size: data.length };
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

      this.lastReadMessages = detailed;
      return { success: true, total: messages.length, messages: detailed };
    } catch (err) {
      return { success: false, error: err.message, messages: [] };
    }
  }

  /**
   * Get the Nth message from the last read list (1-indexed)
   */
  getLastMessageByIndex(n) {
    if (n < 1 || n > this.lastReadMessages.length) return null;
    return this.lastReadMessages[n - 1];
  }

  /**
   * Extract attachment info from message payload
   */
  _getAttachmentInfo(payload) {
    const attachments = [];

    const extractParts = (parts) => {
      if (!parts) return;
      for (const part of parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            id: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size || 0
          });
        }
        if (part.parts) extractParts(part.parts);
      }
    };

    extractParts(payload.parts);
    return attachments;
  }
}

module.exports = { GmailTools };
