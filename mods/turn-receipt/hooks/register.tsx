import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { computeDelta, formatReceipt, gateBadge, isMainLoop, parseNumstat, parseUntracked, summarize } from './receipt'
import type { Snapshot } from './receipt'

const receipts = atom({ plugin: 'turn-receipt', key: 'receipts' } as const, [] as readonly string[])

const KEEP = 10
const GIT_TIMEOUT_MS = 3000
const BADGE_EVERY_MS = 30_000

type Turn = { calls: string[]; baseline: Snapshot | null }

/** No surface to draw on (`claude -p`, an SDK run): the mod does nothing. */
const isInteractive = async ($: EngineInterface): Promise<boolean> =>
  (await $.session.surfaces()).length > 0

/** numstat vs HEAD (falls back to the index for an unborn HEAD) + untracked files; null when not a repo or no git. */
const snapshot = async ($: EngineInterface): Promise<Snapshot | null> => {
  try {
    const cwd = await $.session.cwd()
    const git = (args: string[]) => $.process.run(['git', '-C', cwd, ...args], { timeoutMs: GIT_TIMEOUT_MS })
    let diff = await git(['diff', '--numstat', 'HEAD'])
    if (diff.exitCode !== 0) diff = await git(['diff', '--numstat'])
    if (diff.exitCode !== 0) return null
    const status = await git(['--no-optional-locks', 'status', '--porcelain', '-uall'])
    if (status.exitCode !== 0) return null
    return { numstat: parseNumstat(diff.stdout), untracked: parseUntracked(status.stdout) }
  } catch {
    return null
  }
}

/** Read-only: derives the status entry from ~/.claude/logs/gate/<session_id>/. */
const refreshBadge = async ($: EngineInterface): Promise<void> => {
  try {
    if (!(await isInteractive($))) return
    const home = await $.env.get('HOME')
    const sid = await $.session.id()
    if (!home || !sid) return $.ui.status(undefined)
    const dir = `${home}/.claude/logs/gate/${sid}`
    const hasGate = await $.fs.exists(`${dir}/gate.py`)
    const meta = hasGate && (await $.fs.exists(`${dir}/meta.json`)) ? await $.fs.read(`${dir}/meta.json`) : null
    $.ui.status(gateBadge(hasGate, typeof meta === 'string' ? meta : null))
  } catch {
    $.ui.status(undefined)
  }
}

// Module state dies on hot reload, as the previous load's timers do: both restart together.
let turn: Turn | null = null
let isStarted = false

/** Once per load, on the first interactive session.start or main turn.start: /receipt and the badge timer. */
async function ensureStarted($: EngineInterface): Promise<void> {
  if (isStarted) return
  isStarted = true
  await $.command.register({ name: 'receipt', description: 'Show the last turn receipt (tool calls + diff).' })
  $.clock.every(BADGE_EVERY_MS, () => void refreshBadge($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (e.isInteractive && e.surface !== null) {
      await ensureStarted($)
      await refreshBadge($)
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    if (!(await isInteractive($))) {
      turn = null
      return next(e)
    }
    await ensureStarted($)
    turn = { calls: [], baseline: await snapshot($) }
    await refreshBadge($)
    return next(e)
  })

  // Observe only, never a guard: a receipt bug must not refuse a tool call.
  on('tool.call', ($, e, next) => {
    if (turn && isMainLoop(e)) turn.calls.push(summarize(e.tool, e as unknown as Record<string, unknown>))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const done = turn
    turn = null
    if (done) {
      const after = done.baseline ? await snapshot($) : null
      const delta = done.baseline && after ? computeDelta(done.baseline, after) : null
      if (done.calls.length > 0 || (delta && delta.length > 0)) {
        const text = formatReceipt(e.durationMs, done.calls, delta)
        await $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } })
        await update($, receipts, list => [...list, text].slice(-KEEP))
      }
    }
    await refreshBadge($)
    return next(e)
  })

  // Observe only: the settings Stop hooks (stop_gate.py) run beneath; refresh after them.
  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    await refreshBadge($)
    return result
  })

  on('command.run', { command: 'receipt' }, async $ => {
    const list = await read($, receipts)
    return { text: list.at(-1) ?? 'No turn receipt yet in this session.' }
  })
}
