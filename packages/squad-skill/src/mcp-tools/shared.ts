import type { AgentRecord, Task } from '@squad/types'

export interface StateCache {
  agents: Record<string, AgentRecord>
  tasks: Record<string, Task>
  recentMessages: Array<{ from: string; content: string; timestamp: number }>
}

export function buildGetSessionStateTool(deps: {
  getState: () => StateCache
}) {
  return {
    definition: {
      name: 'get_session_state',
      description: 'Returns current session snapshot: agents with roles/status, recent messages, active tasks.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    handler(_args: Record<string, unknown>) {
      const state = deps.getState()
      return {
        agents: state.agents,
        tasks: state.tasks,
        recentMessages: state.recentMessages.slice(-20),
      }
    },
  }
}

export function buildPostMessageTool(deps: {
  agentId: string
  sendMessage: (content: string) => Promise<void>
}) {
  return {
    definition: {
      name: 'post_message',
      description: 'Posts a message to the group chat as this agent.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          content: { type: 'string', description: 'Message to post' },
        },
        required: ['content'],
      },
    },
    async handler(args: Record<string, unknown>) {
      const content = args['content'] as string
      await deps.sendMessage(content)
      return { ok: true }
    },
  }
}
