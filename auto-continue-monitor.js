#!/usr/bin/env node
/**
 * auto-continue-monitor.js v2.0
 *
 * Smart monitor for Claude Code API errors with:
 * - Wait for retries to finish before sending continue
 * - Whitelist support for errors to skip
 * - Transcript file monitoring for idle state detection
 *
 * Usage:
 *   node auto-continue-monitor.js [options]
 *
 * Options:
 *   --message, -m       Continue message (default: "继续")
 *   --cooldown, -c      Cooldown in seconds (default: 15)
 *   --max-retries       Max retries per error type (default: 5)
 *   --wait-after-error  Seconds to wait after error (default: 5)
 *   --whitelist, -w     Comma-separated error types to skip
 *   --verbose, -v       Enable verbose logging
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse arguments
const args = process.argv.slice(2);
const config = {
  message: '继续',
  cooldown: 15,
  maxRetries: 5,
  waitAfterError: 10, // Increased default to 10 seconds
  whitelist: ['authentication_failed', 'invalid_request'],
  verbose: false,
  terminal: 'auto', // 'auto', 'Terminal', 'iTerm', 'Warp'
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '-m':
    case '--message':
      config.message = args[++i];
      break;
    case '-c':
    case '--cooldown':
      config.cooldown = parseInt(args[++i], 10);
      break;
    case '--max-retries':
      config.maxRetries = parseInt(args[++i], 10);
      break;
    case '--wait-after-error':
      config.waitAfterError = parseInt(args[++i], 10);
      break;
    case '-w':
    case '--whitelist':
      config.whitelist = args[++i].split(',').map(s => s.trim());
      break;
    case '-t':
    case '--terminal':
      config.terminal = args[++i];
      break;
    case '-v':
    case '--verbose':
      config.verbose = true;
      break;
    case '-h':
    case '--help':
      console.log(`
Claude Code Auto-Continue Monitor v2.0

Usage: node auto-continue-monitor.js [options]

Options:
  -m, --message <msg>       Continue message (default: "继续")
  -c, --cooldown <sec>      Cooldown between continues (default: 15)
  --max-retries <n>         Max retries per error type (default: 5)
  --wait-after-error <sec>  Wait time after error (default: 5)
  -w, --whitelist <types>   Comma-separated error types to skip
                           (default: authentication_failed,invalid_request)
  -t, --terminal <app>      Target terminal: auto, Terminal, iTerm, Warp
                           (default: auto)
  -v, --verbose             Enable verbose logging

Supported error types:
  rate_limit        - 429 rate limiting
  server_error      - 5xx server errors
  server_overload   - 529 overloaded
  unknown           - Unknown errors
  authentication_failed - Auth errors (default: whitelisted)
  invalid_request   - Bad requests (default: whitelisted)
`);
      process.exit(0);
  }
}

const SIGNAL_FILE = path.join(process.env.HOME, '.claude', 'auto-continue-signal.jsonl');
const STATE_FILE = path.join(process.env.HOME, '.claude', 'auto-continue-state.json');

// Error type to status code ranges
const ERROR_STATUS_RANGES = {
  rate_limit: [429],
  server_error: [500, 502, 503, 504],
  server_overload: [529],
  authentication_failed: [401, 403],
  invalid_request: [400, 413],
};

// State
let state = {
  lastTriggerTime: 0,
  retryCount: {},
  lastErrorTime: 0,
  pendingContinue: null,
};

// Load/save state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    }
  } catch (e) {}
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {}
}

// Logging
function log(level, ...messages) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const prefix = `[${timestamp}]`;
  if (level === 'error') {
    console.error(prefix, '[ERROR]', ...messages);
  } else if (level === 'warn') {
    console.warn(prefix, '[WARN]', ...messages);
  } else if (config.verbose || level === 'info') {
    console.log(prefix, ...messages);
  }
}

// Check if error type is whitelisted
function isWhitelisted(errorType) {
  return config.whitelist.includes(errorType);
}

// Send message via clipboard (macOS)
function sendMessage(message) {
  try {
    // Copy to clipboard using printf to avoid echo -n issues
    log('info', 'Copying message to clipboard...');
    execSync(`printf '%s' '${message.replace(/'/g, "'\"'\"'")}' | pbcopy`);

    // Verify clipboard
    const clipboard = execSync('pbpaste', { encoding: 'utf8' }).trim();
    log('info', `Clipboard content: "${clipboard}"`);

    if (clipboard !== message) {
      log('error', `Clipboard mismatch! Expected "${message}", got "${clipboard}"`);
      // Fallback: use osascript to set clipboard
      execSync(`osascript -e 'set the clipboard to "${message.replace(/"/g, '\\"')}"'`);
      const retryClipboard = execSync('pbpaste', { encoding: 'utf8' }).trim();
      log('info', `Retry clipboard: "${retryClipboard}"`);
    }

    // Wait a moment
    execSync('sleep 0.3');

    // Determine which terminal to activate
    let activateScript = '';
    if (config.terminal === 'Terminal') {
      activateScript = `
tell application "Terminal"
  activate
  delay 0.5
end tell`;
    } else if (config.terminal === 'iTerm') {
      activateScript = `
tell application "iTerm"
  activate
  delay 0.5
end tell`;
    } else if (config.terminal === 'Warp' || config.terminal === 'WarpTerminal') {
      activateScript = `
tell application "Warp"
  activate
  delay 0.5
end tell`;
    } else {
      // Auto: try to find running terminal (check WarpTerminal first)
      activateScript = `
-- Try Warp first (most common modern terminal)
tell application "Warp"
  if it is running then
    activate
    delay 0.5
  end if
end tell

-- Try iTerm
tell application "iTerm"
  if it is running then
    activate
    delay 0.5
  end if
end tell

-- Try Terminal
tell application "Terminal"
  if it is running then
    activate
    delay 0.5
  end if
end tell`;
    }

    // Paste and enter - try multiple methods for reliability
    const script = `
${activateScript}

-- Method 1: Send to System Events globally
tell application "System Events"
  keystroke "v" using command down
  delay 0.5
  keystroke return
end tell`;

    log('info', 'Executing keyboard simulation...');
    const result = execSync(`osascript -e '${script}' 2>&1`, { encoding: 'utf8' });
    if (result.trim()) {
      log('info', `AppleScript output: ${result.trim()}`);
    }
    log('info', 'Keyboard simulation completed');

    // Also try using osascript with process targeting as backup
    try {
      execSync(`osascript -e 'tell application "System Events" to tell process "Warp" to keystroke "v" using command down' 2>&1`, { encoding: 'utf8' });
      execSync(`osascript -e 'tell application "System Events" to tell process "Warp" to keystroke return' 2>&1`, { encoding: 'utf8' });
    } catch (e) {
      // Ignore backup attempt errors
    }

    return true;
  } catch (e) {
    log('error', 'Failed to send message:', e.message);
    if (e.stderr) {
      log('error', 'stderr:', e.stderr.toString());
    }
    return false;
  }
}

// Wait for session to be idle (retries exhausted)
async function waitForIdle(errorType) {
  log('info', `Waiting for Claude Code to become idle...`);

  return new Promise(resolve => {
    let waited = 0;
    const checkInterval = 1000; // Check every second
    const minWait = config.waitAfterError * 1000;
    const maxWait = 60000; // Max 60 seconds

    const check = () => {
      waited += checkInterval;

      // Must wait at least waitAfterError seconds
      if (waited < minWait) {
        if (config.verbose) {
          log('debug', `Waiting... ${waited}ms / ${minWait}ms minimum`);
        }
        setTimeout(check, checkInterval);
        return;
      }

      // Check if no new errors in the last few seconds
      try {
        const stat = fs.statSync(SIGNAL_FILE);
        const timeSinceLastSignal = Date.now() - stat.mtimeMs;

        // If last signal was more than 5 seconds ago, we're likely idle
        if (timeSinceLastSignal > 5000) {
          log('info', `Session appears idle (no new signals for ${Math.round(timeSinceLastSignal/1000)}s)`);
          resolve(true);
          return;
        } else {
          log('info', `Still receiving signals, waiting... (${Math.round(timeSinceLastSignal/1000)}s since last)`);
        }
      } catch (e) {}

      if (waited >= maxWait) {
        log('warn', 'Max wait time reached, proceeding anyway');
        resolve(true);
        return;
      }

      setTimeout(check, checkInterval);
    };

    check();
  });
}

// Trigger continue after error
async function triggerContinue(errorType, statusCode) {
  const now = Date.now();

  // Check whitelist
  if (isWhitelisted(errorType)) {
    log('info', `Error type '${errorType}' is whitelisted, skipping`);
    return false;
  }

  // Check cooldown
  if (now - state.lastTriggerTime < config.cooldown * 1000) {
    const waitTime = Math.ceil((config.cooldown * 1000 - (now - state.lastTriggerTime)) / 1000);
    log('warn', `Cooldown active, ${waitTime}s remaining`);
    return false;
  }

  // Check retry count
  state.retryCount[errorType] = (state.retryCount[errorType] || 0) + 1;
  if (state.retryCount[errorType] > config.maxRetries) {
    log('error', `Max retries (${config.maxRetries}) exceeded for: ${errorType}`);
    return false;
  }

  log('info', `API Error: ${errorType} (status: ${statusCode}, retry ${state.retryCount[errorType]}/${config.maxRetries})`);

  // Wait for retries to complete
  await waitForIdle(errorType);

  // Send continue message
  log('info', `Sending: "${config.message}"`);

  if (sendMessage(config.message)) {
    state.lastTriggerTime = Date.now();
    saveState();
    log('info', 'Continue message sent!');
    return true;
  }

  return false;
}

// Process signal
async function processSignal(line) {
  if (!line.trim()) return;

  try {
    const signal = JSON.parse(line);
    if (signal.event === 'api_error') {
      await triggerContinue(signal.error, signal.status_code || 0);
    }
  } catch (e) {
    log('error', 'Failed to parse signal:', line);
  }
}

// Main
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Claude Code Auto-Continue Monitor v2.0             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Signal file: ${SIGNAL_FILE}`);
  console.log(`Continue message: "${config.message}"`);
  console.log(`Cooldown: ${config.cooldown}s`);
  console.log(`Wait after error: ${config.waitAfterError}s`);
  console.log(`Max retries: ${config.maxRetries}`);
  console.log(`Whitelist: ${config.whitelist.join(', ') || '(none)'}`);
  console.log(`Target terminal: ${config.terminal}`);
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');

  // Ensure signal file exists
  const signalDir = path.dirname(SIGNAL_FILE);
  if (!fs.existsSync(signalDir)) {
    fs.mkdirSync(signalDir, { recursive: true });
  }
  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, '');
  }

  // Load state
  loadState();

  // Reset retry counts for new session
  state.retryCount = {};
  saveState();

  // Track last processed line
  let lastProcessedLine = '';

  // Watch for changes
  const watcher = fs.watch(SIGNAL_FILE, (eventType) => {
    if (eventType === 'change') {
      try {
        const content = fs.readFileSync(SIGNAL_FILE, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);

        // Process only new lines
        if (lines.length > 0) {
          const newLine = lines[lines.length - 1];
          if (newLine !== lastProcessedLine) {
            lastProcessedLine = newLine;
            processSignal(newLine);
          }
        }
      } catch (e) {
        log('error', 'Failed to read signal file:', e.message);
      }
    }
  });

  watcher.on('error', (e) => {
    log('error', 'Watcher error:', e.message);
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    watcher.close();
    saveState();
    process.exit(0);
  });

  // Keep alive
  setInterval(() => {}, 1000);
}

main().catch(console.error);
