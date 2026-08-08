# Vercel deployment map

How frontend and backend share one Preview/Production URL when deploying from the repo root with the Vercel CLI.

## Topology

```text
Browser
  │
  ├─ GET /                    → static files from apps/web/dist
  ├─ GET /session/:id         → SPA fallback (index.html) → React Router
  │
  └─ /api/*                   → serverless function api/[[...route]].ts
                                  └─ apps/api/src/app.ts (Hono, basePath /api)
                                       └─ Neon Postgres (DATABASE_URL)
```

| Concern | Where | Notes |
| --- | --- | --- |
| Static UI | `apps/web` → `apps/web/dist` | Vite build; `outputDirectory` in `vercel.json` |
| Shared types | `packages/shared` | Built before web in `buildCommand` |
| HTTP API | `api/[[...route]].ts` | Vercel serverless; imports Hono app |
| Client API calls | `fetch('/api' + path)` | Same origin — no CORS needed on Preview |
| Project link | `.vercel/` (gitignored) | Created by `vercel link` |

## Request path examples

| Browser request | Handled by |
| --- | --- |
| `/` | `apps/web/dist/index.html` |
| `/assets/...` | Vite hashed assets |
| `/api/health` | Hono `GET /api/health` |
| `/api/bumps` | Hono bump routes |
| `/session/abc` | SPA rewrite → React Router |

## CLI

From repo root (where `.vercel` already exists):

```bash
# Preview (feature branch / current files)
npm run deploy

# Production
npm run deploy:prod

# Local: static + /api together (optional alternative to npm run dev)
npx vercel dev
```

### Env for Preview bumps to actually match

```bash
vercel env add DATABASE_URL preview
# paste Neon connection string
```

Then push schema once against that DB (`npm run db:push -w @summerhacks/api` with `DATABASE_URL` set locally).

Without `DATABASE_URL`, each serverless invocation uses a fresh in-memory store — two phones will not match.
