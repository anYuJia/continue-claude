#!/usr/bin/env node
/**
 * auto-continue-monitor.js v3.0
 *
 * Cross-platform monitor for Claude Code API errors
 * Supports: macOS (Warp, Terminal, iTerm), Windows (PowerShell, Windows Terminal)
 *
 * Usage:
 *   node auto-continue-monitor.js [options]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const IS_WINDOWS = os.platform() === 'win32';
const IS_MAC = os.platform() === 'darwin';

// Parse arguments
const args = process.argv.slice(2);
const config = {
  message: '继续',
  cooldown: 15,
  maxRetries: 20,
  waitAfterError: 30,
  whitelist: ['authentication_failed', 'invalid_request'],
  verbose: false,
  terminal: 'auto',
  autoSend: true,
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
Claude Code Auto-Continue Monitor v3.0 (Cross-Platform)

Usage: node auto-continue-monitor.js [options]

Options:
  -m, --message <msg>       Continue message (default: "继续")
  -c, --cooldown <sec>      Cooldown between continues (default: 15)
  --max-retries <n>         Max retries per error type (default: 5)
  --wait-after-error <sec>  Wait time after error (default: 30)
  -w, --whitelist <types>   Comma-separated error types to skip
  -t, --terminal <app>      Target terminal (default: auto-detect)
                           macOS: Warp, Terminal, iTerm
                           Windows: wt, cmd, powershell
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

// Platform-specific paths
const CLAUDE_DIR = IS_WINDOWS
  ? path.join(process.env.USERPROFILE, '.claude')
  : path.join(process.env.HOME, '.claude');

const SIGNAL_FILE = path.join(CLAUDE_DIR, 'auto-continue-signal.jsonl');
const STATE_FILE = path.join(CLAUDE_DIR, 'auto-continue-state.json');

// State
let state = {
  lastTriggerTime: 0,
  retryCount: {},
  lastErrorTime: 0,
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

// Show notification (cross-platform)
function showNotification(title, message) {
  try {
    if (IS_MAC) {
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedMessage = message.replace(/"/g, '\\"');
      execSync(`osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "Glass"'`);
    } else if (IS_WINDOWS) {
      // Use PowerShell for Windows notifications
      const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$template = @"
<toast>
  <visual>
    <binding template="ToastText02">
      <text id="1">${title}</text>
      <text id="2">${message}</text>
    </binding>
  </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Claude Code").Show($toast)
`;
      execSync(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`, { stdio: 'ignore' });
    }
  } catch (e) {}
}

// Copy to clipboard (cross-platform)
function copyToClipboard(text) {
  try {
    if (IS_MAC) {
      execSync(`printf '%s' '${text.replace(/'/g, "'\"'\"'")}' | pbcopy`);
    } else if (IS_WINDOWS) {
      execSync(`powershell -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`);
    }
    return true;
  } catch (e) {
    log('error', 'Failed to copy to clipboard:', e.message);
    return false;
  }
}

// Detect terminal (cross-platform)
function detectTerminal() {
  if (config.terminal !== 'auto') {
    return config.terminal;
  }

  if (IS_MAC) {
    // Check if Warp is running
    try {
      execSync('pgrep -x "stable"', { encoding: 'utf8' });
      return 'Warp';
    } catch (e) {}

    // Check Terminal.app
    try {
      execSync('pgrep -x "Terminal"', { encoding: 'utf8' });
      return 'Terminal';
    } catch (e) {}

    // Check iTerm
    try {
      execSync('pgrep -x "iTerm"', { encoding: 'utf8' });
      return 'iTerm';
    } catch (e) {}

    return 'Terminal';
  }

  if (IS_WINDOWS) {
    // Check Windows Terminal
    try {
      execSync('tasklist /FI "IMAGENAME eq WindowsTerminal.exe" | findstr WindowsTerminal', { encoding: 'utf8' });
      return 'wt';
    } catch (e) {}

    // Check PowerShell
    try {
      execSync('tasklist /FI "IMAGENAME eq pwsh.exe" | findstr pwsh', { encoding: 'utf8' });
      return 'powershell';
    } catch (e) {}

    // Check CMD
    try {
      execSync('tasklist /FI "IMAGENAME eq cmd.exe" | findstr cmd', { encoding: 'utf8' });
      return 'cmd';
    } catch (e) {}

    return 'wt';
  }

  return 'auto';
}

// Send message (cross-platform)
async function sendMessage(message) {
  // Copy to clipboard first
  if (!copyToClipboard(message)) {
    return false;
  }
  log('info', `Message "${message}" copied to clipboard`);

  if (!config.autoSend) {
    showNotification('🔄 Continue Claude', `已复制: "${message}" - 请按 Ctrl+V`);
    log('info', 'Auto-send disabled. Message in clipboard.');
    return true;
  }

  try {
    const terminal = detectTerminal();
    log('info', `Target terminal: ${terminal}`);

    if (IS_MAC) {
      await sendMacKeyboard(terminal);
    } else if (IS_WINDOWS) {
      await sendWindowsKeyboard(terminal);
    }

    showNotification('✅ 继续已发送', `"${message}" 已发送到 Claude Code`);
    return true;
  } catch (e) {
    log('error', 'Failed to send message:', e.message);
    showNotification('⚠️ 发送失败', '请手动粘贴');
    return false;
  }
}

// macOS keyboard simulation
async function sendMacKeyboard(terminal) {
  let script = '';

  if (terminal === 'Warp') {
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
  } else if (terminal === 'Terminal') {
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
  } else if (terminal === 'iTerm') {
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
    // Auto: try all
    script = `
tell application "System Events"
  keystroke "v" using command down
  delay 0.3
  keystroke return
end tell`;
  }

  log('info', 'Executing keyboard simulation...');
  execSync(`osascript -e '${script}'`);
  log('info', 'Keyboard simulation completed');
}

// Windows keyboard simulation
async function sendWindowsKeyboard(terminal) {
  // Use PowerShell SendKeys
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^{v}")
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
`;

  log('info', 'Executing keyboard simulation...');
  execSync(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`);
  log('info', 'Keyboard simulation completed');
}

// Wait for session to be idle
async function waitForIdle(errorType) {
  log('info', `Waiting for Claude Code to become idle...`);

  return new Promise(resolve => {
    let waited = 0;
    const checkInterval = 1000;
    const minWait = config.waitAfterError * 1000;
    const maxWait = 60000;

    const check = () => {
      waited += checkInterval;

      if (waited < minWait) {
        if (config.verbose) {
          log('debug', `Waiting... ${waited}ms / ${minWait}ms minimum`);
        }
        setTimeout(check, checkInterval);
        return;
      }

      try {
        const stat = fs.statSync(SIGNAL_FILE);
        const timeSinceLastSignal = Date.now() - stat.mtimeMs;

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

  if (isWhitelisted(errorType)) {
    log('info', `Error type '${errorType}' is whitelisted, skipping`);
    return false;
  }

  if (now - state.lastTriggerTime < config.cooldown * 1000) {
    const waitTime = Math.ceil((config.cooldown * 1000 - (now - state.lastTriggerTime)) / 1000);
    log('warn', `Cooldown active, ${waitTime}s remaining`);
    return false;
  }

  state.retryCount[errorType] = (state.retryCount[errorType] || 0) + 1;
  if (state.retryCount[errorType] > config.maxRetries) {
    log('error', `Max retries (${config.maxRetries}) exceeded for: ${errorType}`);
    return false;
  }

  log('info', `API Error: ${errorType} (status: ${statusCode}, retry ${state.retryCount[errorType]}/${config.maxRetries})`);

  await waitForIdle(errorType);

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
    const trimmed = line.trim();
    let signal = {};

    // Try JSON format first
    if (trimmed.startsWith('{')) {
      try {
        signal = JSON.parse(trimmed);
      } catch (e) {
        // JSON parse failed, try key:value format
      }
    }

    // Parse key:value or key=value format
    if (!signal.event) {
      // Split by spaces, colons, or equals
      const pairs = trimmed.split(/[\s]+/);
      for (const pair of pairs) {
        // Try key:value or key=value
        const match = pair.match(/^([^::=]+)[::=](.+)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          // Convert numeric values
          signal[key] = isNaN(value) ? value : parseInt(value, 10);
        }
      }
    }

    if (signal.event === 'api_error') {
      await triggerContinue(signal.error, signal.status_code || 0);
    }
  } catch (e) {
    log('error', 'Failed to parse signal:', line, e.message);
  }
}

// Get Claude sessions (cross-platform)
function getClaudeSessions() {
  try {
    if (IS_MAC) {
      const stdout = execSync(
        'ps aux | grep "claude" | grep -v grep | grep -v "auto-continue" | grep -v "node.*claude"',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      return stdout.trim().split('\n').filter(Boolean);
    } else if (IS_WINDOWS) {
      const stdout = execSync(
        'tasklist /FI "IMAGENAME eq claude.exe" /FO CSV | findstr claude',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      return stdout.trim().split('\n').filter(Boolean);
    }
  } catch (e) {}
  return [];
}

// Main
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Claude Code Auto-Continue Monitor v3.0               ║');
  console.log('║     Platform: ' + (IS_WINDOWS ? 'Windows' : 'macOS').padEnd(44) + '║');
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

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Monitoring Claude Code sessions:');
  const sessions = getClaudeSessions();
  if (sessions.length > 0) {
    sessions.forEach((line, i) => {
      if (IS_MAC) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          const pid = parts[1];
          const tty = parts[6];
          const started = parts[8];
          console.log(`   ${i + 1}. PID: ${pid} | TTY: ${tty} | Started: ${started}`);
        }
      } else {
        console.log(`   ${i + 1}. ${line}`);
      }
    });
    console.log('');
    console.log(`   📁 Signal file: ${SIGNAL_FILE}`);
  } else {
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

  loadState();
  state.retryCount = {};
  saveState();

  let lastProcessedLine = '';

  const watcher = fs.watch(SIGNAL_FILE, (eventType) => {
    if (eventType === 'change') {
      try {
        const content = fs.readFileSync(SIGNAL_FILE, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);

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

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    watcher.close();
    saveState();
    process.exit(0);
  });

  setInterval(() => {}, 1000);
}

main().catch(console.error);
