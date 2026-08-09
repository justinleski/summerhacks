import type { Context } from "hono";

export function httpErrorFromStore(c: Context, err: unknown) {
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status: number }).status)
      : 500;
  const message = err instanceof Error ? err.message : "Internal server error";
  if (status >= 400 && status < 600) {
    return c.json(
      { error: message },
      status as 400 | 404 | 409 | 410 | 500,
    );
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
}
