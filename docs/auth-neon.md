# Neon Auth (Google / Email)

App identity for Summerhacks uses **Neon Managed Better Auth**. Vercel Deployment Protection is unrelated. OTP emails are sent by **Neon Auth** (shared mail provider or your SMTP) — not by Vercel.

## What’s wired

| Layer | Behavior |
| --- | --- |
| Web | `@neondatabase/neon-js` → Google / email+password (+ OTP verify) + guest bootstrap; email sign-up and guest collect display name after auth |
| API | Verifies Neon Auth JWT (`jose` + JWKS), upserts `users.auth_user_id` (keeps existing `display_name` on sync) |
| Guest | Bootstrap then required display-name step (token = app user id) |

Auth is already enabled on this Neon project with **Google shared credentials**. The app UI does not expose GitHub sign-in.

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
4. **Email**: enable **Sign-up with Email** and **Sign-in with Email**. For OTP on register, enable **Verify at Sign-up** and set verification method to **Verification code** (works with Neon’s shared email provider; codes expire in ~15 minutes). Optional later: custom SMTP for production deliverability.

## Verify

```bash
curl -s "$NEON_AUTH_BASE_URL/.well-known/jwks.json"   # keys
# After Google / email sign-in:
SELECT id, email, name FROM neon_auth.user;
SELECT id, display_name, auth_user_id, email FROM users WHERE auth_user_id IS NOT NULL;
```

## Flows

### Social (Google)

1. User taps **Continue with Google**  
2. Neon Auth sets session cookie + returns a short-lived JWT in the `set-auth-jwt` response header (SDK copies it onto `session.token`)  
3. Web hydrates via `getSession()`, stores that JWT like a guest token, calls `POST /api/users/sync`, then shows the main home UI (uses Google/default display name)  
4. API verifies JWT → upserts app `users` row → bump/session use app `users.id`

### Email + password + OTP

1. User taps **Continue with email** → email/password (sign-in or sign-up) on a separate step  
2. **Sign up**: email, password, confirm → `signUp.email`; if needed, OTP verify via `emailOtp.verifyEmail`  
3. After sign-up / verify, user sets a display name (`PATCH /users/me`), then enters the main app  
4. **Sign in**: email + password → `signIn.email` → hydrate → main app (skips name step)  

Resend uses `emailOtp.sendVerificationOtp` (type `email-verification`).

### SPA JWT pitfall

`get-session` may return a full session body while the usable API JWT is only in **`set-auth-jwt`**. Always read `session.token` after the Neon client injects that header — do not expect `access_token` on the session object. If hydrate ignores the JWT, the user lands back on the login screen with no error.
