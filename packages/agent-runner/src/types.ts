import type { Task } from '@squad/types'

export interface RunAgentOptions {
  agentId: string
  userId: string
  sessionId: string
  task: Task
  partyHost: string       // e.g. "localhost:1999" or "myapp.partykit.dev"
  anthropicApiKey: string
  githubToken?: string    // if set, branch push + PR creation enabled
  workdir: string         // absolute path to project root agent should work in
}

export interface SSSHttpOptions {
  partyHost: string
  sessionId: string
}

export interface OwnershipResult {
  owned: boolean
  agentId: string | null
  tier: string | null
}
