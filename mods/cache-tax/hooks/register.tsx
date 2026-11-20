import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelForkResult, ModelUsage, Register, Timer } from 'claude-code'

import type { CacheTaxCold, CacheTaxHandoff, CacheTaxKeepWarm, CacheTaxLast, CacheTaxLastChance } from '../types'
import {
  cacheShare,
  configOf,
  type Config,
  contextPercents,
  ctxReport,
  handoffCheck,
  handoffDoc,
  handoffNote,
  handoffPath,
  handoffPrompt,
  IDLE_WHY,
  idleWhen,
  isCold,
  isHandoff,
  isLowContext,
  kTokens,
  lowContextWhen,
  lowContextWhy,
  MAX_RECORDS,
  rateOf,
  STORE_KEY,
  warningLine,
  weatherLine,
  type TurnRecord,
} from './logic'

const last = atom({ plugin: 'cache-tax', key: 'last' } as const, null as CacheTaxLast | null)
const cold = atom({ plugin: 'cache-tax', key: 'cold' } as const, null as CacheTaxCold | null)
const isHidden = atom({ plugin: 'cache-tax', key: 'isHidden' } as const, false)
const lastAt = atom({ plugin: 'cache-tax', key: 'lastAt' } as const, null as number | null)
const isInteractive = atom({ plugin: 'cache-tax', key: 'isInteractive' } as const, false)
const isCtxWarned = atom({ plugin: 'cache-tax', key: 'isCtxWarned' } as const, false)
const prevShare = atom({ plugin: 'cache-tax', key: 'prevShare' } as const, null as number | null)
const keepWarm = atom({ plugin: 'cache-tax', key: 'keepWarm' } as const, null as CacheTaxKeepWarm | null)
const handoff = atom({ plugin: 'cache-tax', key: 'handoff' } as const, null as CacheTaxHandoff | null)
const lowCtx = atom({ plugin: 'cache-tax', key: 'lowCtx' } as const, null as CacheTaxLastChance | null)
/** Where the session started: `--resume` finds it only from there, and `root()` moves with `/cd`. */
const startRoot = atom({ plugin: 'cache-tax', key: 'startRoot' } as const, null as string | null)

const TICK_MS = 60_000
const REFRESH_PROMPT = 'Reply with a single period.'

type Acc = {
  idleGapMs: number | null
  usage: ModelUsage
  first: ModelUsage | null
  tools: number
}

const ZERO: ModelUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const add = (a: ModelUsage, b: ModelUsage): ModelUsage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
})

const whyNot = (r: Exclude<ModelForkResult, { isAnswered: true }>): string => {
  switch (r.reason) {
    case 'api-error':
      return `API error ${r.status ?? '(no response)'} (${r.error})`
    case 'empty-reply':
      return 'the fork came back empty'
    case 'aborted':
      return 'the fork was aborted'
    case 'nothing-to-fork':
      return 'nothing to fork yet (no turn in this conversation)'
  }
}

let cfg: Config = configOf({})
const turns = new Map<string, Acc>()
let ticker: Timer | null = null
let warmTimer: Timer | null = null
/** The main loop's last final answer: a fork replays the last request, which ends before it. */
let lastAnswer = ''
/** Bumped by every main-loop turn; a handoff fork that sees it move was overtaken by the person. */
let stretch = 0
/** A fork of each kind is in flight in this load of the module (a reload drops it). */
let isIdleHandoffRunning = false
let isLastChanceRunning = false

async function tick($: EngineInterface) {
  const at = await read($, lastAt)
  const current = await read($, cold)

  if (at === null) {
    return
  }

  const usage = await $.session.usage()
  const tokens = usage.context.tokens ?? 0
  const idleMs = (await $.clock.now()) - at

  if (!isCold(idleMs, tokens, cfg)) {
    if (current !== null) {
      await update($, cold, () => null)
    }

    return
  }

  const next: CacheTaxCold = { idleMinutes: Math.floor(idleMs / 60_000), tokens, fiveHour: rateOf(usage, 'five_hour') }

  if (current === null) {
    await update($, isHidden, () => false)
  }

  if (current?.idleMinutes !== next.idleMinutes || current.tokens !== next.tokens || current.fiveHour !== next.fiveHour) {
    await update($, cold, () => next)
  }
}

function ensureTicker($: EngineInterface) {
  ticker ??= $.clock.every(TICK_MS, () => void tick($))
}

function cancelWarm() {
  warmTimer?.cancel()
  warmTimer = null
}

async function stopWarm($: EngineInterface, reason: string) {
  cancelWarm()
  await update($, keepWarm, kw => ({ isOn: false, refreshes: kw?.refreshes ?? 0 }))
  $.ui.toast(`keep-warm stopped: ${reason}`)

  if (cfg.autoHandoff) {
    await armIdle($)
  }
}

const warmDelayMs = () => Math.max(cfg.lifetimeMs - cfg.marginMs, 60_000)

/** Arm the idle timer due from the last cache read, as if nothing had moved it (a reload, keep-warm off). */
async function armIdle($: EngineInterface) {
  const at = await read($, lastAt)

  if (at === null) {
    return
  }

  cancelWarm()
  warmTimer = $.clock.after(Math.max(at + warmDelayMs() - (await $.clock.now()), 0), () => void refresh($))
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

type Ask = { prompt: string; when: string; at: number; tokens: number; isStale: () => boolean | Promise<boolean> }

/**
 * Fork the session (a cache read) into a handoff document and write it to disk.
 * Resolves the outcome and how much the fork read from cache, or null when
 * `isStale` says the moment passed while it ran.
 */
async function forkHandoff($: EngineInterface, ask: Ask): Promise<{ outcome: CacheTaxHandoff; cacheRead: number } | null> {
  const r = await $.model.fork({ prompt: ask.prompt })

  if (await ask.isStale()) {
    return null
  }

  if (!r.isAnswered) {
    return { outcome: { isSaved: false, reason: whyNot(r) }, cacheRead: 0 }
  }

  const cacheRead = r.usage.cache_read_input_tokens

  if (!isHandoff(r.text)) {
    return { outcome: { isSaved: false, reason: `the reply was not a handoff document (${r.text.length} chars)` }, cacheRead }
  }

  const home = await $.env.get('HOME')

  if (home === undefined) {
    return { outcome: { isSaved: false, reason: 'HOME is not set' }, cacheRead }
  }

  const sessionId = await $.session.id()
  const root = (await read($, startRoot)) ?? (await $.session.root())
  const path = handoffPath(home, root, sessionId)

  try {
    await $.fs.write(path, handoffDoc({ path, at: ask.at, when: ask.when, sessionId, root, tokens: ask.tokens }, r.text))
  } catch (err) {
    return { outcome: { isSaved: false, reason: `could not write ${path}: ${messageOf(err)}` }, cacheRead }
  }

  // Overtaken while writing: the file stands (the next handoff overwrites it), the note does not.
  return (await ask.isStale()) ? null : { outcome: { isSaved: true, path }, cacheRead }
}

/**
 * Right before the cache expires, hand off from the still-warm cache. Once per
 * idle stretch, one at a time; a no-op off-schedule. An engine call that throws
 * settles the band with the reason rather than vanishing in the timer.
 */
async function autoHandoff($: EngineInterface) {
  if (isIdleHandoffRunning) {
    return
  }

  isIdleHandoffRunning = true

  try {
    await idleHandoff($)
  } catch (err) {
    await settle($, 'idle', { isSaved: false, reason: `unexpected error: ${messageOf(err)}` })
  } finally {
    isIdleHandoffRunning = false
  }
}

async function idleHandoff($: EngineInterface) {
  const at = await read($, lastAt)

  if (!cfg.autoHandoff || at === null || (await read($, handoff)) !== null) {
    return
  }

  const tokens = (await $.session.usage()).context.tokens ?? 0
  // Taken before the fork: its cache read, sent now, is what restarts the cache's lifetime.
  const sentAt = await $.clock.now()
  const check = handoffCheck(sentAt - at, tokens, cfg)

  if (check === 'small') {
    return
  }

  if (check === 'late') {
    await settle($, 'idle', { isSaved: false, reason: 'the cache had likely expired before the handoff could run (Mac asleep?); run /handoff before leaving' })

    return
  }

  const mine = stretch
  const done = await forkHandoff($, {
    prompt: handoffPrompt(IDLE_WHY, lastAnswer),
    when: idleWhen(sentAt - at),
    at: sentAt,
    tokens,
    isStale: () => mine !== stretch, // the person came back mid-fork: this handoff predates their latest turn
  })

  if (done === null) {
    return
  }

  // Any fork that read the prefix from cache restarted its lifetime, document or not.
  if (done.cacheRead >= tokens * 0.5) {
    await update($, lastAt, () => sentAt)
  }

  await settle($, 'idle', done.outcome)
}

/**
 * The context is nearly full (auto-compact off: a full window ends the session,
 * /handoff included). Runs from a timer, not the step's hook, so the turn's
 * escape does not abort it and the main loop does not wait on it.
 */
async function lastChance($: EngineInterface, used: number, window: number, stepAnswer: string) {
  try {
    const percent = contextPercents(used, window)
    const done = await forkHandoff($, {
      prompt: handoffPrompt(lowContextWhy(percent.left), stepAnswer),
      when: lowContextWhen(percent.used),
      at: await $.clock.now(),
      tokens: used,
      isStale: async () => (await read($, lowCtx)) === null, // the context dropped back (a /clear) while it ran
    })

    if (done !== null) {
      await settle($, 'last-chance', done.outcome)
    }
  } catch (err) {
    await settle($, 'last-chance', { isSaved: false, reason: `unexpected error: ${messageOf(err)}` })
  } finally {
    isLastChanceRunning = false
  }
}

/** Keep a handoff's outcome on the band: a toast is gone before the person is back. */
async function settle($: EngineInterface, kind: 'idle' | 'last-chance', outcome: CacheTaxHandoff) {
  // The engine reads atoms off each update call's text, so each slot is spelled out.
  if (kind === 'idle') {
    await update($, handoff, () => outcome)
  } else {
    await update($, lowCtx, () => outcome)
  }

  const label = kind === 'idle' ? 'handoff' : 'last-chance handoff'
  await update($, isHidden, () => false)
  $.ui.toast(outcome.isSaved ? `${label} saved: ${outcome.path}` : `${label} failed: ${outcome.reason}`)
}

/** The idle timer: a keep-warm refresh, or (keep-warm off, or its cap reached) the auto-handoff. */
async function refresh($: EngineInterface) {
  warmTimer = null
  const kw = await read($, keepWarm)

  if (kw === null || !kw.isOn) {
    await autoHandoff($)

    return
  }

  if (kw.refreshes >= cfg.maxRefreshes) {
    $.ui.toast(`keep-warm: cap of ${cfg.maxRefreshes} refreshes reached; the cache will go cold`)
    await autoHandoff($)

    return
  }

  const r = await $.model.fork({ prompt: REFRESH_PROMPT })

  if (!r.isAnswered) {
    await stopWarm($, whyNot(r))

    return
  }

  const contextTokens = (await $.session.usage()).context.tokens ?? 0

  if (r.usage.cache_read_input_tokens < contextTokens * 0.5) {
    await stopWarm($, `refresh read only ${kTokens(r.usage.cache_read_input_tokens)} of ${kTokens(contextTokens)} tokens from cache`)

    return
  }

  await update($, keepWarm, k => ({ isOn: true, refreshes: (k?.refreshes ?? 0) + 1 }))
  const now = await $.clock.now()
  await update($, lastAt, () => now)
  scheduleWarm($)
}

/** After a real turn: a fresh keep-warm budget, and the idle timer from now. */
async function armAfterTurn($: EngineInterface) {
  const kw = await read($, keepWarm)

  if (kw?.isOn === true) {
    await update($, keepWarm, () => ({ isOn: true, refreshes: 0 }))
  }

  if (kw?.isOn === true || cfg.autoHandoff) {
    scheduleWarm($)
  }
}

function scheduleWarm($: EngineInterface) {
  cancelWarm()
  warmTimer = $.clock.after(warmDelayMs(), () => void refresh($))
}

async function readRecords($: EngineInterface): Promise<TurnRecord[]> {
  const stored = await $.store.get(STORE_KEY)

  return Array.isArray(stored) ? (stored as TurnRecord[]) : []
}

async function recordTurn($: EngineInterface, record: TurnRecord) {
  await $.store.set(STORE_KEY, [...(await readRecords($)), record].slice(-MAX_RECORDS))
}

export const register: Register = (on, options) => {
  cfg = configOf(options)
  turns.clear()
  ticker = null
  warmTimer = null
  lastAnswer = ''
  stretch = 0
  isIdleHandoffRunning = false
  isLastChanceRunning = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const interactive = e.isInteractive && e.surface !== null

    await update($, isInteractive, () => interactive)

    if (!interactive) {
      return result
    }

    await $.command.register({ name: 'ctx', description: 'Cache tax: last 20 turns, usage and estimated cache lifetime' })
    await $.command.register({ name: 'keepwarm', description: 'Cache tax: keep the prompt cache warm while idle', argumentHint: '[on|off|status]' })
    const kw = await update($, keepWarm, k => k ?? { isOn: cfg.keepWarmDefault, refreshes: 0 })
    const root = await $.session.root()
    await update($, startRoot, r => r ?? root)
    ensureTicker($)

    // Also fires on a reload (any /config change), which cancels the module's timers: re-arm from the last cache read.
    if (kw?.isOn === true || cfg.autoHandoff) {
      await armIdle($)
    }

    return result
  })

  on('turn.start', async ($, e, next) => {
    // $.model.fork is a completion, not a turn: no turn.* event comes from a fork.
    if (e.agentId === undefined) {
      const at = await read($, lastAt)
      const now = await $.clock.now()

      stretch += 1
      turns.set(e.turnId, { idleGapMs: at === null ? null : now - at, usage: ZERO, first: null, tools: 0 })
      cancelWarm()

      if ((await read($, cold)) !== null) {
        await update($, cold, () => null)
      }

      if ((await read($, handoff)) !== null) {
        await update($, handoff, () => null)
      }
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const acc = turns.get(e.turnId)

    if (e.agentId === undefined && acc !== undefined && result.usage !== null) {
      acc.usage = add(acc.usage, result.usage)
      acc.first ??= result.usage
      acc.tools += result.toolUses.length
    }

    if (e.agentId === undefined && cfg.autoHandoff && (await read($, isInteractive))) {
      const { tokens, window } = (await $.session.usage()).context
      // Fired-ness lives in plugin state, not a module variable: a reload (any /config
      // change) must not fork the near-full context again. A pending state with no fork
      // in flight in this load (a reload cancelled it) fires again.
      const fired = await read($, lowCtx)

      if (tokens !== undefined && !isLowContext(tokens, window, cfg)) {
        if (fired !== null) {
          await update($, lowCtx, () => null)
        }
      } else if (tokens !== undefined && (fired === null || ('isPending' in fired && !isLastChanceRunning))) {
        isLastChanceRunning = true
        await update($, lowCtx, () => ({ isPending: true }) as const)
        const stepAnswer = result.answer
        $.clock.after(0, () => void lastChance($, tokens, window, stepAnswer))
      }
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId !== undefined) {
      return result
    }

    lastAnswer = e.answer
    const now = await $.clock.now()
    const acc = turns.get(e.turnId)
    turns.delete(e.turnId)

    const usage = acc?.first != null ? acc.usage : e.usage
    const first = acc?.first ?? e.usage

    await update($, lastAt, () => now)

    if (usage === undefined || first === undefined) {
      if (await read($, isInteractive)) {
        await armAfterTurn($)
      }

      return result
    }

    const firstShare = cacheShare(first)
    const turnShare = cacheShare(usage)
    const tools = acc?.tools ?? 0

    await recordTurn($, {
      at: now,
      idleGapMs: acc?.idleGapMs ?? null,
      inputTokens: usage.input_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheCreation: usage.cache_creation_input_tokens,
      outputTokens: usage.output_tokens,
      durationMs: e.durationMs,
      tools,
      model: e.usage?.model ?? '',
      firstCacheShare: firstShare,
    })

    const previous = await read($, prevShare)
    await update($, prevShare, () => firstShare)

    if (!(await read($, isInteractive))) {
      return result
    }

    ensureTicker($)
    await update($, last, () => ({ cacheShare: turnShare, durationMs: e.durationMs, tools }))

    if (previous !== null && previous > 0.7 && firstShare < 0.3) {
      $.ui.toast(`cache went cold: +${kTokens(first.input_tokens + first.cache_creation_input_tokens)} tokens re-read`)
    }

    const ctxPercent = (await $.session.usage()).context.percent ?? 0

    if (ctxPercent >= 80 && !(await read($, isCtxWarned))) {
      await update($, isCtxWarned, () => true)
      $.ui.toast(`context ${ctxPercent}% full`)
    }

    await armAfterTurn($)

    return result
  })

  on('command.run', { command: 'ctx' }, async $ => {
    return { text: ctxReport(await readRecords($), await $.session.usage()) }
  })

  on('command.run', { command: 'keepwarm' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const everyMin = Math.round(warmDelayMs() / 60_000)

    if (arg === 'on') {
      await update($, keepWarm, () => ({ isOn: true, refreshes: 0 }))
      scheduleWarm($)

      return { text: `keep-warm on: a one-token refresh ${everyMin} min after the last turn, repeating while idle, at most ${cfg.maxRefreshes} times.` }
    }

    if (arg === 'off') {
      cancelWarm()
      await update($, keepWarm, kw => ({ isOn: false, refreshes: kw?.refreshes ?? 0 }))
      // Hand the idle timer back to the auto-handoff, due as if keep-warm had never been on.
      if (cfg.autoHandoff) {
        await armIdle($)
      }

      return { text: 'keep-warm off.' }
    }

    if (arg !== '' && arg !== 'status') {
      return { text: `Usage: /keepwarm [on|off|status] (got "${arg}")` }
    }

    const kw = await read($, keepWarm)

    return {
      text:
        kw?.isOn === true
          ? `keep-warm on: ${kw.refreshes}/${cfg.maxRefreshes} refreshes this idle stretch; ${warmTimer === null ? 'nothing scheduled' : `next refresh ${everyMin} min after the last activity`}.`
          : 'keep-warm off.',
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const warning = await read($, cold)
    const line = warning === null ? weatherLine(await $.session.usage(), await read($, last)) : null

    if (warning === null && line === null) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const lastChanceOutcome = await read($, lowCtx)
    const outcome = await read($, handoff)
    const lastChanceNote =
      lastChanceOutcome === null ? '' : 'isPending' in lastChanceOutcome ? ' │ writing last-chance handoff…' : handoffNote(lastChanceOutcome, 'last-chance handoff')
    const note = lastChanceNote + (outcome === null ? '' : handoffNote(outcome))

    return (
      <Box>
        {warning === null ? (
          <Text key="weather" dimColor>
            {line}{note}{' '}
          </Text>
        ) : (
          <Text key="warning" color="warning">
            {warningLine(warning.idleMinutes, warning.tokens, warning.fiveHour)}{note}{' '}
          </Text>
        )}
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
