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
    - state summary becomes primary context after each cycle
    - round 3 must force convergence
    - round 4 is final tightening, not open exploration

  stop_conditions:
    - final acceptance reached
    - supervisor stops after blockers
    - explicit scope narrowing chosen
```
