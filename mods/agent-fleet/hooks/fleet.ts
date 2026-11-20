// Pure roster logic and formatting for the fleet panel. No `$`, no side effects.
import type { AgentInfo, AgentStatus, TurnCompleteReason, TurnUsage } from 'claude-code'

import type { FleetAgent, FleetStatus } from '../types'

export const MAX_AGENTS = 100
/** A completion longer than this earns a toast. */
export const TOAST_AFTER_MS = 60_000

export type Spawned = {
  id: string
  type: string
  description: string
  model: string
  isTeammate: boolean
  isWorkflow: boolean
  now: number
}

const blank = (id: string, now: number): FleetAgent => ({
  id,
  type: 'agent',
  description: '',
  model: '',
  isTeammate: false,
  isWorkflow: false,
  startedAt: now,
  status: 'running',
  tools: 0,
  lastTool: '',
  tokensIn: 0,
  tokensOut: 0,
  cacheRead: 0,
  steps: 0,
})

/** Keeps at most MAX_AGENTS, dropping the oldest finished ones first, then the oldest. */
export const cap = (list: readonly FleetAgent[]): FleetAgent[] => {
  if (list.length <= MAX_AGENTS) return [...list]
  const excess = list.length - MAX_AGENTS
  const finished = list.filter(a => a.status !== 'running').slice(0, excess).map(a => a.id)
  const kept = list.filter(a => !finished.includes(a.id))
  return kept.slice(Math.max(0, kept.length - MAX_AGENTS))
}

const patch = (list: readonly FleetAgent[], id: string, now: number, fn: (a: FleetAgent) => FleetAgent): FleetAgent[] =>
  list.some(a => a.id === id) ? list.map(a => (a.id === id ? fn(a) : a)) : cap([...list, fn(blank(id, now))])

export const spawned = (list: readonly FleetAgent[], s: Spawned): FleetAgent[] =>
  patch(list, s.id, s.now, a => ({
    ...a,
    type: s.type,
    description: s.description,
    model: s.model,
    isTeammate: s.isTeammate,
    isWorkflow: s.isWorkflow,
    status: 'running',
    endedAt: undefined,
  }))

export const turnStarted = (list: readonly FleetAgent[], id: string, now: number): FleetAgent[] =>
  patch(list, id, now, a => ({ ...a, status: 'running', endedAt: undefined }))

const addUsage = (a: FleetAgent, u: TurnUsage): FleetAgent => ({
  ...a,
  tokensIn: a.tokensIn + u.input_tokens + (u.cache_creation_input_tokens ?? 0),
  tokensOut: a.tokensOut + u.output_tokens,
  cacheRead: a.cacheRead + u.cache_read_input_tokens,
  model: a.model === '' ? u.model : a.model,
})

export const stepped = (list: readonly FleetAgent[], id: string, usage: TurnUsage | null, now: number): FleetAgent[] =>
  patch(list, id, now, a => {
    const counted = { ...a, steps: a.steps + 1 }
    return usage === null ? counted : addUsage(counted, usage)
  })

export const statusOfReason = (reason: TurnCompleteReason): FleetStatus =>
  reason === 'answer' ? 'done' : reason === 'aborted' ? 'aborted' : 'error'

/** The turn's end. Usage is folded in only when no step was seen (the steps already counted it). */
export const completed = (
  list: readonly FleetAgent[],
  id: string,
  reason: TurnCompleteReason,
  usage: TurnUsage | undefined,
  now: number,
): FleetAgent[] =>
  patch(list, id, now, a => {
    const withUsage = a.steps === 0 && usage !== undefined ? addUsage(a, usage) : a
    return { ...withUsage, status: statusOfReason(reason), endedAt: now }
  })

export const toolCalled = (list: readonly FleetAgent[], id: string, tool: string, now: number): FleetAgent[] =>
  patch(list, id, now, a => ({ ...a, tools: a.tools + 1, lastTool: tool }))

export const statusOfList = (s: AgentStatus): FleetStatus =>
  s === 'completed' || s === 'idle' ? 'done' : s === 'failed' ? 'error' : s === 'killed' ? 'aborted' : 'running'

/**
 * Folds `$.agent.list()` in: adds agents the events missed and settles statuses
 * the list knows. An agent the list does not name is left alone: the list drops
 * ended tasks and never names workflow agents, and `turn.complete` reports every end.
 */
export const reconcile = (list: readonly FleetAgent[], roster: readonly AgentInfo[], now: number): FleetAgent[] => {
  const byId = new Map(roster.map(r => [r.id, r]))
  const known = list.map(a => {
    const r = byId.get(a.id)
    if (r === undefined) return a
    const status = statusOfList(r.status)
    const settled = status !== 'running' && a.status === 'running'
    return {
      ...a,
      type: a.type === 'agent' ? r.type : a.type,
      description: a.description === '' ? r.description : a.description,
      status: a.status === 'running' ? status : a.status,
      ...(settled ? { endedAt: now } : {}),
    }
  })
  const fresh = roster
    .filter(r => !list.some(a => a.id === r.id))
    .map(r => ({
      ...blank(r.id, now),
      type: r.type,
      description: r.description,
      isTeammate: r.teammateId !== undefined,
      status: statusOfList(r.status),
    }))
  return cap([...known, ...fresh])
}

// ---------------------------------------------------------------- formatting

export const counts = (list: readonly FleetAgent[]) => ({
  running: list.filter(a => a.status === 'running').length,
  done: list.filter(a => a.status === 'done').length,
  failed: list.filter(a => a.status === 'error' || a.status === 'aborted').length,
  tokens: list.reduce((n, a) => n + totalTokens(a), 0),
})

export const totalTokens = (a: FleetAgent): number => a.tokensIn + a.tokensOut

export const statusLine = (list: readonly FleetAgent[]): string | undefined => {
  const c = counts(list)
  if (c.running === 0) return undefined
  return `fleet: ${c.running} running · ${c.done} done${c.failed > 0 ? ` · ${c.failed} failed` : ''}`
}

export const glyph = (s: FleetStatus): string => (s === 'running' ? '●' : s === 'done' ? '✓' : '✗')

export const shortModel = (model: string): string =>
  model
    .replace(/^claude-/, '')
    .replace(/\[.*\]$/, '')
    .replace(/-\d{8}$/, '') || '-'

const pad2 = (n: number): string => String(n).padStart(2, '0')

export const mmss = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`
}

export const humanDuration = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${pad2(m)}m`
  if (m > 0) return `${m}m${pad2(s % 60)}s`
  return `${s}s`
}

export const kTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

export const truncate = (text: string, width: number): string => {
  if (width <= 0) return ''
  const chars = [...text]
  return chars.length <= width ? text : `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
}

export const elapsed = (a: FleetAgent, now: number): number => (a.endedAt ?? now) - a.startedAt

/** The toast for an agent that just ended, or undefined when it earns none. */
export const completionToast = (a: FleetAgent): string | undefined => {
  if (a.endedAt === undefined) return undefined
  const took = a.endedAt - a.startedAt
  const label = `${a.type} "${a.description}"`
  const tools = `${a.tools} tool${a.tools === 1 ? '' : 's'}`
  if (a.status === 'done') return took > TOAST_AFTER_MS ? `✓ ${label} done in ${humanDuration(took)}, ${tools}` : undefined
  if (a.status === 'error' || a.status === 'aborted') return `✗ ${label} ${a.status === 'error' ? 'failed' : 'aborted'} after ${humanDuration(took)}, ${tools}`
  return undefined
}

/** Running first (oldest first), then finished (newest first). */
export const ordered = (list: readonly FleetAgent[]): FleetAgent[] => [
  ...list.filter(a => a.status === 'running'),
  ...list.filter(a => a.status !== 'running').reverse(),
]

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export const rosterTable = (list: readonly FleetAgent[], now: number): string => {
  if (list.length === 0) return 'No subagents in this session yet.'
  const c = counts(list)
  const head = '| | type | description | model | elapsed | tools | tokens | last tool |\n|---|---|---|---|---|---|---|---|'
  const rows = ordered(list).map(
    a =>
      `| ${glyph(a.status)} | ${cell(a.type)} | ${cell(a.description)} | ${shortModel(a.model)} | ${mmss(elapsed(a, now))} | ${a.tools} | ${kTokens(totalTokens(a))} | ${cell(a.lastTool) || '-'} |`,
  )
  return [head, ...rows, '', `${c.running} running · ${c.done} done · ${c.failed} failed · ${kTokens(c.tokens)} tokens`].join('\n')
}

export const costTable = (list: readonly FleetAgent[]): string => {
  if (list.length === 0) return 'No subagents in this session yet.'
  const perAgent = [
    '| type | description | model | in | out | cache read | in+out |',
    '|---|---|---|---|---|---|---|',
    ...ordered(list).map(
      a =>
        `| ${cell(a.type)} | ${cell(a.description)} | ${shortModel(a.model)} | ${kTokens(a.tokensIn)} | ${kTokens(a.tokensOut)} | ${kTokens(a.cacheRead)} | ${kTokens(totalTokens(a))} |`,
    ),
  ]
  const models = new Map<string, { agents: number; tokensIn: number; tokensOut: number; cacheRead: number }>()
  for (const a of list) {
    const key = shortModel(a.model)
    const m = models.get(key) ?? { agents: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 }
    models.set(key, { agents: m.agents + 1, tokensIn: m.tokensIn + a.tokensIn, tokensOut: m.tokensOut + a.tokensOut, cacheRead: m.cacheRead + a.cacheRead })
  }
  const perModel = [
    '| model | agents | in | out | cache read | in+out |',
    '|---|---|---|---|---|---|',
    ...[...models.entries()].map(
      ([model, m]) => `| ${model} | ${m.agents} | ${kTokens(m.tokensIn)} | ${kTokens(m.tokensOut)} | ${kTokens(m.cacheRead)} | ${kTokens(m.tokensIn + m.tokensOut)} |`,
    ),
  ]
  return ['**Per agent** (tokens; "in" = uncached input + cache writes)', '', ...perAgent, '', '**Per model**', '', ...perModel].join('\n')
}

export type AutoOpen = {
  interactive: boolean
  isFullscreen: boolean | undefined
  running: number
  closedByPerson: boolean
  paneOpen: boolean
}

/** A pane opens unasked only as a sidebar (fullscreen), with ≥2 running, never after the person closed it. */
export const shouldAutoOpen = (s: AutoOpen): boolean =>
  s.interactive && s.isFullscreen === true && s.running >= 2 && !s.closedByPerson && !s.paneOpen
