# 🔄 Continue Claude

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](https://www.apple.com/macos)

**Claude Code 自动继续插件** - 当 Claude Code API 返回 4xx/5xx 错误且重试结束后，自动发送"继续"消息，让你的工作流不被中断。

## ✨ 特性

- 🚀 **一键安装** - 简单的安装脚本
- ⏳ **智能重试检测** - 等待 Claude Code 内置重试完成后再发送继续
- 🛡️ **白名单支持** - 配置不需要自动继续的错误类型
- ⚡ **冷却保护** - 可配置的冷却时间防止刷屏
- 📊 **状态码识别** - 处理 429, 500-504, 529 等错误
- 🔧 **高度可配置** - 自定义消息、时间和行为
- 🖥️ **多终端支持** - 支持 Warp、Terminal.app、iTerm

## 📋 系统要求

- **macOS** (使用 AppleScript 进行键盘模拟)
- **Node.js** 14+
- **Claude Code CLI**

## 🚀 快速开始

### 安装

```bash
# 方式1: 一行命令安装
curl -fsSL https://raw.githubusercontent.com/anYuJia/continue-claude/main/install.sh | bash

# 方式2: 克隆并安装
git clone https://github.com/anYuJia/continue-claude.git
cd continue-claude
./install.sh
```

### 使用

**重要：监控脚本需要在运行 Claude Code 的同一个终端中执行。**

```bash
# 在运行 Claude Code 的终端中，启动监控
node ~/.claude/auto-continue-monitor.js &

# 然后启动 Claude Code
claude
```

或者使用后台模式：

```bash
# 同时启动监控和 Claude Code
node ~/.claude/auto-continue-monitor.js & claude
```

就这样！当 API 错误发生时，监控会在等待重试完成后自动发送"继续"。

## ⚙️ 配置

### 命令行选项

```bash
node ~/.claude/auto-continue-monitor.js [选项]

选项:
  -m, --message <消息>      继续消息 (默认: "继续")
  -c, --cooldown <秒>       两次继续之间的冷却时间 (默认: 15)
  --wait-after-error <秒>   错误后等待时间 (默认: 30)
  --max-retries <次数>      每种错误类型的最大重试次数 (默认: 5)
  -w, --whitelist <类型>    跳过的错误类型，逗号分隔
  -t, --terminal <终端>     目标终端: Warp, Terminal, iTerm (默认: 自动检测)
  --no-auto-send           仅复制到剪贴板，不自动发送
  -v, --verbose            启用详细日志
  -h, --help               显示帮助
```

### 示例

```bash
# 自定义消息
node ~/.claude/auto-continue-monitor.js --message "请继续"

# 指定终端类型
node ~/.claude/auto-continue-monitor.js -t Warp

# 更长的重试等待时间
node ~/.claude/auto-continue-monitor.js --wait-after-error 60

# 白名单特定错误 (不在这些错误时自动继续)
node ~/.claude/auto-continue-monitor.js --whitelist "authentication_failed,invalid_request,rate_limit"

# 详细模式用于调试
node ~/.claude/auto-continue-monitor.js --verbose

# 仅复制到剪贴板模式
node ~/.claude/auto-continue-monitor.js --no-auto-send
```

## 🎯 支持的错误类型

| 错误类型 | 状态码 | 描述 | 默认白名单 |
|---------|--------|------|-----------|
| `rate_limit` | 429 | 速率限制 | ❌ |
| `server_error` | 500-504 | 服务器错误 | ❌ |
| `server_overload` | 529 | 服务器过载 | ❌ |
| `authentication_failed` | 401, 403 | 认证错误 | ✅ |
| `invalid_request` | 400, 413 | 无效请求 | ✅ |
| `unknown` | 0 | 未知错误 | ❌ |

## 🔧 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code 会话                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   API 请求      │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   API 响应      │
                    └─────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
              成功 ✅           错误 (4xx/5xx) ❌
                    │                   │
                    ▼                   ▼
              继续...      ┌─────────────────┐
                           │  内置重试机制   │
                           │   (由 Claude)   │
                           └─────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │   仍然失败?     │
                          └─────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │ StopFailure Hook│
                          │   (本插件)      │
                          └─────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │ 写入信号文件    │
                          └─────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │  监控脚本检测   │
                          │   到错误        │
                          └─────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │ 在白名单中  │ │ 等待空闲    │ │ 超过最大    │
            │   跳过      │ │   状态      │ │   重试次数  │
            └─────────────┘ └─────────────┘ └─────────────┘
                                    │               │
                                    ▼               ▼
                          ┌─────────────────┐ ┌─────────────┐
                          │ 发送 "继续"     │ │   放弃      │
                          │ 通过键盘模拟    │ └─────────────┘
                          └─────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │ Claude 继续     │
                          └─────────────────┘
```

## 📁 文件结构

安装后会创建以下文件：

```
~/.claude/
├── settings.json              # Claude Code 设置 (添加了 hooks)
├── auto-continue-monitor.js   # 监控脚本
├── auto-continue-signal.jsonl # 信号文件 (运行时)
├── auto-continue-state.json   # 状态追踪 (运行时)
└── continue-claude.sh         # 启动脚本
```

## 🐛 故障排除

### Hook 没有触发

```bash
# 检查 hooks 配置
cat ~/.claude/settings.json | grep -A 30 "StopFailure"
```

### 监控没有响应

```bash
# 检查信号文件
cat ~/.claude/auto-continue-signal.jsonl

# 使用详细模式运行
node ~/.claude/auto-continue-monitor.js --verbose
```

### 键盘模拟不工作

1. **检查辅助功能权限**：系统偏好设置 → 安全性与隐私 → 隐私 → 辅助功能
2. **确保终端有焦点**：发送继续消息时，终端窗口需要是当前活动窗口
3. **在同一个终端运行**：监控脚本需要在运行 Claude Code 的同一个终端中执行

### 手动测试

```bash
# 模拟一个错误信号
echo '{"event":"api_error","error":"rate_limit","status_code":429}' >> ~/.claude/auto-continue-signal.jsonl
```

### 终端检测问题

如果自动检测不正确，可以手动指定终端：

```bash
# 指定 Warp
node ~/.claude/auto-continue-monitor.js -t Warp

# 指定 Terminal.app
node ~/.claude/auto-continue-monitor.js -t Terminal

# 指定 iTerm
node ~/.claude/auto-continue-monitor.js -t iTerm
```

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

## 📄 许可证

[MIT License](LICENSE)

## 🙏 致谢

- 为 [Claude Code](https://github.com/anthropics/claude-code) by Anthropic 构建
- 灵感来源于对不间断 AI 辅助开发工作流的需求

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/anYuJia">anYuJia</a>
</p>
