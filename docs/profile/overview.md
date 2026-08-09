# Profile — overview

Signed-in users manage display name, short bio, and profile photo on `/profile`. Avatar uploads use the same Vercel Blob token as event images. Users can also draw a low-fidelity **16×16 pixel avatar** in a full-screen editor; Save rasterizes to PNG and follows the same upload → `PATCH avatarUrl` path. Friend code on Profile includes a Copy control. Theme (dark/light) is a local preference only.

## Related

- [API](api.md) · [Data model](data-model.md)
- Blob / deploy: [docs/deploy-vercel.md](../deploy-vercel.md)
