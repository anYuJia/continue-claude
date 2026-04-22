#!/bin/bash
#
# install.sh - One-click installation for Continue Claude plugin
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/anYuJia/continue-claude/main/install.sh | bash
#   or
#   ./install.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║              🔄 Continue Claude - Auto-Continue Plugin        ║"
echo "║                                                               ║"
echo "║   Automatically continue when Claude Code API errors occur    ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Detect script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS_DIR="$HOME/.claude"
SETTINGS_FILE="$SETTINGS_DIR/settings.json"
SIGNAL_FILE="$SETTINGS_DIR/auto-continue-signal.jsonl"
MONITOR_FILE="$SETTINGS_DIR/auto-continue-monitor.js"

echo -e "${BLUE}[1/5] Checking dependencies...${NC}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is required but not installed.${NC}"
    echo "Please install Node.js: https://nodejs.org/"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"

# Check for jq (optional but recommended)
if command -v jq &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} jq $(jq --version 2>/dev/null || echo 'installed')"
    HAS_JQ=true
else
    echo -e "  ${YELLOW}!${NC} jq not found (will use manual JSON merge)"
    HAS_JQ=false
fi

# Check for macOS (required for AppleScript)
if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${YELLOW}Warning: This plugin is designed for macOS.${NC}"
    echo -e "  Keyboard simulation may not work on other platforms."
fi

echo ""
echo -e "${BLUE}[2/5] Creating directories...${NC}"
mkdir -p "$SETTINGS_DIR"
echo -e "  ${GREEN}✓${NC} $SETTINGS_DIR"

echo ""
echo -e "${BLUE}[3/5] Installing files...${NC}"

# Copy monitor script
cp "$SCRIPT_DIR/auto-continue-monitor.js" "$MONITOR_FILE"
chmod +x "$MONITOR_FILE"
echo -e "  ${GREEN}✓${NC} Installed monitor script to $MONITOR_FILE"

# Create signal file
touch "$SIGNAL_FILE"
echo -e "  ${GREEN}✓${NC} Created signal file at $SIGNAL_FILE"

echo ""
echo -e "${BLUE}[4/5] Configuring hooks...${NC}"

# Backup existing settings
if [[ -f "$SETTINGS_FILE" ]]; then
    BACKUP_FILE="$SETTINGS_FILE.backup.$(date +%Y%m%d%H%M%S)"
    cp "$SETTINGS_FILE" "$BACKUP_FILE"
    echo -e "  ${GREEN}✓${NC} Backed up settings to $BACKUP_FILE"
fi

# Hooks configuration
HOOKS_CONFIG='
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "echo '"'"'{\"event\":\"api_error\",\"error\":\"rate_limit\",\"status_code\":429,\"timestamp\":\"'"'"'$(date -Iseconds)'"'"'\"}'"'"' >> ~/.claude/auto-continue-signal.jsonl",
            "async": true
          }
        ]
      },
      {
        "matcher": "server_error",
        "hooks": [
          {
            "type": "command",
            "command": "echo '"'"'{\"event\":\"api_error\",\"error\":\"server_error\",\"status_code\":500,\"timestamp\":\"'"'"'$(date -Iseconds)'"'"'\"}'"'"' >> ~/.claude/auto-continue-signal.jsonl",
            "async": true
          }
        ]
      },
      {
        "matcher": "server_overload",
        "hooks": [
          {
            "type": "command",
            "command": "echo '"'"'{\"event\":\"api_error\",\"error\":\"server_overload\",\"status_code\":529,\"timestamp\":\"'"'"'$(date -Iseconds)'"'"'\"}'"'"' >> ~/.claude/auto-continue-signal.jsonl",
            "async": true
          }
        ]
      },
      {
        "matcher": "unknown",
        "hooks": [
          {
            "type": "command",
            "command": "echo '"'"'{\"event\":\"api_error\",\"error\":\"unknown\",\"status_code\":0,\"timestamp\":\"'"'"'$(date -Iseconds)'"'"'\"}'"'"' >> ~/.claude/auto-continue-signal.jsonl",
            "async": true
          }
        ]
      }
    ]'

if $HAS_JQ; then
    # Use jq to merge hooks
    if [[ ! -f "$SETTINGS_FILE" ]] || [[ ! -s "$SETTINGS_FILE" ]]; then
        echo '{}' > "$SETTINGS_FILE"
    fi

    # Create temp file with hooks
    TEMP_HOOKS=$(mktemp)
    echo "{\"hooks\": {$HOOKS_CONFIG}}" > "$TEMP_HOOKS"

    # Merge
    jq -s '.[0] * .[1]' "$SETTINGS_FILE" "$TEMP_HOOKS" > "$SETTINGS_FILE.tmp"
    mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    rm "$TEMP_HOOKS"

    echo -e "  ${GREEN}✓${NC} Hooks configured (using jq)"
else
    # Manual merge
    if [[ ! -f "$SETTINGS_FILE" ]] || [[ ! -s "$SETTINGS_FILE" ]]; then
        # Create new settings file
        cat > "$SETTINGS_FILE" << EOF
{
  "hooks": {$HOOKS_CONFIG
  }
}
EOF
        echo -e "  ${GREEN}✓${NC} Created new settings file with hooks"
    else
        echo -e "  ${YELLOW}!${NC} jq not found, please manually add hooks to $SETTINGS_FILE"
        echo ""
        echo -e "${YELLOW}Add this to your settings.json under \"hooks\":${NC}"
        echo "$HOOKS_CONFIG"
    fi
fi

echo ""
echo -e "${BLUE}[5/5] Creating launcher script...${NC}"

# Create launcher script for easy startup
LAUNCHER="$SETTINGS_DIR/continue-claude.sh"
cat > "$LAUNCHER" << 'LAUNCHER_EOF'
#!/bin/bash
# Continue Claude Monitor Launcher
node ~/.claude/auto-continue-monitor.js "$@"
LAUNCHER_EOF
chmod +x "$LAUNCHER"
echo -e "  ${GREEN}✓${NC} Created launcher at $LAUNCHER"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                    ✓ Installation Complete!                  ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Usage:${NC}"
echo ""
echo -e "  ${YELLOW}1.${NC} Start the monitor in a separate terminal:"
echo -e "     ${BLUE}node ~/.claude/auto-continue-monitor.js${NC}"
echo ""
echo -e "     Or with custom options:"
echo -e "     ${BLUE}node ~/.claude/auto-continue-monitor.js --message \"继续\" --wait-after-error 8${NC}"
echo ""
echo -e "  ${YELLOW}2.${NC} Start Claude Code:"
echo -e "     ${BLUE}claude${NC}"
echo ""
echo -e "  ${YELLOW}3.${NC} When API errors occur, the monitor will automatically"
echo -e "     send \"继续\" after waiting for retries to complete."
echo ""
echo -e "${CYAN}Options:${NC}"
echo -e "  --message, -m       Continue message (default: 继续)"
echo -e "  --cooldown, -c      Cooldown between continues in seconds (default: 15)"
echo -e "  --wait-after-error  Seconds to wait after error (default: 5)"
echo -e "  --max-retries       Max auto-continues per error type (default: 5)"
echo -e "  --whitelist, -w     Comma-separated error types to skip"
echo -e "                      (default: authentication_failed,invalid_request)"
echo -e "  --verbose, -v       Enable verbose logging"
echo ""
echo -e "${CYAN}View help:${NC}"
echo -e "  ${BLUE}node ~/.claude/auto-continue-monitor.js --help${NC}"
echo ""
