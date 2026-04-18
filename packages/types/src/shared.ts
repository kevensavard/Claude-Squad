// AUTO-MANAGED: Do not edit directly.
// Request changes via RequestSharedWrite tool.
// Last updated: 2026-04-18 by orchestrator

export interface User {
  id: string
  email: string
  displayName: string
  createdAt: string
}

export interface Session {
  id: string
  hostUserId: string
  status: 'lobby' | 'planning' | 'building' | 'done'
  createdAt: string
}
