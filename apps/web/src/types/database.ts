export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  github_username: string | null
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  host_user_id: string
  name: string
  invite_code: string
  github_repo_url: string | null
  status: 'lobby' | 'planning' | 'building' | 'done' | 'archived'
  created_at: string
  closed_at: string | null
}

export interface SessionMember {
  session_id: string
  user_id: string
  agent_id: string
  display_name: string
  is_host: boolean
  joined_at: string
}

export interface Message {
  id: string
  session_id: string
  sender_type: 'human' | 'agent' | 'system'
  user_id: string | null
  agent_id: string | null
  content: string
  mode: 'brainstorm' | 'review' | 'plan' | 'build' | 'status' | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface TokenUsage {
  id: string
  session_id: string
  user_id: string
  task_id: string | null
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number | null
  recorded_at: string
}
