# Summerhacks

Photo-sharing experiment with a **Bump** connection flow.

## Monorepo

- `apps/web` — Vite + React + TypeScript
- `apps/api` — Hono API (local Node + Vercel serverless)
- `packages/shared` — shared Zod schemas / constants
- `.context/` — agent feature specs (YAML)
- `docs/` — human docs + Mermaid diagrams

## Quick start

```bash
npm install
npm run build -w @summerhacks/shared
npm run dev:api   # http://localhost:8787
npm run dev:web   # http://localhost:5173 (proxies /api)
```

Or run both via `npm run dev`.

Without `DATABASE_URL`, the API uses an **in-memory store** (perfect for local two-tab bump testing). Set `DATABASE_URL` to a Neon Postgres URL for persistence, then:

```bash
cd apps/api && npm run db:push
```

## Docs

- [Bump overview](docs/bump/overview.md)
- [Architecture](docs/bump/architecture.md)
- [Agent spec](.context/features/bump/spec.yaml)
