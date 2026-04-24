# Environment variables

## Files

- `.env.local` — Next.js app (gitignored)
- `apps/party/.env` — Partykit server (gitignored)
- `.env.example` — committed, documents all required vars with dummy values

## Next.js (`apps/web/.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # server-only, never NEXT_PUBLIC_

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...  # server-only

# Partykit
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999  # dev; set to your partykit.dev domain in prod

# GitHub OAuth (for repo creation + branch ops)
GITHUB_CLIENT_ID=your-oauth-app-client-id
GITHUB_CLIENT_SECRET=your-oauth-app-client-secret
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Partykit (`apps/party/.env`)

```bash
# For SSS to call Supabase (flush on session end)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Validation

Implement env validation using `zod` in both apps. Fail fast at startup with a clear error message if a required variable is missing. Do not let the app start with incomplete env configuration.

```typescript
// apps/web/src/lib/env.ts
import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  NEXT_PUBLIC_PARTYKIT_HOST: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
})

export const env = envSchema.parse(process.env)
```

## Local development setup order

1. Create Supabase project → copy URL + keys
2. Run Supabase migrations (`supabase db push`)
3. Create GitHub OAuth App → copy client ID + secret
4. Copy `.env.example` to `.env.local` and `apps/party/.env`, fill in values
5. `pnpm install`
6. `pnpm dev` (starts both Next.js and Partykit via Turborepo)
