# Orchestrator agent

The orchestrator is always the host user's agent (`claude-1`). It has elevated responsibilities compared to regular agents: it decomposes work, validates the task graph, dispatches tasks, monitors progress, handles blockers, and runs the merge sequence. It is the only agent that can write SHARED-RO files directly.

## Identity and privileges

```typescript
const ORCHESTRATOR_PERMISSIONS = {
  canWriteSharedRO: true,
  canDispatchTasks: true,
  canMergeBranches: true,
  canModifyTaskGraph: true,
}
```

The orchestrator's `agentId` is always `claude-1` and its `userId` is the host's user ID.

## Plan mode — decomposition

When the orchestrator receives a `plan` intent request, it runs a dedicated Claude Sonnet API call (not Claude Code SDK — this is pure reasoning, no filesystem ops needed).

```typescript
async function decomposeSpec(
  spec: string,
  agents: AgentRecord[],
  chatContext: string
): Promise<ProposalCard> {

  const systemPrompt = `You are the orchestrator for a multi-agent coding session.
You have ${agents.length} agents available: ${agents.map(a => a.agentId).join(', ')}.

Your job: decompose the spec into tasks that can be built in parallel.

Rules you must follow:
1. No two tasks can own the same file path or glob pattern.
2. File ownership must be exhaustive — every file that will be created or modified must be assigned to exactly one task.
3. These paths are always SHARED-RO (orchestrator owns them): src/types/shared.ts, package.json, tsconfig.json, .env.example, README.md, prisma/schema.prisma (if applicable)
4. Tasks with dependencies must list them explicitly. A task can only start when all its dependsOn tasks are done.
5. Each task must have 3-5 clear acceptance criteria.
6. Estimate tokens per task (typical range: 2000–8000 per task).
7. Assign tasks evenly across agents when possible.

Return ONLY a JSON object matching the ProposalCard schema. No prose.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Spec:\n${spec}\n\nChat context:\n${chatContext}\n\nAgents available:\n${JSON.stringify(agents, null, 2)}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const proposal: ProposalCard = JSON.parse(text)

  // Validate before returning
  validateTaskGraph(proposal.tasks)

  return proposal
}
```

## Task graph validation

Run this before any ProposalCard is sent to the group chat. Throw descriptive errors — the orchestrator must fix the proposal before showing it to users.

```typescript
function validateTaskGraph(tasks: ProposalCard['tasks']): void {
  const allOwnedPaths = new Set<string>()

  for (const task of tasks) {
    // Check for ownership overlaps
    for (const pattern of task.fileOwnership) {
      if (allOwnedPaths.has(pattern)) {
        throw new Error(`Ownership conflict: "${pattern}" claimed by multiple tasks`)
      }
      allOwnedPaths.add(pattern)
    }

    // Check that all dependsOn references exist
    for (const dep of task.dependsOn) {
      if (!tasks.find(t => t.id === dep)) {
        throw new Error(`Task ${task.id} depends on unknown task ${dep}`)
      }
    }
  }

  // Check for circular dependencies (DFS)
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(taskId: string): void {
    visited.add(taskId)
    inStack.add(taskId)
    const task = tasks.find(t => t.id === taskId)!
    for (const dep of task.dependsOn) {
      if (inStack.has(dep)) throw new Error(`Circular dependency: ${taskId} → ${dep}`)
      if (!visited.has(dep)) dfs(dep)
    }
    inStack.delete(taskId)
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) dfs(task.id)
  }
}
```

## Build dispatch (post-Approve)

After the host clicks Approve:

```typescript
async function dispatchBuild(proposal: ProposalCard, sessionId: string): Promise<void> {
  // 1. Write all tasks and ownership to SSS
  await sss.send(sessionId, { type: 'dispatch_tasks', tasks: proposal.tasks })

  // Register all file ownerships
  for (const task of proposal.tasks) {
    for (const pattern of task.fileOwnership) {
      await sss.http.post(`/ownership`, {
        path: pattern,
        agentId: task.assignedAgentId,
        taskId: task.id,
        tier: 'owned',
      })
    }
  }

  // Register SHARED-RO files
  const sharedRO = ['src/types/shared.ts', 'package.json', 'tsconfig.json', '.env.example']
  for (const path of sharedRO) {
    await sss.http.post(`/ownership`, {
      path,
      agentId: 'claude-1',
      taskId: 'shared',
      tier: 'shared-ro',
    })
  }

  // 2. Create per-agent branches in GitHub
  for (const agent of getUniqueAgents(proposal.tasks)) {
    await github.createBranch(`agent-${agent}`, 'main')
  }

  // 3. Spawn agent runners in parallel
  const agentTasks = groupTasksByAgent(proposal.tasks)
  await Promise.all(
    Object.entries(agentTasks).map(([agentId, tasks]) =>
      spawnAgentRunner(agentId, sessionId, tasks)
    )
  )
}
```

## Progress monitoring

The orchestrator listens to SSS broadcasts while agents work.

```typescript
// In the orchestrator's Partykit WebSocket listener:
function handleSSBroadcast(msg: ServerMessage) {
  switch (msg.type) {
    case 'agent_blocked':
      handleBlocker(msg.agentId, msg.taskId, msg.reason)
      break
    case 'task_update':
      checkAllTasksComplete(msg)
      break
    case 'heartbeat_lost':
      handleAgentOffline(msg.agentId)
      break
  }
}
```

### Blocker handling

When an agent posts BLOCKED:
1. Orchestrator reads the `blockedReason`
2. If it's a dependency issue (waiting for another agent's output): wait and re-notify when the dependency task completes
3. If it's a missing interface (needs an API contract not yet published): post a system message to group chat asking the owning agent to publish their contract first
4. If it's an unexpected error: post to group chat for human review. Include the error and suggest options.
5. If the blockage persists > 5 minutes with no resolution: surface it prominently in chat with an escalation card

### Offline agent handling

When a heartbeat is lost:
1. Release that agent's file ownerships
2. Check if any tasks were `in_progress` for them — reset to `pending`
3. Post group chat notice: "Claude (Username) went offline. N tasks released. Tap here to reassign."
4. The UI shows a reassignment UI that lets other users claim orphaned tasks

## Shared write handling

When an agent posts a `RequestSharedWrite`:

```typescript
async function handleSharedWriteRequest(req: SharedWriteRequest): Promise<void> {
  // Buffer requests for up to 5 seconds to batch them
  sharedWriteBuffer.push(req)

  if (!batchTimer) {
    batchTimer = setTimeout(async () => {
      await applyBatchedSharedWrites(sharedWriteBuffer)
      sharedWriteBuffer = []
      batchTimer = null
    }, 5000)
  }
}

async function applyBatchedSharedWrites(requests: SharedWriteRequest[]): Promise<void> {
  // Group by file
  const byFile = groupBy(requests, r => r.filePath)

  for (const [filePath, fileRequests] of Object.entries(byFile)) {
    // Read current file content
    const current = await fs.readFile(filePath, 'utf8')

    // Ask Claude to apply all changes
    const updated = await applyChangesViaLLM(current, fileRequests)

    // Write (orchestrator owns SHARED-RO files)
    await fs.writeFile(filePath, updated)

    // Notify requesting agents
    for (const req of fileRequests) {
      await sss.broadcast(sessionId, {
        type: 'agent_message',
        agentId: 'claude-1',
        content: `Shared write applied to ${filePath} (requested by ${req.agentId})`,
        mode: 'status',
      })
    }
  }
}
```

## Merge sequence

Triggered when all tasks reach `done` status:

```typescript
async function runMergeSequence(sessionId: string): Promise<void> {
  const tasks = await sss.getTasks(sessionId)
  const agentIds = [...new Set(tasks.map(t => t.assignedAgentId))]

  // 1. Fetch all agent branches
  const branches = await Promise.all(
    agentIds.map(id => github.getBranch(`agent-${id}`))
  )

  // 2. Create a merge branch
  await github.createBranch('squad-merge', 'main')

  // 3. Merge each agent branch in dependency order
  const mergeOrder = topologicalSort(tasks)
  const conflicts: string[] = []

  for (const agentId of mergeOrder) {
    const result = await github.mergeBranch(`agent-${agentId}`, 'squad-merge')
    if (result.conflicts) {
      conflicts.push(...result.conflicts.map(c => `${agentId}: ${c}`))
    }
  }

  if (conflicts.length > 0) {
    // Surface in group chat — human must resolve
    await insertSystemMessage(sessionId, {
      content: `Merge conflicts detected. Please resolve before completing.`,
      metadata: { type: 'merge_conflicts', conflicts },
    })
    return
  }

  // 4. Run tests in a clean sandbox
  const testResult = await runTestsInSandbox('squad-merge')

  // 5. Create PR
  const pr = await github.createPR({
    title: `Squad build: ${session.projectBrief.slice(0, 60)}`,
    head: 'squad-merge',
    base: 'main',
    body: buildPRDescription(tasks, testResult),
  })

  // 6. Post build summary to group chat
  await insertSystemMessage(sessionId, {
    content: `Build complete.`,
    metadata: {
      type: 'build_summary',
      prUrl: pr.html_url,
      tasksCompleted: tasks.length,
      totalTokens: tasks.reduce((sum, t) => sum + (t.actualTokens ?? 0), 0),
      testsPassed: testResult.passed,
      testsFailed: testResult.failed,
    },
  })
}
```
