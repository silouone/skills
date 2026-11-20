# test-pulse

A zero-token test-status pane. Every Bash result from a test runner is parsed (no model
call), recorded, and compared with the previous run of the same runner in the same
directory: what newly fails, what got fixed, and whether skips went up or tests disappeared
(possible test weakening).

```
✗ 3 fail · 117 pass · 5 skip
bun (agent) · 12s ago · bun test
skips +2 ⚠ (possible test weakening)
newly failing
  router > handles 404
trend ▇██▇█
failing
  router > rejects bad token
  ...
[ copy failing ] [ clear ]
```

## Why

Agents (and subagents) run tests constantly, and the result scrolls away in a tool row. The
two signals that matter most are easy to miss in that scroll: a test that was green and is
now red, and a run that "passes" because tests were skipped or deleted. This mod keeps both
on screen and in a status line, with zero background tokens, as the human-visible layer on
top of the Python test-weakening floor (`hooks/test_weakening.py`), per the "floors in
Python hooks, visibility in mods" principle of a private setup spec.

## What it does

| Piece | Behaviour |
|---|---|
| Recognised commands | `bun test`, `pytest` / `uv run pytest` / `py.test`, `vitest`, `jest`, `npm\|pnpm\|yarn [run] test`, `cargo test`, `go test`, `make check\|test`, `just test*`. `uv run <x>.py` is kept only when its output parses as pytest. Anything else is ignored. |
| Parsers (`hooks/parsers.ts`) | Pure, ANSI stripped first, null when nothing parsed. Output formats: bun, pytest, vitest, jest, cargo, go (the wrapper commands are detected by their output). |
| Record | `$.state` `test-pulse.runs`, last 50: `{at, runner, command, cwd, pass, fail, skip, total, durationMs?, failing[], agentId?, newlyFailing, newlyFixed, skipDelta, totalDelta}`. cwd follows a leading `cd <dir> &&`. Deltas compare with the previous run of the same runner + cwd; skip/total deltas only when the command is identical (a different selection changes counts legitimately). |
| Status line | `tests ✗3/120 (bun)` / `tests ✓120/120 (bun)`. |
| Toasts | red→green `tests green again: N pass`; green→red `N tests now failing: a, b, c`; skip increase `⚠ skip count +N in <runner>`. `(agent)` appended for subagent runs. |
| Pane `tests` | Big headline, runner + relative time + command, `skips +N ⚠ (possible test weakening)`, `tests −N ⚠` (total dropped without matching skips), newly failing (red), newly fixed (green), sparkline of the last 20 pass ratios, failing names, buttons `copy failing` / `clear`. Auto-opens once, on the first red run, only when the terminal is fullscreen and the person has not closed it. |
| `/tests` | Opens the pane; with no surface it answers a markdown summary instead. `/tests history` = markdown table of the last 20 runs, newest first. |
| Headless | `claude -p` / SDK (no surface): records only; no status, toasts or pane. |

## How to test tomorrow

The mod cannot be hot-loaded into an already running session from here; start a new one.

1. `claude plugin validate ~/.claude/mods/test-pulse` → `✔ Validation passed`.
2. `claude plugin test ~/.claude/mods/test-pulse` → `41 pass, 0 fail`.
3. Headless check: `claude -p "/tests" --plugin-dir ~/.claude/mods/test-pulse --max-turns 1`
   → `test-pulse: No test runs recorded yet in this session.`
4. Start a fullscreen session in `~/.claude` (its `hooks/test_*.py` files are pytest suites):
   `cd ~/.claude && claude --plugin-dir ~/.claude/mods/test-pulse`
   (or wire it via `CLAUDE_CODE_PLUGIN_DIRS`, see WIRING.md).
5. Type `/tests` → the pane opens with `No test runs yet.` Close it.
   Closing it by hand disables auto-open for the session; to test auto-open (step 7) skip
   this step or start a fresh session.
6. Prompt: `run "uv run --with pytest pytest -q hooks/test_gate.py" with Bash and nothing else` →
   status line `tests ✓12/12 (pytest)`. (Any recognised runner works, e.g. `bun test` in a bun repo.)
7. Break a test (edit an assertion), ask Claude to run the same command again → toast
   `1 tests now failing: <name>`, status `tests ✗1/N (...)`, and (fullscreen, first red run)
   the `tests` pane opens with the name under *newly failing*.
8. Revert, run again → toast `tests green again: N pass`; pane shows it under *newly fixed*.
9. Add a skip (`test.skip(...)` / `@pytest.mark.skip`) to a passing test and run the same
   command → toast `⚠ skip count +1 in <runner>` and pane line
   `skips +1 ⚠ (possible test weakening)`. Revert it.
10. `/tests history` → table with one row per run, newest first, `⚠ skip +1` on that row.
11. In the pane press `copy failing` (when red) → names in clipboard; `clear` → empty pane,
    status line cleared.
12. Subagent tag: ask `use a subagent to run <test command>` → rows and toasts carry `(agent)`.

## Disable / remove

- One session: don't pass `--plugin-dir`.
- Wired globally: remove `~/.claude/mods/test-pulse` from `CLAUDE_CODE_PLUGIN_DIRS`.
- Runs live in session state only (nothing persisted); deleting the folder removes everything.

## Known limitations

- **Not yet seen in a live session.** Validate, the 41 unit tests, tsc and the headless
  `/tests` smoke pass, and real `pytest -q` output (`hooks/test_gate.py`) parses; the Bash result shape in a real session (`stdout`/`stderr` vs `text`)
  is handled by `outputOf` both ways but was only exercised with mocked results.
- Parsing is by summary-line regex. Unusual reporters (`--reporter=dot`, JSON reporters,
  `pytest -qq` without a summary, custom `make` output) produce no record. Output truncated
  by the Bash tool before the summary line is also missed.
- Go without `-v` counts passing packages, not tests; failing test names need `--- FAIL` lines.
- Failing names are capped at 30 per run; commands are stored truncated to 80 chars.
- Runs are per session (`$.state`), not persisted across sessions; the first run of a
  session has no baseline, so no deltas or transition toasts.
- Fullscreen is learned from the prompt hint render; until the first render the pane never
  auto-opens (only `/tests` opens it).
- Weakening warnings are a hint, not a gate: skip/total deltas are only computed when the
  command string is identical to the previous run. The blocking floor is the Python hook.
