import { handle } from "hono/vercel";

/**
 * Single `/api` function. Nested paths are rewritten here via vercel.json.
 * Use named HTTP method exports (Web handler API) — default export returning
 * Response is ignored by Vercel’s Node (req, res) signature.
 */
const { default: app } = await import("../apps/api/src/app.js");
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
