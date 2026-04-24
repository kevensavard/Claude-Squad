import { getContextInjection } from './sss-client.js'
import type { SSSHttpOptions } from './types.js'

export async function buildContextInjection(
  sssOpts: SSSHttpOptions,
  agentId: string
): Promise<string> {
  try {
    const injection = await getContextInjection(sssOpts, agentId)
    return injection.content
  } catch (err) {
    console.warn(`[${agentId}] Context injection unavailable: ${(err as Error).message}`)
    return `You are ${agentId}, a collaborative AI agent. The session state server is temporarily unavailable. Proceed with the task description provided in the prompt.`
  }
}
