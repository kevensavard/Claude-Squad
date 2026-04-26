import WebSocket from 'ws'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { AgentRecord, Task, WatchEvent } from '@squad/types'
import {
  buildGetSessionStateTool,
  buildPostMessageTool,
  type StateCache,
} from './mcp-tools/shared.js'
import {
  buildWatchSessionTool,
  buildDispatchTasksTool,
  buildGetPendingApprovalsTool,
} from './mcp-tools/orchestrator.js'
import {
  buildGetAssignedTasksTool,
  buildClaimTaskTool,
  buildMarkTaskDoneTool,
} from './mcp-tools/agent.js'

export class EventQueue {
  private queue: WatchEvent[] = []
  private waiters: Array<(event: WatchEvent) => void> = []

  push(event: WatchEvent): void {
    if (this.waiters.length > 0) {
      this.waiters.shift()!(event)
    } else {
      this.queue.push(event)
    }
  }

  next(timeoutMs: number): Promise<WatchEvent> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!)
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(resolve)
        if (idx !== -1) this.waiters.splice(idx, 1)
        resolve({ type: 'idle' })
      }, timeoutMs)

      this.waiters.push((event) => {
        clearTimeout(timer)
        resolve(event)
      })
    })
  }
}

interface McpServerOptions {
  sessionId: string
  agentId: string
  role: 'orchestrator' | 'agent'
  partyUrl: string
}

export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  const { sessionId, agentId, role, partyUrl } = opts

  const state: StateCache & {
    pendingApprovals: Array<{
      proposalId: string
      agentId: string
      summary: string
      branchName?: string
      prUrl?: string
    }>
  } = {
    agents: {},
    tasks: {},
    recentMessages: [],
    pendingApprovals: [],
  }

  const eventQueue = new EventQueue()

  const wsUrl = `${partyUrl.replace(/^https?/, 'ws')}/parties/main/${sessionId}`
  let ws!: WebSocket
  let reconnectDelay = 1000
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null

  function connect(): void {
    ws = new WebSocket(wsUrl)

    ws.on('open', () => {
      reconnectDelay = 1000
      ws.send(
        JSON.stringify({
          type: 'register_agent',
          agentId,
          userId: agentId,
          displayName: `Claude Code (${role})`,
          role,
        })
      )
      heartbeatInterval = setInterval(() => {
        sendWs({ type: 'heartbeat', agentId })
      }, 30_000)
    })

    ws.on('message', (raw) => {
      let msg: { type: string; [k: string]: unknown }
      try {
        msg = JSON.parse(raw.toString()) as { type: string; [k: string]: unknown }
      } catch {
        return
      }
      handleServerMessage(msg)
    })

    ws.on('close', () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
        connect()
      }, reconnectDelay)
    })

    ws.on('error', () => {
      // handled by close event
    })
  }

  function handleServerMessage(msg: { type: string; [k: string]: unknown }): void {
    if (msg.type === 'agent_update') {
      const record = msg['payload'] as AgentRecord
      state.agents[record.agentId] = record
    }

    if (msg.type === 'task_update') {
      const task = msg['payload'] as Task
      state.tasks[task.id] = task
    }

    if (msg.type === 'build_started') {
      const tasks = msg['taskGraph'] as Task[]
      for (const t of tasks) {
        state.tasks[t.id] = t
      }
    }

    if (msg.type === 'agent_message') {
      state.recentMessages.push({
        from: msg['agentId'] as string,
        content: msg['content'] as string,
        timestamp: Date.now(),
      })
      if (state.recentMessages.length > 100) {
        state.recentMessages = state.recentMessages.slice(-100)
      }
    }

    if (msg.type === 'merge_conflict') {
      eventQueue.push({
        type: 'merge_conflict',
        conflictAgents: msg['conflictAgents'] as string[],
        round: msg['round'] as number,
        maxRounds: msg['maxRounds'] as number,
      })
    }

    if (role === 'orchestrator' && msg.type === 'route_to_agent') {
      const agentIdTarget = msg['agentId'] as string
      if (agentIdTarget === agentId) {
        const content = msg['content'] as string
        const requestId = msg['requestId'] as string
        const isBuildGoal = /\b(build|implement|create|add feature|write|develop)\b/i.test(
          content.slice(0, 120)
        )
        if (isBuildGoal) {
          eventQueue.push({ type: 'build_goal', from: 'user', content })
        } else {
          eventQueue.push({ type: 'mention', from: 'user', content, requestId })
        }
      }
    }
    // TODO: populate pendingApprovals when server sends proposal events (not yet defined in ServerMessage)
  }

  function sendWs(payload: object): void {
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected — retry after reconnection')
    }
    ws.send(JSON.stringify(payload))
  }

  connect()

  const sharedGetState = buildGetSessionStateTool({ getState: () => state })
  const sharedPostMessage = buildPostMessageTool({
    agentId,
    sendMessage: async (content) => {
      sendWs({ type: 'broadcast_agent_message', agentId, content, mode: 'brainstorm' })
    },
  })

  const allTools: Array<{
    definition: { name: string; description: string; inputSchema: object }
    handler: (a: Record<string, unknown>) => unknown
  }> = [sharedGetState, sharedPostMessage]

  if (role === 'orchestrator') {
    allTools.push(
      buildWatchSessionTool({ nextEvent: (ms) => eventQueue.next(ms) }),
      buildDispatchTasksTool({
        sendDispatch: async (tasks) => {
          sendWs({ type: 'orchestrator_dispatch', taskGraph: tasks })
        },
      }),
      buildGetPendingApprovalsTool({ getPendingApprovals: () => state.pendingApprovals })
    )
  } else {
    allTools.push(
      buildGetAssignedTasksTool({ agentId, getTasks: () => state.tasks }),
      buildClaimTaskTool({
        agentId,
        claimTask: async (taskId) => {
          sendWs({ type: 'task_claim', agentId, taskId })
        },
      }),
      buildMarkTaskDoneTool({
        agentId,
        onDone: async ({ taskId, summary, branchName, prUrl }) => {
          sendWs({ type: 'task_done', agentId, taskId, tokensUsed: 0 })
          const parts = [summary]
          if (branchName) parts.push(`Branch: ${branchName}`)
          if (prUrl) parts.push(`PR: ${prUrl}`)
          sendWs({
            type: 'broadcast_agent_message',
            agentId,
            content: `✅ Task done: ${parts.join('\n')}`,
            mode: 'build',
          })
        },
      })
    )
  }

  const server = new Server(
    { name: 'claude-squad', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => t.definition),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    const tool = allTools.find((t) => t.definition.name === name)
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      }
    }
    try {
      const result = await (
        tool.handler as (a: Record<string, unknown>) => unknown
      )(args as Record<string, unknown>)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: err instanceof Error ? err.message : 'Tool error',
          },
        ],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
