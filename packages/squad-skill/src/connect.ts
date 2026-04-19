import WebSocket from 'ws'
import Anthropic from '@anthropic-ai/sdk'

interface ConnectOptions {
  sessionId: string
  agentId: string
  apiKey: string
  partyUrl: string
}

interface RouteMessage {
  type: 'route_to_agent'
  agentId: string
  content: string
  mode: string
  requestId: string
}

interface RegisterMessage {
  type: 'agent_register'
  agentId: string
  source: 'local'
}

export async function connectToSession(opts: ConnectOptions): Promise<void> {
  const { sessionId, agentId, apiKey, partyUrl } = opts
  const anthropic = new Anthropic({ apiKey })

  const wsUrl = `${partyUrl}/parties/main/${sessionId}`
  console.log(`Connecting to ${wsUrl} as ${agentId}…`)

  const ws = new WebSocket(wsUrl)

  ws.on('open', () => {
    const register: RegisterMessage = { type: 'agent_register', agentId, source: 'local' }
    ws.send(JSON.stringify(register))
    console.log(`Connected. Listening for messages as ${agentId}`)
  })

  ws.on('message', async (raw) => {
    let msg: RouteMessage
    try {
      msg = JSON.parse(raw.toString()) as RouteMessage
    } catch {
      return
    }

    if (msg.type !== 'route_to_agent' || msg.agentId !== agentId) return

    console.log(`[${agentId}] received ${msg.mode} request: "${msg.content.slice(0, 60)}…"`)

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: msg.mode === 'status' ? 300 : 600,
        system: `You are ${agentId}, a collaborative AI agent in a Squad coding session. Be concise.`,
        messages: [{ role: 'user', content: msg.content }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''

      ws.send(JSON.stringify({
        type: 'agent_response',
        agentId,
        content: text,
        mode: msg.mode,
        requestId: msg.requestId,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      }))

      console.log(`[${agentId}] responded (${response.usage.output_tokens} tokens out)`)
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'agent_error',
        agentId,
        error: err instanceof Error ? err.message : 'Unknown error',
        requestId: msg.requestId,
      }))
    }
  })

  ws.on('close', () => {
    console.log('Disconnected from session')
    process.exit(0)
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message)
    process.exit(1)
  })

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log('\nDisconnecting…')
      ws.close()
      resolve()
    })
  })
}
