import { input, password } from '@inquirer/prompts'

export interface GuidedOptions {
  sessionId: string
  agentId: string
  apiKey: string
}

export async function runGuidedMode(): Promise<GuidedOptions> {
  console.log('\nWelcome to Squad. Let\'s get you connected.\n')

  const sessionUrl = await input({
    message: 'Session URL (from the invite link):',
    validate: (v) => v.includes('/session/') ? true : 'Paste the full session URL (e.g. https://your-app.vercel.app/session/abc123)',
  })

  const sessionId = sessionUrl.split('/session/')[1]?.split('?')[0] ?? sessionUrl

  const agentId = await input({
    message: 'Your agent ID (shown in the session sidebar):',
    validate: (v) => v.startsWith('claude-') ? true : 'Agent ID must start with claude- (e.g. claude-u1)',
  })

  const apiKey = await password({
    message: 'Anthropic API key:',
    validate: (v) => v.startsWith('sk-ant-') ? true : 'API key must start with sk-ant-',
    mask: '*',
  })

  return { sessionId, agentId, apiKey }
}

export function printNonInteractiveHint(sessionId: string, agentId: string, apiKey: string): void {
  const masked = apiKey.slice(0, 10) + '...'
  console.log('\nTo skip this prompt next time:')
  console.log(`  npx @squad/skill --session ${sessionId} --agent ${agentId} --key ${masked}\n`)
}
