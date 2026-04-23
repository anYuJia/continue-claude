/**
 * lib/keyboard.js
 * Keyboard simulation module
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_MAC = os.platform() === 'darwin';
const IS_WINDOWS = os.platform() === 'win32';

/**
 * macOS: Direct keystroke
 */
function sendMac(text) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = [
    'tell application "System Events"',
    '  keystroke "' + escaped + '"',
    '  delay 0.05',
    '  key code 36',
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
 * Windows: Use clip + PowerShell SendKeys
 */
function sendWindows(text) {
  return new Promise((resolve, reject) => {
    // Step 1: Copy to clipboard
    const tempFile = path.join(os.tmpdir(), 'claude-input.txt');
    fs.writeFileSync(tempFile, text, 'utf8');

    exec(`type "${tempFile}" | clip`, { shell: true }, (err) => {
      if (err) {
        try { fs.unlinkSync(tempFile); } catch (e) {}
        console.error('Clipboard failed:', err.message);
        reject(err);
        return;
      }

      // Step 2: Send Ctrl+V and Enter
      // Must load System.Windows.Forms first
      const psCmd = 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v"); Start-Sleep -Milliseconds 100; [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")';

      exec(`powershell -NoProfile -Command "${psCmd}"`, { shell: true }, (err2) => {
        try { fs.unlinkSync(tempFile); } catch (e) {}

        if (err2) {
          console.error('SendKeys failed:', err2.message);
          reject(err2);
        } else {
          resolve();
        }
      });
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
