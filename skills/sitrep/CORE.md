# sitrep — shared core (platform-neutral contract)

This file is the single source of truth for what the `sitrep` skill does.
The `claude/` and `codex/` folders are adapters around this contract;
`tools/check_drift.py` (repo root) fails if an adapter was not re-stamped
after this file changes.

## Purpose

You come back to a session and want to know where things stand. `sitrep`
produces **one scannable status report** — built from durable artifacts on
disk first, with the live conversation used only as an overlay for what disk
cannot capture. Read-only: it never modifies files or state.

## Principles

- **Durable artifacts are the spine.** They read the same on every run and
  survive a cold restart. The conversation fills only the lines nothing on
  disk captures (**Now**, **Next**).
- **Every line names its source** — or is marked *unquantified*. Never invent
  a number.
- **No preamble, no essay.** The template is the whole output.

## Sweep order (evidence first)

1. **Working tree** — `git status` (short) + last 3 commits: what's
   uncommitted, what just landed.
2. **Objective source** — the countable basis for the goal and %. First
   relevant hit wins: a ticket/plan/spec file with checkboxes (`tickets.md`,
   `specs/**`, a plan `.md`), else the session's task/plan list.
   `% = closed / total` of its items. None found → *unquantified*, described
   qualitatively.
3. **Agent state** — background agents/subagents this session (running ·
   done-and-relayed · done-pending · blocked/dead) and any daemon workers'
   status files in the workspace. None → "none".
4. **Handoff** — if a handoff document exists (written by a companion
   handoff skill, if the user has one), use it as a source for **Next** and
   open threads. Cite it; don't restate it.
5. **Conversation overlay** — fills **Now**/**Next** only when disk doesn't.

## The report (exactly this shape)

```
📋 SITREP

🎯 Objective  <goal> — <NN% done | unquantified> (<countable basis>)
📍 Now        <the in-flight task and its state>
🤖 Subagents  <n running · n done · n blocked> — <one line each, or "none">
⏱ ETA        <remaining work in concrete units: steps/tickets left> — <confidence>
🚧 Blockers   <what's stalling progress, or "none">
➡️ Next       <the single next action>
```

## Rules

- **% rule:** the number comes from the objective source's item count. No
  countable source → `unquantified`, not a guess.
- **ETA rule:** express what's *left* in the units the objective source
  counts (tickets, steps, checkboxes) with a confidence. Wall-clock only when
  a real basis exists.
- **Focus argument:** if a focus area was passed, scope every line to that
  thread instead of the whole session.
- **Done when** all six lines are filled, and 🎯 and ⏱ each cite their basis
  or read *unquantified*.
