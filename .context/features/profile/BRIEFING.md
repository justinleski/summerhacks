# Profile — agent briefing

`/profile`: edit **display name**, **bio** (≤280), **avatar** (Vercel Blob photo upload or 16×16 pixel editor → PNG), **friend code Copy**, **logout**, **dark/light toggle**.

## API

- `GET /api/users/me` → id, displayName, avatarUrl, bio, email?, friendCode?, createdAt
- `PATCH /api/users/me` `{ displayName?, bio?, avatarUrl? }` (at least one)
- `POST /api/uploads/avatar` multipart `file` → `{ url }` (needs `BLOB_READ_WRITE_TOKEN`)

## Pixel avatar

Client-only editor (`PixelAvatarEditor`): full-screen overlay, paint/erase, erase-canvas, cancel/save. Save → canvas PNG → `uploadAvatar` → `PATCH avatarUrl`. Overwrites photo avatar the same way.

## Theme

Client-only: `localStorage.summerhacks.theme` = `dark` \| `light`; `document.documentElement.dataset.theme`. Default dark (existing look). Light theme overrides CSS variables.

## Logout

`clearAuth()` + `authClient.signOut()` when Neon Auth enabled → navigate home.

## Non-goals

Public profiles for others; persisting theme on the server.
