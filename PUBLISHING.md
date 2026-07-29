# Publishing rules

Every skill published here carries the same guarantees. This file is the
checklist that keeps them true.

## 1. Dual-variant rule

A skill lands with **three parts or it doesn't land**:

- `skills/<name>/CORE.md` — the platform-neutral contract (what the skill
  does, inputs, output shapes, guarantees).
- `skills/<name>/claude/` — a complete, installable Claude Code skill folder.
- `skills/<name>/codex/` — a complete, installable Codex skill folder,
  including `agents/openai.yaml` (Codex reads it for the skill's display
  name, one-liner, and invocation policy).

Every `SKILL.md` is either **user-invoked** or **model-invoked**, and the two
variants must agree: user-invoked means `disable-model-invocation: true` in
the Claude frontmatter *and* `policy.allow_implicit_invocation: false` in
`agents/openai.yaml`. A skill the model may reach on one runtime but not the
other is a bug, not a platform variance.

Adapters embed `<!-- core-hash: … -->`. After editing any `CORE.md`:

```bash
# revisit BOTH adapters first, then:
python3 tools/check_drift.py --stamp
python3 tools/check_drift.py   # must print OK
```

Files shipped identically in both variants (e.g. `scripts/`) must stay
byte-identical — the drift check enforces this too. Intentional platform
variance (a capability one runtime lacks) is documented in the skill's
`CORE.md` under "Known platform variance", never left implicit.

## 2. Distribution manifests

The repo is its own single-plugin Claude Code marketplace:

- `.claude-plugin/plugin.json` — the plugin. Its `skills` array lists each
  published skill's **claude adapter path** (`./skills/<name>/claude`). The
  invocation name comes from the adapter's frontmatter `name:`, not the
  folder — which is what lets three folders all called `claude/` install as
  `ingest`, `ai-usage-card`, and `sitrep`.
- `.claude-plugin/marketplace.json` — the catalogue, one entry sourced at
  `./`.

Every skill's claude adapter has an entry in the `skills` array and no stale
entries linger — `tools/check_drift.py` fails on either. Bump `version` in
`plugin.json` when publishing; Claude uses it to decide when installed users
see an update. After touching either manifest:

```bash
claude plugin validate . --strict   # must print Validation passed
```

Codex has no equivalent manifest — its plugin format takes `skills` as a
single path string and drops symlinks on install, so a curated subset of this
layout can't be expressed. `install.sh` is the Codex path, and stays the
runtime-neutral one.

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

1. `python3 tools/check_drift.py` → OK
2. `claude plugin validate . --strict` → Validation passed
3. Sanitization sweep → clean
4. Fresh-install walkthrough against a throwaway root:
   `./install.sh --claude --dir "$(mktemp -d)"`, twice — the second run must
   produce the same tree (no nested `claude/` level), and `SKILL.md` must sit
   at depth 1. Then install for real on at least one platform, run the skill
   on a real input, and confirm the documented outputs appear.
5. README skill index updated. `install.sh` discovers skills from the
   directory listing, so a new skill needs no installer edit — but it does
   need both variant folders to exist, and an entry in `plugin.json`.
