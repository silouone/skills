#!/usr/bin/env python3
"""Drift guard for dual-platform skills.

Every skill lives in skills/<name>/ with a platform-neutral CORE.md and two
adapter folders (claude/, codex/). Adapters embed the marker

    <!-- core-hash: <first 12 hex of sha256(CORE.md)> -->

so editing CORE.md forces every adapter to be revisited (and re-stamped) in
the same commit. Files shipped in BOTH platform folders under the same
relative path (e.g. scripts/) must stay byte-identical.

Two distribution invariants are checked alongside the hashes: every claude/
adapter is listed in the plugin manifest's `skills` array (the Claude Code
plugin ships exactly the published set), and every codex/ adapter exposes
agents/openai.yaml (Codex reads it for the skill's display metadata and
invocation policy).

Usage:
    python3 tools/check_drift.py          # verify, exit 1 on drift
    python3 tools/check_drift.py --stamp  # rewrite markers to current hash
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKER = re.compile(r"<!-- core-hash: ([0-9a-f]{12}|PENDING) -->")
PLATFORMS = ("claude", "codex")
STAMPED_NAMES = {"SKILL.md", "PROMPT.md"}
PLUGIN_MANIFEST = ROOT / ".claude-plugin" / "plugin.json"


def core_hash(core: Path) -> str:
    return hashlib.sha256(core.read_bytes()).hexdigest()[:12]


def check_plugin_manifest(skill_names: list[str]) -> list[str]:
    """Every claude/ adapter listed in plugin.json, and nothing stale."""
    if not PLUGIN_MANIFEST.is_file():
        return [f"{PLUGIN_MANIFEST.relative_to(ROOT)}: missing"]

    listed = set(json.loads(PLUGIN_MANIFEST.read_text()).get("skills", []))
    expected = {f"./skills/{name}/claude" for name in skill_names}
    rel = PLUGIN_MANIFEST.relative_to(ROOT)
    return [
        f"{rel}: {verb} `skills` entry {path}"
        for verb, path in (
            [("missing", p) for p in sorted(expected - listed)]
            + [("stale", p) for p in sorted(listed - expected)]
        )
    ]


def main() -> int:
    stamp = "--stamp" in sys.argv
    failures: list[str] = []
    skill_names: list[str] = []

    for skill_dir in sorted((ROOT / "skills").iterdir()):
        core = skill_dir / "CORE.md"
        if not core.is_file():
            continue
        expected = core_hash(core)
        skill_names.append(skill_dir.name)

        for platform in PLATFORMS:
            platform_dir = skill_dir / platform
            if not platform_dir.is_dir():
                failures.append(f"{skill_dir.name}: missing {platform}/ variant")
                continue
            if platform == "codex" and not (platform_dir / "agents" / "openai.yaml").is_file():
                failures.append(
                    f"{skill_dir.name}: codex/agents/openai.yaml missing — "
                    f"Codex needs it for display metadata and invocation policy"
                )
            for file in sorted(platform_dir.rglob("*")):
                if file.name not in STAMPED_NAMES:
                    continue
                text = file.read_text()
                match = MARKER.search(text)
                rel = file.relative_to(ROOT)
                if not match:
                    failures.append(f"{rel}: no core-hash marker")
                elif match.group(1) != expected:
                    if stamp:
                        file.write_text(MARKER.sub(f"<!-- core-hash: {expected} -->", text))
                        print(f"stamped {rel} -> {expected}")
                    else:
                        failures.append(
                            f"{rel}: core-hash {match.group(1)} != {expected} "
                            f"(CORE.md changed — revisit this adapter, then --stamp)"
                        )

        # Twin files (same relative path under both platforms) must be identical
        claude_dir, codex_dir = skill_dir / "claude", skill_dir / "codex"
        if claude_dir.is_dir() and codex_dir.is_dir():
            for file in sorted(claude_dir.rglob("*")):
                if not file.is_file() or file.name in STAMPED_NAMES:
                    continue
                twin = codex_dir / file.relative_to(claude_dir)
                if twin.is_file() and file.read_bytes() != twin.read_bytes():
                    failures.append(
                        f"{skill_dir.name}: {file.relative_to(skill_dir)} differs from "
                        f"{twin.relative_to(skill_dir)} — shared files must be byte-identical"
                    )

    failures.extend(check_plugin_manifest(skill_names))

    if failures:
        print("DRIFT DETECTED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("drift check: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
