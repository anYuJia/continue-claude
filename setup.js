#!/usr/bin/env node
/**
 * Setup script to configure Claude Code hooks
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WINDOWS = os.platform() === 'win32';
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

console.log('Setting up Claude Code hooks...\n');

// Ensure directory exists
if (!fs.existsSync(CLAUDE_DIR)) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  console.log('Created directory:', CLAUDE_DIR);
}

// Read existing settings or create new
let settings = {};
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    const content = fs.readFileSync(SETTINGS_FILE, 'utf8');
    settings = JSON.parse(content);
    console.log('Found existing settings.json');
  } catch (e) {
    console.log('Could not parse existing settings.json, creating new one');
  }
}

// Add StopFailure hook
if (!settings.hooks) {
  settings.hooks = {};
}

if (IS_WINDOWS) {
  settings.hooks.StopFailure = [
    {
      "command": "cmd /c echo event:api_error error:%ERROR_TYPE% status_code:%STATUS_CODE% >> %USERPROFILE%\\.claude\\auto-continue-signal.jsonl"
    }
  ];
  console.log('Configured Windows hook');
} else {
  settings.hooks.StopFailure = [
    {
      "command": "bash -c 'echo \"event:api_error error:$ERROR_TYPE status_code:$STATUS_CODE\" >> ~/.claude/auto-continue-signal.jsonl'"
    }
  ];
  console.log('Configured macOS/Linux hook');
}

// Write settings
fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
console.log('\n✓ Settings written to:', SETTINGS_FILE);
console.log('\nSettings content:');
console.log(JSON.stringify(settings, null, 2));

console.log('\n✓ Setup complete!');
console.log('\nNext steps:');
console.log('1. Restart Claude Code if it is running');
console.log('2. Run: node index.js');
console.log('3. When API error occurs, "继续" will be sent automatically');
