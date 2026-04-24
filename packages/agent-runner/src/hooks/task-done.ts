import { broadcastAgentMessage, sendWsMessage, postTokenUpdate } from '../sss-client.js'
import type { SSSHttpOptions } from '../types.js'
import type { Task } from '@squad/types'
import type WebSocket from 'ws'
import type { GitHubClient } from '../github.js'

interface TaskCompletedInput {
  usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number }
}

export function makeTaskDoneHook(
  agentId: string,
  userId: string,
  task: Task,
  sssOpts: SSSHttpOptions,
  ws: WebSocket,
  github: GitHubClient | null
) {
  return async (input: TaskCompletedInput): Promise<void> => {
    const tokensIn = input.usage?.input_tokens ?? 0
    const tokensOut = input.usage?.output_tokens ?? 0
    const tokensUsed = input.usage?.total_tokens ?? (tokensIn + tokensOut)

    sendWsMessage(ws, { type: 'task_done', agentId, taskId: task.id, tokensUsed })

    await postTokenUpdate(sssOpts, { userId, tokensIn, tokensOut })

    if (github) {
      try {
        github.pushBranch(`agent-${agentId}`)
      } catch (err) {
        broadcastAgentMessage(ws, agentId, `Branch push failed: ${(err as Error).message}`, 'status')
      }
    }

    broadcastAgentMessage(ws, agentId, `Task complete: ${task.title}. Branch pushed.`, 'status')
  }
}
