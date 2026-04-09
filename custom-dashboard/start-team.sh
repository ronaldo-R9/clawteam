#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# ClawTeam Unified Launcher
# Starts the custom dashboard + launches a clawteam team together.
#
# Usage:
#   ./start-team.sh --goal "目标描述" --team my-team --repo /path/to/repo
#   ./start-team.sh --goal "Build a web app" --team snake-pvp --repo ~/project --port 8081
#   ./start-team.sh --dashboard-only --team existing-team
#
# Options:
#   --goal, -g        Team goal / mission description (required unless --dashboard-only)
#   --team, -t        Team name (required)
#   --repo, -r        Repository path for the team (required unless --dashboard-only)
#   --port, -p        Dashboard port (default: 8081)
#   --template        ClawTeam template (default: breakthrough-loop)
#   --command         Agent CLI command (default: codex)
#   --dashboard-only  Only start the dashboard (team already running)
#   --no-dashboard    Only launch the team (no dashboard)
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Defaults
DASHBOARD_PORT=8081
TEMPLATE="breakthrough-loop"
COMMAND="codex"
DASHBOARD_ONLY=false
NO_DASHBOARD=false
GOAL=""
TEAM=""
REPO=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --goal|-g)        GOAL="$2"; shift 2 ;;
        --team|-t)        TEAM="$2"; shift 2 ;;
        --repo|-r)        REPO="$2"; shift 2 ;;
        --port|-p)        DASHBOARD_PORT="$2"; shift 2 ;;
        --template)       TEMPLATE="$2"; shift 2 ;;
        --command)        COMMAND="$2"; shift 2 ;;
        --dashboard-only) DASHBOARD_ONLY=true; shift ;;
        --no-dashboard)   NO_DASHBOARD=true; shift ;;
        --help|-h)
            head -20 "$0" | grep '^#' | sed 's/^# \?//'
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Validate
if [ -z "$TEAM" ]; then
    echo "Error: --team is required"
    echo "Run with --help for usage"
    exit 1
fi

if [ "$DASHBOARD_ONLY" = false ] && [ "$NO_DASHBOARD" = false ]; then
    if [ -z "$GOAL" ]; then
        echo "Error: --goal is required (or use --dashboard-only)"
        exit 1
    fi
    if [ -z "$REPO" ]; then
        echo "Error: --repo is required (or use --dashboard-only)"
        exit 1
    fi
fi

DASHBOARD_PID=""

cleanup() {
    echo ""
    echo "✦ Shutting down..."
    if [ -n "$DASHBOARD_PID" ] && kill -0 "$DASHBOARD_PID" 2>/dev/null; then
        echo "  → Stopping dashboard (PID $DASHBOARD_PID)"
        kill "$DASHBOARD_PID" 2>/dev/null
    fi
    echo "  → Done. Team tmux session (if any) is still running."
    echo "    Use 'clawteam board attach $TEAM' to reattach."
}
trap cleanup EXIT

# ── Start Dashboard ──────────────────────────────────
if [ "$NO_DASHBOARD" = false ]; then
    # Check if port is already in use
    if lsof -i ":$DASHBOARD_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "⚠  Port $DASHBOARD_PORT is already in use."
        echo "   Dashboard may already be running. Skipping dashboard start."
    else
        echo "✦ Starting Custom Dashboard on port $DASHBOARD_PORT..."
        python3 "$SCRIPT_DIR/server.py" "$TEAM" --port "$DASHBOARD_PORT" &
        DASHBOARD_PID=$!
        sleep 1

        if kill -0 "$DASHBOARD_PID" 2>/dev/null; then
            echo "  ✓ Dashboard running: http://127.0.0.1:$DASHBOARD_PORT/"
        else
            echo "  ✗ Dashboard failed to start"
            DASHBOARD_PID=""
        fi
    fi
fi

# ── Launch Team ──────────────────────────────────────
if [ "$DASHBOARD_ONLY" = false ]; then
    echo ""
    echo "✦ Launching ClawTeam..."
    echo "  Template : $TEMPLATE"
    echo "  Team     : $TEAM"
    echo "  Goal     : $GOAL"
    echo "  Repo     : $REPO"
    echo "  Command  : $COMMAND"
    echo ""

    clawteam launch "$TEMPLATE" \
        -g "$GOAL" \
        -t "$TEAM" \
        --repo "$REPO" \
        --command "$COMMAND" \
        -w
else
    echo ""
    echo "✦ Dashboard-only mode. Team '$TEAM' should already be running."
    echo "  Dashboard: http://127.0.0.1:$DASHBOARD_PORT/"
    echo ""
    echo "  Press Ctrl+C to stop the dashboard."

    # Keep running until Ctrl+C
    if [ -n "$DASHBOARD_PID" ]; then
        wait "$DASHBOARD_PID"
    else
        echo "  (No dashboard process to wait for)"
    fi
fi
