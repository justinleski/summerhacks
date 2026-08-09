# Summerhacks — Bump context (flattened)

Copy/paste briefing for future agents and humans. Keep in sync with `spec.yaml` and `docs/bump/*` + `docs/deploy-vercel.md`.

---

## Product (MVP)

Photo-sharing direction long-term; **MVP is Bump only** (not full feed, not collaborative canvas yet).

**Bump:** two users enter explicit **Bump Mode**, shake (accelerometer), server pairs them by **time + coarse IP geo**, opens a **durable shared session** they can reopen later **without bumping again**.

**Canvas / WebSockets:** deferred. Same `sessionId` will become the realtime room later (PartyKit / Ably / Fly — not long-lived WS on Vercel serverless).

---

## How it works (remember this flow)

1. Bootstrap display name → token = user id (`localStorage`)
2. Enter Bump Mode → motion permission on gesture (no GPS)
3. Accel peak (threshold ~16) or Simulate → `POST /api/bumps` (+ IP geo)
4. Match within ±2s server time + place; create session `pending_confirm`
5. Poll `GET /api/bumps/:id` (~500ms) until matched/expired
6. Both users confirm → session `active` → navigate `/session/:id`

**Correctness = matched → confirm → same sessionId.** Haptics alone do not prove a match.

---

## Core architecture memory

| Concern | Where | Why |
| --- | --- | --- |
| Accelerometer + Bump Mode UI + haptics/visual | **Frontend** (`apps/web`) | Sensors, permissions, UX |
| Matching + sessions | **Backend** (`apps/api` → Vercel `/api`) | Only place that sees both clients |
| Durable state | **Neon Postgres** (`DATABASE_URL`) | Shared across serverless instances |
| Local/dev without DB | **In-memory store** | Fine for two-tab simulate-bump; **broken on Vercel without Neon** |

**Key insight:** Clients cannot peer-exchange on shake alone. Server is the rendezvous. **UX source of truth = `sessions`**, not bumps. `bump_intents` are a short-lived matching queue (seconds).

---

## Stack (locked)

- Monorepo: `apps/web` (Vite + React + TS), `apps/api` (Hono + TS), `packages/shared` (Zod)
- Root `package.json`: **`"type": "module"`** (required so Vercel loads `api/index.js` as ESM)
- Deploy: **Vercel** — static web + serverless `api/index.ts` + rewrite `/api/(.*)` → `/api`
- DB: **Neon Postgres** + Drizzle (`apps/api/src/db/schema.ts`, `neon-store.ts`)
- Auth MVP: Neon Auth (Google shared credentials; GitHub with Console OAuth app) + guest bootstrap fallback; API verifies JWT via JWKS then maps to `users.auth_user_id`
- Match notify MVP: **short polling** in Bump Mode only (~500ms, ≤8s) — not WebSockets
- CLI: `vercel` is a root **devDependency** (`npm run deploy` / `deploy:prod`)

Frontend calls **same-origin** `fetch('/api' + path)` — no separate API host on Preview/Production.

---

## Matching rules (remember these)

Constants: `MATCH_TIME_WINDOW_MS=2000`, `BUMP_EXPIRY_MS=8000`, `BUMP_POLL_INTERVAL_MS=500`

- **Time window:** ~±2000ms (prefer **server receive time**)
- **Place** (any one): same country + (city or region); OR lat/lng Euclidean < 0.5°; OR same IP
- **No browser geolocation** in MVP (GPS optional later; nullable lat/lng reserved)
- **Expiry:** ~8000ms unmatched → expired
- **One-to-one** transactional-ish match; **both** members must confirm before `active`
- **Accelerometer:** client UX + intent gate (threshold ~16); optional `peakMagnitude` on intent
- Local stub geo via `DEV_GEO_*` so localhost clients can match
- Neon HTTP driver: cast JS params in match SQL (`::text` / `::float8`) or you get `could not determine data type of parameter $N`

---

## Permissions / haptics (platform gotchas)

- **iOS motion permission:** required; request only on **user gesture** when entering Bump Mode
- **Vibration:** no extra permission; `navigator.vibrate` works on **Android Chrome**, **not iOS Safari**
- On iOS: drive **visual intensity** from accel magnitude; vibrate when available
- Desktop: **Simulate bump** button required for dev

---

## UI phases (client)

`idle → listening → searching → matched_confirm` (+ `expired` / `error`). Confirm navigates to `/session/:id`.

---

## Data model (Postgres)

**Durable**
- `users` — id, displayName, avatarUrl?, deviceId?, createdAt
- `sessions` — id, createdVia=`bump`, status=`pending_confirm|active|closed`, **payload JSONB**, createdAt
- `session_members` — sessionId, userId, joinedAt, confirmedAt?

**Ephemeral**
- `bump_intents` — matching queue + IP geo fields + idempotencyKey + status + expiresAt

**Flexible blobs:** `sessions.payload` JSONB (profiles, photo URLs, later canvas meta) — **do not add Mongo**; dual-DB was rejected for MVP.

---

## API surface

- `GET /api/health` — `{ ok, store: "neon"|"memory" }`
- `POST /api/users/bootstrap` — `{ displayName, deviceId? }` → `{ user, token }`
- `POST /api/bumps` — `{ clientTimestamp, peakMagnitude?, idempotencyKey }` → pending/matched
- `GET /api/bumps/:id` — poll while searching (also retries match)
- `DELETE /api/bumps/:id` — leave Bump Mode / cancel
- `GET /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id/confirm`

---

## Vercel deploy map (critical)

```text
Preview/Production URL
├── /*       → apps/web/dist (Vite SPA)
└── /api/*   → vercel.json rewrite → api/index.ts → Hono (basePath /api)
                 └── Neon if DATABASE_URL set
```

### Do not re-litigate these Vercel gotchas

1. **Not Next.js** — filesystem catch-alls `api/[[...route]].ts` / `[...route].ts` are unreliable. Use **`api/index.ts` + rewrite** `/api/(.*)` → `/api`.
2. **Web handler exports** — export named `GET`/`POST`/… from `hono/vercel` `handle(app)`. A **default export that returns `Response` is ignored** (Node `(req,res)` signature) → hung/empty responses.
3. **`"type": "module"`** at repo root — without it: `Cannot use import statement outside a module` on `/var/task/api/index.js`.
4. **Dynamic `import("../apps/api/src/app.js")`** — avoids `ERR_REQUIRE_ESM` when the wrapper is CJS-ish.
5. **Drizzle TS noise on Vercel build** — Vercel may print `neon-store.ts` insert-type errors during function compile; local `typecheck` is clean; build can still succeed. Do not “fix” schema by deleting columns.
6. **Quote `&` in `.env` URLs** — `source .env` otherwise background-jobs at `&sslmode=…`.

- `.vercel/` is **gitignored**; created by `vercel link` (project: `summerhacks`)
- CLI: `npm run deploy` (Preview), `npm run deploy:prod`
- Docs: `docs/deploy-vercel.md`
- MCP: Vercel MCP (`list_deployments`, `get_runtime_logs`, `web_fetch_vercel_url`) is useful for auth-protected Preview + runtime diagnosis

### DB for Preview/Production (must for real bump tests)

1. Create Neon DB (Free) + connection string  
2. Quote URLs in local `.env`; `set -a && source .env && set +a`  
3. `npm run db:push -w @summerhacks/api` (use `DATABASE_URL_UNPOOLED` if pooler fails)  
4. `npx vercel env add DATABASE_URL preview` (and **production** if demos use prod URL) — **sensitive: Y**, leave branch empty for all Preview  
5. Redeploy  

**Without `DATABASE_URL` on Vercel:** app may boot, but two phones will **not** match (per-invocation memory).

Local: skip Neon; memory store is OK. Switch = set/unset `DATABASE_URL` (no extra flag). Skip Development env + per-deploy DB branches for MVP.

### Mobile testing / in-person demo

- Prefer Production URL if Preview has Vercel Authentication: `https://summerhacks-ebon.vercel.app`
- Disable **Vercel Authentication** (Deployment Protection) for Preview if using Preview URLs
- App “Continue” + display name is **bootstrap**, not Vercel login — each phone needs its own user
- Shake within ~2s after both are listening; confirm peer on both devices
- Optional: verify Neon rows (`matched` intents + shared `session_id`)

### Smoke checks

```bash
curl https://summerhacks-ebon.vercel.app/api/health          # expect "store":"neon"
# bootstrap two users, POST /api/bumps within ~2s → second returns matched + sessionId
```

---

## Repo layout cheat sheet

```text
.context/features/bump/spec.yaml   # agent checklist
.context/features/bump/BRIEFING.md # this flattened briefing
docs/bump/*                        # human docs + Mermaid
docs/deploy-vercel.md
docs/session-2026-08-08-vercel-neon.md
apps/web/src/features/bump/        # BumpMode, accel, haptics, poll
apps/web/src/features/session/     # SessionView, RecentSessions
apps/api/src/routes/               # users, bumps, sessions
apps/api/src/db/                   # schema, memory-store, neon-store
api/index.ts                       # Vercel entry (named HTTP exports)
vercel.json                        # rewrites + build
packages/shared                    # constants + Zod schemas
.env.example                       # placeholders; never commit real .env
```

---

## Explicit non-goals (MVP)

- Collaborative canvas protocol / WebSockets  
- GPS matching  
- Full social feed  
- NFC / QR fallback  
- Strong anti-spoofing  
- Mongo / dual database  

---

## Future implementation priorities

1. Keep Neon + Preview/Prod env healthy for device testing  
2. Real auth (signed tokens) instead of raw user id  
3. Richer `sessions.payload` (photos) once storage (R2/S3) exists  
4. **Realtime on `sessionId`** for co-editing canvas (external WS provider)  
5. Optional GPS refinement for tighter place matching  
6. QR/code fallback when IP geo is too coarse  

---

## Key memories (don’t re-litigate)

1. **Bump gesture = frontend; pairing + session = backend.**  
2. **Sessions are durable product objects; bumps are ephemeral tickets.**  
3. **Postgres + JSONB, not Mongo** — relations for match/list, JSONB for OO payloads.  
4. **Neon = hosted Postgres for serverless**, not a different data model.  
5. **No GPS in MVP** — IP geo + tight time window + accel.  
6. **Vercel ≠ long-lived WebSocket server** — poll for bump; canvas later elsewhere.  
7. **iOS has no `navigator.vibrate`** — plan visual feedback.  
8. **Same-origin `/api` on Vercel** — frontend must keep relative `/api` paths.  
9. **`api/index.ts` + rewrite**, not Next-style catch-all filenames.  
10. **Named `GET`/`POST`/… exports** for Hono on Vercel — not default `Response`.  
11. **Root `"type": "module"`** required for the API function.  
12. **Both members confirm** after match before session is `active`.  
13. **Haptics ≠ correctness**; shared session after confirm does.  
14. **Quote `&` in Neon URLs** in `.env`; cast Neon match SQL params.  
