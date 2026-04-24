import { describe, it, expect } from 'vitest'
import { assembleContextInjection } from '../src/context-injection.js'
import type { SessionState, AgentRegistry, TaskQueue, ContractRegistry } from '@squad/types'

const makeSession = (): SessionState => ({
  id: 'sess-1',
  hostUserId: 'user-1',
  projectBrief: 'Build a todo app',
  agreedSpec: 'We will build a todo app with tasks and users. '.repeat(100),
  decisionLog: [
    { summary: 'Use Postgres', decidedBy: 'user-1', timestamp: '2026-04-18T10:00:00Z' },
    { summary: 'Use Tailwind', decidedBy: 'user-1', timestamp: '2026-04-18T10:01:00Z' },
  ],
  apiContracts: {},
  sharedTypesSnapshot: '',
  status: 'building',
  createdAt: '2026-04-18T09:00:00Z',
})

const makeTask = (): TaskQueue => ({
  'task-1': {
    id: 'task-1',
    title: 'Build auth module',
    description: 'Implement JWT auth with refresh tokens',
    acceptanceCriteria: ['Login endpoint works', 'Tokens refresh correctly'],
    assignedAgentId: 'agent-1',
    status: 'in_progress',
    fileOwnership: ['src/auth/**'],
    dependsOn: [],
    estimatedTokens: 5000,
    createdAt: '2026-04-18T10:00:00Z',
  },
})

const makeAgents = (): AgentRegistry => ({
  'agent-1': {
    agentId: 'agent-1',
    userId: 'user-1',
    displayName: 'Claude (Alice)',
    status: 'building',
    currentTaskId: 'task-1',
    lastHeartbeat: Date.now(),
    tokensUsed: 100,
  },
  'agent-2': {
    agentId: 'agent-2',
    userId: 'user-2',
    displayName: 'Claude (Bob)',
    status: 'idle',
    currentTaskId: null,
    lastHeartbeat: Date.now(),
    tokensUsed: 0,
  },
})

describe('assembleContextInjection', () => {
  it('returns content string with all required sections', () => {
    const result = assembleContextInjection({
      agentId: 'agent-1',
      session: makeSession(),
      agents: makeAgents(),
      tasks: makeTask(),
      contracts: {},
    })
    expect(result.content).toContain('## Project')
    expect(result.content).toContain('Build a todo app')
    expect(result.content).toContain('## Your task')
    expect(result.content).toContain('Build auth module')
    expect(result.content).toContain('## Files you own')
    expect(result.content).toContain('src/auth/**')
    expect(result.content).toContain('## Other agents')
    expect(result.content).toContain('Claude (Bob)')
    expect(result.content).toContain('## Recent decisions')
    expect(result.agentId).toBe('agent-1')
  })

  it('stays under 3800 token budget (approx 4 chars per token)', () => {
    const result = assembleContextInjection({
      agentId: 'agent-1',
      session: makeSession(),
      agents: makeAgents(),
      tasks: makeTask(),
      contracts: {},
    })
    const approxTokens = Math.ceil(result.content.length / 4)
    expect(approxTokens).toBeLessThanOrEqual(3800)
  })

  it('throws if agentId has no assigned task', () => {
    expect(() =>
      assembleContextInjection({
        agentId: 'agent-2',
        session: makeSession(),
        agents: makeAgents(),
        tasks: makeTask(),
        contracts: {},
      })
    ).toThrow('No task assigned to agent agent-2')
  })
})
