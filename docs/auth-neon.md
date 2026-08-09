# Neon Auth (Google / GitHub / Email)

App identity for Summerhacks uses **Neon Managed Better Auth**. Vercel Deployment Protection is unrelated. OTP emails are sent by **Neon Auth** (shared mail provider or your SMTP) — not by Vercel.

## What’s wired

| Layer | Behavior |
| --- | --- |
| Web | `@neondatabase/neon-js` → Google / GitHub / email+password (+ OTP verify) + guest bootstrap |
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
5. **Email**: enable **Sign-up with Email** and **Sign-in with Email**. For OTP on register, enable **Verify at Sign-up** and set verification method to **Verification code** (works with Neon’s shared email provider; codes expire in ~15 minutes). Optional later: custom SMTP for production deliverability.

## Verify

```bash
curl -s "$NEON_AUTH_BASE_URL/.well-known/jwks.json"   # keys
# After Google / email sign-in:
SELECT id, email, name FROM neon_auth.user;
SELECT id, display_name, auth_user_id, email FROM users WHERE auth_user_id IS NOT NULL;
```

## Flows

### Social (Google / GitHub)

1. User taps **Continue with Google** (or GitHub)  
2. Neon Auth sets session cookie + returns a short-lived JWT in the `set-auth-jwt` response header (SDK copies it onto `session.token`)  
3. Web hydrates via `getSession()`, stores that JWT like a guest token, calls `POST /api/users/sync`, then shows the same home UI (Bump / Friends / Calendar / Profile)  
4. API verifies JWT → upserts app `users` row → bump/session use app `users.id`

### Email + password + OTP

1. **Sign up**: display name, email, password, confirm password → `signUp.email`  
2. If `emailVerified === false`, show code form (Neon emails an OTP via shared/custom mail)  
3. User enters code → `emailOtp.verifyEmail` → same hydrate / sync / home as social  
4. **Sign in**: email + password → `signIn.email` → hydrate  

Resend uses `emailOtp.sendVerificationOtp` (type `email-verification`).

### SPA JWT pitfall

`get-session` may return a full session body while the usable API JWT is only in **`set-auth-jwt`**. Always read `session.token` after the Neon client injects that header — do not expect `access_token` on the session object. If hydrate ignores the JWT, the user lands back on the login screen with no error.
