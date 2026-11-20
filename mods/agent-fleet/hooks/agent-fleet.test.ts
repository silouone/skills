import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, On, RenderInput } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { shouldAutoOpen } from './fleet'

const PLUGIN = 'agent-fleet'
const INTERACTIVE = { surface: 'terminal' as const, isInteractive: true, cwd: '/work' }
const HEADLESS = { surface: null, isInteractive: false, cwd: '/work' }

const fleetCommand = (args = '', isFullscreen = true) => ({
  command: 'fleet',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen, columns: 180 },
})

const PANE: Omit<RenderInput<'Pane'>, 'surface'> = {
  component: 'Pane',
  requestId: 'fleet',
  viewport: { columns: 180, rows: 48, isFullscreen: true },
  props: {
    title: 'Agent fleet',
    isFocused: false,
    bodyColumns: 90,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
}

const hint = (isFullscreen: boolean): RenderInput<'PromptHint'> => ({
  component: 'PromptHint',
  surface: 'terminal',
  requestId: 'hint',
  viewport: { columns: 180, rows: 48, isFullscreen },
  props: { isDraft: false, isWorking: true, hint: '' },
})

/** The world beneath the plugin: a clock, a spawner minting ids, an agent list, and recorders. */
const world = (on: On) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const opened: string[] = []
  const views: { agentId?: string }[] = []
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  let roster: AgentInfo[] = []
  let n = 0
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'fleet' } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.close', () => ({ value: undefined }))
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: `a${++n}` }))
  on('agent.list', () => ({ value: roster }))
  on('ui.open', ($, e) => (opened.push(e.id), { value: { isPlaced: true as const } }))
  on('ui.view', ($, e) => (views.push(e), { value: {} }))
  on('ui.status', ($, e) => (statuses.push(e.text), { value: undefined }))
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.render', () => ({ type: 'Text', children: [''] }))
  return {
    clock,
    opened,
    views,
    statuses,
    toasts,
    setRoster: (r: AgentInfo[]) => void (roster = r),
  }
}

const spawn = ($: Engine, description: string, subagentType = 'Explore') =>
  $.agent.spawn({
    tool_use_id: `tu-${description}`,
    prompt: `do ${description}`,
    description,
    subagentType,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-4-1',
    background: false,
    fork: false,
  })

describe('roster', () => {
  test('spawn then complete updates the roster', async ($, on) => {
    const w = world(on)
    await $.session.start(INTERACTIVE)
    const { agentId } = await spawn($, 'notes-hub harvest')
    expect(agentId).toBe('a1')

    let out = await $.command.run(fleetCommand())
    expect(out.text).toContain('| ● | Explore | notes-hub harvest | haiku-4-5 |')

    await $.turn.start({ text: 'go', turnId: 't1', agentId: 'a1' })
    await w.clock.advance(65_000)
    await $.turn.complete({
      answer: 'ok',
      durationMs: 65_000,
      isAborted: false,
      turnId: 't1',
      agentId: 'a1',
      reason: 'answer',
      usage: { model: 'claude-haiku-4-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
    })
    out = await $.command.run(fleetCommand())
    expect(out.text).toContain('| ✓ | Explore | notes-hub harvest | haiku-4-5 | 01:05 | 0 | 2k |')
    expect(out.text).toContain('0 running · 1 done')
  })

  test('subagent tool calls count, main-loop calls do not', async ($, on) => {
    world(on)
    await $.session.start(INTERACTIVE)
    await spawn($, 'scan')
    await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'a1' } as never)
    await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' } as never)
    await $.tool.call({ tool: 'Read', file_path: '/b' } as never)
    const out = await $.command.run(fleetCommand())
    expect(out.text).toContain('| 2 |')
    expect(out.text).toContain('| Grep |')
  })

  test('/fleet cost sums tokens per agent and per model', async ($, on) => {
    world(on)
    await $.session.start(HEADLESS)
    await spawn($, 'one')
    await spawn($, 'two')
    for (const agentId of ['a1', 'a2']) {
      await $.turn.complete({
        answer: '',
        durationMs: 1,
        isAborted: false,
        turnId: agentId,
        agentId,
        reason: 'answer',
        usage: { model: 'claude-haiku-4-5', input_tokens: 2000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      })
    }
    const out = await $.command.run(fleetCommand('cost'))
    expect(out.text).toContain('**Per model**')
    expect(out.text).toContain('| haiku-4-5 | 2 | 4k | 2k | 0 | 6k |')
    expect(out.text).not.toContain('$')
  })
})

describe('pane', () => {
  test('renders a row per agent and pressing one views it, on terminal and desktop', async ($, on) => {
    const w = world(on)
    await $.session.start(INTERACTIVE)
    await spawn($, 'alpha')
    await spawn($, 'beta', 'general-purpose')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...PANE } as never)
      expect(await ui.find({ key: 'row:a1' })).toBeDefined()
      expect(await ui.find({ key: 'row:a2' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /2 running/ })).toBeDefined()
      await ui.press({ key: 'row:a2' })
      await ui.press({ key: 'main' })
      await ui.unmount()
    }
    expect(w.views).toEqual([{ agentId: 'a2' }, {}, { agentId: 'a2' }, {}])
  })
})

describe('status and toasts', () => {
  test('status is set while running and cleared after; long completions toast', async ($, on) => {
    const w = world(on)
    await $.session.start(INTERACTIVE)
    await spawn($, 'harvest')
    await w.clock.settle()
    expect(w.statuses.at(-1)).toBe('fleet: 1 running · 0 done')
    await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'a1' } as never)
    await w.clock.advance(482_000)
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', agentId: 'a1', reason: 'answer' })
    await w.clock.settle()
    expect(w.statuses.at(-1)).toBeUndefined()
    expect(w.toasts).toEqual(['✓ Explore "harvest" done in 8m02s, 1 tool'])
  })

  test('short completions do not toast, errors do', async ($, on) => {
    const w = world(on)
    await $.session.start(INTERACTIVE)
    await spawn($, 'quick')
    await spawn($, 'broken')
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'a1', reason: 'answer' })
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'a2', reason: 'error' })
    await w.clock.settle()
    expect(w.toasts).toEqual(['✗ Explore "broken" failed after 0s, 0 tools'])
  })

  test('the 5 s tick reconciles with $.agent.list and stops when none run', async ($, on) => {
    const w = world(on)
    await $.session.start(INTERACTIVE)
    await spawn($, 'listed')
    w.setRoster([{ id: 'a1', description: 'listed', type: 'Explore', status: 'completed' }])
    await w.clock.advance(5000)
    expect(w.statuses.at(-1)).toBeUndefined()
    const out = await $.command.run(fleetCommand())
    expect(out.text).toContain('| ✓ | Explore | listed |')
  })

  test('headless records only: no status, toast or pane', async ($, on) => {
    const w = world(on)
    await $.session.start(HEADLESS)
    await spawn($, 'a')
    await spawn($, 'b')
    await w.clock.advance(70_000)
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', agentId: 'a1', reason: 'error' })
    const out = await $.command.run(fleetCommand('', false))
    await w.clock.settle()
    expect(out.text).toContain('| ✗ | Explore | a |')
    expect(w.statuses).toEqual([])
    expect(w.toasts).toEqual([])
    expect(w.opened).toEqual([])
  })
})

describe('auto-open', () => {
  test('opens unasked with ≥2 running in fullscreen', async ($, on) => {
    const w = world(on)
    await $.session.start(INTERACTIVE)
    await $.ui.render(hint(true))
    await spawn($, 'one')
    await w.clock.settle()
    expect(w.opened).toEqual([])
    await spawn($, 'two')
    await w.clock.settle()
    expect(w.opened).toEqual(['fleet'])
  })

  test('never opens unasked on the main screen', async ($, on) => {
    const w = world(on)
    await $.session.start(INTERACTIVE)
    await $.ui.render(hint(false))
    await spawn($, 'one')
    await spawn($, 'two')
    await spawn($, 'three')
    await w.clock.settle()
    expect(w.opened).toEqual([])
  })

  // The test engine cannot raise a person's close (its `$.ui` has no `close`),
  // so the rule is checked on the pure decision the `ui.close` hook feeds.
  test('never re-opens after the person closed it', () => {
    const base = { interactive: true, isFullscreen: true, running: 3, closedByPerson: false, paneOpen: false }
    expect(shouldAutoOpen(base)).toBe(true)
    expect(shouldAutoOpen({ ...base, closedByPerson: true })).toBe(false)
    expect(shouldAutoOpen({ ...base, paneOpen: true })).toBe(false)
    expect(shouldAutoOpen({ ...base, running: 1 })).toBe(false)
    expect(shouldAutoOpen({ ...base, interactive: false })).toBe(false)
    expect(shouldAutoOpen({ ...base, isFullscreen: undefined })).toBe(false)
  })

  test('/fleet opens the pane even when auto-open never would', async ($, on) => {
    const w = world(on)
    await $.session.start(INTERACTIVE)
    await $.ui.render(hint(false))
    await spawn($, 'one')
    await w.clock.settle()
    expect(w.opened).toEqual([])
    await $.command.run(fleetCommand('', false))
    expect(w.opened).toEqual(['fleet'])
  })
})
