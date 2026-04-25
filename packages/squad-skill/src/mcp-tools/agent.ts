import type { Task } from '@squad/types'

export function buildGetAssignedTasksTool(deps: {
  agentId: string
  getTasks: () => Record<string, Task>
}) {
  return {
    definition: {
      name: 'get_assigned_tasks',
      description: 'Returns tasks assigned to this agent that are pending or in-progress.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    handler(_args: Record<string, unknown>) {
      const all = deps.getTasks()
      const tasks = Object.values(all).filter(
        (t) =>
          t.assignedAgentId === deps.agentId &&
          (t.status === 'pending' || t.status === 'in_progress')
      )
      return { tasks }
    },
  }
}

export function buildClaimTaskTool(deps: {
  agentId: string
  claimTask: (taskId: string) => Promise<void>
}) {
  return {
    definition: {
      name: 'claim_task',
      description: 'Claims a task and marks it in-progress on the SSS.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          taskId: { type: 'string' },
        },
        required: ['taskId'],
      },
    },
    async handler(args: Record<string, unknown>) {
      await deps.claimTask(args['taskId'] as string)
      return { ok: true }
    },
  }
}

export function buildMarkTaskDoneTool(deps: {
  agentId: string
  onDone: (args: {
    taskId: string
    summary: string
    branchName?: string
    prUrl?: string
  }) => Promise<void>
}) {
  return {
    definition: {
      name: 'mark_task_done',
      description:
        'Marks a task complete and posts a proposal to the group chat.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          taskId: { type: 'string' },
          summary: { type: 'string' },
          branchName: { type: 'string' },
          prUrl: { type: 'string' },
        },
        required: ['taskId', 'summary'],
      },
    },
    async handler(args: Record<string, unknown>) {
      await deps.onDone({
        taskId: args['taskId'] as string,
        summary: args['summary'] as string,
        branchName: args['branchName'] as string | undefined,
        prUrl: args['prUrl'] as string | undefined,
      })
      return { ok: true }
    },
  }
}
