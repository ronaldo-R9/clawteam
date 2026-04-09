# Message Protocol

```yaml
message_protocol:
  language:
    default: "{language}" template variable, defaults to "Simplified Chinese"
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
        - CROSS_ROLE_ROUTING_RULE: all non-submission requests to other agents must go through supervisor
      explorer:
        - EXPLORATION_MANDATE
        - OPTION_REQUIREMENTS
        - CONTINUOUS_PRESENCE_RULE: must stay in inbox loop after initial exploration, do NOT idle or mark completed
        - EXPLICIT_INBOX_WATCH_COMMAND
      reviewer:
        - REVIEW_STANDARDS
        - BLOCKING_CRITERIA
        - UI_UX_INSPECTION_REQUIREMENTS
        - REPORT_TO_SUPERVISOR_ONLY
        - CONTINUOUS_PRESENCE_RULE: must start inbox loop immediately, do NOT idle when no revision exists
        - EXPLICIT_INBOX_WATCH_COMMAND
      verifier:
        - VERIFICATION_STANDARDS
        - SMOKE_TEST_REQUIREMENTS
        - RUNTIME_EVIDENCE_REQUIREMENTS
        - REPORT_TO_SUPERVISOR_ONLY
        - CONTINUOUS_PRESENCE_RULE: must start inbox loop immediately, do NOT idle when no revision exists
        - EXPLICIT_INBOX_WATCH_COMMAND

  kickoff_verification:
    sender: supervisor
    recipients:
      - reviewer
      - verifier
      - explorer
    trigger: 60 seconds after all kickoffs sent
    content: "请确认你已进入 inbox watch 状态。"
    escalation: if no confirmation within 120 seconds, send explicit inbox watch command
    purpose: prevent agents from entering idle state instead of inbox polling loop

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
      - explorer
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
    scope: static analysis and design review only
    recipients:
      - supervisor
    fields:
      - ROUND_NUMBER
      - REVISION_ID
      - STATUS
      - STATIC_ANALYSIS_CHECKS
      - DESIGN_UX_CHECKS
      - BLOCKING_ISSUES
      - MISSED_UPSIDE
      - OVERENGINEERING_OR_DIFFUSION_WARNINGS
      - RECOMMENDED_SUPERVISOR_REVISION_BRIEF

  verification:
    sender: verifier
    scope: runtime verification only
    recipients:
      - supervisor
    fields:
      - ROUND_NUMBER
      - REVISION_ID
      - STATUS
      - RUNTIME_SMOKE_STATUS
      - RUNTIME_EVIDENCE
      - CHECKS_RUN
      - VERIFIED_CLAIMS_WITH_RUNTIME_EVIDENCE
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

  waiting_contract:
    worker:
      - after each submission, pause until supervisor sends the next merged revision brief
      - if the merged brief is delayed beyond timeout, notify supervisor and remain paused
      - raw reviewer/verifier reports are evidence only, not direct work orders
    reviewer_and_verifier:
      - after kickoff and after each formal report, return to an explicit inbox receive/watch loop
      - do not use task wait or passive shell idle as a substitute for inbox polling
      - only act on inbox traffic tied to a revision id, supervisor clarification, or shutdown
    supervisor:
      - after worker submission, expect paired review and verification results within the timeout policy
      - if any agent is unresponsive or blocked beyond timeout, broadcast emergency stop and request shutdown

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

  fast_track_brief:
    sender: supervisor
    recipients:
      - worker
      - reviewer
      - verifier
    precondition: exactly 1 blocking issue, no design change, both gates agreed on same issue
    fields:
      - SOURCE_REVISION_ID
      - TARGET_REVISION_ID
      - SINGLE_FIX_ITEM
      - RESUBMISSION_REQUIREMENT: reviewer/verifier reply "confirmed on r<n>" or reject

  fast_track_confirm:
    sender: reviewer or verifier
    recipients:
      - supervisor
    fields:
      - REVISION_ID
      - STATUS: confirmed or rejected with reason

  final_decision:
    sender: supervisor
    recipients:
      - user
    fields:
      - FINAL_STATUS: approved | conditional_accept | not_approved
      - WHY
      - BREAKTHROUGH_VALUE
      - WHAT_CHANGED_ACROSS_ROUNDS
      - RESIDUAL_RISKS
      - FUTURE_EXPERIMENTS
      - ACCEPTED_CAVEATS (conditional_accept only)
      - DEFERRED_SCOPE (conditional_accept only)
```
