# Neon Auth (Google / GitHub)

App identity for Summerhacks uses **Neon Managed Better Auth**. Vercel Deployment Protection is unrelated.

## What’s wired

| Layer | Behavior |
| --- | --- |
| Web | `@neondatabase/neon-js` → Google / GitHub buttons + guest bootstrap |
| API | Verifies Neon Auth JWT (`jose` + JWKS), upserts `users.auth_user_id` |
| Guest | Display-name bootstrap still works (token = app user id) |

Auth is already enabled on this Neon project with **Google shared credentials**. GitHub needs your own OAuth app in the Neon Console.

## Env

```bash
# Same Auth Base URL from Neon Console → Branch → Auth → Configuration
VITE_NEON_AUTH_URL=https://ep-xxx.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth
NEON_AUTH_BASE_URL=https://ep-xxx.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth
```

Put both in root `.env` (Vite `envDir` is the monorepo root). On Vercel, set:

- `NEON_AUTH_BASE_URL` — Preview + Production (server)
- `VITE_NEON_AUTH_URL` — Preview + Production (build-time for the SPA)

Redeploy after adding env vars.

## Console checklist

1. Neon → project → branch → **Auth** → enabled  
2. **Domains / trusted origins**: add `http://localhost:5173` (localhost may already be allowed) and `https://summerhacks-ebon.vercel.app`  
3. **Google**: shared credentials work for testing; for production add your Google OAuth Client ID/Secret and register redirect  
   `{NEON_AUTH_BASE_URL}/callback/google`  
4. **GitHub**: create a GitHub OAuth App with callback  
   `{NEON_AUTH_BASE_URL}/callback/github`  
   paste Client ID/Secret into Neon Auth → social providers  

## Verify

```bash
curl -s "$NEON_AUTH_BASE_URL/.well-known/jwks.json"   # keys
# After Google sign-in:
SELECT id, email, name FROM neon_auth.user;
SELECT id, display_name, auth_user_id, email FROM users WHERE auth_user_id IS NOT NULL;
```

## Flow

1. User taps **Continue with Google** (or GitHub)  
2. Neon Auth sets session cookie + issues short-lived JWT  
3. Web sends `Authorization: Bearer <jwt>` to `/api/*`  
4. API verifies JWT → upserts app `users` row → bump/session use app `users.id`
