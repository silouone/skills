export type CacheTaxLast = { cacheShare: number; durationMs: number; tools: number }
export type CacheTaxCold = { idleMinutes: number; tokens: number; fiveHour: number | null }
export type CacheTaxKeepWarm = { isOn: boolean; refreshes: number }
export type CacheTaxHandoff = { isSaved: true; path: string } | { isSaved: false; reason: string }
/** `isPending` from the moment the last-chance handoff fires until its fork settles. */
export type CacheTaxLastChance = { isPending: true } | CacheTaxHandoff

declare module 'claude-code' {
  interface PluginState {
    'cache-tax': {
      last: CacheTaxLast | null
      cold: CacheTaxCold | null
      isHidden: boolean
      lastAt: number | null
      isInteractive: boolean
      isCtxWarned: boolean
      prevShare: number | null
      keepWarm: CacheTaxKeepWarm | null
      /** This idle stretch's auto-handoff, or why there is none; cleared when the next turn starts. */
      handoff: CacheTaxHandoff | null
      /** The last-chance handoff (context nearly full): fired and pending, written, or why not; cleared when the context drops back. */
      lowCtx: CacheTaxLastChance | null
      /** Where the session started, read at its first start: `--resume` finds it only from there. */
      startRoot: string | null
    }
  }
}
