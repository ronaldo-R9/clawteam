"""Subprocess helpers for clawteam and dashboard integration."""

from __future__ import annotations

import json
import os
import signal
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class CommandResult:
    argv: list[str]
    returncode: int
    stdout: str
    stderr: str


class CommandRunner:
    def __init__(self, cwd: Path) -> None:
        self.cwd = cwd

    def run(
        self,
        argv: list[str],
        timeout: int | None = None,
        check: bool = True,
    ) -> CommandResult:
        completed = subprocess.run(
            argv,
            cwd=self.cwd,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        result = CommandResult(
            argv=argv,
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )
        if check and completed.returncode != 0:
            raise RuntimeError(
                f"command failed ({completed.returncode}): {' '.join(argv)}\n"
                f"stdout:\n{completed.stdout}\n"
                f"stderr:\n{completed.stderr}"
            )
        return result

    def run_json(
        self,
        argv: list[str],
        timeout: int | None = None,
    ) -> dict | list:
        result = self.run(argv, timeout=timeout, check=True)
        return json.loads(result.stdout)

    def start_background(
        self,
        argv: list[str],
        stdout_path: Path,
        stderr_path: Path,
    ) -> subprocess.Popen[str]:
        stdout_path.parent.mkdir(parents=True, exist_ok=True)
        stderr_path.parent.mkdir(parents=True, exist_ok=True)
        stdout_handle = stdout_path.open("w", encoding="utf-8")
        stderr_handle = stderr_path.open("w", encoding="utf-8")
        process = subprocess.Popen(
            argv,
            cwd=self.cwd,
            text=True,
            stdout=stdout_handle,
            stderr=stderr_handle,
            preexec_fn=os.setsid,
        )
        return process

    def terminate_process(self, pid: int | None) -> None:
        if pid is None:
            return
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except ProcessLookupError:
            return
