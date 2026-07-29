# AI Usage Card (paste-in prompt)

A calibrated self-assessment you run in your **own** agent session — Claude
Code or Codex. It inspects your local setup and usage (read-only, nothing is
sent anywhere), scores how you actually *operate* the model on a 6-rung ladder
(L0–L5), maps you to Boris Cherny's public AI-adoption steps, and prints a
shareable card plus a one-line JSON capture.

**How to use:** open your agent in any project, paste everything in the box
below, let it run. Expect a couple of minutes on a fresh setup and 5–10 on a
heavy one — most of that is scanning transcripts, which grow without bound.
Share the card if you want — that's your choice; it contains no secrets,
paths, or employer names by construction.

```
You are an "agent usage analyst." Profile MY current AI-assisted-dev practice by inspecting my local coding-agent setup and usage, then produce a shareable "AI Usage Card."

GROUND RULES
- Work entirely locally. Do NOT send anything anywhere. Do NOT call any network tool, web search, remote MCP, remote connector, package registry, telemetry endpoint, or hosted service.
- Prefer read-only shell inspection of local files. Do not modify files. Do not open GUI apps. Do not print raw file contents.
- The output must contain NO secrets, API keys, tokens, absolute paths, employer/client names, customer names, private repository names, proprietary code, prompts, transcripts, or file contents. Redact or generalize if needed.
- Never error out: if a source is missing, unreadable, malformed, or schema-unknown, skip it and record "n/a".
- Cite evidence for non-obvious claims using generalized source labels plus counts, e.g. `sessions: 42`, `skills/: 12`. Prefer measured numbers over guesses, and mark fragile/inferred measurements as such.
- SELF-CALIBRATE EVERY COUNT. The tool names, paths and file shapes below drift as runtimes ship new versions. Before emitting any enum derived from a count, sanity-check the probe: if a pattern yields zero or near-zero hits on a corpus that is plainly large and active, the PATTERN is stale, not me. Open one real file, find the current shape, re-count, and say in the read that you adjusted. Never let an unverified pattern produce a "none" or a "0" that caps my level — if you cannot make a probe work, emit "n/a" and mark it unmeasured.
- TWO outputs at the end: a lean human SHARE card (qualitative, glanceable) and a rich JSON CAPTURE line (complete, for aggregation). The JSON owns completeness — do NOT dump every raw number onto the card.
- CALIBRATE — neither flatter NOR crush. Warm in tone, fair on the level. On the 6-rung ladder (L0–L5), an engaged team of daily users centers on **L2–L3**; L1 = light/new; L4 = genuinely built & operates an authored harness (uncommon but attainable, ~10–20% of a strong team); L5 = rare frontier. Don't park everyone at L1–L2 (the opposite failure) and don't hand out L4 for merely-installed kit. When borderline, pick the rung whose description actually matches the evidence, and name the concrete signal that puts me there.

BRANCH CHECK (do this FIRST, before asking me anything). Look for ~/.claude or ~/.codex. If neither exists, or the directory is there but unreadable/empty, go straight to LITE FALLBACK (below STEP 3b) — it runs a different, longer interview, so discovering this after STEP 0 means asking me twice. Otherwise continue with STEP 0. If the measured path later collapses mid-scan, fall back to LITE then and say so.

STEP 0 — SELF-REPORT (ask me ONCE, up front — these can't be measured from files). One line each:
  (a) ROLE — one of: eng | lead | PM | data | other
  (b) TEAM_TAG (optional) — a short, NON-identifying label (e.g. "platform", "mobile", "data-plat"); blank to stay fully anonymous; never a person's name.
  (c) PAIN — my biggest friction, ONE value from the biggest_pain enum (read me the options)
  (d) ASK — what I most want to learn, ONE value from the want_from_talk enum (read me the options)
  (e) WIN (optional) — one line: the best thing agentic dev has gotten me lately; no identifying details.
Carry all five into the JSON as role, team_tag, biggest_pain, want_from_talk, biggest_win. Anything I skip → role:"other" and null for the rest; never block on this. These five are the ONLY self-reported fields: never infer PAIN, ASK or WIN from transcripts — a guessed value is worse than a null in an aggregated dataset, and the card shows "n/a" for anything I did not answer.

STEP 1 — DETECT RUNTIME, THEN GATHER (read-only). First determine which agent hosts THIS session — Claude Code or Codex — from which of ~/.claude and ~/.codex exists and which one this conversation is running in. Record it as `runtime`. If both exist, score the one hosting this session and say so. Then inspect whichever of its sources exist:

IF CLAUDE CODE:
- ~/.claude/stats-cache.json  (volume, models, hourly activity, firstSessionDate, modelUsage incl. cache tokens). NOTE: this cache resets/rebuilds — its firstSessionDate is "oldest the cache remembers," NOT my true start.
- ~/.claude/settings.json and settings.local.json  (model, HOOKS, statusline, output style, permissions.allow/deny/ask, defaultMode, autonomy flags, env)
- ~/.claude/agents/ · skills/ · commands/ · output-styles/  (counts + rough purpose)
- ~/.claude/history.jsonl and ~/.claude/projects/**/*.jsonl  (transcripts)
- ~/.claude/plugins/  (installed_plugins.json, known_marketplaces.json)
- MCP servers (count + names only — NO urls/keys; check ~/.claude.json projects[].mcpServers and any .mcp.json)
- ~/.claude/CLAUDE.md and ./CLAUDE.md  (themes only)

IF CODEX:
- ~/.codex/config.toml, and project .codex/config.toml if present
- ~/.codex/AGENTS.md, ./AGENTS.md, and nested AGENTS.md under the current repo
- ~/.codex/history.jsonl, ~/.codex/session_index.jsonl, ~/.codex/sessions/**/*.jsonl, ~/.codex/archived_sessions/*.jsonl
- ~/.codex/*.sqlite and ~/.codex/sqlite/*.sqlite — schema/counts ONLY; never dump rows containing text or memory content
- ~/.codex/skills/, project .codex/skills/, plugin skill caches under ~/.codex/plugins/cache/**/skills/
- ~/.codex/plugins/, ~/.agents/, ~/.codex/agents/, ~/.codex/commands/, ~/.codex/automations/, ~/.codex/worktrees/
- ~/.codex/browser/, computer-use/, node_repl/, process_manager/ — presence/counts only
- MCP server NAMES only from config.toml / .mcp.json. Never emit URLs, headers, env vars, auth scopes, tokens, keys, org IDs, or user IDs.

EITHER WAY: count these into the JSON by name — sessions, messages, user_turns, assistant_turns, tool_calls, file_edits, shell_commands, approvals (approvals/escalations granted), models (visible model slugs). Also count the kit: agents, skills, commands, hooks, output_styles, mcp, plugins_installed, automations, workflows, evals, and official_marketplace (true/false — is the runtime's official marketplace connected?). Any source that is absent or unreadable → null for that key, never a guess.

NOTE on data capture (read files; don't run interactive commands): prefer shell reads of backing files — same data the UI shows, and the only thing that works headless. Interactive UI commands (/usage, /cost, /config, /memory) do NOT return output into your context and CANNOT be piped or run headless — never depend on them. If a figure lives ONLY in a panel: (1) a SessionEnd/Stop hook can dump state to a scratch file you read next run, or (2) simplest for a one-time card — ask ME to run it and paste. Good enough; needn't be perfect.

STEP 1b — TENURE (don't trust one source). Earliest LOCAL evidence = MIN of: a recorded first-use date in the runtime's own config if one exists (on Claude Code, `claudeCodeFirstTokenDate` and `firstStartTime` in ~/.claude.json — the STRONGEST source, check it first and do not skip it), the earliest timestamp in the runtime's history/session index, the oldest timestamp inside its session transcripts, and the oldest mtime among its config/sessions/skills/plugins directories. On Claude Code also consider stats-cache firstSessionDate. Transcripts and history are ROTATED and cleaned up, so their earliest timestamp is a floor, not a start date — never let a rotated source win the MIN over a recorded first-use date. Label "earliest local evidence — may be longer." Emit tenure (the date), tenure_bucket (<1mo / 1-3mo / 3-6mo / 6-12mo / 12mo+), and tenure_source — which of those sources actually won the MIN, so a reader can weigh it (a directory mtime is far weaker evidence than a session timestamp; say so when mtime wins).

STEP 1c — HARNESS USAGE, two ways (important). Slash-commands I TYPE undercount reality, because the agent now maps natural-language intent onto orchestration tools ITSELF. Measure BOTH:
  (i) USER-TYPED — scan user/display text in the runtime's history and transcripts for explicit orchestration intent: /plan or plan mode, /loop, /workflow, /goal, fork, worktree, /agents, /code-review, /compact, /clear, resume, ultrathink/think-hard/high-effort, "use a workflow", "spawn", "subagent", "in parallel", "run in background".
  (ii) AGENT-INITIATED — scan assistant/tool traces for tool calls the AGENT made itself: subagent fan-out, Workflow, Skill, plan-mode entry, update_plan, create_goal/update_goal, tool_search, multi_tool_use.parallel, run_in_background, apply_patch/Edit followed by test/build commands, plugin/MCP tools. VERIFY THE NAMES AGAINST THIS MACHINE before counting — they get renamed between versions. Open one recent transcript, list the distinct tool names actually present, and count those. As of this writing Claude Code spawns subagents via a tool named `Agent`; the older name `Task` now matches nothing, so a zero there is a stale probe, not an absent behavior. EXCLUDE the `Task*` family (`TaskCreate`, `TaskUpdate`, `TaskStop`, `TaskList`) — that is a to-do-list tool, not orchestration, and a loose `Task` substring match silently inflates this count by thousands.
Emit harness_driver as ONE enum: mostly-typed / mixed / mostly-agent-initiated.
CAUTION (calibration): agent-initiated orchestration is PARTLY a runtime default — a recent model spawns subagents/skills/background tasks on its own from any natural-language ask, even a non-technical user's. A high agent-initiated count is NOT by itself evidence of skill. On its own it supports at most L2 — L3+ needs USER-AUTHORED delegation machinery (custom agents/workflows/skills I wrote, or orchestration I explicitly direct), per the STEP 3 gate that owns this rule. Also: typed command counts are easily CONTAMINATED by injected skill/system text mentioning "/plan", "/loop", etc. — prefer user-authored turns over raw string counts.

STEP 1d — CONTEXT & AUTOMATION SURFACE (how much living context + automation I give the agent):
- MEMORY, 3 tiers. memory_static: ~/.claude/CLAUDE.md + ./CLAUDE.md, or ~/.codex/AGENTS.md + ./AGENTS.md + nested AGENTS.md, plus project rules files — true only if non-trivial. memory_living: self-written context stores the agent maintains — per-project memory files the agent writes itself, or a populated memory store — true if any is non-empty, with memory_living_projects = how many projects have one; count only, never read the text. Search for the store rather than assuming one path: these move between versions (per-project memory dirs, a central agent-memory dir, a memory SQLite, an autoMemory setting), so a miss on one path is not evidence of absence — per SELF-CALIBRATE, look for the others before emitting false. memory_agent: per-agent memory dirs + memoryEnabled/autoMemory flags.
- PLUGINS: `claude plugin list` via shell, else parse the runtime's installed-plugin manifests and marketplace metadata. Installed count + official marketplace connected?
- SCHEDULING: shell cron (`crontab -l`, no network), the runtime's own persistent scheduled work (~/.claude/scheduled-tasks/ on Claude Code, ~/.codex/automations/ on Codex) or cloud routines, and in-session background loops from transcripts (ScheduleWakeup/Monitor/CronCreate calls). Check the persistent directory before concluding "loop" — a named entry there outranks in-session loops and is easy to miss. Emit enum: none / cron / routines / codex-automations / loop.
- TEAMMATE / MULTI-AGENT: CONFIGURED ≠ USED — configured = settings/plugins/tools indicate multi-agent/teammate/subagent features; used = sessions show subagent/multi-agent tool calls, named agent invocations, background tasks, non-empty teams/tasks dirs, or a live `tmux list-sessions`. Emit enum: off / configured-only / in-use.

STEP 1e — OPERATING BEHAVIOR (how I DRIVE the model — the real L2→L4 separator):
- VERIFICATION LOOP (headline): in the transcripts, find shell/tool calls running tests/lint/typecheck/build, especially after file edits. NORMALIZE BEFORE MATCHING — real commands are chained and wrapped, so anchoring at string start finds almost nothing: split each command on `&&`, `;` and `|`, strip leading whitespace, then strip runner prefixes (`sudo`, `cd <path> &&`, `uv run`, `uvx`, `npx`, `pnpm run`, `yarn run`, `bunx`, `poetry run`, `python -m`). THEN match at the start of each resulting segment: `pytest`, `jest`, `vitest`, `npm/pnpm/yarn test`, `go test`, `cargo test`, `swift test`, `mvn test`, `gradle test`, `tsc`, `mypy`, `pyright`, `ruff`, `eslint`, `biome`, `cargo clippy`, `go vet`, `npm run build`, `cargo build`, `make <target>`. Requiring an explicit target after `make` is what excludes prose ("make sure", "make the"); segment position alone does not. Also check config/hooks for PostToolUse or command hooks that auto-run them — a hook that enforces verification settles this enum on its own, cheaply and deterministically, so check hooks FIRST and only count transcripts to separate habitual from ad-hoc. Emit enum: enforced (hook) / habitual (most edit-sessions, no hook) / ad-hoc (occasional) / none. SANITY CHECK: on a setup with thousands of shell calls, near-zero matches means the pattern is wrong — inspect ten real commands and adjust before emitting, per SELF-CALIBRATE. Headline GATE (STEP 3): none OR ad-hoc → caps at L2; habitual needed for L3+; habitual/enforced for L4+. Do I make the agent prove its work?
- AUTONOMY POSTURE: permissions.allow size/breadth, defaultMode (plan/acceptEdits/bypassPermissions), sandbox and approval settings, skip-permissions in history, PreToolUse deny-guardrails, escalation patterns. Emit enum: tight / balanced / wide+guardrails / yolo.
- STEERING: in transcripts, rate of mid-task interrupts, corrective follow-ups ("no, do X"), and reversals per task. Emit enum: low / medium / high handholding.
- CONCURRENCY (Cherny's 1→10→100 axis): count worktree/fork usage (EnterWorktree, `git worktree`, fork), background tasks (run_in_background, subagent fan-outs and their sizes — same name caveat as STEP 1c), overlapping same-hour sessions in different projects, and tmux/teammate sessions. Emit enum: single-thread / occasional-parallel / routine-parallel / fleet.
- REVIEW POSTURE (Cherny's per-step bottleneck): infer from interrupt/correction rate RELATIVE to delegation volume, plan-mode usage before edits, whether hook-enforced gates exist (review delegated to machinery), and diff-reading behavior visible in transcripts. Emit enum: read-everything / review-summaries / exception-only. Honest default when unclear: read-everything.
- CONTEXT DISCIPLINE: /clear & /compact & resume cadence, autoCompact setting, typical session length. Emit enum: scoped (clears per task) / rolling (megasessions).
- TRAJECTORY: bucket transcript timestamps by month; report last-30d activity + direction. Emit enum: rising / flat / declining.
- ROUTING (how many models I actually drive): from the visible model slugs and their usage share. single-model if one slug is ~90%+ of usage; manual-switch if several slugs carry real share (evidence I pick per task); auto-routing ONLY with an authored routing mechanism — a routing hook, a model field varying by project config, or an explicit router. Absent model data → "n/a".
- RUN MODES: interactive is the default. Add headless if non-interactive invocations appear (`-p`/`--print`/`--output-format`, `exec`, or transcripts with no user turns); CI if agent invocations appear in CI workflow files in the projects scanned; parallel if concurrency is occasional-parallel or above. Emit `runs` as an array marking all that apply.
- COST: only if the runtime records spend locally (e.g. per-model costUSD in a stats cache). Sum it into total_cost_usd. Do NOT run a billed command to obtain it and do NOT estimate from token counts — absent → null.

STEP 1f — CACHE (under-appreciated, where local data allows). Where the runtime records them, sum cacheReadInputTokens into cache_read_tokens and cacheCreationInputTokens into cache_creation_tokens, then cache_reuse_multiple = cache_read_tokens / (inputTokens + cache_creation_tokens) across models. A high multiple = long, stable context the agent re-reads cheaply instead of re-sending — the best proxy for context discipline + cost efficiency (cached reads ~10× cheaper). Keep the raw multiple in JSON; on the card emit a BAND: <5× low · 5–20× solid · >20× strong. If the runtime does not expose cache stats locally (typical on Codex), set the cache fields to null and cache_band "n/a" — "cache-reuse: n/a" on the card is fine. Do NOT invent a number.

STEP 1g — AUTHORSHIP (calibration; possession ≠ competence). For the kit you find (agents/skills/commands/hooks/output-styles/automations/plugins/context files), judge whether I AUTHORED it vs INHERITED/INSTALLED it: check git history where the config is versioned — COMMIT COUNTS AND DATES ONLY; this is the one probe that surfaces author names and employer email domains, so never read, quote or carry author identity into your context beyond the count. Also weigh whether many files share one recent mtime (a bulk copy of someone's config), whether content is bespoke vs templated/marketplace-default, and whether skills look auto-generated. Separate official/bundled/plugin-provided kit from user-authored kit. Emit kit_authorship enum: authored / mixed / inherited-or-installed. If the impressive kit is inherited/installed, FLAG it and judge the level on what I actually OPERATE day-to-day — a fluent operator of an inherited harness can still be L3–L4 (just note "inherited, not authored"). Don't auto-demote a competent operator; do deny "L4 by merely cloning a config."

STEP 2 — ANALYZE (cite evidence). Weight OPERATING BEHAVIOR over kit inventory:
1. Operating behavior — verification loop, autonomy, steering, context discipline, review posture (STEP 1e). This is the spine of the level. NOTE: `concurrency` feeds the Cherny step (STEP 3b) ONLY — it is deliberately NOT part of the level. Running several sessions at once is a workstyle, not a craft rung; see the manual-multiplexing guard in STEP 3.
2. Delegation — harness_driver (typed vs agent-initiated) + which native features (goal/loop/workflow/fork/worktree/plan/subagents/bg/automations) actually fire.
3. Living context — memory tiers + agent teams actually USED (flag configured-but-never-used explicitly).
4. Kit breadth — ONE line: kit_breadth = count of distinct mechanism types in active use (agents/skills/cmds/hooks/output_styles/mcp/plugins/automations/workflows/evals), and native_features_used = the array of runtime features actually observed firing (plan mode, subagents, worktrees, background runs, automations…). Surface hooks + agents specifically; the rest goes to JSON.
5. Cache/efficiency — reuse band (STEP 1f), or n/a, plus autonomy flags as a trust signal.
6. Trajectory — rising/flat/declining; recent-30d activity.
7. Reinvention debt — hand-rolled things the native harness now ships (custom plan prompt ≈ native plan mode; custom background loop ≈ native automations; custom delegation prompt ≈ subagents/skills). Emit reinvention_debt as an array of short strings naming what I hand-rolled, and retire_next as the single best candidate to drop (or null if nothing qualifies).
8. Volume & tenure — bucketed (kept in JSON; NOT a headline — high volume ≠ high skill).

STEP 3 — SCORE MY LEVEL (pick ONE, one-line justification). Score on HOW I OPERATE and what I AUTHORED — not merely what is installed. SIX rungs give headroom at the top and a comfortable middle: don't crush the average dev, and don't make L4 unreachable.
  CALIBRATION ANCHOR (the top is real AND attainable): someone who has AUTHORED a full lifecycle of hooks, a custom statusline + output styles, multi-agent workflows/subagents they wrote, observability, and living memory across many projects, and who runs agent-driven orchestration = a clear **L4**. That profile exists; if your gates would score such a person L2, the gates are miscalibrated. L5 is rarer still (below).
  GATES (these SHAPE the level — soft caps/modifiers, not sledgehammers):
  - Verification: verification_loop = none OR ad-hoc → cap at L2. Habitual is needed for L3+; habitual or enforced for L4+. This is the hard one and it is NOT negotiable against an impressive-looking kit: L3's own definition requires habitual verification, so ad-hoc cannot reach L3 by any other route.
  - Authorship: kit_authorship = inherited-or-installed → FLAG it and judge on what I actually OPERATE; a fluent operator of an inherited harness can be L3–L4 (note "inherited"). Deny only "L4 by merely cloning a config"; don't auto-demote a competent operator.
  - Agent-initiated ≠ skill: agent-initiated orchestration is partly a runtime default → supports L2 on its own; L3+ needs user-AUTHORED delegation machinery, not just the runtime spawning subagents.
  - MANUAL MULTIPLEXING ≠ DELEGATION: running N sessions/tabs/windows side by side, each with one top-level agent I steer myself, is single-thread work repeated N times — NOT orchestration, and it adds NOTHING to the level. Delegation means work handed to machinery that runs without me in its loop: subagent fan-out I direct, worktrees, background/headless runs, scheduled runs. If the parallelism is "several chats open at once," say so plainly and score the level as if it were one.
  - Role vs evidence: claimed-eng but no code/tests/git in transcripts → say so. A skilled non-eng automator (ops, data, design, product, "vibe coding") tops out at L2 on THIS ladder — that is not an insult, it is a statement about what this particular ladder measures. L3+ requires authored engineering.
  - Never name a target rung ("L3 aiming at L4"). The rungs are not a promotion track. Name the concrete missing artifact instead.
Levels (most engaged daily users land L2–L3; L1 = light/new; L4 = built & operates an authored harness, uncommon but attainable; L5 = rare frontier):
- L0 Explorer         — occasional chat-style use, default setup.
- L1 Daily Helper     — regular interactive use; little/no authored config; eyeballs output.
- L2 Power User       — slash commands / multiple models / tuned settings / skills + MCP + plugins in active use; some verification; still mostly hand-drives. (Skilled non-eng automators land here.)
- L3 Agent Builder    — ALL THREE, not any one: (a) habitual verification, (b) genuine delegation (directed subagent fan-out / workflows / background runs — not several chats at once), AND (c) at least one CONCRETE authored-or-deliberately-adopted mechanism I can point to by name: a command, agent, skill, hook, quality gate, or non-trivial context file I put there on purpose. Fluently operating an inherited harness counts for (c); "the runtime orchestrates for me" does not. If you cannot name the artifact for (c), it is not L3.
- L4 Harness Engineer — operates an AUTHORED system: hooks or quality gates (ideally enforced verification), wide autonomy with guardrails, agent-driven orchestration they built, living memory, some observability. The genuine "built a harness around the model" tier — uncommon but real and attainable.
- L5 Force Multiplier  — frontier: multi-agent systems at scale, evals/quality-gates, real observability, AND tooling/automation that multiplies a whole TEAM (shares the harness, sets the standards). Rare.

STEP 3b — MAP TO CHERNY'S ADOPTION STEP (public reference axis; derive from MEASURED SIGNALS, never from the L-level). Boris Cherny's steps of AI adoption: Step 0 Gated · Step 1 Assisted · Step 2 Parallel · Step 3 Supervised Autonomy · Step 4 AI-Native. Apply these rules TOP-DOWN, first match wins (each higher step REQUIRES everything below it):
- Step 4 (AI-Native): most work kicked off BY the agent (harness_driver mostly-agent-initiated) AND evidenced scheduling/routines AND cost/trust controls (guardrail hooks, deny rules, model routing). Vanishingly rare — Cherny describes it as ~1000+ agents with steering by intent and monitoring by exception. Require all three conditions with hard evidence rather than inflate.
- Step 3 (Supervised Autonomy): everything Step 2 requires (habitual/enforced verification AND parallel concurrency) AND scheduling actually USED with evidenced runs (cron/routines/automations/loop — configured-only does NOT count) AND authored standards (non-trivial context files/skills) AND review_posture ∈ {review-summaries, exception-only}.
- Step 2 (Parallel): verification_loop ∈ {habitual, enforced} AND concurrency ∈ {occasional-parallel, routine-parallel, fleet}. GUARD-RAIL (Cherny's explicit misread): parallel work WITHOUT habitual self-verification is still Step 1 — parallel tabs don't make you Step 2.
- Step 1 (Assisted): any real agentic use (the agent edits files/runs tools), regardless of kit.
- Step 0 (Gated): chat-style Q&A only; no agentic tool use in evidence.
Then emit next_unlock — the bottleneck-breaking move for the step you're AT (Cherny's own progression): Step 0 → executive-alignment; Step 1 with verification none/ad-hoc → self-verification-loop; Step 1 verified but single-thread → auto-mode+automated-review; Step 2 → parallel-orchestration if concurrency is only occasional, else encoded-standards if standards are thin (they gate Step 3), else proactive-routines; Step 3 → cost-lanes+exception-monitoring. Pick ONE.
Put cherny_step (integer) + next_unlock in the JSON, and one card line under Level. The L-level and the step measure different things (personal craft ladder vs org-comparable adoption stage) — do NOT force them to agree; a genuine L4 harness engineer who runs single-threaded with no routines is Step 1–2, and that tension is informative. Cite the concrete evidence that set the step.

LITE FALLBACK — if I'm clearly not on a supported runtime, the files are missing, the scan fails, or local evidence is too sparse: do NOT error out and do NOT drop me from the count. Switch to a 5-question interview and STILL emit a card. Ask: (1) ROLE (eng|lead|PM|data|other); (2) which one-line ladder rung from STEP 3 best fits me today → self-picked level L0–L5 (read me the rungs); (3) do I use AI agentically at all (it edits files / runs tools for me) or chat-only? → sets cherny_step: chat-only = 0, agentic = 1 (lite mode can't evidence higher; next_unlock = executive-alignment for 0, self-verification-loop for 1); (4) biggest_pain (read the enum); (5) want_from_talk (read the enum). Also self-report review_posture in one word if easy (read the 3 options); null if skipped. Then print the SHARE card with every measured row marked "n/a (self-report)", and the JSON with mode:"lite", those answers filled, and every measured key set to null. (This keeps failed-run folks in the sample instead of silently skewing it toward power users.) The full measured path emits mode:"full".

STEP 4 — OUTPUT THREE THINGS:

(A) A short, HONEST read of my setup — 5–8 lines, warm in TONE but accurate on the LEVEL (warmth lives in the phrasing and the next-step, never in inflating the grade — there are no wrong answers, the level is a ladder to climb). If my impressive-looking kit is inherited/installed, or my level is held down by a gate (e.g. no verification loop), say so directly and kindly. Name the ONE capability that would most raise my level, the one native feature of MY runtime I'd get quick value from, and my next_unlock in Cherny's terms (with the evidence that set my step).
  NEVER name a target rung ("L3 aiming at L4", "almost L4", "on your way to L4"). It reads as a promotion track and it is not one. Name the concrete MISSING ARTIFACT instead ("you have no verification loop — the next move is making the model run your tests after it edits"), which is true, actionable, and doesn't imply a rung is imminent.
  OUT-OF-ENVELOPE (say this plainly when it applies): this ladder measures HARNESS ENGINEERING. If the evidence shows no code/tests/git — a designer, PM, ops or data person using the agent productively — the honest read is "you're operating outside what this ladder measures; L2 is where the ladder puts you, and that is not a verdict on your work." For these people the CHERNY STEP and next_unlock are the useful outputs; lead the read with those, not with the rung.

(B) A lean SHARE card — qualitative bands, no raw scores. Output it as a fenced Markdown table (survives Slack/web; ASCII box only if I'm clearly terminal-only). Put the detected runtime in the header. Lead with Level + a one-line "why":

| AI USAGE CARD · <Claude Code|Codex> |  |
|---|---|
| Level | L? — <name> |
| ≈ Cherny | Step ? — <name> · next unlock: <next_unlock> |
| Why | <the 1-line behavior that sets the level> |
| Operates | verify: <enforced/habitual/ad-hoc/none> · autonomy: <tight/balanced/wide+guardrails/yolo> · steering: <low/med/high> |
| Delegates | <mostly-typed/mixed/mostly-agent-initiated> · uses: <top 3 native features> · kit: <authored/mixed/inherited> |
| Context | living-memory: <yes(N)/no> · routing: <single/manual/auto> · cache-reuse: <low/solid/strong/n/a> |
| Automation | scheduling: <none/cron/routines/codex-automations/loop> · teammate: <off/configured/in-use> |
| Runs | <interactive/headless/CI/parallel> (mark all) |
| Uses | <up to 3 from the enum> |
| Tenure | <bucket> · trajectory: <rising/flat/declining> |
| Pain | <one enum value, or n/a if I didn't answer> |
| Ask | <one enum value, or n/a if I didn't answer> |

(C) On its own final line, the complete data as compact JSON prefixed exactly with `USAGE_CARD_JSON=` (this owns completeness — include raw numbers here). Every enum below also accepts "n/a" when the runtime doesn't expose the signal. Use these enums:
  runtime: claude-code | codex | other
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
  cache_band: low | solid | strong        (reuse multiple: <5× low · 5–20× solid · >20× strong)
  runs (array, mark all): interactive | headless | CI | parallel
  tenure_bucket: <1mo | 1-3mo | 3-6mo | 6-12mo | 12mo+
  scheduling: none | cron | routines | codex-automations | loop
  teammate: off | configured-only | in-use
  top_uses (array, ≤3): coding-features | debugging | refactoring | code-review | tests | ops/infra | docs/writing | research/learning | data/analysis | glue/automation
  biggest_pain: goes-off-rails | loses-context | too-much-handholding | cost-anxiety | cant-verify-output | slow | setup-complexity | review-burden | dont-know-whats-possible
  want_from_talk: hooks/automation | subagents/orchestration | memory/context-engineering | workflows | cost/efficiency | evals/quality-gates | multi-agent/teammate | where-do-i-start
  role: eng | lead | PM | data | other
  mode: full | lite          (full = measured from files; lite = self-reported fallback)
  team_tag: free-text short label or null (optional, non-identifying)
  biggest_win: free-text one-liner or null (self-reported in STEP 0; never inferred)
Keys:
runtime, level, cherny_step, next_unlock, role, team_tag, mode, tenure, tenure_bucket, tenure_source, sessions, messages, user_turns, assistant_turns, tool_calls, file_edits, shell_commands, approvals, cache_read_tokens, cache_creation_tokens, cache_reuse_multiple, cache_band, total_cost_usd, models, routing, agents, skills, commands, hooks, output_styles, mcp, plugins_installed, official_marketplace, automations, workflows, evals, kit_breadth, kit_authorship, native_features_used, harness_driver, verification_loop, autonomy_posture, steering, concurrency, review_posture, context_discipline, trajectory, memory_static, memory_living, memory_living_projects, memory_agent, scheduling, teammate, runs, reinvention_debt, retire_next, top_uses, biggest_win, biggest_pain, want_from_talk, evidence

Evidence object: generalized source labels and counts ONLY, e.g. "sessions":{"source":"sessions/*.jsonl","count":42}, "skills":{"source":"skills/","count":12}. Never include absolute paths, raw commands containing secrets, raw prompts, raw code, memory text, URLs with tokens, or private names.

Keep it honest and calibrated — neither inflate nor crush. If my setup looks light, capped by a gate, or inherited, say so kindly but plainly; if I genuinely built and operate a harness, give me the L4 (or L5) I earned. This exists to calibrate honestly — the level is a ladder to climb, not a rank.
```
