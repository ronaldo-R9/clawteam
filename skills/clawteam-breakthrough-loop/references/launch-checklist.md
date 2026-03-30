# Launch Checklist

```yaml
launch_checklist:
  required_inputs:
    - task_goal
    - expected_deliverable
    - success_criteria
    - hard_constraints
    - repository_path
    - desired_breakthrough_target

  runtime_defaults:
    - command: codex
    - backend: tmux
    - isolated_workspace_per_agent: true
    - max_rounds: 4
    - command_override_supported_via_launch_flags
    - inter_agent_language: Simplified Chinese by default unless user overrides

  spawn_order:
    - create team with supervisor
    - create role tasks
    - spawn worker
    - spawn explorer
    - spawn reviewer
    - spawn verifier
    - send kickoff from supervisor

  operating_notes:
    - review and verification happen every round
    - worker submissions must carry a revision id
    - reviewer and verifier send formal gate results to supervisor first
    - supervisor merges both gate results into one authoritative revision brief for worker
    - user-facing deliverables require explicit visible-surface acceptance criteria
    - reviewer must manually inspect user-facing surfaces before approval
    - verifier must record runtime smoke evidence for end-user flows before PASS
    - state summary becomes primary context after each cycle
    - round 3 must force convergence
    - round 4 is final tightening, not open exploration

  stop_conditions:
    - final acceptance reached
    - supervisor stops after blockers
    - explicit scope narrowing chosen
    - agent unresponsive beyond timeout (5 minutes with no inbox message or task progress)
    - critical infrastructure failure (npm, build, network) not resolvable by the team
```
