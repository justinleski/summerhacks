import { BlobError, put } from "@vercel/blob";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

async function uploadImage(
  c: {
    req: { parseBody: () => Promise<Record<string, unknown>> };
    json: (body: unknown, status?: number) => Response;
    get: (key: "userId") => string;
  },
  folder: "events" | "avatars" | "checkins" | "event-photos",
  missingTokenMessage: string,
) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return c.json({ error: missingTokenMessage }, 503);
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || !(file instanceof File)) {
    return c.json({ error: "Expected multipart field 'file'" }, 400);
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return c.json(
      { error: "Only JPEG, PNG, WebP, or GIF images are allowed" },
      400,
    );
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: "Image must be 4MB or smaller" }, 400);
  }

  const pathname = `${folder}/${c.get("userId")}/${Date.now()}.${extForType(file.type)}`;
  try {
    const blob = await put(pathname, file, {
      access: "public",
      token,
      contentType: file.type,
    });
    return c.json({ url: blob.url }, 201);
  } catch (err) {
    if (err instanceof BlobError) {
      const hint = err.message.includes("private store")
        ? " Switch the store to Public access in the Vercel dashboard (Storage → your Blob store → Settings)."
        : "";
      return c.json({ error: `${err.message}${hint}` }, 502);
    }
    throw err;
  }
}

export const uploadsRoutes = new Hono<{ Variables: AuthVariables }>();

uploadsRoutes.use("*", requireAuth);

uploadsRoutes.post("/event-image", async (c) =>
  uploadImage(
    c,
    "events",
    "Image uploads are not configured (BLOB_READ_WRITE_TOKEN unset). Create the event without an image, or set the token.",
  ),
);

uploadsRoutes.post("/avatar", async (c) =>
  uploadImage(
    c,
    "avatars",
    "Avatar uploads are not configured (BLOB_READ_WRITE_TOKEN unset). You can still save bio and display name.",
  ),
);

uploadsRoutes.post("/checkin-photo", async (c) =>
  uploadImage(
    c,
    "checkins",
    "Image uploads are not configured (BLOB_READ_WRITE_TOKEN unset). Check in without a photo, or set the token.",
  ),
);

uploadsRoutes.post("/event-photo", async (c) =>
  uploadImage(
    c,
    "event-photos",
    "Image uploads are not configured (BLOB_READ_WRITE_TOKEN unset). Set the token to add event photos.",
  ),
);
