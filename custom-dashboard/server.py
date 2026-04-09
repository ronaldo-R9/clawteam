"""Custom ClawTeam Dashboard Server.

Extends the original board server with:
- Agent logs via tmux capture-pane (real-time terminal output)
- Horizontal Agent Registry layout
- Selectable agent log viewer (single or all-agents side-by-side)

Usage:
    python server.py <team-name> [--host 127.0.0.1] [--port 8081] [--interval 2]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# Import from clawteam
from clawteam.board.collector import BoardCollector


_STATIC_DIR = Path(__file__).parent / "static"


def capture_agent_logs(team_name: str, agent_name: str, lines: int = 200) -> str:
    """Capture tmux pane output for a single agent.

    Uses `tmux capture-pane` to grab the visible terminal content.
    """
    session = f"clawteam-{team_name}"
    target = f"{session}:{agent_name}"

    try:
        result = subprocess.run(
            ["tmux", "capture-pane", "-p", "-t", target, "-S", f"-{lines}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout
        return f"[No tmux pane found for {agent_name}]"
    except subprocess.TimeoutExpired:
        return f"[Timeout capturing logs for {agent_name}]"
    except FileNotFoundError:
        return "[tmux not installed]"
    except Exception as e:
        return f"[Error: {e}]"


def list_tmux_agents(team_name: str) -> list[str]:
    """List all agent window names in the team's tmux session."""
    session = f"clawteam-{team_name}"
    try:
        result = subprocess.run(
            ["tmux", "list-windows", "-t", session, "-F", "#{window_name}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return [w.strip() for w in result.stdout.strip().splitlines() if w.strip()]
        return []
    except Exception:
        return []


class SnapshotCache:
    """Thread-safe TTL cache for data snapshots."""

    def __init__(self, ttl: float):
        self.ttl = ttl
        self._entries: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def get(self, key: str, loader) -> object:
        with self._lock:
            entry = self._entries.get(key)
            if entry and time.monotonic() - entry[0] < self.ttl:
                return entry[1]

        data = loader()
        loaded_at = time.monotonic()
        with self._lock:
            self._entries[key] = (loaded_at, data)
        return data


class CustomDashboardHandler(BaseHTTPRequestHandler):
    """HTTP handler for the custom dashboard."""

    collector: BoardCollector
    default_team: str = ""
    interval: float = 2.0
    team_cache: SnapshotCache
    log_cache: SnapshotCache

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/" or path == "/index.html":
            self._serve_static("index.html", "text/html")
        elif path == "/api/overview":
            self._serve_json(self.collector.collect_overview())
        elif path.startswith("/api/team/"):
            rest = path[len("/api/team/"):].strip("/")
            if rest.endswith("/task"):
                # POST-only route, fall through
                self.send_error(405, "Use POST for task creation")
                return
            team_name = rest
            if not team_name:
                self.send_error(400, "Team name required")
                return
            self._serve_team(team_name)
        elif path.startswith("/api/events/"):
            team_name = path[len("/api/events/"):].strip("/")
            if not team_name:
                self.send_error(400, "Team name required")
                return
            self._serve_sse(team_name)
        elif path.startswith("/api/logs/"):
            rest = path[len("/api/logs/"):].strip("/")
            parts = rest.split("/", 1)
            team_name = parts[0]
            agent_name = parts[1] if len(parts) > 1 else None
            if not team_name:
                self.send_error(400, "Team name required")
                return
            self._serve_logs(team_name, agent_name)
        elif path.startswith("/api/log-stream/"):
            team_name = path[len("/api/log-stream/"):].strip("/")
            if not team_name:
                self.send_error(400, "Team name required")
                return
            agent_filter = query.get("agent", [None])[0]
            self._serve_log_sse(team_name, agent_filter)
        else:
            self.send_error(404)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path.startswith("/api/team/") and path.endswith("/task"):
            parts = path.strip("/").split("/")
            if len(parts) == 4 and parts[3] == "task":
                team_name = parts[2]
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length).decode("utf-8")
                try:
                    payload = json.loads(body)
                    from clawteam.team.tasks import TaskStore
                    store = TaskStore(team_name)
                    task = store.create(
                        subject=payload.get("subject", ""),
                        description=payload.get("description", ""),
                        owner=payload.get("owner", ""),
                    )
                    self._serve_json({"status": "ok", "task_id": task.id})
                except Exception as e:
                    self.send_error(400, str(e))
                return
        self.send_error(404)

    def _serve_static(self, filename: str, content_type: str):
        filepath = _STATIC_DIR / filename
        if not filepath.exists():
            self.send_error(404, f"Static file not found: {filename}")
            return
        content = filepath.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _serve_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _serve_team(self, team_name: str):
        try:
            data = self.collector.collect_team(team_name)
            self._serve_json(data)
        except ValueError as e:
            body = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def _serve_logs(self, team_name: str, agent_name: str | None):
        """Serve agent logs as JSON."""
        if agent_name:
            log_text = capture_agent_logs(team_name, agent_name)
            self._serve_json({
                "agent": agent_name,
                "log": log_text,
            })
        else:
            # All agents
            tmux_agents = list_tmux_agents(team_name)
            logs = {}
            for agent in tmux_agents:
                logs[agent] = capture_agent_logs(team_name, agent)
            self._serve_json({
                "agents": tmux_agents,
                "logs": logs,
            })

    def _serve_sse(self, team_name: str):
        """SSE stream for team data (same as original)."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            while True:
                try:
                    data = self.team_cache.get(
                        team_name,
                        lambda: self.collector.collect_team(team_name),
                    )
                except ValueError as e:
                    data = {"error": str(e)}
                payload = json.dumps(data, ensure_ascii=False)
                self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                self.wfile.flush()
                time.sleep(self.interval)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def _serve_log_sse(self, team_name: str, agent_filter: str | None):
        """SSE stream for agent logs."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            while True:
                tmux_agents = list_tmux_agents(team_name)
                if agent_filter and agent_filter != "all":
                    agents_to_capture = [agent_filter] if agent_filter in tmux_agents else []
                else:
                    agents_to_capture = tmux_agents

                logs = {}
                for agent in agents_to_capture:
                    logs[agent] = capture_agent_logs(team_name, agent)

                payload = json.dumps({
                    "agents": tmux_agents,
                    "logs": logs,
                    "filter": agent_filter or "all",
                }, ensure_ascii=False)
                self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                self.wfile.flush()
                time.sleep(self.interval)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def log_message(self, format, *args):
        first = str(args[0]) if args else ""
        if "/api/events/" not in first and "/api/log-stream/" not in first:
            super().log_message(format, *args)


def serve(
    host: str = "127.0.0.1",
    port: int = 8081,
    default_team: str = "",
    interval: float = 2.0,
):
    """Start the custom dashboard server."""
    collector = BoardCollector()
    CustomDashboardHandler.collector = collector
    CustomDashboardHandler.default_team = default_team
    CustomDashboardHandler.interval = interval
    CustomDashboardHandler.team_cache = SnapshotCache(ttl=interval)
    CustomDashboardHandler.log_cache = SnapshotCache(ttl=max(1.0, interval / 2))

    server = ThreadingHTTPServer((host, port), CustomDashboardHandler)
    print(f"✦ ClawTeam Custom Dashboard")
    print(f"  → http://{host}:{port}/")
    if default_team:
        print(f"  → Default team: {default_team}")
    print(f"  → Refresh interval: {interval}s")
    print(f"  → Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n✦ Dashboard stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ClawTeam Custom Dashboard")
    parser.add_argument("team", nargs="?", default="", help="Default team name")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("-p", "--port", type=int, default=8081, help="Port (default: 8081)")
    parser.add_argument("--interval", type=float, default=2.0, help="Refresh interval in seconds")
    args = parser.parse_args()
    serve(host=args.host, port=args.port, default_team=args.team, interval=args.interval)
