import { broadcastAgentMessage } from '../sss-client.js'
import type WebSocket from 'ws'

export const requestSharedWriteSchema = {
  name: 'RequestSharedWrite',
  description: 'Request a change to a shared read-only file (package.json, shared types, tsconfig.json, .env.example). Do not attempt to write these files directly.',
  input_schema: {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string', description: 'The shared file to modify' },
      changeDescription: { type: 'string', description: 'What change you need and why' },
      suggestedContent: { type: 'string', description: 'Your suggested addition or modification' },
    },
    required: ['filePath', 'changeDescription'] as string[],
  },
}

export function makeRequestSharedWriteHandler(agentId: string, ws: WebSocket) {
  return async (input: {
    filePath: string
    changeDescription: string
    suggestedContent?: string
  }): Promise<string> => {
    broadcastAgentMessage(
      ws,
      agentId,
      `[SharedWriteRequest] ${input.filePath}: ${input.changeDescription}`,
      'status'
    )
    return `Shared write request submitted for ${input.filePath}. Waiting for orchestrator to apply.`
  }
}
