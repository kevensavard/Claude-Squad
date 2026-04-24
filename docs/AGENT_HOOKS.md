# Agent hook system

This doc covers how the Claude Code SDK hooks are used to enforce file ownership, intercept dangerous commands, and stream agent status back to the group chat.

## SDK invocation pattern

Every agent in Squad runs as a `query()` call from `packages/agent-runner`. The runner is never a one-shot call — it is a long-running async loop that consumes the SDK's async iterator.

```typescript
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-code'

async function runAgent(agentId: string, sessionId: string, task: Task) {
  const contextInjection = await sss.getContextInjection(sessionId, agentId)

  for await (const message of query({
    prompt: task.description,
    options: {
      systemPrompt: contextInjection,
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      sandbox: { enabled: true },
      hooks: {
        PreToolUse: [
          { matcher: 'Write', hooks: [makeOwnershipHook(agentId, sessionId)] },
          { matcher: 'Edit',  hooks: [makeOwnershipHook(agentId, sessionId)] },
          { matcher: 'Bash',  hooks: [makeBashSafetyHook(agentId)] },
        ],
        PostToolUse: [
          { matcher: '*', hooks: [makeStatusBroadcastHook(agentId, sessionId)] },
        ],
        TaskCompleted: [
          { matcher: '*', hooks: [makeTaskDoneHook(agentId, sessionId, task)] },
        ],
      },
    },
  })) {
    await handleMessage(message, agentId, sessionId)
  }
}
```

## Hook: ownership enforcement (`PreToolUse` on Write + Edit)

```typescript
function makeOwnershipHook(agentId: string, sessionId: string) {
  return async (input: PreToolUseHookInput): Promise<HookDecision> => {
    const filePath = input.tool_input?.file_path ?? input.tool_input?.path
    if (!filePath) return {}  // allow — no path to check

    const ownership = await sss.getOwnership(sessionId, filePath)

    if (!ownership) {
      // File is unowned — this should not happen post-decomposition.
      // Block it and log the anomaly.
      await sss.broadcast(sessionId, {
        type: 'agent_blocked',
        agentId,
        taskId: input.context?.taskId ?? 'unknown',
        reason: `Attempted to write unowned file: ${filePath}`,
      })
      return {
        decision: 'block',
        reason: `${filePath} is not assigned to any task. This is a decomposition error. Stop and post a BLOCKED status.`,
      }
    }

    if (ownership.tier === 'shared-ro') {
      return {
        decision: 'block',
        reason: `${filePath} is a SHARED-RO file. Post a dependency request to the SSS instead of writing directly. Format: sss.requestSharedWrite(path, change_description).`,
      }
    }

    if (ownership.agentId !== agentId) {
      return {
        decision: 'block',
        reason: `${filePath} is owned by ${ownership.agentId}. You cannot write it. If you need an interface from that agent, consume it via the API contracts channel.`,
      }
    }

    return {}  // owned by this agent — allow
  }
}
```

## Hook: bash safety (`PreToolUse` on Bash)

Blocks commands that could corrupt shared state or the sandbox environment.

```typescript
function makeBashSafetyHook(agentId: string) {
  return async (input: PreToolUseHookInput): Promise<HookDecision> => {
    const command = input.tool_input?.command ?? ''

    const blocked = [
      { pattern: /rm\s+-rf\s+\//, reason: 'Recursive root deletion blocked' },
      { pattern: /git\s+push\s+.*--force/, reason: 'Force push blocked — use orchestrator merge flow' },
      { pattern: /git\s+checkout\s+main/, reason: 'Cannot switch to main branch — stay on your agent branch' },
      { pattern: /npm\s+install\s+-g/, reason: 'Global npm installs blocked in sandbox' },
      { pattern: /curl.*\|\s*sh/, reason: 'Piped shell execution blocked' },
    ]

    for (const { pattern, reason } of blocked) {
      if (pattern.test(command)) {
        return { decision: 'block', reason }
      }
    }

    // Warn but allow: git operations that cross branch boundaries
    if (/git\s+merge|git\s+rebase/.test(command)) {
      return {
        decision: 'block',
        reason: 'Do not merge/rebase manually. Signal DONE to the orchestrator and it handles merging.',
      }
    }

    return {}
  }
}
```

## Hook: status broadcast (`PostToolUse` on all tools)

After every tool execution, broadcast a compact status to the SSS so the group chat stays live.

```typescript
function makeStatusBroadcastHook(agentId: string, sessionId: string) {
  return async (input: PostToolUseHookInput): Promise<void> => {
    // Only broadcast on file writes — not every read
    if (!['Write', 'Edit'].includes(input.tool_name)) return

    const filePath = input.tool_input?.file_path ?? input.tool_input?.path
    if (!filePath) return

    await sss.broadcast(sessionId, {
      type: 'agent_message',
      agentId,
      content: `Wrote ${filePath}`,
      mode: 'status',
    })
  }
}
```

## Hook: task completion (`TaskCompleted`)

When Claude Code signals it's done, transition the task and trigger orchestrator review.

```typescript
function makeTaskDoneHook(agentId: string, sessionId: string, task: Task) {
  return async (input: TaskCompletedHookInput): Promise<void> => {
    // Update SSS
    await sss.send(sessionId, {
      type: 'task_done',
      agentId,
      taskId: task.id,
      tokensUsed: input.usage?.total_tokens ?? 0,
    })

    // Push agent branch to GitHub
    await githubClient.pushBranch(`agent-${agentId}`)

    // Broadcast to group chat
    await sss.broadcast(sessionId, {
      type: 'agent_message',
      agentId,
      content: `Task complete: ${task.title}. Branch pushed.`,
      mode: 'status',
    })
  }
}
```

## Message handler

The outer `for await` loop on `query()` yields different message types. Handle all of them:

```typescript
async function handleMessage(message: SDKMessage, agentId: string, sessionId: string) {
  switch (message.type) {
    case 'assistant':
      // Claude's text output — stream to group chat
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          await sss.broadcast(sessionId, {
            type: 'agent_message',
            agentId,
            content: block.text,
            mode: 'building',
          })
        }
      }
      break

    case 'result':
      if (message.subtype === 'error_max_turns') {
        // Agent hit turn limit — mark as blocked
        await sss.send(sessionId, {
          type: 'task_blocked',
          agentId,
          taskId: currentTaskId,
          reason: 'Agent reached max turns without completing task.',
        })
      }
      break

    case 'system':
      // SDK internal messages — log but don't broadcast
      console.log(`[${agentId}] system:`, message)
      break
  }
}
```

## Shared write request flow

When an agent needs to modify a SHARED-RO file (e.g., `package.json`, `src/types/shared.ts`), it cannot do so directly. Instead:

1. Agent calls a custom tool `RequestSharedWrite` (registered via `customTools` in SDK options)
2. The tool posts a request to SSS: `{ path, agentId, changeDescription, suggestedContent }`
3. SSS broadcasts `{ type: 'shared_write_request', ... }` to orchestrator
4. Orchestrator evaluates, batches with other pending requests, applies the write
5. Orchestrator broadcasts the update and notifies the requesting agent via a tool result

The `RequestSharedWrite` custom tool schema:
```typescript
{
  name: 'RequestSharedWrite',
  description: 'Request a change to a shared read-only file (package.json, shared types, etc). Do not attempt to write these files directly.',
  input_schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'The shared file to modify' },
      changeDescription: { type: 'string', description: 'What change you need and why' },
      suggestedContent: { type: 'string', description: 'Your suggested addition or modification' },
    },
    required: ['filePath', 'changeDescription'],
  },
}
```
