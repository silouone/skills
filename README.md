# skills

Agent skills I author, use daily, and publish for both **Claude Code** and
**Codex** — one folder per skill, read by both runtimes, so your runtime
choice never decides whether you get to use it.

Local-only by design: these skills read and write files on *your* machine.
Nothing is uploaded anywhere.

## The skills

| Skill | What it does |
|---|---|
| [`ingest`](./skills/ingest) | Turn a YouTube URL or local transcript/text file into a saved key-points extraction — core thesis, structured key points, and an applicability assessment grounded in *your* actual setup. Stop watching; start ingesting. |
| [`ai-usage-card`](./skills/ai-usage-card) | A calibrated, local-only self-assessment of how you actually *operate* your coding agent. Scores an L0–L5 level from measured behavior (verification loop, autonomy, authorship — not installed kit) and prints a shareable card + JSON line. |
| [`sitrep`](./skills/sitrep) | "Where are we at?" — one scannable, evidence-first status report on the current session: objective with measured %, in-flight task, subagent states, ETA in countable units, blockers, next action. Disk first, conversation second; never invents a number. |

## Install (1 minute)

Two routes, two philosophies. The **plugin** subscribes you to the set as a
managed, read-only bundle that updates when I ship — Claude Code only.
**skills.sh** copies editable skill files onto any agent, so you can hack on
them and make them your own. Pick one; installing both leaves you with every
skill twice.

<details>
<summary><strong>Claude Code</strong></summary>

```
/plugin marketplace add silouone/skills
/plugin install silouone-skills@silouone
```

Skills arrive namespaced: `/silouone-skills:ingest`. Updates come with the
plugin — nothing to re-run.

</details>

<details>
<summary><strong>Codex, and any other agent</strong></summary>

```bash
npx skills@latest add silouone/skills
```

Pick the skills you want and which agents to install them on. Works for
Claude Code too, if you'd rather own editable files than subscribe to the
plugin.

</details>

Then, in Claude Code: `/reload-skills`, and `/ingest <youtube-url>` or
`/ai-usage-card` (or just ask in natural language — the skills trigger on
intent). In Codex: start a fresh session and invoke the skill by name (e.g.
`$ingest`) or ask for it in natural language.

**No install at all** — `ai-usage-card` also works as a plain paste-in
prompt: open [`PROMPT.md`](./skills/ai-usage-card/PROMPT.md), copy the box,
paste it into a session on either runtime.

The `ingest` transcript fetcher needs [`uv`](https://docs.astral.sh/uv/)
(single-file script, dependencies resolve on first run — no environment to
set up).

## One skill, one folder, both runtimes

Half the people I share a skill with run a different agent than I do. A skill
maintained for one runtime is a skill half your team can't use — and a
hand-copied port drifts within weeks. So there is no port: one folder is the
skill, and both runtimes read it.

```
skills/<name>/
├── SKILL.md            # the skill — Claude Code reads its YAML frontmatter
├── agents/openai.yaml  # Codex reads this: display name, one-liner, policy
└── scripts/            # optional
```

`SKILL.md` is runtime-neutral prose. Where the runtimes genuinely differ —
config paths, a capability one lacks — the skill names both cases inline
instead of forking the file.

[`tools/check_skills.py`](./tools/check_skills.py) enforces the parts that
rot quietly: the frontmatter `name` matches the folder (it's the invocation
name on both runtimes), every skill ships an `openai.yaml`, every skill is
listed in the plugin manifest with no stale entries, and the two runtimes
agree on whether the model may invoke a skill. Maintenance by tooling, not
discipline. Conventions live in [`CLAUDE.md`](./CLAUDE.md); publishing rules
in [`PUBLISHING.md`](./PUBLISHING.md).

## License

[MIT](./LICENSE)
