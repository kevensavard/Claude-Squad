import Anthropic from '@anthropic-ai/sdk'

export type AgentMode = 'brainstorm' | 'review' | 'plan' | 'build' | 'status'

export async function classifyIntent(
  content: string,
  sessionContext: string,
  apiKey: string,
): Promise<{ mode: AgentMode; confidence: number }> {
  const anthropic = new Anthropic({ apiKey })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    system: `Classify the user's intent. Return only JSON: {"mode":"<mode>","confidence":<0.0-1.0>}

Modes:
- plan: ANY request to break work into tasks, create a task list, decompose a spec, outline steps, or structure a project. Keywords: "plan", "break into tasks", "break down", "task breakdown", "what tasks", "outline", "structure this", "decompose", "list the steps". If someone asks to split work into pieces, this is ALWAYS plan.
- brainstorm: open-ended ideas, opinions, exploration, "what do you think", discussion without a concrete deliverable
- review: critique or evaluate existing content — code, text, a design
- status: asking for progress update, "what's the status", "how far along"
- build: "build it now", "implement it", "write the code" (only after explicit plan approval — when in doubt do NOT use this)

When uncertain between plan and brainstorm, choose plan if the message contains any task/breakdown language.`,
    messages: [{ role: 'user', content: `Message: "${content}"\nContext: ${sessionContext}` }],
  })

  try {
    const raw = response.content[0]?.type === 'text' ? response.content[0]?.text : '{}'
    console.log('[classify] raw:', raw)
    const match = /\{[\s\S]*\}/.exec(raw)
    const parsed = JSON.parse(match?.[0] ?? '{}') as { mode?: AgentMode; confidence?: number }
    const VALID_MODES: AgentMode[] = ['brainstorm', 'review', 'plan', 'build', 'status']
    const rawMode = (parsed.mode as AgentMode | undefined) ?? 'brainstorm'
    const mode = VALID_MODES.includes(rawMode) ? rawMode : 'brainstorm'
    const confidence = parsed.confidence ?? 0.5
    // Never auto-classify as build — only reachable via Approve button
    return { mode: mode === 'build' ? 'brainstorm' : mode, confidence }
  } catch {
    return { mode: 'brainstorm', confidence: 0.5 }
  }
}
