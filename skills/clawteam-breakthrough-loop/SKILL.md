---
name: clawteam-breakthrough-loop
description: Create and run a ClawTeam breakthrough-oriented multi-agent team with supervisor, worker, explorer, reviewer (static/design gate), and verifier (runtime gate). Use when a task benefits from divergent exploration, iterative critique, objective verification, forced state summarization, and round-3 convergence instead of a single-pass answer.
version: 0.5.0
---

# ClawTeam Breakthrough Loop

## Overview

Use this skill to create and run a breakthrough-oriented `ClawTeam`. The team structure is fixed: `supervisor`, `worker`, `explorer`, `reviewer`, and `verifier`.

The template defaults to `codex`, but the launch command can be overridden at runtime to use another supported CLI such as `gemini`.
Inter-agent communication language is controlled by the `{language}` template variable (defaults to Simplified Chinese). Override at launch if needed. Literal code artifacts such as commands, file paths, API names, and identifiers should remain unchanged.

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
2. Use the `breakthrough-loop` ClawTeam template.
3. Launch with `codex` as the default command and isolated workspaces by default. Override `--command` when you need another CLI.
4. Let the `supervisor` run the round structure. Supervisor reads `references/supervisor-operations.md` for output templates and detailed protocols.
5. Require `reviewer` (static/design gate) and `verifier` (runtime gate) results on every worker submission, but route both formal gate results to `supervisor` first.
6. Require `reviewer`, `verifier`, and `explorer` to start an inbox polling loop (`while true; do clawteam inbox receive ... ; sleep 15; done`) as their FIRST ACTION after receiving kickoff. They must NEVER call `clawteam lifecycle idle` or mark task completed until supervisor requests shutdown. "No revision yet" means "wait", not "I am done". Supervisor must verify all three are in watch state within 120 seconds after kickoff.
7. For user-facing deliverables, require explicit visible-surface acceptance criteria in the kickoff and treat obvious UI or UX defects as blocking issues.
8. For user-facing deliverables, require reviewer static design review and verifier runtime smoke evidence before acceptance.
9. Require every worker submission to include a `revision id`, CC'd to explorer, and only count gate results when reviewer and verifier refer to the same revision.
10. After each review and verification cycle, require a canonical `STATE SUMMARY` plus one merged `REVISION BRIEF` from `supervisor` to `worker`. For minor single-issue fixes, supervisor may use the fast-track protocol instead.
11. Require `worker` to pause after every submission until the merged `REVISION BRIEF` arrives from `supervisor`. Delayed gate feedback is a wait state, not permission to self-start the next revision.
12. In round 3, force convergence. Allowed decisions: converge, pivot, scope_reduce (narrow to achievable MVP), or stop. Do not allow open-ended exploration to continue unchanged.
13. If any agent is unresponsive or long-blocked, require `supervisor` to stop the whole team, write `TEAM_BLOCKED.md`, and request shutdown instead of taking over implementation or gate duties. Timeout distinguishes silent (5 min) from acknowledged-busy (15 min).
14. Finish when `reviewer = APPROVED` and `verifier = PASS` for the same revision. Alternatively, `supervisor` may issue `conditional_accept` when work is substantially complete with documented caveats.
15. Require all team messages to be written in `{language}` (default: Simplified Chinese) while preserving literal technical identifiers.

## Operating Rules

- Treat the latest `STATE SUMMARY` as the binding team context.
- Treat the latest supervisor-issued `REVISION BRIEF` as the only authoritative worker todo list.
- `reviewer` does static analysis and design review only; `verifier` does runtime verification only. Their scopes do not overlap.
- Require `reviewer`, `verifier`, and `explorer` to continuously consume inbox traffic. `lifecycle idle` is FORBIDDEN except after explicit shutdown request.
- Require `worker` to remain paused after each submission until supervisor publishes the next merged brief or shutdown. All non-submission cross-role requests from worker must go through supervisor.
- Require `supervisor` to supervise, merge, and stop the team on long blockages, but never to replace worker/reviewer/verifier execution. Supervisor must verify gate agents are in inbox watch state after kickoff.
- State Summary numbering must be bound to actual round numbers. Mid-round updates use sub-numbering (e.g., `第 1 轮状态更新 (序号 1)`).
- If the same blocker appears twice, require targeted re-exploration or a pivot.
- Downgrade unsupported breakthrough claims into hypotheses, experiments, or future work.
- `explorer` receives worker submissions via CC and shifts to targeted research in round 2+ and convergence assist in round 3+.
- Round 4 is final tightening only unless the supervisor writes an explicit extension justification.

## References

Read only what is needed:

- For the canonical runtime contract, read [references/orchestration-spec.md](references/orchestration-spec.md).
- For role behavior and exact prompts, read [references/role-prompts.md](references/role-prompts.md).
- For structured team messages, read [references/message-protocol.md](references/message-protocol.md).
- For round sequencing, summarization triggers, and convergence rules, read [references/loop-rules.md](references/loop-rules.md).
- For required launch inputs and default runtime assumptions, read [references/launch-checklist.md](references/launch-checklist.md).
- For supervisor output templates, health monitoring, and fast-track protocol, read [references/supervisor-operations.md](references/supervisor-operations.md).

## Assets And Scripts

- The ClawTeam template source lives at [assets/breakthrough-loop.toml](assets/breakthrough-loop.toml).
- The helper launcher lives at [scripts/bootstrap_team.py](scripts/bootstrap_team.py).

Use the helper launcher when you want a consistent `clawteam launch ...` command without rebuilding arguments by hand.

## Default Launch Pattern

Use this pattern unless the task needs different settings:

```bash
clawteam launch breakthrough-loop \
  -g "<goal>" \
  -t "<team-name>" \
  --repo "<repo-path>" \
  --command codex \
  -w
```

Gemini example:

```bash
clawteam launch breakthrough-loop \
  -g "<goal>" \
  -t "<team-name>" \
  --repo "<repo-path>" \
  --command gemini \
  --command-arg=--model \
  --command-arg gemini-3.1-pro-preview \
  -w
```

If the installed template is missing but the skill exists, install the template from the asset copy before launching.
