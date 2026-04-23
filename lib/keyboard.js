/**
 * lib/keyboard.js
 * Keyboard simulation module
 */
const { exec, execSync } = require('child_process');
const os = require('os');

const IS_MAC = os.platform() === 'darwin';
const IS_WINDOWS = os.platform() === 'win32';

/**
 * macOS: Direct keystroke (reference: badclaude)
 */
function sendMac(text) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = [
    'tell application "System Events"',
    '  keystroke "' + escaped + '"',
    '  delay 0.05',
    '  key code 36',  // Enter
    'end tell'
  ].join('\n');

  return new Promise((resolve, reject) => {
    exec('osascript -e \'' + script + '\'', err => {
      if (err) {
        console.error('macOS keyboard failed:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Windows: Use PowerShell with proper escaping
 */
function sendWindows(text) {
  // Use a temp file to avoid encoding issues
  const fs = require('fs');
  const path = require('path');
  const tempFile = path.join(os.tmpdir(), 'continue-claude-input.txt');

  // Write text to temp file
  fs.writeFileSync(tempFile, text, 'utf8');

  // PowerShell script that reads from file and sends
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $text = Get-Content -Path '${tempFile.replace(/'/g, "''")}' -Encoding UTF8
    [System.Windows.Forms.Clipboard]::SetText($text)
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Remove-Item -Path '${tempFile.replace(/'/g, "''")}' -Force
  `;

  return new Promise((resolve, reject) => {
    exec('powershell -NoProfile -Command "' + psScript.replace(/\n/g, ' ').replace(/"/g, '\\"') + '"', err => {
      if (err) {
        console.error('Windows keyboard failed:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Send text to active window
 */
async function send(text) {
  if (IS_MAC) {
    return sendMac(text);
  } else if (IS_WINDOWS) {
    return sendWindows(text);
  } else {
    throw new Error('Unsupported OS: ' + os.platform());
  }
}

module.exports = { send, sendMac, sendWindows };
