"""Patch-plan normalization and Codex patch prompt scaffolding."""

from __future__ import annotations

import hashlib
import json
from fnmatch import fnmatch
from pathlib import Path

try:
    from .models import ExecutionReport, Patch, PatchPlan, RunContext, WHITELIST_PATTERNS
except ImportError:
    from models import ExecutionReport, Patch, PatchPlan, RunContext, WHITELIST_PATTERNS


class PatchExecutor:
    def __init__(self, ctx: RunContext) -> None:
        self.ctx = ctx
        self.prompt_path = ctx.prompts_dir / "apply_patch.md"

    def is_whitelisted(self, target_file: str) -> bool:
        target = Path(target_file)
        if target.is_absolute():
            try:
                rel = target.relative_to(self.ctx.repo_path).as_posix()
            except ValueError:
                rel = target.as_posix()
        else:
            rel = target.as_posix()
        return any(fnmatch(rel, pattern) for pattern in WHITELIST_PATTERNS)

    def resolve_target_path(self, target_file: str) -> Path:
        target = Path(target_file)
        return target if target.is_absolute() else self.ctx.repo_path / target

    def verify_old_sha256(self, patch: Patch) -> bool:
        if not patch.old_sha256:
            return True
        target = self.resolve_target_path(patch.target_file)
        if not target.exists():
            return False
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        return patch.old_sha256 == f"sha256:{digest}"

    def build_patch_plan(self, report: ExecutionReport) -> PatchPlan:
        safe_to_apply = (
            report.verdict.value == "config_issue"
            and not report.human_escalation.required
            and bool(report.patches)
        )
        patches: list[Patch] = []
        whitelist_only = True
        for item in report.patches:
            patches.append(item)
            whitelist_only = whitelist_only and self.is_whitelisted(item.target_file)
            safe_to_apply = safe_to_apply and self.verify_old_sha256(item)
        return PatchPlan(
            attempt_id=report.attempt_id,
            safe_to_apply=safe_to_apply,
            whitelist_only=whitelist_only,
            patches=patches,
        )

    def render_prompt(self, patch_plan: PatchPlan) -> str:
        template = self.prompt_path.read_text(encoding="utf-8")
        payload = {
            "repo_root": str(self.ctx.repo_path),
            "attempt_id": patch_plan.attempt_id,
            "whitelist_patterns": WHITELIST_PATTERNS,
            "patch_plan": patch_plan.to_dict(),
        }
        return template.replace("{{PAYLOAD_JSON}}", json.dumps(payload, indent=2, ensure_ascii=False))
