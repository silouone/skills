import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { FleetAgent } from '../types'
import {
  completed,
  completionToast,
  costTable,
  counts,
  elapsed,
  glyph,
  kTokens,
  mmss,
  ordered,
  reconcile,
  rosterTable,
  shortModel,
  shouldAutoOpen,
  spawned,
  statusLine,
  stepped,
  toolCalled,
  totalTokens,
  truncate,
  turnStarted,
} from './fleet'

const PANE = 'fleet'
const TITLE = 'Agent fleet'
const TICK_MS = 5000

const agents = atom({ plugin: 'agent-fleet', key: 'agents' } as const, [])
const closedByPerson = atom({ plugin: 'agent-fleet', key: 'closedByPerson' } as const, false)
const paneOpen = atom({ plugin: 'agent-fleet', key: 'paneOpen' } as const, false)
const interactive = atom({ plugin: 'agent-fleet', key: 'interactive' } as const, false)
const tick = atom({ plugin: 'agent-fleet', key: 'tick' } as const, 0)

// Caches that a hot reload may drop: both are re-learned on the next event.
let isFullscreen: boolean | undefined
let ticker: Timer | undefined

type $ = EngineInterface

/** Writes the roster, then refreshes everything derived from it (status line, tick, auto-open). */
async function change($: $, fn: (list: FleetAgent[]) => FleetAgent[]): Promise<FleetAgent[]> {
  const next = await update($, agents, list => fn(list ?? []))
  await afterChange($, next)
  return next
}

async function afterChange($: $, list: readonly FleetAgent[]): Promise<void> {
  if (!(await read($, interactive))) return
  $.ui.status(statusLine(list))
  const running = counts(list).running
  if (running > 0) startTicker($)
  const open = shouldAutoOpen({
    interactive: true,
    isFullscreen,
    running,
    closedByPerson: await read($, closedByPerson),
    paneOpen: await read($, paneOpen),
  })
  if (open) await openPane($)
}

async function openPane($: $): Promise<void> {
  await update($, paneOpen, () => true)
  void $.ui.open({ id: PANE, title: TITLE })
}

/** While any agent runs: reconcile with `$.agent.list()` and redraw elapsed times. */
function startTicker($: $): void {
  if (ticker !== undefined) return
  ticker = $.clock.every(TICK_MS, () => void onTick($))
}

async function onTick($: $): Promise<void> {
  const now = await $.clock.now()
  const roster = await $.agent.list()
  const before = await read($, agents)
  const list = await change($, l => reconcile(l, roster, now))
  toastEnded($, before, list, await read($, interactive))
  await update($, tick, n => (n ?? 0) + 1)
  if (counts(list).running === 0 && ticker !== undefined) {
    ticker.cancel()
    ticker = undefined
  }
}

/** Toasts each agent that went from running to ended between two rosters. */
function toastEnded($: $, before: readonly FleetAgent[], after: readonly FleetAgent[], isInteractive: boolean): void {
  if (!isInteractive) return
  for (const a of after) {
    const was = before.find(b => b.id === a.id)
    if (was?.status !== 'running' || a.status === 'running') continue
    const text = completionToast(a)
    if (text !== undefined) $.ui.toast(text, { timeoutMs: 6000 })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, interactive, () => e.isInteractive && e.surface !== null)
    await $.command.register({
      name: 'fleet',
      description: 'Agent fleet: open the live pane and print the roster (`/fleet cost` for tokens per agent and model)',
      argumentHint: '[cost]',
    })
    return next(e)
  })

  // The layout: only a fullscreen surface docks a pane, so only there may it open unasked.
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.surface === 'terminal' && e.viewport?.isFullscreen !== undefined) isFullscreen = e.viewport.isFullscreen
    return next(e)
  })
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    if (e.surface === 'terminal' && e.viewport?.isFullscreen !== undefined) isFullscreen = e.viewport.isFullscreen
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined || result.agentId === undefined) return result
    const id = result.agentId
    const now = await $.clock.now()
    await change($, list =>
      spawned(list, {
        id,
        type: e.subagentType,
        description: e.description || (e.workflow ? `workflow #${e.workflow.agentIndex}` : ''),
        model: result.model,
        isTeammate: e.isTeammate === true,
        isWorkflow: e.workflow !== undefined,
        now,
      }),
    )
    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const now = await $.clock.now()
      await change($, list => turnStarted(list, id, now))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    const id = e.agentId
    if (id !== undefined) {
      const now = await $.clock.now()
      await update($, agents, list => stepped(list ?? [], id, response.usage, now))
    }
    return response
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const now = await $.clock.now()
      const before = await read($, agents)
      const list = await change($, l => completed(l, id, e.reason, e.usage, now))
      toastEnded($, before, list, await read($, interactive))
    }
    return next(e)
  })

  // Every tool but the Agent tool: a hook wrapping the Agent call would be
  // skipped for everything its spawned agent does (the re-entry rule).
  on('tool.call', { tool: /^(?!(Agent|Task)$)/ }, async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const now = await $.clock.now()
      await update($, agents, list => toolCalled(list ?? [], id, String(e.tool), now))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, paneOpen, () => false)
    if (e.origin.kind === 'person') await update($, closedByPerson, () => true)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'fleet' }, async ($, e) => {
    isFullscreen = e.presentation.isFullscreen
    const now = await $.clock.now()
    const roster = await $.agent.list()
    const list = await update($, agents, l => reconcile(l ?? [], roster, now))
    if (e.args.trim().toLowerCase() === 'cost') return { text: costTable(list) }
    if (await read($, interactive)) {
      await update($, paneOpen, () => true)
      await $.ui.open({ id: PANE, title: TITLE })
    }
    return { text: rosterTable(list, now) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const list = await read($, agents)
    const now = await $.clock.now()
    const width = e.props.bodyColumns
    const room = Math.max(1, (e.props.scroll?.bodyRows ?? (e.viewport?.rows ?? 24) - 4) - 2)
    const shown = ordered(list).slice(0, room)
    const c = counts(list)

    const showLast = width >= 70
    const fixed = 2 + 13 + 11 + 6 + 5 + 7 + (showLast ? 13 : 0)
    const descWidth = Math.max(8, width - fixed)

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No subagents yet.</Text>}
        {shown.map(a => (
          <Button key={`row:${a.id}`} plain onPress={() => void $.ui.view({ agentId: a.id })}>
            <Text color={a.status === 'running' ? 'claude' : a.status === 'done' ? 'success' : 'error'}>{glyph(a.status)}</Text>
            {` ${truncate(a.type, 12).padEnd(12)} ${truncate(a.description, descWidth).padEnd(descWidth)} `}
            <Text dimColor>
              {`${truncate(shortModel(a.model), 10).padEnd(10)} ${mmss(elapsed(a, now))} ${`${a.tools}t`.padStart(4)} ${kTokens(totalTokens(a)).padStart(6)}`}
              {showLast ? ` ${truncate(a.lastTool, 12)}` : ''}
            </Text>
          </Button>
        ))}
        {list.length > shown.length && <Text dimColor>{`… ${list.length - shown.length} more (/fleet for all)`}</Text>}
        <Box flexDirection="row">
          <Text dimColor>{`${c.running} running · ${c.done} done${c.failed > 0 ? ` · ${c.failed} failed` : ''} · ${kTokens(c.tokens)} tokens  `}</Text>
          <Button key="main" label="[main]" onPress={() => void $.ui.view({})} />
        </Box>
      </Box>
    )
  })
}
