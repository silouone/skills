#!/usr/bin/env python3
"""Layout guard for the skills in this repo.

One skill = one folder. Every skill lives at skills/<name>/ and ships:

    SKILL.md            frontmatter `name` matching the folder
    agents/openai.yaml  Codex's display metadata + invocation policy

and is listed in .claude-plugin/plugin.json's `skills` array, which is what
the Claude Code plugin publishes. The two runtimes must also agree on who may
invoke a skill: `disable-model-invocation: true` in the frontmatter means
`policy.allow_implicit_invocation: false` in openai.yaml, and vice versa.

Usage:
    python3 tools/check_skills.py   # verify, exit 1 on any violation
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "skills"
PLUGIN_MANIFEST = ROOT / ".claude-plugin" / "plugin.json"
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)


def frontmatter_of(skill_md: Path) -> dict[str, str]:
    """Flat `key: value` pairs from the YAML frontmatter — no YAML dep needed."""
    match = FRONTMATTER.search(skill_md.read_text())
    if not match:
        return {}
    pairs = {}
    for line in match.group(1).splitlines():
        if line.startswith((" ", "\t", "#")) or ":" not in line:
            continue
        key, _, value = line.partition(":")
        pairs[key.strip()] = value.strip().strip("\"'")
    return pairs


def check_skill(skill_dir: Path) -> list[str]:
    name = skill_dir.name
    skill_md = skill_dir / "SKILL.md"
    openai_yaml = skill_dir / "agents" / "openai.yaml"
    failures = []

    if not skill_md.is_file():
        return [f"{name}: no SKILL.md"]
    if not openai_yaml.is_file():
        failures.append(
            f"{name}: agents/openai.yaml missing — Codex needs it for display "
            f"metadata and invocation policy"
        )

    front = frontmatter_of(skill_md)
    if not front:
        failures.append(f"{name}/SKILL.md: no YAML frontmatter")
        return failures
    if front.get("name") != name:
        failures.append(
            f"{name}/SKILL.md: frontmatter name {front.get('name')!r} != folder "
            f"{name!r} — the frontmatter name is the invocation name"
        )

    # Stale layout: the variant folders this repo used to ship.
    for legacy in ("claude", "codex", "CORE.md"):
        if (skill_dir / legacy).exists():
            failures.append(f"{name}: stale {legacy} left over from the variant layout")

    if openai_yaml.is_file():
        user_invoked = front.get("disable-model-invocation") == "true"
        implicit_off = "allow_implicit_invocation: false" in openai_yaml.read_text()
        if user_invoked != implicit_off:
            failures.append(
                f"{name}: invocation policy disagrees — SKILL.md says "
                f"{'user-invoked' if user_invoked else 'model-invocable'}, "
                f"openai.yaml says "
                f"{'user-invoked' if implicit_off else 'model-invocable'}"
            )
    return failures


def check_plugin_manifest(names: list[str]) -> list[str]:
    if not PLUGIN_MANIFEST.is_file():
        return [f"{PLUGIN_MANIFEST.relative_to(ROOT)}: missing"]
    listed = set(json.loads(PLUGIN_MANIFEST.read_text()).get("skills", []))
    expected = {f"./skills/{name}" for name in names}
    rel = PLUGIN_MANIFEST.relative_to(ROOT)
    return [f"{rel}: missing `skills` entry {p}" for p in sorted(expected - listed)] + [
        f"{rel}: stale `skills` entry {p}" for p in sorted(listed - expected)
    ]


def main() -> int:
    names = sorted(d.name for d in SKILLS.iterdir() if d.is_dir())
    failures = [f for name in names for f in check_skill(SKILLS / name)]
    failures += check_plugin_manifest(names)

    if failures:
        print("PROBLEMS FOUND:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"skills check: OK ({len(names)} skills)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
