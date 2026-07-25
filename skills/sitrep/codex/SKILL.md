---
name: sitrep
description: Produce a concise, evidence-based situation report for the current work, including objective, measured progress, active task, agent status, remaining work, blockers, and next action. Use when the user explicitly asks for a sitrep, status report, where work stands, or a focused progress recap.
---
<!-- core-hash: 4bd1a4517fac -->

# Sitrep

Produce one scannable status report. Read durable artifacts first and use the live conversation only to fill details that disk does not capture. Do not modify files or state.

## Sweep evidence

Inspect sources in this order:

1. **Working tree** — Run `git status --short` and `git log --oneline -3`. If the current directory is not a Git repository, say so.
2. **Objective source** — Find the first relevant, countable source: an explicitly named ticket, plan, or spec; `tickets.md`; files under `specs/`; another plan Markdown file; or the current session plan. For Markdown checkboxes, calculate progress as completed items divided by total items. If no countable source exists, mark progress `unquantified`; never estimate a percentage.
3. **Agent state** — Use the current team or agent roster when available. Classify agents as running, done and relayed, done pending relay, or blocked. Also read any relevant daemon/worker status file found in the workspace. If neither source shows agents, report `none`.
4. **Handoff** — Look for the most recent relevant handoff document under an OS-temporary directory (written by a companion handoff skill, if you use one). Use it for open threads and the next action only when its objective or workspace matches the current work. Cite its absolute path rather than restating it.
5. **Conversation overlay** — Use the current conversation for **Now** and **Next** only when durable evidence does not already establish them.

Name the evidence source on every line with a compact parenthetical such as `(specs/plan.md)`, `(git)`, `(agent roster)`, or `(conversation)`. If a focus area was supplied, scope every line to that area.

## Report exactly this shape

```text
📋 SITREP

🎯 Objective  <goal> — <NN% done | unquantified> (<countable basis and source>)
📍 Now        <in-flight task and state> (<source>)
🤖 Subagents  <n running · n done · n blocked> — <one compact clause each, or "none"> (<source>)
⏱ ETA        <remaining work in the source's concrete units> — <confidence> (<source>)
🚧 Blockers   <what is stalling progress, or "none"> (<source>)
➡️ Next       <single next action> (<source>)
```

Use the same units for progress and ETA: tickets, steps, or checkboxes. Give wall-clock time only when a concrete basis exists; otherwise report remaining units. Include no preamble or essay.

Finish only when all six lines are present and both **Objective** and **ETA** cite a countable basis or say `unquantified`.
