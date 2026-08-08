# Bump — architecture

## Core insight

The bump **gesture** lives on the frontend; **pairing and session** live on the backend. Clients cannot exchange info peer-to-peer just because both shook — the server is the rendezvous.

## Deploy topology

```mermaid
flowchart LR
  subgraph clients [Clients]
    PhoneA[PhoneA]
    PhoneB[PhoneB]
    Desktop[DesktopDev]
  end

  subgraph vercel [Vercel]
    Web[ViteStaticSPA]
    Api[HonoServerlessAPI]
  end

  Neon[(NeonPostgres)]

  PhoneA --> Web
  PhoneB --> Web
  Desktop --> Web
  Web --> Api
  Api --> Neon
```

| Piece | Choice | Why |
| --- | --- | --- |
| Frontend | Vite + React + TS on Vercel | Static SPA |
| API | Hono via Vercel serverless | Same deploy; no second host for MVP |
| DB | Neon Postgres | Shared state across ephemeral functions |
| Match notify | Short polling in Bump Mode only | Serverless-safe; no long-lived WS |
| Canvas later | PartyKit / Ably / Fly WS | Attach to existing `sessionId` |

## Bump match sequence

```mermaid
sequenceDiagram
  participant A as ClientA
  participant S as API_Vercel
  participant DB as NeonPostgres
  participant B as ClientB

  A->>A: Enter Bump Mode plus motion permission
  B->>B: Enter Bump Mode plus motion permission
  A->>A: Accelerometer spike
  B->>B: Accelerometer spike
  A->>S: POST /bumps
  S->>DB: Insert BumpIntent with IP geo
  B->>S: POST /bumps
  S->>DB: Insert BumpIntent with IP geo
  S->>DB: Match by time plus coarse IP geo
  S->>DB: Create Session plus members
  A->>S: GET /bumps/:id poll
  B->>S: GET /bumps/:id poll
  S-->>A: matched plus sessionId
  S-->>B: matched plus sessionId
  A->>S: GET /sessions/:id
  B->>S: GET /sessions/:id
```

## Data lifetime

```mermaid
flowchart TB
  Intent[bump_intents ephemeral]
  Session[sessions durable]
  Members[session_members durable]
  Payload[sessions.payload JSONB]

  Intent -->|"on match"| Session
  Session --> Members
  Session --> Payload
```

- `bump_intents` — short-lived matching queue (seconds)
- `sessions` + `session_members` — product source of truth for connections
- `sessions.payload` — flexible nested profile/photo data without a document DB

## Monorepo layout

- `apps/web` — Vite React client
- `apps/api` — Hono API (local Node + shared by Vercel entry)
- `api/[[...route]].ts` — Vercel serverless catch-all → Hono (`/api/*`)
- `packages/shared` — shared types and Zod schemas

See also [Vercel frontend ↔ backend map](../deploy-vercel.md).
