# Summerhacks

Photo-sharing experiment with **Bump**, **Album** (per-person covers + vote/spin), **Friends**, **Calendar**, **Profile**, and **Memories**.

## Monorepo

- `apps/web` — Vite + React + TypeScript (static on Vercel)
- `apps/api` — Hono API (local Node + Vercel serverless via `api/index.ts` + `/api/*` rewrite)
- `packages/shared` — shared Zod schemas / constants
- `.context/` — agent feature specs (YAML)
- `docs/` — human docs + Mermaid diagrams

Frontend and API share one Vercel URL: the browser calls same-origin `/api/...`. See [docs/deploy-vercel.md](docs/deploy-vercel.md).

## Recreate locally

```bash
npm install
npm run build -w @summerhacks/shared
cp .env.example .env   # optional — leave DATABASE_URL empty for memory store
npm run dev            # or: npm run dev:api & npm run dev:web
```

| URL | Service |
| --- | --- |
| http://localhost:5173 | Vite web (proxies `/api` → API) |
| http://localhost:8787 | Hono API |

### Local DB switch

The API picks the store from env — no separate flag:

| `DATABASE_URL` | Store | Use when |
| --- | --- | --- |
| unset | In-memory | Default local; two browser tabs on one machine |
| set to Neon URL | Neon Postgres | Persist locally or debug against the same DB as Preview |

```bash
# Optional: hit Neon from local (copy pooled URL into .env — never commit)
# then push schema once:
set -a && source .env && set +a
npm run db:push -w @summerhacks/api
```

If `db:push` fails through the pooler, temporarily use the unpooled URL:

```bash
DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:push -w @summerhacks/api
```

Optional for event/avatar/album-cover/memory images: set `BLOB_READ_WRITE_TOKEN` (Vercel Blob). Without it, events and profile still work; image upload routes return 503.

Album covers are per member (draw → ready → vote or spin). See [.context/features/album/BRIEFING.md](.context/features/album/BRIEFING.md).

Optional for Memories playlists: set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `CRON_SECRET` (`SPOTIFY_REDIRECT_URI` is optional — auto-derived locally and on Vercel). Without them memories still lock and receipts still render; pasting a song link and exporting a playlist return 503. See [docs/memories/overview.md](docs/memories/overview.md).

`.env` / `.env.local` are gitignored. `.env.example` stays in git (placeholders only).

## Deploy (Vercel Preview)

```bash
npm install
npx vercel link          # once per machine; creates gitignored .vercel/
npm run deploy           # Preview URL
```

**Two-phone bumps need Neon on Preview** (serverless memory does not share across phones):

1. Create a Neon DB (Vercel Storage → Neon, or [console.neon.tech](https://console.neon.tech)) — Free plan is enough
2. Push schema once with that URL locally (`db:push` as above)
3. `npx vercel env add DATABASE_URL preview` — paste the **pooled** URL
4. Environments: enable **Preview** (and Production only if you use it). Skip Development unless you want `vercel env pull` to inject Neon locally
5. Skip “DB branch per deployment” for MVP — one shared Preview DB is fine
6. `npm run deploy` again, then check `/api/health` shows `"store":"neon"`

Disable **Vercel Authentication** under Project → Deployment Protection if phones shouldn’t need a Vercel login.

Full map: [docs/deploy-vercel.md](docs/deploy-vercel.md).

## Docs

- [How bump works](docs/bump/overview.md)
- [Album](docs/album/overview.md) · [Friends](docs/friends/overview.md) · [Calendar](docs/calendar/overview.md) · [Profile](docs/profile/overview.md) · [Memories](docs/memories/overview.md)
- [Matching + haptics](docs/bump/matching.md)
- [Architecture](docs/bump/architecture.md)
- [API](docs/bump/api.md) · [Data model](docs/bump/data-model.md)
- [Neon Auth (Google / GitHub / Email OTP)](docs/auth-neon.md)
- [Vercel + Neon (two-device demos)](docs/deploy-vercel.md)
- [Docs index](docs/README.md)
- [Agent briefing](.context/features/bump/BRIEFING.md) · [spec](.context/features/bump/spec.yaml)
