/**
 * lib/keyboard.js
 * Keyboard simulation module
 */
const { exec, execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
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
 * Windows: Use VBScript for keyboard simulation
 * More reliable than PowerShell for Chinese text
 */
function sendWindows(text) {
  // Create a VBScript file
  const vbsFile = path.join(os.tmpdir(), 'send-keys.vbs');

  // VBScript to send keys
  // First copy text to clipboard, then paste
  const vbsContent = `
Set WshShell = WScript.CreateObject("WScript.Shell")
Set objIE = WScript.CreateObject("InternetExplorer.Application")
objIE.Navigate("about:blank")
Do While objIE.Busy
  WScript.Sleep 100
Loop
objIE.Document.ParentWindow.ClipboardData.SetData "text", "${text.replace(/"/g, '""')}"
objIE.Quit
WScript.Sleep 200
WshShell.SendKeys "^v"
WScript.Sleep 100
WshShell.SendKeys "{ENTER}"
`.trim();

  fs.writeFileSync(vbsFile, vbsContent, { encoding: 'ucs2' }); // VBScript needs UCS-2

  return new Promise((resolve, reject) => {
    exec('cscript //Nologo "' + vbsFile + '"', { windowsHide: true }, err => {
      // Clean up
      try { fs.unlinkSync(vbsFile); } catch (e) {}

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
