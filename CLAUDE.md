# AGENTS.md

Agent skills for **Claude Code** and **Codex**. Local-only by design: every
skill here reads and writes files on the runner's machine, and nothing is
uploaded.

`AGENTS.md` is a symlink to this file, so both agents read the same rules.

## Layout

One skill is one folder:

```
skills/<name>/
├── SKILL.md            # the skill; Claude Code reads its YAML frontmatter
├── agents/openai.yaml  # Codex reads this: display name, one-liner, policy
└── scripts/            # optional; anything the skill shells out to
```

`SKILL.md` is runtime-neutral prose. Where a runtime genuinely differs —
config paths, a missing capability — name both cases inline
(`~/.claude/settings.json` *or* `~/.codex/config.toml`). A divergence too big
to write that way earns its own section in the skill.

## Invariants

Enforced by `python3 tools/check_skills.py`, not by discipline:

1. Every `skills/<name>/` has a `SKILL.md` whose frontmatter `name` equals the
   folder name. **The frontmatter name is the invocation name** — it is
   resolved from there, never from the directory.
2. Every skill has `agents/openai.yaml`. Without it Codex falls back to the
   raw folder name and has no invocation policy.
3. Every skill is listed in `.claude-plugin/plugin.json`'s `skills` array,
   with no stale entries. That array is exactly what the plugin publishes.
4. Invocation policy matches across the pair of files: user-invoked means
   `disable-model-invocation: true` in the frontmatter **and**
   `policy.allow_implicit_invocation: false` in `openai.yaml`. Model-invocable
   means neither.

Run the check before every push. After touching a manifest under
`.claude-plugin/`, also run `claude plugin validate . --strict`.

## Installing

**Plugin** — managed, updates when the repo ships:

```
/plugin marketplace add silouone/skills
/plugin install silouone-skills@silouone
```

Skills arrive namespaced — `/silouone-skills:ingest`.

**skills.sh** — editable files the user owns, on any agent:

```bash
npx skills@latest add silouone/skills
```

Don't install both into the same runtime — you get every skill twice.

**Working on this repo:** `scripts/link-skills.sh` symlinks every skill into
`~/.claude/skills` and `~/.codex/skills`, so an edit here is live immediately.
It refuses to replace a real directory (someone's own copy) and only ever
clobbers a symlink. `scripts/list-skills.sh` prints the inventory. Both are
maintainer tools, not the supported installer.

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
