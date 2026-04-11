const { google } = require('googleapis');

class DriveTools {
  constructor(authClient) {
    this.drive = google.drive({ version: 'v3', auth: authClient });
  }

  async saveNote(content, title = null) {
    const name = title || `Ellen Note — ${new Date().toISOString().slice(0, 10)}`;

    try {
      const res = await this.drive.files.create({
        requestBody: {
          name: `${name}.txt`,
          mimeType: 'text/plain'
        },
        media: {
          mimeType: 'text/plain',
          body: content
        },
        fields: 'id, name, webViewLink'
      });

      return {
        success: true,
        fileId: res.data.id,
        name: res.data.name,
        link: res.data.webViewLink
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async search(query) {
    try {
      const res = await this.drive.files.list({
        q: `fullText contains '${query.replace(/'/g, "\\'")}'`,
        fields: 'files(id, name, mimeType, webViewLink, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 10
      });

      return {
        success: true,
        files: res.data.files || [],
        count: (res.data.files || []).length
      };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  }

  async upload(filePath, name) {
    const fs = require('fs');
    try {
      const res = await this.drive.files.create({
        requestBody: { name },
        media: {
          body: fs.createReadStream(filePath)
        },
        fields: 'id, name, webViewLink'
      });

      return {
        success: true,
        fileId: res.data.id,
        name: res.data.name,
        link: res.data.webViewLink
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async download(fileId) {
    try {
      const res = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' }
      );
      return { success: true, content: res.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async listRecent(count = 10) {
    try {
      const res = await this.drive.files.list({
        orderBy: 'modifiedTime desc',
        pageSize: count,
        fields: 'files(id, name, mimeType, modifiedTime, webViewLink)'
      });
      return { success: true, files: res.data.files || [] };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  }
}

module.exports = { DriveTools };
