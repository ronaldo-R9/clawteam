"""Precheck and schema validation helpers."""

from __future__ import annotations

import json
import tomllib
from fnmatch import fnmatch
from pathlib import Path
from typing import Any

try:
    from .models import PatchPlan, RunContext, WHITELIST_PATTERNS
except ImportError:
    from models import PatchPlan, RunContext, WHITELIST_PATTERNS

try:
    import jsonschema
except ImportError:  # pragma: no cover - optional dependency
    jsonschema = None


class ValidationError(RuntimeError):
    pass


class Validator:
    def __init__(self, ctx: RunContext) -> None:
        self.ctx = ctx

    def validate_precheck(self) -> None:
        if not self.ctx.repo_path.exists():
            raise ValidationError(f"repo path does not exist: {self.ctx.repo_path}")
        if not self.ctx.template_path.exists():
            raise ValidationError(f"template file missing: {self.ctx.template_path}")
        if not self.ctx.dashboard_server_path.exists():
            raise ValidationError(
                f"custom dashboard server missing: {self.ctx.dashboard_server_path}"
            )
        if not self.ctx.prompts_dir.exists():
            raise ValidationError(f"prompts directory missing: {self.ctx.prompts_dir}")
        if not self.ctx.schemas_dir.exists():
            raise ValidationError(f"schemas directory missing: {self.ctx.schemas_dir}")
        with self.ctx.template_path.open("rb") as handle:
            tomllib.load(handle)

    def validate_json_against_schema(
        self,
        payload: dict[str, Any],
        schema_name: str,
    ) -> None:
        schema_path = self.ctx.schemas_dir / schema_name
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        if jsonschema is not None:
            jsonschema.validate(payload, schema)
            return

        required = schema.get("required", [])
        for key in required:
            if key not in payload:
                raise ValidationError(f"missing required field {key} for {schema_name}")

    def validate_patch_plan(self, patch_plan: PatchPlan) -> None:
        if not patch_plan.safe_to_apply:
            raise ValidationError("patch plan is not marked safe_to_apply")
        if not patch_plan.whitelist_only:
            raise ValidationError("patch plan includes non-whitelisted files")
        for item in patch_plan.patches:
            if not any(fnmatch(item.target_file, pattern) for pattern in WHITELIST_PATTERNS):
                raise ValidationError(f"patch target is not whitelisted: {item.target_file}")
