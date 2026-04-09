"""Scheduler prompt rendering and decision scaffolding."""

from __future__ import annotations

import json

try:
    from .models import (
        DEFAULTS,
        Finding,
        MonitorSnapshot,
        RunContext,
        SchedulerDecision,
        SchedulerDecisionRecord,
    )
except ImportError:
    from models import (
        DEFAULTS,
        Finding,
        MonitorSnapshot,
        RunContext,
        SchedulerDecision,
        SchedulerDecisionRecord,
    )


class SchedulerClient:
    def __init__(self, ctx: RunContext) -> None:
        self.ctx = ctx
        self.prompt_path = ctx.prompts_dir / "scheduler_decision.md"

    def render_prompt(
        self,
        snapshot: MonitorSnapshot,
        findings: list[Finding],
    ) -> str:
        template = self.prompt_path.read_text(encoding="utf-8")
        payload = {
            "run_id": self.ctx.run_id,
            "attempt_id": self.ctx.attempt_id,
            "team_name": self.ctx.team_name,
            "snapshot": snapshot.to_dict(),
            "findings": [item.to_dict() for item in findings],
        }
        return template.replace("{{PAYLOAD_JSON}}", json.dumps(payload, indent=2, ensure_ascii=False))

    def fallback_decision(
        self,
        snapshot: MonitorSnapshot,
        findings: list[Finding],
    ) -> SchedulerDecisionRecord:
        decision = SchedulerDecision.CONTINUE_WATCH
        confidence = 0.6
        reason = "No blocking finding detected in fallback scheduler."
        next_state = "ACTIVE_MONITOR"

        if any(item.severity.value == "P0" for item in findings):
            decision = SchedulerDecision.STOP_NOW
            confidence = 0.95
            reason = "At least one P0 finding was detected by deterministic rules."
            next_state = "FAILURE_DETECTED"
        elif self._should_stop_for_p1(snapshot, findings):
            decision = SchedulerDecision.STOP_NOW
            confidence = 0.75
            reason = "P1 findings persisted across consecutive monitor ticks and should be escalated."
            next_state = "FAILURE_DETECTED"

        return SchedulerDecisionRecord(
            attempt_id=self.ctx.attempt_id,
            tick_id=snapshot.tick_id,
            scheduler_model=DEFAULTS.scheduler_model,
            scheduler_reasoning_effort=DEFAULTS.scheduler_reasoning_effort,
            inputs=list(snapshot.source_files.keys()),
            decision=decision,
            confidence=confidence,
            reason=reason,
            next_state=next_state,
        )

    def parse_model_output(self, payload: str) -> SchedulerDecisionRecord:
        data = json.loads(payload)
        return SchedulerDecisionRecord(
            attempt_id=data["attempt_id"],
            tick_id=data["tick_id"],
            scheduler_model=data["scheduler_model"],
            scheduler_reasoning_effort=data["scheduler_reasoning_effort"],
            inputs=data["inputs"],
            decision=SchedulerDecision(data["decision"]),
            confidence=float(data["confidence"]),
            reason=data["reason"],
            next_state=data["next_state"],
        )

    def _should_stop_for_p1(
        self,
        snapshot: MonitorSnapshot,
        findings: list[Finding],
    ) -> bool:
        if snapshot.phase == "warmup":
            return False

        # When protocol is progressing and only one gate role is down,
        # exclude its idle/completed P1s from the consecutive check.
        # These are structural (expected) and not degradation signals.
        _STRUCTURAL_SUFFIXES = ("_idle_before_shutdown", "_completed_before_shutdown")
        protocol_progressing = (
            snapshot.protocol_flags.get("kickoffs_sent", False)
            and snapshot.protocol_flags.get("worker_revision_submitted", False)
        )

        current_codes = {
            item.code for item in findings if item.severity.value == "P1"
        }
        if protocol_progressing:
            current_codes = {
                code for code in current_codes
                if not any(code.endswith(s) for s in _STRUCTURAL_SUFFIXES)
            }
        if not current_codes:
            return False

        consecutive = 1
        for previous in reversed(self.ctx.monitor_history):
            previous_codes = {
                item.code for item in previous.findings if item.severity.value == "P1"
            }
            if protocol_progressing:
                previous_codes = {
                    code for code in previous_codes
                    if not any(code.endswith(s) for s in _STRUCTURAL_SUFFIXES)
                }
            if current_codes & previous_codes:
                consecutive += 1
                if consecutive >= DEFAULTS.inbox_growth_consecutive_ticks:
                    return True
                continue
            break
        return False
