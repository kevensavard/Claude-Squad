import { describe, it, expect } from 'vitest'
import { applyClientMessage } from '../src/server.js'
import type { AppState } from '../src/server.js'
import type { ClientMessage } from '@squad/types'

function emptyState(): AppState {
  return {
    agents: {},
    tasks: {},
    session: {
      id: 'sess1',
      hostUserId: 'u1',
      projectBrief: '',
      agreedSpec: '',
      decisionLog: [],
      apiContracts: {},
      sharedTypesSnapshot: '',
      status: 'lobby',
      createdAt: new Date().toISOString(),
    },
  }
}

describe('register_agent', () => {
  it('stores role when provided', () => {
    const next = applyClientMessage(emptyState(), {
      type: 'register_agent',
      agentId: 'a1',
      userId: 'u1',
      displayName: 'Claude',
      role: 'orchestrator',
    } as ClientMessage)
    expect(next.agents['a1']?.role).toBe('orchestrator')
  })

  it('defaults role to agent when omitted', () => {
    const next = applyClientMessage(emptyState(), {
      type: 'register_agent',
      agentId: 'a1',
      userId: 'u1',
      displayName: 'Claude',
    } as ClientMessage)
    expect(next.agents['a1']?.role).toBe('agent')
  })
})

describe('orchestrator_dispatch', () => {
  it('stores tasks in the task queue', () => {
    const task = {
      id: 't1',
      title: 'Auth',
      description: 'Build auth',
      acceptanceCriteria: [],
      assignedAgentId: 'a1',
      status: 'pending' as const,
      fileOwnership: [],
      dependsOn: [],
      estimatedTokens: 0,
      createdAt: new Date().toISOString(),
    }
    const next = applyClientMessage(emptyState(), {
      type: 'orchestrator_dispatch',
      taskGraph: [task],
    } as ClientMessage)
    expect(next.tasks['t1']).toEqual(task)
  })
})
