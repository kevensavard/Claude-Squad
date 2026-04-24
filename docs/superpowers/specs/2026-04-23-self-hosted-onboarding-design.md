# Self-Hosted Onboarding Design

**Date:** 2026-04-23
**Status:** Approved

## Overview

Squad is open-source and self-hosted. Users must provision their own Supabase project, deploy the Next.js app to Vercel, deploy the Partykit SSS, create a GitHub OAuth App, and connect their Claude Code agent via the squad-skill CLI. This spec covers the full onboarding experience across four surfaces: README, Nextra docs site, in-app setup wizard, and squad-skill CLI.

GitHub OAuth is **required** — the orchestrator needs it to create per-agent branches and open merge PRs.

---

## Surface 1 — README.md (repo root)

Single-page "zero to multiplayer session" guide. Scannable, links to full docs for detail.

### Structure

```markdown
# Squad
[one-line pitch]  [demo GIF placeholder]

## What you need
- Supabase account (free tier works)
- Vercel account
- GitHub OAuth App
- Anthropic API key
- Node 20+, pnpm 9+

## Setup (5 steps)
1. Clone + install
2. Create Supabase project → run migrations
3. Create GitHub OAuth App
4. Fill .env files
5. Deploy Vercel + Partykit → first session

## Connecting your agent
[squad-skill one-liner]

## Docs
→ https://<docs-domain>
```

**Goal:** A developer landing on GitHub can assess Squad and start setup without reading anything else. Full detail lives in the docs site.

---

## Surface 2 — `apps/docs` (Nextra docs site)

Nextra (Next.js-based MDX docs), deployed as a separate Vercel project. Same monorepo, built by Turborepo alongside everything else. Self-hosters can run docs locally with `pnpm dev`.

### Page structure

```
apps/docs/
  pages/
    index.mdx                  ← landing + quick-start summary
    self-hosting/
      overview.mdx             ← what you're setting up + architecture diagram
      supabase.mdx             ← create project, run migrations, enable Realtime
      github-oauth.mdx         ← create OAuth App, set callback URL
      partykit.mdx             ← deploy SSS, get .partykit.dev domain
      vercel.mdx               ← connect repo, set env vars, deploy
      env-reference.mdx        ← every env var documented
    using-squad/
      first-session.mdx        ← create session, share invite link
      connect-agent.mdx        ← squad-skill install + first-run walkthrough
      mention-syntax.mdx       ← @agent, modes (plan/build/review)
    troubleshooting.mdx        ← common errors + fixes
```

### Content requirements per page

- `supabase.mdx`: step-by-step Supabase project creation, SQL migration commands, how to enable Realtime on the `messages` table
- `github-oauth.mdx`: OAuth App creation with exact callback URL format (`{APP_URL}/auth/callback/github`), required scopes (`repo`, `read:user`)
- `partykit.mdx`: `npx partykit deploy` walkthrough, how to get the `.partykit.dev` domain, setting env vars in Partykit dashboard
- `vercel.mdx`: monorepo root dir config, all env vars to set, how to update `NEXT_PUBLIC_PARTYKIT_HOST` after Partykit deploy
- `env-reference.mdx`: every variable from `.env.example` with description, where to find it, and whether it's public or secret
- `troubleshooting.mdx`: maps common startup errors to fixes (env var missing, Supabase unreachable, Partykit WS refused, etc.)

### Nextra config

```
apps/docs/
  package.json        ← nextra + nextra-theme-docs
  next.config.mjs     ← withNextra wrapper
  theme.config.tsx    ← sidebar, logo, footer
  pages/
    _app.mdx
    _meta.json        ← sidebar order per folder
```

---

## Surface 3 — In-app `/setup` wizard

### Route

`/setup` — a dedicated Next.js page, always accessible. Also the auto-redirect target when any required env var is missing, detected server-side in middleware.

### Auto-redirect logic

Middleware (`middleware.ts`) runs on all protected routes. If any required env var is absent (checked via the existing `apps/web/src/lib/env.ts` Zod schema — catch instead of parse), redirect to `/setup`. Once all vars are present, `/setup` is still accessible but shows all-green status.

### Step structure

Each step is independent. Users can re-run any step at any time.

Each step reads its values from the already-configured environment (server-side). The wizard never collects or stores credentials — it validates what's in `.env.local` and shows the exact lines to copy if anything is missing.

**Step 1 — Supabase**
- Shows: masked `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` status (set / missing)
- Verify: server action pings `{SUPABASE_URL}/rest/v1/` with the anon key
- Pass: HTTP 200 → green
- Fail: surface exact HTTP error + copyable `.env.local` snippet + link to `self-hosting/supabase.mdx`

**Step 2 — Database migrations**
- Shows: migration status (checks `information_schema.tables` for `sessions` table via service role)
- Shows migration SQL in a copyable code block with "Open Supabase SQL editor" deep link to their project
- Verify: re-runs the table check on demand
- Pass: table exists → green
- Fail: "Migrations not yet applied" + copy SQL button

**Step 3 — GitHub OAuth**
- Shows: masked `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` status (set / missing)
- Instructions: create OAuth App, set callback to `{NEXT_PUBLIC_APP_URL}/auth/callback/github`, required scopes (`repo`, `read:user`)
- Verify: initiates OAuth flow in a popup window, confirms token exchange completes
- Pass: token exchange succeeds → green
- Fail: surface OAuth error + copyable `.env.local` snippet + link to `self-hosting/github-oauth.mdx`

**Step 4 — Anthropic**
- Shows: masked `ANTHROPIC_API_KEY` status (set / missing / wrong prefix)
- Verify: server action fires a 1-token Haiku completion (`max_tokens: 1`)
- Pass: HTTP 200 → green
- Fail: surface exact Anthropic error code + message + copyable `.env.local` snippet

**Step 5 — Partykit**
- Shows: `NEXT_PUBLIC_PARTYKIT_HOST` current value
- Verify: server action HTTP GET `https://{host}/party/health`
- Pass: HTTP 200 → green
- Fail: "SSS unreachable" + copyable `.env.local` snippet + link to `self-hosting/partykit.mdx`

**Step 6 — Done**
- All green: "Create your first session" CTA → `/sessions/new`
- Any red: list of failing steps with direct jump links + relevant docs page link

### UI pattern

Vertical stepper. Each step card: title, brief description, input fields (if any), Verify button with loading state, status badge (idle / checking / pass / fail), error detail on fail. Steps do not gate each other — all accessible at any time.

Env vars are **not** written by the wizard — it validates what's already configured in the environment. This keeps the wizard stateless and avoids storing secrets in the DB.

---

## Surface 4 — squad-skill CLI first-run

### Guided mode

When `npx squad-skill` is run with no args or missing required flags, instead of crashing it enters interactive guided mode:

```
$ npx squad-skill

Welcome to Squad. Let's get you connected.

? Session URL (from the invite link):  https://squad.vercel.app/session/abc123
? Your agent ID (shown in the session sidebar):  claude-u1
? Anthropic API key:  sk-ant-***

Connecting to session abc123 as claude-u1...
✓ Session found
✓ Agent slot available
✓ Partykit handshake complete

Ready. Waiting for @claude-u1 mentions.

To skip this prompt next time:
  npx squad-skill --session abc123 --agent claude-u1 --key sk-ant-...
```

Prompts use `@inquirer/prompts`. API key input is masked. Final line prints the non-interactive command so users can save it or script it.

### Improved error messages

| Current behavior | New message |
|---|---|
| Crash / no output | Guided mode prompt |
| Generic WS error | `"Cannot reach SSS at {host}. Is 'pnpm dev' running? (partykit.mdx)"` |
| Agent not in session | `"Agent 'claude-u2' not found. Available in this session: claude-u1, claude-u3"` |
| Bad API key | `"Anthropic key rejected. Verify it starts with 'sk-ant-' and has credits."` |
| Session not found | `"Session '{id}' not found or invite link expired. Ask the host to reshare."` |

---

## Implementation scope

| Item | Location | New files |
|---|---|---|
| README.md | repo root | `README.md` |
| Nextra docs site | `apps/docs/` | entire app |
| `/setup` wizard | `apps/web/src/app/setup/` | page + step components + server actions |
| Middleware env check | `apps/web/src/middleware.ts` | update existing or create |
| squad-skill guided mode | `packages/squad-skill/src/` | update `connect.ts` + add prompts |

---

## Out of scope

- Writing env vars to disk from the wizard (wizard validates only)
- GitHub repo creation flow (that's session-level, not setup-level)
- Multi-language docs
- Docs site search beyond Nextra built-in
