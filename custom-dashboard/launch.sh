#!/usr/bin/env bash
# Launch the custom ClawTeam dashboard.
#
# Usage:
#   ./launch.sh <team-name> [port]
#
# Examples:
#   ./launch.sh snake-pvp-codex54-medium
#   ./launch.sh snake-pvp-codex54-medium 9090

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEAM="${1:-}"
PORT="${2:-8081}"

if [ -z "$TEAM" ]; then
    echo "Usage: $0 <team-name> [port]"
    echo ""
    echo "Available teams:"
    clawteam team discover 2>/dev/null || echo "  (clawteam not found or no teams)"
    exit 1
fi

echo "✦ Launching ClawTeam Custom Dashboard"
echo "  Team: $TEAM"
echo "  Port: $PORT"
echo ""

python3 "$SCRIPT_DIR/server.py" "$TEAM" --port "$PORT"
