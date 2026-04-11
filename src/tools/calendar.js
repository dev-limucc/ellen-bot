const { google } = require('googleapis');

class CalendarTools {
  constructor(authClient) {
    this.calendar = google.calendar({ version: 'v3', auth: authClient });
  }

  async createEvent(summary, startTime, endTime = null, description = '') {
    // If no end time, default to 1 hour after start
    if (!endTime) {
      const start = new Date(startTime);
      endTime = new Date(start.getTime() + 60 * 60 * 1000).toISOString();
    }

    try {
      const res = await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary,
          description,
          start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end: { dateTime: endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        }
      });

      return {
        success: true,
        eventId: res.data.id,
        summary: res.data.summary,
        start: res.data.start,
        link: res.data.htmlLink
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getToday() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    try {
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = (res.data.items || []).map(e => ({
        summary: e.summary,
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        link: e.htmlLink
      }));

      return { success: true, events, count: events.length };
    } catch (err) {
      return { success: false, error: err.message, events: [] };
    }
  }

  async getUpcoming(days = 7) {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    try {
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: future.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 20
      });

      const events = (res.data.items || []).map(e => ({
        summary: e.summary,
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date
      }));

      return { success: true, events, count: events.length };
    } catch (err) {
      return { success: false, error: err.message, events: [] };
    }
  }

  async deleteEvent(eventId) {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = { CalendarTools };
