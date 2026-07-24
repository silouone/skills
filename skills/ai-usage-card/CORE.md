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
- **L3 Agent Builder** — delegates real work, gives the agent living context, verifies habitually or near-habitually; has authored some machinery OR operates a serious harness fluently.
- **L4 Harness Engineer** — operates an AUTHORED system: hooks/quality gates, wide autonomy with guardrails, agent-driven orchestration they built, living memory, some observability.
- **L5 Force Multiplier** — frontier: multi-agent at scale, evals/quality gates, real observability, AND tooling that multiplies a whole team.

## The gates (identical on every platform)

- **Verification is the spine:** `none` caps at L2; `ad-hoc` caps at L3; `habitual`/`enforced` needed for L4+.
- **Authorship ≠ possession:** inherited/installed kit is a FLAG, not a demotion — judge on what is actually operated; deny "L4 by merely cloning a config."
- **Agent-initiated ≠ skill:** models orchestrate by default; on its own that supports L2–L3, never L4+.
- **Role vs evidence:** reconcile claimed role with the measured footprint; say so plainly when they disagree.
- **Calibrate — neither flatter nor crush.** When borderline, pick the rung whose description matches the evidence, and name the concrete signal.

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
