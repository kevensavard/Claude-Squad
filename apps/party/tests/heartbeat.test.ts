import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkHeartbeats } from '../src/heartbeat.js'
import type { AgentRegistry, TaskQueue } from '@squad/types'

describe('checkHeartbeats', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('no agents offline — returns empty arrays, no changes', () => {
    vi.setSystemTime(new Date('2026-04-18T10:00:00Z'))
    const recentHeartbeat = Date.now() - 30_000

    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1',
        userId: 'user-1',
        displayName: 'Claude (Alice)',
        status: 'building',
        currentTaskId: 'task-1',
        lastHeartbeat: recentHeartbeat,
        tokensUsed: 0,
      },
      'agent-2': {
        agentId: 'agent-2',
        userId: 'user-2',
        displayName: 'Claude (Bob)',
        status: 'building',
        currentTaskId: 'task-2',
        lastHeartbeat: recentHeartbeat,
        tokensUsed: 0,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1',
        title: 'Build auth',
        description: 'desc',
        acceptanceCriteria: [],
        assignedAgentId: 'agent-1',
        status: 'in_progress',
        fileOwnership: ['src/auth/**'],
        dependsOn: [],
        estimatedTokens: 1000,
        createdAt: '2026-04-18T09:00:00Z',
      },
      'task-2': {
        id: 'task-2',
        title: 'Build API',
        description: 'desc',
        acceptanceCriteria: [],
        assignedAgentId: 'agent-2',
        status: 'in_progress',
        fileOwnership: ['src/api/**'],
        dependsOn: [],
        estimatedTokens: 1000,
        createdAt: '2026-04-18T09:00:00Z',
      },
    }

    const result = checkHeartbeats({ agents, tasks, now: Date.now() })

    expect(result.offlineAgentIds).toHaveLength(0)
    expect(result.releasedTaskIds).toHaveLength(0)
    expect(result.releasedOwnershipPaths).toHaveLength(0)
    expect(result.updatedAgents['agent-1']?.status).toBe('building')
    expect(result.updatedAgents['agent-2']?.status).toBe('building')
  })

  it('one agent offline (lastHeartbeat > 90s ago) — appears in offlineAgentIds, status set to offline', () => {
    vi.setSystemTime(new Date('2026-04-18T10:00:00Z'))
    const oldHeartbeat = Date.now() - 91_000
    const recentHeartbeat = Date.now() - 30_000

    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1',
        userId: 'user-1',
        displayName: 'Claude (Alice)',
        status: 'building',
        currentTaskId: 'task-1',
        lastHeartbeat: oldHeartbeat,
        tokensUsed: 0,
      },
      'agent-2': {
        agentId: 'agent-2',
        userId: 'user-2',
        displayName: 'Claude (Bob)',
        status: 'building',
        currentTaskId: 'task-2',
        lastHeartbeat: recentHeartbeat,
        tokensUsed: 0,
      },
    }
    const tasks: TaskQueue = {}

    const result = checkHeartbeats({ agents, tasks, now: Date.now() })

    expect(result.offlineAgentIds).toEqual(['agent-1'])
    expect(result.updatedAgents['agent-1']?.status).toBe('offline')
    expect(result.updatedAgents['agent-2']?.status).toBe('building')
  })

  it('offline agent with in_progress task — task appears in releasedTaskIds, status reset to pending, assignedAgentId unchanged', () => {
    vi.setSystemTime(new Date('2026-04-18T10:00:00Z'))
    const oldHeartbeat = Date.now() - 91_000

    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1',
        userId: 'user-1',
        displayName: 'Claude (Alice)',
        status: 'building',
        currentTaskId: 'task-1',
        lastHeartbeat: oldHeartbeat,
        tokensUsed: 0,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1',
        title: 'Build something',
        description: 'desc',
        acceptanceCriteria: [],
        assignedAgentId: 'agent-1',
        status: 'in_progress',
        fileOwnership: ['src/auth/**'],
        dependsOn: [],
        estimatedTokens: 1000,
        createdAt: '2026-04-18T09:00:00Z',
      },
    }

    const result = checkHeartbeats({ agents, tasks, now: Date.now() })

    expect(result.offlineAgentIds).toContain('agent-1')
    expect(result.releasedTaskIds).toContain('task-1')
    expect(result.updatedTasks['task-1']?.status).toBe('pending')
    // assignedAgentId stays the same — not cleared, preserves original assignment for reclaim matching
    expect(result.updatedTasks['task-1']?.assignedAgentId).toBe('agent-1')
  })

  it('online agent — not affected', () => {
    vi.setSystemTime(new Date('2026-04-18T10:00:00Z'))
    const recentHeartbeat = Date.now() - 30_000

    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1',
        userId: 'user-1',
        displayName: 'Claude (Alice)',
        status: 'building',
        currentTaskId: 'task-1',
        lastHeartbeat: recentHeartbeat,
        tokensUsed: 0,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1',
        title: 'Build something',
        description: 'desc',
        acceptanceCriteria: [],
        assignedAgentId: 'agent-1',
        status: 'in_progress',
        fileOwnership: ['src/auth/**'],
        dependsOn: [],
        estimatedTokens: 1000,
        createdAt: '2026-04-18T09:00:00Z',
      },
    }

    const result = checkHeartbeats({ agents, tasks, now: Date.now() })

    expect(result.offlineAgentIds).toHaveLength(0)
    expect(result.releasedTaskIds).toHaveLength(0)
    expect(result.updatedAgents['agent-1']?.status).toBe('building')
    expect(result.updatedTasks['task-1']?.status).toBe('in_progress')
  })

  it('releases ownership for all tasks of offline agent', () => {
    vi.setSystemTime(new Date('2026-04-18T10:00:00Z'))
    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1',
        userId: 'user-1',
        displayName: 'Claude (Alice)',
        status: 'building',
        currentTaskId: 'task-1',
        lastHeartbeat: Date.now() - 95_000,
        tokensUsed: 0,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1', title: 't', description: 'd', acceptanceCriteria: [],
        assignedAgentId: 'agent-1', status: 'in_progress',
        fileOwnership: ['src/a/**', 'src/b/**'],
        dependsOn: [], estimatedTokens: 100, createdAt: '2026-04-18T09:00:00Z',
      },
    }

    const result = checkHeartbeats({ agents, tasks, now: Date.now() })

    expect(result.releasedOwnershipPaths).toEqual(expect.arrayContaining(['src/a/**', 'src/b/**']))
  })
})
