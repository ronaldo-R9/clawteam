#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
SKILLS_DIR="$CODEX_HOME_DIR/skills"
TEMPLATES_DIR="$HOME/.clawteam/templates"

mkdir -p "$SKILLS_DIR"
mkdir -p "$TEMPLATES_DIR"

rm -rf "$SKILLS_DIR/clawteam"
rm -rf "$SKILLS_DIR/clawteam-breakthrough-loop"

cp -R "$REPO_ROOT/skills/clawteam" "$SKILLS_DIR/clawteam"
cp -R "$REPO_ROOT/skills/clawteam-breakthrough-loop" "$SKILLS_DIR/clawteam-breakthrough-loop"
cp "$REPO_ROOT/templates/codex-breakthrough-loop.toml" "$TEMPLATES_DIR/codex-breakthrough-loop.toml"

echo "Installed skills into: $SKILLS_DIR"
echo "Installed template into: $TEMPLATES_DIR/codex-breakthrough-loop.toml"
echo "Done."
