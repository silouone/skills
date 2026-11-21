import type { ModelUsage, PluginOptions, SessionUsage } from 'claude-code'

export type TurnRecord = {
  at: number
  idleGapMs: number | null
  inputTokens: number
  cacheRead: number
  cacheCreation: number
  outputTokens: number
  durationMs: number
  tools: number
  model: string
  /** Cache share of the turn's first request: the one an idle gap affects. */
  firstCacheShare: number
}

export type Config = {
  lifetimeMs: number
  marginMs: number
  warnTokens: number
  maxRefreshes: number
  keepWarmDefault: boolean
  autoHandoff: boolean
  lowContextPercent: number
}

export const STORE_KEY = 'cache-tax.turns'
export const MAX_RECORDS = 200
const MINUTE = 60_000

export const configOf = (options: PluginOptions): Config => ({
  lifetimeMs: Number(options.cacheLifetimeMinutes ?? 60) * MINUTE,
  marginMs: Number(options.safetyMarginMinutes ?? 5) * MINUTE,
  warnTokens: Number(options.warnTokenThreshold ?? 20000),
  maxRefreshes: Number(options.keepWarmMaxRefreshes ?? 6),
  keepWarmDefault: options.keepWarmDefault === true,
  autoHandoff: options.autoHandoff !== false,
  lowContextPercent: Number(options.lowContextPercent ?? 5),
})

/** cache_read / (input + cache_read + cache_creation); 0 when nothing was read. */
export const cacheShare = (u: Pick<ModelUsage, 'input_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens'>): number => {
  const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

  return total === 0 ? 0 : u.cache_read_input_tokens / total
}

export const pct = (share: number): string => `${Math.round(share * 100)}%`

export const kTokens = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

export const duration = (ms: number): string => {
  const s = Math.round(ms / 1000)

  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export const rateOf = (usage: SessionUsage, kind: string): number | null =>
  usage.rateLimits.find(r => r.kind === kind)?.percentUsed ?? null

/** Should the cold warning show: idle past the lifetime with a context worth re-reading. */
export const isCold = (idleMs: number, contextTokens: number, cfg: Config): boolean =>
  idleMs >= cfg.lifetimeMs && contextTokens > cfg.warnTokens

/**
 * Is an auto-handoff worth a fork now: `small` when the context is cheap to
 * restart anyway, `late` when the timer fired past the lifetime (the machine
 * slept), where a fork would rewrite the whole context to cache at full price.
 */
export const handoffCheck = (idleMs: number, contextTokens: number, cfg: Config): 'due' | 'small' | 'late' =>
  contextTokens <= cfg.warnTokens ? 'small' : idleMs >= cfg.lifetimeMs ? 'late' : 'due'

/**
 * Is `lowContextPercent` or less of the window left, `used` being the status
 * line's context figure (`$.session.usage().context.tokens`), which counts a
 * server-side tool loop's last iteration, not the summed step usage. With
 * auto-compact off, a full window ends the session: nothing, /handoff
 * included, can run after.
 */
export const isLowContext = (used: number, window: number, cfg: Config): boolean =>
  cfg.lowContextPercent > 0 && window > 0 && (window - used) * 100 <= window * cfg.lowContextPercent

/** The band's handoff note: where it is, or why there is none. */
export const handoffNote = (h: { isSaved: true; path: string } | { isSaved: false; reason: string }, label = 'handoff'): string =>
  h.isSaved ? ` │ ↪ ${label}: ${h.path}` : ` │ no ${label}: ${h.reason}`

export const IDLE_WHY = 'The person has been idle for a while and the prompt cache of this conversation is about to expire.'

export const lowContextWhy = (percentLeft: number): string =>
  `The context window of this conversation is nearly full (${percentLeft}% left): the session will soon accept no more requests.`

/**
 * The fork's one message, after `why` it is being asked now. The fork replays the
 * main thread's last request, which ends before the latest reply, so that reply
 * rides here. The fork inherits the session's system prompt (output style,
 * reporting rules) and tools (all denied), hence the explicit overrides.
 */
export const handoffPrompt = (why: string, lastAnswer: string): string =>
  [
    `[cache-tax auto-handoff] ${why}`,
    'Stop the current task: do not continue it, and use no tool (none will run). For this one reply, ignore the output style and every reporting rule: no tool list, no diff report, no audio summary.',
    '',
    'Reply with one Markdown handoff document and nothing else, so that a fresh agent with none of this conversation can pick the work up without loss. Use these sections:',
    '## Goal (what the person wants, and the constraints and preferences they stated)',
    '## Current state (what is done, in progress, verified and how)',
    '## Decisions (what was decided and why; options ruled out and why)',
    '## Open questions and blockers',
    '## Next steps (concrete, in order)',
    '## Key references (paths with line numbers where they matter, commands, branches, commits, URLs)',
    '## Suggested skills (skills the next agent should invoke, and when)',
    '',
    'Keep identifiers, paths, commands and numbers verbatim. Reference specs, plans, ADRs, issues, commits and diffs by path or URL instead of copying them. Redact secrets such as API keys, passwords and tokens.',
    ...(lastAnswer === '' ? [] : ['', 'Your last reply in this conversation is not shown above; here it is:', `<last-reply>\n${lastAnswer}\n</last-reply>`]),
  ].join('\n')

/** A handoff document has structure: at least three Markdown headings. */
export const isHandoff = (text: string): boolean => (text.match(/^#{1,3} \S/gm) ?? []).length >= 3

/** One file per session, overwritten each idle stretch: the latest handoff covers everything before it. */
export const handoffPath = (home: string, root: string, sessionId: string): string =>
  `${home}/.claude/handoffs/${root.split('/').filter(Boolean).pop() ?? 'root'}-${sessionId.slice(0, 8)}.md`

/**
 * `root`: the session's project root, where it started; `--resume` finds the session only from there.
 * `when`: what triggered it, as the header's sentence ends ("55 min into an idle stretch, …").
 */
export type HandoffMeta = { path: string; at: number; when: string; sessionId: string; root: string; tokens: number }

export const idleWhen = (idleMs: number): string => `${Math.round(idleMs / MINUTE)} min after the last cache read, before the prompt cache expired`

export const lowContextWhen = (percentUsed: number): string => `at ${percentUsed}% context used, before the window filled`

/** Context used and left, as percentages with one decimal that add up to 100. */
export const contextPercents = (tokens: number, window: number): { used: number; left: number } => {
  const left = Math.round(((window - tokens) * 1000) / window) / 10

  return { used: Math.round((100 - left) * 10) / 10, left }
}

export const handoffDoc = (m: HandoffMeta, body: string): string =>
  [
    `<!-- written by cache-tax auto-handoff ${new Date(m.at).toISOString()} -->`,
    `> Auto-handoff ${new Date(m.at).toISOString().slice(0, 16).replace('T', ' ')} UTC, ${m.when}.`,
    `> Session \`${m.sessionId}\` in \`${m.root}\`, ~${kTokens(m.tokens)} context tokens.`,
    '>',
    `> - Continue fresh (cheap): \`cd "${m.root}" && claude "Read ${m.path} and continue from it."\`, or in the open session \`/clear\` then the same prompt.`,
    `> - Continue in full (re-reads the whole context uncached): \`cd "${m.root}" && claude --resume ${m.sessionId}\``,
    '',
    body.trim(),
    '',
  ].join('\n')

export const warningLine = (idleMinutes: number, tokens: number, fiveHour: number | null): string =>
  `⚠ cache likely cold (idle ${idleMinutes} min): next prompt re-reads ~${kTokens(tokens)} tokens` +
  (fiveHour === null ? '' : ` (5h window ${Math.round(fiveHour)}% used)`)

export type LastTurn = { cacheShare: number; durationMs: number; tools: number }

/** The band's weather line, or null when there is nothing to show. */
export const weatherLine = (usage: SessionUsage | null, last: LastTurn | null): string | null => {
  const parts: string[] = []
  const ctxPercent = usage?.context.percent

  if (ctxPercent !== undefined) {
    parts.push(`ctx ${ctxPercent}%`)
  }

  if (usage !== null) {
    const limits = [
      ['5h', rateOf(usage, 'five_hour')],
      ['7d', rateOf(usage, 'seven_day')],
    ] as const
    const shown = limits.filter(([, v]) => v !== null).map(([k, v]) => `${k} ${Math.round(v ?? 0)}%`)

    if (shown.length > 0) {
      parts.push(shown.join(' · '))
    }
  }

  if (last !== null) {
    parts.push(`last turn: cache ${pct(last.cacheShare)} · ${duration(last.durationMs)} · ${last.tools} tool${last.tools === 1 ? '' : 's'}`)
  }

  return parts.length === 0 ? null : parts.join(' │ ')
}

/**
 * Smallest idle gap after which the first request's cache share fell below 50%,
 * with the longest gap still seen warm as context; null when no cold turn is recorded.
 */
export const estimateLifetime = (records: readonly TurnRecord[]): { coldAtMs: number; warmUpToMs: number | null } | null => {
  const gapped = records.filter((r): r is TurnRecord & { idleGapMs: number } => r.idleGapMs !== null)
  const cold = gapped.filter(r => r.firstCacheShare < 0.5).map(r => r.idleGapMs)

  if (cold.length === 0) {
    return null
  }

  const warm = gapped.filter(r => r.firstCacheShare >= 0.5).map(r => r.idleGapMs)

  return { coldAtMs: Math.min(...cold), warmUpToMs: warm.length === 0 ? null : Math.max(...warm) }
}

const minutes = (ms: number): string => `${Math.round(ms / MINUTE)} min`

const clock = (at: number): string => new Date(at).toISOString().slice(11, 16)

export const ctxReport = (records: readonly TurnRecord[], usage: SessionUsage | null): string => {
  const lines: string[] = ['## Cache tax', '']
  const summary = weatherLine(usage, null)

  lines.push(`**Now:** ${summary ?? 'no usage reported yet'}${usage?.context.tokens === undefined ? '' : ` (${kTokens(usage.context.tokens)} context tokens)`}`, '')

  const recent = records.slice(-20)

  if (recent.length === 0) {
    lines.push('No turns recorded yet.')
  } else {
    lines.push('| time (UTC) | idle gap | cache (1st req) | cache (turn) | in | out | duration | tools |')
    lines.push('|---|---|---|---|---|---|---|---|')

    for (const r of recent) {
      const turnShare = cacheShare({ input_tokens: r.inputTokens, cache_read_input_tokens: r.cacheRead, cache_creation_input_tokens: r.cacheCreation })
      const input = r.inputTokens + r.cacheRead + r.cacheCreation

      lines.push(
        `| ${clock(r.at)} | ${r.idleGapMs === null ? '—' : minutes(r.idleGapMs)} | ${pct(r.firstCacheShare)} | ${pct(turnShare)} | ${kTokens(input)} | ${kTokens(r.outputTokens)} | ${duration(r.durationMs)} | ${r.tools} |`,
      )
    }
  }

  const estimate = estimateLifetime(records)

  lines.push(
    '',
    estimate === null
      ? '**Estimated cache lifetime:** not enough data'
      : `**Estimated cache lifetime:** ≤ ${minutes(estimate.coldAtMs)} (smallest idle gap with first-request cache < 50%${estimate.warmUpToMs === null ? '' : `; longest warm gap seen: ${minutes(estimate.warmUpToMs)}`})`,
  )

  return lines.join('\n')
}
