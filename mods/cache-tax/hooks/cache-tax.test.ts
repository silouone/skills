import type { ModelForkRequest, ModelForkResult, ModelUsage, On, RenderInput, SessionUsage } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

import { configOf, handoffCheck, isLowContext } from './logic'

const PLUGIN = 'cache-tax'
const SESSION_ID = 'abcdef12-3456-7890-abcd-ef1234567890'
const MIN = 60_000

const BAND: RenderInput<'AbovePrompt'> = {
  component: 'AbovePrompt',
  surface: 'terminal',
  requestId: 'band',
  viewport: { columns: 160, rows: 48, isFullscreen: true },
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 150, scroll: { offset: 0, bodyRows: 9 }, view: {} },
}

const usageOf = (tokens: number, percent: number): SessionUsage => ({
  startedAt: 0,
  context: { tokens, window: 200_000, percent },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 31 },
    { kind: 'seven_day', percentUsed: 12 },
  ],
})

const WARM: ModelUsage = { input_tokens: 500, output_tokens: 800, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 1_000 }
const COLD: ModelUsage = { input_tokens: 500, output_tokens: 800, cache_read_input_tokens: 0, cache_creation_input_tokens: 90_000 }
const ZERO_USAGE: ModelUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type World = {
  toasts: string[]
  commands: string[]
  forks: number
  usage: SessionUsage
  fork: ModelForkResult
  forkRequests: ModelForkRequest[]
  /** While set, every fork waits on it: a fork still in flight. */
  gate: Promise<void> | null
  /** Answers for the next forks, in order; `fork` once it is empty. */
  forkQueue: ModelForkResult[]
  /** While set, every write waits on it: a write still in flight. */
  writeGate: Promise<void> | null
  writes: { path: string; text: string }[]
  root: string
  isSessionIdBroken: boolean
  store: Map<string, unknown>
}

/** Seats the engine beneath the plugin: clock, store, usage, fork, files, env, toasts, commands. */
function worldOf(on: On, usage: SessionUsage): { world: World; clock: MockClock } {
  const world: World = {
    toasts: [],
    commands: [],
    forks: 0,
    store: new Map(),
    usage,
    fork: { isAnswered: true, text: '.', usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: usage.context.tokens ?? 0, cache_creation_input_tokens: 0 } },
    forkRequests: [],
    gate: null,
    forkQueue: [],
    writeGate: null,
    writes: [],
    root: '/work',
    isSessionIdBroken: false,
  }
  const clock = mock.clock(on, { now: 1_000_000 })

  on('store.get', ($, e) => ({ value: world.store.get(e.key) }))
  on('store.set', ($, e) => {
    world.store.set(e.key, e.value)

    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.usage', () => ({ value: world.usage }))
  on('model.fork', async ($, e) => {
    world.forks += 1
    world.forkRequests.push(e)
    await world.gate

    return { value: world.forkQueue.shift() ?? world.fork }
  })
  on('fs.write', async ($, e) => {
    await world.writeGate
    world.writes.push({ path: e.path, text: e.text })

    return { value: undefined }
  })
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('session.id', () => {
    if (world.isSessionIdBroken) {
      throw new Error('session id unavailable')
    }

    return { value: SESSION_ID }
  })
  // The shell moved into a subfolder; the project root (what --resume needs) did not.
  on('session.cwd', () => ({ value: '/work/hooks' }))
  on('session.root', () => ({ value: world.root }))
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)

    return { value: undefined }
  })
  on('command.register', ($, e) => {
    world.commands.push(e.name)

    return { value: { command: e.name } } as never
  })
  on('ui.render', () => ({ type: 'Text', children: [''] }))

  return { world, clock }
}

const start = ($: Engine, isInteractive = true) =>
  $.session.start({ surface: isInteractive ? 'terminal' : null, isInteractive, cwd: '/work' })

let turnN = 0

/** One main-loop turn: start, one model request (answered by stepsAnswer), completion. */
async function runTurn($: Engine, clock: MockClock, usage: ModelUsage, durationMs = 14_000) {
  const turnId = `t${(turnN += 1)}`
  await $.turn.start({ text: 'go', turnId })
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', messageCount: 3 })

  for await (const chunk of stream) {
    void chunk
  }

  await clock.advance(durationMs)
  await $.turn.complete({ answer: 'done', durationMs, isAborted: false, turnId, reason: 'answer', usage: { ...usage, model: 'claude-opus-5-5' } })
}

/** The test's bottom for turn.step: answers each request with `usage` and `tools` tool calls. */
function stepsAnswer(on: On, usage: () => ModelUsage, tools = 2) {
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: Array.from({ length: tools }, (_, i) => ({ id: `tu${i}`, name: 'Read', input: {} })),
      stopReason: 'end_turn',
      usage: { ...usage(), model: e.model },
    } as never
  })
}

const bandText = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => {
  const ui = await $.ui.mount({ ...BAND, plugin: PLUGIN, surface })
  const warning = (await ui.find({ type: 'Text', text: /cache likely cold/ }))?.text
  const weather = (await ui.find({ type: 'Text', text: /│|ctx|last turn/ }))?.text
  await ui.unmount()

  return { warning, weather }
}

describe('cold-cache warning', () => {
  test('idle gap below the lifetime: no warning, the weather line shows', async ($, on) => {
    const { clock } = worldOf(on, usageOf(142_000, 42))
    let share = WARM
    stepsAnswer(on, () => share)
    await start($)
    await runTurn($, clock, share)
    share = WARM
    await clock.advance(30 * MIN)

    const { warning, weather } = await bandText($)
    expect(warning).toBeUndefined()
    expect(weather).toContain('ctx 42%')
    expect(weather).toContain('5h 31% · 7d 12%')
    expect(weather).toMatch(/last turn: cache 98% · 14s · 2 tools/)
  })

  test('idle past the lifetime with a large context: warning with token count and window %, no model call', { options: { autoHandoff: false } }, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(142_000, 71))
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(73 * MIN)

    const { warning } = await bandText($)
    // The ticker runs once a minute from session start, so the shown idle time lags by under a minute.
    expect(warning).toMatch(/cache likely cold \(idle 7[23] min\)/)
    expect(warning).toContain('~142k tokens')
    expect(warning).toContain('5h window 31% used')
    expect(world.forks).toBe(0)
  })

  test('a new prompt after a cold gap clears the warning, keeps it away during the turn, and restarts the countdown', { options: { autoHandoff: false } }, async ($, on) => {
    const { clock } = worldOf(on, usageOf(142_000, 71))
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(73 * MIN)
    expect((await bandText($)).warning).toContain('cache likely cold')

    // Back: a long agentic turn, several requests over six minutes. Each one reads the cache.
    await $.turn.start({ text: 'go on', turnId: 'back' })

    for (const index of [0, 1, 2]) {
      for await (const chunk of $.turn.step({ turnId: 'back', index, model: 'claude-opus-5-5', messageCount: 3 + index })) {
        void chunk
      }

      await clock.advance(2 * MIN)
      expect((await bandText($)).warning).toBeUndefined()
    }

    await $.turn.complete({ answer: 'done', durationMs: 6 * MIN, isAborted: false, turnId: 'back', reason: 'answer', usage: { ...WARM, model: 'claude-opus-5-5' } })
    expect((await bandText($)).warning).toBeUndefined()

    // The countdown restarts from the last activity: quiet for the lifetime, back after it.
    await clock.advance(58 * MIN)
    expect((await bandText($)).warning).toBeUndefined()
    await clock.advance(3 * MIN)
    expect((await bandText($)).warning).toContain('cache likely cold')
  })

  test('the token threshold is respected: a small context never warns', async ($, on) => {
    const { clock } = worldOf(on, usageOf(5_000, 3))
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(90 * MIN)

    expect((await bandText($)).warning).toBeUndefined()
  })

  test('cacheLifetimeMinutes changes behaviour', { options: { cacheLifetimeMinutes: 10, autoHandoff: false } }, async ($, on) => {
    const { clock } = worldOf(on, usageOf(142_000, 71))
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(11 * MIN)

    expect((await bandText($)).warning).toMatch(/idle 1[01] min/)
  })
})

describe('band surfaces', () => {
  test('the band draws on terminal and desktop, and Hide hides it', async ($, on) => {
    const { clock } = worldOf(on, usageOf(84_000, 42))
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)

    for (const surface of ['terminal', 'desktop'] as const) {
      expect((await bandText($, surface)).weather).toContain('ctx 42%')
    }

    const ui = await $.ui.mount({ ...BAND, plugin: PLUGIN, surface: 'desktop' })
    await ui.press({ key: 'hide' })
    await ui.unmount()
    expect((await bandText($, 'terminal')).weather).toBeUndefined()
  })

  test('nothing to show: the band yields', async ($, on) => {
    worldOf(on, { startedAt: 0, context: { window: 200_000 }, rateLimits: [] })
    await start($)

    expect((await bandText($)).weather).toBeUndefined()
  })
})

describe('/ctx and the per-turn record', () => {
  test('/ctx with no data says not enough data', async ($, on) => {
    worldOf(on, usageOf(10_000, 5))
    await start($)

    const { text } = await $.command.run({ command: 'ctx', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
    expect(text).toContain('No turns recorded yet.')
    expect(text).toContain('not enough data')
  })

  test('turns are recorded with idle gap; /ctx estimates the lifetime; a cold turn toasts', { options: { autoHandoff: false } }, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(92_000, 46))
    let share = WARM
    stepsAnswer(on, () => share)
    await start($)
    await runTurn($, clock, share)
    await clock.advance(20 * MIN)
    await runTurn($, clock, share)
    share = COLD
    await clock.advance(65 * MIN)
    await runTurn($, clock, share)

    expect(world.toasts).toContain('cache went cold: +91k tokens re-read')

    const { text } = await $.command.run({ command: 'ctx', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
    expect(text).toContain('| 20 min |')
    expect(text).toContain('≤ 65 min')
    expect(text).toContain('longest warm gap seen: 20 min')
  })

  test('context crossing 80% toasts once', async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(170_000, 85))
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await runTurn($, clock, WARM)

    expect(world.toasts.filter(t => t.startsWith('context 85%')).length).toBe(1)
  })

  test('headless: no commands, no toasts, turns still recorded', async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(170_000, 85))
    stepsAnswer(on, () => WARM)
    await start($, false)
    await runTurn($, clock, WARM)
    await clock.advance(120 * MIN)

    expect(world.commands).toEqual([])
    expect(world.toasts).toEqual([])
    expect(world.store.get('cache-tax.turns')).toEqual([
      expect.objectContaining({ idleGapMs: null, cacheRead: 90_000, tools: 2, durationMs: 14_000, model: 'claude-opus-5-5' }),
    ])
  })
})

describe('/keepwarm', () => {
  const OPTS = { options: { cacheLifetimeMinutes: 10, safetyMarginMinutes: 5, keepWarmMaxRefreshes: 2, autoHandoff: false } }
  const run = ($: Engine, args: string) =>
    $.command.run({ command: 'keepwarm', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })

  test('off by default; refreshes before expiry, honours the cap, appends nothing', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    const session = mock.session(on)
    stepsAnswer(on, () => WARM)
    await start($)
    expect((await run($, 'status')).text).toBe('keep-warm off.')
    await runTurn($, clock, WARM)
    await clock.advance(30 * MIN)
    expect(world.forks).toBe(0)

    expect((await run($, 'on')).text).toContain('at most 2 times')
    await runTurn($, clock, WARM)
    await clock.advance(4 * MIN)
    expect(world.forks).toBe(0)
    await clock.advance(1 * MIN)
    expect(world.forks).toBe(1)
    await clock.advance(5 * MIN)
    expect(world.forks).toBe(2)
    await clock.advance(30 * MIN)
    expect(world.forks).toBe(2)
    expect(world.toasts).toContain('keep-warm: cap of 2 refreshes reached; the cache will go cold')
    expect(session.appended()).toEqual([])
    // Past the cap the cache is let go cold, and the warning comes back.
    expect((await bandText($)).warning).toContain('cache likely cold')
  })

  test('a refresh keeps the cold warning away while it works', OPTS, async ($, on) => {
    const { clock } = worldOf(on, usageOf(90_000, 45))
    stepsAnswer(on, () => WARM)
    await start($)
    await run($, 'on')
    await runTurn($, clock, WARM)
    await clock.advance(9 * MIN)

    expect((await bandText($)).warning).toBeUndefined()
  })

  const failures: [string, ModelForkResult, string][] = [
    ['api-error', { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, 'API error 529 (overloaded)'],
    ['empty-reply', { isAnswered: false, reason: 'empty-reply', usage: WARM }, 'came back empty'],
    ['aborted', { isAnswered: false, reason: 'aborted', usage: WARM }, 'aborted'],
    ['nothing-to-fork', { isAnswered: false, reason: 'nothing-to-fork' }, 'nothing to fork'],
    ['a cold read', { isAnswered: true, text: '.', usage: { input_tokens: 90_000, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } }, 'read only 100 of 90k'],
  ]

  for (const [name, fork, reason] of failures) {
    test(`stops and says why on ${name}`, OPTS, async ($, on) => {
      const { world, clock } = worldOf(on, usageOf(90_000, 45))
      world.fork = fork
      stepsAnswer(on, () => WARM)
      await start($)
      await run($, 'on')
      await runTurn($, clock, WARM)
      await clock.advance(5 * MIN)
      expect(world.forks).toBe(1)
      await clock.advance(30 * MIN)
      expect(world.forks).toBe(1)
      expect(world.toasts.some(t => t.startsWith('keep-warm stopped:') && t.includes(reason))).toBe(true)
      expect((await run($, 'status')).text).toBe('keep-warm off.')
    })
  }
})

describe('auto-handoff', () => {
  const OPTS = { options: { cacheLifetimeMinutes: 10, safetyMarginMinutes: 5 } }
  const PATH = '/home/u/.claude/handoffs/work-abcdef12.md'
  const BODY = '## Goal\nShip auto-handoff.\n\n## Current state\nTests written.\n\n## Next steps\n1. Implement.\n\n## Suggested skills\n- tdd'
  const HANDOFF: ModelForkResult = { isAnswered: true, text: BODY, usage: { input_tokens: 900, output_tokens: 1_500, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 0 } }
  const run = ($: Engine, args: string) =>
    $.command.run({ command: 'keepwarm', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })

  test('fires once right before expiry: forks with the last answer, writes the doc, the band points at it', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(4 * MIN)
    expect(world.forks).toBe(0)
    await clock.advance(1 * MIN)
    expect(world.forks).toBe(1)

    const [request] = world.forkRequests
    // No effort: a level other than the session's can rewrite the whole conversation to cache.
    expect(request?.effort).toBeUndefined()
    // The fork replays the last request, which ends before the final answer: the answer rides in the prompt.
    expect(request?.prompt).toContain('<last-reply>\ndone\n</last-reply>')
    expect(request?.prompt).toMatch(/no tool/i)
    expect(world.writes.map(w => w.path)).toEqual([PATH])
    expect(world.writes[0]?.text).toContain(`cd "/work" && claude --resume ${SESSION_ID}`)
    expect(world.writes[0]?.text).toContain(`Read ${PATH} and continue`)
    expect(world.writes[0]?.text).toContain(BODY)
    expect(world.toasts).toContain(`handoff saved: ${PATH}`)
    expect((await bandText($)).weather).toContain(`handoff: ${PATH}`)

    // Once per idle stretch; when the cache does go cold, the warning points at the handoff.
    await clock.advance(30 * MIN)
    expect(world.forks).toBe(1)
    expect((await bandText($)).warning).toContain(`handoff: ${PATH}`)
  })

  test('the next turn clears the note and re-arms the handoff for the next idle stretch', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(5 * MIN)
    await runTurn($, clock, WARM)

    expect((await bandText($)).weather).not.toContain('handoff')
    await clock.advance(5 * MIN)
    expect(world.forks).toBe(2)
    expect(world.writes.length).toBe(2)
  })

  test('a small context is cheap to restart: no handoff', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(5_000, 3))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(30 * MIN)

    expect(world.forks).toBe(0)
    expect(world.writes).toEqual([])
  })

  test('headless: no handoff', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($, false)
    await runTurn($, clock, WARM)
    await clock.advance(30 * MIN)

    expect(world.forks).toBe(0)
  })

  test('autoHandoff off: no handoff', { options: { ...OPTS.options, autoHandoff: false } }, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(30 * MIN)

    expect(world.forks).toBe(0)
  })

  test('a reply that is not a handoff document is not written, and says why', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = { ...HANDOFF, text: 'Sure, here is the audio summary.' }
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(5 * MIN)

    expect(world.writes).toEqual([])
    expect(world.toasts.some(t => t.startsWith('handoff failed:') && t.includes('not a handoff'))).toBe(true)
    // The toast is gone by the time the person is back: the band keeps the reason.
    expect((await bandText($)).weather).toContain('no handoff: the reply was not a handoff document')
    // The fork still read the cache, which restarted its lifetime: no cold warning 10 min after the turn.
    await clock.advance(6 * MIN)
    expect((await bandText($)).warning).toBeUndefined()
  })

  test('a failed fork says why', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: ZERO_USAGE }
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(5 * MIN)

    expect(world.writes).toEqual([])
    expect(world.toasts).toContain('handoff failed: API error 529 (overloaded)')
    await clock.advance(30 * MIN)
    expect(world.forks).toBe(1)
    expect((await bandText($)).warning).toContain('no handoff: API error 529 (overloaded)')
  })

  test('a real turn during the handoff fork is recorded and re-arms; the stale handoff is dropped', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    let release = () => {}
    world.gate = new Promise(resolve => {
      release = resolve
    })
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(5 * MIN)
    expect(world.forks).toBe(1)

    // The person comes back while the handoff is still being written.
    await runTurn($, clock, WARM)
    release()
    world.gate = null
    await clock.advance(0)

    expect(world.store.get('cache-tax.turns')).toHaveLength(2)
    expect(world.writes).toEqual([])
    expect((await bandText($)).weather).not.toContain('handoff')
    await clock.advance(5 * MIN)
    expect(world.forks).toBe(2)
    expect(world.writes.length).toBe(1)
  })

  test('keep-warm on: the handoff comes at the refresh cap, right before the cache goes cold', { options: { ...OPTS.options, keepWarmMaxRefreshes: 2 } }, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await run($, 'on')
    await runTurn($, clock, WARM)
    await clock.advance(10 * MIN)
    expect(world.forks).toBe(2)
    expect(world.writes).toEqual([])

    await clock.advance(5 * MIN)
    expect(world.toasts).toContain('keep-warm: cap of 2 refreshes reached; the cache will go cold')
    expect(world.forks).toBe(3)
    expect(world.writes.map(w => w.path)).toEqual([PATH])
  })

  test('/keepwarm off mid-idle hands the timer back to the handoff, on the original schedule', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(2 * MIN)
    await run($, 'on')
    await clock.advance(1 * MIN)
    expect((await run($, 'off')).text).toBe('keep-warm off.')
    await clock.advance(2 * MIN)

    expect(world.forks).toBe(1)
    expect(world.writes.map(w => w.path)).toEqual([PATH])
  })

  test('a turn that ends with no usage (interrupted before any response) still arms the handoff', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    await start($)
    await $.turn.start({ text: 'go', turnId: 'cut' })
    await $.turn.complete({ answer: '', durationMs: 1_000, isAborted: true, turnId: 'cut', reason: 'aborted' })
    await clock.advance(5 * MIN)

    expect(world.writes.map(w => w.path)).toEqual([PATH])
  })

  test('keep-warm stopping itself hands the idle timer to the auto-handoff', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.forkQueue = [{ isAnswered: false, reason: 'empty-reply', usage: WARM }]
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await run($, 'on')
    await runTurn($, clock, WARM)
    await clock.advance(5 * MIN)

    expect(world.toasts).toContain('keep-warm stopped: the fork came back empty')
    expect(world.forks).toBe(2)
    expect(world.writes.map(w => w.path)).toEqual([PATH])
  })

  test('/keepwarm off while the handoff fork runs does not start a second one', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    let release = () => {}
    world.gate = new Promise(resolve => {
      release = resolve
    })
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(5 * MIN)
    await run($, 'off')
    await clock.advance(0)
    expect(world.forks).toBe(1)

    release()
    world.gate = null
    await clock.advance(0)
    expect(world.writes.length).toBe(1)
  })

  test('a turn that starts while the file is being written leaves no stale note', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    let release = () => {}
    world.writeGate = new Promise(resolve => {
      release = resolve
    })
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(5 * MIN)
    await runTurn($, clock, WARM)
    release()
    world.writeGate = null
    await clock.advance(0)

    expect((await bandText($)).weather).not.toContain('handoff')
    expect(world.toasts).not.toContain(`handoff saved: ${PATH}`)
    // The next idle stretch still gets its handoff.
    await clock.advance(5 * MIN)
    expect(world.forks).toBe(2)
  })

  test('session.start firing again (a reload) re-arms the handoff without doubling it', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(2 * MIN)
    await start($)
    await clock.advance(3 * MIN)
    expect(world.forks).toBe(1)
    await clock.advance(10 * MIN)
    expect(world.forks).toBe(1)
  })

  test('the resume line points at the directory the session started in, even after /cd', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    world.root = '/elsewhere'
    await runTurn($, clock, WARM)
    await clock.advance(5 * MIN)

    expect(world.writes.map(w => w.path)).toEqual([PATH])
    expect(world.writes[0]?.text).toContain(`cd "/work" && claude --resume ${SESSION_ID}`)
  })

  test('an engine call that throws settles the band instead of failing silently', OPTS, async ($, on) => {
    const { world, clock } = worldOf(on, usageOf(90_000, 45))
    world.fork = HANDOFF
    world.isSessionIdBroken = true
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(5 * MIN)

    expect((await bandText($)).weather).toContain('no handoff:')
  })

  test('handoffCheck: only a context worth keeping, and only while the cache can still be read', async () => {
    const cfg = configOf({ cacheLifetimeMinutes: 60, warnTokenThreshold: 20_000 })

    expect(handoffCheck(55 * MIN, 90_000, cfg)).toBe('due')
    expect(handoffCheck(55 * MIN, 5_000, cfg)).toBe('small')
    // A timer that fires after the lifetime (machine asleep) would pay a full cache rewrite.
    expect(handoffCheck(61 * MIN, 90_000, cfg)).toBe('late')
  })
})

describe('last-chance handoff (context nearly full)', () => {
  const PATH = '/home/u/.claude/handoffs/work-abcdef12.md'
  const BODY = '## Goal\nFinish the overnight run.\n\n## Current state\nStep 41 of 60.\n\n## Next steps\n1. Resume at step 42.'
  const HANDOFF: ModelForkResult = { isAnswered: true, text: BODY, usage: { input_tokens: 900, output_tokens: 1_500, cache_read_input_tokens: 190_000, cache_creation_input_tokens: 0 } }
  /** The status line's context figure, in a 200k window: what the trigger reads. */
  const ctx = (tokens: number): SessionUsage => usageOf(tokens, Math.round(tokens / 2_000))

  test('fires once when 5% or less of the window is left: detached fork, file written, band keeps it', async ($, on) => {
    const { world, clock } = worldOf(on, ctx(191_000))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(0)

    expect(world.forks).toBe(1)
    expect(world.forkRequests[0]?.prompt).toContain('nearly full (4.5% left)')
    expect(world.forkRequests[0]?.effort).toBeUndefined()
    expect(world.writes.map(w => w.path)).toEqual([PATH])
    expect(world.writes[0]?.text).toContain('at 95.5% context used')
    expect(world.toasts).toContain(`last-chance handoff saved: ${PATH}`)

    // Unlike the idle note, it stays across turns while the context is still nearly full.
    world.usage = ctx(195_000)
    await runTurn($, clock, WARM)
    await clock.advance(0)
    expect(world.forks).toBe(1)
    expect((await bandText($)).weather).toContain(`last-chance handoff: ${PATH}`)
  })

  test('mid-turn: a long autonomous turn that crosses the line hands off before the turn ends', async ($, on) => {
    const { world, clock } = worldOf(on, ctx(150_000))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await $.turn.start({ text: 'run all night', turnId: 'long' })

    for (const [index, tokens] of [150_000, 185_000, 192_000].entries()) {
      world.usage = ctx(tokens)

      for await (const chunk of $.turn.step({ turnId: 'long', index, model: 'claude-opus-5-5', messageCount: 3 + index })) {
        void chunk
      }

      await clock.advance(0)
    }

    expect(world.forks).toBe(1)
    expect(world.writes.map(w => w.path)).toEqual([PATH])
  })

  test('more than 5% left: no fork', async ($, on) => {
    const { world, clock } = worldOf(on, ctx(180_000))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(0)

    expect(world.forks).toBe(0)
  })

  test("a server-side tool loop's summed step usage does not trigger it: the status line's figure does", async ($, on) => {
    const { world, clock } = worldOf(on, ctx(96_000))
    world.fork = HANDOFF
    // Two iterations of ~96k summed into one step's usage: 192k, though the window holds 96k.
    stepsAnswer(on, () => ({ input_tokens: 1_000, output_tokens: 1_000, cache_read_input_tokens: 190_000, cache_creation_input_tokens: 0 }))
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(0)

    expect(world.forks).toBe(0)
  })

  test('the context dropping back (a /clear) clears the note at the next response and re-arms it', async ($, on) => {
    const { world, clock } = worldOf(on, ctx(191_000))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(0)
    world.usage = ctx(20_000)
    await runTurn($, clock, WARM)
    await clock.advance(0)
    expect((await bandText($)).weather).not.toContain('last-chance')

    world.usage = ctx(192_000)
    await runTurn($, clock, WARM)
    await clock.advance(0)
    expect(world.forks).toBe(2)
  })

  test('a failed fork is not retried on every request, and the band keeps why', async ($, on) => {
    const { world, clock } = worldOf(on, ctx(191_000))
    world.fork = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: ZERO_USAGE }
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(0)
    world.usage = ctx(193_000)
    await runTurn($, clock, WARM)
    await clock.advance(0)

    expect(world.forks).toBe(1)
    expect(world.toasts).toContain('last-chance handoff failed: API error 529 (overloaded)')
    expect((await bandText($)).weather).toContain('no last-chance handoff: API error 529 (overloaded)')
  })

  test('pending while the fork runs; requests meanwhile do not fork again', async ($, on) => {
    const { world, clock } = worldOf(on, ctx(191_000))
    world.fork = HANDOFF
    let release = () => {}
    world.gate = new Promise(resolve => {
      release = resolve
    })
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(0)
    expect((await bandText($)).weather).toContain('writing last-chance handoff')

    world.usage = ctx(193_000)
    await runTurn($, clock, WARM)
    await clock.advance(0)
    expect(world.forks).toBe(1)

    release()
    world.gate = null
    await clock.advance(0)
    expect((await bandText($)).weather).toContain(`last-chance handoff: ${PATH}`)
  })

  test('an engine call that throws settles the band instead of staying on "writing…"', async ($, on) => {
    const { world, clock } = worldOf(on, ctx(191_000))
    world.fork = HANDOFF
    world.isSessionIdBroken = true
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(0)

    const { weather } = await bandText($)
    expect(weather).toContain('no last-chance handoff:')
    expect(weather).not.toContain('writing')
  })

  test('headless: no fork', async ($, on) => {
    const { world, clock } = worldOf(on, ctx(191_000))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($, false)
    await runTurn($, clock, WARM)
    await clock.advance(0)

    expect(world.forks).toBe(0)
  })

  test('autoHandoff off: no fork', { options: { autoHandoff: false } }, async ($, on) => {
    const { world, clock } = worldOf(on, ctx(191_000))
    world.fork = HANDOFF
    stepsAnswer(on, () => WARM)
    await start($)
    await runTurn($, clock, WARM)
    await clock.advance(0)

    expect(world.forks).toBe(0)
  })

  test('isLowContext: at or under lowContextPercent left; 0 turns it off', async () => {
    const cfg = configOf({})

    expect(isLowContext(190_000, 200_000, cfg)).toBe(true)
    expect(isLowContext(189_999, 200_000, cfg)).toBe(false)
    expect(isLowContext(950_000, 1_000_000, cfg)).toBe(true)
    expect(isLowContext(199_000, 200_000, configOf({ lowContextPercent: 0 }))).toBe(false)
    expect(isLowContext(170_000, 200_000, configOf({ lowContextPercent: 15 }))).toBe(true)
  })
})
