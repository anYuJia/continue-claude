#!/usr/bin/env node
/**
 * continue-claude v4.0
 *
 * 简化版 Claude Code 自动继续监控
 * 参考 badclaude 的键盘模拟实现
 *
 * Usage:
 *   node index.js [options]
 *
 * Options:
 *   -m, --message <msg>    Continue message (default: "继续")
 *   -c, --cooldown <sec>   Cooldown between continues (default: 15)
 *   --max-retries <n>      Max retries per error type (default: 20)
 *   -v, --verbose          Enable verbose logging
 */

const os = require('os');
const { createDetector, SIGNAL_FILE } = require('./lib/detector');
const { send } = require('./lib/keyboard');

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

// 状态
let state = {
  lastTriggerTime: 0,
  retryCount: {},
};

/**
 * 日志
 */
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

/**
 * 检查错误类型是否在白名单中
 */
function isWhitelisted(errorType) {
  return config.whitelist.includes(errorType);
}

/**
 * 处理 API 错误信号
 */
async function handleSignal(signal) {
  const now = Date.now();
  const errorType = signal.error || 'unknown';
  const statusCode = signal.status_code || 0;

  // 检查白名单
  if (isWhitelisted(errorType)) {
    log('info', `错误类型 '${errorType}' 在白名单中，跳过`);
    return;
  }

  // 检查冷却时间
  if (now - state.lastTriggerTime < config.cooldown * 1000) {
    const waitTime = Math.ceil((config.cooldown * 1000 - (now - state.lastTriggerTime)) / 1000);
    log('warn', `冷却中，还需等待 ${waitTime}s`);
    return;
  }

  // 检查重试次数
  state.retryCount[errorType] = (state.retryCount[errorType] || 0) + 1;
  if (state.retryCount[errorType] > config.maxRetries) {
    log('error', `超过最大重试次数 (${config.maxRetries}): ${errorType}`);
    return;
  }

  log('info', `检测到错误: ${errorType} (status: ${statusCode}, 重试 ${state.retryCount[errorType]}/${config.maxRetries})`);

  // 等待一小段时间让错误状态稳定
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 发送继续消息
  try {
    log('info', `发送: "${config.message}"`);
    await send(config.message);
    state.lastTriggerTime = Date.now();
    log('info', '✓ 已发送继续消息');

    // 显示通知
    showNotification('✅ 继续已发送', `"${config.message}" 已发送到 Claude Code`);
  } catch (e) {
    log('error', '发送失败:', e.message);
    showNotification('⚠️ 发送失败', '请手动输入继续消息');
  }
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
    // Windows 通知可以后续添加
  } catch (e) {}
}

/**
 * 主函数
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Claude Code Auto-Continue Monitor v4.0               ║');
  console.log('║     Platform: ' + (IS_MAC ? 'macOS' : 'Windows').padEnd(44) + '║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Signal file: ${SIGNAL_FILE}`);
  console.log(`Continue message: "${config.message}"`);
  console.log(`Cooldown: ${config.cooldown}s`);
  console.log(`Max retries: ${config.maxRetries}`);
  console.log(`Whitelist: ${config.whitelist.join(', ') || '(none)'}`);
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');

  // 创建检测器
  const detector = createDetector(handleSignal, { pollInterval: 1000 });

  // 启动检测
  detector.start();

  // 处理退出
  process.on('SIGINT', () => {
    console.log('\n正在停止...');
    detector.stop();
    process.exit(0);
  });

  // 保持进程运行
  setInterval(() => {}, 1000);
}

main().catch(console.error);
