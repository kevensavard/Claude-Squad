import { sendWsMessage } from '../sss-client.js'
import type WebSocket from 'ws'

export const publishContractSchema = {
  name: 'PublishApiContract',
  description: 'Publish an API contract (HTTP route or module export) to the SSS so other agents can consume it. Call this BEFORE implementing the route.',
  input_schema: {
    type: 'object' as const,
    properties: {
      routeKey: { type: 'string', description: 'Unique key: "POST /api/auth/login" or "module:exportName"' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
      path: { type: 'string', description: 'URL path (for HTTP contracts)' },
      description: { type: 'string', description: 'What this contract exposes' },
      requestSchema: { type: 'object', description: 'JSON Schema for the request body' },
      responseSchema: { type: 'object', description: 'JSON Schema for the success response' },
    },
    required: ['routeKey', 'description'] as string[],
  },
}

export function makePublishContractHandler(agentId: string, ws: WebSocket) {
  return async (input: {
    routeKey: string
    method?: string
    path?: string
    description: string
    requestSchema?: object
    responseSchema?: object
  }): Promise<string> => {
    const contract = {
      method: input.method ?? '',
      path: input.path ?? '',
      publishedByAgentId: agentId,
      requestSchema: input.requestSchema ?? {},
      responseSchema: input.responseSchema ?? {},
      publishedAt: new Date().toISOString(),
    }
    sendWsMessage(ws, { type: 'publish_contract', contract })
    return `Contract published: ${input.routeKey}. Other agents can now reference it.`
  }
}
