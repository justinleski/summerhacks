import { handle } from "hono/vercel";
import app from "../apps/api/src/app";

/**
 * Catch-all serverless entry so /api, /api/health, /api/bumps, etc. all hit Hono.
 * Frontend calls same-origin `/api/...` (see apps/web/src/lib/api.ts).
 */
export default handle(app);
