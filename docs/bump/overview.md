# Bump — overview

Classic accelerometer bump for a Vite web app. Two users enter **Bump Mode**, shake near the same time and place, and the server pairs them into a **durable shared session** they can reopen later without bumping again.

**UX source of truth = sessions**, not bumps. `bump_intents` are a short-lived matching queue (seconds).

## How it works (end to end)

1. Each device opens the app and bootstraps with a **distinct display name** (`POST /api/users/bootstrap`). Token for MVP = that user’s id (stored in `localStorage`).
2. User taps **Start listening** → enters Bump Mode → iOS requests **device motion** on that gesture (no GPS / browser geolocation).
3. Accelerometer magnitude drives a shared visual intensity ring (and vibration on Android Chrome). Peak over threshold (~16) → client posts a bump intent.
4. Server stores the intent with **IP + Vercel geo headers**, then tries to match another pending intent by **server receive time (±2s)** and **coarse place** (see [matching.md](matching.md)).
5. On match: create `sessions` + `session_members` at status `pending_confirm`; both clients learn the same `sessionId` + peer (POST response or poll).
6. If auto-match expires: show anonymous same-place avatars from the last ~45s; tap to propose; peer accepts → same session confirm flow.
7. Each user taps **Confirm connection** → `POST /api/sessions/:id/confirm`. When **both** members have `confirmedAt`, session becomes `active`.
8. Session stays reopenable via `/session/:id` and Recent connections — no bump required.

Desktop/dev: **Simulate bump** posts an intent without accelerometer.

## Product flow (short)

```text
bootstrap → Bump Mode → motion permission → listen → peak/simulate
  → POST /api/bumps → poll GET /api/bumps/:id
  → matched_confirm → POST confirm → /session/:id
  OR expired → candidates → propose / accept → matched_confirm → …
```

## UI phases (client)

Implemented in `apps/web/src/features/bump/BumpMode.tsx`:

| Phase | Meaning |
| --- | --- |
| `idle` | Not listening yet |
| `listening` | Accel on; intensity ring active |
| `searching` | Intent posted; polling for peer |
| `matched_confirm` | Peer shown; waiting for confirm |
| `expired` | Window elapsed; anonymous candidate picker |
| `proposal_incoming` | Peer proposed; accept / decline |
| `error` | Permission / network / API failure |

After confirm, the app navigates to the session route (not a separate “active_session” phase).

## Success criteria

- Two phones bump near the same time and both receive the **same `sessionId`** without a GPS prompt
- iOS motion permission is requested only when entering Bump Mode
- Session reopens from history/URL with no bump
- Works across multiple Vercel serverless instances against **Neon** (`GET /api/health` → `"store":"neon"`)
- Desktop simulate-bump works for local development (memory store OK for two tabs on one machine)
- Correctness = **matched → confirm → shared session**, not haptics alone

## Out of scope (MVP)

- GPS matching
- Full social feed
- NFC / QR fallback
- Strong anti-spoofing / signed JWT auth
- P2P cover sync (covers are per-user + vote/spin — see [album/overview.md](../album/overview.md))

## Related

| Doc | Covers |
| --- | --- |
| [architecture.md](architecture.md) | Deploy topology, sequence, monorepo |
| [matching.md](matching.md) | Time/place rules, polling, haptics |
| [api.md](api.md) | HTTP surface + auth |
| [data-model.md](data-model.md) | Postgres tables |
| [../album/overview.md](../album/overview.md) | Joint pixel cover after bump |
| [../deploy-vercel.md](../deploy-vercel.md) | Neon + Vercel for two-device demos |
| [Agent briefing](../../.context/features/bump/BRIEFING.md) | Flattened agent copy |
