"""Core data models for the external breakthrough-loop orchestrator."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class State(str, Enum):
    INIT = "INIT"
    PRECHECK = "PRECHECK"
    LAUNCH = "LAUNCH"
    WARMUP_OBSERVE = "WARMUP_OBSERVE"
    ACTIVE_MONITOR = "ACTIVE_MONITOR"
    SUCCESS_HOLD = "SUCCESS_HOLD"
    STOP_SUCCESS = "STOP_SUCCESS"
    DONE = "DONE"
    FAILURE_DETECTED = "FAILURE_DETECTED"
    SNAPSHOT_PRE_STOP = "SNAPSHOT_PRE_STOP"
    GRACEFUL_STOP = "GRACEFUL_STOP"
    SNAPSHOT_POST_STOP = "SNAPSHOT_POST_STOP"
    DIAGNOSE = "DIAGNOSE"
    PATCH_PLAN = "PATCH_PLAN"
    APPLY_PATCH = "APPLY_PATCH"
    VALIDATE_PATCH = "VALIDATE_PATCH"
    CLEANUP = "CLEANUP"
    RELAUNCH_DECISION = "RELAUNCH_DECISION"
    ESCALATE_HUMAN = "ESCALATE_HUMAN"
    FAILED = "FAILED"


class Severity(str, Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"


class DiagnosisVerdict(str, Enum):
    CONFIG_ISSUE = "config_issue"
    MODEL_LIMIT = "model_limit"
    FRAMEWORK_BUG = "framework_bug"
    INCONCLUSIVE = "inconclusive"


class SchedulerDecision(str, Enum):
    CONTINUE_WATCH = "continue_watch"
    STOP_NOW = "stop_now"
    ESCALATE_HUMAN = "escalate_human"


@dataclass(frozen=True)
class Defaults:
    scheduler_model: str = "gpt-5.4"
    scheduler_reasoning_effort: str = "xhigh"
    team_model: str = "gpt-5.4"
    team_reasoning_effort: str = "medium"
    diagnosis_model: str = "opus-4.6"
    diagnosis_reasoning_effort: str = "high"
    outer_max_attempts: int = 3
    inner_max_rounds: int = 3
    silent_timeout_seconds: int = 300
    acknowledged_busy_timeout_seconds: int = 900
    warmup_window_seconds: int = 120
    success_hold_min_seconds: int = 180
    success_hold_max_seconds: int = 300
    inbox_growth_consecutive_ticks: int = 2
    inbox_growth_total_threshold: int = 3
    monitor_poll_interval_seconds: int = 30
    monitor_max_ticks: int = 40
    dashboard_port: int = 8081
    dashboard_python: str = "/opt/anaconda3/envs/vnpy/bin/python3.13"


DEFAULTS = Defaults()


WHITELIST_PATTERNS: list[str] = [
    "templates/breakthrough-loop.toml",
    "skills/clawteam-breakthrough-loop/assets/breakthrough-loop.toml",
    "skills/clawteam-breakthrough-loop/references/*.md",
    "automation/*.py",
    "automation/prompts/*",
    "automation/schemas/*",
]


@dataclass
class Finding:
    code: str
    severity: Severity
    summary: str
    reason: str = ""
    evidence: list[str] = field(default_factory=list)
    owner: str = ""

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["severity"] = self.severity.value
        return data


@dataclass
class MemberSnapshot:
    name: str
    role: str = ""
    lifecycle_state: str = ""
    task_status: str = ""
    inbox_unread: int = 0
    last_event_at: str = ""
    confirmed_watch: bool = False
    has_new_activity: bool = False


@dataclass
class MonitorSnapshot:
    tick_id: str
    created_at: str = field(default_factory=utc_now_iso)
    phase: str = "monitor"
    members: dict[str, MemberSnapshot] = field(default_factory=dict)
    protocol_flags: dict[str, bool] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    source_files: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "tick_id": self.tick_id,
            "created_at": self.created_at,
            "phase": self.phase,
            "members": {
                name: asdict(member) for name, member in self.members.items()
            },
            "protocol_flags": self.protocol_flags,
            "notes": self.notes,
            "findings": [item.to_dict() for item in self.findings],
            "source_files": self.source_files,
        }


@dataclass
class Problem:
    id: str
    severity: Severity
    component: str
    symptom: str
    root_cause: str
    evidence: list[str] = field(default_factory=list)
    proposed_fix_summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["severity"] = self.severity.value
        return data


@dataclass
class Patch:
    target_file: str
    action: str
    anchor: str
    old_sha256: str = ""
    new_text: str = ""


@dataclass
class RelaunchInfo:
    recommended: bool = True
    change_team_name: bool = True
    reasoning_effort: str = DEFAULTS.team_reasoning_effort
    notes: list[str] = field(default_factory=list)


@dataclass
class HumanEscalation:
    required: bool = False
    reason: str = ""


@dataclass
class ExecutionReport:
    run_id: str
    attempt_id: str
    verdict: DiagnosisVerdict
    confidence: float = 0.0
    problems: list[Problem] = field(default_factory=list)
    patches: list[Patch] = field(default_factory=list)
    relaunch: RelaunchInfo = field(default_factory=RelaunchInfo)
    human_escalation: HumanEscalation = field(default_factory=HumanEscalation)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "attempt_id": self.attempt_id,
            "verdict": self.verdict.value,
            "confidence": self.confidence,
            "problems": [item.to_dict() for item in self.problems],
            "patches": [asdict(item) for item in self.patches],
            "relaunch": asdict(self.relaunch),
            "human_escalation": asdict(self.human_escalation),
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, ensure_ascii=False)


@dataclass
class PatchPlan:
    attempt_id: str
    safe_to_apply: bool
    whitelist_only: bool
    patches: list[Patch] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "attempt_id": self.attempt_id,
            "safe_to_apply": self.safe_to_apply,
            "whitelist_only": self.whitelist_only,
            "patches": [asdict(item) for item in self.patches],
        }


@dataclass
class SchedulerDecisionRecord:
    attempt_id: str
    tick_id: str
    scheduler_model: str
    scheduler_reasoning_effort: str
    inputs: list[str]
    decision: SchedulerDecision
    confidence: float
    reason: str
    next_state: str

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["decision"] = self.decision.value
        return data


@dataclass
class AttemptManifest:
    run_id: str
    attempt_id: str
    team_name: str
    repo_path: str
    template_name: str = "breakthrough-loop"
    template_hash: str = ""
    team_model: str = DEFAULTS.team_model
    team_reasoning_effort: str = DEFAULTS.team_reasoning_effort
    scheduler_model: str = DEFAULTS.scheduler_model
    scheduler_reasoning_effort: str = DEFAULTS.scheduler_reasoning_effort
    diagnosis_model: str = DEFAULTS.diagnosis_model
    diagnosis_reasoning_effort: str = DEFAULTS.diagnosis_reasoning_effort
    inner_max_rounds: int = DEFAULTS.inner_max_rounds
    outer_max_attempts: int = DEFAULTS.outer_max_attempts
    started_at: str = ""
    stopped_at: str = ""
    status: str = "pending"
    failure_reason_code: str = ""

    @staticmethod
    def compute_template_hash(template_path: Path) -> str:
        digest = hashlib.sha256(template_path.read_bytes()).hexdigest()
        return f"sha256:{digest}"

    def mark_started(self) -> None:
        self.started_at = utc_now_iso()
        self.status = "running"

    def mark_stopped(self, reason_code: str = "", success: bool = False) -> None:
        self.stopped_at = utc_now_iso()
        self.status = "success_ready_for_human_validation" if success else "failed"
        self.failure_reason_code = reason_code

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RunContext:
    repo_path: Path
    base_team_name: str
    goal: str = ""
    template_name: str = "breakthrough-loop"
    state: State = State.INIT
    current_attempt: int = 0
    max_attempts: int = DEFAULTS.outer_max_attempts
    execution_enabled: bool = True
    run_id: str = ""
    manifest: AttemptManifest | None = None
    latest_snapshot: MonitorSnapshot | None = None
    latest_scheduler_decision: SchedulerDecisionRecord | None = None
    latest_report: ExecutionReport | None = None
    latest_patch_plan: PatchPlan | None = None
    monitor_history: list[MonitorSnapshot] = field(default_factory=list)
    scheduler_history: list[SchedulerDecisionRecord] = field(default_factory=list)
    dashboard_pid: int | None = None
    launch_pid: int | None = None

    def __post_init__(self) -> None:
        self.repo_path = self.repo_path.resolve()
        if not self.run_id:
            self.run_id = self.base_team_name

    @property
    def automation_dir(self) -> Path:
        return self.repo_path / "automation"

    @property
    def docs_dir(self) -> Path:
        return self.repo_path / "docs"

    @property
    def prompts_dir(self) -> Path:
        return self.automation_dir / "prompts"

    @property
    def schemas_dir(self) -> Path:
        return self.automation_dir / "schemas"

    @property
    def template_path(self) -> Path:
        return self.repo_path / "templates" / f"{self.template_name}.toml"

    @property
    def dashboard_server_path(self) -> Path:
        return self.repo_path / "custom-dashboard" / "server.py"

    @property
    def run_root(self) -> Path:
        return self.repo_path / "runs" / self.base_team_name

    @property
    def attempts_root(self) -> Path:
        return self.run_root / "attempts"

    @property
    def attempt_id(self) -> str:
        return f"attempt-{self.current_attempt:03d}"

    @property
    def team_name(self) -> str:
        return f"{self.base_team_name}-{self.attempt_id}"

    @property
    def attempt_dir(self) -> Path:
        return self.attempts_root / self.attempt_id

    def ensure_attempt_dirs(self) -> None:
        self.attempt_dir.mkdir(parents=True, exist_ok=True)
        (self.attempt_dir / "snapshot-pre-stop").mkdir(parents=True, exist_ok=True)
        (self.attempt_dir / "snapshot-post-stop").mkdir(parents=True, exist_ok=True)

    def new_manifest(self) -> AttemptManifest:
        manifest = AttemptManifest(
            run_id=self.run_id,
            attempt_id=self.attempt_id,
            team_name=self.team_name,
            repo_path=str(self.repo_path),
            template_name=self.template_name,
            template_hash=AttemptManifest.compute_template_hash(self.template_path),
        )
        manifest.mark_started()
        self.manifest = manifest
        return manifest


def write_json_file(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
