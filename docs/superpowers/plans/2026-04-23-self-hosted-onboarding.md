# Self-Hosted Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build complete self-hosted onboarding across four surfaces: README, Nextra docs site (`apps/docs`), in-app `/setup` wizard, and squad-skill CLI guided mode.

**Architecture:** README covers GitHub visitors. Nextra (`apps/docs`) is a full docs site in the monorepo deployed separately to Vercel. The in-app wizard at `/setup` validates env vars already in `.env.local` via server actions — it never collects or stores credentials. squad-skill gains an interactive guided mode when run with no args, plus improved error messages throughout.

**Tech Stack:** Nextra 2.x (MDX docs, Next.js pages router), Next.js 15 server actions (setup wizard), Vitest + React Testing Library (tests), `@inquirer/prompts` (squad-skill guided mode)

---

## File Map

**New files:**
- `README.md`
- `apps/docs/package.json`
- `apps/docs/next.config.mjs`
- `apps/docs/theme.config.tsx`
- `apps/docs/tsconfig.json`
- `apps/docs/pages/_meta.json`
- `apps/docs/pages/index.mdx`
- `apps/docs/pages/self-hosting/_meta.json`
- `apps/docs/pages/self-hosting/overview.mdx`
- `apps/docs/pages/self-hosting/supabase.mdx`
- `apps/docs/pages/self-hosting/github-oauth.mdx`
- `apps/docs/pages/self-hosting/partykit.mdx`
- `apps/docs/pages/self-hosting/vercel.mdx`
- `apps/docs/pages/self-hosting/env-reference.mdx`
- `apps/docs/pages/using-squad/_meta.json`
- `apps/docs/pages/using-squad/first-session.mdx`
- `apps/docs/pages/using-squad/connect-agent.mdx`
- `apps/docs/pages/using-squad/mention-syntax.mdx`
- `apps/docs/pages/troubleshooting.mdx`
- `apps/web/src/lib/env-check.ts` — pure fn, extracted for testability
- `apps/web/src/lib/env-check.test.ts`
- `apps/web/src/app/setup/actions/verify.ts` — all wizard server actions
- `apps/web/src/app/setup/actions/verify.test.ts`
- `apps/web/src/app/setup/components/StepCard.tsx`
- `apps/web/src/app/setup/components/StepCard.test.tsx`
- `apps/web/src/app/setup/components/steps/SupabaseStep.tsx`
- `apps/web/src/app/setup/components/steps/MigrationsStep.tsx`
- `apps/web/src/app/setup/components/steps/GithubStep.tsx`
- `apps/web/src/app/setup/components/steps/AnthropicStep.tsx`
- `apps/web/src/app/setup/components/steps/PartykitStep.tsx`
- `apps/web/src/app/setup/page.tsx`
- `packages/squad-skill/src/errors.ts`
- `packages/squad-skill/src/errors.test.ts`
- `packages/squad-skill/src/prompt.ts`

**Modified files:**
- `apps/web/src/middleware.ts` — add env check + `/setup` bypass before auth
- `apps/party/src/server.ts` — add `health` resource to `onRequest`
- `packages/squad-skill/src/connect.ts` — wire in guided mode + error handlers
- `packages/squad-skill/package.json` — add `@inquirer/prompts`

---

## Task 1: README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Squad

Real-time multiplayer development platform. Share a group chat with your team, tag your Claude agents, and have them build your codebase in parallel — each agent owning a distinct slice of the filesystem, with token costs split across all participants.

## What you need

- [Supabase](https://supabase.com) account (free tier works)
- [Vercel](https://vercel.com) account
- [Partykit](https://partykit.io) account
- GitHub account (for OAuth App + repo operations)
- [Anthropic](https://console.anthropic.com) API key
- Node.js 20+, pnpm 9+

## Setup (5 steps)

### 1. Clone and install

\`\`\`bash
git clone https://github.com/your-username/squad.git
cd squad
pnpm install
\`\`\`

### 2. Create Supabase project and run migrations

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy your **Project URL**, **anon key**, and **service role key** from Settings → API
3. Open the SQL editor and run each migration from `docs/DATABASE.md` in order
4. Enable Realtime on the `messages` table: Database → Replication → enable `messages`

### 3. Create GitHub OAuth App

1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**
2. Set **Authorization callback URL** to `https://your-app.vercel.app/auth/callback/github`
3. Copy the **Client ID** and generate a **Client Secret**

### 4. Fill in environment variables

\`\`\`bash
cp .env.example apps/web/.env.local
cp .env.example apps/party/.env
# Edit both files — see docs for all variables
\`\`\`

### 5. Deploy

**Partykit (Session State Server):**
\`\`\`bash
cd apps/party && npx partykit deploy
# Note the .partykit.dev domain printed at the end
\`\`\`

**Vercel (web app):**
1. Connect this repo to Vercel, set root directory to `apps/web`
2. Add all env vars from `apps/web/.env.local` in the Vercel dashboard
3. Update `NEXT_PUBLIC_PARTYKIT_HOST` to your `.partykit.dev` domain
4. Deploy

## Connecting your agent

\`\`\`bash
npx @squad/skill
# Interactive guided mode — prompts for session URL, agent ID, and API key
\`\`\`

## Docs

Full setup guide, troubleshooting, and usage reference:
→ **https://squad-docs.vercel.app** *(deploy `apps/docs` to Vercel separately)*

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with self-hosted setup guide"
```

---

## Task 2: Nextra docs scaffold

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/next.config.mjs`
- Create: `apps/docs/theme.config.tsx`
- Create: `apps/docs/tsconfig.json`
- Create: `apps/docs/pages/_meta.json`

- [ ] **Step 1: Create `apps/docs/package.json`**

```json
{
  "name": "@squad/docs",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001"
  },
  "dependencies": {
    "next": "^14.2.0",
    "nextra": "^2.13.4",
    "nextra-theme-docs": "^2.13.4",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/docs/next.config.mjs`**

```javascript
import nextra from 'nextra'

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
})

export default withNextra({})
```

- [ ] **Step 3: Create `apps/docs/theme.config.tsx`**

```tsx
import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span style={{ fontWeight: 700, fontSize: '1.2rem' }}>Squad</span>,
  project: {
    link: 'https://github.com/your-username/squad',
  },
  docsRepositoryBase: 'https://github.com/your-username/squad/tree/main/apps/docs',
  footer: {
    text: 'Squad — self-hosted multiplayer dev platform. MIT License.',
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Squad self-hosted setup and usage documentation" />
    </>
  ),
  useNextSeoProps() {
    return { titleTemplate: '%s – Squad Docs' }
  },
}

export default config
```

- [ ] **Step 4: Create `apps/docs/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  },
  "include": ["**/*.ts", "**/*.tsx", "**/*.mdx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create `apps/docs/pages/_meta.json`**

```json
{
  "index": "Introduction",
  "self-hosting": "Self-Hosting",
  "using-squad": "Using Squad",
  "troubleshooting": "Troubleshooting"
}
```

- [ ] **Step 6: Install deps and verify dev server starts**

```bash
cd apps/docs && pnpm install
pnpm dev
# Expected: Next.js starts on http://localhost:3001
# Ctrl+C to stop
```

- [ ] **Step 7: Commit**

```bash
git add apps/docs/
git commit -m "feat(docs): scaffold Nextra docs site"
```

---

## Task 3: Nextra docs — index + self-hosting pages

**Files:**
- Create: `apps/docs/pages/index.mdx`
- Create: `apps/docs/pages/self-hosting/_meta.json`
- Create: `apps/docs/pages/self-hosting/overview.mdx`
- Create: `apps/docs/pages/self-hosting/supabase.mdx`
- Create: `apps/docs/pages/self-hosting/github-oauth.mdx`
- Create: `apps/docs/pages/self-hosting/partykit.mdx`
- Create: `apps/docs/pages/self-hosting/vercel.mdx`
- Create: `apps/docs/pages/self-hosting/env-reference.mdx`

- [ ] **Step 1: Create `apps/docs/pages/index.mdx`**

```mdx
# Squad Documentation

Squad is a real-time multiplayer development platform. Multiple users share a group chat where they tag their individual Claude Code agents. When ready, agents coordinate autonomously to build a shared codebase in parallel — each agent owning a distinct slice of the filesystem, with token costs split across participants.

## Quick links

- [Self-hosting overview](/self-hosting/overview) — what you're setting up
- [Supabase setup](/self-hosting/supabase) — database + auth + realtime
- [GitHub OAuth](/self-hosting/github-oauth) — required for branch + merge operations
- [Partykit deployment](/self-hosting/partykit) — session state server
- [Vercel deployment](/self-hosting/vercel) — web app
- [Connect your agent](/using-squad/connect-agent) — squad-skill CLI
- [Troubleshooting](/troubleshooting) — common errors

## Architecture

```
Browser ←→ Supabase Realtime (group chat)
Browser ←→ Partykit SSS (agent registry, task queue, file ownership)
Next.js API routes ←→ Anthropic API (intent classification, planning)
squad-skill CLI ←→ Partykit SSS (agent WebSocket connection)
agent-runner ←→ GitHub API (branch creation, PR merge)
```

Four services to deploy: Supabase, Vercel (Next.js), Partykit, and GitHub OAuth App.
```

- [ ] **Step 2: Create `apps/docs/pages/self-hosting/_meta.json`**

```json
{
  "overview": "Overview",
  "supabase": "Supabase",
  "github-oauth": "GitHub OAuth",
  "partykit": "Partykit",
  "vercel": "Vercel",
  "env-reference": "Env Reference"
}
```

- [ ] **Step 3: Create `apps/docs/pages/self-hosting/overview.mdx`**

```mdx
# Self-Hosting Overview

## What you're setting up

| Service | Purpose | Where |
|---|---|---|
| Supabase | Database, auth, group chat realtime | supabase.com (managed) |
| Partykit | Session State Server (WebSocket room) | partykit.io (managed) |
| Vercel | Next.js web app | vercel.com (managed) |
| GitHub | OAuth login + branch/PR operations | github.com (OAuth App) |

All four services have free tiers that cover small team usage.

## Setup order

1. [Supabase](/self-hosting/supabase) — first, because Vercel needs the connection strings
2. [GitHub OAuth](/self-hosting/github-oauth) — second, because Vercel needs the client ID/secret
3. [Partykit](/self-hosting/partykit) — third, because Vercel needs the `.partykit.dev` host
4. [Vercel](/self-hosting/vercel) — last, after all other env vars are known

## Local development

You can run everything locally before deploying:

```bash
pnpm install
# Fill in apps/web/.env.local and apps/party/.env
pnpm dev
# Next.js → http://localhost:3000
# Partykit → http://localhost:1999
```

After local setup, use the in-app wizard at [http://localhost:3000/setup](http://localhost:3000/setup) to verify each service is connected correctly.
```

- [ ] **Step 4: Create `apps/docs/pages/self-hosting/supabase.mdx`**

```mdx
# Supabase Setup

## 1. Create a project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**
3. Choose a name, database password, and region closest to your users
4. Wait ~2 minutes for provisioning

## 2. Get your API keys

Go to **Settings → API**. You need three values:

| Value | Where | Env var |
|---|---|---|
| Project URL | "Project URL" | `NEXT_PUBLIC_SUPABASE_URL` |
| anon key | "Project API keys → anon public" | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role key | "Project API keys → service_role" | `SUPABASE_SERVICE_ROLE_KEY` |

> **Warning:** Never expose `service_role` to the browser. It bypasses Row Level Security.

## 3. Run migrations

Open the **SQL Editor** in your Supabase dashboard. Run each of the following in order:

Copy the SQL for each migration from `docs/DATABASE.md` in the repo:
- `001_initial_schema.sql` — tables: sessions, session_members, messages, token_usage, profiles
- `002_rls_policies.sql` — Row Level Security policies
- `003_realtime.sql` — session_token_summary view
- `004_indexes.sql` — query performance indexes

Click **Run** after pasting each one. All should succeed with no errors.

## 4. Enable Realtime on messages

Squad uses Supabase Realtime for the group chat. You must enable it manually:

1. Go to **Database → Replication**
2. Find the `messages` table
3. Toggle **INSERT** events on

## 5. Add env vars

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Copy these into `apps/web/.env.local` and `apps/party/.env`.
```

- [ ] **Step 5: Create `apps/docs/pages/self-hosting/github-oauth.mdx`**

```mdx
# GitHub OAuth Setup

Squad uses GitHub OAuth for user login and for the agent-runner to create branches and open pull requests.

## 1. Create an OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps**
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** Squad (or any name)
   - **Homepage URL:** `https://your-app.vercel.app`
   - **Authorization callback URL:** `https://your-app.vercel.app/auth/callback/github`

> For local development, add a second OAuth App (or update the callback URL) with `http://localhost:3000/auth/callback/github`.

4. Click **Register application**

## 2. Get your credentials

On the OAuth App page:
- Copy the **Client ID**
- Click **Generate a new client secret** and copy it immediately (shown once)

## 3. Add env vars

```bash
GITHUB_CLIENT_ID=Ov23liXXXXXXXXXXXXXX
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_WEBHOOK_SECRET=any-random-string-you-choose
```

Add these to `apps/web/.env.local`.

## 4. Enable GitHub OAuth in Supabase

1. Go to your Supabase project → **Authentication → Providers**
2. Find **GitHub** and toggle it on
3. Enter your Client ID and Client Secret
4. Save

Supabase handles the OAuth redirect flow — your Next.js app just calls `supabase.auth.signInWithOAuth({ provider: 'github' })`.
```

- [ ] **Step 6: Create `apps/docs/pages/self-hosting/partykit.mdx`**

```mdx
# Partykit Setup

Partykit hosts the Session State Server (SSS) — the real-time shared brain for each squad session.

## 1. Create a Partykit account

Sign up at [partykit.io](https://partykit.io). The free tier is sufficient for small teams.

## 2. Deploy the SSS

```bash
cd apps/party
npx partykit deploy
```

On first deploy, Partykit will:
1. Ask you to log in (opens browser)
2. Create the project named `squad-sss` (from `partykit.json`)
3. Deploy and print your live URL:

```
Deployed to https://squad-sss.your-username.partykit.dev
```

Note this URL — you need it for Vercel.

## 3. Set Partykit env vars

For the SSS to flush session data to Supabase on session close, it needs your Supabase credentials. Set them in the Partykit dashboard:

1. Go to [partykit.io/dashboard](https://partykit.io/dashboard) → your project → **Environment variables**
2. Add:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your service role key

For local development, these go in `apps/party/.env`.

## 4. Update your web app env var

```bash
NEXT_PUBLIC_PARTYKIT_HOST=squad-sss.your-username.partykit.dev
```

Add this to `apps/web/.env.local` (and later to Vercel env vars).

## Local development

```bash
cd apps/party
npx partykit dev
# Partykit runs on http://localhost:1999
# NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999 (already in .env.example)
```
```

- [ ] **Step 7: Create `apps/docs/pages/self-hosting/vercel.mdx`**

```mdx
# Vercel Deployment

The Next.js web app deploys to Vercel.

## Prerequisites

Complete Supabase, GitHub OAuth, and Partykit setup first — you need all env vars before deploying.

## 1. Connect repo to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your Squad GitHub repo
3. Set **Root Directory** to `apps/web`
4. Framework preset: **Next.js** (auto-detected)

## 2. Add environment variables

In the Vercel project settings → **Environment Variables**, add all of the following:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_PARTYKIT_HOST=squad-sss.your-username.partykit.dev
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=your-secret
GITHUB_WEBHOOK_SECRET=your-webhook-secret
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

> Set `NEXT_PUBLIC_APP_URL` to the final Vercel URL (e.g. `https://squad-abc123.vercel.app`). You can find this after the first deploy.

## 3. Deploy

Click **Deploy**. Vercel builds and deploys in ~2 minutes.

## 4. Update GitHub OAuth callback

After deploying, go back to your GitHub OAuth App and update the **Authorization callback URL** to your actual Vercel URL:

```
https://your-actual-app.vercel.app/auth/callback/github
```

Also update this in your Supabase Auth → GitHub provider settings.

## 5. Verify setup

Visit `https://your-app.vercel.app/setup` to run the in-app setup wizard. It checks each service connection and shows exactly what's working and what isn't.
```

- [ ] **Step 8: Create `apps/docs/pages/self-hosting/env-reference.mdx`**

```mdx
# Environment Variable Reference

## `apps/web/.env.local`

### Supabase

| Variable | Description | Where to find |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Supabase dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe for browser) | Supabase dashboard → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server only, never browser | Supabase dashboard → Settings → API → service_role |

### Anthropic

| Variable | Description | Where to find |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key starting with `sk-ant-` | console.anthropic.com → API Keys |

### Partykit

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_PARTYKIT_HOST` | Partykit SSS hostname (no protocol) | `squad-sss.user.partykit.dev` or `localhost:1999` |

### GitHub

| Variable | Description | Where to find |
|---|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID | GitHub → Settings → Developer settings → OAuth Apps |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret | Same page — generate once |
| `GITHUB_WEBHOOK_SECRET` | Shared secret for webhook validation | Any random string you choose |

### App

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed app | `https://your-app.vercel.app` or `http://localhost:3000` |

## `apps/party/.env`

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Same as `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Same service role key — SSS flushes data to Supabase on session close |
```

- [ ] **Step 9: Commit**

```bash
git add apps/docs/pages/
git commit -m "feat(docs): add index and self-hosting pages"
```

---

## Task 4: Nextra docs — using-squad pages + troubleshooting

**Files:**
- Create: `apps/docs/pages/using-squad/_meta.json`
- Create: `apps/docs/pages/using-squad/first-session.mdx`
- Create: `apps/docs/pages/using-squad/connect-agent.mdx`
- Create: `apps/docs/pages/using-squad/mention-syntax.mdx`
- Create: `apps/docs/pages/troubleshooting.mdx`

- [ ] **Step 1: Create `apps/docs/pages/using-squad/_meta.json`**

```json
{
  "first-session": "Your First Session",
  "connect-agent": "Connect Your Agent",
  "mention-syntax": "@Mention Syntax"
}
```

- [ ] **Step 2: Create `apps/docs/pages/using-squad/first-session.mdx`**

```mdx
# Your First Session

## 1. Sign in

Go to your Squad app and sign in with GitHub. On first sign-in, Squad creates your profile automatically.

## 2. Create a session

Click **New Session** on the dashboard. Give it a name (e.g., "my-project"). You are the **host** of the session — you can approve build proposals.

## 3. Invite teammates

On the session page, copy the **invite link** from the sidebar and share it. Teammates click the link to join. Each person who joins gets an agent slot (e.g., `claude-u1`, `claude-u2`).

## 4. Connect your agent

Each person must connect their local Claude Code agent via the squad-skill CLI:

```bash
npx @squad/skill
```

See [Connect Your Agent](/using-squad/connect-agent) for the full walkthrough.

## 5. Start collaborating

Once agents are connected, anyone can type in the group chat and @mention agents to get them working. See [@Mention Syntax](/using-squad/mention-syntax) for how to trigger different modes.
```

- [ ] **Step 3: Create `apps/docs/pages/using-squad/connect-agent.mdx`**

```mdx
# Connect Your Agent

Each person in a session runs their own `squad-skill` CLI locally. This connects your local Claude Code agent to the session via WebSocket.

## Prerequisites

- Node.js 20+ installed
- An Anthropic API key (`sk-ant-...`)
- The session invite link (from the session host)

## First-time setup (guided mode)

Run with no arguments to enter guided mode:

```bash
npx @squad/skill
```

You'll be prompted for:

```
Welcome to Squad. Let's get you connected.

? Session URL (from the invite link):  https://your-app.vercel.app/session/abc123
? Your agent ID (shown in the session sidebar):  claude-u1
? Anthropic API key:  sk-ant-***

Connecting to session abc123 as claude-u1...
✓ Session found
✓ Agent slot available
✓ Partykit handshake complete

Ready. Waiting for @claude-u1 mentions.

To skip this prompt next time:
  npx @squad/skill --session abc123 --agent claude-u1 --key sk-ant-...
```

## Non-interactive mode

Once you know your values, skip the prompts:

```bash
npx @squad/skill \
  --session abc123 \
  --agent claude-u1 \
  --key sk-ant-your-key
```

## Finding your agent ID

Your agent ID is shown in the session sidebar next to your name (e.g., `claude-u1`). It is assigned when you join the session and stays fixed for the session's lifetime.

## Keeping it running

Leave the CLI running in a terminal. When someone @mentions your agent in the chat, the CLI receives the message and your agent responds. Press `Ctrl+C` to disconnect.
```

- [ ] **Step 4: Create `apps/docs/pages/using-squad/mention-syntax.mdx`**

```mdx
# @Mention Syntax

Squad routes messages to agents based on @mentions and intent classification.

## Basic syntax

```
@agent-id [your message]
```

Example: `@claude-u1 what's the best way to structure this API?`

## Modes

Squad automatically classifies intent. You can also explicitly prefix your message:

| Prefix | Mode | What happens |
|---|---|---|
| (default) | brainstorm | Agent replies conversationally in chat |
| `plan:` | plan | Agent creates a ProposalCard with task breakdown |
| `build:` | build | Requires a ProposalCard to already be approved |
| `review:` | review | Agent reviews code or a proposal |
| `status:` | status | Agent gives a quick status update |

## ProposalCard flow

1. Send a plan request: `@claude-u1 plan: build a REST API for user authentication`
2. Agent responds with a **ProposalCard** — task list, file ownership, token estimates
3. The session **host** clicks **Approve** to start the build
4. Assigned agents receive tasks via WebSocket and begin building autonomously
5. When all tasks complete, a merge PR is created automatically

## Multi-agent

You can @mention multiple agents in the same session. Each agent receives only the messages directed at them. During a build, the orchestrator assigns tasks to agents based on their specialization.
```

- [ ] **Step 5: Create `apps/docs/pages/troubleshooting.mdx`**

```mdx
# Troubleshooting

## Setup wizard errors

### "NEXT_PUBLIC_SUPABASE_URL is not set"

Add `NEXT_PUBLIC_SUPABASE_URL` to `apps/web/.env.local` and restart the dev server (`pnpm dev`). The value is your Supabase Project URL from Settings → API.

### "Supabase returned HTTP 401"

Your `NEXT_PUBLIC_SUPABASE_ANON_KEY` is wrong or missing. Re-copy it from Supabase → Settings → API → anon public.

### "Migrations not applied"

Open the Supabase SQL editor and run each migration from `docs/DATABASE.md` in order (001 → 004). The wizard checks for the `sessions` table — if it's missing, migrations haven't run.

### "Anthropic key rejected"

Verify your key starts with `sk-ant-` and has remaining credits at [console.anthropic.com](https://console.anthropic.com).

### "Cannot reach Partykit at localhost:1999"

Run `pnpm dev` from the repo root — this starts both Next.js and Partykit. Or run `npx partykit dev` from `apps/party/` directly.

---

## squad-skill errors

### "Agent 'claude-u2' not found in session"

Your `--agent` flag must match the agent ID shown in the session sidebar exactly (e.g., `claude-u1`). Agent IDs are assigned when you join a session.

### "Cannot reach SSS at localhost:1999"

Partykit is not running. Start it with `pnpm dev` from the repo root or `npx partykit dev` from `apps/party/`.

### "Session not found or invite link expired"

Ask the session host to share a fresh invite link. Session IDs are UUIDs — make sure you're copying the full URL.

---

## Common issues

### Users can see each other's sessions

Check your Supabase RLS policies. Run `002_rls_policies.sql` in the SQL editor. RLS must be enabled on all tables.

### Realtime messages not appearing

Confirm Realtime is enabled on the `messages` table: Supabase → Database → Replication → messages → INSERT enabled.

### Build tasks not dispatching after Approve

Check that `NEXT_PUBLIC_PARTYKIT_HOST` points to your deployed Partykit instance (not `localhost`) in your Vercel env vars. The Approve button calls the SSS `/dispatch` endpoint.
```

- [ ] **Step 6: Verify docs site builds**

```bash
cd apps/docs && pnpm build
# Expected: Build succeeded with no errors
```

- [ ] **Step 7: Commit**

```bash
git add apps/docs/pages/
git commit -m "feat(docs): add using-squad pages and troubleshooting"
```

---

## Task 5: env-check.ts (TDD)

**Files:**
- Create: `apps/web/src/lib/env-check.ts`
- Create: `apps/web/src/lib/env-check.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/env-check.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getMissingEnvVars, hasAllEnvVars } from './env-check'

const ALL_VARS = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  NEXT_PUBLIC_PARTYKIT_HOST: 'localhost:1999',
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
}

afterEach(() => vi.unstubAllEnvs())

describe('getMissingEnvVars', () => {
  it('returns empty array when all vars set', () => {
    Object.entries(ALL_VARS).forEach(([k, v]) => vi.stubEnv(k, v))
    expect(getMissingEnvVars()).toEqual([])
  })

  it('returns missing var names', () => {
    Object.entries(ALL_VARS).forEach(([k, v]) => vi.stubEnv(k, v))
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('GITHUB_CLIENT_SECRET', '')
    const missing = getMissingEnvVars()
    expect(missing).toContain('ANTHROPIC_API_KEY')
    expect(missing).toContain('GITHUB_CLIENT_SECRET')
    expect(missing).toHaveLength(2)
  })
})

describe('hasAllEnvVars', () => {
  it('returns true when all vars set', () => {
    Object.entries(ALL_VARS).forEach(([k, v]) => vi.stubEnv(k, v))
    expect(hasAllEnvVars()).toBe(true)
  })

  it('returns false when any var missing', () => {
    Object.entries(ALL_VARS).forEach(([k, v]) => vi.stubEnv(k, v))
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(hasAllEnvVars()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test src/lib/env-check.test.ts
# Expected: FAIL — cannot find module './env-check'
```

- [ ] **Step 3: Implement `apps/web/src/lib/env-check.ts`**

```typescript
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'NEXT_PUBLIC_PARTYKIT_HOST',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
] as const

export function getMissingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((key) => !process.env[key])
}

export function hasAllEnvVars(): boolean {
  return getMissingEnvVars().length === 0
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test src/lib/env-check.test.ts
# Expected: PASS — 4 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/env-check.ts apps/web/src/lib/env-check.test.ts
git commit -m "feat(web): add env-check utility for missing var detection"
```

---

## Task 6: Middleware — add env check + /setup bypass

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Update `apps/web/src/middleware.ts`**

Replace the full file content:

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getMissingEnvVars } from '@/lib/env-check'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isSetupRoute = pathname.startsWith('/setup')
  const isAuthRoute = pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')
  const isJoinRoute = pathname.startsWith('/join')
  const isStaticRoute = pathname.startsWith('/_next') || pathname === '/favicon.ico'

  if (!isStaticRoute && !isSetupRoute && !isApiRoute) {
    const missing = getMissingEnvVars()
    if (missing.length > 0) {
      const setupUrl = request.nextUrl.clone()
      setupUrl.pathname = '/setup'
      return NextResponse.redirect(setupUrl)
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !isAuthRoute && !isApiRoute && !isJoinRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 2: Verify dev server starts without errors**

```bash
cd apps/web && pnpm dev
# Expected: server starts on http://localhost:3000
# If NEXT_PUBLIC_SUPABASE_URL is unset, visiting any page redirects to /setup
# Ctrl+C to stop
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(web): redirect to /setup when env vars missing"
```

---

## Task 7: SSS health endpoint

**Files:**
- Modify: `apps/party/src/server.ts`

The setup wizard's Partykit step verifies connectivity by hitting `GET /parties/main/health-check/health`. Add this resource to the `onRequest` handler.

- [ ] **Step 1: Add `health` resource to `onRequest` in `apps/party/src/server.ts`**

Find the line `if (resource === 'dispatch') {` and add the health check just before the final `return new Response('Not found', { status: 404 })`:

```typescript
    if (resource === 'health') {
      return Response.json({ ok: true })
    }
```

The full updated `onRequest` block becomes:

```typescript
  async onRequest(req: Party.Request): Promise<Response> {
    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean)

    const resource = segments[3]

    if (resource === 'ownership') {
      return this.handleOwnershipRequest(req, segments)
    }
    if (resource === 'context-injection') {
      return this.handleContextInjection(segments)
    }
    if (resource === 'token-update') {
      return this.handleTokenUpdateRequest(req)
    }
    if (resource === 'dispatch') {
      return this.handleDispatch(req)
    }
    if (resource === 'health') {
      return Response.json({ ok: true })
    }

    return new Response('Not found', { status: 404 })
  }
```

- [ ] **Step 2: Verify locally**

```bash
cd apps/party && npx partykit dev
# In another terminal:
curl http://localhost:1999/parties/main/health-check/health
# Expected: {"ok":true}
```

- [ ] **Step 3: Commit**

```bash
git add apps/party/src/server.ts
git commit -m "feat(party): add /health endpoint for setup wizard connectivity check"
```

---

## Task 8: Wizard server actions (TDD)

**Files:**
- Create: `apps/web/src/app/setup/actions/verify.ts`
- Create: `apps/web/src/app/setup/actions/verify.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/app/setup/actions/verify.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  verifySupabase,
  verifyMigrations,
  verifyGithub,
  verifyAnthropic,
  verifyPartykit,
} from './verify'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// ── verifySupabase ───────────────────────────────────────────────────────────

describe('verifySupabase', () => {
  it('returns error when URL missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'key')
    const r = await verifySupabase()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('returns error when anon key missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const r = await verifySupabase()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('returns ok on HTTP 200', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'key')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const r = await verifySupabase()
    expect(r.ok).toBe(true)
  })

  it('returns error on non-200', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'key')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
    const r = await verifySupabase()
    expect(r.ok).toBe(false)
  })
})

// ── verifyMigrations ─────────────────────────────────────────────────────────

describe('verifyMigrations', () => {
  it('returns error when URL missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')
    const r = await verifyMigrations()
    expect(r.ok).toBe(false)
  })

  it('returns ok when sessions table exists (HTTP 200)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }))
    const r = await verifyMigrations()
    expect(r.ok).toBe(true)
  })

  it('returns specific error when table missing (HTTP 404)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('not found', { status: 404 }))
    const r = await verifyMigrations()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/Migrations not applied/)
  })
})

// ── verifyGithub ─────────────────────────────────────────────────────────────

describe('verifyGithub', () => {
  it('returns error when client ID missing', async () => {
    vi.stubEnv('GITHUB_CLIENT_ID', '')
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'secret')
    const r = await verifyGithub()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/GITHUB_CLIENT_ID/)
  })

  it('returns error when client secret missing', async () => {
    vi.stubEnv('GITHUB_CLIENT_ID', 'id')
    vi.stubEnv('GITHUB_CLIENT_SECRET', '')
    const r = await verifyGithub()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/GITHUB_CLIENT_SECRET/)
  })

  it('returns ok when both vars set', async () => {
    vi.stubEnv('GITHUB_CLIENT_ID', 'Ov23liXXX')
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'secret')
    const r = await verifyGithub()
    expect(r.ok).toBe(true)
  })
})

// ── verifyAnthropic ──────────────────────────────────────────────────────────

describe('verifyAnthropic', () => {
  it('returns error when key missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const r = await verifyAnthropic()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/ANTHROPIC_API_KEY/)
  })

  it('returns error when key has wrong prefix', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'wrong-prefix-key')
    const r = await verifyAnthropic()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/sk-ant-/)
  })

  it('returns ok on HTTP 200', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const r = await verifyAnthropic()
    expect(r.ok).toBe(true)
  })

  it('returns error on 401', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-bad')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
    const r = await verifyAnthropic()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/rejected/)
  })
})

// ── verifyPartykit ───────────────────────────────────────────────────────────

describe('verifyPartykit', () => {
  it('returns error when host missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_PARTYKIT_HOST', '')
    const r = await verifyPartykit()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/NEXT_PUBLIC_PARTYKIT_HOST/)
  })

  it('returns ok on HTTP 200', async () => {
    vi.stubEnv('NEXT_PUBLIC_PARTYKIT_HOST', 'localhost:1999')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    const r = await verifyPartykit()
    expect(r.ok).toBe(true)
  })

  it('returns error when SSS unreachable', async () => {
    vi.stubEnv('NEXT_PUBLIC_PARTYKIT_HOST', 'localhost:1999')
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const r = await verifyPartykit()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/Cannot reach/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && pnpm test src/app/setup/actions/verify.test.ts
# Expected: FAIL — cannot find module './verify'
```

- [ ] **Step 3: Implement `apps/web/src/app/setup/actions/verify.ts`**

```typescript
'use server'

export type VerifyResult = { ok: true } | { ok: false; error: string }

export async function verifySupabase(): Promise<VerifyResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_URL is not set in .env.local' }
  if (!key) return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env.local' }
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key } })
    if (!res.ok) return { ok: false, error: `Supabase returned HTTP ${res.status}. Check your URL and anon key.` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Cannot reach Supabase: ${err instanceof Error ? err.message : 'network error'}` }
  }
}

export async function verifyMigrations(): Promise<VerifyResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_URL is not set in .env.local' }
  if (!key) return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set in .env.local' }
  try {
    const res = await fetch(`${url}/rest/v1/sessions?limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (res.status === 404) {
      return { ok: false, error: 'Migrations not applied. Run the SQL from docs/DATABASE.md in the Supabase SQL editor.' }
    }
    if (!res.ok) return { ok: false, error: `Supabase returned HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Cannot reach Supabase: ${err instanceof Error ? err.message : 'network error'}` }
  }
}

export async function verifyGithub(): Promise<VerifyResult> {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId) return { ok: false, error: 'GITHUB_CLIENT_ID is not set in .env.local' }
  if (!clientSecret) return { ok: false, error: 'GITHUB_CLIENT_SECRET is not set in .env.local' }
  return { ok: true }
}

export async function verifyAnthropic(): Promise<VerifyResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY is not set in .env.local' }
  if (!key.startsWith('sk-ant-')) {
    return { ok: false, error: 'ANTHROPIC_API_KEY must start with sk-ant-. Check the key at console.anthropic.com.' }
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    if (res.status === 401) {
      return { ok: false, error: 'API key rejected by Anthropic. Verify the key is valid and has credits.' }
    }
    if (!res.ok) return { ok: false, error: `Anthropic returned HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Cannot reach Anthropic: ${err instanceof Error ? err.message : 'network error'}` }
  }
}

export async function verifyPartykit(): Promise<VerifyResult> {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST
  if (!host) return { ok: false, error: 'NEXT_PUBLIC_PARTYKIT_HOST is not set in .env.local' }
  try {
    const protocol = host.startsWith('localhost') ? 'http' : 'https'
    const res = await fetch(`${protocol}://${host}/parties/main/health-check/health`)
    if (!res.ok) return { ok: false, error: `Partykit returned HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Cannot reach Partykit at ${host}: ${err instanceof Error ? err.message : 'network error'}` }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && pnpm test src/app/setup/actions/verify.test.ts
# Expected: PASS — all tests pass
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/setup/actions/
git commit -m "feat(web): add setup wizard server actions with verification logic"
```

---

## Task 9: StepCard component

**Files:**
- Create: `apps/web/src/app/setup/components/StepCard.tsx`
- Create: `apps/web/src/app/setup/components/StepCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/setup/components/StepCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepCard } from './StepCard'

describe('StepCard', () => {
  it('renders title and description', () => {
    render(
      <StepCard title="Supabase" description="Check database connection" status="idle" onVerify={vi.fn()} />
    )
    expect(screen.getByText('Supabase')).toBeInTheDocument()
    expect(screen.getByText('Check database connection')).toBeInTheDocument()
  })

  it('calls onVerify when button clicked', () => {
    const onVerify = vi.fn()
    render(<StepCard title="Test" description="desc" status="idle" onVerify={onVerify} />)
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    expect(onVerify).toHaveBeenCalledOnce()
  })

  it('disables button while checking', () => {
    render(<StepCard title="Test" description="desc" status="checking" onVerify={vi.fn()} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows error detail when status is fail', () => {
    render(
      <StepCard
        title="Test"
        description="desc"
        status="fail"
        onVerify={vi.fn()}
        errorDetail="SUPABASE_URL is not set"
      />
    )
    expect(screen.getByText('SUPABASE_URL is not set')).toBeInTheDocument()
  })

  it('shows docs link when provided', () => {
    render(
      <StepCard
        title="Test"
        description="desc"
        status="fail"
        onVerify={vi.fn()}
        docsHref="/self-hosting/supabase"
      />
    )
    expect(screen.getByRole('link', { name: /docs/i })).toHaveAttribute('href', '/self-hosting/supabase')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test src/app/setup/components/StepCard.test.tsx
# Expected: FAIL — cannot find module './StepCard'
```

- [ ] **Step 3: Implement `apps/web/src/app/setup/components/StepCard.tsx`**

```tsx
'use client'

export type StepStatus = 'idle' | 'checking' | 'pass' | 'fail'

interface StepCardProps {
  title: string
  description: string
  status: StepStatus
  onVerify: () => void
  errorDetail?: string
  docsHref?: string
  children?: React.ReactNode
}

const STATUS_BADGE: Record<StepStatus, { label: string; className: string }> = {
  idle: { label: '—', className: 'bg-gray-100 text-gray-500' },
  checking: { label: 'Checking…', className: 'bg-yellow-100 text-yellow-700' },
  pass: { label: '✓ Connected', className: 'bg-green-100 text-green-700' },
  fail: { label: '✗ Failed', className: 'bg-red-100 text-red-700' },
}

export function StepCard({ title, description, status, onVerify, errorDetail, docsHref, children }: StepCardProps) {
  const badge = STATUS_BADGE[status]
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {children && <div className="mt-4">{children}</div>}

      {status === 'fail' && errorDetail && (
        <div className="mt-4 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{errorDetail}</p>
          {docsHref && (
            <a
              href={docsHref}
              className="mt-1 inline-block text-sm font-medium text-red-800 underline"
              target="_blank"
              rel="noreferrer"
            >
              View docs →
            </a>
          )}
        </div>
      )}

      <button
        onClick={onVerify}
        disabled={status === 'checking'}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'checking' ? 'Checking…' : 'Verify'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test src/app/setup/components/StepCard.test.tsx
# Expected: PASS — 5 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/setup/components/StepCard.tsx apps/web/src/app/setup/components/StepCard.test.tsx
git commit -m "feat(web): add StepCard component for setup wizard"
```

---

## Task 10: Wizard step components + page

**Files:**
- Create: `apps/web/src/app/setup/components/steps/SupabaseStep.tsx`
- Create: `apps/web/src/app/setup/components/steps/MigrationsStep.tsx`
- Create: `apps/web/src/app/setup/components/steps/GithubStep.tsx`
- Create: `apps/web/src/app/setup/components/steps/AnthropicStep.tsx`
- Create: `apps/web/src/app/setup/components/steps/PartykitStep.tsx`
- Create: `apps/web/src/app/setup/page.tsx`

All step components follow the same pattern: `'use client'`, local `status`/`error` state, call the matching server action on Verify, pass result to `StepCard`.

- [ ] **Step 1: Create `apps/web/src/app/setup/components/steps/SupabaseStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifySupabase } from '../../actions/verify'

export function SupabaseStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifySupabase()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  return (
    <StepCard
      title="1. Supabase"
      description="Verifies NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set and reachable."
      status={status}
      onVerify={handleVerify}
      errorDetail={error}
      docsHref="https://squad-docs.vercel.app/self-hosting/supabase"
    />
  )
}
```

- [ ] **Step 2: Create `apps/web/src/app/setup/components/steps/MigrationsStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifyMigrations } from '../../actions/verify'

const MIGRATION_SQL_LINK = 'https://github.com/your-username/squad/blob/main/docs/DATABASE.md'

export function MigrationsStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifyMigrations()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  return (
    <StepCard
      title="2. Database Migrations"
      description="Checks that the sessions table exists (confirms migrations have been applied)."
      status={status}
      onVerify={handleVerify}
      errorDetail={error}
      docsHref="https://squad-docs.vercel.app/self-hosting/supabase"
    >
      <p className="text-sm text-gray-600">
        Run each migration from{' '}
        <a href={MIGRATION_SQL_LINK} target="_blank" rel="noreferrer" className="underline">
          docs/DATABASE.md
        </a>{' '}
        in the Supabase SQL editor, in order (001 → 004).
      </p>
    </StepCard>
  )
}
```

- [ ] **Step 3: Create `apps/web/src/app/setup/components/steps/GithubStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifyGithub } from '../../actions/verify'

export function GithubStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifyGithub()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'

  return (
    <StepCard
      title="3. GitHub OAuth"
      description="Verifies GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set."
      status={status}
      onVerify={handleVerify}
      errorDetail={error}
      docsHref="https://squad-docs.vercel.app/self-hosting/github-oauth"
    >
      <p className="text-sm text-gray-600">
        Set your GitHub OAuth App callback URL to:{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
          {appUrl}/auth/callback/github
        </code>
      </p>
    </StepCard>
  )
}
```

- [ ] **Step 4: Create `apps/web/src/app/setup/components/steps/AnthropicStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifyAnthropic } from '../../actions/verify'

export function AnthropicStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifyAnthropic()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  return (
    <StepCard
      title="4. Anthropic"
      description="Sends a 1-token test request to verify ANTHROPIC_API_KEY is valid."
      status={status}
      onVerify={handleVerify}
      errorDetail={error}
      docsHref="https://squad-docs.vercel.app/self-hosting/env-reference"
    />
  )
}
```

- [ ] **Step 5: Create `apps/web/src/app/setup/components/steps/PartykitStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifyPartykit } from '../../actions/verify'

export function PartykitStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifyPartykit()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  return (
    <StepCard
      title="5. Partykit"
      description="Pings the Session State Server health endpoint to confirm NEXT_PUBLIC_PARTYKIT_HOST is reachable."
      status={status}
      onVerify={handleVerify}
      errorDetail={error}
      docsHref="https://squad-docs.vercel.app/self-hosting/partykit"
    />
  )
}
```

- [ ] **Step 6: Create `apps/web/src/app/setup/page.tsx`**

```tsx
import { SupabaseStep } from './components/steps/SupabaseStep'
import { MigrationsStep } from './components/steps/MigrationsStep'
import { GithubStep } from './components/steps/GithubStep'
import { AnthropicStep } from './components/steps/AnthropicStep'
import { PartykitStep } from './components/steps/PartykitStep'

export const metadata = { title: 'Setup — Squad' }

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900">Squad Setup</h1>
      <p className="mt-2 text-gray-600">
        Verify each service connection before creating your first session. Click{' '}
        <strong>Verify</strong> on each step.
      </p>
      <div className="mt-8 flex flex-col gap-4">
        <SupabaseStep />
        <MigrationsStep />
        <GithubStep />
        <AnthropicStep />
        <PartykitStep />
      </div>
      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-600">All steps passing?</p>
        <a
          href="/sessions/new"
          className="mt-3 inline-block rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Create your first session →
        </a>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Verify in browser**

```bash
cd apps/web && pnpm dev
# Visit http://localhost:3000/setup
# Expected: 5 step cards render with Verify buttons
# Click each Verify button — should show checking → pass/fail state
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/setup/
git commit -m "feat(web): add /setup wizard with 5-step service verification"
```

---

## Task 11: squad-skill error messages (TDD)

**Files:**
- Create: `packages/squad-skill/src/errors.ts`
- Create: `packages/squad-skill/src/errors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/squad-skill/src/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatError } from './errors'

describe('formatError', () => {
  it('formats agent-not-found error with available agents', () => {
    const msg = formatError('agent_not_found', { agentId: 'claude-u2', available: ['claude-u1', 'claude-u3'] })
    expect(msg).toContain('claude-u2')
    expect(msg).toContain('claude-u1')
    expect(msg).toContain('claude-u3')
  })

  it('formats websocket-refused error with host', () => {
    const msg = formatError('ws_refused', { host: 'localhost:1999' })
    expect(msg).toContain('localhost:1999')
    expect(msg).toContain('pnpm dev')
  })

  it('formats bad-api-key error', () => {
    const msg = formatError('bad_api_key', {})
    expect(msg).toContain('sk-ant-')
  })

  it('formats session-not-found error', () => {
    const msg = formatError('session_not_found', { sessionId: 'abc123' })
    expect(msg).toContain('abc123')
    expect(msg).toContain('expired')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/squad-skill && pnpm test src/errors.test.ts 2>/dev/null || npx vitest run src/errors.test.ts
# Expected: FAIL — cannot find module './errors'
```

- [ ] **Step 3: Implement `packages/squad-skill/src/errors.ts`**

```typescript
type ErrorContext = {
  agentId?: string
  available?: string[]
  host?: string
  sessionId?: string
}

type ErrorType = 'agent_not_found' | 'ws_refused' | 'bad_api_key' | 'session_not_found'

export function formatError(type: ErrorType, ctx: ErrorContext): string {
  switch (type) {
    case 'agent_not_found':
      return (
        `Agent '${ctx.agentId}' not found in this session.\n` +
        `Available agents: ${ctx.available?.join(', ') ?? 'none'}\n` +
        `Use --agent with one of the above IDs.`
      )
    case 'ws_refused':
      return (
        `Cannot reach SSS at ${ctx.host}.\n` +
        `Is 'pnpm dev' running? (or 'npx partykit dev' in apps/party/)`
      )
    case 'bad_api_key':
      return (
        `Anthropic API key rejected.\n` +
        `Verify your key starts with 'sk-ant-' and has remaining credits at console.anthropic.com.`
      )
    case 'session_not_found':
      return (
        `Session '${ctx.sessionId}' not found or invite link expired.\n` +
        `Ask the host to share a fresh invite link.`
      )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/squad-skill && npx vitest run src/errors.test.ts
# Expected: PASS — 4 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add packages/squad-skill/src/errors.ts packages/squad-skill/src/errors.test.ts
git commit -m "feat(squad-skill): add typed error formatters"
```

---

## Task 12: squad-skill guided mode

**Files:**
- Create: `packages/squad-skill/src/prompt.ts`
- Modify: `packages/squad-skill/src/connect.ts`
- Modify: `packages/squad-skill/package.json`

- [ ] **Step 1: Add `@inquirer/prompts` to `packages/squad-skill/package.json`**

Add to `dependencies`:

```json
"@inquirer/prompts": "^7.0.0"
```

Full updated `dependencies` block:

```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.39.0",
  "@inquirer/prompts": "^7.0.0",
  "@squad/agent-runner": "workspace:*",
  "@squad/types": "workspace:*",
  "partysocket": "^1.0.2",
  "ws": "^8.18.0"
}
```

- [ ] **Step 2: Install the new dependency**

```bash
cd packages/squad-skill && pnpm install
# Expected: @inquirer/prompts installed
```

- [ ] **Step 3: Create `packages/squad-skill/src/prompt.ts`**

```typescript
import { input, password } from '@inquirer/prompts'

export interface GuidedOptions {
  sessionId: string
  agentId: string
  apiKey: string
}

export async function runGuidedMode(): Promise<GuidedOptions> {
  console.log('\nWelcome to Squad. Let\'s get you connected.\n')

  const sessionUrl = await input({
    message: 'Session URL (from the invite link):',
    validate: (v) => v.includes('/session/') ? true : 'Paste the full session URL (e.g. https://your-app.vercel.app/session/abc123)',
  })

  const sessionId = sessionUrl.split('/session/')[1]?.split('?')[0] ?? sessionUrl

  const agentId = await input({
    message: 'Your agent ID (shown in the session sidebar):',
    validate: (v) => v.startsWith('claude-') ? true : 'Agent ID must start with claude- (e.g. claude-u1)',
  })

  const apiKey = await password({
    message: 'Anthropic API key:',
    validate: (v) => v.startsWith('sk-ant-') ? true : 'API key must start with sk-ant-',
    mask: '*',
  })

  return { sessionId, agentId, apiKey }
}

export function printNonInteractiveHint(sessionId: string, agentId: string, apiKey: string): void {
  const masked = apiKey.slice(0, 10) + '...'
  console.log('\nTo skip this prompt next time:')
  console.log(`  npx @squad/skill --session ${sessionId} --agent ${agentId} --key ${masked}\n`)
}
```

- [ ] **Step 4: Update `packages/squad-skill/src/connect.ts`**

Replace the full file:

```typescript
import WebSocket from 'ws'
import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from '@squad/agent-runner'
import type { Task } from '@squad/types'
import { formatError } from './errors.js'
import { runGuidedMode, printNonInteractiveHint } from './prompt.js'

interface ConnectOptions {
  sessionId: string
  agentId: string
  apiKey: string
  partyUrl: string
  workdir?: string
  githubToken?: string
}

type IncomingMessage =
  | { type: 'route_to_agent'; agentId: string; content: string; mode: string; requestId: string }
  | { type: 'build_started'; taskGraph: Task[] }
  | { type: string }

export async function connectToSession(opts: ConnectOptions): Promise<void> {
  const { sessionId, agentId, apiKey, partyUrl, workdir = process.cwd(), githubToken } = opts
  const anthropic = new Anthropic({ apiKey })

  const partyHost = partyUrl.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '')
  const wsUrl = `${partyUrl}/parties/main/${sessionId}`
  console.log(`Connecting to ${wsUrl} as ${agentId}…`)

  const ws = new WebSocket(wsUrl)

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'register_agent',
      agentId,
      userId: agentId,
      displayName: `Claude (local)`,
    }))
    console.log(`Connected. Listening for messages as ${agentId}`)
  })

  ws.on('message', async (raw) => {
    let msg: IncomingMessage
    try {
      msg = JSON.parse(raw.toString()) as IncomingMessage
    } catch {
      return
    }

    if (msg.type === 'agent_not_found') {
      const m = msg as { type: string; available?: string[] }
      console.error(formatError('agent_not_found', { agentId, available: m.available ?? [] }))
      process.exit(1)
    }

    if (msg.type === 'build_started') {
      const myTasks = (msg as { type: 'build_started'; taskGraph: Task[] }).taskGraph
        .filter((t: Task) => t.assignedAgentId === agentId)

      if (myTasks.length === 0) {
        console.log(`[${agentId}] build_started — no tasks assigned to me`)
        return
      }
      console.log(`[${agentId}] build_started — ${myTasks.length} task(s) assigned`)

      for (const task of myTasks) {
        console.log(`[${agentId}] Starting: ${task.title}`)
        try {
          await runAgent({
            agentId,
            userId: agentId,
            sessionId,
            task,
            partyHost,
            anthropicApiKey: apiKey,
            githubToken,
            workdir,
          })
          console.log(`[${agentId}] Done: ${task.title}`)
        } catch (err) {
          console.error(`[${agentId}] Task failed: ${task.title}`, err)
        }
      }
      return
    }

    if (msg.type !== 'route_to_agent') return
    const routeMsg = msg as { type: 'route_to_agent'; agentId: string; content: string; mode: string; requestId: string }
    if (routeMsg.agentId !== agentId) return

    console.log(`[${agentId}] received ${routeMsg.mode} request: "${routeMsg.content.slice(0, 60)}…"`)

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: routeMsg.mode === 'status' ? 300 : 600,
        system: `You are ${agentId}, a collaborative AI agent in a Squad coding session. Be concise.`,
        messages: [{ role: 'user', content: routeMsg.content }],
      })
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      ws.send(JSON.stringify({
        type: 'agent_response',
        agentId,
        content: text,
        mode: routeMsg.mode,
        requestId: routeMsg.requestId,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      }))
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      if (errMsg.includes('401') || errMsg.toLowerCase().includes('unauthorized')) {
        console.error(formatError('bad_api_key', {}))
        process.exit(1)
      }
      ws.send(JSON.stringify({
        type: 'agent_error',
        agentId,
        error: errMsg,
        requestId: routeMsg.requestId,
      }))
    }
  })

  ws.on('close', () => {
    console.log('Disconnected from session')
    process.exit(0)
  })

  ws.on('error', (err) => {
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
      console.error(formatError('ws_refused', { host: partyHost }))
    } else {
      console.error('WebSocket error:', err.message)
    }
    process.exit(1)
  })

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log('\nDisconnecting…')
      ws.close()
      resolve()
    })
  })
}

export async function maybeRunGuidedMode(args: {
  session?: string
  agent?: string
  key?: string
  partyUrl: string
  workdir?: string
  githubToken?: string
}): Promise<void> {
  let { session, agent, key } = args

  if (!session || !agent || !key) {
    const guided = await runGuidedMode()
    session = guided.sessionId
    agent = guided.agentId
    key = guided.apiKey

    console.log(`\nConnecting to session ${session} as ${agent}…`)
    console.log('✓ Starting connection\n')

    printNonInteractiveHint(session, agent, key)
  }

  await connectToSession({
    sessionId: session,
    agentId: agent,
    apiKey: key,
    partyUrl: args.partyUrl,
    workdir: args.workdir,
    githubToken: args.githubToken,
  })
}
```

- [ ] **Step 5: Update `packages/squad-skill/src/index.ts` to use guided mode**

Replace the full file:

```typescript
#!/usr/bin/env node

import { maybeRunGuidedMode } from './connect.js'

function parseArgs() {
  const args = process.argv.slice(2)

  function getFlag(name: string): string | undefined {
    const idx = args.findIndex((a) => a === `--${name}`)
    return idx !== -1 ? args[idx + 1] : undefined
  }

  const session = getFlag('session')
  const agent = getFlag('agent')
  const key = getFlag('key') ?? process.env.ANTHROPIC_API_KEY
  const partyUrl = getFlag('party-url') ?? process.env.PARTYKIT_HOST ?? 'ws://localhost:1999'
  const workdir = getFlag('workdir')
  const githubToken = getFlag('github-token') ?? process.env.GITHUB_TOKEN

  return { session, agent, key, partyUrl, workdir, githubToken }
}

void maybeRunGuidedMode(parseArgs())

- [ ] **Step 6: Build and smoke test guided mode**

```bash
cd packages/squad-skill && pnpm build
node dist/index.js
# Expected: interactive prompts appear
# Enter a test session URL, agent ID, and API key
# Ctrl+C after the "To skip this prompt next time:" line prints
```

- [ ] **Step 7: Commit**

```bash
git add packages/squad-skill/
git commit -m "feat(squad-skill): add guided mode and improved error messages"
```

---

## Task 13: Final integration check + update memory

- [ ] **Step 1: Run all tests**

```bash
cd apps/web && pnpm test
cd packages/squad-skill && npx vitest run
# Expected: all pass
```

- [ ] **Step 2: Verify docs site builds cleanly**

```bash
cd apps/docs && pnpm build
# Expected: Build succeeded
```

- [ ] **Step 3: Verify web app typecheck passes**

```bash
cd apps/web && pnpm typecheck
# Expected: no type errors
```

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final typecheck and test fixes for onboarding phase"
```
