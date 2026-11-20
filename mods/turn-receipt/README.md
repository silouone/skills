# turn-receipt

Mod 2 (Turn Receipt) and Mod 4 (Gate Badge) from a private setup spec.

## What it does

1. **Turn receipt.** When a main-loop turn ends, the mod appends a `system` transcript notice. The model never reads these notices. It looks like this:
   ```
   ── turn receipt ── 14s · 7 tool calls
   Read({ file_path: "settings.json" })
   Bash({ command: "git status --short" })
   Agent({ subagent_type: "builder", description: "Build it" })
   diff this turn: hooks/x.py +42 −3 · README.md +10 −0 · (new) mods/y/plugin.json
   ```
   - It lists only main-loop tool calls. Subagent calls are left out, and a subagent's turn end never produces a receipt.
   - The diff line is a delta. The mod snapshots `git diff --numstat HEAD` and `git status --porcelain -uall` when the turn starts and again when it ends, and shows only the difference. Edits that were already in the working tree before the turn are not shown.
   - Outside a git repo, or when git is missing, the receipt shows the tool list only.
   - A turn with no tool calls and no delta produces nothing.
   - `/receipt` prints the last receipt. The last 10 receipts are kept in `$.state` (`turn-receipt.receipts`).
2. **Gate badge.** A status entry under the prompt, read from `~/.claude/logs/gate/<session_id>/`:
   - It shows `gate: pending (fails N/5)` when `gate.py` exists and `meta.json` has a numeric `fails` field. The cap of 5 is `HALT_CAP` in `hooks/gate_common.py`.
   - In every other case (no gate, missing or malformed meta) the entry is cleared, with no error.
   - It refreshes on main `turn.start`, `turn.complete`, `classic.Stop` (after the settings Stop hooks run; observe only) and every 30 s.
   - It only reads files and never writes.
3. **Headless** (`claude -p`, SDK, CI pipelines, meaning `$.session.surfaces()` is empty): the mod does nothing. It makes no git calls, appends no rows, sets no status and starts no timer.

## Why

The output style `observable-tools-diffs-tts.md` makes the model hand-write a list of the tools it called and a git-diff report at the end of every turn. That costs output tokens (rate-limit headroom) and is often wrong. For example, it lists tools from earlier turns or reports working-tree changes that predate the turn. The harness already knows exactly which tools ran and can diff the tree itself. This mod builds the same report deterministically, at zero tokens, as a notice the model never reads. That makes the model's self-report sections removable later. The gate badge makes a blocked Stop visible: you can see a gate is pending and how many blocked stops are left before the cap.

## Design notes

- **Main-loop filter.** `tool.call` carries `agentId` in a subagent and leaves it out on the main loop (`AgentLoop` in the types). The mod records a call only when `e.agentId === undefined`, so it does not need to track turns to tell the loops apart. `turn.start` and `turn.complete` are filtered the same way.
- **Summary format.** Each line shows up to two of these string arguments, in this order: `subagent_type, description, file_path, notebook_path, command, pattern, path, url, query, skill`. If none of those is present, it shows the first string argument. Otherwise it shows `Tool({})`. `file_path` and `notebook_path` are cut to the basename, and every value is cut to 60 characters with `…`.
- **Not a guard.** `tool.call` and `classic.Stop` are observe-only. They have no deny-style `.catch`, so a bug in the receipt can never refuse a tool call or change the Stop outcome. `claude plugin validate` prints "gating hook without .catch" for both. That is reported as a fact, not a warning, and it is intentional here.
- Pure logic (summaries, numstat parsing, delta, formatting, the badge rule) lives in `hooks/receipt.ts`. All I/O lives in `hooks/register.tsx`.

## How to test tomorrow

You can't hot-load this into an existing session. Start a new one:

```bash
cd ~/some/git/repo        # any repo with or without local edits
claude --plugin-dir ~/.claude/mods/turn-receipt
```

1. **Conversational turn.** Type `hi`. Expect no receipt.
2. **Tool turn.** Type `read package.json and run git status`. Under the answer, expect a dim notice that starts with `── turn receipt ── Ns · 2 tool calls`, followed by `Read({ file_path: "package.json" })` and `Bash({ command: "git status" })`. There should be no `diff this turn` line, because nothing changed.
3. **Delta excludes pre-existing edits.** In another shell, first run `echo x >> README.md` (a change made before the turn). Then type `append the line "receipt test" to NOTES.md (create it)`. The diff line should show `(new) NOTES.md`, or `NOTES.md +1 −0` if the file was already tracked. It should **not** show README.md.
4. **Subagent exclusion.** Type `use a subagent to read README.md and summarize it`. The receipt should list `Agent({ subagent_type: "…", description: "…" })` only, with no Read from inside the subagent. There should be exactly one receipt for the turn.
5. **`/receipt`.** Type `/receipt`. Expect the last receipt text again.
6. **No repo.** Run `cd /tmp && claude --plugin-dir ~/.claude/mods/turn-receipt`, then ask `list the files here`. Expect a receipt with the tool line and no diff line.
7. **Gate badge.**
   - Type `! echo $CLAUDE_CODE_SESSION_ID` to get the session id. Then in another shell (replace `SID`):
     ```bash
     d=~/.claude/logs/gate/SID; mkdir -p "$d"; touch "$d/gate.py"; echo '{"request":"t","fails":2}' > "$d/meta.json"
     ```
   - Within 30 s, or at the next turn, expect `gate: pending (fails 2/5)` under the prompt.
   - Run `echo '{oops' > "$d/meta.json"`. Expect the badge to disappear at the next refresh.
   - Run `rm -rf "$d"`. Expect it to stay gone.
   - Or use the real `/gate` workflow and watch the count climb on blocked Stops.
8. **Headless.** Run `claude -p "read README.md" --plugin-dir ~/.claude/mods/turn-receipt`. Expect a normal answer, with no receipt and no error on stderr.

## Automated checks (run 2026-10-15)

```bash
claude plugin validate ~/.claude/mods/turn-receipt      # ✔ Validation passed
claude plugin test ~/.claude/mods/turn-receipt          # 17 pass, 0 fail
bunx tsc -p /tmp/tsc-turn-receipt                       # exit 0 (tsconfig from the types header)
```

## Disable / remove

- One session: drop the `--plugin-dir` flag.
- If you wired it through `CLAUDE_CODE_PLUGIN_DIRS`: remove `~/.claude/mods/turn-receipt` from that variable (see WIRING.md).
- To remove it entirely: `rm -rf ~/.claude/mods/turn-receipt`. It writes nothing outside `$.state`.

## Known limitations

- **Delta is a subtraction of numstat totals.** If a file had +10 before the turn and the turn edits some of those same lines, the counts may not move, and the file is then missed. A turn that reverts earlier edits shows negative numbers (`+-3`). Binary files show as `(binary)` when their numstat entry changes.
- **Untracked files** are reported only when they *appear*. If an untracked file existed before the turn and the turn edited it, it is not reported. A commit made during the turn moves `HEAD`, so its lines drop out of the delta.
- In a repo with no commits yet (unborn `HEAD`), the mod falls back to `git diff --numstat` against the index.
- At most 12 diff entries are shown, then `+N more`.
- The receipt records a call when its `tool.call` hook fires, so a call later refused (another plugin, a permission deny) may still be listed.
- Where the notice lands relative to the final answer row is whatever the engine does at `turn.complete`. This has not been seen in a live session yet.
- A hot reload in the middle of a turn loses that turn's in-flight collector (module variables), so that turn gets no receipt.
- In the test kit, `$.tool.call` drops `agentId`, so the subagent-call exclusion is unit-tested on the pure `isMainLoop` predicate. The subagent `turn.complete` path is tested end to end. Step 4 above is the live check.
- Mod access to `~/.claude/logs/gate` through `$.fs`, and git through `$.process.run`, are on the spec's "Unverified register". Steps 3 and 7 confirm them live. If either is refused, the receipt falls back to the tool list and the badge stays off. Neither raises an error.
- `classic.Stop` hooks do not run for user-installed plugins under organization-managed settings (validator note). There, the badge still refreshes on turn events and the timer.

## Follow-up (HUMAN decision, not done here)

Once the receipt has proven accurate over real sessions, trim the **"Additional Behavior: Ordered Tool Calls"** and **"Additional Behavior: Git Diff Reporting"** sections from `~/.claude/output-styles/observable-tools-diffs-tts.md`, keeping a backup. This is a separate, approved step (spec user story 24) so reporting is never lost in between. The audio-summary section is handled separately under the spec's TTS item.
