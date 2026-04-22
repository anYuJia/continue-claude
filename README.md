<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Node.js-14%2B-brightgreen?style=for-the-badge" alt="Node.js">
</p>

<h1 align="center">Continue Claude</h1>

<p align="center">
  <strong>Claude Code 自动继续插件</strong><br>
  <sub>API 错误？自动恢复。零中断工作流。</sub>
</p>

<p align="center">
  <a href="#-安装">安装</a> •
  <a href="#-使用">使用</a> •
  <a href="#%EF%B8%8F-配置">配置</a> •
  <a href="#-工作原理">原理</a>
</p>

---

## ✨ 特性

- 🖥️ **跨平台** — macOS / Windows 一套代码
- ⏳ **智能等待** — 等 Claude 重试完再继续
- 🛡️ **白名单** — 指定哪些错误不处理
- ⚡ **零配置** — 开箱即用

## 🚀 安装

**macOS**
```bash
curl -fsSL https://raw.githubusercontent.com/anYuJia/continue-claude/main/install.sh | bash
```

**Windows**
```powershell
irm https://raw.githubusercontent.com/anYuJia/continue-claude/main/install.ps1 | iex
```

## 📖 使用

```bash
# 启动监控
node ~/.claude/auto-continue-monitor.js &

# 启动 Claude
claude
```

> ⚡ 监控需在 Claude Code 同一终端运行

## ⚙️ 配置

```bash
node ~/.claude/auto-continue-monitor.js [选项]

 -m, --message        继续消息 (默认: "继续")
 -c, --cooldown       冷却秒数 (默认: 15)
 --wait-after-error   等待秒数 (默认: 30)
 --max-retries        最大次数 (默认: 20)
 -w, --whitelist      跳过的错误类型
 -t, --terminal       终端类型 (Warp/Terminal/iTerm/wt)
 --no-auto-send       只复制不发送
 -v, --verbose        详细日志
```

<details>
<summary><b>📋 支持的错误类型</b></summary>

| 类型 | 状态码 | 默认跳过 |
|------|--------|---------|
| `rate_limit` | 429 | ❌ |
| `server_error` | 500-504 | ❌ |
| `server_overload` | 529 | ❌ |
| `authentication_failed` | 401, 403 | ✅ |
| `invalid_request` | 400, 413 | ✅ |

</details>

## 🔧 工作原理

```
API 错误 → Claude 重试 → 仍失败 → Hook 触发 → 写入信号文件 → 监控检测 → 发送"继续"
```

<details>
<summary><b>详细流程图</b></summary>

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  API Error   │ ──▶ │ Claude 重试  │ ──▶ │  仍失败?     │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                    ┌─────────────────────────────┘
                    ▼
          ┌──────────────────┐
          │  StopFailure Hook│
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐     ┌──────────────┐
          │  写入信号文件    │ ──▶ │  监控检测    │
          └──────────────────┘     └──────┬───────┘
                                           │
                    ┌──────────────────────┘
                    ▼
          ┌──────────────────┐
          │  发送 "继续"     │
          └──────────────────┘
```

</details>

## 🐛 故障排除

<details>
<summary><b>键盘模拟不工作</b></summary>

**macOS**: 系统偏好设置 → 隐私 → 辅助功能 → 添加终端

**Windows**: 以管理员身份运行 PowerShell
</details>

<details>
<summary><b>测试 Hook</b></summary>

```bash
echo '{"event":"api_error","error":"rate_limit","status_code":429}' >> ~/.claude/auto-continue-signal.jsonl
```
</details>

---

<p align="center">
  <sub>Built for <a href="https://github.com/anthropics/claude-code">Claude Code</a> by <a href="https://github.com/anYuJia">anYuJia</a></sub>
</p>
