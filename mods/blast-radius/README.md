# blast-radius

Asks the person before a Bash command with a large blast radius runs: `find -delete`,
`xargs rm`, home-rooted/variable/shallow/glob `rm -rf`, `git clean -f`, `reset --hard`,
`push --force`, `DROP TABLE`, `curl | sh`, outbound POSTs, and more. The dialog shows which
rule matched, the command, and a read-only preview of what would be hit. Observe-only in
headless runs.

```
Blast radius:
git-reset-hard [high]: discards uncommitted changes

Command:
git reset --hard

Preview:
$ git diff --stat HEAD
 hooks/x.py | 42 +++---
 ...
Run it?      [ Proceed ]  [ Cancel ]  [ Allow this exact command for the session ]
```

## Why

The Python floor (`hooks/pre_tool_use.py`) blocks a short list of catastrophic patterns and
cannot ask anyone; the 2026-09-28 hooks audit lists destructive commands it misses
(`rm -rf ~/*`, `${HOME}`, `xargs rm`, `find -delete`, `bash -c "rm -rf ..."`). Widening the
floor would block legitimate work, so this mod adds the human layer from "Mod 3 — Blast
Radius" of a private setup spec: a narrow verb table, a preview built only
from provably read-only dry-runs, and a one-click decision. The floor stays as it is.

## What it does

| Piece | Behaviour |
|---|---|
| Matcher (`hooks/rules.ts`) | Pure, never throws. Splits the line on `&& \|\| ; \| &` and newlines, drops wrappers (`sudo`, `env`, `VAR=`), and also scans the bodies of `bash -c '...'` / `eval '...'`. 18 rules in the editable `RULES` table; `/blast` lists their ids. A rule whose test throws counts as matched (fails closed for that verb only). |
| Guard (`tool.call` on Bash) | Unmatched → `next(e)` immediately. Matched → `BLAST_RADIUS=off`, `/blast off` or a session-allowed exact command pass; otherwise `$.ui.ask` with **Proceed / Cancel / Allow this exact command for the session**. Cancel, dismissal, free text under "Other", or any error → `{ deny: 'blast-radius: <rule>: <why>' }`. A `.catch` denies if the guard itself fails before `next`. Subagent calls are asked too, and the question names the subagent. |
| Preview | Only: `find ... -print` (the `-delete`/`-exec rm` clause stripped), `git clean -n`, `git diff --stat HEAD` / `git diff --stat`, or `$.fs.stat(path, {resolve:true})` + `find <dir> -maxdepth 3 -type f` count for rm targets. Capped at 50 lines, 5 s timeout. After a `cd` in the same line, with variables/globs/substitutions, or for verbs with no dry-run (push, gh, SQL, curl, xargs): `preview unavailable`. |
| Headless | `session.start` said not interactive (`e.isInteractive && e.surface !== null` false: `claude -p`, SDK, CI pipelines), or `$.session.surfaces()` empty → never asks, never denies: logs `observed` to the store and `$.ui.log(..., {to:'debug'})`. |
| Log | `$.store` key `blast-radius.log`, last 200 decisions: `{at, ruleId, command (200 chars), decision: proceed\|deny\|observed\|session-allowed, agentId?}`. |
| `/blast` | Status, rule ids, last 20 decisions newest first. `/blast off` / `/blast on` pause/resume for this session (`$.state`). |

## How to test tomorrow

The mod cannot be hot-loaded into an already running session from here; start a new one.
Do this in a scratch repo so a mistaken Proceed costs nothing:

```sh
mkdir -p /tmp/br-play && cd /tmp/br-play && git init -q && echo a > a.txt && git add a.txt && git commit -qm init && echo b >> a.txt && touch junk.log
```

1. `claude plugin validate ~/.claude/mods/blast-radius` → `✔ Validation passed`.
2. `claude plugin test ~/.claude/mods/blast-radius` → `78 pass, 0 fail`.
3. `cd /tmp/br-play && claude --plugin-dir ~/.claude/mods/blast-radius`
   (or wire it via `CLAUDE_CODE_PLUGIN_DIRS`, see WIRING.md).
4. `/blast` → `Blast Radius: on`, the 18 rule ids, `No decisions yet.`
5. Prompt: `run exactly this bash command: git reset --hard` → a dialog headed
   `git-reset-hard [high]` with a preview `$ git diff --stat HEAD` showing `a.txt | 1 +`.
   Choose **Cancel** → the tool call is denied with `blast-radius: git-reset-hard: cancelled by the person`;
   `cat a.txt` still shows the `b` line.
6. Prompt: `run exactly this bash command: find . -name "*.log" -delete` → preview
   `$ find . -name *.log -print` listing `./junk.log`. Choose **Proceed** → it runs; `junk.log` is gone.
7. Prompt: `run exactly this bash command: git push -f` → choose
   **Allow this exact command for the session** (it fails for lack of a remote; that is fine).
   Ask for the same command again → no dialog. Ask for `git push -f origin x` → dialog again.
8. Benign look-alikes, no dialog: `rm -rf ./build`, `git rm --cached a.txt`, `curl -s https://api.github.com`.
9. Subagent: prompt `use a general-purpose subagent to run: git clean -fd` → the dialog says
   `From subagent <id>.`; Cancel denies it inside the subagent.
10. `/blast off` → `git reset --hard` would run unasked (don't, or Cancel later); `/blast on` to re-arm.
    `/blast` lists the decisions from steps 5-7.
11. Headless: `cd /tmp/br-play && claude -p "run this bash command: git clean -n -d; then run: find . -name nothing.tmp -delete" --plugin-dir ~/.claude/mods/blast-radius --allowedTools Bash`
    runs without a dialog or denial. Then `claude -p "/blast" --plugin-dir ~/.claude/mods/blast-radius`
    → the `find-delete` call is listed as `observed`.
12. Env kill switch: `BLAST_RADIUS=off claude --plugin-dir ~/.claude/mods/blast-radius` → no dialogs at all.

Already verified on 2026-10-15 (Claude Code 2.1.300): steps 1-2, and step 11 for real — a
`claude -p` run executed `find /tmp/br-live-1015 -name nothing.tmp -delete` with no dialog or
denial, and a following `claude -p "/blast"` listed it as `observed find-delete`. Steps 3-10 and
12 (the interactive dialog) were not run in a live session.

## Disable / remove

- One session: `/blast off`, or start with `BLAST_RADIUS=off`, or just don't pass `--plugin-dir`.
- Wired globally: remove `~/.claude/mods/blast-radius` from `CLAUDE_CODE_PLUGIN_DIRS`.
- Narrow or widen what asks: edit `RULES` in `hooks/rules.ts` and add a row to the test table.
- Drop the log: the plugin store key `blast-radius.log`, or delete the folder.

## Known limitations

- **Pattern matching, not a shell parser.** Quoting/escaping edge cases, aliases, functions,
  scripts (`./wipe.sh`), `$(...)` building the verb, or base64-decoded payloads are not seen.
  It is a human layer on top of the Python floor, not a sandbox.
- The dialog has no timeout: it waits until answered or dismissed (`$.ui.ask` exposes none,
  and awaiting a `$` call does not consume the hook budget). Dismissal denies.
- Previews run in the session's cwd; after a `cd` in the same line they are skipped. The rm
  preview counts files to depth 3 only.
- "Allow this exact command" is exact-string: any whitespace change asks again. It lasts for
  the session (`$.state`), not across sessions.
- Headless detection is the `session.start` flag plus `$.session.surfaces()`. After a hot reload
  `session.start` does not fire again, so until the next session only `surfaces()` decides; an SDK
  host that then attaches a surface but cannot answer `AskUserQuestion` would make `$.ui.ask`
  reject, which denies (fail closed). Not exercised against real SDK pipeline runs;
  `BLAST_RADIUS=off` in that process is the escape hatch.
- `sql-destructive` and `brain-db-write` look at the whole line, so `sqlite3 x.db .tables; echo "DROP TABLE"` asks.
