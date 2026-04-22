# PowerShell install script for Windows
#
# Usage:
#   Save this file and run: .\install.ps1
#

$ErrorActionPreference = "Stop"

# Banner
Write-Host ""
Write-Host "  Continue Claude - Auto-Continue Plugin" -ForegroundColor Cyan
Write-Host "  Platform: Windows" -ForegroundColor DarkGray
Write-Host ""

# Paths
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$SettingsFile = Join-Path $ClaudeDir "settings.json"
$SignalFile = Join-Path $ClaudeDir "auto-continue-signal.jsonl"
$MonitorFile = Join-Path $ClaudeDir "auto-continue-monitor.js"
$ScriptDir = $PSScriptRoot

# Check Node.js
Write-Host "[1/4] Checking Node.js..." -ForegroundColor Blue
try {
    $nodeVersion = node -v
    Write-Host "  OK: Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Create directories
Write-Host "[2/4] Setting up directories..." -ForegroundColor Blue
New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
Write-Host "  OK: $ClaudeDir" -ForegroundColor Green

# Download monitor script
Write-Host "[3/4] Installing monitor..." -ForegroundColor Blue
$MonitorUrl = "https://raw.githubusercontent.com/anYuJia/continue-claude/main/auto-continue-monitor.js"
try {
    Invoke-WebRequest -Uri $MonitorUrl -OutFile $MonitorFile -UseBasicParsing
    Write-Host "  OK: Downloaded monitor script" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Could not download, checking local file..." -ForegroundColor Yellow
    if (Test-Path "$ScriptDir\auto-continue-monitor.js") {
        Copy-Item "$ScriptDir\auto-continue-monitor.js" $MonitorFile -Force
        Write-Host "  OK: Copied from local" -ForegroundColor Green
    } else {
        Write-Host "  ERROR: No monitor script found" -ForegroundColor Red
        exit 1
    }
}

# Create signal file
New-Item -ItemType File -Force -Path $SignalFile | Out-Null

# Configure hooks
Write-Host "[4/4] Configuring hooks..." -ForegroundColor Blue

$HooksJson = @'
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [{ "type": "command", "command": "echo {\"event\":\"api_error\",\"error\":\"rate_limit\",\"status_code\":429} >> ~/.claude/auto-continue-signal.jsonl", "async": true }]
      },
      {
        "matcher": "server_error",
        "hooks": [{ "type": "command", "command": "echo {\"event\":\"api_error\",\"error\":\"server_error\",\"status_code\":500} >> ~/.claude/auto-continue-signal.jsonl", "async": true }]
      },
      {
        "matcher": "server_overload",
        "hooks": [{ "type": "command", "command": "echo {\"event\":\"api_error\",\"error\":\"server_overload\",\"status_code\":529} >> ~/.claude/auto-continue-signal.jsonl", "async": true }]
      },
      {
        "matcher": "unknown",
        "hooks": [{ "type": "command", "command": "echo {\"event\":\"api_error\",\"error\":\"unknown\",\"status_code\":0} >> ~/.claude/auto-continue-signal.jsonl", "async": true }]
      }
    ]
  }
}
'@

if (Test-Path $SettingsFile) {
    $Existing = Get-Content $SettingsFile -Raw | ConvertFrom-Json
    if (-not $Existing.hooks) {
        $Existing | Add-Member -NotePropertyName "hooks" -NotePropertyValue ($HooksJson | ConvertFrom-Json).hooks -Force
    } elseif (-not $Existing.hooks.StopFailure) {
        $Existing.hooks | Add-Member -NotePropertyName "StopFailure" -NotePropertyValue ($HooksJson | ConvertFrom-Json).hooks.StopFailure -Force
    }
    $Existing | ConvertTo-Json -Depth 10 | Set-Content $SettingsFile
} else {
    $HooksJson | Set-Content $SettingsFile
}
Write-Host "  OK: Hooks configured" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Usage:" -ForegroundColor Cyan
Write-Host "    node ~/.claude/auto-continue-monitor.js"
Write-Host "    claude"
Write-Host ""
