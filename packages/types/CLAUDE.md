# Claude instructions — packages/types

This package contains all TypeScript types shared across `apps/web`, `apps/party`, and `packages/agent-runner`. It contains **only types and constants** — no logic, no runtime code, no external dependencies other than TypeScript itself.

## Rules

- No functions. No classes. No runtime logic. Types and `const` enums only.
- Every type exported here must be used in at least two different packages. If a type is only used in one package, it stays local to that package.
- Export everything from `src/index.ts`. Consumers import from `@squad/types`, never from deep paths.
- When you add a type here, also add it to the `src/index.ts` export list.

## File structure

```
packages/types/
  src/
    index.ts           ← Re-exports everything
    session.ts         ← Session, SessionMember, SessionStatus
    agent.ts           ← AgentRecord, AgentMode, AgentStatus
    task.ts            ← Task, TaskStatus
    message.ts         ← Message, ProposalCard, BuildSummary
    contract.ts        ← ApiContract
    token.ts           ← TokenMeter, TokenUsage
    agent-colors.ts    ← AGENT_COLORS constant + getAgentColor()
  package.json
  tsconfig.json
```

## package.json

```json
{
  "name": "@squad/types",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

This package is consumed via TypeScript path aliases — no build step needed. Both consuming apps have `"@squad/types": ["../../packages/types/src/index.ts"]` in their `tsconfig.json` paths.

## Type source of truth

All types here must match the storage schema in `docs/systems/SESSION_STATE_SERVER.md` exactly. If you change a type here, check whether the SSS storage schema needs updating too. They must stay in sync.
