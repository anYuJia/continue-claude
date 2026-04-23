/**
 * lib/detector.js
 * 信号检测模块
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_MAC = os.platform() === 'darwin';
const IS_WINDOWS = os.platform() === 'win32';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SIGNAL_FILE = path.join(CLAUDE_DIR, 'auto-continue-signal.jsonl');

/**
 * 解析信号行
 * 支持两种格式:
 * 1. JSON: {"event":"api_error","error":"server_error","status_code":500}
 * 2. key:value: event:api_error error:server_error status_code:500
 */
function parseSignal(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 尝试 JSON 格式
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {}
  }

  // 解析 key:value 格式
  const result = {};
  const pairs = trimmed.split(/\s+/);
  for (const pair of pairs) {
    const idx = pair.indexOf(':');
    if (idx > 0) {
      const key = pair.substring(0, idx).trim();
      const value = pair.substring(idx + 1).trim();
      result[key] = isNaN(value) ? value : parseInt(value, 10);
    }
  }
  return result;
}

/**
 * 确保信号文件存在
 */
function ensureSignalFile() {
  try {
    if (!fs.existsSync(CLAUDE_DIR)) {
      fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    }
    if (!fs.existsSync(SIGNAL_FILE)) {
      fs.writeFileSync(SIGNAL_FILE, '');
    }
    return true;
  } catch (e) {
    console.error('无法创建信号文件:', e.message);
    return false;
  }
}

/**
 * 创建信号检测器
 * @param {Function} onSignal - 信号回调函数 (signal) => void
 * @param {Object} options - 配置选项
 */
function createDetector(onSignal, options = {}) {
  const pollInterval = options.pollInterval || 1000;
  const verbose = options.verbose || false;

  const created = ensureSignalFile();

  let lastLine = '';
  let pollTimer = null;
  let watcher = null;
  let filePosition = 0;

  /**
   * 检查信号文件变化
   */
  function checkForChanges() {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(SIGNAL_FILE)) {
        ensureSignalFile();
        return;
      }

      const content = fs.readFileSync(SIGNAL_FILE, 'utf8');
      const lines = content.replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean);

      if (lines.length === 0) return;

      const latest = lines[lines.length - 1];
      if (latest === lastLine) return;

      lastLine = latest;

      if (verbose) {
        console.log('[检测到新信号]', latest);
      }

      const signal = parseSignal(latest);

      if (signal && signal.event === 'api_error') {
        onSignal(signal);
      }
    } catch (e) {
      if (verbose) {
        console.error('[检测错误]', e.message);
      }
    }
  }

  /**
   * 启动检测
   */
  function start() {
    // 使用轮询（跨平台可靠）
    pollTimer = setInterval(checkForChanges, pollInterval);

    // macOS: 也使用 fs.watch 作为备选（更快响应）
    if (IS_MAC) {
      try {
        watcher = fs.watch(SIGNAL_FILE, (eventType) => {
          if (eventType === 'change') {
            checkForChanges();
          }
        });
        watcher.on('error', () => {}); // 忽略错误
      } catch (e) {}
    }
  }

  /**
   * 停止检测
   */
  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  }

  /**
   * 手动触发测试信号
   */
  function testSignal() {
    const testLine = `event:api_error error:server_error status_code:500`;
    fs.appendFileSync(SIGNAL_FILE, testLine + '\n');
    return testLine;
  }

  return { start, stop, testSignal, SIGNAL_FILE, created };
}

module.exports = { createDetector, parseSignal, SIGNAL_FILE, IS_WINDOWS };
