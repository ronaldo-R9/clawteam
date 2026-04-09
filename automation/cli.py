"""CLI parser for the external orchestrator scaffold."""

from __future__ import annotations

import argparse
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="External orchestrator scaffold for clawteam breakthrough-loop.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--repo", type=Path, required=True, help="Repository root path.")
    common.add_argument("--team", required=True, help="Base team name.")
    common.add_argument("--goal", required=True, help="Team goal for launch planning.")
    common.add_argument(
        "--template-name",
        default="breakthrough-loop",
        help="ClawTeam template name.",
    )
    common.add_argument(
        "--no-execute",
        action="store_true",
        help="Generate plans and files without invoking live integrations.",
    )

    subparsers.add_parser("run", parents=[common], help="Run the full external loop.")
    subparsers.add_parser("resume", parents=[common], help="Resume from last attempt.")
    subparsers.add_parser("dry-run", parents=[common], help="Validate inputs only.")

    report_parser = subparsers.add_parser("report", help="Show report paths for a run.")
    report_parser.add_argument("--repo", type=Path, required=True, help="Repository root path.")
    report_parser.add_argument("--team", required=True, help="Base team name.")
    return parser
