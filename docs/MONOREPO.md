# Monorepo setup

## Package manager and tooling

- **Package manager:** pnpm (workspaces)
- **Monorepo orchestration:** Turborepo
- **TypeScript:** 5.x strict mode everywhere
- **Testing:** Vitest
- **Linting:** ESLint + `@typescript-eslint`
- **Formatting:** Prettier (default config)

---

## Root `package.json`

```json
{
  "name": "squad",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "typecheck": "turbo typecheck",
    "lint": "turbo lint",
    "db:push": "supabase db push",
    "db:reset": "supabase db reset"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.0.0",
    "prettier": "^3.0.0",
    "vitest": "^2.0.0"
  }
}
```

## `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

## `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

---

## Root `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

Each app/package extends this with its own additions.

---

## `apps/web/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@squad/types": ["../../packages/types/src/index.ts"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## `apps/party/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "paths": {
      "@squad/types": ["../../packages/types/src/index.ts"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

## `packages/agent-runner/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "paths": {
      "@squad/types": ["../../packages/types/src/index.ts"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

---

## `partykit.json`

Lives at `apps/party/partykit.json`:

```json
{
  "name": "squad-sss",
  "main": "src/server.ts",
  "compatibilityDate": "2024-01-01"
}
```

---

## `apps/web/next.config.ts`

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
  // Allow Partykit WebSocket in dev
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
    ]
  },
}

export default nextConfig
```

---

## Local development startup

```bash
# Install all deps
pnpm install

# Set up env files (see docs/ENV.md)
cp .env.example apps/web/.env.local
cp .env.example apps/party/.env

# Push DB migrations
pnpm db:push

# Start everything
pnpm dev
# → Next.js on http://localhost:3000
# → Partykit on http://localhost:1999
```

---

## CI (GitHub Actions)

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

---

## Deployment

### Next.js (Vercel)
- Connect the GitHub repo to Vercel
- Set root directory to `apps/web`
- Add all env vars from `docs/ENV.md` in Vercel dashboard
- Framework preset: Next.js (auto-detected)

### Partykit
```bash
cd apps/party
npx partykit deploy
```
- First deploy creates the `squad-sss.{username}.partykit.dev` domain
- Update `NEXT_PUBLIC_PARTYKIT_HOST` in Vercel env vars to this domain
- Partykit reads env vars from `apps/party/.env` locally and from the Partykit dashboard in production
