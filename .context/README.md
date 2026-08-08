# Agent context

Machine-oriented feature specs for AI agents. Prefer these over scanning the whole repo when implementing or changing a feature.

## Conventions

- Specs live at `.context/features/<feature>/spec.yaml`
- Flattened copy/paste briefing: `.context/features/<feature>/BRIEFING.md`
- Human-readable docs live under `docs/<feature>/` and are linked from each spec via `related_docs`
- Ops / recreate / deploy: see each spec’s `ops` block plus `README.md` and `docs/deploy-vercel.md`
- When design changes, update **spec + BRIEFING + matching docs** in the same change
- Load order for bump work: `BRIEFING.md` or `spec.yaml` → `docs/bump/overview.md` → linked docs → code under `apps/` and `packages/shared`

## Features

| Feature | Spec | Flattened briefing | Human docs |
| --- | --- | --- | --- |
| Bump | [features/bump/spec.yaml](features/bump/spec.yaml) | [features/bump/BRIEFING.md](features/bump/BRIEFING.md) | [docs/bump/overview.md](../docs/bump/overview.md) |

## Bump — one-line model

Gesture on the client; match + session on the server (Neon). Time ±2s + IP geo; both users confirm; reopen via `sessionId`. Two phones need `DATABASE_URL` on Vercel.

## Local vs Preview DB (agents)

- Unset `DATABASE_URL` → memory store (local OK)
- Set `DATABASE_URL` on Vercel Preview/Prod → Neon (required for two-device bump)
- Never commit `.env` / `.vercel/`; use `.env.example` as the template
- Vercel API entry: `api/index.ts` + rewrite; named HTTP exports; root `"type": "module"`
- Neon match SQL needs `::text` / `::float8` casts
