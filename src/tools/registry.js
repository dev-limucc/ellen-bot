/**
 * Tool Registry — describes all available tools for LLM function calling.
 * Ellen's LLM sees these descriptions and decides when to call them.
 * To add a new tool: just add an entry here. No regex needed.
 */

const TOOLS = [
  // ═══ Gmail ═══
  {
    name: 'gmail_get_unread',
    description: 'Check unread emails in the user\'s Gmail inbox. Use when user asks to check mail, email, inbox, or unread messages.',
    parameters: {
      type: 'object',
      properties: {
        max_results: { type: 'number', description: 'Max emails to fetch (default 5)' }
      }
    },
    execute: async (tools, params) => tools.gmail.getUnread(params.max_results || 5)
  },
  {
    name: 'gmail_read_message',
    description: 'Open and read a specific email by its position number (1 = most recent). Use when user says "open the 2nd email" or "read that email".',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'number', description: 'Email position from last check (1-based). Default 1 for most recent.' }
      },
      required: ['position']
    },
    execute: async (tools, params) => {
      const msg = tools.gmail.getLastMessageByIndex(params.position || 1);
      if (!msg) return { success: false, error: 'no email at that position. check mail first.' };
      return tools.gmail.readMessage(msg.id);
    }
  },
  {
    name: 'gmail_send',
    description: 'Send an email to someone. Use when user asks to email, message, or write to an email address.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text' }
      },
      required: ['to', 'body']
    },
    execute: async (tools, params) => tools.gmail.sendEmail(params.to, params.subject || 'Message from Ellen', params.body)
  },
  {
    name: 'gmail_reply',
    description: 'Reply to an email by its position number. Use when user says "reply to that email" or "respond to the 2nd email".',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'number', description: 'Email position from last check (1-based)' },
        body: { type: 'string', description: 'Reply message text' }
      },
      required: ['position', 'body']
    },
    execute: async (tools, params) => {
      const msg = tools.gmail.getLastMessageByIndex(params.position || 1);
      if (!msg) return { success: false, error: 'no email at that position. check mail first.' };
      return tools.gmail.replyToMessage(msg.id, params.body);
    }
  },
  {
    name: 'gmail_trash',
    description: 'Delete/trash an email by its position number. Use when user says "delete that email" or "trash the 3rd email".',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'number', description: 'Email position from last check (1-based)' }
      },
      required: ['position']
    },
    execute: async (tools, params) => {
      const msg = tools.gmail.getLastMessageByIndex(params.position || 1);
      if (!msg) return { success: false, error: 'no email at that position. check mail first.' };
      const result = await tools.gmail.trashMessage(msg.id);
      return { ...result, subject: msg.subject };
    }
  },
  {
    name: 'gmail_mark_read',
    description: 'Mark an email as read. Use when user says "mark as read" or "mark the 2nd email as read".',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'number', description: 'Email position from last check (1-based)' }
      },
      required: ['position']
    },
    execute: async (tools, params) => {
      const msg = tools.gmail.getLastMessageByIndex(params.position || 1);
      if (!msg) return { success: false, error: 'no email at that position. check mail first.' };
      const result = await tools.gmail.markAsRead(msg.id);
      return { ...result, subject: msg.subject };
    }
  },
  {
    name: 'gmail_star',
    description: 'Star/favorite an email. Use when user says "star that email".',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'number', description: 'Email position from last check (1-based)' }
      },
      required: ['position']
    },
    execute: async (tools, params) => {
      const msg = tools.gmail.getLastMessageByIndex(params.position || 1);
      if (!msg) return { success: false, error: 'no email at that position. check mail first.' };
      const result = await tools.gmail.starMessage(msg.id);
      return { ...result, subject: msg.subject };
    }
  },
  {
    name: 'gmail_search',
    description: 'Search emails by query. Use when user says "search my email for X" or "find emails from X".',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (supports Gmail search syntax)' }
      },
      required: ['query']
    },
    execute: async (tools, params) => tools.gmail.search(params.query)
  },

  // ═══ Google Calendar ═══
  {
    name: 'calendar_today',
    description: 'Get today\'s calendar events/schedule. Use when user asks about their schedule, meetings, plans, or what they have today.',
    parameters: { type: 'object', properties: {} },
    execute: async (tools) => tools.calendar.getToday()
  },
  {
    name: 'calendar_upcoming',
    description: 'Get upcoming events for the next N days. Use when user asks "what do I have this week" or "upcoming events".',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look ahead (default 7)' }
      }
    },
    execute: async (tools, params) => tools.calendar.getUpcoming(params.days || 7)
  },
  {
    name: 'calendar_create_event',
    description: 'Create a new calendar event. Use when user says "add to calendar", "schedule a meeting", "create an event", or "remind me on [date]".',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title/name' },
        start_time: { type: 'string', description: 'Start time in ISO 8601 format (e.g. 2026-04-15T14:00:00)' },
        end_time: { type: 'string', description: 'End time (optional, defaults to 1 hour after start)' },
        description: { type: 'string', description: 'Event description (optional)' }
      },
      required: ['summary', 'start_time']
    },
    execute: async (tools, params) => tools.calendar.createEvent(params.summary, params.start_time, params.end_time, params.description)
  },

  // ═══ Google Drive ═══
  {
    name: 'drive_save_note',
    description: 'Save text content as a file to Google Drive. Use when user says "save this", "note this down", "write this to drive", or "remember this".',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text content to save' },
        title: { type: 'string', description: 'File name/title (optional)' }
      },
      required: ['content']
    },
    execute: async (tools, params) => tools.drive.saveNote(params.content, params.title)
  },
  {
    name: 'drive_search',
    description: 'Search for files in Google Drive. Use when user says "find file", "search drive", "where is my document".',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    },
    execute: async (tools, params) => tools.drive.search(params.query)
  },
  {
    name: 'drive_list_recent',
    description: 'List recently modified files in Google Drive. Use when user asks "what files do I have" or "recent files".',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'How many files to list (default 10)' }
      }
    },
    execute: async (tools, params) => tools.drive.listRecent(params.count || 10)
  },

  // ═══ Web Search ═══
  {
    name: 'web_search',
    description: 'Search the web for information. Use when user asks a factual question you don\'t know, asks to look something up, or wants current/recent information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    },
    execute: async (tools, params) => tools.web.search(params.query)
  },

  // ═══ Image Generation ═══
  {
    name: 'generate_image',
    description: 'Generate an image from a text description. Use when user says "generate an image", "create a picture", "draw", or "make an image of".',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Image description/prompt' }
      },
      required: ['prompt']
    },
    execute: async (tools, params) => tools.imageGen.generate(params.prompt)
  }
];

/**
 * Get tool definitions formatted for LLM function calling
 */
function getToolDefinitions(availableTools) {
  return TOOLS
    .filter(t => {
      // Filter based on what tools are actually available
      if (t.name.startsWith('gmail_') && !availableTools.includes('gmail')) return false;
      if (t.name.startsWith('calendar_') && !availableTools.includes('calendar')) return false;
      if (t.name.startsWith('drive_') && !availableTools.includes('drive')) return false;
      return true;
    })
    .map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
}

/**
 * Execute a tool by name with given parameters
 */
async function executeTool(name, params, tools) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return { success: false, error: `unknown tool: ${name}` };
  try {
    return await tool.execute(tools, params);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { TOOLS, getToolDefinitions, executeTool };
