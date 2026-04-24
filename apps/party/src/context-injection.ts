import type {
  SessionState,
  AgentRegistry,
  TaskQueue,
  ContractRegistry,
  ContextInjection,
} from '@squad/types'

const TOKEN_BUDGET = 3800
const CHARS_PER_TOKEN = 4
const CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN

interface AssembleOptions {
  agentId: string
  session: SessionState
  agents: AgentRegistry
  tasks: TaskQueue
  contracts: ContractRegistry
}

export function assembleContextInjection(opts: AssembleOptions): ContextInjection {
  const { agentId, session, agents, tasks, contracts } = opts

  const assignedTask = Object.values(tasks).find(
    (t) => t.assignedAgentId === agentId && t.status !== 'done' && t.status !== 'aborted'
  )
  if (!assignedTask) throw new Error(`No task assigned to agent ${agentId}`)

  const sections: string[] = []

  // 1. Project brief — never trimmed
  sections.push(`## Project\n${session.projectBrief}`)

  // 2. Assigned task — never trimmed
  const criteriaList = assignedTask.acceptanceCriteria.map((c) => `- ${c}`).join('\n')
  sections.push(
    `## Your task\n${assignedTask.title}\n${assignedTask.description}\n\nAcceptance criteria:\n${criteriaList}`
  )

  // 3. File ownership — never trimmed
  sections.push(`## Files you own\n${assignedTask.fileOwnership.join('\n')}`)

  // 4. Relevant API contracts
  const relevantContracts = Object.values(contracts).slice(0, 10)
  if (relevantContracts.length > 0) {
    const contractLines = relevantContracts
      .map((c) => `${c.method} ${c.path}`)
      .join('\n')
    sections.push(`## API contracts (what other agents will expose)\n${contractLines}`)
  } else {
    sections.push(`## API contracts (what other agents will expose)\nNone published yet.`)
  }

  // 5. Other agents — one-liners
  const otherAgents = Object.values(agents).filter((a) => a.agentId !== agentId)
  const agentLines = otherAgents
    .map(
      (a) =>
        `${a.displayName}: ${a.status}${a.currentTaskId ? ` (task: ${a.currentTaskId})` : ''}`
    )
    .join('\n')
  sections.push(`## Other agents\n${agentLines || 'None'}`)

  // 6. Agreed spec — first 1,000 chars
  const specExcerpt = session.agreedSpec.slice(0, 1000)
  sections.push(`## Agreed spec (excerpt)\n${specExcerpt}`)

  // 7. Recent decisions — last 5
  const recentDecisions = session.decisionLog.slice(-5)
  const decisionLines = recentDecisions
    .map((d) => `- ${d.summary} (by ${d.decidedBy})`)
    .join('\n')
  sections.push(`## Recent decisions\n${decisionLines || 'None yet'}`)

  // Assemble with budget enforcement — drop from bottom if over budget
  let content = sections.join('\n\n')

  if (content.length > CHAR_BUDGET) {
    // Drop section 6 (spec excerpt) first
    const withoutSpec = [...sections.slice(0, 5), ...sections.slice(6)].join('\n\n')
    if (withoutSpec.length <= CHAR_BUDGET) {
      content = withoutSpec
    } else {
      // Drop section 7 (decisions) too
      content = sections.slice(0, 5).join('\n\n')
    }
  }

  return {
    agentId,
    content,
    estimatedTokens: Math.ceil(content.length / CHARS_PER_TOKEN),
    assembledAt: new Date().toISOString(),
  }
}
