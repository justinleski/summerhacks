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
| [profile/overview.md](profile/overview.md) | Bio, avatar, theme, logout |
| [profile/api.md](profile/api.md) | PATCH /users/me + avatar upload |
| [profile/data-model.md](profile/data-model.md) | `bio` / `avatar_url` |

Agent copy: [`.context/features/*/BRIEFING.md`](../.context/) · [spec.yaml](../.context/)

## Ops

| Topic | Docs |
| --- | --- |
| Vercel deploy, Neon, Blob, two-device demo | [deploy-vercel.md](deploy-vercel.md) |
| Neon Auth (Google / GitHub) | [auth-neon.md](auth-neon.md) |
| Quick start / env switch | [../README.md](../README.md) |
| Session notes (2026-08-08 deploy bring-up) | [session-2026-08-08-vercel-neon.md](session-2026-08-08-vercel-neon.md) |
