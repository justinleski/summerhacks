import "./load-env.js";
import { serve } from "@hono/node-server";
import app from "./app.js";

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`[api] listening on http://${info.address}:${info.port}`);
});
