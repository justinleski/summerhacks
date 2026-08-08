# Bump — overview

Classic accelerometer bump for a Vite web app. Two users enter **Bump Mode**, shake near the same time, and the server pairs them into a **durable shared session** they can reopen later without bumping again.

## Product flow

1. User taps **Connect / Bump** → enters Bump Mode.
2. On that tap, request **device motion** permission (required on iOS Safari).
3. No GPS / browser geolocation prompt. Coarse place comes from request IP (Vercel geo headers).
4. While listening, accelerometer magnitude drives visual intensity (and vibration on Android).
5. On peak → `POST /bumps` → searching with short polling.
6. On match → confirm peer → open shared session.
7. Session remains available via `/session/:id` and Recent connections.

## UI states

`idle → listening → bump_detected → searching → matched_confirm → active_session`

Failure paths: `expired` / `no_match`. Desktop/dev has a **Simulate bump** control.

## Success criteria

- Two phones bump near the same time and both receive the same `sessionId` without a GPS prompt
- iOS motion permission is requested only when entering Bump Mode
- Session reopens from history/URL with no bump
- Works across multiple Vercel serverless instances against Neon Postgres
- Desktop simulate-bump works for local development

## Out of scope (MVP)

- Collaborative canvas / WebSockets
- GPS matching
- Full social feed
- NFC / QR fallback
