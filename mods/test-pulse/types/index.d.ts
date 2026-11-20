export type TestPulseRun = {
  at: number
  runner: 'bun' | 'pytest' | 'vitest' | 'jest' | 'cargo' | 'go'
  command: string
  cwd: string
  pass: number
  fail: number
  skip: number
  total: number
  durationMs?: number
  failing: string[]
  agentId?: string
  newlyFailing: string[]
  newlyFixed: string[]
  skipDelta: number
  totalDelta: number
}

declare module 'claude-code' {
  interface PluginState {
    'test-pulse': {
      runs: TestPulseRun[]
      autoOpened: boolean
      closedByPerson: boolean
    }
  }
}
