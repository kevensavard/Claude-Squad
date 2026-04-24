import Anthropic from '@anthropic-ai/sdk'

export interface ProposalTask {
  id: string
  title: string
  description: string
  assignedAgentId: string
  fileOwnership: string[]
  dependsOn: string[]
  estimatedTokens: number
}

export interface ProposalCard {
  type: 'proposal'
  tasks: ProposalTask[]
  totalEstimatedTokens: number
  tokenSplitPreview: Record<string, number>
}

interface DecomposeOptions {
  spec: string
  agents: { agentId: string; userId: string }[]
  chatContext: string
  apiKey: string
}

export async function decomposeSpec(opts: DecomposeOptions): Promise<ProposalCard> {
  const { spec, agents, chatContext, apiKey } = opts
  const anthropic = new Anthropic({ apiKey })

  const systemPrompt = `You are the orchestrator for a multi-agent coding session.
You have ${agents.length} agents available: ${agents.map((a) => a.agentId).join(', ')}.

Decompose the spec into tasks buildable in parallel.

Rules:
1. No two tasks can own the same file path or glob.
2. File ownership must be exhaustive — every file created or modified must be in exactly one task's fileOwnership.
3. These are always SHARED-RO (orchestrator owns): src/types/shared.ts, package.json, tsconfig.json, .env.example
4. dependsOn must reference valid task ids within this proposal.
5. Estimate tokens per task (range: 2000–8000).
6. Assign tasks evenly across agents.
7. tokenSplitPreview maps userId to estimated tokens for that user's agent.

Return ONLY valid JSON matching this TypeScript type:
{
  type: 'proposal',
  tasks: Array<{
    id: string,
    title: string,
    description: string,
    assignedAgentId: string,
    fileOwnership: string[],
    dependsOn: string[],
    estimatedTokens: number,
  }>,
  totalEstimatedTokens: number,
  tokenSplitPreview: Record<string, number>,
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Spec:\n${spec}\n\nChat context:\n${chatContext}\n\nAgents:\n${JSON.stringify(agents, null, 2)}`,
    }],
  })

  const responseContent = response.content[0]
  const raw = responseContent && responseContent.type === 'text' ? responseContent.text : ''
  const match = /\{[\s\S]*\}/.exec(raw)
  if (!match) {
    throw new Error(`Orchestrator returned invalid JSON. Raw response: ${raw.slice(0, 200)}`)
  }
  let proposal: ProposalCard
  try {
    proposal = JSON.parse(match[0]) as ProposalCard
  } catch {
    throw new Error(`Orchestrator returned invalid JSON. Raw response: ${raw.slice(0, 200)}`)
  }

  if (!proposal || proposal.type !== 'proposal' || !Array.isArray(proposal.tasks)) {
    throw new Error('Orchestrator returned an unexpected response shape')
  }

  validateTaskGraph(proposal)
  return proposal
}

function validateTaskGraph(proposal: ProposalCard): void {
  const taskIds = new Set(proposal.tasks.map((t) => t.id))
  const allFiles = new Set<string>()

  for (const task of proposal.tasks) {
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        throw new Error(`Task "${task.id}" depends on unknown task "${dep}"`)
      }
    }
    for (const file of task.fileOwnership) {
      if (allFiles.has(file)) {
        throw new Error(`File "${file}" is claimed by multiple tasks`)
      }
      allFiles.add(file)
    }
  }

  // Circular dependency detection (DFS)
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(taskId: string): void {
    if (inStack.has(taskId)) throw new Error(`Circular dependency involving task "${taskId}"`)
    if (visited.has(taskId)) return
    visited.add(taskId)
    inStack.add(taskId)
    const task = proposal.tasks.find((t) => t.id === taskId)
    for (const dep of task?.dependsOn ?? []) dfs(dep)
    inStack.delete(taskId)
  }

  for (const task of proposal.tasks) dfs(task.id)
}
