import { describe, expect, test } from 'claude-code/testing'

import * as F from './fixtures'
import {
  buildRun,
  commandKind,
  cwdOf,
  historyTable,
  isTotalDrop,
  outputOf,
  parseOutput,
  sparkline,
  statusLine,
  stripAnsi,
  toastsFor,
  type Parsed,
  type TestRun,
} from './parsers'

const counts = (p: Parsed | null) => p && { runner: p.runner, pass: p.pass, fail: p.fail, skip: p.skip, total: p.total }

describe('bun', () => {
  test('real green run', () => {
    const p = parseOutput(F.BUN_GREEN_REAL)
    expect(counts(p)).toEqual({ runner: 'bun', pass: 1, fail: 0, skip: 0, total: 1 })
    expect(p?.durationMs).toBe(257)
  })
  test('green', () => {
    const p = parseOutput(F.BUN_GREEN)
    expect(counts(p)).toEqual({ runner: 'bun', pass: 120, fail: 0, skip: 0, total: 120 })
    expect(p?.durationMs).toBe(12340)
    expect(p?.failing).toEqual([])
  })
  test('red with names from (fail) and ✗ lines', () => {
    const p = parseOutput(F.BUN_RED)
    expect(counts(p)).toEqual({ runner: 'bun', pass: 117, fail: 3, skip: 0, total: 120 })
    expect(p?.failing).toEqual(['router > rejects bad token', 'router > handles 404', 'store > persists run'])
  })
  test('skipped', () => {
    expect(counts(parseOutput(F.BUN_SKIP))).toEqual({ runner: 'bun', pass: 117, fail: 0, skip: 3, total: 120 })
  })
  test('ANSI is stripped first', () => {
    const p = parseOutput(F.BUN_ANSI)
    expect(counts(p)).toEqual({ runner: 'bun', pass: 4, fail: 1, skip: 0, total: 5 })
    expect(p?.failing).toEqual(['smoke > boots'])
    expect(stripAnsi('\u001b[31mred\u001b[0m')).toBe('red')
  })
})

describe('pytest', () => {
  test('real -q green run (no === decoration)', () => {
    const p = parseOutput(F.PYTEST_GREEN_REAL)
    expect(counts(p)).toEqual({ runner: 'pytest', pass: 97, fail: 0, skip: 0, total: 97 })
    expect(p?.durationMs).toBe(97640)
  })
  test('green', () => {
    expect(counts(parseOutput(F.PYTEST_GREEN))).toEqual({ runner: 'pytest', pass: 97, fail: 0, skip: 0, total: 97 })
  })
  test('red: failed + errors, names from FAILED / ERROR lines', () => {
    const p = parseOutput(F.PYTEST_RED)
    expect(counts(p)).toEqual({ runner: 'pytest', pass: 94, fail: 3, skip: 0, total: 97 })
    expect(p?.failing).toEqual([
      'tests/test_store.py::test_upsert_dedupes',
      'tests/test_store.py::TestLinks::test_backlink',
      'tests/test_store.py::test_db_fixture',
    ])
  })
  test('skipped + xfailed count as skip, warnings ignored', () => {
    expect(counts(parseOutput(F.PYTEST_SKIP))).toEqual({ runner: 'pytest', pass: 90, fail: 0, skip: 7, total: 97 })
  })
})

describe('vitest', () => {
  test('green', () => {
    const p = parseOutput(F.VITEST_GREEN)
    expect(counts(p)).toEqual({ runner: 'vitest', pass: 42, fail: 0, skip: 0, total: 42 })
    expect(p?.durationMs).toBe(1240)
  })
  test('red with names from FAIL lines', () => {
    const p = parseOutput(F.VITEST_RED)
    expect(counts(p)).toEqual({ runner: 'vitest', pass: 40, fail: 2, skip: 0, total: 42 })
    expect(p?.failing).toEqual(['src/api.test.ts > api > returns 401 without token', 'src/api.test.ts > api > paginates'])
  })
  test('red falls back to × lines', () => {
    const p = parseOutput(F.VITEST_RED.replace(/^ FAIL .*$/gm, ''))
    expect(p?.failing).toEqual(['api > returns 401 without token', 'api > paginates'])
  })
  test('skipped', () => {
    const p = parseOutput(F.VITEST_SKIP)
    expect(counts(p)).toEqual({ runner: 'vitest', pass: 39, fail: 0, skip: 3, total: 42 })
    expect(p?.durationMs).toBe(980)
  })
})

describe('jest', () => {
  test('green', () => {
    const p = parseOutput(F.JEST_GREEN)
    expect(counts(p)).toEqual({ runner: 'jest', pass: 25, fail: 0, skip: 0, total: 25 })
    expect(p?.durationMs).toBe(1532)
  })
  test('red with names from ✕', () => {
    const p = parseOutput(F.JEST_RED)
    expect(counts(p)).toEqual({ runner: 'jest', pass: 23, fail: 2, skip: 0, total: 25 })
    expect(p?.failing).toEqual(['divides by zero', 'rounds half up'])
  })
  test('skipped + todo', () => {
    expect(counts(parseOutput(F.JEST_SKIP))).toEqual({ runner: 'jest', pass: 20, fail: 0, skip: 5, total: 25 })
  })
})

describe('cargo', () => {
  test('green sums every test result line', () => {
    const p = parseOutput(F.CARGO_GREEN)
    expect(counts(p)).toEqual({ runner: 'cargo', pass: 14, fail: 0, skip: 0, total: 14 })
    expect(p?.durationMs).toBe(320)
  })
  test('red with names from ---- stdout ----', () => {
    const p = parseOutput(F.CARGO_RED)
    expect(counts(p)).toEqual({ runner: 'cargo', pass: 10, fail: 2, skip: 0, total: 12 })
    expect(p?.failing).toEqual(['parse::tests::unicode', 'store::tests::roundtrip'])
  })
  test('ignored counts as skip', () => {
    expect(counts(parseOutput(F.CARGO_SKIP))).toEqual({ runner: 'cargo', pass: 9, fail: 0, skip: 3, total: 12 })
  })
})

describe('go', () => {
  test('green, non-verbose: ok packages', () => {
    expect(counts(parseOutput(F.GO_GREEN))).toEqual({ runner: 'go', pass: 2, fail: 0, skip: 0, total: 2 })
  })
  test('red with --- FAIL names, subtests included', () => {
    const p = parseOutput(F.GO_RED)
    expect(p?.runner).toBe('go')
    expect(p?.fail).toBe(3)
    expect(p?.failing).toEqual(['TestParseUnicode', 'TestStore', 'TestStore/roundtrip'])
  })
  test('verbose with skip', () => {
    expect(counts(parseOutput(F.GO_SKIP))).toEqual({ runner: 'go', pass: 2, fail: 0, skip: 1, total: 3 })
  })
})

describe('commands and plumbing', () => {
  test('runner commands are recognised, others ignored', () => {
    for (const cmd of [
      'bun test',
      'cd web && bun test test/smoke.test.ts',
      'uv run pytest -q -x',
      'python -m pytest tests',
      'py.test',
      'make check',
      'make test',
      'npx vitest run',
      'npx jest --ci',
      'npm test',
      'npm run test:unit',
      'pnpm test',
      'yarn test',
      'cargo test --lib',
      'go test ./...',
      'just test-all',
    ]) {
      expect(commandKind(cmd), cmd).toBe('runner')
    }
    expect(commandKind('uv run scripts/check_store.py')).toBe('script')
    for (const cmd of ['ls -la', 'git status', 'bun install', 'cat README.md', 'make build']) {
      expect(commandKind(cmd), cmd).toBeNull()
    }
  })
  test('non-test output parses to null', () => {
    expect(parseOutput(F.NOT_TESTS)).toBeNull()
    expect(parseOutput('')).toBeNull()
  })
  test('cwd follows a leading cd', () => {
    expect(cwdOf('bun test', '/a')).toBe('/a')
    expect(cwdOf('cd /b/c && bun test', '/a')).toBe('/b/c')
    expect(cwdOf('cd web && bun test', '/a')).toBe('/a/web')
  })
  test('outputOf reads stdout + stderr, an error string, or text', () => {
    expect(outputOf({ result: { stdout: 'a', stderr: 'b' }, text: 'x' })).toBe('a\nb')
    expect(outputOf({ isError: true, result: 'Exit code 1\n 2 fail', text: 'y' })).toBe('Exit code 1\n 2 fail')
    expect(outputOf({ result: undefined, text: 'z' })).toBe('z')
    expect(outputOf({ deny: 'no' })).toBe('')
  })
})

const run = (parsed: Parsed, runs: TestRun[] = [], command = 'bun test', agentId?: string) =>
  buildRun(runs, parsed, { at: 1000, command, cwd: '/w', ...(agentId !== undefined && { agentId }) })

describe('runs and deltas', () => {
  const green = parseOutput(F.BUN_GREEN) as Parsed
  const red = parseOutput(F.BUN_RED) as Parsed
  const skipped = parseOutput(F.BUN_SKIP) as Parsed

  test('newly failing, then newly fixed', () => {
    const first = run(green).run
    const second = run(red, [first])
    expect(second.prev).toBe(first)
    expect(second.run.newlyFailing).toEqual(red.failing)
    const third = run(green, [first, second.run]).run
    expect(third.newlyFixed).toEqual(red.failing)
    expect(third.newlyFailing).toEqual([])
  })
  test('skipDelta when the same command skips more', () => {
    const r = run(skipped, [run(green).run]).run
    expect(r.skipDelta).toBe(3)
    expect(r.totalDelta).toBe(0)
    expect(isTotalDrop(r)).toBe(false)
  })
  test('a different selection is not compared for skips / totals', () => {
    const r = run(skipped, [run(green).run], 'bun test test/router.test.ts').run
    expect(r.skipDelta).toBe(0)
  })
  test('total drop is flagged', () => {
    const fewer = { ...green, pass: 110, total: 110 }
    const r = run(fewer, [run(green).run]).run
    expect(r.totalDelta).toBe(-10)
    expect(isTotalDrop(r)).toBe(true)
  })
  test('agent runs are tagged and say so in toasts', () => {
    const r = run(skipped, [run(green).run], 'bun test', 'agent-1')
    expect(r.run.agentId).toBe('agent-1')
    expect(toastsFor(r.prev, r.run)).toEqual(['⚠ skip count +3 in bun (agent)'])
  })
  test('toasts on transitions', () => {
    const g = run(green).run
    const r = run(red, [g])
    expect(toastsFor(r.prev, r.run)).toEqual(['3 tests now failing: router > rejects bad token, router > handles 404, store > persists run'])
    const back = run(green, [g, r.run])
    expect(toastsFor(back.prev, back.run)).toEqual(['tests green again: 120 pass'])
    expect(toastsFor(undefined, g)).toEqual([])
  })
  test('status line, sparkline, history table', () => {
    const g = run(green).run
    const r = run(red, [g]).run
    expect(statusLine(r)).toBe('tests ✗3/120 (bun)')
    expect(statusLine(g)).toBe('tests ✓120/120 (bun)')
    expect(sparkline([g, { ...r, pass: 60, fail: 60 }, { ...r, pass: 0 }])).toBe('█▅▁')
    const table = historyTable([g, r])
    expect(table).toContain('| | runner | pass | fail | skip | total | warn | command |')
    expect(table.split('\n')[2]).toContain('| ✗ | bun | 117 | 3 |')
  })
})
