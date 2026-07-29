# CLAUDE.md

Agent skills published for both **Claude Code** and **Codex**. Local-only by
design: every skill here reads and writes files on the runner's machine and
nothing is uploaded.

`AGENTS.md` is a symlink to this file — Codex and Claude Code read the same
rules.

## Layout

One skill is one folder. There is no per-runtime variant folder, and no build
step:

```
skills/<name>/
├── SKILL.md            # the skill; Claude Code reads its YAML frontmatter
├── agents/openai.yaml  # Codex reads this: display name, one-liner, policy
└── scripts/            # optional; anything the skill shells out to
```

`SKILL.md` is runtime-neutral prose. Where a runtime genuinely differs —
config paths, a missing capability — the skill names both cases inline
(`~/.claude/settings.json` *or* `~/.codex/config.toml`) rather than forking
the file. If a skill ever cannot be written that way, that is a signal the
divergence is worth an explicit section, not a second copy.

## Invariants

These are enforced by `python3 tools/check_skills.py`, not by discipline:

1. Every `skills/<name>/` has a `SKILL.md` whose frontmatter `name` equals the
   folder name. **The frontmatter name is the invocation name** — both
   runtimes resolve it from there, not from the directory.
2. Every skill has `agents/openai.yaml`. Without it Codex falls back to the
   raw folder name and no invocation policy.
3. Every skill is listed in `.claude-plugin/plugin.json`'s `skills` array, and
   no stale entries linger. That array is exactly what the plugin publishes.
4. The two runtimes agree on who may invoke a skill. User-invoked means
   `disable-model-invocation: true` in the frontmatter **and**
   `policy.allow_implicit_invocation: false` in `openai.yaml`. Model-invocable
   means neither. A skill the model can reach on one runtime but not the other
   is a bug.

Run the check before every push. After touching either manifest under
`.claude-plugin/`, also run `claude plugin validate . --strict`.

## Installing

**Plugin** (Claude Code, managed, updates when the repo ships):

```
/plugin marketplace add silouone/skills
/plugin install silouone-skills@silouone
```

Skills arrive namespaced — `/silouone-skills:ingest`.

**skills.sh** (any agent, editable files the user owns):

```bash
npx skills@latest add silouone/skills
```

Don't install both into the same runtime — you get every skill twice.

**Working on this repo:** `scripts/link-skills.sh` symlinks every skill into
`~/.claude/skills` and `~/.codex/skills`, so an edit here is live immediately.
It refuses to replace a real directory (someone's own copy) — only ever
clobbers a symlink. `scripts/list-skills.sh` prints the skill inventory. Both
are maintainer tools, not the supported installer.

## Adding a skill

1. `skills/<name>/SKILL.md` with frontmatter `name` + `description`. The
   description is what makes the model reach for it: say what it does *and*
   when to use it.
2. `skills/<name>/agents/openai.yaml` with `interface.display_name`,
   `interface.short_description`, and `policy.allow_implicit_invocation`
   matching the frontmatter.
3. Add `./skills/<name>` to `.claude-plugin/plugin.json`'s `skills` array and
   bump its `version` — Claude uses that version to decide when installed
   users see an update.
4. Add a row to the README table.
5. `python3 tools/check_skills.py` and `claude plugin validate . --strict`.

The release checklist, the sanitization gate, and the local-only guarantee
live in [PUBLISHING.md](./PUBLISHING.md). Read it before pushing.
