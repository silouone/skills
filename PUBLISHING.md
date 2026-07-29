# Publishing rules

Every skill published here carries the same guarantees. This file is the
checklist that keeps them true.

## 1. One skill, one folder, both runtimes

A skill lands with **two parts or it doesn't land**:

- `skills/<name>/SKILL.md` — the skill itself, in runtime-neutral prose.
  Claude Code reads its YAML frontmatter; the frontmatter `name` must equal
  the folder name, because **that is the invocation name on both runtimes**.
- `skills/<name>/agents/openai.yaml` — what Codex reads for the skill's
  display name, one-liner, and invocation policy. Without it Codex falls back
  to the raw folder name.

`scripts/` and other assets sit alongside them. There is no per-runtime
variant folder and no build step.

Where the runtimes genuinely differ — config paths, a capability one lacks —
the skill names both cases inline (`~/.claude/settings.json` *or*
`~/.codex/config.toml`). A divergence too large to write that way is a signal
to give it an explicit section, never a second copy of the file.

Every skill is either **user-invoked** or **model-invoked**, and the two
runtimes must agree: user-invoked means `disable-model-invocation: true` in
the frontmatter *and* `policy.allow_implicit_invocation: false` in
`agents/openai.yaml`; model-invocable means neither. A skill the model may
reach on one runtime but not the other is a bug.

```bash
python3 tools/check_skills.py   # must print OK
```

## 2. Distribution manifests

The repo is its own single-plugin Claude Code marketplace:

- `.claude-plugin/plugin.json` — the plugin. Its `skills` array lists each
  published skill's folder (`./skills/<name>`) and is exactly what ships.
- `.claude-plugin/marketplace.json` — the catalogue, one entry sourced at
  `./`.

Every skill has an entry and no stale entries linger — `check_skills.py`
fails on either. Bump `version` in `plugin.json` when publishing; Claude uses
it to decide when installed users see an update. After touching either
manifest:

```bash
claude plugin validate . --strict   # must print Validation passed
```

Codex has no equivalent manifest — per [mattpocock/skills ADR 0002], its
plugin format takes `skills` as a single path string and drops symlinks on
install, so a curated subset can't be expressed. `npx skills@latest add
silouone/skills` is the Codex route, and stays the runtime-neutral one.

[mattpocock/skills ADR 0002]: https://github.com/mattpocock/skills/blob/main/.agents/adr/0002-ship-as-a-claude-code-plugin.md

## 3. Sanitization gate

Nothing in this repo — including issues and commit messages — may contain:

- employer, client, or colleague names (past or present);
- internal project/repo names or their directory layouts;
- links to my commercial site (attribution flows through the GitHub profile);
- secrets, tokens, absolute paths with usernames, or private URLs.

The concrete token list lives in `.sanitize-tokens` (gitignored on purpose —
publishing the list would leak the names it protects). Before every push:

```bash
grep -riEf .sanitize-tokens . --exclude-dir=.git --exclude=.sanitize-tokens \
  && echo LEAK || echo clean
```

## 4. Local-only guarantee

Skills here operate on the runner's machine. A skill that uploads, submits,
or phones home does not belong in this repo. Network calls are limited to
fetching public content the user explicitly pointed at (e.g. YouTube
captions), and each skill's docs must state exactly which calls those are.

## 5. Release checklist

1. `python3 tools/check_skills.py` → OK
2. `claude plugin validate . --strict` → Validation passed
3. Sanitization sweep → clean
4. Fresh-install walkthrough on both routes:
   `npx skills@latest add silouone/skills --list` must show every published
   skill, and the plugin must resolve them — add the marketplace and install
   into a throwaway `CLAUDE_CONFIG_DIR`. Then run one skill on a real input
   and confirm the documented outputs appear.
5. README skill index updated. Both install routes discover skills from the
   directory listing, so a new skill needs no installer edit — but it does
   need an entry in `plugin.json`.
