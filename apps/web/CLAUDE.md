# Claude instructions — apps/web (Next.js)

You are building the Squad web app. Read `docs/systems/GROUP_CHAT.md` before building any chat-related code. Read `docs/systems/ORCHESTRATOR.md` before building the approve/dispatch flow.

## This app's responsibilities

- Auth (Supabase Auth)
- Session creation and join flows
- Group chat UI (real-time via Supabase Realtime)
- @mention routing API route
- Approve/build dispatch API route
- ProposalCard and all agent message UI components
- Token meter UI in presence sidebar
- Session summary and history pages

## File structure

```
apps/web/
  src/
    app/                    ← Next.js App Router
      (auth)/
        login/page.tsx
        callback/route.ts   ← Supabase auth callback
      session/
        [id]/
          page.tsx          ← Main group chat page
          layout.tsx
      api/
        mention/route.ts    ← @mention handler
        approve/route.ts    ← Build approval handler
        merge/route.ts      ← Merge trigger (orchestrator calls this)
        session/route.ts    ← Session CRUD
    components/
      chat/
        MessageList.tsx
        MessageInput.tsx
        AgentMessage.tsx
        ProposalCard.tsx
        BuildSummaryCard.tsx
        SystemMessage.tsx
      presence/
        PresenceSidebar.tsx
        AgentStatusPill.tsx
        TokenMeter.tsx
      ui/                   ← Generic reusable UI components
    lib/
      supabase/
        client.ts           ← Browser Supabase client
        server.ts           ← Server Supabase client (for API routes)
      partykit/
        client.ts           ← Partykit WebSocket client hook
      anthropic/
        client.ts           ← Anthropic SDK instance
        classify.ts         ← Intent classification
        stream.ts           ← Streaming response helpers
      github/
        client.ts           ← Octokit instance
    types/                  ← App-local types (not shared across agents)
  public/
  package.json
  next.config.ts
  tailwind.config.ts
```

## Key constraints

- All Claude API calls happen in API routes (server-side). Never call the Anthropic API from the browser.
- Use React Server Components for static/data-fetching parts. Use Client Components only where interactivity requires it (chat input, real-time subscriptions).
- Supabase Realtime subscriptions must be set up in Client Components with proper cleanup on unmount.
- The Partykit client connection is a singleton — share it via React context, do not create multiple connections.
- All API routes must validate the user's session via Supabase server client before doing anything. Never trust client-sent user IDs.
- Stream agent responses using Next.js streaming (ReadableStream / `StreamingTextResponse`). Do not buffer the full response before sending.

## Component conventions

- Every component file has a co-located `ComponentName.test.tsx` (Vitest + React Testing Library)
- Use Tailwind for all styling. No inline styles. No CSS modules.
- Server Components are the default. Add `'use client'` only when necessary.
- Use `next/navigation` for routing. Never use `window.location`.
