# Claude Squad Landing Page — Design Spec

Date: 2026-04-24  
Repo: github.com/kevensavard/claudesquadlanding  
Deploy target: Vercel

---

## Goal

A standalone marketing + docs site for Claude Squad. Two distinct purposes:

- `/` — marketing landing page: convinces developers to self-host Claude Squad
- `/docs` and `/docs/[slug]` — full setup guide, step-by-step and troubleshooting

No hosted demo. No auth. Fully static. Primary CTAs: **Self-Host for Free** and **Star on GitHub**.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS |
| Fonts | Geist Sans + Geist Mono (via `next/font/google`) |
| Docs content | MDX via `@next/mdx` |
| Deployment | Vercel (zero-config, push to deploy) |
| Package manager | pnpm |

No database. No auth. No client-side state beyond scroll position.

---

## Visual Design

**Style:** Dark terminal. Black (`#09090b`) background. Off-white (`#fafafa`) text. Subtle dark borders (`#18181b`, `#27272a`). Single accent: purple (`#7c3aed`, `#a78bfa`). Green (`#10b981`) for success/positive states. No gradient glows. No centered purple hero. Monospace used as accent, not primary text.

**Typography:**
- Headlines: Geist Sans, weight 800–900, tight letter-spacing (`-1px` to `-1.5px`)
- Body: Geist Sans, weight 400, `#52525b`
- Labels/tags: Geist Mono, uppercase, `letter-spacing: 3px`, `#3f3f46`
- Code blocks: Geist Mono on `#000` background

**No gradient soup.** Borders and background variation (e.g. `#111` cards on `#09090b` page) create depth instead.

---

## Pages

### `/` — Landing Page

Full-scroll single page. Eight sections in order:

#### 1. Nav
- Left: square logo mark + `claude-squad` in monospace
- Right: `Docs` link, `GitHub ↗` link, `npm i claude-squad-skill` pill (monospace, dark border)
- Sticky, `border-bottom: 1px solid #18181b`

#### 2. Hero — Split Screen
- **Left column (42%):** label → headline → subheadline → token hook line → dual CTAs → MIT badge
  - Headline: "Every dev. / Their own / agent." (weight 900, `28px`, tight spacing)
  - Token hook: `"4 people → 4× the output → $5/person on a $20 project."` in Geist Mono, purple
  - CTA 1: `Self-Host for Free →` (white bg, black text)
  - CTA 2: `★ Star on GitHub` (dark bg, border)
- **Right column (58%):** faked live session UI — message bubbles, 3 task cards with agent name + status + token count, build summary row. No screenshot — coded in JSX to always look sharp.
- Divider: `border-right: 1px solid #18181b`

#### 3. Bento Feature Grid
10 features rendered as a CSS grid mosaic (multi-agent group chat and task dispatch are demonstrated visually in the hero panel, not repeated here). Cell sizes vary — bigger cells for higher-impact features:

| Cell | Size | Feature |
|---|---|---|
| Token cost split | 2-col | Shared cost table with animated bar chart (CSS only) |
| Parallel execution | 1-col | Three colored progress bars stacked |
| Claude Code MCP | 1-col | Mini terminal showing one-command connect |
| Auto merge + PR | 1-col | Short copy |
| GitHub integration | 1-col | Short copy |
| Session summary | 2-col | Copy + mini cost breakdown card |
| Token metering | 1-col | Short copy |
| Proposal editing | 1-col | Short copy |
| Invite flow | 1-col | Short copy |
| Fully self-hosted | 1-col | Short copy |

Grid: `grid-template-columns: repeat(4, 1fr)`. All cells: `background: #111`, `border: 1px solid #1e1e1e`, `border-radius: 10px`.

#### 4. How It Works
6-step horizontal timeline with numbered circles connected by a horizontal rule. Steps:
1. Describe goal
2. Orchestrator plans
3. Review proposal
4. Agents run in parallel
5. Auto merge
6. Build summary (circle uses `✓` in green instead of a number)

#### 5. Getting Started
Two-column layout:
- Left: label, headline ("One command to connect."), description, `Full setup guide →` button (links to `/docs`)
- Right: terminal code block — the `npx claude-squad-skill connect` command with three green checkmarks output

#### 6. Architecture
Horizontal 4-node diagram: Vercel → Partykit → squad-skill CLI → Supabase. Connected by `──WebSocket──` text connectors. "ALL FREE TIER COMPATIBLE" label below.

#### 7. Why Self-Host
3-column card grid:
- No API key lock-in
- Free-tier infrastructure
- MIT licensed

#### 8. Footer CTA
Centered: big headline → sub copy → dual CTA buttons (same as hero)

#### 9. Footer
Full-width footer: `claude-squad · MIT License` on left, `GitHub / Docs / npm` links on right.

---

### `/docs` — Documentation

**Layout:** Two-panel. Left sidebar (fixed, `240px`) + right content area (scrollable).

**Sidebar nav:** Auto-generated from MDX filenames. Numbered `01–08` prefix sets order, stripped from display name.

**MDX files** (in `content/docs/`):

| File | Title |
|---|---|
| `01-prerequisites.mdx` | Prerequisites |
| `02-clone-install.mdx` | Clone & Install |
| `03-supabase.mdx` | Set up Supabase |
| `04-github-oauth.mdx` | Set up GitHub OAuth |
| `05-partykit.mdx` | Deploy Partykit |
| `06-env-vars.mdx` | Environment Variables |
| `07-deploy-vercel.mdx` | Deploy to Vercel |
| `08-troubleshooting.mdx` | Troubleshooting |

**MDX components:** Custom styled code blocks (Geist Mono on black), callout boxes (`> Note:` → styled aside), step numbers, copy-to-clipboard button on code blocks.

**Routing:** `app/docs/[[...slug]]/page.tsx` catches all doc routes. Reads matching MDX file from `content/docs/`, renders with sidebar.

---

## File Structure

```
claudesquadlanding/
├── app/
│   ├── layout.tsx                    # Root layout: font, globals
│   ├── page.tsx                      # Landing page — imports all section components
│   ├── docs/
│   │   └── [[...slug]]/
│   │       └── page.tsx              # Docs page — reads MDX, renders with sidebar
│   └── globals.css
├── components/
│   ├── nav.tsx
│   ├── footer.tsx
│   ├── sections/
│   │   ├── hero.tsx
│   │   ├── bento-features.tsx
│   │   ├── how-it-works.tsx
│   │   ├── getting-started.tsx
│   │   ├── architecture-diagram.tsx
│   │   ├── why-self-host.tsx
│   │   └── footer-cta.tsx
│   └── docs/
│       ├── sidebar.tsx
│       └── mdx-components.tsx
├── content/
│   └── docs/
│       ├── 01-prerequisites.mdx
│       ├── 02-clone-install.mdx
│       ├── 03-supabase.mdx
│       ├── 04-github-oauth.mdx
│       ├── 05-partykit.mdx
│       ├── 06-env-vars.mdx
│       ├── 07-deploy-vercel.mdx
│       └── 08-troubleshooting.mdx
├── public/
│   └── banner.png
├── tailwind.config.ts
├── next.config.ts                    # enables @next/mdx
└── package.json
```

---

## Component Notes

**`hero.tsx`:** The right-panel fake UI is coded in JSX (not a screenshot) so it stays sharp at all sizes and can be updated as the app evolves.

**`bento-features.tsx`:** Uses CSS Grid with `grid-column` span overrides for the wide cells. No JS — pure layout.

**`architecture-diagram.tsx`:** Pure HTML/CSS diagram. No SVG library, no D3. Simple flex row with text connectors.

**`sidebar.tsx`:** Reads the MDX file list at build time via `fs.readdirSync('content/docs')`, strips numeric prefix for display, highlights active route via `usePathname()`.

**`mdx-components.tsx`:** Overrides `pre`, `code`, `blockquote` with custom dark-themed versions. Adds copy button to `pre` blocks via a small client component.

---

## Deployment

1. Create repo at github.com/kevensavard/claudesquadlanding
2. Import in Vercel → root directory is `/` (no monorepo)
3. No env vars required (fully static)
4. Push to `main` → auto-deploys

---

## Out of Scope

- Analytics (add later if needed)
- i18n
- Blog
- Search in docs (add later)
- Dark/light toggle (dark only)
