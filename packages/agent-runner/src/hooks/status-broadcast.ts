import { broadcastAgentMessage } from '../sss-client.js'
import type WebSocket from 'ws'

interface PostToolUseInput {
  tool_name: string
  tool_input: Record<string, unknown>
}

export function makeStatusBroadcastHook(agentId: string, ws: WebSocket) {
  return async (input: PostToolUseInput): Promise<void> => {
    if (!['Write', 'Edit'].includes(input.tool_name)) return
    const filePath = (input.tool_input.file_path ?? input.tool_input.path) as string | undefined
    if (!filePath) return
    broadcastAgentMessage(ws, agentId, `Wrote ${filePath}`, 'status')
  }
}
