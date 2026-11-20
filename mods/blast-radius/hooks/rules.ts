// Blast Radius verb table and matcher. Pure: no `$`, no I/O, never throws.
// Edit RULES to widen or narrow what asks; keep it narrow (story 31).

export type Severity = 'high' | 'medium' | 'low'

/** One shell command of a compound line: its text and its argv with wrappers (sudo, env, VAR=) dropped. */
export type Segment = { readonly text: string; readonly argv: readonly string[]; readonly name: string }

/** A whole Bash command, split. `segments` includes the bodies of `bash -c '...'` / `eval '...'`. */
export type Parsed = { readonly raw: string; readonly segments: readonly Segment[] }

/** What a rule asks the guard to show as a preview. Every `run` argv must be provably read-only. */
export type PreviewPlan =
  | { readonly kind: 'run'; readonly argv: readonly string[] }
  | { readonly kind: 'paths'; readonly paths: readonly string[] }

export type Rule = {
  readonly id: string
  readonly severity: Severity
  readonly why: string
  /** Cheap prefilter on the raw line; `test` runs only when it hits, so a buggy `test` fails closed for its own verb alone. */
  readonly verb: RegExp
  /** The matched segment, `true` for a whole-line match, or false. */
  readonly test: (cmd: Parsed) => Segment | boolean
  readonly preview?: (seg: Segment, cmd: Parsed) => PreviewPlan | null
}

export type Hit = { readonly rule: Rule; readonly seg: Segment | null; readonly cmd: Parsed }

// ---------------------------------------------------------------- parsing

const WRAPPERS = new Set(['sudo', 'command', 'exec', 'nohup', 'time', 'nice', 'env', 'builtin', 'doas'])

/** Index read that is total under noUncheckedIndexedAccess. */
const at = (a: readonly string[], i: number): string => a[i] ?? ''

const basename = (t: string): string => t.slice(t.lastIndexOf('/') + 1)

const unquote = (t: string): string =>
  (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))
    ? t.slice(1, -1)
    : t

export const tokenize = (s: string): string[] =>
  (s.match(/'[^']*'|"(?:\\.|[^"\\])*"|[^\s'"]+(?:'[^']*'|"(?:\\.|[^"\\])*"|[^\s'"]+)*/g) ?? []).map(unquote)

const unwrap = (argv: readonly string[]): string[] => {
  let i = 0
  while (i < argv.length) {
    const t = at(argv, i)
    if (WRAPPERS.has(basename(t))) i++
    else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) i++
    else if (i > 0 && t.startsWith('-') && WRAPPERS.has(basename(at(argv, i - 1)))) i++ // sudo -u x, env -i
    else break
  }
  return argv.slice(i)
}

// Split on && || ; | & and newlines, but not on find's `\;`.
const SPLIT = /\|\||&&|(?<!\\);|\||(?<![>&])&(?![>&])|\n/

const INNER = /\b(?:ba|z|da)?sh\s+-[a-z]*c\s+('[^']*'|"(?:\\.|[^"\\])*")|\beval\s+('[^']*'|"(?:\\.|[^"\\])*")/g

const segmentsOf = (s: string, depth: number): Segment[] => {
  const out: Segment[] = []
  for (const part of s.split(SPLIT)) {
    const text = part.trim().replace(/^[({]+\s*|\s*[)}]+$/g, '').replace(/^\$\(/, '')
    if (text === '') continue
    const argv = unwrap(tokenize(text))
    if (argv.length > 0) out.push({ text, argv, name: basename(at(argv, 0)) })
  }
  if (depth < 2) {
    for (const m of s.matchAll(INNER)) {
      const body = unquote(m[1] ?? m[2] ?? '')
      out.push(...segmentsOf(body, depth + 1))
    }
  }
  return out
}

export const parse = (raw: string): Parsed => ({ raw, segments: segmentsOf(raw, 0) })

// ---------------------------------------------------------------- helpers

const shortFlags = (argv: readonly string[]): string =>
  argv.filter(t => /^-[A-Za-z]/.test(t)).map(t => t.slice(1)).join('')

const positionals = (argv: readonly string[]): string[] => {
  const out: string[] = []
  let rest = false
  for (const t of argv) {
    if (!rest && t === '--') rest = true
    else if (rest || !t.startsWith('-')) out.push(t)
  }
  return out
}

/** Home-rooted, variable-rooted, shallow absolute, or globbed target (rm/chown). */
export const isRiskyTarget = (t: string): boolean => {
  if (t.startsWith('~') || t.startsWith('$') || t.includes('$HOME') || t.includes('${HOME}')) return true
  if (t.includes('*')) return true
  if (/^\/(Users|home)(\/|$)/.test(t)) return true
  if (t.startsWith('/')) return t.split('/').filter(p => p !== '' && p !== '.').length <= 2
  return false
}

const findSeg = (cmd: Parsed, pred: (s: Segment) => boolean): Segment | false =>
  cmd.segments.find(pred) ?? false

/** git argv after global options: [sub, ...rest] plus the -C dir, if any. */
const gitSub = (argv: readonly string[]): { sub: string; rest: string[]; dir: string | null } => {
  let i = 1
  let dir: string | null = null
  while (i < argv.length && at(argv, i).startsWith('-')) {
    const t = at(argv, i)
    if (t === '-C') dir = argv[i + 1] ?? null
    i += t === '-C' || t === '-c' ? 2 : 1
  }
  return { sub: argv[i] ?? '', rest: argv.slice(i + 1), dir }
}

const git = (sub: string, more: (rest: string[]) => boolean) => (cmd: Parsed) =>
  findSeg(cmd, s => {
    if (s.name !== 'git') return false
    const g = gitSub(s.argv)
    return g.sub === sub && more(g.rest)
  })

const gitPreview = (seg: Segment, cmd: Parsed, args: readonly string[]): PreviewPlan | null => {
  if (precededByCd(seg, cmd)) return null
  const { dir } = gitSub(seg.argv)
  if (dir !== null && !isLiteral(dir)) return null
  return { kind: 'run', argv: ['git', ...(dir === null ? [] : ['-C', dir]), ...args] }
}

/** `~`, `~/x`, `$HOME/x`, `${HOME}/x`: the guard expands these before running a preview. */
export const isHomeRooted = (t: string): boolean => /^(~|\$HOME|\$\{HOME\})(\/[^$`*?[\]{}]*)?$/.test(t)

/** A token the preview can pass to argv as-is: no variables, globs or substitutions. */
const isLiteral = (t: string): boolean => !/[$`*?[\]{}]/.test(t)

/** An earlier `cd`/`pushd` makes the session cwd the wrong place to preview from. */
const precededByCd = (seg: Segment, cmd: Parsed): boolean => {
  const idx = cmd.segments.indexOf(seg)
  return cmd.segments.slice(0, idx).some(s => s.name === 'cd' || s.name === 'pushd')
}

const has = (argv: readonly string[], ...ts: string[]): boolean => argv.some(t => ts.includes(t))

const SQL_CLI = /\b(sqlite3|psql|mysql|mariadb)\b/

const deleteWithoutWhere = (s: string): boolean =>
  [...s.matchAll(/\bDELETE\s+FROM\s+[^;'"]*(?:;|$|['"])/gi)].some(m => !/\bWHERE\b/i.test(m[0]))

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

const hostOf = (t: string): string | null => {
  const m = /^(?:[a-z]+:\/\/)?(?:[^@/\s]*@)?(\[[^\]]+\]|[^/:?#\s]+)/i.exec(t)
  return m === null ? null : (m[1] ?? '').toLowerCase()
}

const isLocal = (host: string): boolean => LOCAL_HOSTS.has(host) || host.endsWith('.localhost')

const curlSendsData = (argv: readonly string[]): boolean => {
  for (let i = 1; i < argv.length; i++) {
    const t = at(argv, i)
    if (/^--(data|data-raw|data-binary|data-urlencode|data-ascii|form|form-string|json|upload-file)(=|$)/.test(t)) return true
    if (/^-[A-Za-z]*[dFT]/.test(t) && !t.startsWith('--')) return true
    if ((t === '-X' || t === '--request') && /^(POST|PUT|PATCH)$/i.test(argv[i + 1] ?? '')) return true
    if (/^(-X|--request=)(POST|PUT|PATCH)$/i.test(t)) return true
  }
  return false
}

/** Every URL-ish target of a curl call is local. No recognisable host → not local. */
const curlAllLocal = (argv: readonly string[]): boolean => {
  const urls = argv.slice(1).filter(t => t.includes('://'))
  const candidates = urls.length > 0 ? urls : argv.slice(1).filter(t => !t.startsWith('-')).slice(-1)
  if (candidates.length === 0) return false
  return candidates.every(t => {
    const h = hostOf(t)
    return h !== null && isLocal(h)
  })
}

const FIND_PATTERNS = new Set(['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex', '-lname', '-ilname'])

const FIND_WRITES = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls'])

const findDeletes = (argv: readonly string[]): boolean =>
  argv.some((t, i) =>
    t === '-delete' ||
    (['-exec', '-execdir', '-ok', '-okdir'].includes(t) && basename(argv[i + 1] ?? '') === 'rm'))

const findPreview = (seg: Segment, cmd: Parsed): PreviewPlan | null => {
  if (precededByCd(seg, cmd)) return null
  const kept: string[] = []
  const a = seg.argv
  for (let i = 0; i < a.length; i++) {
    const t = at(a, i)
    if (t === '-delete') continue
    if (['-exec', '-execdir', '-ok', '-okdir'].includes(t) && basename(at(a, i + 1)) === 'rm') {
      while (i < a.length && ![';', '\\;', '+'].includes(at(a, i))) i++
      continue
    }
    kept.push(t)
  }
  if (kept.some(t => FIND_WRITES.has(t))) return null
  // Glob values of find's own pattern primaries are find's to expand; anywhere else a
  // variable, substitution or glob means the argv would not match what the shell runs.
  const ok = kept.every((t, i) => isLiteral(t) || isHomeRooted(t) || (FIND_PATTERNS.has(kept[i - 1] ?? '') && !/[$`]/.test(t)))
  if (!ok) return null
  return { kind: 'run', argv: [...kept, '-print'] }
}

// ---------------------------------------------------------------- the table

export const RULES: readonly Rule[] = [
  {
    id: 'find-delete',
    verb: /\bfind\b/,
    severity: 'high',
    why: 'find deletes every match',
    test: cmd => findSeg(cmd, s => s.name === 'find' && findDeletes(s.argv)),
    preview: findPreview,
  },
  {
    id: 'xargs-rm',
    verb: /\bxargs\b/,
    severity: 'high',
    why: 'piped removal of an unseen list',
    test: cmd => findSeg(cmd, s => s.name === 'xargs' && s.argv.slice(1).some(t => basename(t) === 'rm')),
  },
  {
    id: 'rm-risky-target',
    verb: /\brm\b/,
    severity: 'high',
    why: 'recursive/forced rm on a home-rooted, variable, shallow or globbed path',
    test: cmd => findSeg(cmd, s =>
      s.name === 'rm' &&
      (/[rRf]/.test(shortFlags(s.argv)) || has(s.argv, '--recursive', '--force')) &&
      positionals(s.argv.slice(1)).some(isRiskyTarget)),
    preview: seg => ({ kind: 'paths', paths: positionals(seg.argv.slice(1)) }),
  },
  {
    id: 'git-clean',
    verb: /\bgit\b/,
    severity: 'high',
    why: 'deletes untracked files',
    test: git('clean', r => (/f/.test(shortFlags(r)) || has(r, '--force')) && !/n/.test(shortFlags(r)) && !has(r, '--dry-run')),
    preview: (seg, cmd) => {
      const f = shortFlags(gitSub(seg.argv).rest)
      const extra = [f.includes('d') ? '-d' : '', f.includes('x') ? '-x' : '', f.includes('X') ? '-X' : ''].filter(Boolean)
      return gitPreview(seg, cmd, ['clean', '-n', ...extra])
    },
  },
  {
    id: 'git-reset-hard',
    verb: /\bgit\b/,
    severity: 'high',
    why: 'discards uncommitted changes',
    test: git('reset', r => has(r, '--hard')),
    preview: (seg, cmd) => gitPreview(seg, cmd, ['diff', '--stat', 'HEAD']),
  },
  {
    id: 'git-checkout-dot',
    verb: /\bgit\b/,
    severity: 'medium',
    why: 'discards unstaged changes in the whole tree',
    test: git('checkout', r => positionals(r).includes('.')),
    preview: (seg, cmd) => gitPreview(seg, cmd, ['diff', '--stat']),
  },
  {
    id: 'git-push-force',
    verb: /\bgit\b/,
    severity: 'high',
    why: 'rewrites remote history',
    test: git('push', r =>
      has(r, '--force') || /f/.test(shortFlags(r.filter(t => !t.startsWith('--')))) ||
      positionals(r).some(t => t.startsWith('+'))),
  },
  {
    id: 'git-push-force-with-lease',
    verb: /\bgit\b/,
    severity: 'low',
    why: 'rewrites remote history (lease-checked)',
    test: git('push', r => r.some(t => /^--force-with-lease(=|$)/.test(t) || t === '--force-if-includes')),
  },
  {
    id: 'git-branch-D',
    verb: /\bgit\b/,
    severity: 'medium',
    why: 'force-deletes a branch, merged or not',
    test: git('branch', r => /D/.test(shortFlags(r)) || (has(r, '--delete') && has(r, '--force'))),
  },
  {
    id: 'sql-destructive',
    verb: /\b(sqlite3|psql|mysql|mariadb)\b/,
    severity: 'high',
    why: 'drops, truncates or deletes every row',
    test: cmd => SQL_CLI.test(cmd.raw) &&
      (/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i.test(cmd.raw) || /\bTRUNCATE\b/i.test(cmd.raw) || deleteWithoutWhere(cmd.raw)),
  },
  {
    id: 'brain-db-write',
    verb: /brain\.db/,
    severity: 'medium',
    why: 'writes to brain.db',
    test: cmd => /\bsqlite3\b/.test(cmd.raw) && /brain\.db\b/.test(cmd.raw) &&
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM)\b|\.(import|restore)\b/i.test(cmd.raw),
  },
  {
    id: 'cloud-delete',
    verb: /\b(gh|wrangler|kubectl|docker|aws)\b/,
    severity: 'high',
    why: 'deletes a remote resource',
    test: cmd => findSeg(cmd, s => {
      const [, a = '', b = ''] = s.argv
      const p = positionals(s.argv.slice(1))
      switch (s.name) {
        case 'gh': return (a === 'repo' && b === 'delete') || (a === 'release' && b === 'delete') || (a === 'pr' && b === 'close')
        case 'wrangler': return p.includes('delete')
        case 'kubectl': return p[0] === 'delete'
        case 'docker': return (p[0] === 'system' && p[1] === 'prune') || (p[0] === 'volume' && p[1] === 'rm')
        case 'aws': return (p[0] === 's3' && p[1] === 'rm' && has(s.argv, '--recursive')) || p.some(t => t.startsWith('delete-'))
        default: return false
      }
    }),
  },
  {
    id: 'pipe-to-shell',
    verb: /\b(curl|wget)\b/,
    severity: 'high',
    why: 'runs downloaded code unseen',
    test: cmd => /\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(cmd.raw) ||
      /\b(ba|z|da)?sh\b[^\n]*(<\(|\$\()\s*(curl|wget)\b/.test(cmd.raw),
  },
  {
    id: 'outbound-data',
    verb: /\b(curl|wget)\b/,
    severity: 'medium',
    why: 'sends data to a non-local host',
    test: cmd => findSeg(cmd, s =>
      (s.name === 'curl' && curlSendsData(s.argv) && !curlAllLocal(s.argv)) ||
      (s.name === 'wget' && s.argv.some(t => /^--(post-data|post-file|body-data|body-file)(=|$)|^--method=(POST|PUT|PATCH)$/i.test(t)) &&
        !curlAllLocal(s.argv))),
  },
  {
    id: 'url-shortener',
    verb: /\b(bit\.ly|t\.co|tinyurl\.com|goo\.gl|is\.gd|cutt\.ly)\b/i,
    severity: 'medium',
    why: 'a URL shortener hides the real destination',
    test: cmd => /(^|[\s'"=@(/])(bit\.ly|t\.co|tinyurl\.com|goo\.gl|is\.gd|cutt\.ly)\//i.test(cmd.raw),
  },
  {
    id: 'chmod-777-recursive',
    verb: /\bchmod\b/,
    severity: 'high',
    why: 'makes a tree world-writable',
    test: cmd => findSeg(cmd, s => s.name === 'chmod' && (/R/.test(shortFlags(s.argv)) || has(s.argv, '--recursive')) &&
      s.argv.some(t => /^0?777$|^a\+rwx$/.test(t))),
  },
  {
    id: 'chown-recursive-home',
    verb: /\bchown\b/,
    severity: 'high',
    why: 'recursive ownership change on / or home',
    test: cmd => findSeg(cmd, s => s.name === 'chown' && (/R/.test(shortFlags(s.argv)) || has(s.argv, '--recursive')) &&
      positionals(s.argv.slice(1)).slice(1).some(t => t === '/' || isRiskyTarget(t))),
  },
  {
    id: 'macos-system',
    verb: /\b(launchctl|defaults|crontab)\b/,
    severity: 'medium',
    why: 'unloads services, deletes defaults or the crontab',
    test: cmd => findSeg(cmd, s =>
      (s.name === 'launchctl' && has(s.argv, 'unload', 'remove', 'bootout')) ||
      (s.name === 'defaults' && s.argv[1] === 'delete') ||
      (s.name === 'crontab' && /r/.test(shortFlags(s.argv)))),
  },
]

/** Pure, total: every rule that matches `command`. A rule whose verb is present but whose test throws counts as matched (fail closed). */
export const match = (command: unknown, rules: readonly Rule[] = RULES): Hit[] => {
  let cmd: Parsed
  try {
    cmd = parse(typeof command === 'string' ? command : '')
  } catch {
    return []
  }
  if (cmd.segments.length === 0) return []
  const hits: Hit[] = []
  for (const rule of rules) {
    if (!rule.verb.test(cmd.raw)) continue
    try {
      const r = rule.test(cmd)
      if (r !== false) hits.push({ rule, seg: r === true ? null : r, cmd })
    } catch {
      hits.push({ rule, seg: null, cmd })
    }
  }
  return hits
}
