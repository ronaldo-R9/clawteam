#!/usr/bin/env python3
"""Launch the codex-breakthrough-loop ClawTeam template with normalized arguments."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Bootstrap a Codex breakthrough-oriented ClawTeam launch command.",
    )
    parser.add_argument("--goal", required=True, help="Team goal injected into the template.")
    parser.add_argument("--repo", required=True, help="Repository or working directory.")
    parser.add_argument("--team-name", default="", help="Optional explicit team name.")
    parser.add_argument(
        "--template-name",
        default="codex-breakthrough-loop",
        help="ClawTeam template name to launch.",
    )
    parser.add_argument("--command", default="codex", help="Agent command override.")
    parser.add_argument("--backend", default="", help="Optional backend override.")
    parser.add_argument(
        "--no-workspace",
        action="store_true",
        help="Disable isolated git workspaces.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the command without executing it.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    repo = Path(args.repo).expanduser().resolve()
    command = ["clawteam", "launch", args.template_name, "-g", args.goal, "--repo", str(repo), "--command", args.command]

    if args.team_name:
        command.extend(["-t", args.team_name])
    if args.backend:
        command.extend(["-b", args.backend])
    if args.no_workspace:
        command.append("--no-workspace")
    else:
        command.append("-w")

    if args.dry_run:
        print(" ".join(command))
        return 0

    completed = subprocess.run(command, check=False)
    return completed.returncode


if __name__ == "__main__":
    sys.exit(main())
