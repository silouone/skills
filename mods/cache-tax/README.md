# cache-tax

A dim band above the prompt that shows context fill, rate-limit headroom and how well the
last turn hit the prompt cache, and that turns into a warning when an idle gap has probably
let the cache go cold. Plus `/ctx` (history and a measured cache-lifetime estimate), an
opt-in `/keepwarm`, and two automatic handoffs written from the still-warm cache: one just
before an idle session's cache expires, one when the context window is nearly full.

```
ctx 42% │ 5h 31% · 7d 12% │ last turn: cache 91% · 14s · 7 tools │ ↪ handoff: /Users/you/.claude/handoffs/api-3f2a91c0.md   [ Hide ]
⚠ cache likely cold (idle 73 min): next prompt re-reads ~142k tokens (5h window 31% used) │ ↪ handoff: /Users/you/.claude/handoffs/api-3f2a91c0.md
```

Claude Code only (a hooks-module plugin). Built and unit-tested against Claude Code 2.1.329
(macOS); steps 9–11 of *How to test* are the live checks.

## Why

On a rate-limited plan the real cost of a prompt is rate-limit headroom, and the most
expensive avoidable prompt is the first one after a long idle gap: the whole context is
re-read uncached (a cache read costs ~10 % of the input price, a cache write ~125 %). This
mod makes that cost visible *before* typing (a timer raises the warning; nothing is sent to
the model to do it), records idle gap vs cache-read share for every turn so the real cache
lifetime can be measured instead of guessed, offers a capped, opt-in keep-warm, and, so that
letting the cache go cold never means losing the work, writes a handoff document while the
cache is still warm. The same handoff fires when the context window is nearly full: with
auto-compact off, a full window ends the session and no handoff can be asked for after.

## Usage: a typical session

| Moment | What you do | What the mod does |
|---|---|---|
| Start | Work as usual. Keep the stable part of a prompt first: the cache is a prefix. | Band shows context, rate limits, last turn's cache share. Editing `CLAUDE.md`/memory, `/model` or the MCP list mid-session rewrites the prefix (`cache went cold: +Nk tokens re-read`). |
| Short break, terminal open | Nothing. | At `cacheLifetimeMinutes − safetyMarginMinutes` idle (55 min) it writes the handoff; that fork reads the cache too, which should keep it warm another lifetime (step 9 checks it). |
| Longer break, big context, terminal open | `/keepwarm on` | A one-token refresh before each expiry, up to `keepWarmMaxRefreshes`; the handoff comes at the cap, right before the cache goes cold. |
| Closing the lid | Run a manual handoff (e.g. a `/handoff` skill). | Nothing: a sleeping machine runs no timer. |
| Back, still warm | Type. | The handoff note clears on the next turn. |
| Back, cold (warning + handoff path on the band) | Big context: `/clear`, then `Read <path> and continue from it.`; small one: just continue. | |
| Long autonomous run | Nothing. | At `lowContextPercent` (5 %) or less of the window left it writes the last-chance handoff once, mid-turn if need be. |
| Next session | `claude "Read <path> and continue from it."` | The document's header also gives `claude --resume <id>`, which re-reads the whole context uncached. |

`/ctx` at any time: idle gaps vs first-request cache share, and the measured cache lifetime.

## What it does

| Piece | Behaviour |
|---|---|
| Band (`AbovePrompt`) | `ctx %` from `$.session.usage().context.percent`, `5h`/`7d` from `rateLimits[]`, last main-loop turn: cache share (`cache_read / (input + cache_read + cache_creation)`, summed over the turn's requests), duration, tool calls; then the handoff notes. `Hide` hides it for the session (a new cold warning or handoff note un-hides it). Yields to surveys and when there is nothing to show. |
| Cold warning | A `$.clock.every(60s)` ticker compares the time since the last cache read (any main-loop request, keep-warm refresh or idle-handoff fork) to `cacheLifetimeMinutes`; past it **and** with context tokens > `warnTokenThreshold`, the band shows the warning line. Zero model tokens. A new prompt clears it and restarts the countdown, and every request of the turn restarts it again, so it does not come back during a long agentic turn; it returns only after a full lifetime with no activity. |
| Per-turn record | `$.store` key `cache-tax.turns`, last 200 (persists across sessions): `{at, idleGapMs, inputTokens, cacheRead, cacheCreation, outputTokens, durationMs, tools, model, firstCacheShare}`. Token counts are summed over the turn's `turn.step` requests (falling back to `turn.complete`'s `usage`); `firstCacheShare` is the cache share of the turn's **first** request, the one an idle gap affects. Main loop only. |
| `/ctx` | Markdown table of the last 20 turns (time UTC, idle gap, first-request cache %, turn cache %, in/out tokens, duration, tools), current usage, and `Estimated cache lifetime: ≤ N min` = the smallest idle gap after which the first-request cache share fell below 50% (plus the longest gap still seen warm), or `not enough data`. |
| `/keepwarm [on\|off\|status]` | Default off. When on, `cacheLifetimeMinutes − safetyMarginMinutes` after the last cache read it calls `$.model.fork({ prompt: 'Reply with a single period.' })` (appends nothing to the transcript, so no Stop hook runs), repeating while idle, at most `keepWarmMaxRefreshes` times per idle stretch (the counter resets on each real turn). Any non-answered arm (`api-error`, `empty-reply`, `aborted`, `nothing-to-fork`) or a fork whose `cache_read_input_tokens` is under 50% of the context turns keep-warm **off**, toasts why, and hands the idle timer to the auto-handoff. Reaching the cap toasts and runs the auto-handoff. `/keepwarm off` hands the timer back to the auto-handoff, due as if keep-warm had never been on. |
| Auto-handoff (idle) | Default **on**. `cacheLifetimeMinutes − safetyMarginMinutes` after the last cache read (or at the keep-warm cap) it calls `$.model.fork` with a handoff prompt (no `effort`: a level other than the session's can rewrite the whole conversation to cache). The fork reads the still-warm prefix, so the handoff costs little, and that read restarts the cache's lifetime. It writes `~/.claude/handoffs/<project>-<id8>.md` (one file per session, overwritten each time: the latest covers everything before it) with a header giving both ways back: fresh and cheap (`claude "Read <file> and continue from it."`, or `/clear` then that prompt) or in full (`cd <start dir> && claude --resume <id>`). `<project>` and the `cd` are the directory the session started in (read once at its first start; `$.session.root()` moves with `/cd`, `--resume` does not). The prompt includes the last final answer, because a fork replays the last *request*, which ends before it, and tells the model to ignore the output style and use no tool. The band shows `│ ↪ handoff: <path>`, on the cold warning too, until the next turn. Once per idle stretch, one fork at a time. Skipped when the context is ≤ `warnTokenThreshold`; skipped with a reason when the timer runs after the lifetime (the machine slept: the cache is gone and a fork would rewrite it all at ~125 %); dropped when the person starts a turn during the fork or the write. A reply without ≥ 3 Markdown headings is not written. Failures (including an engine call that throws) toast `handoff failed: …` and stay on the band as `│ no handoff: <reason>`. |
| Last-chance handoff | Same fork and file, triggered by context instead of idle time. After every main-loop API response (mid-turn too, so a long autonomous turn is covered) it reads the status line's context figure, `$.session.usage().context.tokens` (for a server-side tool loop: its last iteration, not the summed step usage). At `lowContextPercent` (5) or less of the window left it fires **once**. The fork runs from a timer, not the step's hook, so Esc on the turn does not abort it and the main loop does not wait on it. The band shows `│ writing last-chance handoff…`, then `│ ↪ last-chance handoff: <path>` or `│ no last-chance handoff: <reason>` (toast `last-chance handoff saved/failed: …`), kept across turns. The fired state lives in plugin state, so a reload (any `/config` change) does not fork the near-full context again; a pending state whose fork a reload cancelled fires again. A failure is not retried request after request: each try reads the whole near-full context. When the context drops back (after a `/clear`), the note clears at the next response and the trigger re-arms. |
| Toasts | Context fill ≥ 80% (once per session). First-request cache share < 30% after a turn > 70%: `cache went cold: +Nk tokens re-read`. Handoff saved/failed. |
| Headless | When `session.start` says not interactive (or no surface: `claude -p`, SDK, CI pipelines) it registers no commands, starts no timers, writes no handoff and shows nothing; it only records turns to the store. |

Settings (`userConfig`, editable in `/config` or `settings.json` → `pluginConfigs["cache-tax"].options`):
`cacheLifetimeMinutes` (60), `safetyMarginMinutes` (5), `warnTokenThreshold` (20000),
`keepWarmMaxRefreshes` (6), `keepWarmDefault` (false), `autoHandoff` (true, both handoffs),
`lowContextPercent` (5; 0 turns the last-chance handoff off).

## Network calls and files

Model requests only, through the session's own API client and credentials: the keep-warm
refresh forks and the handoff forks (each sends the session's own conversation, as its next
prompt would). Nothing else leaves the machine. Files written: `~/.claude/handoffs/<project>-<id8>.md`
(handoff documents; they hold conversation content, so keep that folder out of version
control) and the plugin's own store (`cache-tax.turns`).

## How to test

The mod is not hot-loaded into a session that started without it; start a new one.

1. `claude plugin validate <path>/cache-tax` → `✔ Validation passed`.
2. `claude plugin test <path>/cache-tax` → `46 pass, 0 fail`.
3. Start a session with it: `claude --plugin-dir <path>/cache-tax`
   (or wire it via `CLAUDE_CODE_PLUGIN_DIRS`, see WIRING.md).
4. Type `/ctx` before any prompt → a table-less report with `No turns recorded yet.` and
   `Estimated cache lifetime: not enough data`.
5. Send a prompt that uses a couple of tools, e.g. `list the files here and read one README`.
   After it finishes the band shows `ctx N% │ 5h …% · 7d …% │ last turn: cache …% · …s · N tools`
   (the rate-limit segment is absent off a subscription).
6. Press `Hide` (ctrl+x tab to focus the band, or click) → the band disappears.
7. Cold warning without waiting an hour: `/config` → cache-tax → set *Cache lifetime* to `2`,
   *Warning token threshold* to `1000` and *Auto-handoff* off (the module reloads with the new
   options). Send one prompt, then wait ~3 minutes idle → the band turns into
   `⚠ cache likely cold (idle 2 min): next prompt re-reads ~Nk tokens (5h window …% used)`.
   Send a prompt → the warning clears. Reset the settings afterwards.
8. `/ctx` again → your turns are listed with idle gaps. After a few days of normal use the
   `Estimated cache lifetime` line is the measured value to put back into `cacheLifetimeMinutes`.
9. Keep-warm (costs one tiny forked request per refresh): set *Cache lifetime* to `7`,
   *Safety margin* to `5`, *Refresh cap* to `2`, *Auto-handoff* off; `/keepwarm on`; send one
   prompt; stay idle. At ~2 min and ~4 min a refresh runs (nothing appears in the transcript);
   at ~6 min a toast says `keep-warm: cap of 2 refreshes reached`. `/keepwarm status` shows the
   counter. If any refresh fails or reads < 50% from cache you get `keep-warm stopped: <reason>`.
   Watch `/ctx` after the next real prompt: a high first-request cache % means the fork's read
   kept the main thread's cache entry alive.
10. Auto-handoff: *Cache lifetime* `7`, *Safety margin* `5`, *Warning token threshold* `1000`.
    Do some real work, then stay idle. At ~2 min a toast says `handoff saved: …/handoffs/<project>-<id8>.md`
    and the band shows `↪ handoff: …`. Open the file: header, then Goal / Current state /
    Next steps…, with no output-style extras or tool list. Then send a prompt and run `/ctx`:
    no extra turn row for the fork confirms forks raise no `turn.*` events (if they did, the
    handoff would be dropped as overtaken; turn *Auto-handoff* off and report it). Reset the settings.
11. Last-chance handoff, mid-turn (mocks can't prove a fork while a turn's requests are in
    flight): *Last-chance handoff: % of context left* `99`. Send a prompt that runs several tools
    (`read every README here, one by one`). After its first response the band says
    `writing last-chance handoff…`. Press **Esc** while the turn still runs: the handoff must
    still land (`last-chance handoff saved: …`), since it runs from a timer, not the turn.
    Set the threshold back to `5`, `/clear`, send a prompt → at its response the note is gone
    (re-armed). At `99` it would never re-arm: the system prompt alone is over 1 % of the window.
12. Headless check: `claude -p "Reply with OK" --plugin-dir <path>/cache-tax` runs
    normally; no commands, toasts, timers or handoffs.

## Disable / remove

- One session: just don't pass `--plugin-dir`.
- Wired globally: remove the folder from `CLAUDE_CODE_PLUGIN_DIRS`.
- Handoffs only: `/config` → cache-tax → *Auto-handoff* off (or *Last-chance* `0`).
- Remove recorded data: the store key `cache-tax.turns` (plugin store), `~/.claude/handoffs/`.

## Known limitations

- **Cache lifetime depends on the TTL your session writes.** Usage shows it:
  `cache_creation.ephemeral_1h_input_tokens` means 1 h, where the default 60 fits;
  `ephemeral_5m_input_tokens` means 5 min, where the idle handoff would fire minutes after
  every turn: lower `cacheLifetimeMinutes` and consider *Auto-handoff* off. `/ctx` measures it
  from your own idle gaps. The estimate is naive: a cold first request caused by something
  other than idle time (compaction, `/model`, an edited CLAUDE.md) pulls it down.
- **The idle handoff needs the session open and the machine awake** at its due time. A closed
  terminal or a sleeping machine runs no timer: hand off by hand before you leave. A
  keep-alive that runs outside the session (e.g. a launchd ping) is invisible to this mod, so
  the handoff still fires once at the due time.
- **Last-chance handoff limits.** The fork must fit in what's left of the window: its prompt
  plus its reply, thinking included. 5 % is ~50k tokens on a 1M window but ~10k on 200k, and
  Claude Code may stop accepting requests before the window is completely full; raise
  `lowContextPercent` (~15) on 200k models. A single request that jumps past both the threshold
  and the end of the window (a huge tool result) leaves no response to trigger on. It fires
  once: work done after it is not in the document.
- **Engine assumptions checked live, not by the tests:** forks raise no `turn.*` events (step 10)
  and a fork works while the main turn's requests are in flight (step 11).
- **Fork refreshing the main cache:** keep-warm self-checks via the fork's
  `cache_read_input_tokens` and stops when it reads < 50%; step 9 shows whether the read also
  kept the main thread's entry alive.
- Idle time in the warning is updated once a minute, so it can lag by up to a minute.
- The warning's token figure is the last response's full context (`context.tokens`), an
  upper bound of what is re-read uncached.
- A hot reload (saving the mod, any `/config` change) cancels the module's timers;
  `session.start` re-arms the idle timer from the last cache read and the ticker restarts.
- `/keepwarm` never switches models and only runs while the session is idle.
- The `Hide` button hides the band for the rest of the session unless a new cold warning or
  handoff note appears.
