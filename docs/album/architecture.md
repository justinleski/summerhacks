# Album — architecture

```mermaid
flowchart LR
  subgraph clients [Clients]
    A[UserA]
    B[UserB]
  end
  subgraph vercel [Vercel]
    Web[ViteSPA]
    Api[HonoAPI]
    Blob[VercelBlob]
  end
  Neon[(NeonPostgres)]

  A --> Web
  B --> Web
  Web --> Api
  Api --> Neon
  Api --> Blob
```

| Piece | Role |
| --- | --- |
| Neon `albums` | Per-member durable pixels / cover URL |
| Neon `album_votes` / `album_contests` | Votes + winner |
| Blob `cover_url` | Rendered PNG preview |
| Hono `/sessions/:id/album*` | Membership, edit, ready, vote, resolve |
| Client poll | Peer ready / contest state (no WS) |

## Lifecycle

```mermaid
stateDiagram-v2
  [*] --> Editing
  Editing --> Voting: all ready or edit window ends
  Voting --> ResolvedVote: unanimous choice
  Voting --> Spin: contested / abstain / force
  Spin --> ResolvedSpin: animation lands on server winner
```
