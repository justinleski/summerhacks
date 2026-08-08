import { handle } from "hono/vercel";
import app from "../apps/api/src/app";

export default handle(app);
