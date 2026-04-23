<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=for-the-badge" alt="Node.js">
</p>

<h1 align="center">Continue Claude</h1>

<p align="center">
  <strong>Claude Code 自动继续监控 v4.0</strong><br>
  <sub>API 错误自动恢复，零中断工作流</sub>
</p>

---

## ✨ 特性

- 🖥️ **跨平台** — 支持 macOS 和 Windows
- ⌨️ **直接键盘模拟** — 不污染剪贴板
- 🛡️ **白名单机制** — 可配置跳过特定错误类型
- ⚡ **零依赖** — 纯 Node.js，无需 npm install

---

## 🚀 快速开始

### 安装

**macOS**
```bash
# 方式1: 克隆仓库
git clone https://github.com/your-username/continue-claude.git
cd continue-claude

# 方式2: 直接下载
mkdir -p ~/.claude/continue-claude/lib
curl -fsSL https://raw.githubusercontent.com/your-username/continue-claude/main/index.js -o ~/.claude/continue-claude/index.js
curl -fsSL https://raw.githubusercontent.com/your-username/continue-claude/main/lib/keyboard.js -o ~/.claude/continue-claude/lib/keyboard.js
curl -fsSL https://raw.githubusercontent.com/your-username/continue-claude/main/lib/detector.js -o ~/.claude/continue-claude/lib/detector.js
```

**Windows (PowerShell)**
```powershell
git clone https://github.com/your-username/continue-claude.git
cd continue-claude
```

---

## 📖 使用方法

### 重要：运行方式

> ⚠️ **键盘模拟会发送到当前活动窗口**
> 
> 确保检测到错误时，**Claude Code 所在的终端窗口是活动窗口**

### 方式1：后台运行（推荐）

**macOS**
```bash
# 在后台启动监控
node index.js &

# 然后启动 Claude Code
claude
```

**Windows**
```powershell
# 打开两个 PowerShell 窗口
# 窗口1: 运行监控
node index.js

# 窗口2: 运行 Claude Code
claude
```

### 方式2：同一终端（需手动切换）

```bash
# 启动监控（后台）
node index.js &

# 启动 Claude
claude

# 当监控检测到错误时，确保 Claude 窗口是活动窗口
```

### 命令行选项

```bash
node index.js [选项]

选项:
  -m, --message <msg>     继续消息 (默认: "继续")
  -c, --cooldown <sec>    冷却秒数 (默认: 15)
  --max-retries <n>       最大重试次数 (默认: 20)
  -w, --whitelist <types> 跳过的错误类型 (默认: authentication_failed,invalid_request)
  -v, --verbose           显示详细日志
  -h, --help              显示帮助
```

### 示例

```bash
# 使用默认配置
node index.js

# 自定义消息和冷却时间
node index.js -m "请继续" -c 20

# 详细模式
node index.js -v

# 跳过 rate_limit 错误
node index.js -w "authentication_failed,invalid_request,rate_limit"
```

---

## ⚙️ 配置 Claude Code Hook

需要在 Claude Code 中配置 StopFailure hook，让它在 API 错误时写入信号文件。

### 配置方法

编辑 `~/.claude/settings.json`：

```json
{
  "hooks": {
    "StopFailure": [
      {
        "command": "bash -c 'echo \"event:api_error error:$ERROR_TYPE status_code:$STATUS_CODE\" >> ~/.claude/auto-continue-signal.jsonl'"
      }
    ]
  }
}
```

**Windows (PowerShell)** - 编辑 `%USERPROFILE%\.claude\settings.json`：

```json
{
  "hooks": {
    "StopFailure": [
      {
        "command": "powershell -Command \"Add-Content -Path $env:USERPROFILE\\.claude\\auto-continue-signal.jsonl -Value 'event:api_error error:$env:ERROR_TYPE status_code:$env:STATUS_CODE'\""
      }
    ]
  }
}
```

---

## 🔧 工作原理

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  API 错误   │ ──▶ │ Claude 重试 │ ──▶ │  仍失败?    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                         ┌─────────────────────┘
                         ▼
               ┌──────────────────┐
               │ StopFailure Hook │
               └────────┬─────────┘
                        ▼
               ┌──────────────────┐     ┌─────────────┐
               │ 写入信号文件     │ ──▶ │ 监控检测    │
               └──────────────────┘     └──────┬──────┘
                                               │
                         ┌─────────────────────┘
                         ▼
               ┌──────────────────┐
               │ 键盘模拟发送     │
               │ "继续"           │
               └──────────────────┘
```

### 键盘模拟实现

**macOS** - 使用 AppleScript：
```applescript
tell application "System Events"
  keystroke "继续"
  key code 36  -- Enter
end tell
```

**Windows** - 使用 PowerShell SendKeys：
```powershell
[System.Windows.Forms.SendKeys]::SendWait("继续{ENTER}")
```

---

## 📋 支持的错误类型

| 类型 | 状态码 | 默认处理 |
|------|--------|----------|
| `rate_limit` | 429 | ✅ 发送继续 |
| `server_error` | 500-504 | ✅ 发送继续 |
| `server_overload` | 529 | ✅ 发送继续 |
| `authentication_failed` | 401, 403 | ❌ 跳过 (白名单) |
| `invalid_request` | 400, 413 | ❌ 跳过 (白名单) |

---

## 🐛 故障排除

### macOS: 键盘模拟不工作

**解决方案**: 授予终端辅助功能权限

1. 系统偏好设置 → 隐私与安全性 → 辅助功能
2. 点击左下角锁图标解锁
3. 添加 Terminal.app (或 iTerm、Warp 等)
4. 重启终端

### Windows: 键盘模拟不工作

**解决方案**: 以管理员身份运行 PowerShell

```powershell
# 右键 PowerShell → 以管理员身份运行
node index.js
```

### 测试信号检测

```bash
# macOS
echo 'event:api_error error:server_error status_code:500' >> ~/.claude/auto-continue-signal.jsonl

# Windows PowerShell
Add-Content -Path "$env:USERPROFILE\.claude\auto-continue-signal.jsonl" -Value 'event:api_error error:server_error status_code:500'
```

运行后应该看到：
```
[2026-04-23 13:00:00] 检测到错误: server_error (status: 500, 重试 1/20)
[2026-04-23 13:00:01] 发送: "继续"
[2026-04-23 13:00:01] ✓ 已发送继续消息
```

### 消息发送到了错误的窗口

确保：
1. Claude Code 运行在终端中
2. 检测到错误时，终端是活动窗口
3. 不要在错误发生时切换到其他应用

---

## 📁 项目结构

```
continue-claude/
├── index.js              # 主入口
├── lib/
│   ├── keyboard.js       # 键盘模拟 (macOS/Windows)
│   └── detector.js       # 信号文件检测
├── package.json
└── README.md
```

---

## 📄 License

MIT
