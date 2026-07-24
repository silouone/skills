---
name: ai-usage-card
description: Run the AI Usage Card — a calibrated, local-only self-assessment of how the user actually operates Codex. Inspects their ~/.codex setup and usage read-only, scores an L0–L5 level, and prints a shareable card + JSON line. Use when the user asks for their usage card, AI usage level, harness assessment, or to "run the usage card". Nothing is sent anywhere.
---
<!-- core-hash: cdaec4bd6230 -->

# AI Usage Card (Codex)

Read `PROMPT.md` in this skill's folder and execute its instructions exactly,
against THIS machine's local Codex setup and usage.

Non-negotiables (they are also stated in the prompt):

- Work entirely locally; never call a network tool.
- Outputs must contain no secrets, API keys, absolute paths, employer/client
  names, or proprietary code.
- Ask the STEP 0 self-report questions once, up front; never block on them.
- Finish with the three outputs: honest read, SHARE card (fenced Markdown
  table), and the `USAGE_CARD_JSON=` line.
- Calibrate — neither flatter nor crush.
