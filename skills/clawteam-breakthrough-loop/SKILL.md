---
name: clawteam-breakthrough-loop
description: Create and run a Codex + ClawTeam breakthrough-oriented multi-agent team with supervisor, worker, explorer, reviewer, and verifier. Use when a task benefits from divergent exploration, iterative critique, objective verification, forced state summarization, and round-3 convergence instead of a single-pass answer.
---

# ClawTeam Breakthrough Loop

## Overview

Use this skill to create and run a breakthrough-oriented `ClawTeam` that uses `codex` for every agent role. The team structure is fixed: `supervisor`, `worker`, `explorer`, `reviewer`, and `verifier`.

This skill is for tasks where quality improves from controlled divergence and multi-round revision, not for trivial single-pass work.

## Required Inputs

Before launching the team, define or derive:

- `goal`: What the team is trying to achieve.
- `deliverable`: What artifact should exist at the end.
- `success criteria`: What must be true for acceptance.
- `constraints`: Scope, format, quality, safety, tool, or repo limits.
- `repo path`: The repository or working directory to use.

If the user omits any of these, derive conservative defaults and state them in the kickoff.

## Launch Workflow

1. Confirm the task is complex enough to justify a breakthrough loop. Use a simpler flow for routine changes.
2. Use the `codex-breakthrough-loop` ClawTeam template.
3. Launch with `codex` as the command and isolated workspaces by default.
4. Let the `supervisor` run the round structure.
5. Require `reviewer` and `verifier` results on every worker submission.
6. After each review and verification cycle, require a canonical `STATE SUMMARY`.
7. In round 3, force convergence. Do not allow open-ended exploration to continue unchanged.
8. Only finish when `reviewer = APPROVED` and `verifier = PASS`.

## Operating Rules

- Treat the latest `STATE SUMMARY` as the binding team context.
- If the same blocker appears twice, require targeted re-exploration or a pivot.
- Downgrade unsupported breakthrough claims into hypotheses, experiments, or future work.
- Round 4 is final tightening only unless the supervisor writes an explicit extension justification.

## References

Read only what is needed:

- For the canonical runtime contract, read [references/orchestration-spec.md](references/orchestration-spec.md).
- For role behavior and exact prompts, read [references/role-prompts.md](references/role-prompts.md).
- For structured team messages, read [references/message-protocol.md](references/message-protocol.md).
- For round sequencing, summarization triggers, and convergence rules, read [references/loop-rules.md](references/loop-rules.md).
- For required launch inputs and default runtime assumptions, read [references/launch-checklist.md](references/launch-checklist.md).

## Assets And Scripts

- The ClawTeam template source lives at [assets/codex-breakthrough-loop.toml](assets/codex-breakthrough-loop.toml).
- The helper launcher lives at [scripts/bootstrap_team.py](scripts/bootstrap_team.py).

Use the helper launcher when you want a consistent `clawteam launch ...` command without rebuilding arguments by hand.

## Default Launch Pattern

Use this pattern unless the task needs different settings:

```bash
clawteam launch codex-breakthrough-loop \
  -g "<goal>" \
  -t "<team-name>" \
  --repo "<repo-path>" \
  --command codex \
  -w
```

If the installed template is missing but the skill exists, install the template from the asset copy before launching.
