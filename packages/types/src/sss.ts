export interface DecisionEntry {
  summary: string
  decidedBy: string
  timestamp: string
}

export interface ApiContract {
  method: string
  path: string
  publishedByAgentId: string
  requestSchema: object
  responseSchema: object
  publishedAt: string
}

export interface SessionState {
  id: string
  hostUserId: string
  projectBrief: string
  agreedSpec: string
  decisionLog: DecisionEntry[]
  apiContracts: Record<string, ApiContract>
  sharedTypesSnapshot: string
  status: 'lobby' | 'planning' | 'building' | 'done'
  createdAt: string
}

export type AgentRole = 'orchestrator' | 'agent'

export interface AgentRecord {
  agentId: string
  userId: string
  displayName: string
  status: 'idle' | 'brainstorming' | 'planning' | 'building' | 'blocked' | 'done' | 'offline'
  currentTaskId: string | null
  lastHeartbeat: number
  tokensUsed: number
  role?: AgentRole
}

export type AgentRegistry = Record<string, AgentRecord>

export interface Task {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  assignedAgentId: string
  status: 'pending' | 'in_progress' | 'blocked' | 'done' | 'aborted'
  fileOwnership: string[]
  dependsOn: string[]
  blockedReason?: string
  estimatedTokens: number
  actualTokens?: number
  createdAt: string
  startedAt?: string
  completedAt?: string
}

export type TaskQueue = Record<string, Task>

export interface OwnershipEntry {
  agentId: string
  tier: 'owned' | 'shared-ro'
  taskId: string
}

export type OwnershipMap = Record<string, OwnershipEntry>

export type ContractRegistry = Record<string, ApiContract>

export interface TokenMeterEntry {
  tokensIn: number
  tokensOut: number
  lastUpdated: string
}

export type TokenMeters = Record<string, TokenMeterEntry>

export interface BuildSummary {
  sessionId: string
  totalTokensIn: number
  totalTokensOut: number
  completedTaskCount: number
  agentCount: number
  prUrl?: string
}

export interface ContextInjection {
  agentId: string
  content: string
  estimatedTokens: number
  assembledAt: string
}

export type WatchEvent =
  | { type: 'mention'; from: string; content: string; requestId: string }
  | { type: 'build_goal'; from: string; content: string }
  | { type: 'approval_needed'; proposalId: string; agentId: string; summary: string }
  | { type: 'merge_conflict'; conflictAgents: string[]; round: number; maxRounds: number }
  | { type: 'idle' }
