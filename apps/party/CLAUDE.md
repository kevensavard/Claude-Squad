# Claude instructions — apps/party (Partykit SSS)

You are building the Session State Server. Read `docs/systems/SESSION_STATE_SERVER.md` before writing any code here.

## This app's sole responsibility

Be the live shared brain for a squad session. Fast reads, reliable broadcasts, clean HTTP endpoints for agent hooks.

## File structure

```
apps/party/
  src/
    server.ts        ← Single Partykit server class (main file)
    storage.ts       ← Typed wrappers around Partykit storage
    context.ts       ← Context injection assembly logic
    heartbeat.ts     ← Heartbeat checking logic
    http.ts          ← HTTP endpoint handlers (called by agent hooks)
    broadcast.ts     ← Typed broadcast helpers
  package.json
  partykit.json      ← Partykit config
```

## Key implementation constraints

- `server.ts` exports a single default class implementing `Party.Server`
- All storage reads/writes go through `storage.ts` wrappers — never call `this.storage` directly in `server.ts`
- HTTP endpoints in `http.ts` must respond within 200ms — they are called synchronously from agent hooks. No slow operations (no external API calls, no heavy computation).
- The context injection assembly in `context.ts` must enforce the 3,800 token budget. Use a simple token estimator (chars / 4) — do not call the tokenizer API from inside Partykit.
- Broadcasts are fire-and-forget. Never await a broadcast inside an HTTP handler.

## Testing

Use `partykit dev` for local testing. Write integration tests using the Partykit test client. Every HTTP endpoint must have a test.
