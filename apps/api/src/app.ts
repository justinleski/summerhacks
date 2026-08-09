import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { activityRoutes } from "./routes/activity.js";
import { bumpsRoutes } from "./routes/bumps.js";
import { calendarRoutes } from "./routes/calendar.js";
import { eventsRoutes } from "./routes/events.js";
import { friendsRoutes } from "./routes/friends.js";
import { internalRoutes } from "./routes/internal.js";
import { memoriesRoutes } from "./routes/memories.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { spotifyRoutes } from "./routes/spotify.js";
import { uploadsRoutes } from "./routes/uploads.js";
import { usersRoutes } from "./routes/users.js";

const app = new Hono().basePath("/api");

app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Token"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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
app.route("/friends", friendsRoutes);
app.route("/calendar", calendarRoutes);
app.route("/events", eventsRoutes);
app.route("/activity", activityRoutes);
app.route("/uploads", uploadsRoutes);
app.route("/memories", memoriesRoutes);
app.route("/spotify", spotifyRoutes);
app.route("/internal", internalRoutes);

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
