# Message Protocol

```yaml
message_protocol:
  kickoff:
    sender: supervisor
    recipients:
      - worker
      - explorer
      - reviewer
      - verifier
    fields:
      - GOAL
      - DELIVERABLE
      - SUCCESS_CRITERIA
      - CONSTRAINTS
      - BREAKTHROUGH_TARGET
      - MAX_ROUNDS

  exploration:
    sender: explorer
    recipients:
      - worker
      - supervisor
    fields:
      - ROUND_NUMBER
      - SAFE_OPTION
      - BOLD_OPTION
      - WEIRD_BUT_PLAUSIBLE_OPTION
      - ASSUMPTIONS_TO_CHALLENGE
      - RECOMMENDED_DIRECTION

  submission:
    sender: worker
    recipients:
      - reviewer
      - verifier
      - supervisor
    fields:
      - ROUND_NUMBER
      - CHOSEN_DIRECTION
      - WHY_THIS_DIRECTION
      - USED_FROM_EXPLORER
      - REJECTED_FROM_EXPLORER
      - MAIN_OUTPUT
      - RISKY_PARTS
      - REQUESTED_REVIEW_FOCUS

  review:
    sender: reviewer
    recipients:
      - worker
      - supervisor
    fields:
      - ROUND_NUMBER
      - STATUS
      - BLOCKING_ISSUES
      - MISSED_UPSIDE
      - OVERENGINEERING_OR_DIFFUSION_WARNINGS
      - REVISION_OR_PIVOT_INSTRUCTIONS

  verification:
    sender: verifier
    recipients:
      - worker
      - supervisor
    fields:
      - ROUND_NUMBER
      - STATUS
      - CHECKS_RUN
      - VERIFIED_CLAIMS
      - UNVERIFIED_CLAIMS
      - FAILED_CONSTRAINTS
      - REQUIRED_REWRITES

  state_summary:
    sender: supervisor
    recipients:
      - worker
      - explorer
      - reviewer
      - verifier
    fields:
      - ROUND_NUMBER
      - CURRENT_DIRECTION
      - WHY_THIS_DIRECTION_IS_ACTIVE
      - REJECTED_DIRECTIONS
      - VERIFIED_FACTS
      - UNVERIFIED_HYPOTHESES
      - BLOCKING_ISSUES
      - RESOLVED_ISSUES
      - ACTIVE_CONSTRAINTS
      - NEXT_REQUIRED_ACTION
      - CONVERGENCE_STATUS

  round_decision:
    sender: supervisor
    recipients:
      - worker
      - explorer
      - reviewer
      - verifier
    fields:
      - ROUND_NUMBER
      - STATUS
      - RATIONALE
      - NEXT_PRIORITY

  final_decision:
    sender: supervisor
    recipients:
      - user
    fields:
      - FINAL_STATUS
      - WHY
      - BREAKTHROUGH_VALUE
      - WHAT_CHANGED_ACROSS_ROUNDS
      - RESIDUAL_RISKS
      - FUTURE_EXPERIMENTS
```
