# Orchestration Spec

```yaml
orchestration:
  name: breakthrough-loop
  mode: breakthrough
  runtime:
    command: codex
    backend: tmux
    workspace_mode: isolated
    repo_required: true
    inter_agent_language: "{language}" variable, defaults to "Simplified Chinese"

  rounds:
    max_rounds: 4
    round_0: exploration_required
    round_1: bold_first_submission
    round_2: revise_or_targeted_reexploration
    round_3: forced_convergence
    round_4: final_tightening_only

  acceptance:
    required:
      - reviewer_status == APPROVED
      - verifier_status == PASS
      - reviewer_revision_id == verifier_revision_id
    allowed_final_statuses:
      - approved: both gates pass on same revision
      - conditional_accept: work substantially complete with documented caveats (unverified claims relabeled, non-critical scope deferred)
      - not_approved: gates not satisfied
    rule:
      - unsupported upside claims must be downgraded to hypotheses, experiments, or future work
      - user-facing deliverables require explicit visible-surface review and runtime smoke evidence before acceptance
      - only supervisor may publish final decision
      - conditional_accept requires explicit documentation of caveats and residual risks

  team:
    leader: supervisor
    agents:
      - worker
      - explorer
      - reviewer
      - verifier

  authority:
    supervisor:
      can:
        - define_goal
        - define_deliverable
        - define_success_criteria
        - define_constraints
        - require_exploration
        - request_revision
        - merge_gate_feedback
        - issue_single_revision_brief
        - request_pivot
        - force_state_summarization
        - force_convergence
        - scope_reduce
        - conditional_accept
        - extend_rounds
        - finalize_or_stop
        - invoke_fast_track_for_minor_fixes
        - send_role_specific_kickoff
        - probe_agent_health
        - invoke_emergency_stop
        - write_team_blocked_report
      cannot:
        - replace_worker_or_other_roles
        - edit_product_files_except_coordination_reports
        - bypass_reviewer_and_verifier_acceptance
        - proceed_without_required_gate_roles_after_timeout
        - perform_substitute_review_or_verification
        - broadcast_undifferentiated_kickoff
        - poll_indefinitely_without_escalation

    worker:
      can:
        - produce_main_output
        - choose_between_explorer_directions
        - request_clarification
        - request_new_exploration
      cannot:
        - self_approve
        - ignore_blocking_feedback
        - treat_raw_reviewer_or_verifier_feedback_as_authoritative_without_supervisor_merge
        - start_next_scope_after_submission_before_revision_brief

    explorer:
      can:
        - propose_safe_option
        - propose_bold_option
        - propose_weird_but_plausible_option
        - challenge_assumptions
        - recommend_pivot
        - targeted_research_for_specific_blockers (round 2+)
        - convergence_assistance_and_scope_cut_advice (round 3+)
        - review_worker_submissions_via_cc
      cannot:
        - own_final_implementation
        - declare_final_acceptance

    reviewer:
      scope: static analysis and design review only — does NOT run code
      can:
        - block_weak_work
        - require_revision
        - require_clearer_tradeoffs
        - flag_safe_but_underwhelming_results
        - block_visible_surface_design_defects
        - review_code_architecture_and_structure
        - review_ux_design_from_templates_and_components
        - fast_track_confirm_for_single_issue_fixes
      cannot:
        - approve_for_effort
        - reject_novelty_only_for_being_unfamiliar
        - directly_assign_worker_todos_as_canonical_instructions
        - run_application_or_perform_runtime_testing
        - make_claims_about_runtime_behavior

    verifier:
      scope: runtime verification only — does NOT judge design quality
      can:
        - validate_claims_by_running_code
        - fail_unsupported_or_false_claims
        - require_rewrites
        - downgrade_unverified_claims
        - require_runtime_smoke_evidence_for_user_facing_claims
        - run_automated_tests
        - fast_track_confirm_for_single_issue_fixes
      cannot:
        - make_subjective_design_or_taste_decisions
        - approve_without_runtime_evidence
        - directly_assign_worker_todos_as_canonical_instructions
        - judge_code_architecture_or_structure

  convergence_policy:
    round_3_rule:
      - supervisor must explicitly choose one:
        - converge_current_direction
        - pivot_once_to_best_available_alternative
        - scope_reduce: narrow success criteria to achievable MVP and continue
        - stop_and_report_blockers
      - open-ended exploration may not continue unchanged in round 3
      - scope_reduce requires publishing revised success criteria and notifying all agents
    round_4_rule:
      - round 4 is final tightening only
      - no broad re-exploration unless supervisor overrides with written justification

  state_management:
    canonical_state_owner: supervisor
    summarization_required: true
    summary_is_binding: true
    revision_binding_required: true
    numbering_convention:
      - state summary numbers are bound to actual round numbers
      - round-level summaries: "第 N 轮状态摘要"
      - mid-round status updates: "第 N 轮状态更新 (序号 X)"
      - do NOT increment the round number for intermediate events
    required_triggers:
      - after_each_review_verification_cycle
      - after_any_reviewer_verifier_disagreement
      - before_round_3
      - on_context_drift
      - on_repeated_failure
      - when_context_is_too_large
    rule:
      - each new round should consume the latest canonical state summary first
      - older discussion is archival, not primary working context
      - worker acts on the latest supervisor revision brief, not on unsynthesized gate feedback

  liveness_contract:
    supervisor:
      - after kickoff, round decisions, and worker submissions, track the next expected agent messages against the timeout policy
      - distinguish silent timeout (no communication, 5 min) from acknowledged-busy timeout (heartbeat received, 15 min)
      - before probing, check agent worktree for file changes via clawteam context diff
      - if any agent remains unresponsive or blocked beyond the applicable timeout, invoke emergency stop for the whole team
      - do not continue with reduced coverage or replace the missing role
      - within 60 seconds after kickoff, send verification ping to reviewer, verifier, and explorer to confirm inbox watch state
      - if any agent responds with idle or does not confirm within 120 seconds, send explicit inbox watch command
    worker:
      - after each submission, remain paused until supervisor publishes the merged revision brief or shutdown
      - if the merged brief is delayed beyond timeout, report the wait and keep waiting
      - all non-submission cross-role requests must go through supervisor
    reviewer_verifier_and_explorer:
      - FIRST ACTION after kickoff: start `while true; do clawteam inbox receive <team> --agent <name>; sleep 15; done`
      - after every formal result, immediately return to the inbox loop
      - NEVER execute `clawteam lifecycle idle` — idle is only permitted after explicit shutdown request
      - NEVER mark task as completed until supervisor requests shutdown
      - "no revision yet" means "wait in inbox loop", NOT "I am done"

  anti_patterns:
    forbidden:
      - receiving kickoff → finding no revision → calling lifecycle idle
      - completing first exploration → marking task completed → exiting
      - waiting for revision → sitting at shell prompt without polling inbox
      - worker sending direct request messages to explorer or other agents (must route through supervisor)
```
