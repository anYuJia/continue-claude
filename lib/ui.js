/**
 * lib/ui.js
 * 终端 TUI 界面模块
 */
const os = require('os');
const { execSync } = require('child_process');

const IS_MAC = os.platform() === 'darwin';
const IS_WINDOWS = os.platform() === 'win32';

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

// 状态图标
const icons = {
  running: '●',
  idle: '○',
  error: '✗',
  success: '✓',
  wait: '⋯',
};

/**
 * 清屏并移动光标到左上角
 */
function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

/**
 * 隐藏光标
 */
function hideCursor() {
  process.stdout.write('\x1b[?25l');
}

/**
 * 显示光标
 */
function showCursor() {
  process.stdout.write('\x1b[?25h');
}

/**
 * 获取 Claude 进程列表
 */
function getClaudeProcesses() {
  try {
    if (IS_MAC) {
      const stdout = execSync(
        'ps aux | grep -E "claude|Claude" | grep -v grep | grep -v "continue-claude"',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          pid: parts[1],
          user: parts[0],
          cpu: parts[2],
          mem: parts[3],
          time: parts[9] || '?',
          command: parts.slice(10).join(' ').substring(0, 40),
        };
      });
    } else if (IS_WINDOWS) {
      const stdout = execSync(
        'powershell -Command "Get-Process | Where-Object {$_.ProcessName -like \'*claude*\'} | Select-Object Id, ProcessName, CPU, WorkingSet64 | Format-Table -HideTableHeaders"',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          pid: parts[0],
          user: '-',
          cpu: parts[2] || '0',
          mem: Math.round((parseInt(parts[3]) || 0) / 1024 / 1024) + 'M',
          time: '-',
          command: parts[1] || 'claude',
        };
      });
    }
  } catch (e) {
    return [];
  }
  return [];
}

/**
 * 格式化时间
 */
function formatTime(date) {
  return date.toTimeString().slice(0, 8);
}

/**
 * 格式化持续时间
 */
function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m${remSec}s`;
}

/**
 * 渲染状态面板
 */
function render(state) {
  const lines = [];
  const width = process.stdout.columns || 80;

  // 标题栏
  const title = ' Claude Code Auto-Continue Monitor v4.0 ';
  const titleBar = colors.bgBlue + colors.white + colors.bold +
    title.padEnd(width) + colors.reset;
  lines.push(titleBar);

  // 状态概览
  const now = Date.now();
  const cooldownRemaining = Math.max(0, state.cooldown - (now - state.lastTriggerTime));
  const cooldownStr = cooldownRemaining > 0
    ? `${colors.yellow}${formatDuration(cooldownRemaining)}${colors.reset}`
    : `${colors.green}就绪${colors.reset}`;

  lines.push('');
  lines.push(`  ${colors.bold}状态概览${colors.reset}`);
  lines.push(`  ${'─'.repeat(width - 4)}`);
  lines.push(`  │ 冷却状态: ${cooldownStr}`);
  lines.push(`  │ 总发送次数: ${colors.cyan}${state.totalSends}${colors.reset}`);
  lines.push(`  │ 错误检测: ${colors.magenta}${state.totalErrors}${colors.reset}`);
  lines.push(`  ${'─'.repeat(width - 4)}`);

  // Claude 进程列表
  lines.push('');
  lines.push(`  ${colors.bold}Claude 进程${colors.reset}`);
  lines.push(`  ${'─'.repeat(width - 4)}`);

  const processes = getClaudeProcesses();
  if (processes.length === 0) {
    lines.push(`  │ ${colors.dim}未检测到 Claude 进程${colors.reset}`);
  } else {
    lines.push(`  │ ${colors.dim}PID      CPU%   MEM    命令${colors.reset}`);
    for (const p of processes) {
      const statusIcon = colors.green + icons.running + colors.reset;
      lines.push(`  │ ${statusIcon} ${p.pid.padEnd(7)} ${p.cpu.padEnd(5)}  ${p.mem.padEnd(5)}  ${p.command.substring(0, 30)}`);
    }
  }
  lines.push(`  ${'─'.repeat(width - 4)}`);

  // 错误历史
  lines.push('');
  lines.push(`  ${colors.bold}错误历史 (最近5条)${colors.reset}`);
  lines.push(`  ${'─'.repeat(width - 4)}`);

  const recentErrors = state.errorHistory.slice(-5).reverse();
  if (recentErrors.length === 0) {
    lines.push(`  │ ${colors.dim}暂无错误记录${colors.reset}`);
  } else {
    for (const err of recentErrors) {
      const time = formatTime(new Date(err.time));
      const type = err.type.padEnd(20);
      const status = err.sent
        ? `${colors.green}已发送${colors.reset}`
        : `${colors.red}跳过${colors.reset}`;
      lines.push(`  │ ${colors.dim}${time}${colors.reset} ${type} ${status}`);
    }
  }
  lines.push(`  ${'─'.repeat(width - 4)}`);

  // 消息记录
  lines.push('');
  lines.push(`  ${colors.bold}发送记录 (最近5条)${colors.reset}`);
  lines.push(`  ${'─'.repeat(width - 4)}`);

  const recentSends = state.sendHistory.slice(-5).reverse();
  if (recentSends.length === 0) {
    lines.push(`  │ ${colors.dim}暂无发送记录${colors.reset}`);
  } else {
    for (const send of recentSends) {
      const time = formatTime(new Date(send.time));
      lines.push(`  │ ${colors.dim}${time}${colors.reset} "${send.message}"`);
    }
  }
  lines.push(`  ${'─'.repeat(width - 4)}`);

  // 底部提示
  lines.push('');
  lines.push(`  ${colors.dim}按 Ctrl+C 退出${colors.reset}`);

  // 渲染
  clearScreen();
  process.stdout.write(lines.join('\n'));
}

/**
 * 创建 UI 管理器
 */
function createUI(state) {
  let renderInterval = null;

  function start() {
    hideCursor();
    render(state);
    renderInterval = setInterval(() => render(state), 1000);
  }

  function stop() {
    if (renderInterval) {
      clearInterval(renderInterval);
      renderInterval = null;
    }
    showCursor();
    clearScreen();
  }

  function update() {
    render(state);
  }

  return { start, stop, update };
}

module.exports = {
  createUI,
  getClaudeProcesses,
  clearScreen,
  hideCursor,
  showCursor,
  colors,
  icons,
};
