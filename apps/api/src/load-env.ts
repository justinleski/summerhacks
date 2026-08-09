import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

/** Local dev only — loads the monorepo-root .env before anything reads process.env. */
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });
