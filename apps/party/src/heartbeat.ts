import type { AgentRegistry, TaskQueue } from '@squad/types'

const HEARTBEAT_TIMEOUT_MS = 90_000

interface CheckHeartbeatsInput {
  agents: AgentRegistry
  tasks: TaskQueue
  now: number
}

interface CheckHeartbeatsResult {
  offlineAgentIds: string[]
  updatedAgents: AgentRegistry
  releasedTaskIds: string[]
  updatedTasks: TaskQueue
  releasedOwnershipPaths: string[]
}

export function checkHeartbeats(input: CheckHeartbeatsInput): CheckHeartbeatsResult {
  const { agents, tasks, now } = input

  const offlineAgentIds: string[] = []
  const updatedAgents: AgentRegistry = { ...agents }
  const releasedTaskIds: string[] = []
  const updatedTasks: TaskQueue = { ...tasks }
  const releasedOwnershipPaths: string[] = []

  for (const agent of Object.values(agents)) {
    const isExpired = now - agent.lastHeartbeat > HEARTBEAT_TIMEOUT_MS
    if (!isExpired) continue

    offlineAgentIds.push(agent.agentId)
    updatedAgents[agent.agentId] = { ...agent, status: 'offline' }

    // Release in_progress tasks owned by this agent
    for (const task of Object.values(tasks)) {
      if (task.assignedAgentId !== agent.agentId) continue
      if (task.status !== 'in_progress') continue

      releasedTaskIds.push(task.id)
      releasedOwnershipPaths.push(...task.fileOwnership)
      updatedTasks[task.id] = { ...task, status: 'pending' }
    }
  }

  return {
    offlineAgentIds,
    updatedAgents,
    releasedTaskIds,
    updatedTasks,
    releasedOwnershipPaths,
  }
}
