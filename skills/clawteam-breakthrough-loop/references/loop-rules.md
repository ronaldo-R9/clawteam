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
    - reviewer reviews
    - verifier verifies
    - supervisor publishes:
      - round decision
      - state summary round 1

  round_2:
    - worker revises or pivots based on round decision
    - reviewer reviews
    - verifier verifies
    - if same blocker appears twice:
      - supervisor forces targeted re-exploration
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
    - worker produces convergence submission
    - reviewer checks quality, coherence, and preserved ambition
    - verifier checks supportability, constraints, and required claim downgrades
    - supervisor publishes:
      - convergence decision
      - state summary round 3

  round_4:
    - final tightening only
    - worker applies last blocking fixes
    - reviewer returns APPROVED or CHANGES_REQUIRED
    - verifier returns PASS, FAIL, or UNVERIFIED
    - supervisor chooses:
      - approve
      - extend with written justification
      - stop and report failure to meet bar

  state_summarization:
    trigger_points:
      - after every review and verification cycle
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
      - supervisor publishes final decision

  failure_condition:
    any_of:
      - max_rounds_exhausted_without_acceptance
      - unresolved_structural_blockers
      - critical_constraints_remain_failed
      - supervisor_stops_after_round_3_or_4

  extension_rule:
    - extension beyond round 4 requires explicit written justification from supervisor
    - justification must explain:
      - why another round is likely to change the outcome
      - why scope reduction is not preferable
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
