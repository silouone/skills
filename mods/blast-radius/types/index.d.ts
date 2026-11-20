export type BlastRadiusLogDecision = 'proceed' | 'deny' | 'observed' | 'session-allowed'

declare module 'claude-code' {
  interface PluginState {
    'blast-radius': { isOff: boolean; allowed: readonly string[]; isInteractive: boolean | null }
  }
}
