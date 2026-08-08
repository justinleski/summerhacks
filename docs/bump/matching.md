# Bump — matching and haptics

## Matching rules

- **Time window**: intents within ~±2000ms using **server receive time** as primary
- **Place**: Vercel IP geo — same country + (region or city), or city-scale lat/lng proximity
- **One-to-one**: each intent matches at most one other unpaired intent
- **Expiry**: unmatched intents expire after ~8000ms
- **Confirm**: show confirm UI before treating the connection as fully active
- **Transactional match**: select candidate → mark both matched → create session + members in one Postgres transaction (safe across concurrent serverless instances)

Accelerometer peak is a **client UX / intent gate**. Server matching is time + coarse IP place. Optional `peakMagnitude` can break ties later.

## Geo without GPS

Server reads Vercel headers such as:

- `x-vercel-ip-city`
- `x-vercel-ip-country`
- `x-vercel-ip-country-region`
- `x-vercel-ip-latitude`
- `x-vercel-ip-longitude`

Local/dev uses a stub geo (env override or fixed city) so two local clients can still match.

## Polling (MVP realtime)

While status is `searching`, the client polls `GET /bumps/:id` every ~500ms until matched or expired. Do not poll outside Bump Mode.

## Haptics

Map acceleration magnitude to feedback while listening:

1. `mag = sqrt(x² + y² + z²)` (optionally remove gravity)
2. As `mag` approaches the bump threshold, increase visual ring intensity / pulse rate
3. On threshold: stronger confirmation feedback → `bump_detected` → post intent

**Permissions**

- Device motion: required on iOS after user gesture
- Vibration: no extra permission; best-effort after user gesture

**Platforms**

- Android Chrome: `navigator.vibrate(pattern)` for intensity-linked pulses
- iOS Safari: no `navigator.vibrate` — rely on the shared visual intensity meter (optional audio later)
