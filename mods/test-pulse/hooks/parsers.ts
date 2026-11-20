// Pure parsing and formatting for test-pulse. No `$`, no side effects:
// everything here is exported for the tests and called by register.tsx.

import type { ToolCallResult } from 'claude-code'

import type { TestPulseRun } from '../types'

export type TestRun = TestPulseRun
export type Runner = TestPulseRun['runner']

export type Parsed = {
  runner: Runner
  pass: number
  fail: number
  skip: number
  total: number
  durationMs?: number
  failing: string[]
}

export const MAX_RUNS = 50
export const MAX_FAILING = 30
export const COMMAND_CHARS = 80

// ---------------------------------------------------------------- input

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g

export const stripAnsi = (text: string): string =>
  text.replace(ANSI, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

const RUNNER_COMMANDS: readonly RegExp[] = [
  /\bbun\s+(?:run\s+)?test\b/,
  /\b(?:pytest|py\.test)\b/,
  /\bvitest\b/,
  /\bjest\b/,
  /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test/,
  /\bcargo\s+test\b/,
  /\bgo\s+test\b/,
  /\bmake\s+(?:check|test)\b/,
  /\bjust\s+test/,
]

const UV_SCRIPT = /\buv\s+run\b[^|;&]*\.py\b/

/**
 * `runner` for a known test command, `script` for `uv run <x>.py` (kept only
 * when its output parses as pytest), null for anything else.
 */
export const commandKind = (command: string): 'runner' | 'script' | null => {
  if (RUNNER_COMMANDS.some(re => re.test(command))) return 'runner'
  if (UV_SCRIPT.test(command)) return 'script'
  return null
}

/** The directory a leading `cd <dir> &&` moves to, else the session's. */
export const cwdOf = (command: string, sessionCwd: string): string => {
  const m = command.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*&&/)
  const dir = m?.[1] ?? m?.[2] ?? m?.[3]
  if (dir === undefined) return sessionCwd
  if (dir.startsWith('/') || dir.startsWith('~')) return dir.replace(/\/+$/, '')
  return `${sessionCwd.replace(/\/+$/, '')}/${dir.replace(/^\.\//, '').replace(/\/+$/, '')}`
}

/** The text a Bash result carries: stdout + stderr when typed, else what the model read. */
export const outputOf = (ran: ToolCallResult): string => {
  if (ran.deny !== undefined) return ''
  const result = ran.result as { stdout?: unknown; stderr?: unknown } | string | undefined
  if (typeof result === 'object' && result !== null) {
    const parts = [result.stdout, result.stderr].filter((p): p is string => typeof p === 'string' && p.length > 0)
    if (parts.length > 0) return parts.join('\n')
  }
  if (typeof result === 'string' && result.length > 0) return result
  return ran.text ?? ''
}

// ---------------------------------------------------------------- parsers

const num = (text: string, re: RegExp): number | undefined => {
  const m = text.match(re)
  return m?.[1] === undefined ? undefined : Number(m[1])
}

const toMs = (value: string, unit: string): number =>
  Math.round(Number(value) * (unit === 'ms' ? 1 : 1000))

const uniq = (names: readonly string[]): string[] =>
  [...new Set(names.map(n => n.trim()).filter(n => n.length > 0))].slice(0, MAX_FAILING)

const matchAll = (text: string, re: RegExp): string[] =>
  [...text.matchAll(re)].map(m => m[1] ?? '')

const withDuration = (parsed: Omit<Parsed, 'durationMs'>, durationMs: number | undefined): Parsed =>
  durationMs === undefined ? parsed : { ...parsed, durationMs }

export const parseBun = (text: string): Parsed | null => {
  const pass = num(text, /^\s*(\d+) pass\s*$/m)
  const fail = num(text, /^\s*(\d+) fail\s*$/m)
  const skip = num(text, /^\s*(\d+) skip\s*$/m) ?? 0
  const ran = text.match(/Ran (\d+) tests? across \d+ files?\.(?:\s*\[([\d.]+)(ms|s)\])?/)
  if (ran === null && (pass === undefined || fail === undefined)) return null
  const p = pass ?? 0
  const f = fail ?? 0
  const failing = matchAll(text, /^\s*(?:\(fail\)|✗)\s+(.+?)(?:\s+\[[\d.]+m?s\])?\s*$/gm)
  return withDuration(
    { runner: 'bun', pass: p, fail: f, skip, total: ran?.[1] !== undefined ? Number(ran[1]) : p + f + skip, failing: uniq(failing) },
    ran?.[2] !== undefined && ran[3] !== undefined ? toMs(ran[2], ran[3]) : undefined,
  )
}

const PYTEST_WORDS = /(\d+) (passed|failed|skipped|xfailed|xpassed|errors?|deselected|warnings?|rerun)\b/g

export const parsePytest = (text: string): Parsed | null => {
  const line = text
    .split('\n')
    .reverse()
    .find(l => /\b\d+ (?:passed|failed|errors?|skipped|xfailed|xpassed)\b/.test(l) && /\bin [\d.]+s\b/.test(l))
  if (line === undefined) return null
  const count: Record<string, number> = {}
  for (const m of line.matchAll(PYTEST_WORDS)) {
    const word = (m[2] ?? '').replace(/^errors$/, 'error')
    count[word] = (count[word] ?? 0) + Number(m[1])
  }
  const pass = (count['passed'] ?? 0) + (count['xpassed'] ?? 0)
  const fail = (count['failed'] ?? 0) + (count['error'] ?? 0)
  const skip = (count['skipped'] ?? 0) + (count['xfailed'] ?? 0)
  const failing = matchAll(text, /^(?:FAILED|ERROR) (\S+)/gm)
  return withDuration(
    { runner: 'pytest', pass, fail, skip, total: pass + fail + skip, failing: uniq(failing) },
    ((m) => (m?.[1] === undefined ? undefined : toMs(m[1], 's')))(line.match(/\bin ([\d.]+)s\b/)),
  )
}

const countsOf = (parts: string): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const m of parts.matchAll(/(\d+) (passed|failed|skipped|todo|total)\b/g)) {
    out[m[2] ?? ''] = Number(m[1])
  }
  return out
}

export const parseVitest = (text: string): Parsed | null => {
  const m = text.match(/^\s*Tests\s{2,}(\d+ (?:passed|failed|skipped|todo).*?)\s*(?:\((\d+)\))?\s*$/m)
  if (m?.[1] === undefined) return null
  const c = countsOf(m[1])
  const pass = c['passed'] ?? 0
  const fail = c['failed'] ?? 0
  const skip = (c['skipped'] ?? 0) + (c['todo'] ?? 0)
  const fromFail = matchAll(text, /^\s*FAIL\s+(.+?\s>\s.+?)\s*$/gm)
  const fromCross = matchAll(text, /^\s*[×✗]\s+(.+?)(?:\s+\d+m?s)?\s*$/gm)
  const duration = text.match(/^\s*Duration\s+([\d.]+)(ms|s)\b/m)
  return withDuration(
    {
      runner: 'vitest',
      pass,
      fail,
      skip,
      total: m[2] !== undefined ? Number(m[2]) : pass + fail + skip,
      failing: uniq(fromFail.length > 0 ? fromFail : fromCross),
    },
    duration?.[1] !== undefined && duration[2] !== undefined ? toMs(duration[1], duration[2]) : undefined,
  )
}

export const parseJest = (text: string): Parsed | null => {
  const m = text.match(/^Tests:\s+(.+)$/m)
  if (m?.[1] === undefined) return null
  const c = countsOf(m[1])
  const pass = c['passed'] ?? 0
  const fail = c['failed'] ?? 0
  const skip = (c['skipped'] ?? 0) + (c['todo'] ?? 0)
  const failing = matchAll(text, /^\s*✕\s+(.+?)(?:\s+\(\d+(?:\.\d+)?\s*m?s\))?\s*$/gm)
  const time = text.match(/^Time:\s+([\d.]+)\s*(ms|s)\b/m)
  return withDuration(
    { runner: 'jest', pass, fail, skip, total: c['total'] ?? pass + fail + skip, failing: uniq(failing) },
    time?.[1] !== undefined && time[2] !== undefined ? toMs(time[1], time[2]) : undefined,
  )
}

export const parseCargo = (text: string): Parsed | null => {
  const results = [
    ...text.matchAll(/test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored;[^\n]*?(?:finished in ([\d.]+)s)?$/gm),
  ]
  if (results.length === 0) return null
  const sum = (i: number) => results.reduce((acc, r) => acc + Number(r[i] ?? 0), 0)
  const pass = sum(1)
  const fail = sum(2)
  const skip = sum(3)
  const seconds = results.reduce((acc, r) => acc + Number(r[4] ?? 0), 0)
  return withDuration(
    { runner: 'cargo', pass, fail, skip, total: pass + fail + skip, failing: uniq(matchAll(text, /^---- (.+?) stdout ----$/gm)) },
    results.some(r => r[4] !== undefined) ? toMs(String(seconds), 's') : undefined,
  )
}

/**
 * Verbose output (`--- PASS:` lines) counts tests. Without `-v` only failures
 * print per test, so passes are counted as `ok` packages.
 */
export const parseGo = (text: string): Parsed | null => {
  const passT = (text.match(/^\s*--- PASS: /gm) ?? []).length
  const skipT = (text.match(/^\s*--- SKIP: /gm) ?? []).length
  const failing = matchAll(text, /^\s*--- FAIL: (\S+)/gm)
  const okPkgs = (text.match(/^ok\s+\S+\s+(?:\(cached\)|[\d.]+s)/gm) ?? []).length
  const failPkgs = (text.match(/^FAIL\s+\S+\s+(?:[\d.]+s|\[[^\]]+\])/gm) ?? []).length
  if (passT + skipT + failing.length + okPkgs + failPkgs === 0) return null
  const isVerbose = passT + skipT > 0
  const pass = isVerbose ? passT : okPkgs
  const fail = failing.length > 0 ? failing.length : failPkgs
  const skip = skipT
  return { runner: 'go', pass, fail, skip, total: pass + fail + skip, failing: uniq(failing) }
}

// Most distinctive first: jest's `Tests:` line before vitest's `Tests  `, bun's
// bare `N pass` before pytest's summary.
const PARSERS = [parseCargo, parseGo, parseJest, parseVitest, parseBun, parsePytest] as const

/** Strips ANSI, then the first parser that recognises the output wins; null when none does. */
export const parseOutput = (raw: string): Parsed | null => {
  const text = stripAnsi(raw)
  for (const parse of PARSERS) {
    const parsed = parse(text)
    if (parsed !== null) return parsed
  }
  return null
}

// ---------------------------------------------------------------- runs

export const previousRun = (runs: readonly TestRun[], runner: Runner, cwd: string): TestRun | undefined =>
  [...runs].reverse().find(r => r.runner === runner && r.cwd === cwd)

/**
 * Differences against the previous run of the same runner in the same cwd.
 * Skip and total deltas are only compared when the command is identical: a
 * different selection (`bun test a.test.ts` vs `bun test`) changes counts
 * legitimately and would raise false weakening warnings.
 */
export const compare = (
  prev: TestRun | undefined,
  cur: Pick<TestRun, 'command' | 'failing' | 'skip' | 'total'>,
): Pick<TestRun, 'newlyFailing' | 'newlyFixed' | 'skipDelta' | 'totalDelta'> => {
  if (prev === undefined) return { newlyFailing: [...cur.failing], newlyFixed: [], skipDelta: 0, totalDelta: 0 }
  const isSameSelection = prev.command === cur.command
  return {
    newlyFailing: cur.failing.filter(n => !prev.failing.includes(n)),
    newlyFixed: prev.failing.filter(n => !cur.failing.includes(n)),
    skipDelta: isSameSelection ? cur.skip - prev.skip : 0,
    totalDelta: isSameSelection ? cur.total - prev.total : 0,
  }
}

export const buildRun = (
  runs: readonly TestRun[],
  parsed: Parsed,
  meta: { at: number; command: string; cwd: string; agentId?: string },
): { run: TestRun; prev: TestRun | undefined } => {
  const prev = previousRun(runs, parsed.runner, meta.cwd)
  const command = meta.command.trim().replace(/\s+/g, ' ').slice(0, COMMAND_CHARS)
  const base = {
    at: meta.at,
    runner: parsed.runner,
    command,
    cwd: meta.cwd,
    pass: parsed.pass,
    fail: parsed.fail,
    skip: parsed.skip,
    total: parsed.total,
    failing: parsed.failing.slice(0, MAX_FAILING),
    ...(parsed.durationMs !== undefined && { durationMs: parsed.durationMs }),
    ...(meta.agentId !== undefined && { agentId: meta.agentId }),
  }
  return { run: { ...base, ...compare(prev, base) }, prev }
}

export const appendRun = (runs: readonly TestRun[], run: TestRun): TestRun[] => [...runs, run].slice(-MAX_RUNS)

/** Total dropped with no skip change accounting for it: tests deleted or no longer collected. */
export const isTotalDrop = (run: TestRun): boolean => run.totalDelta <= -1 && run.skipDelta + run.totalDelta !== 0

// ---------------------------------------------------------------- text

const agentTag = (run: TestRun): string => (run.agentId !== undefined ? ' (agent)' : '')

export const statusLine = (run: TestRun): string =>
  run.fail > 0 ? `tests ✗${run.fail}/${run.total} (${run.runner})` : `tests ✓${run.pass}/${run.total} (${run.runner})`

export const headline = (run: TestRun): string => {
  const skip = run.skip > 0 ? ` · ${run.skip} skip` : ''
  return run.fail > 0 ? `✗ ${run.fail} fail · ${run.pass} pass${skip}` : `✓ ${run.pass} pass${skip}`
}

const listNames = (names: readonly string[], max = 3): string =>
  names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} +${names.length - max} more`

/** The toasts one run raises, given the previous run it is compared with. */
export const toastsFor = (prev: TestRun | undefined, run: TestRun): string[] => {
  const out: string[] = []
  const tag = agentTag(run)
  if (prev !== undefined && prev.fail > 0 && run.fail === 0) out.push(`tests green again: ${run.pass} pass${tag}`)
  if (prev !== undefined && prev.fail === 0 && run.fail > 0) {
    const names = run.failing.length > 0 ? `: ${listNames(run.failing)}` : ''
    out.push(`${run.fail} tests now failing${names}${tag}`)
  }
  if (run.skipDelta > 0) out.push(`⚠ skip count +${run.skipDelta} in ${run.runner}${tag}`)
  return out
}

export const relativeTime = (at: number, now: number): string => {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

const BARS = '▁▂▃▅▆▇█'

/** One glyph per run (last 20) on pass / (pass + fail). */
export const sparkline = (runs: readonly TestRun[]): string =>
  runs
    .slice(-20)
    .map(r => {
      const ran = r.pass + r.fail
      const ratio = ran === 0 ? 0 : r.pass / ran
      return BARS[Math.round(ratio * (BARS.length - 1))] ?? BARS[0]
    })
    .join('')

export const truncate = (text: string, columns: number): string =>
  columns <= 0 ? '' : text.length <= columns ? text : `${text.slice(0, Math.max(0, columns - 1))}…`

const formatDuration = (ms: number | undefined): string =>
  ms === undefined ? '' : ms < 1000 ? ` in ${ms}ms` : ` in ${(ms / 1000).toFixed(2)}s`

/** Markdown summary of the last run, for `/tests` with no surface. */
export const summaryMarkdown = (runs: readonly TestRun[], now: number): string => {
  const run = runs[runs.length - 1]
  if (run === undefined) return 'No test runs recorded yet in this session.'
  const lines = [
    `**${headline(run)}** (${run.runner}${agentTag(run)}, ${relativeTime(run.at, now)}${formatDuration(run.durationMs)})`,
    '',
    `\`${run.command}\` in \`${run.cwd}\``,
  ]
  if (run.newlyFailing.length > 0) lines.push('', `Newly failing: ${run.newlyFailing.join(', ')}`)
  if (run.newlyFixed.length > 0) lines.push('', `Newly fixed: ${run.newlyFixed.join(', ')}`)
  if (run.skipDelta > 0) lines.push('', `⚠ skips +${run.skipDelta} (possible test weakening)`)
  if (isTotalDrop(run)) lines.push('', `⚠ tests −${-run.totalDelta}`)
  if (run.failing.length > 0) lines.push('', 'Failing:', ...run.failing.map(n => `- ${n}`))
  lines.push('', historyTable(runs.slice(-5)))
  return lines.join('\n')
}

/** Markdown table of the last 20 runs, newest first. */
export const historyTable = (runs: readonly TestRun[]): string => {
  if (runs.length === 0) return 'No test runs recorded yet in this session.'
  const rows = runs
    .slice(-20)
    .reverse()
    .map(r => {
      const warn = [r.skipDelta > 0 ? `skip +${r.skipDelta}` : '', isTotalDrop(r) ? `total ${r.totalDelta}` : ''].filter(Boolean).join(' ')
      return `| ${r.fail > 0 ? '✗' : '✓'} | ${r.runner}${agentTag(r)} | ${r.pass} | ${r.fail} | ${r.skip} | ${r.total} | ${warn ? `⚠ ${warn}` : ''} | \`${r.command.replace(/\|/g, '\\|')}\` |`
    })
  return ['| | runner | pass | fail | skip | total | warn | command |', '|---|---|---|---|---|---|---|---|', ...rows].join('\n')
}
