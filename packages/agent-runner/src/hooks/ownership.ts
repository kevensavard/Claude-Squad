import { getOwnership, broadcastAgentMessage, isSharedRO } from '../sss-client.js'
import type { SSSHttpOptions } from '../types.js'
import type WebSocket from 'ws'

interface PreToolUseInput {
  tool_name: string
  tool_input: Record<string, unknown>
}

interface HookDecision {
  decision?: 'block'
  reason?: string
}

export function makeOwnershipHook(
  agentId: string,
  taskId: string,
  sssOpts: SSSHttpOptions,
  ws: WebSocket
) {
  return async (input: PreToolUseInput): Promise<HookDecision> => {
    const filePath = (input.tool_input.file_path ?? input.tool_input.path) as string | undefined
    if (!filePath) return {}

    if (isSharedRO(filePath)) {
      return {
        decision: 'block',
        reason: `${filePath} is a SHARED-RO file. Use RequestSharedWrite({ filePath, changeDescription, suggestedContent }) instead of writing directly.`,
      }
    }

    let ownership: Awaited<ReturnType<typeof getOwnership>>
    try {
      ownership = await getOwnership(sssOpts, filePath)
    } catch {
      broadcastAgentMessage(ws, agentId, `SSS unreachable — blocking write to ${filePath}`, 'status')
      return { decision: 'block', reason: 'SSS unavailable — cannot verify ownership' }
    }

    if (!ownership.owned) {
      broadcastAgentMessage(ws, agentId, `Blocked: unowned file ${filePath}`, 'status')
      return {
        decision: 'block',
        reason: `${filePath} is not assigned to any task. This is a decomposition error. Stop and post a BLOCKED status.`,
      }
    }

    if (ownership.agentId !== agentId) {
      return {
        decision: 'block',
        reason: `${filePath} is owned by ${ownership.agentId}. Consume its interface via API contracts instead.`,
      }
    }

    return {}
  }
}
