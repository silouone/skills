import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { RULES, isHomeRooted, match } from './rules'
import type { Hit, PreviewPlan } from './rules'
import type { BlastRadiusLogDecision as Decision } from '../types'

type LogEntry = { at: string; ruleId: string; command: string; decision: Decision; agentId?: string }

const LOG_KEY = 'blast-radius.log'
const LOG_CAP = 200
const PREVIEW_LINES = 50
const PREVIEW_TIMEOUT_MS = 5000

const PROCEED = 'Proceed'
const CANCEL = 'Cancel'
const ALLOW = 'Allow this exact command for the session'

const isOff = atom({ plugin: 'blast-radius', key: 'isOff' } as const, false)
const allowed = atom({ plugin: 'blast-radius', key: 'allowed' } as const, [] as readonly string[])
/** From `session.start`; null until it fires (e.g. after a hot reload), then `surfaces()` alone decides. */
const isInteractive = atom({ plugin: 'blast-radius', key: 'isInteractive' } as const, null as boolean | null)

type $ = EngineInterface

const appendLog = async ($: $, entry: Omit<LogEntry, 'at'>): Promise<void> => {
  try {
    const at = new Date(await $.clock.now()).toISOString()
    const prev = await $.store.get(LOG_KEY)
    const list = Array.isArray(prev) ? (prev as LogEntry[]) : []
    await $.store.set(LOG_KEY, [...list, { at, ...entry }].slice(-LOG_CAP))
  } catch {
    // The log is a convenience; it never changes a decision.
  }
}

const expandHome = (t: string, home: string | undefined): string | null => {
  if (!isHomeRooted(t)) return t
  if (home === undefined || home === '') return null
  return t.replace(/^(~|\$HOME|\$\{HOME\})/, home)
}

const capLines = (text: string): string => {
  const lines = text.split('\n').filter(l => l !== '')
  const head = lines.slice(0, PREVIEW_LINES).join('\n')
  return lines.length > PREVIEW_LINES ? `${head}\n... (${lines.length - PREVIEW_LINES} more)` : head || '(nothing)'
}

/** Read-only previews only: a rule's `run` argv, or stat + bounded find over each target. */
const runPreview = async ($: $, plan: PreviewPlan | null): Promise<string> => {
  if (plan === null) return 'preview unavailable'
  const home = await $.env.get('HOME')
  if (plan.kind === 'run') {
    const argv = plan.argv.map(t => expandHome(t, home))
    if (argv.some(t => t === null)) return 'preview unavailable'
    const ran = await $.process.run(argv as string[], { timeoutMs: PREVIEW_TIMEOUT_MS })
    return `$ ${argv.join(' ')}\n${capLines(ran.stdout || ran.stderr)}`
  }
  const out: string[] = []
  for (const raw of plan.paths) {
    const p = expandHome(raw, home)
    if (p === null || /[$`*?[\]{}]/.test(p)) {
      out.push(`${raw}: preview unavailable (variable or glob)`)
      continue
    }
    try {
      const st = await $.fs.stat(p, { resolve: true })
      if (st.realPath === undefined) {
        out.push(`${raw}: does not resolve`)
        continue
      }
      if (st.kind !== 'dir') {
        out.push(`${raw} -> ${st.realPath} (${st.kind})`)
        continue
      }
      const ran = await $.process.run(['find', st.realPath, '-maxdepth', '3', '-type', 'f'], { timeoutMs: PREVIEW_TIMEOUT_MS })
      const n = ran.stdout.split('\n').filter(l => l !== '').length
      out.push(`${raw} -> ${st.realPath} (dir, ${n}${ran.isStdoutTruncated ? '+' : ''} files within depth 3)`)
    } catch {
      out.push(`${raw}: preview unavailable`)
    }
  }
  return out.join('\n') || 'preview unavailable'
}

const previewFor = async ($: $, hit: Hit): Promise<string> => {
  try {
    const plan = hit.seg === null || hit.rule.preview === undefined ? null : hit.rule.preview(hit.seg, hit.cmd)
    return await runPreview($, plan)
  } catch {
    return 'preview unavailable'
  }
}

const questionFor = (hits: readonly Hit[], command: string, preview: string, agentId: string | undefined): string => {
  const head = hits.map(h => `${h.rule.id} [${h.rule.severity}]: ${h.rule.why}`).join('\n')
  const from = agentId === undefined ? '' : `\nFrom subagent ${agentId}.`
  const cmd = command.length > 500 ? `${command.slice(0, 500)}...` : command
  return `Blast radius:\n${head}${from}\n\nCommand:\n${cmd}\n\nPreview:\n${preview}\n\nRun it?`
}

const ask = async ($: $, question: string): Promise<string | null> => {
  try {
    return await $.ui.ask(question, { options: [PROCEED, CANCEL, ALLOW], header: 'Blast' })
  } catch {
    return null // dismissed, no one to ask, or the dialog failed
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, isInteractive, () => e.isInteractive && e.surface !== null)
    await $.command.register({
      name: 'blast',
      description: 'Blast Radius: last decisions and active rules; `/blast off|on` toggles for this session.',
      argumentHint: '[on|off]',
    })
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = typeof e.command === 'string' ? e.command : ''
    const hits = match(command)
    if (hits.length === 0) return next(e) // nothing below can affect an unmatched command

    const ruleId = hits.map(h => h.rule.id).join(',')
    const short = command.slice(0, 200)
    const agentId = e.agentId

    if ((await $.env.get('BLAST_RADIUS')) === 'off') return next(e)
    if (await read($, isOff)) return next(e)
    if ((await read($, allowed)).includes(command)) {
      await appendLog($, { ruleId, command: short, decision: 'session-allowed', agentId })
      return next(e)
    }

    if ((await read($, isInteractive)) === false || (await $.session.surfaces()).length === 0) {
      await appendLog($, { ruleId, command: short, decision: 'observed', agentId })
      $.ui.log(`blast-radius: observed ${ruleId}: ${short}`, { to: 'debug' })
      return next(e)
    }

    const first = hits.find(h => h.rule.preview !== undefined && h.seg !== null)
    const preview = first === undefined ? 'preview unavailable' : await previewFor($, first)
    const answer = await ask($, questionFor(hits, command, preview, agentId))

    if (answer === PROCEED || answer === ALLOW) {
      if (answer === ALLOW) await update($, allowed, list => [...(list ?? []), command])
      await appendLog($, { ruleId, command: short, decision: answer === ALLOW ? 'session-allowed' : 'proceed', agentId })
      return next(e)
    }
    await appendLog($, { ruleId, command: short, decision: 'deny', agentId })
    const why = answer === null ? 'dialog dismissed or unavailable' : answer === CANCEL ? 'cancelled by the person' : `answered "${answer.slice(0, 80)}"`
    return { deny: `blast-radius: ${ruleId}: ${why}. Ask the person before retrying.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'blast-radius: guard failed' }))

  on('command.run', { command: 'blast' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      return { text: `Blast Radius ${arg === 'off' ? 'paused' : 'active'} for this session.` }
    }
    const prev = await $.store.get(LOG_KEY)
    const list = (Array.isArray(prev) ? (prev as LogEntry[]) : []).slice(-20).reverse()
    const off = (await read($, isOff)) || (await $.env.get('BLAST_RADIUS')) === 'off'
    const rows = list.map(l => `${l.at}  ${l.decision.padEnd(15)} ${l.ruleId}  ${l.agentId ? `[${l.agentId}] ` : ''}${l.command.slice(0, 80)}`)
    return {
      text: [
        `Blast Radius: ${off ? 'OFF' : 'on'}`,
        `Rules: ${RULES.map(r => r.id).join(', ')}`,
        '',
        rows.length === 0 ? 'No decisions yet.' : `Last ${rows.length} decisions (newest first):\n${rows.join('\n')}`,
      ].join('\n'),
    }
  })
}
