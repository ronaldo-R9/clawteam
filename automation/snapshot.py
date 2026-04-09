"""Snapshot layout and normalization helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

try:
    from .event_parser import derive_protocol_flags, events_dir_for
    from .models import MemberSnapshot, MonitorSnapshot, RunContext, write_json_file
except ImportError:
    from event_parser import derive_protocol_flags, events_dir_for
    from models import MemberSnapshot, MonitorSnapshot, RunContext, write_json_file


class SnapshotCollector:
    def __init__(self, ctx: RunContext) -> None:
        self.ctx = ctx

    def pre_stop_dir(self) -> Path:
        return self.ctx.attempt_dir / "snapshot-pre-stop"

    def post_stop_dir(self) -> Path:
        return self.ctx.attempt_dir / "snapshot-post-stop"

    def live_command_plan(self, team_name: str) -> dict[str, list[str]]:
        return {
            "board": ["clawteam", "--json", "board", "show", team_name],
            "team_status": ["clawteam", "--json", "team", "status", team_name],
            "tasks": ["clawteam", "--json", "task", "list", team_name],
            "inbox_supervisor": ["clawteam", "--json", "inbox", "peek", team_name, "--agent", "supervisor"],
            "inbox_worker": ["clawteam", "--json", "inbox", "peek", team_name, "--agent", "worker"],
            "inbox_explorer": ["clawteam", "--json", "inbox", "peek", team_name, "--agent", "explorer"],
            "inbox_reviewer": ["clawteam", "--json", "inbox", "peek", team_name, "--agent", "reviewer"],
            "inbox_verifier": ["clawteam", "--json", "inbox", "peek", team_name, "--agent", "verifier"],
            "events_dir": [str(events_dir_for(team_name))],
        }

    def normalize_monitor_snapshot(
        self,
        tick_id: str,
        team_name: str | None = None,
        board: dict[str, Any] | None = None,
        team_status: dict[str, Any] | None = None,
        tasks: list[dict[str, Any]] | None = None,
        inboxes: dict[str, dict[str, Any]] | None = None,
        protocol_flags: dict[str, bool] | None = None,
        phase: str = "monitor",
    ) -> MonitorSnapshot:
        board = board or {}
        team_status = team_status or {}
        tasks = tasks or []
        inboxes = inboxes or {}
        if protocol_flags is None and team_name:
            protocol_flags = derive_protocol_flags(team_name)
        protocol_flags = protocol_flags or {}

        status_by_owner: dict[str, str] = {}
        for task in tasks:
            owner = task.get("owner")
            status = str(task.get("status", ""))
            if not owner:
                continue
            current = status_by_owner.get(owner)
            if current == "in_progress":
                continue
            if status == "in_progress" or current is None:
                status_by_owner[owner] = status

        last_event_by_sender: dict[str, tuple[str, str]] = {}
        for event in board.get("messages", []):
            sender = event.get("from")
            timestamp = str(event.get("timestamp", ""))
            event_type = str(event.get("type", "message"))
            if sender:
                previous = last_event_by_sender.get(sender)
                if previous is None or timestamp >= previous[1]:
                    last_event_by_sender[sender] = (event_type, timestamp)

        members: dict[str, MemberSnapshot] = {}
        raw_members = board.get("members") or team_status.get("members") or []
        for raw in raw_members:
            name = raw.get("name") or raw.get("agentName") or raw.get("agent_name")
            if not name:
                continue
            latest_event = last_event_by_sender.get(name, ("", ""))
            inbox_payload = inboxes.get(name, {})
            members[name] = MemberSnapshot(
                name=name,
                role=raw.get("agentType", raw.get("type", raw.get("role", ""))),
                lifecycle_state=(
                    "idle"
                    if latest_event[0] == "idle"
                    else str(raw.get("lifecycleState", raw.get("lifecycle_state", "active")))
                ),
                task_status=status_by_owner.get(
                    name,
                    str(raw.get("taskStatus", raw.get("task_status", ""))),
                ),
                inbox_unread=int(
                    inbox_payload.get("count", raw.get("inboxCount", raw.get("unread", 0))) or 0
                ),
                last_event_at=latest_event[1] or str(
                    raw.get("lastEventAt", raw.get("last_event_at", raw.get("joinedAt", "")))
                ),
                confirmed_watch=any(
                    event.get("from") == name and "inbox watch" in str(event.get("content", "")).lower()
                    for event in board.get("messages", [])
                ),
                has_new_activity=False,
            )

        return MonitorSnapshot(
            tick_id=tick_id,
            phase=phase,
            members=members,
            protocol_flags=protocol_flags,
            source_files={
                "board.json": "board.json",
                "team_status.json": "team_status.json",
                "tasks.json": "tasks.json",
                "tasks_count": str(len(tasks)),
                "events_dir": str(events_dir_for(team_name)) if team_name else "",
                "inboxes": ",".join(sorted(inboxes)),
            },
        )

    def write_monitor_snapshot(self, path: Path, snapshot: MonitorSnapshot) -> None:
        write_json_file(path, snapshot.to_dict())

    def write_text(self, path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def write_json(self, path: Path, content: dict[str, Any]) -> None:
        write_json_file(path, content)

    def write_manifest(self) -> None:
        if self.ctx.manifest is None:
            raise RuntimeError("manifest has not been created")
        write_json_file(self.ctx.attempt_dir / "manifest.json", self.ctx.manifest.to_dict())

    def write_scheduler_decision(self) -> None:
        if self.ctx.latest_scheduler_decision is None:
            raise RuntimeError("scheduler decision has not been created")
        write_json_file(
            self.ctx.attempt_dir / "scheduler_decision.json",
            self.ctx.latest_scheduler_decision.to_dict(),
        )

    def write_execution_report(self) -> None:
        if self.ctx.latest_report is None:
            raise RuntimeError("execution report has not been created")
        write_json_file(
            self.ctx.attempt_dir / "execution_report.json",
            self.ctx.latest_report.to_dict(),
        )

    def write_patch_plan(self) -> None:
        if self.ctx.latest_patch_plan is None:
            raise RuntimeError("patch plan has not been created")
        write_json_file(
            self.ctx.attempt_dir / "patch_plan.json",
            self.ctx.latest_patch_plan.to_dict(),
        )

    def write_final_status(self, status: dict[str, Any]) -> None:
        write_json_file(self.ctx.attempt_dir / "final_status.json", status)

    def write_json_blob(self, path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
