// Pure helpers for the turn receipt and the gate badge: no `$`, no I/O.

export type Snapshot = {
  /** numstat line per path: `"<added>\t<removed>"` (`-\t-` for binary). */
  numstat: Readonly<Record<string, string>>
  /** Untracked paths (`git status --porcelain -uall`, `?? ` lines). */
  untracked: readonly string[]
}

export type DeltaEntry =
  | { path: string; kind: 'changed'; added: number; removed: number }
  | { path: string; kind: 'binary' }
  | { path: string; kind: 'new' }

const RESERVED = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent'])
const PREFERRED = [
  'subagent_type',
  'description',
  'file_path',
  'notebook_path',
  'command',
  'pattern',
  'path',
  'url',
  'query',
  'skill',
]
const BASENAME_KEYS = new Set(['file_path', 'notebook_path'])
const MAX_VALUE = 60
const MAX_DELTA_ENTRIES = 12

/** A tool call belongs to the main loop when it carries no `agentId`. */
export const isMainLoop = (e: { agentId?: string }): boolean => e.agentId === undefined

const basename = (p: string): string => p.split('/').filter(Boolean).pop() ?? p

const clip = (s: string): string => {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_VALUE ? `${flat.slice(0, MAX_VALUE)}…` : flat
}

/**
 * One line in the output style's listing: `Read({ file_path: "x.ts" })`,
 * `Agent({ subagent_type: "…", description: "…" })`. Up to two preferred
 * string arguments, else the first string argument, else `Tool({})`.
 */
export const summarize = (tool: string, input: Readonly<Record<string, unknown>>): string => {
  const strings = Object.entries(input).filter(
    (kv): kv is [string, string] => !RESERVED.has(kv[0]) && typeof kv[1] === 'string',
  )
  const byKey = new Map(strings)
  const preferred = PREFERRED.filter(k => byKey.has(k)).slice(0, 2)
  const keys = preferred.length > 0 ? preferred : strings.slice(0, 1).map(([k]) => k)
  if (keys.length === 0) return `${tool}({})`
  const args = keys.map(k => {
    const raw = byKey.get(k) ?? ''
    return `${k}: ${JSON.stringify(clip(BASENAME_KEYS.has(k) ? basename(raw) : raw))}`
  })
  return `${tool}({ ${args.join(', ')} })`
}

/** Parses `git diff --numstat` output into a path → `"a\tr"` table. */
export const parseNumstat = (stdout: string): Record<string, string> => {
  const table: Record<string, string> = {}
  for (const line of stdout.split('\n')) {
    const m = /^(\S+)\t(\S+)\t(.+)$/.exec(line)
    if (m) table[m[3] as string] = `${m[1]}\t${m[2]}`
  }
  return table
}

/** Untracked paths from `git status --porcelain` output. */
export const parseUntracked = (stdout: string): string[] =>
  stdout
    .split('\n')
    .filter(l => l.startsWith('?? '))
    .map(l => l.slice(3))

/**
 * What changed between two snapshots: per tracked path the change in its
 * numstat counts, and untracked paths that appeared. Counts are attributable
 * only approximately (a subtraction of totals, see README).
 */
export const computeDelta = (before: Snapshot, after: Snapshot): DeltaEntry[] => {
  const entries: DeltaEntry[] = []
  for (const [path, now] of Object.entries(after.numstat)) {
    const was = before.numstat[path]
    if (was === now) continue
    const [a1, r1] = now.split('\t')
    if (a1 === '-' || r1 === '-') {
      entries.push({ path, kind: 'binary' })
      continue
    }
    const [a0, r0] = (was ?? '0\t0').split('\t')
    const added = Number(a1) - (a0 === '-' ? 0 : Number(a0))
    const removed = Number(r1) - (r0 === '-' ? 0 : Number(r0))
    if (added !== 0 || removed !== 0) entries.push({ path, kind: 'changed', added, removed })
  }
  const known = new Set(before.untracked)
  for (const path of after.untracked) {
    if (!known.has(path)) entries.push({ path, kind: 'new' })
  }
  return entries
}

const formatEntry = (d: DeltaEntry): string =>
  d.kind === 'new'
    ? `(new) ${d.path}`
    : d.kind === 'binary'
      ? `${d.path} (binary)`
      : `${d.path} +${d.added} −${d.removed}`

/** The receipt's text; the caller decides whether there is anything to show. */
export const formatReceipt = (
  durationMs: number,
  calls: readonly string[],
  delta: readonly DeltaEntry[] | null,
): string => {
  const seconds = Math.round(durationMs / 1000)
  const count = `${calls.length} tool call${calls.length === 1 ? '' : 's'}`
  const lines = [`── turn receipt ── ${seconds}s · ${count}`, ...calls]
  if (delta && delta.length > 0) {
    const shown = delta.slice(0, MAX_DELTA_ENTRIES).map(formatEntry)
    const more = delta.length > MAX_DELTA_ENTRIES ? [`+${delta.length - MAX_DELTA_ENTRIES} more`] : []
    lines.push(`diff this turn: ${[...shown, ...more].join(' · ')}`)
  }
  return lines.join('\n')
}

/** Halt cap of the stop gate (`hooks/gate_common.py` HALT_CAP). */
export const GATE_CAP = 5

/**
 * The badge for a gate record: `gate.py` present and `meta.json` holding a
 * numeric `fails` → `gate: pending (fails N/5)`; anything else → undefined.
 */
export const gateBadge = (hasGate: boolean, metaText: string | null): string | undefined => {
  if (!hasGate || metaText === null) return undefined
  try {
    const meta: unknown = JSON.parse(metaText)
    if (typeof meta !== 'object' || meta === null) return undefined
    const fails = (meta as { fails?: unknown }).fails
    if (typeof fails !== 'number' || !Number.isFinite(fails)) return undefined
    return `gate: pending (fails ${fails}/${GATE_CAP})`
  } catch {
    return undefined
  }
}
