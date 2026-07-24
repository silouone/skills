#!/usr/bin/env python3
"""Drift guard for dual-platform skills.

Every skill lives in skills/<name>/ with a platform-neutral CORE.md and two
adapter folders (claude/, codex/). Adapters embed the marker

    <!-- core-hash: <first 12 hex of sha256(CORE.md)> -->

so editing CORE.md forces every adapter to be revisited (and re-stamped) in
the same commit. Files shipped in BOTH platform folders under the same
relative path (e.g. scripts/) must stay byte-identical.

Usage:
    python3 tools/check_drift.py          # verify, exit 1 on drift
    python3 tools/check_drift.py --stamp  # rewrite markers to current hash
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKER = re.compile(r"<!-- core-hash: ([0-9a-f]{12}|PENDING) -->")
PLATFORMS = ("claude", "codex")
STAMPED_NAMES = {"SKILL.md", "PROMPT.md"}


def core_hash(core: Path) -> str:
    return hashlib.sha256(core.read_bytes()).hexdigest()[:12]


def main() -> int:
    stamp = "--stamp" in sys.argv
    failures: list[str] = []

    for skill_dir in sorted((ROOT / "skills").iterdir()):
        core = skill_dir / "CORE.md"
        if not core.is_file():
            continue
        expected = core_hash(core)

        for platform in PLATFORMS:
            platform_dir = skill_dir / platform
            if not platform_dir.is_dir():
                failures.append(f"{skill_dir.name}: missing {platform}/ variant")
                continue
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

    if failures:
        print("DRIFT DETECTED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("drift check: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
