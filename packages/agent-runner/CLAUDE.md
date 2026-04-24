# Claude instructions — packages/agent-runner

You are building the agent runner. Read `docs/systems/AGENT_HOOKS.md` in full before writing any code here. This is the most technically sensitive package — errors here corrupt the codebase.

## This package's responsibility

Wrap the Claude Code SDK. Enforce ownership. Stream status. Handle lifecycle.

## File structure

```
packages/agent-runner/
  src/
    runner.ts          ← Main runAgent() function
    hooks/
      ownership.ts     ← makeOwnershipHook()
      bash-safety.ts   ← makeBashSafetyHook()
      status-broadcast.ts ← makeStatusBroadcastHook()
      task-done.ts     ← makeTaskDoneHook()
    tools/
      publish-contract.ts  ← PublishApiContract custom tool
      request-shared-write.ts ← RequestSharedWrite custom tool
    context.ts         ← buildContextInjection() — fetches from SSS
    github.ts          ← Branch create, push, PR operations via Octokit
    sss-client.ts      ← HTTP + WebSocket client for SSS
    types.ts           ← Package-local types
  package.json
```

## Non-negotiable implementation rules

1. **Every hook must be a pure async function** — no side effects other than SSS calls and broadcasting. No shared mutable state between hook invocations.

2. **Ownership checks are synchronous HTTP to SSS** — the hook must `await` the ownership check before returning a decision. Do not cache ownership in memory. The SSS is the authoritative source.

3. **Never catch and swallow errors in hooks.** If the SSS is unreachable, the hook should return `{ decision: 'block', reason: 'SSS unavailable — cannot verify ownership' }`. It is safer to block than to allow blindly.

4. **The `query()` loop must handle all message types** — including `system` type messages. Unhandled message types cause silent failures.

5. **Token tracking happens at two levels:** per-tool-call (rough, from status messages) and at task completion (exact, from ResultMessage). Both are reported to SSS. Do not report only one.

6. **The runner is stateless** — it reads everything it needs from SSS on startup. It does not store task state locally. If the runner crashes and restarts, it must be able to reconstruct its context from SSS alone.

## Testing

- Unit test each hook in isolation by mocking the SSS HTTP client
- Integration test the full `runAgent()` with a real Claude Code SDK call in a sandbox (use a simple "write hello world to test.txt" task)
- Never run agent tests against a production Anthropic API key. Use the `ANTHROPIC_API_KEY_TEST` env var which points to a test key with strict rate limits.
