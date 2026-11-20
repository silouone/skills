import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, RenderInput, SessionStartInput } from 'claude-code'

import * as F from './fixtures'

const PLUGIN = 'test-pulse'
const SESSION: SessionStartInput = { surface: 'terminal', isInteractive: true, cwd: '/w' }

type World = {
  toasts: string[]
  statuses: (string | undefined)[]
  opened: string[]
  copied: string[]
  /** What the next Bash call prints. */
  output: string
}

function worldOf(on: On, surfaces: readonly ('terminal' | 'desktop')[] = ['terminal']): World {
  const world: World = { toasts: [], statuses: [], opened: [], copied: [], output: '' }
  mock.clock(on, { now: 1_000_000 })
  on('session.start', () => ({ cwd: '/w' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  on('session.cwd', () => ({ value: '/w' }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('ui.status', ($, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    world.opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.copy', ($, e) => {
    world.copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('tool.call', () => ({
    result: { stdout: '', stderr: world.output, interrupted: false },
    text: world.output,
  }))
  return world
}

const bash = async ($: { tool: { call: (input: never) => Promise<unknown> } }, world: World, command: string, output: string) => {
  world.output = output
  await $.tool.call({ tool: 'Bash', command } as never)
}

const command = (args = '') => ({
  command: 'tests',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 180 },
})

const pane = (surface: 'terminal' | 'desktop'): RenderInput<'Pane'> =>
  ({
    component: 'Pane',
    surface,
    requestId: 'tests',
    viewport: { columns: 180, rows: 48, isFullscreen: true },
    props: { title: 'Tests', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as RenderInput<'Pane'>

const HINT_FULLSCREEN = {
  component: 'PromptHint',
  surface: 'terminal',
  requestId: 'hint',
  viewport: { columns: 180, rows: 48, isFullscreen: true },
  props: { isDraft: false, isWorking: false, hint: '' },
} as RenderInput<'PromptHint'>

describe('recording', () => {
  test('a test run sets the status; non-runner commands are ignored', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    await bash($, world, 'ls -la', F.BUN_GREEN)
    expect(world.statuses).toEqual([])
    await bash($, world, 'bun test', F.BUN_RED)
    expect(world.statuses).toEqual(['tests ✗3/120 (bun)'])
  })

  test('toasts on green→red, red→green and skip increase', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    await bash($, world, 'bun test', F.BUN_GREEN)
    expect(world.toasts).toEqual([])
    await bash($, world, 'bun test', F.BUN_RED)
    expect(world.toasts).toEqual(['3 tests now failing: router > rejects bad token, router > handles 404, store > persists run'])
    await bash($, world, 'bun test', F.BUN_GREEN)
    expect(world.toasts.at(-1)).toBe('tests green again: 120 pass')
    await bash($, world, 'bun test', F.BUN_SKIP)
    expect(world.toasts.at(-1)).toBe('⚠ skip count +3 in bun')
  })

  test('headless: records only, no status / toast / pane; /tests answers markdown', async ($, on) => {
    const world = worldOf(on, [])
    await $.session.start(SESSION)
    await bash($, world, 'uv run pytest -q', F.PYTEST_GREEN)
    await bash($, world, 'uv run pytest -q', F.PYTEST_RED)
    expect(world.statuses).toEqual([])
    expect(world.toasts).toEqual([])
    expect(world.opened).toEqual([])
    const out = await $.command.run(command())
    expect(out.text).toContain('**✗ 3 fail · 94 pass** (pytest')
    expect(out.text).toContain('Newly failing: tests/test_store.py::test_upsert_dedupes')
    expect(out.text).toContain('| | runner | pass | fail |')
  })

  test('/tests history is a table of runs, newest first', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    await bash($, world, 'cargo test', F.CARGO_GREEN)
    await bash($, world, 'cargo test', F.CARGO_RED)
    const out = await $.command.run(command('history'))
    const lines = (out.text ?? '').split('\n')
    expect(lines[0]).toBe('| | runner | pass | fail | skip | total | warn | command |')
    expect(lines[2]).toContain('| ✗ | cargo | 10 | 2 |')
    expect(lines[3]).toContain('| ✓ | cargo | 14 | 0 |')
  })

  test('/tests with a surface opens the pane', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    const out = await $.command.run(command())
    expect(out.text).toBe('Tests pane opened.')
    expect(world.opened).toEqual(['tests'])
  })

  test('auto-opens once on the first red run under fullscreen', async ($, on) => {
    const world = worldOf(on)
    on('ui.render', () => ({ type: 'Text', children: [''] }))
    await $.session.start(SESSION)
    await bash($, world, 'bun test', F.BUN_RED)
    expect(world.opened, 'layout unknown: no unasked open').toEqual([])
    await $.ui.render(HINT_FULLSCREEN)
    await bash($, world, 'bun test', F.BUN_RED)
    expect(world.opened).toEqual(['tests'])
    await bash($, world, 'bun test', F.BUN_RED)
    expect(world.opened).toEqual(['tests'])
  })
})

describe('pane', () => {
  test('renders on terminal and desktop: headline, newly failing, skips warning, buttons', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    await bash($, world, 'bun test', F.BUN_SKIP)
    await bash($, world, 'bun test', F.BUN_RED.replace(' 3 fail', ' 3 fail\n 5 skip'))

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: PLUGIN, ...pane(surface) })
      expect((await ui.find({ type: 'Text', text: /^[✓✗] / }))?.text).toBe('✗ 3 fail · 117 pass · 5 skip')
      expect(await ui.find({ type: 'Text', text: 'newly failing' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /router > handles 404/ })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /^skips \+/ }))?.text).toBe('skips +2 ⚠ (possible test weakening)')
      expect((await ui.find({ type: 'Text', text: /^trend / }))?.text).toMatch(/^trend [▁▂▃▅▆▇█]{2}$/)
      await ui.press({ key: 'copy' })
      expect(world.copied.at(-1)).toBe('router > rejects bad token\nrouter > handles 404\nstore > persists run')
      await ui.unmount()
    }
  })

  test('clear empties the runs', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    await bash($, world, 'bun test', F.BUN_GREEN)
    const ui = await $.ui.mount({ plugin: PLUGIN, ...pane('terminal') })
    expect((await ui.find({ type: 'Text', text: /^[✓✗] / }))?.text).toBe('✓ 120 pass')
    await ui.press({ key: 'clear' })
    expect(await ui.find({ type: 'Text', text: /No test runs yet/ })).toBeDefined()
    expect(world.statuses.at(-1)).toBeUndefined()
  })
})
