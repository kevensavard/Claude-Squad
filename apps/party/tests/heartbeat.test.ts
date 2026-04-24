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

  it('marks agent offline when heartbeat older than 90s', () => {
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
    expect(result.updatedAgents['agent-1']?.status).toBe('offline')
    expect(result.releasedTaskIds).toContain('task-1')
    expect(result.updatedTasks['task-1']?.status).toBe('pending')
  })

  it('keeps agent online when heartbeat is recent', () => {
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

    const result = checkHeartbeats({ agents, tasks: {}, now: Date.now() })

    expect(result.offlineAgentIds).toHaveLength(0)
    expect(result.updatedAgents['agent-1']?.status).toBe('building')
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
