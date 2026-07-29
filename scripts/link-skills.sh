#!/usr/bin/env bash
set -euo pipefail

# NOTE: dev-only script, for maintainers of this repo. It is not the supported
# installer — end users install the Claude Code plugin, or run
# `npx skills@latest add silouone/skills`.
#
# Links every skill in this repo into the local skill directories:
#   ~/.claude/skills  — Claude Code
#   ~/.codex/skills   — Codex
# Each entry is a symlink into this repo, so editing a SKILL.md here takes
# effect immediately and `git pull` keeps installed skills current. Re-run
# after adding, removing, or renaming a skill.

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DESTS=("${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills" "${CODEX_HOME:-$HOME/.codex}/skills")

names=()
srcs=()
while IFS= read -r -d '' skill_md; do
  src="$(dirname "$skill_md")"
  names+=("$(basename "$src")")
  srcs+=("$src")
done < <(find "$REPO/skills" -name SKILL.md -print0)

for DEST in "${DESTS[@]}"; do
  # If $DEST is itself a symlink into this repo, the per-skill links below
  # would be written back into the repo's own skills/ tree. Bail out instead.
  if [ -L "$DEST" ]; then
    resolved="$(readlink "$DEST")"
    case "$resolved" in
      "$REPO"|"$REPO"/*)
        echo "error: $DEST is a symlink into this repo ($resolved)." >&2
        echo "Remove it (rm \"$DEST\") and re-run; this script will recreate it as a real dir." >&2
        exit 1
        ;;
    esac
  fi

  mkdir -p "$DEST"

  for i in "${!names[@]}"; do
    name="${names[$i]}"
    target="$DEST/$name"

    # A real directory here is someone's own copy — replacing it silently
    # would destroy hand edits. Only ever clobber a symlink.
    if [ -e "$target" ] && [ ! -L "$target" ]; then
      echo "skipped $name — $target is a real directory, not a link. Move it aside first." >&2
      continue
    fi

    ln -sfn "${srcs[$i]}" "$target"
    echo "linked $name -> $DEST/$name"
  done
done
