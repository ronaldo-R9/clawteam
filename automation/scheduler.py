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

        current_codes = {
            item.code for item in findings if item.severity.value == "P1"
        }
        if not current_codes:
            return False

        consecutive = 1
        for previous in reversed(self.ctx.monitor_history):
            previous_codes = {
                item.code for item in previous.findings if item.severity.value == "P1"
            }
            if current_codes & previous_codes:
                consecutive += 1
                if consecutive >= DEFAULTS.inbox_growth_consecutive_ticks:
                    return True
                continue
            break
        return False
