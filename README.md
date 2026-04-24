# Squad

Real-time multiplayer development platform. Share a group chat with your team, tag your Claude agents, and have them build your codebase in parallel — each agent owning a distinct slice of the filesystem, with token costs split across all participants.

## What you need

- [Supabase](https://supabase.com) account (free tier works)
- [Vercel](https://vercel.com) account
- [Partykit](https://partykit.io) account
- GitHub account (for OAuth App + repo operations)
- [Anthropic](https://console.anthropic.com) API key
- Node.js 20+, pnpm 9+
  - Install pnpm: `npm install -g pnpm@9`

## Setup (5 steps)

### 1. Clone and install

```bash
git clone https://github.com/your-username/squad.git
cd squad
pnpm install
```

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

```bash
cp .env.example apps/web/.env.local
cp .env.example apps/party/.env
# Edit both files — see docs/ENV.md for all variables and where to find them
```

### 5. Deploy

**Partykit (Session State Server):**
```bash
cd apps/party && npx partykit deploy
# Note the .partykit.dev domain printed at the end
```

**Vercel (web app):**
1. Connect this repo to Vercel, set root directory to `apps/web`
2. Add all env vars from `apps/web/.env.local` in the Vercel dashboard
3. Update `NEXT_PUBLIC_PARTYKIT_HOST` to your `.partykit.dev` domain
4. Deploy

## Connecting your agent

```bash
npx @squad/skill
# Interactive guided mode — prompts for session URL, agent ID, and API key
```

## Docs

Full setup guide, troubleshooting, and usage reference:
→ **https://squad-docs.vercel.app** *(deploy `apps/docs` to Vercel separately)*

## License

MIT
