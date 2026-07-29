---
name: sitrep
description: "Where are we at? — a light situation report on the current work: objective, % done, in-flight task, subagents, ETA, blockers, next."
disable-model-invocation: true
argument-hint: "optional: focus area to scope the report"
---

# Sitrep

You've come back to a session and want to know where things stand. Produce a **sitrep** — one scannable status report, built from what's on disk first and the conversation second.

Durable artifacts are the spine: they read the same on every run and survive a cold restart. The live conversation is an overlay — it fills only the two lines nothing on disk captures (**Now**, **Next**). Every line names where it read from, or is marked *unquantified* — never invent a number.

Keep it to the template below. No preamble, no essay. Don't modify files or state.

## Sweep (in order)

1. **Working tree** — `git status -s` and `git log --oneline -3`: what's uncommitted, what just landed. Not a git repo → say so.
2. **Objective source** — the countable basis for the goal and %. Detect one in cwd, first hit wins: a ticket/plan/spec file with checkboxes (`tickets.md`, `specs/**`, a plan `.md`), else this session's todo list. `% = closed / total` of its items. None found → objective is *unquantified*; describe it qualitatively.
3. **Subagents** — background agents spawned this session (running / done-and-relayed / done-pending / dead) and any daemon workers' status files in the workspace. None → say "none".
4. **Handoff** — if a handoff doc exists in the OS temp dir (written by a companion handoff skill, if you use one), read it as a source for **Next** and open threads, but only when its objective or workspace matches the current work. Cite its path; don't restate it in full.

Name the evidence source on every line with a compact parenthetical — `(specs/plan.md)`, `(git)`, `(agent roster)`, `(conversation)`.

## Report

```
📋 SITREP

🎯 Objective  <goal> — <NN% done | unquantified> (<countable basis, e.g. 4/7 tickets>)
📍 Now        <the in-flight task and its state> (<source>)
🤖 Subagents  <n running · n done · n blocked> — <one line each, or "none"> (<source>)
⏱ ETA        <remaining work in concrete units: steps/tickets left> — <confidence>
🚧 Blockers   <what's stalling progress, or "none"> (<source>)
➡️ Next       <the single next action> (<source>)
```

**% rule:** the number comes from the objective source's item count. No countable source → `unquantified`, not a guess.

**ETA rule:** express what's *left* in the same units the objective source counts (tickets, steps, checkboxes) with a confidence. Give wall-clock only when a real basis exists; otherwise units, not minutes.

If a `focus area` was passed, scope every line to that thread instead of the whole session.

**Done when** all six lines are filled, and 🎯 and ⏱ each cite their basis or read *unquantified*.
