import WebSocket from 'ws'
import {
  query,
  createSdkMcpServer,
  tool,
  type SDKMessage,
  type SDKResultMessage,
  type HookInput,
  type HookJSONOutput,
  type Options,
} from '@anthropic-ai/claude-code'
import { z } from 'zod'
import type { Task } from '@squad/types'
import { buildContextInjection } from './context.js'
import { makeOwnershipHook } from './hooks/ownership.js'
import { makeBashSafetyHook } from './hooks/bash-safety.js'
import { makeStatusBroadcastHook } from './hooks/status-broadcast.js'
import { makeTaskDoneHook } from './hooks/task-done.js'
import { publishContractSchema, makePublishContractHandler } from './tools/publish-contract.js'
import { requestSharedWriteSchema, makeRequestSharedWriteHandler } from './tools/request-shared-write.js'
import { broadcastAgentMessage, sendWsMessage } from './sss-client.js'
import { createGitHubClient } from './github.js'
import type { RunAgentOptions } from './types.js'

// ─── SDK hook adapter types ──────────────────────────────────────────────────

type SimplePreHook = (input: { tool_name: string; tool_input: Record<string, unknown> }) => Promise<{ decision?: 'block'; reason?: string }>
type SimplePostHook = (input: { tool_name: string; tool_input: Record<string, unknown> }) => Promise<void>

function makePreToolHookCallback(hook: SimplePreHook) {
  return async (input: HookInput, _toolUseID: string | undefined, _opts: { signal: AbortSignal }): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== 'PreToolUse') return {}
    const result = await hook({ tool_name: input.tool_name, tool_input: input.tool_input as Record<string, unknown> })
    if (result.decision === 'block') {
      return { decision: 'block', reason: result.reason }
    }
    return {}
  }
}

function makePostToolHookCallback(hook: SimplePostHook) {
  return async (input: HookInput, _toolUseID: string | undefined, _opts: { signal: AbortSignal }): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== 'PostToolUse') return {}
    await hook({ tool_name: input.tool_name, tool_input: input.tool_input as Record<string, unknown> })
    return {}
  }
}

// ─── SDK loop ────────────────────────────────────────────────────────────────

async function runSDKLoop(params: {
  agentId: string
  task: Task
  workdir: string
  systemPrompt: string
  anthropicApiKey: string
  ownershipHook: ReturnType<typeof makeOwnershipHook>
  bashSafetyHook: ReturnType<typeof makeBashSafetyHook>
  statusBroadcastHook: ReturnType<typeof makeStatusBroadcastHook>
  taskDoneHook: ReturnType<typeof makeTaskDoneHook>
  publishContractHandler: ReturnType<typeof makePublishContractHandler>
  requestSharedWriteHandler: ReturnType<typeof makeRequestSharedWriteHandler>
  ws: WebSocket
}): Promise<void> {
  const {
    agentId, task, workdir, systemPrompt, anthropicApiKey,
    ownershipHook, bashSafetyHook, statusBroadcastHook, taskDoneHook,
    publishContractHandler, requestSharedWriteHandler, ws,
  } = params

  // Build custom MCP server with our tools
  const publishContractTool = tool(
    publishContractSchema.name,
    publishContractSchema.description,
    {
      routeKey: z.string().describe('Unique key: "POST /api/auth/login" or "module:exportName"'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().describe('HTTP method'),
      path: z.string().optional().describe('URL path (for HTTP contracts)'),
      description: z.string().describe('What this contract exposes'),
      requestSchema: z.record(z.unknown()).optional().describe('JSON Schema for the request body'),
      responseSchema: z.record(z.unknown()).optional().describe('JSON Schema for the success response'),
    },
    async (args, _extra) => {
      const result = await publishContractHandler(args)
      return { content: [{ type: 'text' as const, text: result }] }
    }
  )

  const requestSharedWriteTool = tool(
    requestSharedWriteSchema.name,
    requestSharedWriteSchema.description,
    {
      filePath: z.string().describe('The shared file to modify'),
      changeDescription: z.string().describe('What change you need and why'),
      suggestedContent: z.string().optional().describe('Your suggested addition or modification'),
    },
    async (args, _extra) => {
      const result = await requestSharedWriteHandler(args)
      return { content: [{ type: 'text' as const, text: result }] }
    }
  )

  const mcpServer = createSdkMcpServer({
    name: `squad-agent-${agentId}`,
    version: '0.0.1',
    tools: [publishContractTool, requestSharedWriteTool],
  })

  // Build SDK options
  const options: Options = {
    cwd: workdir,
    customSystemPrompt: systemPrompt,
    env: { ANTHROPIC_API_KEY: anthropicApiKey },
    permissionMode: 'acceptEdits',
    mcpServers: {
      [`squad-${agentId}`]: mcpServer,
    },
    hooks: {
      PreToolUse: [
        { hooks: [makePreToolHookCallback(ownershipHook)] },
        { matcher: 'Bash', hooks: [makePreToolHookCallback(bashSafetyHook)] },
      ],
      PostToolUse: [
        { hooks: [makePostToolHookCallback(statusBroadcastHook)] },
      ],
    },
  }

  const prompt = `${task.description}\n\nTask ID: ${task.id}\nTask Title: ${task.title}`

  broadcastAgentMessage(ws, agentId, `Running SDK query for task: ${task.title}`, 'building')

  const queryStream = query({ prompt, options })

  for await (const message of queryStream as AsyncIterable<SDKMessage>) {
    if (message.type === 'result') {
      const resultMsg = message as SDKResultMessage
      await taskDoneHook({
        usage: {
          input_tokens: resultMsg.usage.input_tokens,
          output_tokens: resultMsg.usage.output_tokens,
          total_tokens: resultMsg.usage.input_tokens + resultMsg.usage.output_tokens,
        },
      })
      if (resultMsg.is_error) {
        const errorMsg = 'subtype' in resultMsg && resultMsg.subtype !== 'success'
          ? resultMsg.subtype
          : 'unknown error'
        broadcastAgentMessage(ws, agentId, `Task ended with error: ${errorMsg}`, 'status')
      }
    } else if (message.type === 'assistant') {
      // Stream assistant progress — extract text if present
      const content = message.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            broadcastAgentMessage(ws, agentId, block.text.slice(0, 200), 'building')
          }
        }
      }
    }
    // system and stream_event messages are handled silently
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const { agentId, userId, sessionId, task, partyHost, anthropicApiKey, githubToken, workdir } = opts
  const sssOpts = { partyHost, sessionId }

  // Connect WebSocket to SSS
  const wsScheme = partyHost.startsWith('localhost') ? 'ws' : 'wss'
  const ws = new WebSocket(`${wsScheme}://${partyHost}/parties/main/${sessionId}`)

  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })

  sendWsMessage(ws, { type: 'update_status', agentId, status: 'building' })
  sendWsMessage(ws, { type: 'task_claim', agentId, taskId: task.id })

  const heartbeatInterval = setInterval(() => {
    sendWsMessage(ws, { type: 'heartbeat', agentId })
  }, 30_000)

  // GitHub client (optional)
  let github = null
  if (githubToken) {
    const parts = workdir.replace(/\\/g, '/').split('/')
    if (parts.length >= 2) {
      github = createGitHubClient({
        token: githubToken,
        owner: parts[parts.length - 2],
        repo: parts[parts.length - 1],
        workdir,
      })
    }
  }

  const systemPrompt = await buildContextInjection(sssOpts, agentId)
  const ownershipHook = makeOwnershipHook(agentId, task.id, sssOpts, ws)
  const bashSafetyHook = makeBashSafetyHook()
  const statusBroadcastHook = makeStatusBroadcastHook(agentId, ws)
  const taskDoneHook = makeTaskDoneHook(agentId, userId, task, sssOpts, ws, github)
  const publishContractHandler = makePublishContractHandler(agentId, ws)
  const requestSharedWriteHandler = makeRequestSharedWriteHandler(agentId, ws)

  broadcastAgentMessage(ws, agentId, `Starting task: ${task.title}`, 'status')

  try {
    await runSDKLoop({
      agentId, task, workdir, systemPrompt, anthropicApiKey,
      ownershipHook, bashSafetyHook, statusBroadcastHook, taskDoneHook,
      publishContractHandler, requestSharedWriteHandler, ws,
    })
  } finally {
    clearInterval(heartbeatInterval)
    sendWsMessage(ws, { type: 'update_status', agentId, status: 'idle' })
    ws.close()
  }
}
