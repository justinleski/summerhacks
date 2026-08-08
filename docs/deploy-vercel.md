# Vercel deployment map

How frontend and backend share one Preview/Production URL when deploying from the repo root with the Vercel CLI. Required reading for **two-phone bump** demos.

## Topology

```text
Browser
  │
  ├─ GET /                    → static files from apps/web/dist
  ├─ GET /session/:id         → SPA fallback (index.html) → React Router
  │
  └─ /api/*                   → rewrite → api/index.ts (Hono)
                                  └─ apps/api/src/app.ts (basePath /api)
                                       └─ Neon Postgres (DATABASE_URL)
```

| Concern | Where | Notes |
| --- | --- | --- |
| Static UI | `apps/web` → `apps/web/dist` | Vite build; `outputDirectory` in `vercel.json` |
| Shared types | `packages/shared` | Built before web in `buildCommand` |
| HTTP API | `api/index.ts` + rewrite `/api/(.*)` → `/api` | Nested paths need rewrite; Next-style `[[...route]]` is unreliable here |
| Client API calls | `fetch('/api' + path)` | Same origin — no CORS needed on Preview |
| Project link | `.vercel/` (gitignored) | Created by `vercel link` |
| Secrets | `.env` (gitignored) | Never commit; `.env.example` is the template |

## Request path examples

| Browser request | Handled by |
| --- | --- |
| `/` | `apps/web/dist/index.html` |
| `/assets/...` | Vite hashed assets |
| `/api/health` | Hono `GET /api/health` (`store`: `neon` \| `memory`) |
| `/api/bumps` | Hono bump routes |
| `/session/abc` | SPA rewrite → React Router |

## Recreate on a new machine

```bash
git clone <repo>
cd summerhacks
npm install
npm run build -w @summerhacks/shared
cp .env.example .env
npx vercel link    # same Vercel project; do not commit .vercel/
npm run deploy     # or npm run dev for local
```

## CLI

From repo root (after `vercel link`):

```bash
# Preview (feature branch / current files)
npm run deploy

# Production
npm run deploy:prod

# Local: static + /api together (optional alternative to npm run dev)
npx vercel dev
```

`vercel` is a root `devDependency` — use `npm run deploy` (or `npx vercel`).

Root `package.json` must keep `"type": "module"`. `api/index.ts` must export named `GET`/`POST`/… (not only a default `Response` handler).

## Neon for Preview/Production (required for two-device bumps)

Without `DATABASE_URL` on Vercel, each serverless invocation uses a fresh **in-memory** store — two phones will not match. Local two-tab testing can stay on memory.

### Provision

1. **Vercel Storage → Neon** (Free plan) **or** create a project at [console.neon.tech](https://console.neon.tech)
2. Copy the **pooled** connection string (`…-pooler…`, `sslmode=require`)
3. Put it in local `.env` as `DATABASE_URL` (optional unpooled as `DATABASE_URL_UNPOOLED` for migrations). **Quote the value** — `&` in query strings breaks `source .env`
4. Push schema once:

```bash
set -a && source .env && set +a
npm run db:push -w @summerhacks/api
# if pooler issues:
# DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:push -w @summerhacks/api
```

5. Add to Vercel (Preview **and** Production if you demo on the production URL):

```bash
npx vercel env add DATABASE_URL preview
npx vercel env add DATABASE_URL production   # if using Production
# paste pooled URL
```

6. Redeploy: `npm run deploy` or `npm run deploy:prod`
7. Verify: `GET /api/health` → `"store":"neon"`

### Which Vercel environments?

| Environment | Set `DATABASE_URL`? | Notes |
| --- | --- | --- |
| **Preview** | **Yes** | Feature / CLI Preview URLs |
| **Production** | **Yes** if demos use prod URL | Hobby prod is often public without SSO |
| **Development** | Usually no | Only for `vercel env pull` / `vercel dev` injecting Neon locally |

Skip **DB branch per deployment** for MVP — one shared Neon DB for all Preview deploys is enough.

### Local vs remote store (no extra flag)

| Local `DATABASE_URL` | Behavior |
| --- | --- |
| unset | In-memory (`npm run dev`) |
| set | Neon (same code path as Preview) |

## Mobile access

If phones hit a Vercel login wall: Project → **Settings** → **Deployment Protection** → disable **Vercel Authentication** for Preview (or use Production).

App “Continue” with a display name is bootstrap identity, not Vercel login — each phone still needs its own name/user so matching can show a peer.

Production alias used in bring-up: `https://summerhacks-ebon.vercel.app`

## Two-device smoke test (in person)

1. Open the **same** public URL on both phones (prefer Production if Preview is SSO-gated)
2. Distinct display names → Continue
3. Both enter Bump Mode; grant motion on iOS; shake (or Simulate) within ~2s
4. Expect confirm-peer UI → Confirm → same `/session/:id`
5. Optional DB check: both `bump_intents` `matched` with shared `session_id`; after both confirms, session `active`

Haptics alone do **not** prove a match — confirm + shared session does.

Quick API check:

```bash
curl https://summerhacks-ebon.vercel.app/api/health
# → {"ok":true,"store":"neon"}
```

## Related bump docs

- [How bump works](bump/overview.md)
- [Matching rules](bump/matching.md)
- [Architecture](bump/architecture.md)
- [Session bring-up notes](session-2026-08-08-vercel-neon.md)
