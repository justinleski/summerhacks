# Album — overview

Each bump session member draws **their own** pixel cover. When everyone is ready (or the edit window ends), covers reveal for voting. Agreement wins; contested or no selection spins like a case opening.

| Phase | What happens |
| --- | --- |
| Editing | Draw your cover; autosave to Neon; mark ready to lock |
| Voting | See both covers; vote, abstain, or spin |
| Resolved | Winner by unanimous vote or random spin |

Pixels live in **Postgres**. No websockets — the session page polls contest state.

Bump is still the proximity gate (who shares the session).
