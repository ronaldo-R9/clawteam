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
    - reviewer reviews
    - reviewer reports to supervisor
    - reviewer must inspect visible surfaces when the deliverable is user-facing
    - verifier verifies
    - verifier reports to supervisor
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
    - reviewer must block obvious visible-surface defects unless explicitly out of scope
    - verifier verifies
    - verifier reports to supervisor
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
      - stop and report blockers
    - broad open-ended exploration is not allowed by default
    - worker produces convergence submission with a new revision id
    - reviewer checks quality, coherence, preserved ambition, and visible user-facing quality when applicable
    - reviewer reports to supervisor
    - verifier checks supportability, runtime evidence, constraints, and required claim downgrades
    - verifier reports to supervisor
    - supervisor merges both gate results before issuing any further worker actions
    - supervisor publishes:
      - convergence decision
      - state summary round 3

  round_4:
    - final tightening only
    - worker applies last blocking fixes from the supervisor's merged brief
    - reviewer returns APPROVED or CHANGES_REQUIRED with explicit manual inspection status
    - verifier returns PASS, FAIL, or UNVERIFIED with explicit manual smoke status
    - reviewer/verifier approvals only count if they reference the same revision id
    - supervisor chooses:
      - approve
      - extend with written justification
      - stop and report failure to meet bar

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
    required:
      - reviewer == APPROVED
      - verifier == PASS
      - reviewer.revision_id == verifier.revision_id
      - if deliverable is user-facing, reviewer.manual_inspection_status == performed or blocked_with_explicit_reason
      - if deliverable is user-facing, verifier.manual_smoke_status == performed or blocked_with_explicit_reason
      - supervisor publishes final decision

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
    agent_response_timeout_seconds: 300
    max_consecutive_empty_polls: 3
    poll_interval_seconds: 30-60
    on_timeout:
      - supervisor sends direct probe message to unresponsive agent
      - wait one additional poll cycle (60 seconds)
      - if still unresponsive, escalate
    on_escalation:
      - mark agent task as blocked
      - if agent is worker (critical path): invoke emergency_stop
      - if agent is non-critical: note gap and attempt to proceed
    on_emergency_stop:
      - broadcast emergency stop to all agents
      - publish STATE SUMMARY with status blocked_by_agent_failure
      - write TEAM_BLOCKED.md report in supervisor worktree
      - execute clawteam lifecycle request-shutdown
      - stop polling, do not continue indefinitely

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
```

## Canonical State Summary Format

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
- exploring | revising | converging | finalizing
```
