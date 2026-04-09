"""Heuristic derivation of protocol flags from clawteam event files."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Iterable

GATE_ROLES = {"worker", "explorer", "reviewer", "verifier"}
REVISION_RE = re.compile(r"\b(?:r|rb-)?([0-9]+)\b", re.IGNORECASE)


def clawteam_home() -> Path:
    custom = os.environ.get("CLAWTEAM_HOME")
    if custom:
        return Path(custom).expanduser()
    return Path.home() / ".clawteam"


def events_dir_for(team_name: str) -> Path:
    return clawteam_home() / "teams" / team_name / "events"


def _flatten_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
        return
    if isinstance(value, dict):
        for nested in value.values():
            yield from _flatten_strings(nested)
        return
    if isinstance(value, list):
        for nested in value:
            yield from _flatten_strings(nested)


def _load_event(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _sender(event: dict[str, Any]) -> str:
    for key in ("sender", "from", "agent", "agentName", "agent_name", "source"):
        value = event.get(key)
        if isinstance(value, str):
            return value.lower()
        if isinstance(value, dict):
            nested = value.get("name") or value.get("agent") or value.get("agentName")
            if isinstance(nested, str):
                return nested.lower()
    return ""


def _recipients(event: dict[str, Any]) -> set[str]:
    found: set[str] = set()
    for key in ("recipient", "to", "recipients", "targets"):
        value = event.get(key)
        if isinstance(value, str):
            found.add(value.lower())
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    found.add(item.lower())
                elif isinstance(item, dict):
                    name = item.get("name") or item.get("agent") or item.get("agentName")
                    if isinstance(name, str):
                        found.add(name.lower())
        elif isinstance(value, dict):
            name = value.get("name") or value.get("agent") or value.get("agentName")
            if isinstance(name, str):
                found.add(name.lower())
    return found


def _text_blob(event: dict[str, Any]) -> str:
    return "\n".join(_flatten_strings(event)).lower()


def _extract_revision_id(text: str) -> str | None:
    markers = [
        re.search(r"修订编号[:：]\s*([A-Za-z0-9_-]+)", text, re.IGNORECASE),
        re.search(r"revision id[:：]?\s*([A-Za-z0-9_-]+)", text, re.IGNORECASE),
        re.search(r"对应修订[:：]\s*([A-Za-z0-9_-]+)", text, re.IGNORECASE),
    ]
    for match in markers:
        if match:
            return match.group(1)
    generic = REVISION_RE.search(text)
    if generic:
        return generic.group(0)
    return None


def derive_protocol_flags(team_name: str, event_dir: Path | None = None) -> dict[str, bool]:
    event_dir = event_dir or events_dir_for(team_name)
    flags = {
        "kickoffs_sent": False,
        "worker_revision_submitted": False,
        "gate_revision_matched": False,
        "supervisor_summary_published": False,
        "success_hold_clean": False,
    }
    if not event_dir.exists():
        return flags

    kickoff_targets: set[str] = set()
    worker_revisions: set[str] = set()
    reviewer_revisions: set[str] = set()
    verifier_revisions: set[str] = set()

    for path in sorted(event_dir.glob("*.json")):
        event = _load_event(path)
        if event is None:
            continue
        sender = _sender(event)
        recipients = _recipients(event)
        text = _text_blob(event)

        if sender == "supervisor":
            if ("kickoff" in text or "启动说明" in text or "请查收各自的启动说明" in text) and recipients:
                kickoff_targets.update(recipients & GATE_ROLES)
                if "worker" in recipients:
                    kickoff_targets.add("worker")
            if "状态摘要" in text or "state summary" in text or "revision brief" in text:
                flags["supervisor_summary_published"] = True
            if "success hold" in text or "success_ready_for_human_validation" in text:
                flags["success_hold_clean"] = True

        if sender == "worker":
            revision = _extract_revision_id(text)
            if revision:
                worker_revisions.add(revision)
                flags["worker_revision_submitted"] = True

        if sender == "reviewer":
            revision = _extract_revision_id(text)
            if revision and ("approved" in text or "changes_required" in text):
                reviewer_revisions.add(revision)

        if sender == "verifier":
            revision = _extract_revision_id(text)
            if revision and ("pass" in text or "fail" in text or "unverified" in text):
                verifier_revisions.add(revision)

    flags["kickoffs_sent"] = {"worker", "explorer", "reviewer", "verifier"}.issubset(kickoff_targets)
    flags["gate_revision_matched"] = bool(worker_revisions & reviewer_revisions & verifier_revisions)
    return flags
