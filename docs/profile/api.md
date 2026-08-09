# Profile — API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/users/me` | Includes `bio`, `friendCode`, `avatarUrl` |
| PATCH | `/api/users/me` | `{ displayName?, bio?, avatarUrl? }` — at least one field |
| POST | `/api/uploads/avatar` | multipart `file`; JPEG/PNG/WebP/GIF ≤4MB; 503 without `BLOB_READ_WRITE_TOKEN` |

Auth required. After upload, client `PATCH`es `avatarUrl` with the returned URL.
