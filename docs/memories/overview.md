# Memories — overview

Every **bump session** opens a 24-hour window where all members collaboratively build one shared memory of that hangout. When the last member submits, the memory **locks** and turns into three artifacts: a Receiptify-style **receipt**, a set of **photobooth strips**, and a per-member **Spotify playlist**.

Bump-only. Calendar events never get a memory. Sessions created before this feature shipped have no memory row and render the old session view unchanged.

## Flow

1. Two phones bump → session created → **memory row created in the same call** (status `open`, window = `sessions.created_at` + 24h)
2. `/session/:id` shows "Memory of this hangout — {countdown} left" → **Add photos + songs**
3. `/memories/session/:sessionId` — each member adds **exactly 3 songs** (paste a Spotify track link) and **photos in pairs** (2, 4, 6, or 8), plus an optional **shared note** (≤140 chars)
4. Members only ever see **their own** photos and songs before lock. The note is shared, so it is visible to everyone. BeReal-style reveal.
5. **Submit** locks that member permanently — no unlock, no edits
6. The **last** submit locks the whole memory instantly → redirect to `/memories/:id`
7. `/memories` lists every locked memory, newest hangout first

## Lock and expiry

| Condition | Result |
| --- | --- |
| Last member submits | Locks instantly, `locked_at = now()` |
| Window expires, everyone submitted | Locks (boundary edge case, handled by the sweeper) |
| Window expires, **anyone** missing | `expired` — invisible to everyone, Blob photos deleted best-effort |

Expiry is server-authoritative and driven by a cron sweeper every 15 minutes, so it does not depend on anyone opening the app.

## N members

`session_members` supports N and all memory code loops over it — submissions, reveal, interleave, receipt and playlist titles are all N-generic. In practice N is always 2 until bump gains N-way matching. There are no hardcoded pair checks.

## Privacy

Strictly private to the session members. Every route re-checks `session_members` and answers 403 to anyone else. No public links, no feed, no share URLs. The permalink printed on the receipt still requires being a member.

## Without Spotify credentials

Memories still work end to end — receipts and strips render, the window still locks. Only two things degrade: pasting a track link returns 503 (metadata needs the Web API), and playlist export is unavailable.

## Related

- [API](api.md) · [Data model](data-model.md) · [Architecture](architecture.md)
- Bump session it hangs off: [docs/bump/overview.md](../bump/overview.md)
- Env vars + cron: [docs/deploy-vercel.md](../deploy-vercel.md)
