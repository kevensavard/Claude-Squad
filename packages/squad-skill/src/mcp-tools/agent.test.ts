import { describe, it, expect } from 'vitest'
import { buildGetAssignedTasksTool, buildClaimTaskTool, buildMarkTaskDoneTool } from './agent'
import type { Task } from '@squad/types'

const mockTask: Task = {
  id: 't1', title: 'Auth', description: 'Build auth', acceptanceCriteria: [],
  assignedAgentId: 'a1', status: 'pending', fileOwnership: [], dependsOn: [],
  estimatedTokens: 0, createdAt: new Date().toISOString(),
}

describe('buildGetAssignedTasksTool', () => {
  it('returns tasks assigned to this agent', () => {
    const tool = buildGetAssignedTasksTool({
      agentId: 'a1',
      getTasks: () => ({ t1: mockTask }),
    })
    const result = tool.handler({})
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].id).toBe('t1')
  })

  it('excludes done tasks', () => {
    const doneTasks = { t1: { ...mockTask, status: 'done' as const } }
    const tool = buildGetAssignedTasksTool({
      agentId: 'a1',
      getTasks: () => doneTasks,
    })
    expect(tool.handler({}).tasks).toHaveLength(0)
  })
})

describe('buildMarkTaskDoneTool', () => {
  it('calls onDone with taskId and summary', async () => {
    const calls: unknown[] = []
    const tool = buildMarkTaskDoneTool({
      agentId: 'a1',
      onDone: async (args) => { calls.push(args) },
    })
    await tool.handler({ taskId: 't1', summary: 'Done!' })
    expect(calls).toHaveLength(1)
  })
})
