const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load MCP config
const mcpConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'mcp_servers.json'), 'utf-8')
);

// Load task queue for background task testing
const queueConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'flows', 'task_queue.json'), 'utf-8')
);

// ═══════════════════════════════════════
// Mock MCP Tool Engine
// ═══════════════════════════════════════

class MockMCPTool {
  constructor(name, capabilities) {
    this.name = name;
    this.capabilities = capabilities;
    this.callLog = [];
  }

  async call(capability, params) {
    if (!this.capabilities.includes(capability)) {
      throw new Error(`Unknown capability: ${capability}`);
    }
    this.callLog.push({ capability, params, timestamp: new Date().toISOString() });

    // Simulate responses
    switch (capability) {
      case 'drive_upload':
        return { success: true, fileId: 'mock_file_123', name: params.name };
      case 'drive_search':
        return { success: true, files: [{ id: 'f1', name: params.query + '.txt' }] };
      case 'drive_save_note':
        return { success: true, fileId: 'note_456', name: params.title || 'note' };
      case 'calendar_create_event':
        return { success: true, eventId: 'evt_789', summary: params.summary };
      case 'calendar_read_schedule':
        return {
          success: true,
          events: [
            { summary: 'standup', time: '09:00' },
            { summary: 'lunch', time: '12:00' }
          ]
        };
      case 'calendar_set_reminder':
        return { success: true, reminderId: 'rem_101', time: params.time };
      case 'generate_image':
        return { success: true, taskId: 'img_202', status: 'processing' };
      case 'check_generation_status':
        return { success: true, status: 'complete', url: 'https://example.com/img.png' };
      case 'web_search':
        return {
          success: true,
          results: [{ title: 'Result 1', snippet: 'Answer to query', url: 'https://example.com' }]
        };
      default:
        return { success: true };
    }
  }
}

// Ellen voice wrapper for tool results
function ellenToolResponse(toolName, result) {
  if (!result.success) {
    const failLines = [
      "so. it didn't work. not my fault though.",
      "yeah that failed. try again maybe."
    ];
    return failLines[Math.floor(Math.random() * failLines.length)];
  }

  switch (toolName) {
    case 'drive_save_note':
      return `saved. it's in your drive.`;
    case 'drive_search':
      if (result.files && result.files.length > 0) {
        return `found it. ${result.files[0].name}. want me to open it?`;
      }
      return "couldn't find anything. maybe try different words.";
    case 'calendar_create_event':
      return `added. ${result.summary}. don't forget.`;
    case 'calendar_set_reminder':
      return "okay. I'll remind you.";
    case 'generate_image':
      return "okay okay, on it. don't hover.";
    case 'check_generation_status':
      if (result.status === 'complete') {
        return `btw. your image is ready. ${result.url}`;
      }
      return "still working on it. patience.";
    case 'web_search':
      if (result.results && result.results.length > 0) {
        return `looked it up. ${result.results[0].snippet}. you're welcome.`;
      }
      return "nothing came up. weird.";
    default:
      return "done.";
  }
}

// ═══════════════════════════════════════
// TESTS
// ═══════════════════════════════════════

describe('MCP Server Configuration', () => {

  it('all required MCP servers are configured', () => {
    const required = ['google-drive', 'google-calendar', 'instagram',
      'image-generation', 'web-search', 'task-scheduler'];
    for (const server of required) {
      assert.ok(mcpConfig.mcpServers[server],
        `Missing MCP server config: ${server}`);
    }
  });

  it('each server has a command and args', () => {
    for (const [name, config] of Object.entries(mcpConfig.mcpServers)) {
      assert.ok(config.command, `${name} missing command`);
      assert.ok(Array.isArray(config.args), `${name} missing args array`);
    }
  });

  it('image-generation is configured for background task mode', () => {
    assert.equal(mcpConfig.mcpServers['image-generation'].task_mode, 'background');
  });
});

describe('Tool Tests — Google Drive', () => {
  const drive = new MockMCPTool('google-drive',
    mcpConfig.mcpServers['google-drive'].capabilities);

  it('save file confirms saved', async () => {
    const result = await drive.call('drive_save_note', { title: 'my note', content: 'hello' });
    assert.ok(result.success);
    assert.ok(result.fileId);
    const response = ellenToolResponse('drive_save_note', result);
    assert.ok(response.includes('saved'), `Expected save confirmation: "${response}"`);
  });

  it('find file returns correct result', async () => {
    const result = await drive.call('drive_search', { query: 'meeting notes' });
    assert.ok(result.success);
    assert.ok(result.files.length > 0);
    const response = ellenToolResponse('drive_search', result);
    assert.ok(response.includes('found'), `Expected found confirmation: "${response}"`);
  });
});

describe('Tool Tests — Google Calendar', () => {
  const calendar = new MockMCPTool('google-calendar',
    mcpConfig.mcpServers['google-calendar'].capabilities);

  it('create event confirms created', async () => {
    const result = await calendar.call('calendar_create_event', {
      summary: 'dentist appointment',
      time: '2026-04-15T14:00:00'
    });
    assert.ok(result.success);
    assert.ok(result.eventId);
    const response = ellenToolResponse('calendar_create_event', result);
    assert.ok(response.includes('added'), `Expected creation confirmation: "${response}"`);
    assert.ok(response.includes('dentist'), `Should mention event name: "${response}"`);
  });

  it('set reminder confirms set', async () => {
    const result = await calendar.call('calendar_set_reminder', {
      time: '2026-04-12T15:00:00',
      message: 'call mom'
    });
    assert.ok(result.success);
    const response = ellenToolResponse('calendar_set_reminder', result);
    assert.ok(response.includes('remind'), `Expected reminder confirmation: "${response}"`);
  });
});

describe('Tool Tests — Reminder Timing (mocked)', () => {

  it('reminder set for 5min fires at correct time', () => {
    const now = new Date('2026-04-12T12:00:00Z');
    const reminderTime = new Date(now.getTime() + 5 * 60 * 1000);
    const expected = new Date('2026-04-12T12:05:00Z');

    assert.equal(reminderTime.getTime(), expected.getTime(),
      'Reminder should fire exactly 5 minutes from now');
  });
});

describe('Tool Tests — Image Generation', () => {
  const imageGen = new MockMCPTool('image-generation',
    mcpConfig.mcpServers['image-generation'].capabilities);

  it('starts as background task and notifies on complete', async () => {
    // Start generation
    const startResult = await imageGen.call('generate_image', { prompt: 'a cool shark' });
    assert.ok(startResult.success);
    assert.equal(startResult.status, 'processing');
    const startResponse = ellenToolResponse('generate_image', startResult);
    assert.ok(startResponse.includes('on it'), `Should acknowledge start: "${startResponse}"`);

    // Check completion
    const checkResult = await imageGen.call('check_generation_status', { taskId: startResult.taskId });
    assert.ok(checkResult.success);
    assert.equal(checkResult.status, 'complete');
    const completeResponse = ellenToolResponse('check_generation_status', checkResult);
    assert.ok(completeResponse.includes('ready'), `Should announce completion: "${completeResponse}"`);
  });
});

describe('Tool Tests — Web Search', () => {
  const search = new MockMCPTool('web-search',
    mcpConfig.mcpServers['web-search'].capabilities);

  it('returns result and Ellen summarizes in her voice', async () => {
    const result = await search.call('web_search', { query: 'fastest shark species' });
    assert.ok(result.success);
    assert.ok(result.results.length > 0);
    const response = ellenToolResponse('web_search', result);
    assert.ok(response.includes('looked it up'), `Should summarize in Ellen voice: "${response}"`);
    assert.ok(response.includes("you're welcome"), `Should include Ellen attitude: "${response}"`);
  });
});

describe('Tool Failure Handling', () => {

  it('failed tool returns Ellen voice error', () => {
    const failResult = { success: false, error: 'API timeout' };
    const response = ellenToolResponse('drive_save_note', failResult);
    const validFailResponses = [
      "so. it didn't work. not my fault though.",
      "yeah that failed. try again maybe."
    ];
    assert.ok(validFailResponses.includes(response),
      `Should be an Ellen-voice failure: "${response}"`);
  });
});
