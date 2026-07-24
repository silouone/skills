# Publishing rules

Every skill published here carries the same guarantees. This file is the
checklist that keeps them true.

## 1. Dual-variant rule

A skill lands with **three parts or it doesn't land**:

- `skills/<name>/CORE.md` — the platform-neutral contract (what the skill
  does, inputs, output shapes, guarantees).
- `skills/<name>/claude/` — a complete, installable Claude Code skill folder.
- `skills/<name>/codex/` — a complete, installable Codex skill folder.

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

## 2. Sanitization gate

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

## 3. Local-only guarantee

Skills here operate on the runner's machine. A skill that uploads, submits,
or phones home does not belong in this repo. Network calls are limited to
fetching public content the user explicitly pointed at (e.g. YouTube
captions), and each skill's docs must state exactly which calls those are.

## 4. Release checklist

1. `python3 tools/check_drift.py` → OK
2. Sanitization sweep → clean
3. Fresh-install walkthrough on at least one platform: copy the variant
   folder to the runtime's skills directory, run it on a real input, confirm
   the documented outputs appear.
4. README skill index updated.
