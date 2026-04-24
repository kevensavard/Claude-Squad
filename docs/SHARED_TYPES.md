# Shared types convention

## The file

`src/types/shared.ts` is the single source of all types that cross agent boundaries. It is SHARED-RO — only the orchestrator writes to it, and only in response to `RequestSharedWrite` calls from other agents.

## What belongs here

A type belongs in `shared.ts` if it is used by code owned by more than one agent. Examples:
- `User`, `Session`, `Project` — used by auth agent AND frontend agent
- `Task`, `AgentStatus` — used by orchestrator AND all other agents
- `InvoiceLineItem` — used by billing agent AND PDF generation agent

A type does NOT belong here if it is internal to one agent's files only. Those go in a local `types.ts` within that agent's owned directory.

## Format

```typescript
// src/types/shared.ts
// AUTO-MANAGED: Do not edit directly. 
// Request changes via RequestSharedWrite tool.
// Last updated: {timestamp} by orchestrator

export interface User {
  id: string
  email: string
  displayName: string
  createdAt: string
}

export interface Session {
  id: string
  hostUserId: string
  status: 'lobby' | 'planning' | 'building' | 'done'
  createdAt: string
}

// ... etc
```

## Requesting a new shared type

When an agent needs a new shared type:

```
RequestSharedWrite({
  filePath: "src/types/shared.ts",
  changeDescription: "Need a new InvoiceLineItem type for the billing module",
  suggestedContent: `
export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unitPriceUSD: number
  totalUSD: number
}`
})
```

The orchestrator reviews the request (automated — it just applies it if it doesn't conflict), applies the change, commits to main, and notifies the requesting agent. The agent then pulls the latest `shared.ts` before proceeding.

## Import convention

All agents import shared types from the package path, not a relative path:

```typescript
// Correct
import type { User, Session } from '@squad/types'

// Wrong — breaks when the agent's cwd moves
import type { User } from '../../../types/shared'
```

The `packages/types` package re-exports everything from `shared.ts`. This is set up by the orchestrator as part of the monorepo initialization.
