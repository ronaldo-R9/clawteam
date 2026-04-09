# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

ClawTeam Integration Bundle — packages the ClawTeam multi-agent coordination skill, the breakthrough-loop skill, the launch template, and supporting references. The goal is to clone this repo on another machine and install the skills/templates into a coding agent's home directory with one command.

This is **not** the ClawTeam CLI itself (that's `pip install clawteam`). This repo holds portable skill definitions, prompt templates, and example projects that use ClawTeam.

## Installation

```bash
./install.sh
```

Copies skills to `$CODEX_HOME/skills/` (default `~/.codex/skills/`) and the breakthrough-loop template to `~/.clawteam/templates/`.

## Repository Structure

- `skills/clawteam/` — Main ClawTeam coordination skill (SKILL.md + CLI reference + workflow docs)
- `skills/clawteam-breakthrough-loop/` — Breakthrough-loop skill with 5-role team (supervisor, worker, explorer, reviewer, verifier), orchestration spec, role prompts, message protocol, and loop rules
- `templates/breakthrough-loop.toml` — TOML template defining the breakthrough-loop team structure and agent prompts; `{goal}` is the only interpolation variable
- `examples/` — Example projects built using ClawTeam (e.g., snake_game_web)
- `runs/` — Runtime output from ClawTeam team runs (gitignored data dir)
- `snake-pvp-site/` — Separate git submodule/repo for the deployed snake PvP site

## Key Concepts

**Breakthrough Loop** is the primary workflow template. It creates a 5-agent team:
- **supervisor** — round control, state summaries, convergence, merges gate feedback into revision briefs for worker
- **worker** — builds the deliverable, submits revisions with IDs
- **explorer** — generates 3 divergent options (safe/bold/weird) per round
- **reviewer** — quality gate, returns APPROVED or CHANGES_REQUIRED
- **verifier** — fact/constraint gate, returns PASS/FAIL/UNVERIFIED

The loop runs up to 4 rounds. Round 3 forces convergence. Acceptance requires both reviewer=APPROVED and verifier=PASS on the same revision ID.

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
- Treat the manual commands in this section as the source of truth. If `custom-dashboard/start-team.sh` diverges from these rules, update the script or follow the manual commands directly.

## Inter-Agent Communication

Default language is Simplified Chinese for all team messages. Code, commands, file paths, and identifiers stay in their original form. This can be overridden by user request.

## Editing Skills and Templates

- Skill definitions use YAML frontmatter (`name`, `description`, `version`) in `SKILL.md` files
- The TOML template at `templates/breakthrough-loop.toml` is the canonical source; `skills/clawteam-breakthrough-loop/assets/breakthrough-loop.toml` is a copy used by the skill
- Reference docs under `skills/*/references/` are loaded on-demand by agents, not all at once
- After editing skills or templates, re-run `./install.sh` to deploy changes to the local machine
