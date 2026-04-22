# 🔄 Continue Claude

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](https://www.apple.com/macos)

**Auto-continue plugin for Claude Code** - Automatically sends "继续" when the Claude Code API returns 4xx/5xx errors after retries are exhausted.

> 当 Claude Code API 返回 4xx/5xx 错误且重试结束后，自动发送"继续"消息，让你的工作流不被中断。

## ✨ Features

- 🚀 **One-click installation** - Simple setup script
- ⏳ **Smart retry detection** - Waits for Claude Code's built-in retries to complete before sending continue
- 🛡️ **Whitelist support** - Configure error types that should NOT auto-continue
- ⚡ **Cooldown protection** - Prevents spam with configurable cooldown
- 📊 **Status code aware** - Handles 429, 500-504, 529 and other errors
- 🔧 **Highly configurable** - Customize message, timing, and behavior

## 📋 Requirements

- **macOS** (uses AppleScript for keyboard simulation)
- **Node.js** 14+
- **Claude Code CLI**

## 🚀 Quick Start

### Install

```bash
# Option 1: One-liner installation
curl -fsSL https://raw.githubusercontent.com/anYuJia/continue-claude/main/install.sh | bash

# Option 2: Clone and install
git clone https://github.com/anYuJia/continue-claude.git
cd continue-claude
./install.sh
```

### Usage

```bash
# Terminal 1: Start the monitor
node ~/.claude/auto-continue-monitor.js

# Terminal 2: Start Claude Code
claude
```

That's it! When API errors occur, the monitor will automatically send "继续" after retries complete.

## ⚙️ Configuration

### Command Line Options

```bash
node ~/.claude/auto-continue-monitor.js [options]

Options:
  -m, --message <msg>       Continue message (default: "继续")
  -c, --cooldown <sec>      Cooldown between continues (default: 15)
  --wait-after-error <sec>  Wait time after error (default: 5)
  --max-retries <n>         Max retries per error type (default: 5)
  -w, --whitelist <types>   Error types to skip (comma-separated)
  -v, --verbose             Enable verbose logging
  -h, --help                Show help
```

### Examples

```bash
# Custom message
node ~/.claude/auto-continue-monitor.js --message "请继续"

# Longer wait for retries
node ~/.claude/auto-continue-monitor.js --wait-after-error 10

# Whitelist specific errors (don't auto-continue on these)
node ~/.claude/auto-continue-monitor.js --whitelist "authentication_failed,invalid_request,rate_limit"

# Verbose mode for debugging
node ~/.claude/auto-continue-monitor.js --verbose
```

## 🎯 Supported Error Types

| Error Type | Status Codes | Description | Default Whitelist |
|------------|--------------|-------------|-------------------|
| `rate_limit` | 429 | Rate limiting | ❌ |
| `server_error` | 500-504 | Server errors | ❌ |
| `server_overload` | 529 | Server overloaded | ❌ |
| `authentication_failed` | 401, 403 | Auth errors | ✅ |
| `invalid_request` | 400, 413 | Bad requests | ✅ |
| `unknown` | 0 | Unknown errors | ❌ |

## 🔧 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code Session                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   API Request   │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  API Response   │
                    └─────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
              Success ✅           Error (4xx/5xx) ❌
                    │                   │
                    ▼                   ▼
              Continue...      ┌─────────────────┐
                               │ Built-in Retry  │
                               │   (by Claude)   │
                               └─────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │ Still failing?  │
                              └─────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │ StopFailure Hook│
                              │   (this plugin) │
                              └─────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │ Write to Signal │
                              │     File        │
                              └─────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │ Monitor Script  │
                              │   Detects Error │
                              └─────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
            │ In Whitelist│     │ Wait for    │     │ Max Retries │
            │    Skip     │     │ Idle State  │     │  Exceeded   │
            └─────────────┘     └─────────────┘     └─────────────┘
                                        │                   │
                                        ▼                   ▼
                              ┌─────────────────┐     ┌─────────────┐
                              │ Send "继续"     │     │   Give up   │
                              │ via Keyboard    │     └─────────────┘
                              └─────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │ Claude Continues│
                              └─────────────────┘
```

## 📁 File Structure

After installation, these files are created:

```
~/.claude/
├── settings.json              # Claude Code settings (hooks added)
├── auto-continue-monitor.js   # Monitor script
├── auto-continue-signal.jsonl # Signal file (runtime)
├── auto-continue-state.json   # State tracking (runtime)
└── continue-claude.sh         # Launcher script
```

## 🐛 Troubleshooting

### Hook not triggering

```bash
# Check hooks configuration
cat ~/.claude/settings.json | grep -A 30 "StopFailure"
```

### Monitor not responding

```bash
# Check signal file
cat ~/.claude/auto-continue-signal.jsonl

# Run with verbose mode
node ~/.claude/auto-continue-monitor.js --verbose
```

### Keyboard simulation not working

1. **Check Terminal permissions**: System Preferences → Security & Privacy → Privacy → Accessibility
2. **Make sure Terminal has focus** when the continue message is sent

### Test the setup manually

```bash
# Simulate an error signal
echo '{"event":"api_error","error":"rate_limit","status_code":429}' >> ~/.claude/auto-continue-signal.jsonl
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

[MIT License](LICENSE)

## 🙏 Acknowledgments

- Built for [Claude Code](https://github.com/anthropics/claude-code) by Anthropic
- Inspired by the need for uninterrupted AI-assisted development workflows

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/anYuJia">anYuJia</a>
</p>
