# Bump — matching and haptics

Constants live in `packages/shared` (`MATCH_TIME_WINDOW_MS`, `BUMP_EXPIRY_MS`, `BUMP_POLL_INTERVAL_MS`). Client peak threshold is `THRESHOLD = 16` in `BumpMode.tsx`.

## Matching rules

| Rule | Value | Notes |
| --- | --- | --- |
| Time window | ±2000ms | **Server receive time** (`server_timestamp`), not client clock |
| Expiry | 8000ms | Unmatched pending → `expired` |
| Cardinality | One-to-one | Closest-in-time pending partner wins |
| Confirm | Both members | Session stays `pending_confirm` until both `confirmedAt` set → `active` |
| Accel peak | Client gate only | Optional `peakMagnitude` stored; not required for server match |

### Place (any one of these)

Implemented in `memory-store.ts` / `neon-store.ts` `placesMatch` / `placesSqlMatch`:

1. **Same country** and (**same city** or **same region**), or
2. **Lat/lng proximity** — Euclidean distance of degrees < `0.5` (~city scale), or
3. **Same IP** — useful for local stub / identical egress

No browser geolocation in MVP.

### Transactional match

Select candidate → mark both intents `matched` → create `sessions` + `session_members` in one store operation (Neon uses SQL; memory store is single-process). Safe across concurrent serverless instances when on Neon.

Neon HTTP driver: cast JS params in match SQL (`::text` / `::float8`) or Postgres errors with `could not determine data type of parameter $N`.

## Geo without GPS

Server reads Vercel headers via `geoFromRequest`:

- `x-vercel-ip-city`
- `x-vercel-ip-country`
- `x-vercel-ip-country-region`
- `x-vercel-ip-latitude`
- `x-vercel-ip-longitude`
- plus request IP

Local/dev stub (when headers absent) from env:

| Env | Default |
| --- | --- |
| `DEV_GEO_CITY` | `LocalDev` |
| `DEV_GEO_REGION` | `Dev` |
| `DEV_GEO_COUNTRY` | `XX` |
| `DEV_GEO_LAT` / `DEV_GEO_LNG` | `0` |

Two local clients then match via stub city/region or same IP.

## Polling (MVP realtime)

While status is searching, the client polls `GET /api/bumps/:id` every **~500ms** until matched or expired. Poll also re-runs `tryMatchBump` so the first arriver can pair when the second posts. Do not poll outside Bump Mode.

## Haptics

Map acceleration magnitude to feedback while listening:

1. `mag = sqrt(x² + y² + z²)` (optionally remove gravity)
2. As `mag` approaches the bump threshold (~16), increase visual ring intensity / pulse rate
3. On threshold: stronger confirmation feedback → post intent → `searching`

**Permissions**

- Device motion: required on iOS after user gesture (`Start listening`)
- Vibration: no extra permission; best-effort after user gesture

**Platforms**

- Android Chrome: `navigator.vibrate(pattern)` for intensity-linked pulses
- iOS Safari: no `navigator.vibrate` — rely on the shared visual intensity meter

Haptics alone do **not** prove a match — confirm + shared `sessionId` does.
