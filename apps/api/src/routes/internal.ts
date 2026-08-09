import { del } from "@vercel/blob";
import { Hono } from "hono";
import { getStore } from "../db/index.js";

export const internalRoutes = new Hono();

/**
 * Vercel Cron only pings the URL, so there is no `requireAuth` user here.
 * Accepted callers:
 *  - Vercel Cron: sends `x-vercel-cron` and, when CRON_SECRET is set on the
 *    project, `Authorization: Bearer <CRON_SECRET>`
 *  - Manual/curl: `x-cron-secret: <CRON_SECRET>`
 */
function cronAuthorized(c: {
  req: { header: (name: string) => string | undefined };
}): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    if (c.req.header("x-cron-secret") === secret) return true;
    if (c.req.header("authorization") === `Bearer ${secret}`) return true;
  }
  return c.req.header("x-vercel-cron") !== undefined;
}

async function sweepMemories(c: {
  req: { header: (name: string) => string | undefined };
  json: (body: unknown, status?: number) => Response;
}) {
  if (!cronAuthorized(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const expired = await getStore().expireStaleMemories();
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  let deletedPhotos = 0;
  if (token) {
    for (const memory of expired) {
      if (memory.photoUrls.length === 0) continue;
      // Awaited rather than detached: a serverless function can freeze right
      // after responding, which would silently skip the cleanup.
      try {
        await del(memory.photoUrls, { token });
        deletedPhotos += memory.photoUrls.length;
      } catch (err) {
        console.warn("Blob cleanup failed for memory", memory.memoryId, err);
      }
    }
  }

  return c.json({ expired: expired.length, deletedPhotos });
}

// Vercel Cron invokes with GET; POST is for manual runs with the secret header.
internalRoutes.get("/sweep-memories", sweepMemories);
internalRoutes.post("/sweep-memories", sweepMemories);
