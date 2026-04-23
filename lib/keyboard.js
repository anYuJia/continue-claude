/**
 * lib/keyboard.js
 * 键盘模拟模块 - 参考 badclaude 实现
 */
const { execFile } = require('child_process');
const os = require('os');

const IS_MAC = os.platform() === 'darwin';
const IS_WINDOWS = os.platform() === 'win32';

/**
 * macOS: 直接键入文字（参考 badclaude main.js:322-335）
 * 不使用剪贴板，直接模拟键盘事件
 */
function sendMac(text) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = [
    'tell application "System Events"',
    '  keystroke "' + escaped + '"',
    '  delay 0.05',
    '  key code 36',  // Enter (key code 36)
    'end tell'
  ].join('\n');

  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], err => {
      if (err) {
        console.error('macOS 键盘模拟失败:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Windows: 使用 PowerShell SendKeys
 * 注意: SendKeys 对中文支持有限，可能需要使用剪贴板作为备选
 */
function sendWindows(text) {
  // 转义 SendKeys 特殊字符
  let escaped = text
    .replace(/\+/g, '{+}')
    .replace(/\^/g, '{^}')
    .replace(/%/g, '{%}')
    .replace(/~/g, '{~}')
    .replace(/\(/g, '{(}')
    .replace(/\)/g, '{)}')
    .replace(/\[/g, '{[}')
    .replace(/\]/g, '{]}')
    .replace(/\{/g, '{{}')
    .replace(/\}/g, '{}}');

  // 使用剪贴板方式发送（更可靠支持中文）
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::SetText('${text.replace(/'/g, "''")}')
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  `;

  return new Promise((resolve, reject) => {
    execFile('powershell', ['-Command', psScript.replace(/\n/g, ' ')], err => {
      if (err) {
        console.error('Windows 键盘模拟失败:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * 发送文字到当前活动窗口
 * @param {string} text - 要发送的文字
 * @returns {Promise<void>}
 */
async function send(text) {
  if (IS_MAC) {
    return sendMac(text);
  } else if (IS_WINDOWS) {
    return sendWindows(text);
  } else {
    throw new Error('不支持的操作系统: ' + os.platform());
  }
}

module.exports = { send, sendMac, sendWindows };
