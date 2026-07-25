# skills

Agent skills I author, use daily, and publish for both **Claude Code** and
**Codex** — every skill ships in two maintained variants built around one
shared core, so your runtime choice never decides whether you get to use it.

Local-only by design: these skills read and write files on *your* machine.
Nothing is uploaded anywhere.

## The skills

| Skill | What it does |
|---|---|
| [`ingest`](./skills/ingest) | Turn a YouTube URL or local transcript/text file into a saved key-points extraction — core thesis, structured key points, and an applicability assessment grounded in *your* actual setup. Stop watching; start ingesting. |
| [`ai-usage-card`](./skills/ai-usage-card) | A calibrated, local-only self-assessment of how you actually *operate* your coding agent. Scores an L0–L5 level from measured behavior (verification loop, autonomy, authorship — not installed kit) and prints a shareable card + JSON line. |
| [`sitrep`](./skills/sitrep) | "Where are we at?" — one scannable, evidence-first status report on the current session: objective with measured %, in-flight task, subagent states, ETA in countable units, blockers, next action. Disk first, conversation second; never invents a number. |

## Install (2 minutes)

Each skill folder contains a `claude/` and a `codex/` variant. Copy the one
for your runtime:

**Claude Code**

```bash
git clone https://github.com/silouone/skills.git
cp -r skills/skills/ingest/claude ~/.claude/skills/ingest
cp -r skills/skills/ai-usage-card/claude ~/.claude/skills/ai-usage-card
```

Then in any Claude Code session: `/ingest <youtube-url>` or `/ai-usage-card`
(or just ask in natural language — the skills trigger on intent).

**Codex**

```bash
git clone https://github.com/silouone/skills.git
cp -r skills/skills/ingest/codex ~/.codex/skills/ingest
cp -r skills/skills/ai-usage-card/codex ~/.codex/skills/ai-usage-card
```

Then invoke the skill by name in a fresh Codex session (e.g. `$ingest` in the
CLI, or ask for it in natural language).

**No install at all** — `ai-usage-card` also works as a plain paste-in
prompt: open the [`PROMPT.md`](./skills/ai-usage-card/claude/PROMPT.md) for
your platform ([Codex version](./skills/ai-usage-card/codex/PROMPT.md)), copy
the box, paste it into a session.

The `ingest` transcript fetcher needs [`uv`](https://docs.astral.sh/uv/)
(single-file script, dependencies resolve on first run — no environment to
set up).

## Why two variants per skill

Half the people I share a skill with run a different agent runtime than I do.
A skill maintained for one runtime is a skill half your team can't use — and
hand-copied ports drift within weeks. Here, each skill has:

```
skills/<name>/
├── CORE.md      # the platform-neutral contract — single source of truth
├── claude/      # complete installable skill for Claude Code
└── codex/       # complete installable skill for Codex
```

Adapters are stamped with the hash of the `CORE.md` they were written
against; [`tools/check_drift.py`](./tools/check_drift.py) fails when a core
changes without its adapters being revisited, and when files shared by both
variants stop being byte-identical. Maintenance is enforced by tooling, not
discipline. See [`PUBLISHING.md`](./PUBLISHING.md).

## License

[MIT](./LICENSE)
