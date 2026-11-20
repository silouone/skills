import { describe, expect, mock, test } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { computeDelta, gateBadge, isMainLoop, parseNumstat, summarize } from './receipt'

const HOME = '/home/u'
const SID = 'sess-1'
const GATE_DIR = `${HOME}/.claude/logs/gate/${SID}`

type World = {
  surfaces?: readonly ('terminal' | 'desktop')[]
  /** numstat stdout per phase (`before` at turn.start, `after` at turn.complete); null = not a repo. */
  numstat?: { before: string; after: string } | null
  untracked?: { before: string; after: string }
  files?: Record<string, string>
}

type Probe = { phase: 'before' | 'after'; statuses: (string | undefined)[]; gitCalls: number; clock: MockClock }

/** Everything the engine would answer beneath the plugin, stubbed. */
const world = (on: On, w: World): Probe => {
  const probe: Probe = { phase: 'before', statuses: [], gitCalls: 0, clock: mock.clock(on) }
  const run = (exitCode: number, stdout: string) => ({
    value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  })
  mock.env(on, { HOME })
  on('session.surfaces', () => ({ value: w.surfaces ?? ['terminal'] }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.id', () => ({ value: SID }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', ($, e) => {
    probe.statuses.push(e.text)
    return { value: undefined }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {} as never, text: 'ok' }))
  on('fs.exists', ($, e) => ({ value: w.files?.[e.path] !== undefined }))
  on('fs.read', ($, e) => {
    const text = w.files?.[e.path]
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('process.run', ($, e) => {
    probe.gitCalls += 1
    if (w.numstat === null || w.numstat === undefined) return run(128, '')
    if (e.argv.includes('diff')) return run(0, w.numstat[probe.phase])
    return run(0, w.untracked?.[probe.phase] ?? '')
  })
  return probe
}

const complete = (agentId?: string) => ({
  answer: '',
  durationMs: 14_000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  ...(agentId ? { agentId } : {}),
})

describe('turn receipt', () => {
  test('main-loop calls are listed in the style format, as a system notice', async ($, on) => {
    const probe = world(on, { numstat: null })
    const session = mock.session(on)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: '/a/b/settings.json' })
    await $.tool.call({ tool: 'Bash', command: 'git status --short' })
    probe.phase = 'after'
    await $.turn.complete(complete())

    const rows = session.appended()
    expect(rows.length).toBe(1)
    const row = rows[0]!
    expect(row.message.type).toBe('system')
    const block = row.message.content[0] as unknown as { type: string; text: string }
    expect(block.type).toBe('text')
    expect(block.text).toBe(
      ['── turn receipt ── 14s · 2 tool calls', 'Read({ file_path: "settings.json" })', 'Bash({ command: "git status --short" })'].join('\n'),
    )
  })

  test('no repository → tool list only, no diff line', async ($, on) => {
    world(on, { numstat: null })
    const session = mock.session(on)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: 'x.ts' })
    await $.turn.complete(complete())
    const text = (session.appended()[0]!.message.content[0] as unknown as { text: string }).text
    expect(text).not.toContain('diff this turn')
    expect(text).toContain('Read({ file_path: "x.ts" })')
  })

  test('delta excludes pre-existing working-tree changes', async ($, on) => {
    const probe = world(on, {
      numstat: {
        before: '5\t1\tREADME.md\n2\t0\tuntouched.ts\n',
        after: '15\t1\tREADME.md\n2\t0\tuntouched.ts\n42\t3\thooks/x.py\n',
      },
      untracked: { before: '?? old.txt\n', after: '?? old.txt\n?? mods/y/plugin.json\n' },
    })
    const session = mock.session(on)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/r/hooks/x.py', old_string: 'a', new_string: 'b' })
    probe.phase = 'after'
    await $.turn.complete(complete())
    const text = (session.appended()[0]!.message.content[0] as unknown as { text: string }).text
    expect(text).toContain('diff this turn: README.md +10 −0 · hooks/x.py +42 −3 · (new) mods/y/plugin.json')
    expect(text).not.toContain('untouched.ts')
    expect(text).not.toContain('old.txt')
  })

  test('a delta alone (no tool calls) still makes a receipt', async ($, on) => {
    const probe = world(on, { numstat: { before: '', after: '1\t0\ta.md\n' } })
    const session = mock.session(on)
    await $.turn.start({ text: 'go', turnId: 't1' })
    probe.phase = 'after'
    await $.turn.complete(complete())
    const text = (session.appended()[0]!.message.content[0] as unknown as { text: string }).text
    expect(text).toContain('0 tool calls')
    expect(text).toContain('a.md +1 −0')
  })

  test('empty turn (no calls, no delta) → nothing appended', async ($, on) => {
    const probe = world(on, { numstat: { before: '1\t0\ta.md\n', after: '1\t0\ta.md\n' } })
    const session = mock.session(on)
    await $.turn.start({ text: 'hi', turnId: 't1' })
    probe.phase = 'after'
    await $.turn.complete(complete())
    expect(session.appended().length).toBe(0)
  })

  test('a subagent turn completion emits no receipt', async ($, on) => {
    world(on, { numstat: null })
    const session = mock.session(on)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: 'x.ts' })
    await $.turn.start({ text: 'sub', turnId: 's1', agentId: 'agent-1' })
    await $.turn.complete(complete('agent-1'))
    expect(session.appended().length).toBe(0)
    await $.turn.complete(complete())
    expect(session.appended().length).toBe(1)
  })

  test('reset between turns: turn 2 lists only its own calls', async ($, on) => {
    world(on, { numstat: null })
    const session = mock.session(on)
    await $.turn.start({ text: 'one', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: 'one.ts' })
    await $.turn.complete(complete())
    await $.turn.start({ text: 'two', turnId: 't2' })
    await $.tool.call({ tool: 'Read', file_path: 'two.ts' })
    await $.turn.complete(complete())
    const second = (session.appended()[1]!.message.content[0] as unknown as { text: string }).text
    expect(second).toContain('two.ts')
    expect(second).not.toContain('one.ts')
  })

  test('/receipt returns the last receipt', async ($, on) => {
    world(on, { numstat: null })
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.tool.call({ tool: 'WebSearch', query: 'TODO', mode: 'standard' })
    await $.turn.complete(complete())
    const out = await $.command.run({
      command: 'receipt',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 80 },
    })
    expect(out.text).toContain('WebSearch({ query: "TODO" })')
  })

  test('headless (no surface) → no git, no append, no status', async ($, on) => {
    const probe = world(on, { surfaces: [], numstat: { before: '', after: '1\t0\ta.md\n' } })
    const session = mock.session(on)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: 'x.ts' })
    probe.phase = 'after'
    await $.turn.complete(complete())
    expect(session.appended().length).toBe(0)
    expect(probe.gitCalls).toBe(0)
    expect(probe.statuses.length).toBe(0)
  })
})

describe('collector (pure)', () => {
  test('subagent tool calls are excluded, main-loop ones kept', () => {
    // $.tool.call in the kit drops agentId, so the loop filter is proven on the pure predicate.
    expect(isMainLoop({})).toBe(true)
    expect(isMainLoop({ agentId: 'agent-1' })).toBe(false)
  })

  test('summaries follow the output style', () => {
    expect(summarize('Agent', { subagent_type: 'builder', description: 'Build it', prompt: 'long…' })).toBe(
      'Agent({ subagent_type: "builder", description: "Build it" })',
    )
    expect(summarize('Bash', { command: 'x'.repeat(80) })).toBe(`Bash({ command: "${'x'.repeat(60)}…" })`)
    expect(summarize('TodoWrite', { todos: [] })).toBe('TodoWrite({})')
    expect(summarize('Edit', { file_path: '/a/b.ts', old_string: 'q', new_string: 'r', agentId: 'z' })).toBe(
      'Edit({ file_path: "b.ts" })',
    )
  })

  test('a newly changed binary file is reported', () => {
    const before = { numstat: parseNumstat('-\t-\timg.png\n4\t0\ta.ts\n'), untracked: [] }
    const after = { numstat: parseNumstat('-\t-\timg.png\n4\t0\ta.ts\n-\t-\tnew.png\n'), untracked: [] }
    expect(computeDelta(before, after)).toEqual([{ path: 'new.png', kind: 'binary' }])
  })
})

describe('gate badge', () => {
  test('pending gate → status with fails/cap', async ($, on) => {
    const probe = world(on, {
      numstat: null,
      files: { [`${GATE_DIR}/gate.py`]: '#!/usr/bin/env python', [`${GATE_DIR}/meta.json`]: '{"request":"x","fails":2}' },
    })
    await $.turn.start({ text: 'go', turnId: 't1' })
    expect(probe.statuses.at(-1)).toBe('gate: pending (fails 2/5)')
  })

  test('no gate → status cleared', async ($, on) => {
    const probe = world(on, { numstat: null })
    await $.turn.start({ text: 'go', turnId: 't1' })
    expect(probe.statuses.length).toBeGreaterThan(0)
    expect(probe.statuses.at(-1)).toBeUndefined()
  })

  test('malformed meta → no badge, no error', async ($, on) => {
    const probe = world(on, {
      numstat: null,
      files: { [`${GATE_DIR}/gate.py`]: '', [`${GATE_DIR}/meta.json`]: '{not json' },
    })
    await $.turn.start({ text: 'go', turnId: 't1' })
    expect(probe.statuses.at(-1)).toBeUndefined()
  })

  test('refreshes on the 30s timer', async ($, on) => {
    const files: Record<string, string> = {}
    const probe = world(on, { numstat: null, files })
    await $.turn.start({ text: 'go', turnId: 't1' })
    expect(probe.statuses.at(-1)).toBeUndefined()
    files[`${GATE_DIR}/gate.py`] = ''
    files[`${GATE_DIR}/meta.json`] = '{"request":"x","fails":0}'
    await probe.clock.advance(30_000)
    expect(probe.statuses.at(-1)).toBe('gate: pending (fails 0/5)')
  })

  test('pure: missing pieces and odd shapes yield no badge', () => {
    expect(gateBadge(false, '{"fails":1}')).toBeUndefined()
    expect(gateBadge(true, null)).toBeUndefined()
    expect(gateBadge(true, '[]')).toBeUndefined()
    expect(gateBadge(true, '{"fails":"2"}')).toBeUndefined()
  })
})
