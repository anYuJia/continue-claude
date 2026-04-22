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
  waitAfterError: 30, // Wait for Claude retries to complete
  whitelist: ['authentication_failed', 'invalid_request'],
  verbose: false,
  terminal: 'auto', // 'auto', 'Terminal', 'iTerm', 'Warp'
  autoSend: true, // Default to auto-send
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
    case '--no-auto-send':
      config.autoSend = false;
      break;
    case '-h':
    case '--help':
      console.log(`
Claude Code Auto-Continue Monitor v2.2

Usage: node auto-continue-monitor.js [options]

Options:
  -m, --message <msg>       Continue message (default: "继续")
  -c, --cooldown <sec>      Cooldown between continues (default: 15)
  --max-retries <n>         Max retries per error type (default: 5)
  --wait-after-error <sec>  Wait time after error (default: 30)
  -w, --whitelist <types>   Comma-separated error types to skip
                           (default: authentication_failed,invalid_request)
  -t, --terminal <app>      Target terminal: auto, Terminal, iTerm, Warp
                           (default: auto-detect)
  --no-auto-send           Only copy to clipboard, don't auto-send
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

// Show macOS notification
function showNotification(title, message) {
  try {
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedMessage = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "Glass"'`);
  } catch (e) {}
}

// Detect which terminal app is running Claude Code
function detectClaudeTerminal() {
  try {
    // First, check which app is currently frontmost (user is likely looking at it)
    try {
      const frontmostApp = execSync(
        `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
        { encoding: 'utf8' }
      ).trim();

      // If Warp (stable) is frontmost, use it
      if (frontmostApp === 'stable') {
        log('info', 'Warp is the active window, using Warp');
        return { app: 'Warp', tty: null };
      }
      if (frontmostApp === 'Terminal') {
        log('info', 'Terminal is the active window, using Terminal');
        return { app: 'Terminal', tty: null };
      }
      if (frontmostApp === 'iTerm' || frontmostApp === 'iTerm2') {
        log('info', 'iTerm is the active window, using iTerm');
        return { app: 'iTerm', tty: null };
      }
    } catch (e) {}

    // Fallback: Check which terminal has claude processes
    const result = execSync(
      `ps aux | grep "claude" | grep -v grep | grep -v "auto-continue" | grep -v "node.*claude" | awk '{print $7}' | sort | uniq -c | sort -rn | head -1`,
      { encoding: 'utf8' }
    ).trim();

    // Parse the TTY (e.g., "s010" or "ttys010")
    if (result) {
      const parts = result.trim().split(/\s+/);
      if (parts.length >= 2) {
        const tty = parts[1];
        log('info', `Detected Claude Code on TTY: ${tty}`);

        // Determine which terminal app owns this TTY
        // Check if Warp is running (process name is "stable")
        try {
          execSync('pgrep -x "stable"', { encoding: 'utf8' });
          return { app: 'Warp', tty: tty };
        } catch (e) {}

        // Check if Terminal is running
        try {
          execSync('pgrep -x "Terminal"', { encoding: 'utf8' });
          return { app: 'Terminal', tty: tty };
        } catch (e) {}

        // Check if iTerm is running
        try {
          execSync('pgrep -x "iTerm"', { encoding: 'utf8' });
          return { app: 'iTerm', tty: tty };
        } catch (e) {}
      }
    }
  } catch (e) {}

  // Fallback to config or auto
  return { app: config.terminal, tty: null };
}

// Send message via clipboard (macOS)
async function sendMessage(message) {
  // Always copy to clipboard first
  execSync(`printf '%s' '${message.replace(/'/g, "'\"'\"'")}' | pbcopy`);
  log('info', `Message "${message}" copied to clipboard`);

  // If not auto-send, just notify
  if (!config.autoSend) {
    showNotification('🔄 Continue Claude', `已复制: "${message}" - 请按 Cmd+V`);
    log('info', 'Auto-send disabled. Message in clipboard.');
    return true;
  }

  try {
    // Detect which terminal to use
    const terminalInfo = detectClaudeTerminal();
    const terminalApp = terminalInfo.app;
    const tty = terminalInfo.tty;
    log('info', `Target terminal: ${terminalApp} (TTY: ${tty})`);

    // Build the AppleScript based on terminal
    let script = '';

    if (terminalApp === 'Warp') {
      // Warp's process name is "stable"
      // Use System Events to target the "stable" process directly
      script = `
tell application "Warp"
  activate
end tell
delay 0.8
tell application "System Events"
  tell process "stable"
    keystroke "v" using command down
    delay 0.3
    keystroke return
  end tell
end tell`;
    } else if (terminalApp === 'Terminal') {
      script = `
tell application "Terminal"
  activate
  delay 0.5
end tell
tell application "System Events"
  keystroke "v" using command down
  delay 0.3
  keystroke return
end tell`;
    } else if (terminalApp === 'iTerm') {
      script = `
tell application "iTerm"
  activate
  delay 0.5
end tell
tell application "System Events"
  keystroke "v" using command down
  delay 0.3
  keystroke return
end tell`;
    } else {
      // Auto: try all terminals
      script = `
tell application "Warp"
  if it is running then
    activate
    delay 0.5
  end if
end tell
tell application "Terminal"
  if it is running then
    activate
    delay 0.5
  end if
end tell
delay 0.3
tell application "System Events"
  keystroke "v" using command down
  delay 0.3
  keystroke return
end tell`;
    }

    log('info', 'Executing keyboard simulation...');
    execSync(`osascript -e '${script}'`);
    log('info', 'Keyboard simulation completed');
    showNotification('✅ 继续已发送', `"${message}" 已发送到 Claude Code`);
    return true;
  } catch (e) {
    log('error', 'Failed to send message:', e.message);
    showNotification('⚠️ 发送失败', '请手动按 Cmd+V + Enter');
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

  if (await sendMessage(config.message)) {
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
  console.log(`Auto-send: ${config.autoSend}`);
  console.log('');

  // Show which Claude Code sessions are being monitored
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Monitoring Claude Code sessions:');
  try {
    const stdout = require('child_process').execSync(
      'ps aux | grep "claude" | grep -v grep | grep -v "auto-continue" | grep -v "node.*claude"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      lines.forEach((line, i) => {
        // Parse ps output: USER PID %CPU %MEM VSZ RSS TT STAT STARTED TIME COMMAND
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          const pid = parts[1];
          const tty = parts[6];
          const time = parts[9];
          const started = parts[8];
          console.log(`   ${i + 1}. PID: ${pid} | TTY: ${tty} | Started: ${started}`);
        }
      });
      console.log('');
      console.log(`   📁 Signal file: ${SIGNAL_FILE}`);
    } else {
      console.log('   ⚠️  No Claude Code sessions detected');
      console.log('   💡 Start Claude Code: claude');
    }
  } catch (e) {
    // ps might return empty which throws
    console.log('   ⚠️  No Claude Code sessions detected');
    console.log('   💡 Start Claude Code: claude');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
