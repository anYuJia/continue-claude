#!/usr/bin/env node
/**
 * continue-claude v4.0
 *
 * Claude Code 自动继续监控 - 带 TUI 状态面板
 * 参考 badclaude 的键盘模拟实现
 *
 * Usage:
 *   node index.js [options]
 */

const os = require('os');
const { createDetector, SIGNAL_FILE } = require('./lib/detector');
const { send } = require('./lib/keyboard');
const { createUI } = require('./lib/ui');

const IS_MAC = os.platform() === 'darwin';

// 解析命令行参数
const args = process.argv.slice(2);
const config = {
  message: '继续',
  cooldown: 15,
  maxRetries: 20,
  whitelist: ['authentication_failed', 'invalid_request'],
  verbose: false,
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
    case '-w':
    case '--whitelist':
      config.whitelist = args[++i].split(',').map(s => s.trim());
      break;
    case '-v':
    case '--verbose':
      config.verbose = true;
      break;
    case '-h':
    case '--help':
      console.log(`
Claude Code Auto-Continue Monitor v4.0

Usage: node index.js [options]

Options:
  -m, --message <msg>    Continue message (default: "继续")
  -c, --cooldown <sec>   Cooldown between continues (default: 15)
  --max-retries <n>      Max retries per error type (default: 20)
  -w, --whitelist <types> Comma-separated error types to skip
                        (default: authentication_failed,invalid_request)
  -v, --verbose          Enable verbose logging

Examples:
  node index.js
  node index.js -m "请继续" -c 20
  node index.js --max-retries 10 -v
`);
      process.exit(0);
  }
}

// 状态对象（UI 会读取）
const state = {
  lastTriggerTime: 0,
  retryCount: {},
  totalSends: 0,
  totalErrors: 0,
  cooldown: config.cooldown * 1000,
  errorHistory: [],
  sendHistory: [],
};

/**
 * 日志（只在 verbose 模式下输出到文件）
 */
function log(level, ...messages) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const msg = `[${timestamp}] [${level.toUpperCase()}] ${messages.join(' ')}`;

  // 添加到错误历史
  if (level === 'error' || level === 'warn') {
    state.errorHistory.push({
      time: Date.now(),
      type: messages[0] || 'unknown',
      message: msg,
      sent: false,
    });
  }
}

/**
 * 检查错误类型是否在白名单中
 */
function isWhitelisted(errorType) {
  return config.whitelist.includes(errorType);
}

/**
 * 显示系统通知
 */
function showNotification(title, message) {
  try {
    if (IS_MAC) {
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedMessage = message.replace(/"/g, '\\"');
      const { execSync } = require('child_process');
      execSync(`osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "Glass"'`);
    }
  } catch (e) {}
}

/**
 * 处理 API 错误信号
 */
async function handleSignal(signal) {
  const now = Date.now();
  const errorType = signal.error || 'unknown';
  const statusCode = signal.status_code || 0;

  state.totalErrors++;

  // 检查白名单
  if (isWhitelisted(errorType)) {
    state.errorHistory.push({
      time: now,
      type: errorType,
      status: statusCode,
      sent: false,
    });
    return;
  }

  // 检查冷却时间
  if (now - state.lastTriggerTime < config.cooldown * 1000) {
    state.errorHistory.push({
      time: now,
      type: errorType,
      status: statusCode,
      sent: false,
    });
    return;
  }

  // 检查重试次数
  state.retryCount[errorType] = (state.retryCount[errorType] || 0) + 1;
  if (state.retryCount[errorType] > config.maxRetries) {
    state.errorHistory.push({
      time: now,
      type: errorType,
      status: statusCode,
      sent: false,
    });
    return;
  }

  // 等待一小段时间让错误状态稳定
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 发送继续消息
  try {
    await send(config.message);
    state.lastTriggerTime = Date.now();
    state.totalSends++;

    // 记录发送历史
    state.sendHistory.push({
      time: Date.now(),
      message: config.message,
      errorType,
    });

    state.errorHistory.push({
      time: now,
      type: errorType,
      status: statusCode,
      sent: true,
    });

    showNotification('✅ 继续已发送', `"${config.message}" 已发送到 Claude Code`);
  } catch (e) {
    state.errorHistory.push({
      time: now,
      type: errorType,
      status: statusCode,
      sent: false,
    });
    showNotification('⚠️ 发送失败', '请手动输入继续消息');
  }
}

/**
 * 主函数
 */
async function main() {
  // 创建 UI
  const ui = createUI(state);

  // 创建检测器
  const detector = createDetector(handleSignal, { pollInterval: 1000 });

  // 启动 UI
  ui.start();

  // 启动检测
  detector.start();

  // 处理退出
  const cleanup = () => {
    ui.stop();
    detector.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // 保持进程运行
  setInterval(() => {}, 1000);
}

main().catch(e => {
  console.error('启动失败:', e);
  process.exit(1);
});
