# PowerShell install script for Windows
#
# Usage:
#   irm https://raw.githubusercontent.com/anYuJia/continue-claude/main/install.ps1 | iex
#   or
#   .\install.ps1
#

$ErrorActionPreference = "Stop"

# Banner
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                               ║" -ForegroundColor Cyan
Write-Host "║              🔄 Continue Claude - Auto-Continue Plugin        ║" -ForegroundColor Cyan
Write-Host "║                                                               ║" -ForegroundColor Cyan
Write-Host "║   Automatically continue when Claude Code API errors occur    ║" -ForegroundColor Cyan
Write-Host "║                                                               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$SettingsFile = Join-Path $ClaudeDir "settings.json"
$SignalFile = Join-Path $ClaudeDir "auto-continue-signal.jsonl"
$MonitorFile = Join-Path $ClaudeDir "auto-continue-monitor.js"

# Step 1: Check dependencies
Write-Host "[1/5] Checking dependencies..." -ForegroundColor Blue

# Check Node.js
try {
    $nodeVersion = node -v
    Write-Host "  ✓ Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js is required but not installed." -ForegroundColor Red
    Write-Host "    Please install Node.js: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Step 2: Create directories
Write-Host ""
Write-Host "[2/5] Creating directories..." -ForegroundColor Blue
New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
Write-Host "  ✓ $ClaudeDir" -ForegroundColor Green

# Step 3: Install files
Write-Host ""
Write-Host "[3/5] Installing files..." -ForegroundColor Blue

# Copy monitor script
Copy-Item "$ScriptDir\auto-continue-monitor.js" $MonitorFile -Force
Write-Host "  ✓ Installed monitor script to $MonitorFile" -ForegroundColor Green

# Create signal file
New-Item -ItemType File -Force -Path $SignalFile | Out-Null
Write-Host "  ✓ Created signal file at $SignalFile" -ForegroundColor Green

# Step 4: Configure hooks
Write-Host ""
Write-Host "[4/5] Configuring hooks..." -ForegroundColor Blue

# Backup existing settings
if (Test-Path $SettingsFile) {
    $BackupFile = "$SettingsFile.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $SettingsFile $BackupFile
    Write-Host "  ✓ Backed up settings to $BackupFile" -ForegroundColor Green
}

# Hooks configuration
$HooksConfig = @{
    hooks = @{
        StopFailure = @(
            @{
                matcher = "rate_limit"
                hooks = @(@{
                    type = "command"
                    command = 'echo {"event":"api_error","error":"rate_limit","status_code":429,"timestamp":"' + (Get-Date -Format 'o') + '"} >> ' + $SignalFile.Replace('\', '/')
                    async = $true
                })
            },
            @{
                matcher = "server_error"
                hooks = @(@{
                    type = "command"
                    command = 'echo {"event":"api_error","error":"server_error","status_code":500,"timestamp":"' + (Get-Date -Format 'o') + '"} >> ' + $SignalFile.Replace('\', '/')
                    async = $true
                })
            },
            @{
                matcher = "server_overload"
                hooks = @(@{
                    type = "command"
                    command = 'echo {"event":"api_error","error":"server_overload","status_code":529,"timestamp":"' + (Get-Date -Format 'o') + '"} >> ' + $SignalFile.Replace('\', '/')
                    async = $true
                })
            },
            @{
                matcher = "unknown"
                hooks = @(@{
                    type = "command"
                    command = 'echo {"event":"api_error","error":"unknown","status_code":0,"timestamp":"' + (Get-Date -Format 'o') + '"} >> ' + $SignalFile.Replace('\', '/')
                    async = $true
                })
            }
        )
    }
}

# Merge with existing settings
if (Test-Path $SettingsFile) {
    $Existing = Get-Content $SettingsFile | ConvertFrom-Json
    # Merge hooks
    if ($Existing.hooks) {
        $Existing.hooks | Add-Member -NotePropertyName "StopFailure" -NotePropertyValue $HooksConfig.hooks.StopFailure -Force
    } else {
        $Existing | Add-Member -NotePropertyName "hooks" -NotePropertyValue $HooksConfig.hooks -Force
    }
    $Existing | ConvertTo-Json -Depth 10 | Set-Content $SettingsFile
} else {
    $HooksConfig | ConvertTo-Json -Depth 10 | Set-Content $SettingsFile
}
Write-Host "  ✓ Hooks configured" -ForegroundColor Green

# Step 5: Create launcher
Write-Host ""
Write-Host "[5/5] Creating launcher script..." -ForegroundColor Blue

$Launcher = Join-Path $ClaudeDir "continue-claude.ps1"
@'
# Continue Claude Monitor Launcher (Windows)
param(
    [string]$Message = "继续",
    [int]$Cooldown = 15,
    [int]$WaitAfterError = 30,
    [switch]$Verbose
)

node ~/.claude/auto-continue-monitor.js @args
'@ | Set-Content $Launcher
Write-Host "  ✓ Created launcher at $Launcher" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "                    ✓ Installation Complete!                  " -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Usage:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Start the monitor in a separate terminal:" -ForegroundColor Yellow
Write-Host "     node ~/.claude/auto-continue-monitor.js" -ForegroundColor Blue
Write-Host ""
Write-Host "  2. Start Claude Code:" -ForegroundColor Yellow
Write-Host "     claude" -ForegroundColor Blue
Write-Host ""
Write-Host "  3. When API errors occur, the monitor will automatically" -ForegroundColor Yellow
Write-Host "     send '继续' after waiting for retries to complete." -ForegroundColor Yellow
Write-Host ""
Write-Host "Options:" -ForegroundColor Cyan
Write-Host "  --message, -m       Continue message (default: 继续)"
Write-Host "  --cooldown, -c      Cooldown between continues in seconds (default: 15)"
Write-Host "  --wait-after-error  Seconds to wait after error (default: 30)"
Write-Host "  --max-retries       Max auto-continues per error type (default: 5)"
Write-Host "  --whitelist, -w     Comma-separated error types to skip"
Write-Host "  --no-auto-send      Only copy to clipboard, don't auto-send"
Write-Host "  --verbose, -v       Enable verbose logging"
Write-Host ""
