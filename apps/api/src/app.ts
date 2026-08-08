import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { bumpsRoutes } from "./routes/bumps.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { usersRoutes } from "./routes/users.js";

const app = new Hono().basePath("/api");

app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Token"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    store: process.env.DATABASE_URL ? "neon" : "memory",
  }),
);

app.route("/users", usersRoutes);
app.route("/bumps", bumpsRoutes);
app.route("/sessions", sessionsRoutes);

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: "Validation failed", details: err.flatten() }, 400);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
export type AppType = typeof app;
