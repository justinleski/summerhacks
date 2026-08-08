# Summerhacks

Photo-sharing experiment with a **Bump** connection flow.

## Monorepo

- `apps/web` — Vite + React + TypeScript (static on Vercel)
- `apps/api` — Hono API (local Node + Vercel serverless via `api/[[...route]].ts`)
- `packages/shared` — shared Zod schemas / constants
- `.context/` — agent feature specs (YAML)
- `docs/` — human docs + Mermaid diagrams

Frontend and API share one Vercel URL: the browser calls same-origin `/api/...`. See [docs/deploy-vercel.md](docs/deploy-vercel.md).

## Quick start (local)

```bash
npm install
npm run build -w @summerhacks/shared
npm run dev:api   # http://localhost:8787
npm run dev:web   # http://localhost:5173 (proxies /api)
```

Or run both via `npm run dev`.

Without `DATABASE_URL`, the API uses an **in-memory store** (fine for local two-tab bump testing). Set `DATABASE_URL` to a Neon Postgres URL for persistence, then:

```bash
npm run db:push -w @summerhacks/api
```

## Deploy (Vercel CLI)

Project is linked via `.vercel/` (gitignored). From repo root:

```bash
npm install
npm run build -w @summerhacks/shared   # ensure shared types exist for API bundle

# Preview deploy (feature branch / working tree)
npm run deploy

# Production
npm run deploy:prod
```

Set Neon for Preview so bumps can match across serverless instances:

```bash
vercel env add DATABASE_URL preview
```

## Docs

- [Bump overview](docs/bump/overview.md)
- [Architecture](docs/bump/architecture.md)
- [Vercel frontend ↔ backend map](docs/deploy-vercel.md)
- [Agent spec](.context/features/bump/spec.yaml)
