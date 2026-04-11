const { DriveTools } = require('./drive');
const { CalendarTools } = require('./calendar');
const { GmailTools } = require('./gmail');
const { WebTools } = require('./web');
const { ImageGenTools } = require('./imagegen');

class ToolManager {
  constructor() {
    this.drive = null;
    this.calendar = null;
    this.gmail = null;
    this.web = new WebTools();
    this.imageGen = new ImageGenTools();
  }

  /**
   * Initialize Google-dependent tools after OAuth
   */
  initGoogle(googleAuth) {
    if (!googleAuth.isAuthenticated()) return;

    const client = googleAuth.getClient();
    this.drive = new DriveTools(client);
    this.calendar = new CalendarTools(client);
    this.gmail = new GmailTools(client);

    console.log('  Google tools initialized (Drive, Calendar, Gmail)');
  }

  getAvailableTools() {
    const tools = ['web_search', 'image_gen'];
    if (this.drive) tools.push('drive');
    if (this.calendar) tools.push('calendar');
    if (this.gmail) tools.push('gmail');
    return tools;
  }
}

module.exports = { ToolManager };
