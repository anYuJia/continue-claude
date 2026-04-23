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
      // Windows: 使用 tasklist 查找进程
      let results = [];

      // 方式1: 查找 claude.exe
      try {
        const stdout1 = execSync(
          'tasklist /FI "IMAGENAME eq claude.exe" /FO CSV /NH',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const lines1 = stdout1.trim().split('\n').filter(l => !l.includes('INFO:'));
        for (const line of lines1) {
          const match = line.match(/"([^"]+)","([^"]+)","([^"]+)","([^"]+)"/);
          if (match) {
            results.push({
              pid: match[2],
              user: '-',
              cpu: '-',
              mem: match[4],
              time: '-',
              command: match[1].replace('.exe', ''),
            });
          }
        }
      } catch (e) {}

      // 方式2: 查找包含 claude 的 node 进程
      try {
        const stdout2 = execSync(
          'wmic process where "CommandLine like \'%claude%\' and CommandLine like \'%node%\'" get ProcessId,CommandLine /FORMAT:LIST 2>nul',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const blocks = stdout2.split(/\n\s*\n/);
        for (const block of blocks) {
          const cmdMatch = block.match(/CommandLine=(.+)/);
          const pidMatch = block.match(/ProcessId=(\d+)/);
          if (cmdMatch && pidMatch) {
            const cmd = cmdMatch[1].trim();
            // 排除自己和 wmic、cmd 等
            if (!cmd.includes('continue-claude') &&
                !cmd.includes('wmic') &&
                !cmd.includes('cmd.exe') &&
                !cmd.includes('powershell')) {
              results.push({
                pid: pidMatch[1],
                user: '-',
                cpu: '-',
                mem: '-',
                time: '-',
                command: cmd.substring(0, 40),
              });
            }
          }
        }
      } catch (e) {}

      // 去重（按 PID）
      const seen = new Set();
      return results.filter(p => {
        if (seen.has(p.pid)) return false;
        seen.add(p.pid);
        return true;
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
 * 渲染状态面板（Windows 兼容版）
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
    : `${colors.green}Ready${colors.reset}`;

  lines.push('');
  lines.push(`  ${colors.bold}Status${colors.reset}`);
  lines.push(`  ${'─'.repeat(Math.min(width - 4, 60))}`);
  lines.push(`  │ Cooldown: ${cooldownStr}`);
  lines.push(`  │ Total sends: ${colors.cyan}${state.totalSends}${colors.reset}`);
  lines.push(`  │ Errors: ${colors.magenta}${state.totalErrors}${colors.reset}`);
  if (state.signalFile) {
    lines.push(`  │ Signal file: ${colors.dim}${state.signalFile}${colors.reset}`);
  }
  lines.push(`  ${'─'.repeat(Math.min(width - 4, 60))}`);

  // Claude 进程列表
  lines.push('');
  lines.push(`  ${colors.bold}Claude Processes${colors.reset}`);
  lines.push(`  ${'─'.repeat(Math.min(width - 4, 60))}`);

  const processes = getClaudeProcesses();
  if (processes.length === 0) {
    lines.push(`  │ ${colors.dim}No Claude processes found${colors.reset}`);
  } else {
    lines.push(`  │ ${colors.dim}PID      CPU%   MEM    Command${colors.reset}`);
    for (const p of processes.slice(0, 8)) {
      const statusIcon = colors.green + icons.running + colors.reset;
      lines.push(`  │ ${statusIcon} ${(p.pid || '?').toString().padEnd(7)} ${(p.cpu || '-').toString().padEnd(5)}  ${(p.mem || '-').toString().padEnd(5)}  ${(p.command || 'claude').substring(0, 30)}`);
    }
  }
  lines.push(`  ${'─'.repeat(Math.min(width - 4, 60))}`);

  // 错误历史
  lines.push('');
  lines.push(`  ${colors.bold}Error History (last 5)${colors.reset}`);
  lines.push(`  ${'─'.repeat(Math.min(width - 4, 60))}`);

  const recentErrors = state.errorHistory.slice(-5).reverse();
  if (recentErrors.length === 0) {
    lines.push(`  │ ${colors.dim}No errors${colors.reset}`);
  } else {
    for (const err of recentErrors) {
      const time = formatTime(new Date(err.time));
      const type = (err.type || 'unknown').padEnd(20);
      const status = err.sent
        ? `${colors.green}SENT${colors.reset}`
        : `${colors.red}SKIP${colors.reset}`;
      lines.push(`  │ ${colors.dim}${time}${colors.reset} ${type} ${status}`);
    }
  }
  lines.push(`  ${'─'.repeat(Math.min(width - 4, 60))}`);

  // 消息记录
  lines.push('');
  lines.push(`  ${colors.bold}Send History (last 5)${colors.reset}`);
  lines.push(`  ${'─'.repeat(Math.min(width - 4, 60))}`);

  const recentSends = state.sendHistory.slice(-5).reverse();
  if (recentSends.length === 0) {
    lines.push(`  │ ${colors.dim}No sends${colors.reset}`);
  } else {
    for (const send of recentSends) {
      const time = formatTime(new Date(send.time));
      lines.push(`  │ ${colors.dim}${time}${colors.reset} "${send.message}"`);
    }
  }
  lines.push(`  ${'─'.repeat(Math.min(width - 4, 60))}`);

  // 底部提示
  lines.push('');
  lines.push(`  ${colors.dim}Ctrl+C to exit | --test for test signal${colors.reset}`);

  // Windows: 清屏后重绘（避免光标问题）
  const output = '\x1b[2J\x1b[H' + lines.join('\n');
  process.stdout.write(output);
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
