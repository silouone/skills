#!/bin/sh
# Install skills from this repo into your agent runtimes.
#
#   ./install.sh                    # every skill, every runtime found
#   ./install.sh ingest sitrep      # named skills only
#   ./install.sh --claude           # Claude Code only
#   ./install.sh --dry-run          # show what would happen
#
# Each skill ships as skills/<name>/{claude,codex}/. The platform folder is
# the skill: its contents land directly in <runtime>/skills/<name>/, with no
# claude/ or codex/ level in between. Re-running is safe and idempotent.
set -eu

REPO_URL="https://github.com/silouone/skills.git"
MARKER=".installed-from"

PLATFORMS=""
SKILLS=""
DEST_OVERRIDE=""
FORCE=0
DRY_RUN=0
TMP_CLONE=""

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

usage() {
    cat <<'EOF'
Install skills from this repo into your agent runtimes.

  ./install.sh                    # every skill, every runtime found
  ./install.sh ingest sitrep      # named skills only
  ./install.sh --claude           # Claude Code only
  ./install.sh --dry-run          # show what would happen

The platform folder IS the skill: skills/<name>/claude/ lands directly in
<runtime>/skills/<name>/, with no claude/ or codex/ level in between.
Re-running is safe and idempotent.

Options:
  --claude          install the Claude Code variant
  --codex           install the Codex variant
  --dir PATH        install into PATH/skills instead of the runtime default
                    (requires exactly one of --claude / --codex)
  --force           replace a target directory this installer did not create
  --dry-run         print the plan, change nothing
  -h, --help        this message

Runtime defaults: $CLAUDE_CONFIG_DIR or ~/.claude, $CODEX_HOME or ~/.codex.
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --claude) PLATFORMS="$PLATFORMS claude" ;;
        --codex)  PLATFORMS="$PLATFORMS codex" ;;
        --dir)    [ $# -ge 2 ] || die "--dir needs a path"; DEST_OVERRIDE="$2"; shift ;;
        --force)  FORCE=1 ;;
        --dry-run|-n) DRY_RUN=1 ;;
        -h|--help) usage; exit 0 ;;
        -*) die "unknown option: $1 (try --help)" ;;
        *)  SKILLS="$SKILLS $1" ;;
    esac
    shift
done

# --- locate the source tree -------------------------------------------------
# Run from a clone, or piped straight from curl (no $0 path to lean on).
SRC=""
for candidate in "$(dirname -- "$0" 2>/dev/null || echo .)" "$PWD"; do
    if [ -d "$candidate/skills" ]; then
        SRC=$(cd "$candidate" && pwd)
        break
    fi
done

if [ -z "$SRC" ]; then
    command -v git >/dev/null 2>&1 || die "no local checkout found and git is unavailable"
    TMP_CLONE=$(mktemp -d)
    trap 'rm -rf "$TMP_CLONE"' EXIT INT TERM
    say "Cloning $REPO_URL ..."
    git clone --depth 1 --quiet "$REPO_URL" "$TMP_CLONE/skills-repo"
    SRC="$TMP_CLONE/skills-repo"
fi

COMMIT=$(cd "$SRC" && git rev-parse HEAD 2>/dev/null || echo unknown)

# --- resolve platforms ------------------------------------------------------
claude_root() { printf '%s\n' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; }
codex_root()  { printf '%s\n' "${CODEX_HOME:-$HOME/.codex}"; }

if [ -z "$PLATFORMS" ]; then
    [ -d "$(claude_root)" ] && PLATFORMS="$PLATFORMS claude"
    [ -d "$(codex_root)" ]  && PLATFORMS="$PLATFORMS codex"
    [ -n "$PLATFORMS" ] || die "found neither $(claude_root) nor $(codex_root) — pass --claude, --codex, or --dir"
fi

if [ -n "$DEST_OVERRIDE" ]; then
    set -- $PLATFORMS
    [ $# -eq 1 ] || die "--dir requires exactly one of --claude / --codex"
fi

# --- resolve skills ---------------------------------------------------------
if [ -z "$SKILLS" ]; then
    for dir in "$SRC"/skills/*/; do
        [ -d "$dir" ] || continue
        SKILLS="$SKILLS $(basename "$dir")"
    done
    [ -n "$SKILLS" ] || die "no skills found under $SRC/skills"
else
    for skill in $SKILLS; do
        [ -d "$SRC/skills/$skill" ] || die "no such skill: $skill"
    done
fi

# --- install ----------------------------------------------------------------
installed=0
skipped=0

for platform in $PLATFORMS; do
    if [ -n "$DEST_OVERRIDE" ]; then
        dest_root="$DEST_OVERRIDE/skills"
    elif [ "$platform" = claude ]; then
        dest_root="$(claude_root)/skills"
    else
        dest_root="$(codex_root)/skills"
    fi

    say ""
    say "$platform → $dest_root"

    for skill in $SKILLS; do
        src="$SRC/skills/$skill/$platform"
        dst="$dest_root/$skill"

        if [ ! -d "$src" ]; then
            say "  ~ $skill (no $platform variant, skipped)"
            skipped=$((skipped + 1))
            continue
        fi

        if [ -e "$dst" ] && [ ! -f "$dst/$MARKER" ] && [ "$FORCE" -eq 0 ]; then
            say "  ! $skill — $dst exists and was not installed by this script."
            say "    Back it up, or re-run with --force to replace it."
            skipped=$((skipped + 1))
            continue
        fi

        verb="install"
        [ -e "$dst" ] && verb="update"

        if [ "$DRY_RUN" -eq 1 ]; then
            say "  · $skill ($verb, dry run)"
            installed=$((installed + 1))
            continue
        fi

        mkdir -p "$dest_root"
        rm -rf "$dst.incoming"
        cp -Rp "$src" "$dst.incoming"
        cat > "$dst.incoming/$MARKER" <<EOF
repo=$REPO_URL
commit=$COMMIT
platform=$platform
EOF
        rm -rf "$dst"
        mv "$dst.incoming" "$dst"
        say "  ✓ $skill ($verb)"
        installed=$((installed + 1))
    done
done

say ""
if [ "$DRY_RUN" -eq 1 ]; then
    say "Dry run: $installed would be installed, $skipped skipped."
    exit 0
fi

say "Installed $installed, skipped $skipped (commit ${COMMIT%"${COMMIT#????????}"})."

[ "$installed" -gt 0 ] || exit 1

case " $PLATFORMS " in
    *" claude "*) say "Claude Code: run /reload-skills, or start a new session." ;;
esac
case " $PLATFORMS " in
    *" codex "*) say "Codex: skills load in a fresh session." ;;
esac
