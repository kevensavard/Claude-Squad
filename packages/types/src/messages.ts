import type { AgentRecord, Task, OwnershipMap, ApiContract, BuildSummary, SessionState, AgentRole } from './sss.js'

export type AgentMode = 'brainstorm' | 'review' | 'plan' | 'build'

export type ServerMessage =
  | { type: 'session_state'; payload: SessionState }
  | { type: 'agent_update'; payload: AgentRecord }
  | { type: 'task_update'; payload: Task }
  | { type: 'ownership_update'; payload: OwnershipMap }
  | { type: 'contract_published'; payload: ApiContract }
  | { type: 'agent_message'; agentId: string; content: string; mode: AgentMode }
  | { type: 'build_started'; taskGraph: Task[] }
  | { type: 'build_complete'; summary: BuildSummary }
  | { type: 'agent_blocked'; agentId: string; taskId: string; reason: string }
  | { type: 'heartbeat_lost'; agentId: string }

export type ClientMessage =
  | { type: 'register_agent'; agentId: string; userId: string; displayName: string; role?: AgentRole }
  | { type: 'heartbeat'; agentId: string }
  | { type: 'update_spec'; spec: string }
  | { type: 'update_status'; agentId: string; status: AgentRecord['status'] }
  | { type: 'task_claim'; agentId: string; taskId: string }
  | { type: 'task_done'; agentId: string; taskId: string; tokensUsed: number }
  | { type: 'task_blocked'; agentId: string; taskId: string; reason: string }
  | { type: 'publish_contract'; contract: ApiContract }
  | { type: 'add_decision'; summary: string; decidedBy: string }
  | { type: 'update_tokens'; userId: string; tokensIn: number; tokensOut: number }
  | { type: 'dispatch_tasks'; tasks: Task[] }
  | { type: 'broadcast_agent_message'; agentId: string; content: string; mode: AgentMode }
  | { type: 'orchestrator_dispatch'; taskGraph: Task[] }
  | { type: 'session_close' }
