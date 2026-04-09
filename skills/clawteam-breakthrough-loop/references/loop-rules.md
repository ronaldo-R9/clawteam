# Loop Rules

```yaml
loop_rules:
  round_0:
    - supervisor publishes kickoff
    - explorer must produce:
      - safe option
      - bold option
      - weird but plausible option
    - supervisor sets initial direction bias:
      - bold unless clearly incompatible with constraints

  round_1:
    - worker produces first submission
    - worker tags the submission with a revision id
    - reviewer performs static analysis and design review (does not run code)
    - reviewer reports to supervisor
    - reviewer returns to explicit inbox receive/watch loop
    - reviewer must review visible-surface design from templates/components when the deliverable is user-facing
    - verifier performs runtime verification and smoke testing (does not judge design)
    - verifier reports to supervisor
    - verifier returns to explicit inbox receive/watch loop
    - verifier must collect runtime smoke evidence for user-facing flows before PASS
    - supervisor merges reviewer + verifier outputs into one revision brief for worker
    - supervisor publishes:
      - round decision
      - state summary round 1

  round_2:
    - worker revises or pivots based on supervisor's merged revision brief
    - worker tags the resubmission with a new revision id
    - reviewer reviews
    - reviewer reports to supervisor
    - reviewer returns to explicit inbox receive/watch loop
    - reviewer must block obvious visible-surface defects unless explicitly out of scope
    - verifier verifies
    - verifier reports to supervisor
    - verifier returns to explicit inbox receive/watch loop
    - verifier may not rely on code inspection alone for end-user flow claims
    - if same blocker appears twice:
      - supervisor forces targeted re-exploration
    - supervisor emits one authoritative revision brief back to worker
    - supervisor publishes:
      - round decision
      - state summary round 2

  round_3:
    - supervisor must force convergence
    - allowed decisions:
      - converge current direction
      - pivot once to best available alternative
      - scope_reduce: narrow success criteria to achievable MVP and continue
      - stop and report blockers
    - when scope_reduce is chosen, supervisor publishes revised success criteria and notifies all agents
    - explorer assists with identifying which requirements to cut for maximum value
    - broad open-ended exploration is not allowed by default
    - worker produces convergence submission with a new revision id
    - reviewer checks quality, coherence, preserved ambition, and visible user-facing quality when applicable
    - reviewer reports to supervisor
    - reviewer returns to explicit inbox receive/watch loop
    - verifier checks supportability, runtime evidence, constraints, and required claim downgrades
    - verifier reports to supervisor
    - verifier returns to explicit inbox receive/watch loop
    - supervisor merges both gate results before issuing any further worker actions
    - supervisor publishes:
      - convergence decision
      - state summary round 3

  round_4:
    - final tightening only
    - worker applies last blocking fixes from the supervisor's merged brief
    - reviewer returns APPROVED or CHANGES_REQUIRED with explicit manual inspection status
    - verifier returns PASS, FAIL, or UNVERIFIED with explicit manual smoke status
    - reviewer and verifier return to the inbox loop after reporting unless shutdown is issued
    - reviewer/verifier approvals only count if they reference the same revision id
    - supervisor chooses:
      - approve
      - extend with written justification
      - stop and report failure to meet bar

  state_summary_numbering:
    rule:
      - state summary numbers are bound to actual round numbers, not incremented on every update
      - round-level summaries: "第 N 轮状态摘要"
      - mid-round status updates: "第 N 轮状态更新 (序号 X)"
      - a new round number is only assigned after a complete review+verification cycle and a round decision
      - do NOT increment the round number for intermediate events (e.g., "worker acknowledged busy")

  state_summarization:
    trigger_points:
      - after every paired review and verification cycle
      - after any gate disagreement on the same revision
      - before round 3
      - whenever context drift is detected
      - whenever repeated failure is detected
      - whenever context becomes too large
    owner:
      - supervisor
    effect:
      - latest state summary becomes binding working context
      - older discussion becomes archival
      - stale branches may not be silently revived

  completion_condition:
    full_approval:
      - reviewer == APPROVED
      - verifier == PASS
      - reviewer.revision_id == verifier.revision_id
      - if deliverable is user-facing, reviewer.static_review_status == performed or blocked_with_explicit_reason
      - if deliverable is user-facing, verifier.runtime_smoke_status == performed or blocked_with_explicit_reason
      - supervisor publishes final decision as approved
    conditional_accept:
      - work is substantially complete
      - remaining gaps are documented as caveats (unverified claims relabeled, non-critical scope deferred)
      - supervisor publishes final decision as conditional_accept with explicit caveat list
      - use when 4 rounds exhausted but result is usable with known limitations

  failure_condition:
    any_of:
      - max_rounds_exhausted_without_acceptance
      - unresolved_structural_blockers
      - critical_constraints_remain_failed
      - supervisor_stops_after_round_3_or_4
      - agent_unresponsive_beyond_timeout
      - critical_agent_process_failure

  extension_rule:
    - extension beyond round 4 requires explicit written justification from supervisor
    - justification must explain:
      - why another round is likely to change the outcome
      - why scope reduction is not preferable

  timeout_policy:
    silent_timeout:
      description: no communication at all from the agent
      timeout_seconds: 300
      max_consecutive_empty_polls: 3
      poll_interval_seconds: 30-60
    acknowledged_busy_timeout:
      description: agent sent a heartbeat or progress update but has not finished
      timeout_seconds: 900
    pre_probe_check:
      - before probing, check agent worktree for new file changes via `clawteam context diff`
      - if worktree has new changes, reset the silent timer (agent is working)
    on_timeout:
      - supervisor sends direct probe message to unresponsive agent
      - wait one additional poll cycle (60 seconds)
      - if still unresponsive, escalate
    on_escalation:
      - mark agent task as blocked
      - invoke emergency_stop for the whole team regardless of role
    on_emergency_stop:
      - broadcast emergency stop to all agents
      - publish STATE SUMMARY with status blocked_by_agent_failure
      - write TEAM_BLOCKED.md report in supervisor worktree
      - execute clawteam lifecycle request-shutdown
      - stop polling, do not continue indefinitely
      - do not substitute for the blocked role

  inbox_loop_protocol:
    applies_to:
      - reviewer
      - verifier
      - explorer
    rules:
      - FIRST ACTION after receiving kickoff: start `while true; do clawteam inbox receive <team> --agent <name>; sleep 15; done`
      - after each formal result, immediately return to the inbox loop
      - do not use task wait as a substitute for inbox polling
      - if no revision exists yet, keep polling inbox until revision_or_shutdown
      - NEVER execute `clawteam lifecycle idle` — idle is only permitted after supervisor sends an explicit shutdown request
      - NEVER mark task as completed until supervisor requests shutdown
      - "no work yet" means "wait in inbox loop", NOT "I am done"
    anti_patterns:
      - receiving kickoff → finding no revision → calling lifecycle idle (FORBIDDEN)
      - completing first exploration → marking task completed → exiting (FORBIDDEN)
      - waiting for revision → sitting at shell prompt without polling (FORBIDDEN)
    supervisor_verification:
      - supervisor sends ping to reviewer, verifier, and explorer within 60 seconds after kickoff
      - agents must confirm inbox watch state within 120 seconds
      - if agent responds with idle or does not confirm, supervisor sends explicit watch command

  fast_track_protocol:
    description: lightweight cycle for minor single-issue fixes
    preconditions:
      - exactly 1 blocking issue remaining
      - fix does not change architecture or design
      - reviewer and verifier agreed on the same issue in previous cycle
    flow:
      - supervisor issues FAST-TRACK BRIEF with single fix item and target revision id
      - worker fixes and resubmits
      - reviewer replies "confirmed on r<n>" or rejects with reason
      - verifier replies "confirmed on r<n>" or rejects with reason
      - if both confirm, proceed without full STATE SUMMARY
      - if either rejects, fall back to full revision cycle

  heartbeat_protocol:
    applies_to: worker
    before_long_running_command:
      - send message to supervisor with command name and estimated duration
    on_command_failure_or_hang:
      - send error report to supervisor within 3 minutes
      - do not silently retry more than once
      - escalate if second attempt fails
    after_submission:
      - stop broad new work until supervisor publishes the merged revision brief
      - only continue bounded confirmation checks or evidence gathering
      - if merged brief is delayed beyond timeout, notify supervisor and remain paused
```

## Canonical State Summary Format

Use `第 N 轮状态摘要` for round-level summaries and `第 N 轮状态更新 (序号 X)` for mid-round updates. See `state_summary_numbering` above.

```text
STATE SUMMARY ROUND <n>
CURRENT_DIRECTION:
- ...
WHY_THIS_DIRECTION_IS_ACTIVE:
- ...
REJECTED_DIRECTIONS:
- ...
VERIFIED_FACTS:
- ...
UNVERIFIED_HYPOTHESES:
- ...
BLOCKING_ISSUES:
- ...
RESOLVED_ISSUES:
- ...
ACTIVE_CONSTRAINTS:
- ...
NEXT_REQUIRED_ACTION:
- ...
CONVERGENCE_STATUS:
- exploring | revising | converging | scope_reducing | finalizing
```
