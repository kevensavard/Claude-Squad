import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We test the pure logic functions extracted from the server.
// Partykit's Party.Server interface can't be unit-tested without a running runtime,
// so we test the handler logic in isolation via the exported helpers.
import {
  handleOwnershipGet,
  handleOwnershipPost,
  handleOwnershipDelete,
  handleTokenUpdate,
  applyClientMessage,
} from '../src/server.js'
import type {
  AgentRegistry,
  TaskQueue,
  OwnershipMap,
  TokenMeters,
  ClientMessage,
  SessionState,
} from '@squad/types'

const makeSession = (): SessionState => ({
  id: 'sess-1',
  hostUserId: 'user-1',
  projectBrief: 'Test project',
  agreedSpec: '',
  decisionLog: [],
  apiContracts: {},
  sharedTypesSnapshot: '',
  status: 'lobby',
  createdAt: '2026-04-18T10:00:00Z',
})

describe('handleOwnershipPost', () => {
  it('stores ownership entry', () => {
    const ownership: OwnershipMap = {}
    const result = handleOwnershipPost(ownership, {
      path: 'src/auth/index.ts',
      agentId: 'agent-1',
      taskId: 'task-1',
      tier: 'owned',
    })
    expect(result.ok).toBe(true)
    expect(result.updated['src/auth/index.ts']).toEqual({
      agentId: 'agent-1',
      tier: 'owned',
      taskId: 'task-1',
    })
  })

  it('normalizes path (strips leading slash)', () => {
    const ownership: OwnershipMap = {}
    const result = handleOwnershipPost(ownership, {
      path: '/src/auth/index.ts',
      agentId: 'agent-1',
      taskId: 'task-1',
      tier: 'owned',
    })
    expect(result.updated['src/auth/index.ts']).toBeDefined()
    expect(result.updated['/src/auth/index.ts']).toBeUndefined()
  })
})

describe('handleOwnershipGet', () => {
  it('returns owned entry', () => {
    const ownership: OwnershipMap = {
      'src/auth/index.ts': { agentId: 'agent-1', tier: 'owned', taskId: 'task-1' },
    }
    const result = handleOwnershipGet(ownership, 'src/auth/index.ts')
    expect(result.owned).toBe(true)
    expect(result.agentId).toBe('agent-1')
    expect(result.tier).toBe('owned')
  })

  it('returns not owned for unknown path', () => {
    const result = handleOwnershipGet({}, 'src/unknown.ts')
    expect(result.owned).toBe(false)
    expect(result.agentId).toBeNull()
  })
})

describe('handleOwnershipDelete', () => {
  it('removes ownership entry', () => {
    const ownership: OwnershipMap = {
      'src/auth/index.ts': { agentId: 'agent-1', tier: 'owned', taskId: 'task-1' },
    }
    const result = handleOwnershipDelete(ownership, 'src/auth/index.ts')
    expect(result.ok).toBe(true)
    expect(result.updated['src/auth/index.ts']).toBeUndefined()
  })

  it('returns ok:true even for non-existent path (idempotent)', () => {
    const result = handleOwnershipDelete({}, 'src/nope.ts')
    expect(result.ok).toBe(true)
  })
})

describe('handleTokenUpdate', () => {
  it('accumulates token counts', () => {
    const meters: TokenMeters = {
      'user-1': { tokensIn: 100, tokensOut: 50, lastUpdated: '2026-04-18T10:00:00Z' },
    }
    const result = handleTokenUpdate(meters, {
      userId: 'user-1',
      tokensIn: 200,
      tokensOut: 100,
    })
    expect(result.ok).toBe(true)
    expect(result.runningTotal.tokensIn).toBe(300)
    expect(result.runningTotal.tokensOut).toBe(150)
  })

  it('creates new meter entry for new user', () => {
    const result = handleTokenUpdate({}, {
      userId: 'user-new',
      tokensIn: 50,
      tokensOut: 25,
    })
    expect(result.runningTotal.tokensIn).toBe(50)
    expect(result.runningTotal.tokensOut).toBe(25)
  })
})

describe('applyClientMessage', () => {
  it('register_agent creates agent record', () => {
    const agents: AgentRegistry = {}
    const msg: ClientMessage = {
      type: 'register_agent',
      agentId: 'agent-1',
      userId: 'user-1',
      displayName: 'Claude (Alice)',
    }
    const result = applyClientMessage({ agents, tasks: {}, session: makeSession() }, msg)
    expect(result.agents['agent-1']?.agentId).toBe('agent-1')
    expect(result.agents['agent-1']?.status).toBe('idle')
  })

  it('heartbeat updates lastHeartbeat', () => {
    const before = Date.now() - 5000
    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1', userId: 'user-1', displayName: 'Claude (Alice)',
        status: 'idle', currentTaskId: null, lastHeartbeat: before, tokensUsed: 0,
      },
    }
    const msg: ClientMessage = { type: 'heartbeat', agentId: 'agent-1' }
    const result = applyClientMessage({ agents, tasks: {}, session: makeSession() }, msg)
    expect(result.agents['agent-1']?.lastHeartbeat).toBeGreaterThan(before)
  })

  it('task_claim sets agent currentTaskId and task status to in_progress', () => {
    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1', userId: 'user-1', displayName: 'Claude (Alice)',
        status: 'idle', currentTaskId: null, lastHeartbeat: Date.now(), tokensUsed: 0,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1', title: 'T', description: 'D', acceptanceCriteria: [],
        assignedAgentId: 'agent-1', status: 'pending',
        fileOwnership: [], dependsOn: [], estimatedTokens: 100,
        createdAt: '2026-04-18T10:00:00Z',
      },
    }
    const msg: ClientMessage = { type: 'task_claim', agentId: 'agent-1', taskId: 'task-1' }
    const result = applyClientMessage({ agents, tasks, session: makeSession() }, msg)
    expect(result.agents['agent-1']?.currentTaskId).toBe('task-1')
    expect(result.tasks['task-1']?.status).toBe('in_progress')
    expect(result.tasks['task-1']?.startedAt).toBeDefined()
  })

  it('task_done marks task done and updates agent tokensUsed', () => {
    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1', userId: 'user-1', displayName: 'Claude (Alice)',
        status: 'building', currentTaskId: 'task-1', lastHeartbeat: Date.now(), tokensUsed: 100,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1', title: 'T', description: 'D', acceptanceCriteria: [],
        assignedAgentId: 'agent-1', status: 'in_progress',
        fileOwnership: [], dependsOn: [], estimatedTokens: 100,
        createdAt: '2026-04-18T10:00:00Z',
      },
    }
    const msg: ClientMessage = {
      type: 'task_done', agentId: 'agent-1', taskId: 'task-1', tokensUsed: 500,
    }
    const result = applyClientMessage({ agents, tasks, session: makeSession() }, msg)
    expect(result.tasks['task-1']?.status).toBe('done')
    expect(result.tasks['task-1']?.actualTokens).toBe(500)
    expect(result.agents['agent-1']?.tokensUsed).toBe(600)
    expect(result.agents['agent-1']?.currentTaskId).toBeNull()
    expect(result.agents['agent-1']?.status).toBe('idle')
  })

  it('dispatch_tasks adds tasks to queue', () => {
    const msg: ClientMessage = {
      type: 'dispatch_tasks',
      tasks: [{
        id: 'task-new', title: 'New', description: 'Desc', acceptanceCriteria: [],
        assignedAgentId: 'agent-1', status: 'pending',
        fileOwnership: ['src/**'], dependsOn: [], estimatedTokens: 200,
        createdAt: '2026-04-18T10:00:00Z',
      }],
    }
    const result = applyClientMessage({ agents: {}, tasks: {}, session: makeSession() }, msg)
    expect(result.tasks['task-new']).toBeDefined()
  })

  it('update_status changes agent status', () => {
    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1', userId: 'user-1', displayName: 'Claude (Alice)',
        status: 'idle', currentTaskId: null, lastHeartbeat: Date.now(), tokensUsed: 0,
      },
    }
    const msg: ClientMessage = { type: 'update_status', agentId: 'agent-1', status: 'building' }
    const result = applyClientMessage({ agents, tasks: {}, session: makeSession() }, msg)
    expect(result.agents['agent-1']?.status).toBe('building')
  })

  it('task_blocked sets task status to blocked with reason', () => {
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1', title: 'T', description: 'D', acceptanceCriteria: [],
        assignedAgentId: 'agent-1', status: 'in_progress',
        fileOwnership: [], dependsOn: [], estimatedTokens: 100,
        createdAt: '2026-04-18T10:00:00Z',
      },
    }
    const msg: ClientMessage = { type: 'task_blocked', agentId: 'agent-1', taskId: 'task-1', reason: 'Needs shared type' }
    const result = applyClientMessage({ agents: {}, tasks, session: makeSession() }, msg)
    expect(result.tasks['task-1']?.status).toBe('blocked')
    expect(result.tasks['task-1']?.blockedReason).toBe('Needs shared type')
  })

  it('update_spec updates agreedSpec on session', () => {
    const msg: ClientMessage = { type: 'update_spec', spec: 'New agreed spec' }
    const result = applyClientMessage({ agents: {}, tasks: {}, session: makeSession() }, msg)
    expect(result.session.agreedSpec).toBe('New agreed spec')
  })

  it('publish_contract adds contract to session apiContracts', () => {
    const contract = {
      method: 'POST',
      path: '/api/auth/login',
      publishedByAgentId: 'agent-1',
      requestSchema: {},
      responseSchema: {},
      publishedAt: '2026-04-18T10:00:00Z',
    }
    const msg: ClientMessage = { type: 'publish_contract', contract }
    const result = applyClientMessage({ agents: {}, tasks: {}, session: makeSession() }, msg)
    expect(result.session.apiContracts['POST /api/auth/login']).toEqual(contract)
  })

  it('add_decision appends to decisionLog (max 20)', () => {
    const msg: ClientMessage = { type: 'add_decision', summary: 'Use Postgres', decidedBy: 'user-1' }
    const result = applyClientMessage({ agents: {}, tasks: {}, session: makeSession() }, msg)
    expect(result.session.decisionLog).toHaveLength(1)
    expect(result.session.decisionLog[0]?.summary).toBe('Use Postgres')
  })

  it('session_close sets session status to done', () => {
    const msg: ClientMessage = { type: 'session_close' }
    const result = applyClientMessage({ agents: {}, tasks: {}, session: makeSession() }, msg)
    expect(result.session.status).toBe('done')
  })
})
