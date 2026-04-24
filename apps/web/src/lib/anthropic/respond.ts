import Anthropic from '@anthropic-ai/sdk'
import type { AgentMode } from './classify'
import type { Message } from '@/types/database'

interface RespondOptions {
  mode: AgentMode
  content: string
  chatContext: Message[]
  agentId: string
  apiKey: string
}

interface ResponseResult {
  text: string
  tokensIn: number
  tokensOut: number
}

// AGENT_ID is replaced at call time with the real agentId via String.replace()
const MODE_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  brainstorm: `You are AGENT_ID, a collaborative AI agent in a Squad coding session. Your role is to brainstorm, share opinions, and explore ideas with the team. Be concise and concrete — 2-4 paragraphs max. Never write code unless explicitly asked.`,
  review: `You are AGENT_ID, reviewing content in a Squad coding session. Give structured, actionable feedback. If reviewing code, point out specific issues with line references. Be direct.`,
  plan: `You are AGENT_ID, the orchestrator in a Squad coding session. Decompose the request into a concrete task plan.`,
  build: `You are AGENT_ID, reporting build progress.`,
  status: `You are AGENT_ID, providing a status update. Be concise — one line per agent.`,
}

export async function generateResponse(opts: RespondOptions): Promise<ResponseResult> {
  const { mode, content, chatContext, agentId, apiKey } = opts
  const anthropic = new Anthropic({ apiKey })

  const systemPrompt = MODE_SYSTEM_PROMPTS[mode].replace('AGENT_ID', agentId)

  const filtered = chatContext
    .slice(-30)
    .filter((m) => m.sender_type === 'human' || m.sender_type === 'agent')

  // Collapse consecutive same-role messages — Anthropic API requires alternating user/assistant turns
  const contextMessages: Anthropic.MessageParam[] = []
  for (const m of filtered) {
    const role = m.sender_type === 'human' ? 'user' : 'assistant'
    const last = contextMessages.at(-1)
    if (last && last.role === role) {
      last.content += '\n\n' + m.content
    } else {
      contextMessages.push({ role, content: m.content })
    }
  }

  // Extract code block from content for review mode
  const codeBlock = mode === 'review' ? extractCodeBlock(content) : null
  const userContent = codeBlock
    ? `${content.replace(/```[\w]*\n[\s\S]+?```/, '').trim()}\n\nCode to review:\n\`\`\`\n${codeBlock}\n\`\`\``
    : content

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: mode === 'status' ? 300 : mode === 'brainstorm' ? 600 : mode === 'review' ? 1500 : 1000,
    system: systemPrompt,
    messages: [
      ...contextMessages,
      { role: 'user', content: userContent },
    ],
  })

  const responseContent = response.content[0]
  const text = responseContent && responseContent.type === 'text' ? responseContent.text : ''
  return {
    text,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  }
}

function extractCodeBlock(content: string): string | null {
  const match = /```[\w]*\n([\s\S]+?)```/.exec(content)
  return match?.[1] ?? null
}
