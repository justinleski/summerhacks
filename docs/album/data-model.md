# Album — data model

## `albums`

One row per session member.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| session_id | uuid FK | |
| user_id | uuid FK | unique with `session_id` |
| title | text nullable | unused in v1 UI |
| grid_size | int | `16` \| `32` (default 16) |
| pixels | jsonb | `(string\|null)[]` length `grid_size²` |
| cover_url | text nullable | Blob PNG |
| editable_until | timestamptz | `session.created_at + window` |
| ready_at | timestamptz nullable | set when member marks ready |
| created_at / updated_at | timestamptz | |

**Source of truth for editing = `pixels`.** `cover_url` is a display export.

## `album_votes`

| Column | Type | Notes |
| --- | --- | --- |
| session_id + voter_user_id | PK | |
| choice_user_id | uuid nullable | null = abstain |

## `album_contests`

| Column | Type | Notes |
| --- | --- | --- |
| session_id | PK | |
| winner_user_id | uuid nullable | |
| method | text | `vote` \| `spin` |
| resolved_at | timestamptz | |

## Future: `album_items` (not implemented)

Suggested shape for photos/pages later: `album_id`, `kind`, `url`, `created_by`, `created_at`.
