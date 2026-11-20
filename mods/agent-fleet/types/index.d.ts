export type FleetStatus = 'running' | 'done' | 'aborted' | 'error'

export type FleetAgent = {
  id: string
  type: string
  description: string
  model: string
  isTeammate: boolean
  isWorkflow: boolean
  startedAt: number
  endedAt?: number
  status: FleetStatus
  tools: number
  lastTool: string
  /** Uncached input plus cache writes. */
  tokensIn: number
  tokensOut: number
  cacheRead: number
  steps: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-fleet': {
      agents: FleetAgent[]
      /** The person closed the pane: never open it unasked again this session. */
      closedByPerson: boolean
      paneOpen: boolean
      interactive: boolean
      /** Bumped by the 5 s tick so the pane's elapsed column redraws. */
      tick: number
    }
  }
}
