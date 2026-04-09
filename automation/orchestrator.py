"""Entry point for the external orchestration loop."""

from __future__ import annotations

import json
import logging
import shutil
import time
from pathlib import Path
from typing import Any

try:
    from .cli import build_parser
    from .command_runner import CommandRunner
    from .diagnosis import DiagnosisClient
    from .health_rules import evaluate_snapshot, is_p0_failure, success_flags
    from .models import (
        DEFAULTS,
        DiagnosisVerdict,
        MonitorSnapshot,
        RunContext,
        SchedulerDecision,
        State,
        write_json_file,
    )
    from .patch_executor import PatchExecutor
    from .scheduler import SchedulerClient
    from .snapshot import SnapshotCollector
    from .state_machine import StateMachine
    from .validators import ValidationError, Validator
except ImportError:
    from cli import build_parser
    from command_runner import CommandRunner
    from diagnosis import DiagnosisClient
    from health_rules import evaluate_snapshot, is_p0_failure, success_flags
    from models import (
        DEFAULTS,
        DiagnosisVerdict,
        MonitorSnapshot,
        RunContext,
        SchedulerDecision,
        State,
        write_json_file,
    )
    from patch_executor import PatchExecutor
    from scheduler import SchedulerClient
    from snapshot import SnapshotCollector
    from state_machine import StateMachine
    from validators import ValidationError, Validator

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


class OrchestratorScaffold:
    """A first runnable version of the external loop, with live ClawTeam monitoring."""

    def __init__(
        self,
        repo_path: Path,
        team_name: str,
        goal: str,
        template_name: str = "breakthrough-loop",
        execution_enabled: bool = True,
    ) -> None:
        self.ctx = RunContext(
            repo_path=repo_path,
            base_team_name=team_name,
            goal=goal,
            template_name=template_name,
            execution_enabled=execution_enabled,
        )
        self.runner = CommandRunner(self.ctx.repo_path)
        self.validator = Validator(self.ctx)
        self.collector = SnapshotCollector(self.ctx)
        self.scheduler = SchedulerClient(self.ctx)
        self.diagnoser = DiagnosisClient(self.ctx)
        self.patch_executor = PatchExecutor(self.ctx)
        self.machine = StateMachine(self.ctx)
        self.machine.register_many(
            {
                State.INIT: self.handle_init,
                State.PRECHECK: self.handle_precheck,
                State.LAUNCH: self.handle_launch,
                State.WARMUP_OBSERVE: self.handle_warmup_observe,
                State.ACTIVE_MONITOR: self.handle_active_monitor,
                State.SUCCESS_HOLD: self.handle_success_hold,
                State.STOP_SUCCESS: self.handle_stop_success,
                State.FAILURE_DETECTED: self.handle_failure_detected,
                State.SNAPSHOT_PRE_STOP: self.handle_snapshot_pre_stop,
                State.GRACEFUL_STOP: self.handle_graceful_stop,
                State.SNAPSHOT_POST_STOP: self.handle_snapshot_post_stop,
                State.DIAGNOSE: self.handle_diagnose,
                State.PATCH_PLAN: self.handle_patch_plan,
                State.APPLY_PATCH: self.handle_apply_patch,
                State.VALIDATE_PATCH: self.handle_validate_patch,
                State.CLEANUP: self.handle_cleanup,
                State.RELAUNCH_DECISION: self.handle_relaunch_decision,
                State.ESCALATE_HUMAN: self.handle_escalate_human,
            }
        )

    def _tick_id(self) -> str:
        return f"tick-{len(self.ctx.monitor_history) + 1:03d}"

    def _dashboard_pid_path(self) -> Path:
        return self.ctx.attempt_dir / "dashboard.pid"

    def _launch_pid_path(self) -> Path:
        return self.ctx.attempt_dir / "launch.pid"

    def _dashboard_logs(self) -> tuple[Path, Path]:
        return (
            self.ctx.attempt_dir / "dashboard.stdout.log",
            self.ctx.attempt_dir / "dashboard.stderr.log",
        )

    def _launch_logs(self) -> tuple[Path, Path]:
        return (
            self.ctx.attempt_dir / "launch.stdout.log",
            self.ctx.attempt_dir / "launch.stderr.log",
        )

    def _lsof_available(self) -> bool:
        return shutil.which("lsof") is not None

    def _port_in_use(self, port: int) -> bool:
        if not self._lsof_available():
            return False
        result = self.runner.run(["lsof", "-ti", f":{port}"], check=False)
        return result.returncode == 0 and bool(result.stdout.strip())

    def _start_dashboard(self) -> dict[str, Any]:
        command = [
            DEFAULTS.dashboard_python,
            str(self.ctx.dashboard_server_path),
            self.ctx.team_name,
            "--port",
            str(DEFAULTS.dashboard_port),
        ]
        if self._port_in_use(DEFAULTS.dashboard_port):
            return {
                "started": False,
                "reason": f"port {DEFAULTS.dashboard_port} already in use",
                "command": command,
            }

        stdout_path, stderr_path = self._dashboard_logs()
        process = self.runner.start_background(command, stdout_path, stderr_path)
        self.ctx.dashboard_pid = process.pid
        self._dashboard_pid_path().write_text(str(process.pid), encoding="utf-8")
        return {
            "started": True,
            "pid": process.pid,
            "command": command,
            "stdout_log": str(stdout_path),
            "stderr_log": str(stderr_path),
        }

    def _stop_dashboard(self) -> dict[str, Any]:
        pid = self.ctx.dashboard_pid
        if pid is None and self._dashboard_pid_path().exists():
            content = self._dashboard_pid_path().read_text(encoding="utf-8").strip()
            pid = int(content) if content else None
        self.runner.terminate_process(pid)
        return {"stopped": pid is not None, "pid": pid}

    def _launch_command(self) -> list[str]:
        return [
            "clawteam",
            "launch",
            self.ctx.template_name,
            "-g",
            self.ctx.goal,
            "-t",
            self.ctx.team_name,
            "--repo",
            str(self.ctx.repo_path),
            "--command",
            "codex",
        ]

    def _team_exists(self, team_name: str) -> bool:
        teams = self.runner.run_json(["clawteam", "--json", "team", "discover"])
        return any(item.get("name") == team_name for item in teams)

    def _start_launch_process(self) -> dict[str, Any]:
        command = self._launch_command()
        stdout_path, stderr_path = self._launch_logs()
        process = self.runner.start_background(command, stdout_path, stderr_path)
        self.ctx.launch_pid = process.pid
        self._launch_pid_path().write_text(str(process.pid), encoding="utf-8")
        return {
            "started": True,
            "pid": process.pid,
            "command": command,
            "stdout_log": str(stdout_path),
            "stderr_log": str(stderr_path),
        }

    def _stop_launch_process(self) -> dict[str, Any]:
        pid = self.ctx.launch_pid
        if pid is None and self._launch_pid_path().exists():
            content = self._launch_pid_path().read_text(encoding="utf-8").strip()
            pid = int(content) if content else None
        self.runner.terminate_process(pid)
        return {"stopped": pid is not None, "pid": pid}

    def _write_launch_plan(self) -> dict[str, Any]:
        launch_plan = {
            "team_name": self.ctx.team_name,
            "goal": self.ctx.goal,
            "template_name": self.ctx.template_name,
            "team_model": DEFAULTS.team_model,
            "team_reasoning_effort": DEFAULTS.team_reasoning_effort,
            "scheduler_model": DEFAULTS.scheduler_model,
            "scheduler_reasoning_effort": DEFAULTS.scheduler_reasoning_effort,
            "inner_max_rounds": DEFAULTS.inner_max_rounds,
            "dashboard_port": DEFAULTS.dashboard_port,
            "dashboard_start_command": [
                DEFAULTS.dashboard_python,
                str(self.ctx.dashboard_server_path),
                self.ctx.team_name,
                "--port",
                str(DEFAULTS.dashboard_port),
            ],
            "clawteam_launch_command": self._launch_command(),
        }
        write_json_file(self.ctx.attempt_dir / "launch_plan.json", launch_plan)
        return launch_plan

    def _write_attempt_log(self, name: str, content: str) -> None:
        (self.ctx.attempt_dir / name).write_text(content, encoding="utf-8")

    def _collect_live_snapshot(self, phase: str) -> MonitorSnapshot:
        tick_id = self._tick_id()
        tick_dir = self.ctx.attempt_dir / "monitor_ticks" / tick_id
        tick_dir.mkdir(parents=True, exist_ok=True)

        board = self.runner.run_json(["clawteam", "--json", "board", "show", self.ctx.team_name])
        team_status = self.runner.run_json(
            ["clawteam", "--json", "team", "status", self.ctx.team_name]
        )
        tasks = self.runner.run_json(["clawteam", "--json", "task", "list", self.ctx.team_name])
        inboxes = {
            role: self.runner.run_json(
                ["clawteam", "--json", "inbox", "peek", self.ctx.team_name, "--agent", role]
            )
            for role in ("supervisor", "worker", "explorer", "reviewer", "verifier")
        }

        write_json_file(tick_dir / "board.json", board)
        write_json_file(tick_dir / "team_status.json", team_status)
        write_json_file(tick_dir / "tasks.json", {"tasks": tasks})
        for role, payload in inboxes.items():
            write_json_file(tick_dir / f"inbox_{role}.json", payload)

        snapshot = self.collector.normalize_monitor_snapshot(
            tick_id=tick_id,
            team_name=self.ctx.team_name,
            board=board,
            team_status=team_status,
            tasks=tasks,
            inboxes=inboxes,
            phase=phase,
        )

        previous = self.ctx.monitor_history[-1] if self.ctx.monitor_history else None
        if previous is not None:
            for role, member in snapshot.members.items():
                prev = previous.members.get(role)
                member.has_new_activity = bool(prev and prev.last_event_at != member.last_event_at)

        self.collector.write_monitor_snapshot(tick_dir / "normalized_snapshot.json", snapshot)
        return snapshot

    def _collect_pre_stop_snapshot(self) -> None:
        directory = self.collector.pre_stop_dir()
        directory.mkdir(parents=True, exist_ok=True)
        snapshot = self._collect_live_snapshot("monitor")
        self.collector.write_monitor_snapshot(directory / "normalized_snapshot.json", snapshot)
        self.collector.write_json(
            directory / "environment_summary.json",
            {
                "repo_path": str(self.ctx.repo_path),
                "team_name": self.ctx.team_name,
                "template_path": str(self.ctx.template_path),
                "dashboard_server_path": str(self.ctx.dashboard_server_path),
                "clawteam_version": self.runner.run(["clawteam", "--version"]).stdout.strip(),
            },
        )
        directory.joinpath("template_copy.toml").write_text(
            self.ctx.template_path.read_text(encoding="utf-8"),
            encoding="utf-8",
        )

    def _collect_post_stop_snapshot(self) -> None:
        directory = self.collector.post_stop_dir()
        directory.mkdir(parents=True, exist_ok=True)
        commands = self.collector.live_command_plan(self.ctx.team_name)
        for name, argv in commands.items():
            if name == "events_dir":
                self.collector.write_text(directory / "events_dir.txt", argv[0] + "\n")
                continue
            result = self.runner.run(argv, check=False)
            payload = {
                "argv": argv,
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
            }
            write_json_file(directory / f"{name}.json", payload)

    def _cleanup_team(self) -> dict[str, Any]:
        result = self.runner.run(
            ["clawteam", "team", "cleanup", self.ctx.team_name, "--force"],
            check=False,
        )
        payload = {
            "argv": result.argv,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
        write_json_file(self.ctx.attempt_dir / "cleanup_result.json", payload)
        return payload

    def handle_unexpected_failure(self, message: str) -> None:
        if self.ctx.manifest is not None and not self.ctx.manifest.stopped_at:
            self.ctx.manifest.mark_stopped(reason_code="unexpected_failure", success=False)
            self.collector.write_manifest()
        self._stop_launch_process()
        self._stop_dashboard()
        if self.ctx.current_attempt:
            self._cleanup_team()
        self.collector.write_final_status(
            {
                "status": "failed_runtime_exception",
                "attempt_id": self.ctx.attempt_id if self.ctx.current_attempt else "",
                "message": message,
            }
        )

    def handle_init(self, ctx: RunContext) -> State:
        return State.PRECHECK

    def handle_precheck(self, ctx: RunContext) -> State:
        self.validator.validate_precheck()
        ctx.run_root.mkdir(parents=True, exist_ok=True)
        return State.LAUNCH

    def handle_launch(self, ctx: RunContext) -> State:
        ctx.current_attempt += 1
        if ctx.current_attempt > ctx.max_attempts:
            return State.ESCALATE_HUMAN

        ctx.ensure_attempt_dirs()
        ctx.new_manifest()
        self.collector.write_manifest()
        launch_plan = self._write_launch_plan()
        if ctx.execution_enabled:
            dashboard_result = self._start_dashboard()
            write_json_file(ctx.attempt_dir / "dashboard_start.json", dashboard_result)
            launch_result = self._start_launch_process()
            write_json_file(
                ctx.attempt_dir / "launch_result.json",
                launch_result,
            )
            deadline = time.time() + 60
            while time.time() < deadline:
                if self._team_exists(ctx.team_name):
                    break
                time.sleep(2)
            else:
                raise RuntimeError(f"team did not appear after launch: {ctx.team_name}")
        else:
            write_json_file(ctx.attempt_dir / "launch_result.json", {"plan_only": True, **launch_plan})
        return State.WARMUP_OBSERVE

    def handle_warmup_observe(self, ctx: RunContext) -> State:
        if ctx.execution_enabled:
            time.sleep(DEFAULTS.warmup_window_seconds)
        return State.ACTIVE_MONITOR

    def handle_active_monitor(self, ctx: RunContext) -> State:
        if not ctx.execution_enabled:
            raise NotImplementedError("ACTIVE_MONITOR requires live clawteam integration.")

        for _ in range(DEFAULTS.monitor_max_ticks):
            snapshot = self._collect_live_snapshot("monitor")
            ctx.latest_snapshot = snapshot
            findings = evaluate_snapshot(snapshot, ctx.monitor_history)
            decision = self.scheduler.fallback_decision(snapshot, findings)
            ctx.latest_scheduler_decision = decision
            ctx.monitor_history.append(snapshot)
            ctx.scheduler_history.append(decision)
            self.collector.write_scheduler_decision()

            if is_p0_failure(findings) or decision.decision is SchedulerDecision.STOP_NOW:
                return State.FAILURE_DETECTED

            flags = success_flags(snapshot)
            if all(flags.values()):
                return State.SUCCESS_HOLD

            time.sleep(DEFAULTS.monitor_poll_interval_seconds)

        ctx.latest_snapshot = ctx.monitor_history[-1] if ctx.monitor_history else None
        return State.FAILURE_DETECTED

    def handle_success_hold(self, ctx: RunContext) -> State:
        if ctx.execution_enabled:
            time.sleep(DEFAULTS.success_hold_min_seconds)
        return State.STOP_SUCCESS

    def handle_stop_success(self, ctx: RunContext) -> State:
        self._stop_launch_process()
        self._stop_dashboard()
        self._cleanup_team()
        if ctx.manifest is not None:
            ctx.manifest.mark_stopped(success=True)
            self.collector.write_manifest()
        self.collector.write_final_status(
            {
                "status": "success_ready_for_human_validation",
                "attempt_id": ctx.attempt_id,
                "team_name": ctx.team_name,
            }
        )
        return State.DONE

    def handle_failure_detected(self, ctx: RunContext) -> State:
        if ctx.manifest is not None:
            ctx.manifest.mark_stopped(reason_code="failure_detected", success=False)
            self.collector.write_manifest()
        return State.SNAPSHOT_PRE_STOP

    def handle_snapshot_pre_stop(self, ctx: RunContext) -> State:
        if ctx.execution_enabled:
            self._collect_pre_stop_snapshot()
        else:
            write_json_file(
                self.collector.pre_stop_dir() / "collection_plan.json",
                self.collector.live_command_plan(ctx.team_name),
            )
        return State.GRACEFUL_STOP

    def handle_graceful_stop(self, ctx: RunContext) -> State:
        launch_stop = self._stop_launch_process()
        dashboard_stop = self._stop_dashboard()
        if ctx.execution_enabled:
            cleanup_result = self._cleanup_team()
        else:
            cleanup_result = {"plan_only": True}
        write_json_file(
            ctx.attempt_dir / "graceful_stop_plan.json",
            {
                "team_name": ctx.team_name,
                "launch_stop": launch_stop,
                "dashboard_stop": dashboard_stop,
                "cleanup_result": cleanup_result,
                "steps": [
                    "snapshot-pre-stop",
                    "terminate background launch process",
                    "terminate custom dashboard",
                    "clawteam team cleanup --force",
                    "snapshot-post-stop",
                ],
            },
        )
        return State.SNAPSHOT_POST_STOP

    def handle_snapshot_post_stop(self, ctx: RunContext) -> State:
        if ctx.execution_enabled:
            self._collect_post_stop_snapshot()
        else:
            write_json_file(
                self.collector.post_stop_dir() / "collection_plan.json",
                {"team_name": ctx.team_name, "phase": "post-stop"},
            )
        return State.DIAGNOSE

    def handle_diagnose(self, ctx: RunContext) -> State:
        findings = ctx.latest_snapshot.findings if ctx.latest_snapshot else []
        ctx.latest_report = self.diagnoser.stub_report_from_findings(findings)
        self.collector.write_execution_report()
        return State.PATCH_PLAN

    def handle_patch_plan(self, ctx: RunContext) -> State:
        if ctx.latest_report is None:
            raise RuntimeError("execution report missing before PATCH_PLAN")
        ctx.latest_patch_plan = self.patch_executor.build_patch_plan(ctx.latest_report)
        self.collector.write_patch_plan()
        return State.APPLY_PATCH

    def handle_apply_patch(self, ctx: RunContext) -> State:
        if ctx.latest_patch_plan is None:
            raise RuntimeError("patch plan missing before APPLY_PATCH")
        if ctx.latest_patch_plan.safe_to_apply and ctx.latest_patch_plan.patches:
            codex_request = self.patch_executor.render_prompt(ctx.latest_patch_plan)
            (ctx.attempt_dir / "codex_patch_request.md").write_text(
                codex_request,
                encoding="utf-8",
            )
        else:
            (ctx.attempt_dir / "codex_patch_request.md").write_text(
                "Patch application skipped because patch plan is not safe or contains no patches.\n",
                encoding="utf-8",
            )
        return State.VALIDATE_PATCH

    def handle_validate_patch(self, ctx: RunContext) -> State:
        if ctx.latest_patch_plan is None:
            raise RuntimeError("patch plan missing before VALIDATE_PATCH")
        if not ctx.latest_patch_plan.safe_to_apply:
            write_json_file(
                ctx.attempt_dir / "patch_validation.json",
                {
                    "validated": False,
                    "reason": "patch plan is not safe to apply",
                },
            )
            return State.CLEANUP
        self.validator.validate_patch_plan(ctx.latest_patch_plan)
        self.validator.validate_json_against_schema(
            ctx.latest_patch_plan.to_dict(),
            "patch_plan.schema.json",
        )
        write_json_file(
            ctx.attempt_dir / "patch_validation.json",
            {
                "validated": True,
                "patch_count": len(ctx.latest_patch_plan.patches),
            },
        )
        return State.CLEANUP

    def handle_cleanup(self, ctx: RunContext) -> State:
        write_json_file(
            ctx.attempt_dir / "cleanup_plan.json",
            {
                "team_name": ctx.team_name,
                "note": "Automatic relaunch is disabled while diagnosis remains stub-only.",
            },
        )
        return State.RELAUNCH_DECISION

    def handle_relaunch_decision(self, ctx: RunContext) -> State:
        if ctx.current_attempt >= ctx.max_attempts:
            return State.ESCALATE_HUMAN
        if ctx.latest_report is None:
            return State.ESCALATE_HUMAN
        if ctx.latest_report.human_escalation.required:
            return State.ESCALATE_HUMAN
        if ctx.latest_report.verdict in {
            DiagnosisVerdict.MODEL_LIMIT,
            DiagnosisVerdict.FRAMEWORK_BUG,
            DiagnosisVerdict.INCONCLUSIVE,
        }:
            return State.ESCALATE_HUMAN
        if not ctx.latest_report.relaunch.recommended:
            return State.ESCALATE_HUMAN
        return State.LAUNCH

    def handle_escalate_human(self, ctx: RunContext) -> State:
        self.collector.write_final_status(
            {
                "status": "failed_requires_human",
                "attempt_id": ctx.attempt_id,
                "max_attempts": ctx.max_attempts,
            }
        )
        return State.FAILED

    def run(self) -> State:
        return self.machine.run_to_completion()

    def dry_run_summary(self) -> dict[str, Any]:
        self.validator.validate_precheck()
        return {
            "repo": str(self.ctx.repo_path),
            "team": self.ctx.base_team_name,
            "goal": self.ctx.goal,
            "template_name": self.ctx.template_name,
            "scheduler_model": DEFAULTS.scheduler_model,
            "scheduler_reasoning_effort": DEFAULTS.scheduler_reasoning_effort,
            "team_model": DEFAULTS.team_model,
            "team_reasoning_effort": DEFAULTS.team_reasoning_effort,
            "diagnosis_model": DEFAULTS.diagnosis_model,
            "diagnosis_reasoning_effort": DEFAULTS.diagnosis_reasoning_effort,
            "dashboard_port": DEFAULTS.dashboard_port,
            "dashboard_server": str(self.ctx.dashboard_server_path),
            "max_attempts": DEFAULTS.outer_max_attempts,
            "max_rounds": DEFAULTS.inner_max_rounds,
        }


def main() -> int:
    args = build_parser().parse_args()

    if args.command == "report":
        run_root = args.repo.resolve() / "runs" / args.team
        print(json.dumps({"run_root": str(run_root)}, indent=2, ensure_ascii=False))
        return 0

    orchestrator = OrchestratorScaffold(
        repo_path=args.repo,
        team_name=args.team,
        goal=args.goal,
        template_name=args.template_name,
        execution_enabled=not args.no_execute,
    )

    if args.command == "dry-run":
        print(json.dumps(orchestrator.dry_run_summary(), indent=2, ensure_ascii=False))
        return 0

    try:
        final_state = orchestrator.run()
    except (ValidationError, RuntimeError, NotImplementedError) as exc:
        orchestrator.handle_unexpected_failure(str(exc))
        logger.error("%s", exc)
        return 2

    return 0 if final_state is State.DONE else 1


if __name__ == "__main__":
    raise SystemExit(main())
