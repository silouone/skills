<!-- core-hash: cdaec4bd6230 -->
# AI Usage Card — Claude Code (paste-in prompt)

A calibrated self-assessment you run in your **own** Claude Code session. It
inspects your local setup and usage (read-only, nothing is sent anywhere),
scores how you actually *operate* the model on a 6-rung ladder (L0–L5), maps
you to Boris Cherny's public AI-adoption steps, and prints a shareable card
plus a one-line JSON capture.

**How to use:** open Claude Code in any project, paste everything in the box
below, let it run (~1–2 minutes). Share the card if you want — that's your
choice; it contains no secrets, paths, or employer names by construction.

```
You are a "Claude Code usage analyst." Profile MY current AI-assisted-dev practice by inspecting my local Claude Code setup and usage, then produce a shareable "AI Usage Card."

GROUND RULES
- Work entirely locally. Do NOT send anything anywhere. Do NOT call any network tool.
- The output must contain NO secrets, API keys, tokens, absolute paths, employer/client names, or proprietary code. Redact or generalize if needed.
- Never error out: if a source is missing, skip it silently and note "n/a".
- Cite the evidence (file + count) for any non-obvious claim. Prefer measured numbers over guesses.
- TWO outputs at the end: a lean human SHARE card (qualitative, glanceable) and a rich JSON CAPTURE line (complete, for aggregation). The JSON owns completeness — do NOT dump every raw number onto the card.
- CALIBRATE — neither flatter NOR crush. Warm in tone, fair on the level. On the 6-rung ladder (L0–L5), an engaged team of daily Claude Code users centers on **L2–L3**; L1 = light/new; L4 = genuinely built & operates an authored harness (uncommon but attainable, ~10–20% of a strong team); L5 = rare frontier. Don't park everyone at L1–L2 (the opposite failure) and don't hand out L4 for merely-installed kit. When borderline, pick the rung whose description actually matches the evidence, and name the concrete signal that puts me there.

STEP 0 — SELF-REPORT (ask me ONCE, up front — these can't be measured from files). One line each:
  (a) ROLE — one of: eng | lead | PM | data | other
  (b) TEAM_TAG (optional) — a short, NON-identifying label (e.g. "full stack","platform", "mobile", "data-plat"); blank to stay fully anonymous; never a person's name.
Carry both into the JSON. If I skip it, set role:"other", team_tag:null and continue — never block on this.

STEP 1 — GATHER (read-only). Inspect whichever exist:
- ~/.claude/stats-cache.json  (volume, models, hourly activity, firstSessionDate, modelUsage incl. cache tokens). NOTE: this cache resets/rebuilds — its firstSessionDate is "oldest the cache remembers," NOT my true start.
- ~/.claude/settings.json and settings.local.json  (model, HOOKS, statusline, output style, permissions.allow/deny/ask, defaultMode, autonomy flags, env)
- ~/.claude/agents/ · skills/ · commands/ · output-styles/  (counts + rough purpose)
- MCP servers (count + names only — NO urls/keys; check ~/.claude.json projects[].mcpServers and any .mcp.json)
- ~/.claude/CLAUDE.md and ./CLAUDE.md  (themes only)

STEP 1b — TENURE (don't trust one source). Earliest LOCAL evidence = MIN of: (a) stats-cache firstSessionDate, (b) earliest timestamp in ~/.claude/history.jsonl, (c) oldest mtime in ~/.claude/sessions|config|data. Label "earliest local evidence — may be longer." Also emit a tenure_bucket: <1mo / 1-3mo / 3-6mo / 6-12mo / 12mo+.

STEP 1c — HARNESS USAGE, two ways (important). Slash-commands I TYPE undercount reality, because the agent now maps natural-language intent onto orchestration tools ITSELF (more under high effort / ultracode / workflow mode). Measure BOTH:
  (i) USER-TYPED — scan ~/.claude/history.jsonl "display" for: /loop, /workflow, /goal, fork, worktree, /plan, /agents, /code-review, /compact, /clear, ultrathink/think-hard, "use a workflow", "spawn", "in parallel".
  (ii) AGENT-INITIATED — scan ~/.claude/projects/**/*.jsonl assistant turns for tool calls the AGENT made itself: Task/subagent, Workflow, Skill, SlashCommand, EnterPlanMode, fork, run_in_background (grep '"name":"Task"' etc).
Emit harness_driver as ONE enum: mostly-typed / mixed / mostly-agent-initiated.
CAUTION (calibration): agent-initiated orchestration is PARTLY a model default — recent Claude spawns subagents/skills/background tasks on its own from any natural-language ask, even a non-technical user's. A high agent-initiated count is NOT by itself evidence of skill. On its own it supports L2–L3, but it does NOT by itself justify L4+ — that needs USER-AUTHORED delegation machinery (custom agents/workflows/skills I wrote, or orchestration I explicitly direct). Also: typed slash-command counts from history.jsonl are easily CONTAMINATED by injected skill/system text mentioning "/plan", "/loop", etc. — do not treat raw typed counts as clean user intent.

STEP 1d — CONTEXT & AUTOMATION SURFACE (how much living context + automation I give Claude). Use EXACT paths (much lives under ~/.claude/projects/<project>/, not ~/.claude/ directly):
- MEMORY, 3 tiers: static (~/.claude/CLAUDE.md, ./CLAUDE.md, ./.claude/rules/*.md — non-trivial?); LIVING/auto (~/.claude/projects/<project>/memory/MEMORY.md non-empty = I let Claude keep self-written context; count projects); custom-agent (~/.claude/projects/<project>/agents/<name>/memory/ + memoryEnabled:true in ~/.claude/agents/*.md).
- OFFICIAL PLUGINS: `claude plugin list` via Bash, else parse ~/.claude/plugins/installed_plugins.json (.plugins) + known_marketplaces.json. Installed count + official marketplace connected?
- SCHEDULING: shell cron (`crontab -l | grep -i claude`) / cloud routines (/schedule, no local file) / in-session /loop (loop.md or /loop in history). Emit enum: none / cron / cloud-routines / loop.
- TEAMMATE/TMUX: settings teammateMode + CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS. CONFIGURED ≠ USED — used = non-empty ~/.claude/teams/ OR named (non-UUID) dirs in ~/.claude/tasks/ OR live `tmux list-sessions`. Emit enum: off / configured-only / in-use.

STEP 1e — OPERATING BEHAVIOR (how I DRIVE the model — the real L2→L4 separator; all measurable from transcripts + settings):
- VERIFICATION LOOP (headline): in ~/.claude/projects/**/*.jsonl, find Bash tool calls running tests/lint/typecheck/build AT COMMAND POSITION — match the actual command string (e.g. `^(pytest|jest|vitest|go test|cargo test|npm test|tsc|ruff|eslint|make \S)`), NOT prose mentions (the bare word "make" in narration is a false positive — require an explicit target/flag) — after Edit/Write, AND PostToolUse hooks in settings that auto-run them. Emit enum: enforced (hook) / habitual (most edit-sessions, no hook) / ad-hoc (occasional) / none. Headline GATE (STEP 3): none → caps at L2, ad-hoc → caps at L3; habitual/enforced needed for L4+. Do I make Claude prove its work?
- AUTONOMY POSTURE: settings permissions.allow size/breadth, defaultMode (plan/acceptEdits/bypassPermissions), skip-permissions in history, PreToolUse deny-guardrails. Emit enum: tight / balanced / wide+guardrails / yolo.
- STEERING: in transcripts, rate of mid-task interrupts + corrective follow-ups ("no, do X") per task. Emit enum: low / medium / high handholding.
- CONCURRENCY (how much runs in parallel — Cherny's 1→10→100 axis): from transcripts + settings, count worktree/fork usage (EnterWorktree, `git worktree`, fork), background tasks (run_in_background, Task tool fan-outs and their sizes), overlapping same-hour sessions in different projects, and tmux/teammate sessions. Emit enum: single-thread (one session, one thread of work) / occasional-parallel (sometimes 2–3 streams or bg tasks) / routine-parallel (worktrees/subagent fan-out is a normal day) / fleet (many agents routinely, scheduled or self-kicked).
- REVIEW POSTURE (what I actually review — Cherny's per-step bottleneck): infer from interrupt/correction rate RELATIVE to delegation volume, plan-mode usage before edits, whether hook-enforced gates exist (review delegated to machinery), and diff-reading behavior visible in transcripts. Emit enum: read-everything (I review ~every change before it lands) / review-summaries (I review outcomes/streams, spot-check diffs, trust verified output) / exception-only (machinery verifies; I look only when something flags). Honest default when unclear: read-everything.
- CONTEXT DISCIPLINE: /clear & /compact cadence, autoCompact setting, typical session length (msgs before a clear). Emit enum: scoped (clears per task) / rolling (megasessions).
- TRAJECTORY: bucket transcript timestamps by month; report last-30d activity + direction. Emit enum: rising / flat / declining.

STEP 1f — CACHE (under-appreciated). From stats-cache modelUsage, sum cacheReadInputTokens vs (inputTokens + cacheCreationInputTokens) across models → cache-reuse multiple. High (20×+) = long, stable context Claude re-reads cheaply instead of re-sending — best proxy for context discipline + cost efficiency (cached reads ~10× cheaper). Keep the raw multiple in JSON; on the card emit a BAND: low / solid / strong. Explain in one plain line — few realize this is where the real cost/skill story lives.

STEP 1g — AUTHORSHIP (calibration; possession ≠ competence). For the kit you find (agents/skills/commands/hooks/output-styles/CLAUDE.md), judge whether I AUTHORED it vs INHERITED/INSTALLED it: check git authorship/history, whether many files share one recent mtime (a bulk copy of someone's ~/.claude), whether content is bespoke vs templated/marketplace-default, and whether skills look auto-generated. Emit kit_authorship enum: authored / mixed / inherited-or-installed. If the impressive kit is inherited/installed, FLAG it and judge the level on what I actually OPERATE day-to-day — a fluent operator of an inherited harness can still be L3–L4 (just note "inherited, not authored"). Don't auto-demote a competent operator; do deny "L4 by merely cloning a config."

LITE FALLBACK — if I'm clearly NOT on Claude Code, the files are missing, or the scan fails: do NOT error out and do NOT drop me from the count. Switch to a 5-question interview and STILL emit a card. Ask: (1) ROLE (eng|lead|PM|data|other); (2) which one-line ladder rung from STEP 3 best fits me today → self-picked level L0–L5 (read me the rungs); (3) do I use AI agentically at all (it edits files / runs tools for me) or chat-only? → sets cherny_step: chat-only = 0, agentic = 1 (lite mode can't evidence higher; next_unlock = executive-alignment for 0, self-verification-loop for 1); (4) biggest_pain (read the enum); (5) want_from_talk (read the enum). Also self-report review_posture in one word if easy (read the 3 options); null if skipped. Then print the SHARE card with every measured row marked "n/a (self-report)", and the JSON with `mode:"lite"`, those answers filled, and every measured key set to null. (This keeps non-Claude-Code and failed-run folks in the sample instead of silently skewing it toward power users.) The full measured path below emits `mode:"full"`.
NOTE on data capture (read files; don't run interactive commands): prefer Bash reads of backing files — same data the UI shows, and the only thing that works headless. usage/cache→stats-cache.json; per-run cost→`claude -p --output-format json` (.total_cost_usd); plugins→`claude plugin list` or installed_plugins.json. Interactive UI commands (/usage, /cost, /config, /memory) do NOT return output into your context and CANNOT be piped or run under `claude -p` — never depend on them. If a figure lives ONLY in a panel: (1) a SessionEnd/Stop hook can dump state to a scratch file you read next run, or (2) simplest for a one-time card — ask ME to run it and paste. Good enough; needn't be perfect.

STEP 2 — ANALYZE (cite evidence). Weight OPERATING BEHAVIOR over kit inventory:
1. Operating behavior — verification loop, autonomy, steering, context discipline, concurrency, review posture (STEP 1e). This is the spine of the level (and of the Cherny step in STEP 3b).
2. Delegation — harness_driver (typed vs agent-initiated) + which native features (goal/loop/workflow/fork/worktree/plan/subagents/bg) actually fire.
3. Living context — memory tiers + agent teams actually USED (flag configured-but-never-used explicitly).
4. Kit breadth — ONE line: count of distinct mechanism types in active use (agents/skills/cmds/hooks/styles/mcp/workflows/evals). Surface hooks + agents specifically; the rest goes to JSON.
5. Cache/efficiency — reuse band (STEP 1f) + autonomy flags as trust signal.
6. Trajectory — rising/flat/declining; recent-30d activity.
7. Reinvention debt — hand-rolled things the native harness now ships (custom plan/team cmd ≈ native plan+subagents; custom obs ≈ native tasks). Candidates to retire.
8. Volume & tenure — bucketed (kept in JSON; NOT a headline — high volume ≠ high skill).

STEP 3 — SCORE MY LEVEL (pick ONE, one-line justification). Score on HOW I OPERATE and what I AUTHORED — not merely what is installed in ~/.claude. SIX rungs give headroom at the top and a comfortable middle: don't crush the average dev, and don't make L4 unreachable.
  CALIBRATION ANCHOR (the top is real AND attainable): someone who has AUTHORED a full lifecycle of hooks, a custom statusline + output styles, multi-agent workflows/subagents they wrote, observability, and living memory across many projects, and who runs agent-driven orchestration = a clear **L4**. That profile exists; if your gates would score such a person L2, the gates are miscalibrated. L5 is rarer still (below).
  GATES (these SHAPE the level — soft caps/modifiers, not sledgehammers):
  - Verification: verification_loop = none → cap at L2; ad-hoc → cap at L3. Habitual or enforced is needed for L4+. (Verification is the spine, but ad-hoc must not drop a real builder below L3.)
  - Authorship: kit_authorship = inherited-or-installed → FLAG it and judge on what I actually OPERATE; a fluent operator of an inherited harness can be L3–L4 (note "inherited"). Deny only "L4 by merely cloning a config"; don't auto-demote a competent operator.
  - Agent-initiated ≠ skill: agent-initiated orchestration is partly a model default → supports L2–L3 on its own; L4+ needs user-AUTHORED delegation machinery, not just Claude spawning subagents.
  - Role vs evidence: claimed-eng but no code/tests/git in transcripts → say so; a skilled non-eng automator is genuinely L2–L3 (not L1), but doesn't reach L4 without authored engineering.
Levels (most engaged daily users land L2–L3; L1 = light/new; L4 = built & operates an authored harness, uncommon but attainable; L5 = rare frontier):
- L0 Explorer         — occasional chat-style use, default setup.
- L1 Daily Helper     — regular interactive use; little/no authored config; eyeballs output.
- L2 Power User       — slash commands / multiple models / tuned settings / skills + MCP in active use; some verification; still mostly hand-drives. (Skilled non-eng automators land here.)
- L3 Agent Builder    — delegates real work (subagents/workflows), gives Claude living context, habitual verification; has AUTHORED some of their own machinery OR operates a serious harness fluently.
- L4 Harness Engineer — operates an AUTHORED system: hooks (ideally enforced verification), wide autonomy with guardrails, agent-driven orchestration they built, living memory, some observability. The genuine "built a harness around the model" tier — uncommon but real and attainable.
- L5 Force Multiplier  — frontier: multi-agent systems at scale, evals/quality-gates, real observability, AND tooling/automation that multiplies a whole TEAM (shares the harness, sets the standards). Rare.

STEP 3b — MAP TO CHERNY'S ADOPTION STEP (public reference axis; derive from MEASURED SIGNALS, never from the L-level). Boris Cherny's steps of AI adoption: Step 0 Gated · Step 1 Assisted · Step 2 Parallel · Step 3 Supervised Autonomy · Step 4 AI-Native. Apply these rules TOP-DOWN, first match wins (each higher step REQUIRES everything below it):
- Step 4 (AI-Native): most work kicked off BY Claude (harness_driver mostly-agent-initiated) AND evidenced scheduling/routines AND cost/trust controls (guardrail hooks, deny rules, model routing). Individuals essentially never hit this — it's an org posture. Say so rather than inflate.
- Step 3 (Supervised Autonomy): everything Step 2 requires (habitual/enforced verification AND parallel concurrency) AND scheduling actually USED with evidenced runs (cron/routines/loop — configured-only does NOT count) AND authored standards (non-trivial CLAUDE.md/skills) AND review_posture ∈ {review-summaries, exception-only}.
- Step 2 (Parallel): verification_loop ∈ {habitual, enforced} AND concurrency ∈ {occasional-parallel, routine-parallel, fleet}. GUARD-RAIL (Cherny's explicit misread): parallel work WITHOUT habitual self-verification is still Step 1 — parallel tabs don't make you Step 2.
- Step 1 (Assisted): any real agentic use (Claude edits files/runs tools), regardless of kit.
- Step 0 (Gated): chat-style Q&A only; no agentic tool use in evidence.
Then emit next_unlock — the bottleneck-breaking move for the step you're AT (Cherny's own progression): Step 0 → executive-alignment; Step 1 with verification none/ad-hoc → self-verification-loop; Step 1 verified but single-thread → auto-mode+automated-review; Step 2 → parallel-orchestration if concurrency is only occasional, else encoded-standards if standards are thin (they gate Step 3), else proactive-routines; Step 3 → cost-lanes+exception-monitoring. Pick ONE.
Put cherny_step (integer) + next_unlock in the JSON, and one card line under Level. The L-level and the step measure different things (personal craft ladder vs org-comparable adoption stage) — do NOT force them to agree; a genuine L4 harness engineer who runs single-threaded with no routines is Step 1–2, and that tension is informative. Cite the concrete evidence that set the step.

STEP 4 — OUTPUT THREE THINGS:

(A) A short, HONEST read of my setup — 5–8 lines, warm in TONE but accurate on the LEVEL (warmth lives in the phrasing and the next-step, never in inflating the grade — there are no wrong answers, the level is a ladder to climb). If my impressive-looking kit is inherited/installed, or my level is held down by a gate (e.g. no verification loop), say so directly and kindly. Name the ONE capability that would most raise my level, the one native feature I'd get quick value from, and my next_unlock in Cherny's terms (with the evidence that set my step).

(B) A lean SHARE card — qualitative bands, no raw scores. Output it as a fenced Markdown table (survives Slack/web; ASCII box only if I'm clearly terminal-only). Lead with Level + a one-line "why":

| AI USAGE CARD · Claude Code |  |
|---|---|
| Level | L? — <name> |
| ≈ Cherny | Step ? — <name> · next unlock: <next_unlock> |
| Why | <the 1-line behavior that sets the level> |
| Operates | verify: <enforced/habitual/ad-hoc/none> · autonomy: <tight/balanced/wide+guardrails/yolo> · steering: <low/med/high> |
| Delegates | <mostly-typed/mixed/mostly-agent-initiated> · uses: <top 3 native features> · kit: <authored/mixed/inherited> |
| Context | living-memory: <yes(N)/no> · routing: <single/manual/auto> · cache-reuse: <low/solid/strong> |
| Automation | scheduling: <none/cron/routines/loop> · teammate: <off/configured/in-use> |
| Runs | <interactive/headless/CI/parallel> (mark all) |
| Uses | <up to 3 from the enum> |
| Tenure | <bucket> · trajectory: <rising/flat/declining> |
| Pain | <one enum value> |
| Ask | <one enum value> |

(C) On its own final line, the complete data as compact JSON prefixed exactly with `USAGE_CARD_JSON=` (this owns completeness — include raw numbers here). Use these enums:
  routing: single-model | manual-switch | auto-routing
  harness_driver: mostly-typed | mixed | mostly-agent-initiated
  kit_authorship: authored | mixed | inherited-or-installed
  verification_loop: enforced | habitual | ad-hoc | none
  autonomy_posture: tight | balanced | wide+guardrails | yolo
  steering: low | medium | high
  concurrency: single-thread | occasional-parallel | routine-parallel | fleet
  review_posture: read-everything | review-summaries | exception-only
  cherny_step: 0 | 1 | 2 | 3 | 4        (integer, from STEP 3b rules)
  next_unlock: executive-alignment | self-verification-loop | auto-mode+automated-review | parallel-orchestration | proactive-routines | encoded-standards | cost-lanes+exception-monitoring
  context_discipline: scoped | rolling
  trajectory: rising | flat | declining
  cache_band: low | solid | strong
  tenure_bucket: <1mo | 1-3mo | 3-6mo | 6-12mo | 12mo+
  top_uses (array, ≤3): coding-features | debugging | refactoring | code-review | tests | ops/infra | docs/writing | research/learning | data/analysis | glue/automation
  biggest_pain: goes-off-rails | loses-context | too-much-handholding | cost-anxiety | cant-verify-output | slow | setup-complexity | review-burden | dont-know-whats-possible
  want_from_talk: hooks/automation | subagents/orchestration | memory/context-engineering | workflows | cost/efficiency | evals/quality-gates | multi-agent/teammate | where-do-i-start
  role: eng | lead | PM | data | other
  mode: full | lite          (full = measured from files; lite = self-reported fallback)
  team_tag: free-text short label or null (optional, non-identifying)
Keys:
level, cherny_step, next_unlock, role, team_tag, mode, tenure, tenure_bucket, tenure_source, sessions, messages, tool_calls, cache_read_tokens, cache_creation_tokens, cache_reuse_multiple, cache_band, models, routing, agents, skills, commands, hooks, output_styles, mcp, workflows, evals, kit_breadth, kit_authorship, native_features_used, harness_driver, verification_loop, autonomy_posture, steering, concurrency, review_posture, context_discipline, trajectory, memory_claude_md, memory_living, memory_living_projects, memory_agent, plugins_installed, official_marketplace, scheduling, teammate, runs, reinvention_debt, retire_next, top_uses, biggest_win, biggest_pain, want_from_talk

Keep it honest and calibrated — neither inflate nor crush. If my setup looks light, capped by a gate, or inherited, say so kindly but plainly; if I genuinely built and operate a harness, give me the L4 (or L5) I earned. This exists to calibrate honestly — the level is a ladder to climb, not a rank.
```
