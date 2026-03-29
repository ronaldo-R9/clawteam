# ClawTeam Integration Bundle

This repository packages the ClawTeam coordination skill, the breakthrough-loop
skill, the launch template, and the supporting Markdown references used in this
session.

The goal is simple: clone this repo on another machine and install the files
into Codex and ClawTeam with one command.

## Included

- `skills/clawteam/`
- `skills/clawteam-breakthrough-loop/`
- `templates/breakthrough-loop.toml`
- `examples/snake-pvp-web-goal.md`
- `install.sh`

## Install On Another Machine

Requirements:

- Codex installed and configured
- ClawTeam installed
- a writable `CODEX_HOME` or `~/.codex`

Run:

```bash
git clone https://github.com/ronaldo-R9/clawteam.git
cd clawteam
./install.sh
```

The installer copies:

- `skills/clawteam` to `$CODEX_HOME/skills/clawteam`
- `skills/clawteam-breakthrough-loop` to `$CODEX_HOME/skills/clawteam-breakthrough-loop`
- `templates/breakthrough-loop.toml` to `~/.clawteam/templates/breakthrough-loop.toml`
- a compatibility alias to `~/.clawteam/templates/codex-breakthrough-loop.toml`

## Use In Codex

After installation, the other machine can invoke the workflow by asking Codex
to use the ClawTeam breakthrough loop for a task.

Default Codex launch:

```bash
clawteam launch breakthrough-loop \
  -g "Design and implement a website with registration and login, authenticated access to a snake game, real-time online two-player PvP matches, and persistent score plus match-result tracking." \
  -t snake-pvp-web-breakthrough \
  --repo /path/to/your/repo \
  --command codex \
  -w
```

Gemini launch example:

```bash
clawteam launch breakthrough-loop \
  -g "Design and implement a website with registration and login, authenticated access to a snake game, real-time online two-player PvP matches, and persistent score plus match-result tracking." \
  -t snake-pvp-web-breakthrough \
  --repo /path/to/your/repo \
  --command gemini \
  --command-arg=--model \
  --command-arg gemini-3.1-pro-preview \
  -w
```

## Notes

- `breakthrough-loop.toml` defaults to `command = ["codex"]`.
- `clawteam launch` can override the command at startup with `--command`.
- When an appended command argument itself starts with `-`, pass it as `--command-arg=...`.
- `clawteam launch codex-breakthrough-loop` still works after install because the installer writes a compatibility alias with the old filename.
- This repository stores the portable assets, not the live team runtime state.
