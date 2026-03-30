# Message Protocol

```yaml
message_protocol:
  language:
    default: Simplified Chinese
    override_rule: user may explicitly request another language
    preserve_literals:
      - code
      - commands
      - file_paths
      - api_names
      - branch_names
      - identifiers

  kickoff:
    sender: supervisor
    delivery: per_role
    delivery_method: clawteam inbox send (NOT broadcast)
    delivery_rule: >
      Send one separate message to each agent. Each message contains the shared
      fields plus ONLY the role_specific_fields for that agent. Never include
      another agent's role-specific instructions. After all four messages are
      sent, broadcast a single short confirmation "团队已启动" (no task details).
    shared_fields:
      - GOAL
      - DELIVERABLE
      - SUCCESS_CRITERIA
      - BREAKTHROUGH_TARGET
      - MAX_ROUNDS
    role_specific_fields:
      worker:
        - SUBMISSION_PROTOCOL
        - REVISION_ID_RULE
        - IMPLEMENTATION_CONSTRAINTS
      explorer:
        - EXPLORATION_MANDATE
        - OPTION_REQUIREMENTS
      reviewer:
        - REVIEW_STANDARDS
        - BLOCKING_CRITERIA
        - UI_UX_INSPECTION_REQUIREMENTS
        - REPORT_TO_SUPERVISOR_ONLY
      verifier:
        - VERIFICATION_STANDARDS
        - SMOKE_TEST_REQUIREMENTS
        - RUNTIME_EVIDENCE_REQUIREMENTS
        - REPORT_TO_SUPERVISOR_ONLY

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
      - REVISION_ID
      - CHOSEN_DIRECTION
      - WHY_THIS_DIRECTION
      - USED_FROM_EXPLORER
      - REJECTED_FROM_EXPLORER
      - MAIN_OUTPUT
      - USER_VISIBLE_CHANGES
      - MANUAL_SMOKE_PATH
      - RISKY_PARTS
      - REQUESTED_REVIEW_FOCUS

  review:
    sender: reviewer
    recipients:
      - supervisor
    fields:
      - ROUND_NUMBER
      - REVISION_ID
      - STATUS
      - MANUAL_INSPECTION_STATUS
      - VISIBLE_SURFACE_CHECKS
      - BLOCKING_ISSUES
      - MISSED_UPSIDE
      - OVERENGINEERING_OR_DIFFUSION_WARNINGS
      - RECOMMENDED_SUPERVISOR_REVISION_BRIEF

  verification:
    sender: verifier
    recipients:
      - supervisor
    fields:
      - ROUND_NUMBER
      - REVISION_ID
      - STATUS
      - MANUAL_SMOKE_STATUS
      - RUNTIME_EVIDENCE
      - CHECKS_RUN
      - VERIFIED_CLAIMS
      - UNVERIFIED_CLAIMS
      - FAILED_CONSTRAINTS
      - RECOMMENDED_SUPERVISOR_REVISION_BRIEF

  revision_brief:
    sender: supervisor
    recipients:
      - worker
      - reviewer
      - verifier
    fields:
      - ROUND_NUMBER
      - SOURCE_REVISION_ID
      - TARGET_REVISION_ID
      - REVIEWER_STATUS
      - VERIFIER_STATUS
      - MERGED_BLOCKING_ISSUES
      - REQUIRED_WORKER_ACTIONS
      - DEFERRED_ITEMS
      - RESUBMISSION_REQUIREMENTS

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
      - ACTIVE_REVISION_ID
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
