"""Diagnosis prompt rendering and execution-report parsing."""

from __future__ import annotations

import json

try:
    from .models import (
        DEFAULTS,
        DiagnosisVerdict,
        ExecutionReport,
        Finding,
        HumanEscalation,
        Patch,
        Problem,
        RelaunchInfo,
        RunContext,
        Severity,
    )
except ImportError:
    from models import (
        DEFAULTS,
        DiagnosisVerdict,
        ExecutionReport,
        Finding,
        HumanEscalation,
        Patch,
        Problem,
        RelaunchInfo,
        RunContext,
        Severity,
    )


class DiagnosisClient:
    def __init__(self, ctx: RunContext) -> None:
        self.ctx = ctx
        self.prompt_path = ctx.prompts_dir / "diagnose_failure.md"

    def render_prompt(self, findings: list[Finding]) -> str:
        template = self.prompt_path.read_text(encoding="utf-8")
        payload = {
            "run_id": self.ctx.run_id,
            "attempt_id": self.ctx.attempt_id,
            "manifest_path": str(self.ctx.attempt_dir / "manifest.json"),
            "snapshot_pre_stop_dir": str(self.ctx.attempt_dir / "snapshot-pre-stop"),
            "snapshot_post_stop_dir": str(self.ctx.attempt_dir / "snapshot-post-stop"),
            "findings": [item.to_dict() for item in findings],
        }
        return template.replace("{{PAYLOAD_JSON}}", json.dumps(payload, indent=2, ensure_ascii=False))

    def parse_model_output(self, payload: str) -> ExecutionReport:
        data = json.loads(payload)
        return ExecutionReport(
            run_id=data["run_id"],
            attempt_id=data["attempt_id"],
            verdict=DiagnosisVerdict(data["verdict"]),
            confidence=float(data.get("confidence", 0.0)),
            problems=[
                Problem(
                    id=item["id"],
                    severity=Severity(item["severity"]),
                    component=item["component"],
                    symptom=item["symptom"],
                    root_cause=item["root_cause"],
                    evidence=item.get("evidence", []),
                    proposed_fix_summary=item.get("proposed_fix_summary", ""),
                )
                for item in data.get("problems", [])
            ],
            patches=[Patch(**item) for item in data.get("patches", [])],
            relaunch=RelaunchInfo(**data.get("relaunch", {})),
            human_escalation=HumanEscalation(**data.get("human_escalation", {})),
        )

    def stub_report_from_findings(self, findings: list[Finding]) -> ExecutionReport:
        problems = [
            Problem(
                id=item.code,
                severity=item.severity,
                component="templates/breakthrough-loop.toml",
                symptom=item.summary,
                root_cause=item.reason or "See normalized monitor findings.",
                evidence=item.evidence,
                proposed_fix_summary="Prioritize prompt and loop wording for affected role.",
            )
            for item in findings
        ]
        verdict = DiagnosisVerdict.CONFIG_ISSUE
        if not findings:
            verdict = DiagnosisVerdict.INCONCLUSIVE

        return ExecutionReport(
            run_id=self.ctx.run_id,
            attempt_id=self.ctx.attempt_id,
            verdict=verdict,
            confidence=0.5,
            problems=problems,
            patches=[],
            relaunch=RelaunchInfo(
                recommended=False,
                change_team_name=True,
                reasoning_effort=DEFAULTS.team_reasoning_effort,
                notes=["Stub report only. Replace with Claude Code output before execution."],
            ),
            human_escalation=HumanEscalation(
                required=True,
                reason="Diagnosis integration is still stubbed; do not auto-relaunch.",
            ),
        )
