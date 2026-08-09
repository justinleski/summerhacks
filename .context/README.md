# Agent context

Machine-oriented feature specs for AI agents. Prefer these over scanning the whole repo when implementing or changing a feature.

## Conventions

- Specs live at `.context/features/<feature>/spec.yaml`
- Flattened copy/paste briefing: `.context/features/<feature>/BRIEFING.md`
- Human-readable docs live under `docs/<feature>/` and are linked from each spec via `related_docs`
- Ops / recreate / deploy: see each spec’s `ops` block plus `README.md` and `docs/deploy-vercel.md`
- When design changes, update **spec + BRIEFING + matching docs** in the same change

## Features

| Feature | Spec | Flattened briefing | Human docs |
| --- | --- | --- | --- |
| Bump | [features/bump/spec.yaml](features/bump/spec.yaml) | [features/bump/BRIEFING.md](features/bump/BRIEFING.md) | [docs/bump/overview.md](../docs/bump/overview.md) |
| Friends | [features/friends/spec.yaml](features/friends/spec.yaml) | [features/friends/BRIEFING.md](features/friends/BRIEFING.md) | [docs/friends/overview.md](../docs/friends/overview.md) |
| Calendar | [features/calendar/spec.yaml](features/calendar/spec.yaml) | [features/calendar/BRIEFING.md](features/calendar/BRIEFING.md) | [docs/calendar/overview.md](../docs/calendar/overview.md) |
| Profile | [features/profile/spec.yaml](features/profile/spec.yaml) | [features/profile/BRIEFING.md](features/profile/BRIEFING.md) | [docs/profile/overview.md](../docs/profile/overview.md) |

## One-line models

- **Bump:** Gesture on client; match + session on server (Neon). Time ±2s + IP geo.
- **Friends:** Friend code → inbox Accept/Reject; follow = friendship.
- **Calendar:** Friends-only events + FOAF attendance; activity fan-out; optional Blob images.
- **Profile:** Bio + avatar (Blob) + client theme + logout.

## Local vs Preview DB (agents)

- Unset `DATABASE_URL` → memory store (local OK)
- Set `DATABASE_URL` on Vercel Preview/Prod → Neon
- Image/avatar uploads need `BLOB_READ_WRITE_TOKEN`
- Never commit `.env` / `.vercel/`; use `.env.example` as the template
