# agent-fleet

A live pane listing every subagent in the session, a status line while any of them run,
toasts for long or failed runs, and `/fleet` / `/fleet cost` tables.

```
● Explore      notes-hub harvest            haiku-4-5  01:12   14t    38k Grep
● general-pur… refactor gate hook           opus-4-1   00:40    6t    21k Edit
✓ Explore      list mods                    haiku-4-5  00:09    3t     4k Read
2 running · 1 done · 63k tokens  [main]
```

## Why

When several subagents run in parallel, the only way to see them is the tasks list, one
at a time. You can't tell at a glance which ones are still running, which model each got,
how long they have taken, or what they last did. This mod builds that roster from engine
events, sends nothing to the model, and puts it in a pane. A row press opens that
agent's transcript, `[main]` returns to the main thread, and `/fleet cost` shows where the
tokens went. It implements the "Fleet Panel" of a private setup spec.

## What it does

| Piece | Behaviour |
|---|---|
| Roster | `agent.spawn` (type, description, the model `next(e)` resolved), `turn.start/step/complete` carrying `e.agentId` (status, elapsed, token usage summed over steps), `tool.call` with `e.agentId` (tool count, last tool; main-loop calls are not counted). While any agent runs, a 5 s `$.clock.every` reconciles with `$.agent.list()`; it stops when none run. Kept in a `$.state` atom, capped at 100 (oldest finished dropped first). |
| Pane `fleet` | One row per agent: glyph (`●` running, `✓` done, `✗` error/aborted), type, description, model, mm:ss, tools, tokens (in+out), last tool (if ≥ 70 columns). Running first, then finished, newest first. Each row is a plain Button that runs `$.ui.view({ agentId })`. The footer shows totals and a `[main]` button that runs `$.ui.view({})`. |
| Auto-open | Only when ≥ 2 agents run **and** the terminal is fullscreen (learned from `PromptHint`/`Spinner` render viewports or `/fleet`'s `presentation`), and never again after the person closes the pane. |
| Status line | `fleet: 3 running · 2 done[ · 1 failed]` while any run; cleared when none do. |
| Toasts | An agent that finishes after > 60 s: `✓ Explore "harvest" done in 8m02s, 1 tool`. Every error or abort, whatever its length: `✗ … failed/aborted after …`. |
| `/fleet` | Opens the pane (interactive only) and prints the roster as a markdown table with totals. Works headless. |
| `/fleet cost` | Token table per agent and per model (in = uncached input + cache writes, out, cache read). Token counts only, no dollar figures. |
| Headless | When `session.start` reports not interactive or no surface (`claude -p`, SDK, CI pipelines), the mod only records the roster. It draws no status line, toast or pane. `/fleet` still prints its table. |

## How to test tomorrow

The mod can't be hot-loaded into a session that is already running. Start a new one.

1. `claude plugin validate ~/.claude/mods/agent-fleet` → `✔ Validation passed`.
2. `claude plugin test ~/.claude/mods/agent-fleet` → `12 pass, 0 fail`.
3. Headless check: `claude -p "/fleet" --plugin-dir ~/.claude/mods/agent-fleet --max-turns 1`
   → prints `No subagents in this session yet.` (verified 2026-10-15).
4. Start a session with the mod loaded, **outside tmux** and without `CLAUDE_CODE_NO_FLICKER=0`
   (that is the fullscreen / alternate-screen layout; tmux and `CLAUDE_CODE_NO_FLICKER=0` give
   the main-screen layout, where panes take over instead of docking as a sidebar):
   `claude --plugin-dir ~/.claude/mods/agent-fleet` (or wire it, see WIRING.md).
   You are in fullscreen if `/fleet` docks the pane beside the transcript.
5. Type `/fleet` → the pane `Agent fleet` opens showing `No subagents yet.`, and the transcript
   shows `No subagents in this session yet.` Close the pane with its close mark.
   Note: this counts as the person closing it, so auto-open is now off for this session.
   Restart the session before step 6, or skip step 5.
6. Prompt: `Spawn two Explore subagents in parallel: one lists ~/.claude/mods, one lists ~/.claude/hooks. Each should read two files before answering.`
   → when the second one starts, the pane opens by itself (fullscreen only), and the status
   line shows `fleet: 2 running · 0 done`. Rows tick every 5 s with tool counts and last tool.
7. Click (or focus and press Enter on) a row → the view switches to that agent's transcript.
   Click `[main]` → back to the main thread.
8. When both finish → the status line clears and the rows show `✓`. No toast appears unless
   an agent took more than 60 s.
9. `/fleet` → markdown table with `0 running · 2 done · … tokens`. `/fleet cost` → per-agent
   and per-model token tables, with no `$` anywhere.
10. Toast check: ask for one subagent with a long task (e.g. `Spawn a general-purpose agent to read every README under ~/.claude/mods and summarise each`).
    If it runs past 60 s, a `✓ … done in XmYYs, N tools` toast appears. Interrupt an agent
    (Esc on it in the tasks list) → a `✗ … aborted after …` toast appears.
11. Main screen check: `CLAUDE_CODE_NO_FLICKER=0 claude --plugin-dir ~/.claude/mods/agent-fleet`
    (or run inside tmux), then repeat step 6 → the pane
    does **not** open by itself, but `/fleet` still opens it.

## Disable / remove

- One session: don't pass `--plugin-dir`.
- Wired globally: remove `~/.claude/mods/agent-fleet` from `CLAUDE_CODE_PLUGIN_DIRS`.
- Nothing is persisted (`$.state` only, no `$.store`). Deleting the folder removes everything.

## Known limitations

- **Untested against a live session.** The tests use the engine's test harness. I didn't
  load the mod into an interactive session, and only the headless `/fleet` smoke ran for real.
- **The person-close rule is only unit-tested.** The test engine's `$.ui` has no `close`, so
  the `ui.close` hook (origin `person` sets `closedByPerson`) is not exercised end to end. The
  decision function `shouldAutoOpen` it feeds is tested.
- Fullscreen is learned from the `PromptHint`/`Spinner` render viewport (terminal only) or
  from `/fleet`. Until one of these has been drawn, the mod doesn't know the screen is
  fullscreen and does not auto-open.
- Module caches (`isFullscreen`, the ticker) die on hot reload. The ticker restarts on the
  next roster change.
- Tokens come from `turn.step` usage, falling back to `turn.complete`'s `usage` when no step
  was seen. Background agents whose steps the mod misses may under-count.
- `$.agent.list()` doesn't name workflow agents and drops ended tasks. Reconcile only adds
  or settles agents; it never removes them.
- The pane shows as many rows as fit; the rest are summarised as `… N more (/fleet for all)`.
  It has no scrolling of its own.
- The roster is per session (`$.state`). It is not kept across sessions.
