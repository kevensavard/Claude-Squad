import type { WatchEvent, Task } from '@squad/types'

export function buildWatchSessionTool(deps: {
  nextEvent: (timeoutMs: number) => Promise<WatchEvent>
}) {
  return {
    definition: {
      name: 'watch_session',
      description:
        'Long-polls for events needing orchestrator attention. Returns mention, build_goal, approval_needed, or idle after 30s.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    async handler(_args: Record<string, unknown>): Promise<WatchEvent> {
      return deps.nextEvent(30_000)
    },
  }
}

export function buildDispatchTasksTool(deps: {
  sendDispatch: (tasks: Task[]) => Promise<void>
}) {
  return {
    definition: {
      name: 'dispatch_tasks',
      description: 'Sends a task graph to the SSS. SSS broadcasts it to connected agents.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                assignedAgentId: { type: 'string' },
                dependsOn: { type: 'array', items: { type: 'string' } },
              },
              required: ['id', 'title', 'description', 'assignedAgentId'],
            },
          },
        },
        required: ['tasks'],
      },
    },
    async handler(args: Record<string, unknown>) {
      const tasks = args['tasks'] as Task[]
      await deps.sendDispatch(tasks)
      return { ok: true, dispatched: tasks.length }
    },
  }
}

export function buildGetPendingApprovalsTool(deps: {
  getPendingApprovals: () => Array<{
    proposalId: string
    agentId: string
    summary: string
    branchName?: string
    prUrl?: string
  }>
}) {
  return {
    definition: {
      name: 'get_pending_approvals',
      description: 'Returns agent proposals waiting for orchestrator approval.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    handler(_args: Record<string, unknown>) {
      return { proposals: deps.getPendingApprovals() }
    },
  }
}
