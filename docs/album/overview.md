# Album — overview

Each bump session gets one **album**:

- **Cover** — each member draws a pixel cover; when everyone is ready (or the edit window ends), covers reveal for voting. Agreement wins; contested or no selection spins like a case opening.
- **Interior** — shared Spotify songs + photos + note that become a **receipt** after the same 24h window. See [memories/overview.md](../memories/overview.md).

| Phase | What happens |
| --- | --- |
| Editing | Draw cover; add photos/songs; autosave; optional ready / mark done |
| Voting | See both covers; vote, abstain, or spin |
| Resolved / locked | Winner cover; receipt + photobooth when interior locks at window end |

Cover pixels live in **Postgres**. Interior photos are Blob URLs. No websockets — the session page polls contest state; build page polls the memory.

Bump is still the proximity gate (who shares the session).
