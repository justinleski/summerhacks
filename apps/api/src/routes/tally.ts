import { Hono } from "hono";
import { TALLY_WINDOW_DAYS, type TallyResponse } from "@summerhacks/shared";
import { getStore } from "../db/index.js";

/** Public — no requireAuth, same exemption as /health in app.ts. */
export const tallyRoutes = new Hono();

tallyRoutes.get("/", async (c) => {
  const regions = await getStore().getTally();
  const body: TallyResponse = { windowDays: TALLY_WINDOW_DAYS, regions };
  return c.json(body);
});
