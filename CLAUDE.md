# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

ClawTeam Integration Bundle — packages the ClawTeam multi-agent coordination skill, the breakthrough-loop skill, the launch template, an external orchestrator scaffold, and supporting references. Clone this repo on another machine and run `./install.sh` to deploy skills/templates into a coding agent's home directory.

This is **not** the ClawTeam CLI itself (that's `pip install clawteam`). This repo holds portable skill definitions, prompt templates, the automation orchestrator, and the custom dashboard.

## Installation

```bash
./install.sh
```

Copies skills to `$CODEX_HOME/skills/` (default `~/.codex/skills/`) and the breakthrough-loop template to `~/.clawteam/templates/`. Also writes a compatibility alias (`codex-breakthrough-loop.toml`).

## Repository Structure

- `skills/clawteam/` — Main ClawTeam coordination skill (SKILL.md + CLI reference + workflow docs)
- `skills/clawteam-breakthrough-loop/` — Breakthrough-loop skill with 5-role team, orchestration spec, role prompts, message protocol, and loop rules
- `templates/breakthrough-loop.toml` — TOML template defining the breakthrough-loop team structure and agent prompts; `{goal}` is the only interpolation variable
- `automation/` — Python package: external orchestrator scaffold with 19-state FSM, health monitoring, LLM-driven diagnosis, and auto-patching (see Architecture below)
- `custom-dashboard/` — Custom web dashboard (Python HTTP server + single-page HTML); replaces `clawteam board serve` for this repo
- `deliverables/` — Output projects produced by team runs (e.g., `snake-pvp-arena/`)
- `docs/` — Design documents (e.g., external orchestrator design spec)
- `runs/` — Runtime output from ClawTeam team runs (gitignored)

## Key Concepts

**Breakthrough Loop** is the primary workflow template. It creates a 5-agent team:
- **supervisor** — round control, state summaries, convergence, merges gate feedback into revision briefs for worker
- **worker** — builds the deliverable, submits revisions with IDs
- **explorer** — generates 3 divergent options (safe/bold/weird) per round
- **reviewer** — quality gate, returns APPROVED or CHANGES_REQUIRED
- **verifier** — fact/constraint gate, returns PASS/FAIL/UNVERIFIED

The loop runs up to 4 rounds. Round 3 forces convergence. Acceptance requires both reviewer=APPROVED and verifier=PASS on the same revision ID.

## Automation / External Orchestrator

The `automation/` package implements a standalone external loop that launches, monitors, diagnoses, patches, and relaunches breakthrough-loop teams automatically.

### State machine flow (19 states)

INIT → PRECHECK → LAUNCH → WARMUP_OBSERVE → ACTIVE_MONITOR → {SUCCESS_HOLD → STOP_SUCCESS → DONE} or {FAILURE_DETECTED → SNAPSHOT_PRE_STOP → GRACEFUL_STOP → SNAPSHOT_POST_STOP → DIAGNOSE → PATCH_PLAN → APPLY_PATCH → VALIDATE_PATCH → CLEANUP → RELAUNCH_DECISION → LAUNCH (retry) or ESCALATE_HUMAN → FAILED}

### Key modules

- `orchestrator.py` — `OrchestratorScaffold`, the main entry point; wires together all components
- `state_machine.py` — Deterministic FSM with explicit transition table and history
- `models.py` — Data models (`RunContext`, `State`, `Severity`, `DiagnosisVerdict`, `SchedulerDecision`)
- `snapshot.py` / `event_parser.py` — Collect team state and derive protocol flags from `~/.clawteam/teams/<team>/events/`
- `health_rules.py` — Evaluate snapshots, detect P0/P1/P2 failures
- `scheduler.py` — LLM-based scheduling decisions (continue_watch / stop_now / escalate_human)
- `diagnosis.py` — LLM-based failure diagnosis (config_issue / model_limit / framework_bug / inconclusive)
- `patch_executor.py` — Apply patches with SHA-256 safety checks
- `validators.py` — Pre-flight validation (repo exists, dashboard server exists, etc.)
- `prompts/` — Markdown prompt templates for LLM calls (diagnosis, patch application, scheduler)
- `schemas/` — JSON schemas for structured LLM outputs

### CLI

```bash
python -m automation run    --repo <path> --team <name> --goal "<goal>"
python -m automation resume --repo <path> --team <name> --goal "<goal>"
python -m automation dry-run --repo <path> --team <name> --goal "<goal>"
python -m automation report --repo <path> --team <name>
```

Add `--no-execute` to generate plans without invoking live integrations.

## Launching a Team

```bash
clawteam launch breakthrough-loop \
  -g "<goal>" \
  -t "<team-name>" \
  --repo "<repo-path>" \
  --command codex \
  -w
```

Override `--command` for non-codex CLIs (e.g., `--command gemini`). Use `--command-arg=--model --command-arg gemini-3.1-pro-preview` for model selection.

## Custom Dashboard

This repository has a custom dashboard under `custom-dashboard/`. For this repo, prefer that dashboard over ClawTeam's built-in `board serve`.

The dashboard server (`server.py`) imports `clawteam.board.collector.BoardCollector` for team state and uses `tmux capture-pane` to stream real-time agent terminal output. The frontend is a single-page app at `static/index.html`.

### Standard Startup Flow

1. Start the custom dashboard first:

```bash
/opt/anaconda3/envs/vnpy/bin/python3.13 \
  /Users/xuke/Documents/AI_Project/clawteam/custom-dashboard/server.py \
  <team-name> --port 8081 &
```

2. Then launch the ClawTeam team manually:

```bash
clawteam launch breakthrough-loop \
  -g "<goal>" \
  -t "<team-name>" \
  --repo "<repo>" \
  --command codex
```

3. Preferred one-shot entrypoint:

```bash
/Users/xuke/Documents/AI_Project/clawteam/custom-dashboard/start-team.sh \
  --goal "<goal>" \
  --team "<team-name>" \
  --repo "<repo>"
```

### Rules

- Do **not** use `clawteam board serve` for this repository. Use `custom-dashboard/server.py` instead.
- Dashboard port is fixed to `8081` unless the user explicitly requests another port.
- Use `/opt/anaconda3/envs/vnpy/bin/python3.13` when starting the custom dashboard manually.
- In the standard custom-dashboard workflow, do **not** add `-w` to `clawteam launch` unless the user explicitly requests isolated workspaces.
- Important: `-w` controls ClawTeam worktree/workspace mode, not which dashboard is used. Omit it here because the repo's preferred startup convention is the non-`-w` launch path.
- **Known issue:** `start-team.sh` line 124 passes `-w` to `clawteam launch`, contradicting the rule above. When using the script, either fix the script or follow the manual commands directly.
- Treat the manual commands in this section as the source of truth. If `custom-dashboard/start-team.sh` diverges from these rules, update the script or follow the manual commands directly.

## Inter-Agent Communication

Default language is Simplified Chinese for all team messages. Code, commands, file paths, and identifiers stay in their original form. This can be overridden by user request.

## Editing Skills and Templates

- Skill definitions use YAML frontmatter (`name`, `description`, `version`) in `SKILL.md` files
- The TOML template at `templates/breakthrough-loop.toml` is the canonical source; `skills/clawteam-breakthrough-loop/assets/breakthrough-loop.toml` is a copy used by the skill
- Reference docs under `skills/*/references/` are loaded on-demand by agents, not all at once
- After editing skills or templates, re-run `./install.sh` to deploy changes to the local machine
