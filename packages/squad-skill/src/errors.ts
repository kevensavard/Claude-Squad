type ErrorContext = {
  agentId?: string
  available?: string[]
  host?: string
  sessionId?: string
}

type ErrorType = 'agent_not_found' | 'ws_refused' | 'bad_api_key' | 'session_not_found'

export function formatError(type: ErrorType, ctx: ErrorContext): string {
  switch (type) {
    case 'agent_not_found':
      return (
        `Agent '${ctx.agentId}' not found in this session.\n` +
        `Available agents: ${ctx.available?.join(', ') ?? 'none'}\n` +
        `Use --agent with one of the above IDs.`
      )
    case 'ws_refused':
      return (
        `Cannot reach SSS at ${ctx.host}.\n` +
        `Is 'pnpm dev' running? (or 'npx partykit dev' in apps/party/)`
      )
    case 'bad_api_key':
      return (
        `Anthropic API key rejected.\n` +
        `Verify your key starts with 'sk-ant-' and has remaining credits at console.anthropic.com.`
      )
    case 'session_not_found':
      return (
        `Session '${ctx.sessionId}' not found or invite link expired.\n` +
        `Ask the host to share a fresh invite link.`
      )
  }
}
