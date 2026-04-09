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
    - inter_agent_language: "{language}" template variable, defaults to "Simplified Chinese"

  spawn_order:
    - create team with supervisor
    - create role tasks
    - spawn worker
    - spawn explorer
    - spawn reviewer
    - spawn verifier
    - send kickoff from supervisor (per-role, with explicit inbox watch commands for reviewer/verifier/explorer)
    - supervisor sends verification ping within 60 seconds to confirm reviewer/verifier/explorer are in inbox watch state

  operating_notes:
    - review and verification happen every round
    - reviewer does static analysis and design review only (does not run code)
    - verifier does runtime verification only (does not judge design)
    - worker submissions must carry a revision id and are CC'd to explorer
    - reviewer and verifier send formal gate results to supervisor first
    - reviewer, verifier, and explorer must start inbox polling loop as FIRST ACTION after kickoff and NEVER call lifecycle idle
    - kickoff must include explicit inbox watch command for reviewer/verifier/explorer
    - worker must route all non-submission cross-role requests through supervisor
    - supervisor merges both gate results into one authoritative revision brief for worker
    - for minor single-issue fixes, supervisor may use fast-track protocol (reviewer/verifier confirm with short reply)
    - worker pauses after each submission until the merged revision brief arrives
    - user-facing deliverables require explicit visible-surface acceptance criteria
    - reviewer must review user-facing design from code/templates before approval
    - verifier must actually run the application and test user flows before PASS
    - state summary becomes primary context after each cycle; numbering bound to actual round, mid-round updates use sub-numbering
    - round 3 must force convergence (converge, pivot, scope_reduce, or stop)
    - round 4 is final tightening, not open exploration
    - supervisor may issue conditional_accept when work is substantially complete with documented caveats
    - supervisor must stop the whole team on long blockage and must not take over implementation or gate duties
    - timeout distinguishes silent (5 min) from acknowledged-busy (15 min); check worktree changes before probing

  stop_conditions:
    - final acceptance (approved or conditional_accept) reached
    - supervisor stops after blockers
    - explicit scope narrowing chosen
    - agent unresponsive beyond silent timeout (5 min) or acknowledged-busy timeout (15 min)
    - critical infrastructure failure (npm, build, network) not resolvable by the team
```
