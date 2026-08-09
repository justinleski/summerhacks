# Profile — overview

Signed-in users manage display name, short bio, and a **16×16 pixel avatar** on `/profile` (no photo file upload). Save rasterizes to PNG → Vercel Blob → `PATCH avatarUrl`. Friend code includes Copy. Theme (dark/light) is local only.

## Related

- [API](api.md) · [Data model](data-model.md)
- Blob / deploy: [docs/deploy-vercel.md](../deploy-vercel.md)
