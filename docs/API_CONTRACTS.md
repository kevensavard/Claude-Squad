# API contracts

API contracts are the primary mechanism by which agents communicate interface shapes to each other without sharing context windows. An agent that owns a backend route publishes its contract before building the route. An agent that needs to call that route reads the contract from SSS instead of guessing.

## When to publish

An agent MUST publish a contract before building any of the following:
- An HTTP endpoint another agent will call
- A function exported from a file another agent will import
- A database query function another agent's code depends on

Publish early — ideally as the first thing in a task, before writing the implementation — so dependent agents aren't blocked.

## Contract format

```typescript
interface ApiContract {
  // Unique key — used as the SSS lookup key
  // Format for HTTP routes: "METHOD /path" e.g. "POST /api/auth/login"
  // Format for module exports: "module:exportName" e.g. "db:getUserById"
  routeKey: string

  type: 'http' | 'module'

  // HTTP contracts
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path?: string
  requestSchema?: JSONSchema
  responseSchema?: JSONSchema
  errorResponses?: Record<number, JSONSchema>

  // Module contracts
  modulePath?: string       // e.g. "src/db/users.ts"
  exportName?: string       // e.g. "getUserById"
  signature?: string        // TypeScript signature as a string
  returnType?: string       // TypeScript return type as a string

  // Metadata
  publishedByAgentId: string
  publishedByTaskId: string
  description: string
  publishedAt: string
}
```

## Publishing a contract

Agents publish via the `PublishApiContract` custom tool (registered in the SDK options):

```typescript
// Agent calls:
PublishApiContract({
  routeKey: "POST /api/auth/login",
  type: "http",
  method: "POST",
  path: "/api/auth/login",
  description: "Authenticates a user and returns a JWT token",
  requestSchema: {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 }
    },
    required: ["email", "password"]
  },
  responseSchema: {
    type: "object",
    properties: {
      token: { type: "string" },
      expiresAt: { type: "string", format: "date-time" }
    },
    required: ["token", "expiresAt"]
  },
  errorResponses: {
    401: { type: "object", properties: { error: { type: "string" } } }
  }
})
```

The SSS stores this and broadcasts `{ type: 'contract_published', contract }` to all agents. The UI shows a "New contract: POST /api/auth/login" notification in the build activity feed.

## Reading a contract

In a context injection, contracts relevant to the agent's task are included automatically (see SESSION_STATE_SERVER.md). But agents can also explicitly request a contract via the `ReadApiContract` custom tool:

```typescript
ReadApiContract({ routeKey: "POST /api/auth/login" })
// Returns the full ApiContract object
```

## Contract violations

If an agent implements a route differently from its published contract (different response shape, etc.), this is a contract violation. There is no automated enforcement at runtime — the contract is a coordination tool, not a runtime schema validator. The orchestrator reviews contracts at merge time and can reject a merge if an implementation obviously deviates.

In practice, the agent that published the contract built the implementation. Violations typically come from misunderstanding, which is why publishing early (before implementation) helps — the contract becomes part of the context injection for the implementing agent.
