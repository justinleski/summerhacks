# Summerhacks

_A small shared artifact for friends who keep ending up in different cities._

## What it is

We built Summerhacks for friends who move around a lot: co-op terms, internships, weekend visits, new cities, old friends, slightly cursed group chats. It is mobile-first because the moment is already happening on a phone, not later on a laptop with admirable posture.

The core mechanic is Bump. Two people open Bump Mode, shake their phones near the same time and place, and the server pairs them into a shared session. That session stays reopenable, so the bump is not just a cute gesture. It is the doorway into the thing you keep.

From there, a session can become a Memory: songs, a shared note, and the pieces people add during a 24-hour window. When the window closes, Summerhacks locks it into a private receipt-style keepsake and a real Spotify playlist for each connected account.

## Features

**Memories**  
_The receipt you get after a good hangout, minus the bill._

Every bump session gets a memory window tied to the same 24-hour album window. Members can add three Spotify tracks each, one optional shared note, and their side of the keepsake before time runs out. The open draft is collaborative, so everyone in the session can see the album filling in while there is still time to edit. Marking done is only a soft signal; the hard lock happens when the window expires. Once locked, the memory is private to the session members and renders as a receipt-style artifact with per-member Spotify playlists when Spotify is connected. The data model is member-based, so the memory system is not hardcoded to exactly two people.

**Bump**  
_Shake two phones at the same time and let the server do the awkward introduction._

Bump Mode listens to device motion and posts a bump intent when the accelerometer crosses the threshold. The API matches intents using server receive time within 2 seconds plus coarse place from IP and Vercel geo headers. If a match lands, both users see the same peer and confirm into the same durable session. If it misses, the intent expires after 8 seconds and falls back to an anonymous same-place candidate picker. Desktop has a simulate button, because hackathon demos happen on laptops whether anyone likes it or not.

**Shared sessions and album covers**  
_The bump opens a room, then everyone draws the cover._

Confirmed bumps create sessions with members, status, and a shared payload. Inside the session, each member gets their own pixel album cover editor with a 16 or 32 cell grid. Covers can be saved, marked ready, revealed, voted on, or resolved by a server-picked spin if people cannot decide. The session page also shows the active memory window and routes into the memory builder or locked receipt.

**Friends**  
_No discovery, no public search, just the code your friend gave you._

Every user gets an 8-character Crockford-style friend code. Paste a code to send a request to their inbox, where they can accept or reject it. Accepting creates a bidirectional friendship, and unfriend is supported. Friends also power event visibility and friend check-ins. A watchlist toggle can mute a friend's pins from the shared map without unfriending them.

**Calendar**  
_Plans stay close to the people who were invited, which is a mercy._

Calendar publishes events to friends and subscribes watchers so activity can show up in-app. Visibility includes your hosted events, events from friends, events you are subscribed to, and friend-of-a-friend events when one of your friends is going. Events support RSVP, comments, attendees, activity read state, and optional Blob-backed uploads. The event UI refreshes with light polling instead of WebSockets.

**Map, Explore, and Profile**  
_The supporting stuff, because people do ask where everyone is._

The map uses browser geolocation to let users drop check-ins with a region, optional caption, and optional upload. Friends' visible check-ins appear on the shared map, and each friend also has a narrow friend-only map route. Explore shows an anonymous 7-day regional tally of check-ins, friends added, and event joins with no login required. Profile lets users edit display name, bio, avatar, friend code copy, theme, and logout.

## Built with

The frontend is Vite, React 19, TypeScript, react-router v7, React Leaflet, and plain CSS with custom properties: no UI framework, just mobile-first screens tuned for a hackathon build. The API is Hono, deployed as a single Vercel serverless function through `api/index.ts` and a `vercel.json` rewrite, with Neon Postgres behind Drizzle ORM's HTTP driver and push-only migrations because speed mattered. Auth uses Neon Auth plus app-owned Google OAuth, email OTP, and a guest bootstrap fallback where display name is enough and the token is the user id, so you can try the app in about five seconds. Vercel Blob stores uploads for events, check-ins, avatars, album covers, and memories; Spotify Web API resolves track metadata and exports private playlists; realtime-ish behavior is polling, 500ms for bump matching, 2s for event activity, 1s for the open memory builder, and 1.5s for cover voting.

## Getting started

```bash
npm install
npm run build -w @summerhacks/shared
cp .env.example .env   # optional, leave DATABASE_URL empty for memory store
npm run dev
```

The web app runs on http://localhost:5173 and the API runs on http://localhost:8787. With no `DATABASE_URL`, the API uses an in-memory store, which is good for two browser tabs on one laptop. Set `DATABASE_URL` to a Neon pooled URL to persist data locally or to test the same path used on Vercel.

## Deploy your own

Summerhacks deploys as one Vercel project from the repo root. The static Vite app serves from `apps/web/dist`, and `/api/*` rewrites to the Hono handler in `api/index.ts`, so the browser can call same-origin `/api/...` without CORS or a separate backend URL.

```bash
npm install
npm run build -w @summerhacks/shared
npx vercel link
npm run deploy
```

For a real deployment, set up Neon before demoing on two phones. Without `DATABASE_URL` on Vercel, each serverless invocation can get its own in-memory store, which means two phones may never see each other's bump intents.

```bash
# Put your Neon pooled URL in local .env first.
npm run db:push -w @summerhacks/api

npx vercel env add DATABASE_URL preview
npx vercel env add DATABASE_URL production
npm run deploy:prod
```

The app can boot with guest auth and the memory store, but the real product needs env vars. Set the ones for the features you want:

- `DATABASE_URL`: Neon pooled Postgres URL, required for persistence and real two-device bumps.
- `DATABASE_URL_UNPOOLED`: optional Neon unpooled URL, useful if `db:push` has trouble through the pooler.
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token, required for event uploads, check-in uploads, avatars, album covers, and memories.
- `CRON_SECRET`: shared secret for the memory expiry sweeper and OAuth state.
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`: required for Spotify track lookup, connect, and playlist export.
- `NEON_AUTH_BASE_URL` and `VITE_NEON_AUTH_URL`: required for Neon Auth email flows.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: required for the Google sign-in button.

Spotify redirect URIs need to include `http://localhost:8787/api/spotify/callback` and `https://YOUR_VERCEL_URL/api/spotify/callback`. Google OAuth needs `https://YOUR_VERCEL_URL/api/oauth/google/callback`, or whatever `GOOGLE_REDIRECT_URI` points to. Vercel Cron is already declared in `vercel.json` at `/api/internal/sweep-memories`; on Hobby it runs daily, which is fine for a demo but not instant.

If a Preview deployment is behind Vercel Authentication, use Production for phone demos or disable Deployment Protection for that Preview URL.

After deploy, check the API:

```bash
curl https://YOUR_VERCEL_URL/api/health
# expect: {"ok":true,"store":"neon"}
```

The live project is deployed at https://summerhacks-ebon.vercel.app. The longer setup, including Neon Auth, Blob, Spotify, cron, and two-device smoke tests, is in [docs/deploy-vercel.md](docs/deploy-vercel.md).

### Deeper docs

- Bump  how the match works ([overview](docs/bump/overview.md), [matching rules](docs/bump/matching.md))
- Friends  code-based connections ([overview](docs/friends/overview.md))
- Calendar  friends-only events ([overview](docs/calendar/overview.md))
- Memories  the receipt keepsake ([overview](docs/memories/overview.md), [architecture](docs/memories/architecture.md))
- Deploy  Vercel + Neon + Blob ([guide](docs/deploy-vercel.md))
- Auth  Neon Auth setup ([guide](docs/auth-neon.md))

