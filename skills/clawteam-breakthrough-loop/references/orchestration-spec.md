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
    inter_agent_language: zh-CN by default unless user overrides

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
    rule:
      - unsupported upside claims must be downgraded to hypotheses, experiments, or future work
      - user-facing deliverables require explicit visible-surface review and runtime smoke evidence before acceptance
      - only supervisor may publish final decision

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
        - extend_rounds
        - finalize_or_stop
        - send_role_specific_kickoff
        - probe_agent_health
        - invoke_emergency_stop
        - write_team_blocked_report
      cannot:
        - silently_replace_worker
        - bypass_reviewer_and_verifier_acceptance
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
      cannot:
        - own_final_implementation
        - declare_final_acceptance

    reviewer:
      can:
        - block_weak_work
        - require_revision
        - require_clearer_tradeoffs
        - flag_safe_but_underwhelming_results
        - block_visible_surface_defects
      cannot:
        - approve_for_effort
        - reject_novelty_only_for_being_unfamiliar
        - directly_assign_worker_todos_as_canonical_instructions

    verifier:
      can:
        - validate_claims
        - fail_unsupported_or_false_claims
        - require_rewrites
        - downgrade_unverified_claims
        - require_runtime_smoke_evidence_for_user_facing_claims
      cannot:
        - make_subjective_taste_decisions
        - approve_without_evidence
        - directly_assign_worker_todos_as_canonical_instructions

  convergence_policy:
    round_3_rule:
      - supervisor must explicitly choose one:
        - converge_current_direction
        - pivot_once_to_best_available_alternative
        - stop_and_report_blockers
      - open-ended exploration may not continue unchanged in round 3
    round_4_rule:
      - round 4 is final tightening only
      - no broad re-exploration unless supervisor overrides with written justification

  state_management:
    canonical_state_owner: supervisor
    summarization_required: true
    summary_is_binding: true
    revision_binding_required: true
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
```
