# Profile — data model

## `users`

| Column | Notes |
| --- | --- |
| `bio` | nullable text, max 280 at API |
| `avatar_url` | nullable; set from blob URL (photo upload or pixel-editor PNG) |

Theme preference is **not** stored in the DB — see `localStorage` key `summerhacks.theme` and `html[data-theme]`.
