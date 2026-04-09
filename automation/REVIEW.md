# Automation Scaffold Review (Round 2)

Date: 2026-04-09

This is the second review, after fixes were applied based on the first review.

---

## 1. Summary of Changes Since Round 1

| Round 1 Issue | Status | How Fixed |
|---------------|--------|-----------|
| 4.1 Scheduler P1 too aggressive | FIXED | `_should_stop_for_p1()` now skips warmup phase and requires consecutive ticks with overlapping P1 codes before STOP |
| 4.2 protocol_flags had no source | FIXED | New `event_parser.py` derives flags from `~/.clawteam/teams/<team>/events/*.json`; `snapshot.py` calls it automatically |
| 4.3 RELAUNCH_DECISION ignores verdict | FIXED | Now checks `human_escalation.required`, `verdict` (model_limit, framework_bug, inconclusive), and `relaunch.recommended` |
| 4.4 old_sha256 not verified | FIXED | `PatchExecutor.verify_old_sha256()` computes file hash and compares; `build_patch_plan()` sets `safe_to_apply = False` on mismatch |
| 4.5 No custom-dashboard integration | FIXED | `Defaults` has `dashboard_port=8081` and `dashboard_python`; `RunContext` has `dashboard_server_path`; `handle_launch` emits dashboard start command; `handle_graceful_stop` emits dashboard stop plan; `validators.py` checks dashboard server file exists |
| CLI missing `--goal` | FIXED | `--goal` added as required argument; `OrchestratorScaffold.__init__` accepts `goal` |
| RunContext missing history | FIXED | `monitor_history` and `scheduler_history` lists added; `handle_active_monitor` appends to both |

---

## 2. What's Solid Now

### 2.1 State Machine + Models (unchanged, still good)

19 states, explicit transition table, history logging, `InvalidTransitionError` on invalid moves. Dry-run confirms the full wiring works:

```json
{
  "repo": "/Users/xuke/Documents/AI_Project/clawteam",
  "team": "test-review",
  "goal": "test goal",
  "template_name": "breakthrough-loop",
  "dashboard_port": 8081,
  "dashboard_server": ".../custom-dashboard/server.py",
  "max_attempts": 3,
  "max_rounds": 3
}
```

All modules import cleanly. No runtime errors on dry-run.

### 2.2 Event Parser (new, `event_parser.py`)

Well-designed heuristic parser:
- Handles multiple field naming conventions (`sender`/`from`/`agent`/`agentName`/`agent_name`/`source`)
- Handles both Chinese and English protocol markers (`启动说明`/`kickoff`, `状态摘要`/`state summary`)
- Extracts revision IDs from multiple formats (`修订编号: r1`, `REVISION ID: rb-2`, etc.)
- Derives all 5 protocol flags: `kickoffs_sent`, `worker_revision_submitted`, `gate_revision_matched`, `supervisor_summary_published`, `success_hold_clean`
- `kickoffs_sent` correctly requires all 4 targets (worker + 3 gate roles)
- `gate_revision_matched` requires revision intersection across worker, reviewer, and verifier

### 2.3 Scheduler P1 Logic (fixed)

```python
def _should_stop_for_p1(self, snapshot, findings):
    if snapshot.phase == "warmup":
        return False  # <-- no longer kills during warmup
    ...
    consecutive = 1
    for previous in reversed(self.ctx.monitor_history):
        if current_codes & previous_codes:
            consecutive += 1
            if consecutive >= DEFAULTS.inbox_growth_consecutive_ticks:  # 2
                return True
    return False
```

Phase-aware, requires 2 consecutive ticks with overlapping P1 codes. Correct.

### 2.4 RELAUNCH_DECISION (fixed)

```python
def handle_relaunch_decision(self, ctx):
    if ctx.current_attempt >= ctx.max_attempts:
        return State.ESCALATE_HUMAN
    if ctx.latest_report is None:
        return State.ESCALATE_HUMAN
    if ctx.latest_report.human_escalation.required:
        return State.ESCALATE_HUMAN
    if ctx.latest_report.verdict in {MODEL_LIMIT, FRAMEWORK_BUG, INCONCLUSIVE}:
        return State.ESCALATE_HUMAN
    if not ctx.latest_report.relaunch.recommended:
        return State.ESCALATE_HUMAN
    return State.LAUNCH
```

All 5 escalation conditions are correct. Only `config_issue` with `recommended=True` and no human escalation will loop.

### 2.5 Patch Integrity (fixed)

```python
def verify_old_sha256(self, patch):
    if not patch.old_sha256:
        return True  # no hash = skip check (backward compat)
    target = self.resolve_target_path(patch.target_file)
    if not target.exists():
        return False
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    return patch.old_sha256 == f"sha256:{digest}"
```

Hash mismatch cascades into `safe_to_apply = False`, which then fails in `validate_patch_plan()`. Good safety chain.

### 2.6 Custom Dashboard Integration (fixed)

- `Defaults.dashboard_port = 8081`, `Defaults.dashboard_python` points to correct interpreter
- `RunContext.dashboard_server_path` resolves to `custom-dashboard/server.py`
- `handle_launch` emits full `dashboard_start_command` in `launch_plan.json`
- `handle_graceful_stop` includes `dashboard_stop` plan with port info
- `validate_precheck` verifies `dashboard_server_path` exists

### 2.7 Snapshot Integration with Event Parser

`snapshot.py` now imports `derive_protocol_flags` and calls it automatically when `team_name` is provided but `protocol_flags` is None. The `events_dir` path is recorded in `source_files` for traceability.

---

## 3. Remaining Issues

### 3.1 Still Scaffold — No Live Execution (unchanged)

The core I/O paths are still stubs. This is the same as Round 1:

| Handler | Status |
|---------|--------|
| `handle_launch` | Writes `launch_plan.json`, doesn't call `clawteam launch` |
| `handle_warmup_observe` | Immediately returns, no timing wait |
| `handle_active_monitor` | Single-shot, `NotImplementedError` for continued polling |
| `handle_graceful_stop` | Writes plan, doesn't call `clawteam lifecycle stop-team` |
| `handle_snapshot_pre/post_stop` | Writes collection plan, doesn't execute commands |
| `handle_diagnose` | Uses `stub_report_from_findings`, no real Claude call |
| `handle_apply_patch` | Writes `codex_patch_request.md`, doesn't invoke Codex |

This is **by design** (docstring says "Scaffold only"), so it's not a bug — but it means the system still cannot run end-to-end.

### 3.2 Resume Still Unimplemented

CLI has `resume` subcommand, but no state serialization. Low priority if the outer loop is short-lived (3 attempts max), but worth noting.

### 3.3 Health Rules: `warmup` Phase Never Set

`health_rules.py:79` now correctly skips `kickoffs_not_confirmed` only when phase is `"monitor"` or `"success_hold"`. The scheduler skips P1 during `phase == "warmup"`. But `handle_warmup_observe` immediately transitions to ACTIVE_MONITOR and doesn't set `snapshot.phase = "warmup"` anywhere. When the polling loop is implemented, the first few snapshots during warmup need to be tagged with `phase="warmup"` for the phase-aware logic to work.

### 3.4 Event Parser: Robustness Edge Cases

The parser is heuristic-based and has a few fragile points:

1. **`kickoff` detection** (line 124): Matches `"kickoff" in text` which could false-positive on messages discussing kickoff but not actually being a kickoff. The supervisor kickoff in practice contains structured fields (GOAL, DELIVERABLE, etc.), so a more specific marker like `"GOAL"` or `"DELIVERABLE"` in the same message would be safer.

2. **Revision ID extraction** (line 83-95): The generic regex `r"\b(?:r|rb-)?([0-9]+)\b"` will match any number in any text (e.g., "round 3" would extract "3"). The structured markers (修订编号, revision id) are checked first which mitigates this, but the fallback is overly broad.

3. **`gate_revision_matched`** (line 150): Requires intersection of worker, reviewer, AND verifier revision sets. If the verifier is slow and hasn't reported yet, this stays `False` even though progress is being made. This is correct for final acceptance, but could delay `success_hold` detection.

### 3.5 `kickoffs_not_confirmed` Check Scope

```python
# health_rules.py:79
if snapshot.phase in {"monitor", "success_hold"} and not snapshot.protocol_flags.get(
    "kickoffs_sent", False,
):
```

Round 1 had `{"warmup", "monitor"}`, now it's `{"monitor", "success_hold"}`. The change removes the warmup false-positive, but adding `success_hold` is odd — by `success_hold` phase, kickoffs must have been sent long ago. If kickoffs aren't confirmed by `success_hold`, something is deeply wrong, and this P1 finding would be redundant (there would already be L2 failures blocking `success_hold` entry). Not a bug, just slightly noisy.

### 3.6 `handle_active_monitor` History Append Order

```python
# orchestrator.py:156-161
findings = evaluate_snapshot(ctx.latest_snapshot, ctx.monitor_history)
decision = self.scheduler.fallback_decision(ctx.latest_snapshot, findings)
ctx.monitor_history.append(ctx.latest_snapshot)  # <-- after evaluation
ctx.scheduler_history.append(decision)
```

The snapshot is appended to `monitor_history` AFTER `evaluate_snapshot` uses it as the "current" snapshot against `monitor_history` as "previous". This is correct — the current tick should not include itself in the previous list. Good.

### 3.7 `INCONCLUSIVE` Verdict Triggers Escalation

```python
if ctx.latest_report.verdict in {MODEL_LIMIT, FRAMEWORK_BUG, INCONCLUSIVE}:
    return State.ESCALATE_HUMAN
```

Including `INCONCLUSIVE` means the automation will never retry when the diagnostician isn't sure. This is the safe choice, but it means the system gives up early if diagnosis confidence is low. An alternative would be to allow one retry on `INCONCLUSIVE` before escalating. Not wrong, just conservative.

---

## 4. Updated Feasibility Verdict

| Dimension | Round 1 | Round 2 |
|-----------|---------|---------|
| Design architecture | OK | OK (improved) |
| Logic correctness | 5 issues | 1 minor (warmup phase tagging), 2 edge-case (event parser, INCONCLUSIVE policy) |
| Direct execution | NOT POSSIBLE | NOT POSSIBLE (still scaffold) |
| Value as skeleton | 60% | ~75% — logic layer is now sound, only I/O integration remains |

---

## 5. Remaining Work to Make It Runnable

### P0 — Must Have

1. **clawteam CLI integration layer** — `subprocess.run` wrappers for `launch`, `lifecycle stop-team`, `board show`, `inbox peek`, `event list`, `task list`. This is the single largest remaining gap.

2. **Polling loop** — Refactor `handle_warmup_observe` to wait with snapshot collection (phase="warmup"), refactor `handle_active_monitor` to loop every 30s, refactor `handle_success_hold` to confirm stability over 3-5 min window.

3. **LLM call layer** — `call_model()` implementations for `claude -p` (diagnosis) and `codex` (scheduler, patch). Handle input piping, output parsing, and timeout.

### P1 — Important

4. **Warmup phase tagging** — First N snapshots (during warmup window) must set `phase="warmup"` so scheduler and health rules apply phase-aware logic correctly.

5. **Event parser hardening** — More specific kickoff detection marker; bounded revision ID fallback regex.

### P2 — Nice to Have

6. **State persistence for resume** — Serialize on each transition.
7. **Cost tracking** — Budget-based stop condition.
8. **INCONCLUSIVE retry policy** — Allow 1 retry before escalating.
