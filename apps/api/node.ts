import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import pg from "pg";
import { createApi } from "./http.ts";
import { authenticateWith, createSafetyService, nodeDigest } from "./service.ts";

const { DATABASE_URL, SAFETY_SIGNING_KEY } = process.env;
if (!DATABASE_URL || !SAFETY_SIGNING_KEY || SAFETY_SIGNING_KEY.length < 32) {
  throw new Error("DATABASE_URL et SAFETY_SIGNING_KEY (32 caractères minimum) sont requis.");
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const service = createSafetyService(pool, nodeDigest(SAFETY_SIGNING_KEY));

const api = createApi(service, authenticateWith(pool));

api.get("/", serveStatic({ path: "./apps/web/dist/index.html" }));
api.get("/assets/*", serveStatic({ root: "./apps/web/dist" }));

serve({
  fetch: api.fetch,
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
});
