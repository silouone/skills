# ai-usage-card — shared core (platform-neutral contract)

This file is the single source of truth for what the AI Usage Card measures.
The `claude/` and `codex/` folders are platform adapters (each ships a
paste-in `PROMPT.md` and an installable `SKILL.md` wrapper);
`tools/check_drift.py` (repo root) fails if an adapter was not re-stamped
after this file changed.

## Purpose

A calibrated, **local-only** self-assessment of how someone actually operates
an agentic coding tool. It inspects the runner's own setup and usage
(read-only), scores their maturity, and prints a shareable card plus a
one-line JSON capture. Nothing is sent anywhere; sharing is the runner's
choice, and the outputs contain no secrets, paths, or employer names by
construction.

## The ladder (identical on every platform)

Six rungs. An engaged team of daily users centers on **L2–L3**; L4 is
uncommon but attainable; L5 is rare frontier. Score how the person
**operates** and what they **authored** — never what is merely installed.

- **L0 Explorer** — occasional chat-style use, default setup.
- **L1 Daily Helper** — regular interactive use; little/no authored config; eyeballs output.
- **L2 Power User** — multiple modes/models/skills/MCP in active use; some verification; still mostly hand-drives.
- **L3 Agent Builder** — ALL THREE, not any one: habitual verification, genuine delegation (directed fan-out / workflows / background runs — not several chats at once), AND at least one **nameable** authored-or-deliberately-adopted mechanism (a command, agent, skill, quality gate, or non-trivial context file). Fluently operating an inherited harness satisfies the third; "the model orchestrates for me" does not. If the artifact cannot be named, it is not L3.
- **L4 Harness Engineer** — operates an AUTHORED system: hooks/quality gates, wide autonomy with guardrails, agent-driven orchestration they built, living memory, some observability.
- **L5 Force Multiplier** — frontier: multi-agent at scale, evals/quality gates, real observability, AND tooling that multiplies a whole team.

## The gates (identical on every platform)

- **Verification is the spine:** `none` **or** `ad-hoc` caps at L2; `habitual` needed for L3+; `habitual`/`enforced` for L4+. Not negotiable against an impressive-looking kit — L3's own definition requires habitual verification, so `ad-hoc` cannot reach L3 by any other route.
- **Authorship ≠ possession:** inherited/installed kit is a FLAG, not a demotion — judge on what is actually operated; deny "L4 by merely cloning a config."
- **Agent-initiated ≠ skill:** models orchestrate by default; on its own that supports L2, never L3+.
- **Manual multiplexing ≠ delegation:** N sessions/tabs open side by side, each with one top-level agent the person steers themselves, is single-thread work repeated N times. It adds nothing to the level. Delegation means work handed to machinery that runs without them in its loop: directed fan-out, worktrees, background/headless runs, scheduling.
- **Role vs evidence:** reconcile claimed role with the measured footprint; say so plainly when they disagree. A skilled non-engineering automator (ops, data, design, product) tops out at **L2** on this ladder — a statement about what this ladder measures, not a verdict on their work. L3+ requires authored engineering.
- **Never name a target rung** ("L3 aiming at L4"). The rungs are not a promotion track. Name the concrete missing artifact instead.
- **Calibrate — neither flatter nor crush.** When borderline, pick the rung whose description matches the evidence, and name the concrete signal.

### Why the gates are phrased as floors, not just ceilings

Caps alone get read as targets: told "`ad-hoc` caps you at L3," a grader settles on L3. Every rung therefore requires **positive, nameable evidence**, not merely the absence of a disqualifier. A ladder that measures harness engineering must not hand its middle rungs to signals that are runtime defaults — agent-initiated orchestration, auto-written memory, installed skills — because those measure the model's autonomy, not the person's craft.

## Shared output contract

1. A short honest read (5–8 lines, warm in tone, accurate on level).
2. A lean SHARE card — qualitative bands only, no raw scores (fenced Markdown table).
3. A compact JSON line prefixed `USAGE_CARD_JSON=` owning completeness, using
   the closed enum vocabulary defined in each PROMPT.md (shared across
   platforms so cards aggregate).
4. A LITE fallback interview when local evidence is missing — nobody errors
   out of the sample.

## Known platform variance (intentional, tracked)

- The **Claude** variant additionally maps measured signals to Boris Cherny's
  public AI-adoption steps (`cherny_step`, `next_unlock`) and measures
  cache-reuse. The **Codex** variant predates that alignment and reports
  `n/a` where the local data doesn't exist. Porting the step mapping to Codex
  is a tracked follow-up, not an accident.
- The **out-of-envelope read** ("this ladder measures harness engineering —
  lead with the adoption step, not the rung") ships in the Claude variant
  only, because it hands the reader the Cherny step as the useful alternative
  output and Codex has no step mapping yet. The gates it accompanies — the
  L2 ceiling for non-engineering footprints, and the ban on naming a target
  rung — are platform-neutral and ship in **both**. When the step mapping
  lands in Codex, the out-of-envelope read follows it.
