# Token metering

## Attribution model

Every token consumed in a squad session is attributed to the user whose agent consumed it, except for one case: group chat @mentions are attributed to the user who sent the mention, not the agent's owner.

| Activity | Attributed to |
|----------|--------------|
| Agent building (Claude Code SDK) | Agent's owner |
| Agent responding to @mention from User A | User A (the mentioner) |
| Haiku intent classification | User who sent the @mention |
| Orchestrator planning (Sonnet) | Host user |
| Orchestrator merge sequence | Host user |
| Shared write LLM calls | Host user |

## Tracking

Token counts come from two sources:

1. **Claude Code SDK**: the `ResultMessage` at the end of a `query()` call contains `usage: { input_tokens, output_tokens }`. Also tracked per-turn inside the loop if the SDK message includes usage metadata.

2. **Direct Claude API calls**: `response.usage.input_tokens` and `response.usage.output_tokens` on every API response.

All token updates are sent to SSS via `POST /token-update` and also written to Supabase `token_usage` table at task completion.

## Session summary

At session end, the UI shows a per-user breakdown:

```typescript
interface SessionSummary {
  totalTokensIn: number
  totalTokensOut: number
  totalCostUSD: number
  perUser: {
    userId: string
    displayName: string
    tokensIn: number
    tokensOut: number
    estimatedCostUSD: number
    tasksCompleted: number
  }[]
}
```

Cost calculation uses current Anthropic pricing for the models used. Store model name with each usage record so future pricing changes don't retroactively alter historical costs.

## Live meter in UI

The group chat sidebar shows a live token meter per user, updated via SSS WebSocket broadcasts. Format: `12.4k tokens · ~$0.04` (abbreviated). Full breakdown shown on hover.
