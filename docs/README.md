# Docs

Human-readable product and engineering docs. Agent-oriented YAML specs live under [`.context/`](../.context/).

## Features — Bump

| Doc | Contents |
| --- | --- |
| [bump/overview.md](bump/overview.md) | How bump works end to end, UI phases, success criteria |
| [bump/architecture.md](bump/architecture.md) | Topology, sequence, store switch, Vercel entry |
| [bump/matching.md](bump/matching.md) | Time/place rules, polling, haptics |
| [bump/api.md](bump/api.md) | HTTP surface + auth |
| [bump/data-model.md](bump/data-model.md) | Postgres tables + verify SQL |

## Features — Friends

| Doc | Contents |
| --- | --- |
| [friends/overview.md](friends/overview.md) | Friend codes + Accept/Reject |
| [friends/api.md](friends/api.md) | HTTP surface |
| [friends/data-model.md](friends/data-model.md) | Tables |

## Features — Calendar

| Doc | Contents |
| --- | --- |
| [calendar/overview.md](calendar/overview.md) | Friends-only events + FOAF |
| [calendar/architecture.md](calendar/architecture.md) | Fan-out rules |
| [calendar/api.md](calendar/api.md) | Events, RSVP, activity, uploads |
| [calendar/data-model.md](calendar/data-model.md) | Tables |

## Features — Profile

| Doc | Contents |
| --- | --- |
| [profile/overview.md](profile/overview.md) | Bio, pixel avatar, theme, logout |
| [profile/api.md](profile/api.md) | PATCH /users/me + avatar upload |
| [profile/data-model.md](profile/data-model.md) | `bio` / `avatar_url` |

## Features — Album

| Doc | Contents |
| --- | --- |
| [album/overview.md](album/overview.md) | Joint pixel cover after bump |
| [album/architecture.md](album/architecture.md) | Neon + Blob + vote/spin |
| [album/api.md](album/api.md) | Session album + cover upload |
| [album/data-model.md](album/data-model.md) | `albums` table |

## Features — Memories

| Doc | Contents |
| --- | --- |
| [memories/overview.md](memories/overview.md) | Album interior: 24h collaborative songs/photos, lock at window end |
| [memories/architecture.md](memories/architecture.md) | Lifecycle, visibility, receipt + strips + playlist |
| [memories/api.md](memories/api.md) | Memories, Spotify, cron sweeper |
| [memories/data-model.md](memories/data-model.md) | `memories*` tables + session join to covers |

Agent copy: [`.context/features/*/BRIEFING.md`](../.context/) · [spec.yaml](../.context/)

## Ops

| Topic | Docs |
| --- | --- |
| Vercel deploy, Neon, Blob, two-device demo | [deploy-vercel.md](deploy-vercel.md) |
| Neon Auth (Google / GitHub) | [auth-neon.md](auth-neon.md) |
| Quick start / env switch | [../README.md](../README.md) |
| Web unit tests (`npm run test -w @summerhacks/web`, watch: `test:watch`) | [../README.md](../README.md) |
| Session notes (2026-08-08 deploy bring-up) | [session-2026-08-08-vercel-neon.md](session-2026-08-08-vercel-neon.md) |
