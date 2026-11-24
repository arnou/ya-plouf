import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { SafetyError } from "../../packages/application/safety-sheets.ts";
import type { safetySheets } from "../../packages/application/safety-sheets.ts";
import type { AuthenticatedActor } from "./service.ts";
import { mutationSchema, uuid } from "../../packages/contracts/safety-sheet.ts";

type Auth = (token: string) => Promise<AuthenticatedActor | null>;

export function createApi(service: ReturnType<typeof safetySheets>, authenticate: Auth, webOrigin?: string) {
  const api = new Hono<{ Variables: { actorId: string } }>();
  const root = "/api/sorties/:outingId/feuille-securite";

  api.get("/api/health", c => c.json({ status: "ok" }));
  if (webOrigin) {
    api.use("/api/*", cors({
      origin: webOrigin,
      allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }));
  }
  api.use("/api/sorties/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const authorization = c.req.header("Authorization");
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    const actor = token ? await authenticate(token) : null;
    if (!actor) return c.json({ error: "unauthenticated" }, 401);
    if (!actor.roles.includes("dp") && !actor.roles.includes("admin")) {
      return c.json({ error: "forbidden" }, 403);
    }
    c.set("actorId", actor.id);
    return next();
  });

  api.get(root, async c => {
    const outingId = uuid.safeParse(c.req.param("outingId"));
    if (!outingId.success) return c.json({ error: "invalid_request" }, 400);
    return c.json(await service.view(outingId.data, c.get("actorId")));
  });

  api.get(`${root}/adherents`, async c => {
    const outingId = uuid.safeParse(c.req.param("outingId"));
    const name = c.req.query("nom")?.trim();
    if (!outingId.success || !name || name.length < 2 || name.length > 100) {
      return c.json({ error: "invalid_request" }, 400);
    }
    return c.json(await service.search(outingId.data, c.get("actorId"), name));
  });

  api.post(root, bodyLimit({ maxSize: 16_384, onError: c => c.json({ error: "invalid_request" }, 413) }), async c => {
    const outingId = uuid.safeParse(c.req.param("outingId"));
    const key = uuid.safeParse(c.req.header("Idempotency-Key"));
    if (!outingId.success || !key.success) return c.json({ error: "invalid_request" }, 400);
    const command = mutationSchema.safeParse(await c.req.json().catch(() => null));
    if (!command.success) return c.json({ error: "invalid_request" }, 400);
    const { action, token } = command.data;
    return c.json(await service.mutate(outingId.data, c.get("actorId"), key.data, token, action), action.kind === "initialize" ? 201 : 200);
  });

  api.onError((error, c) => {
    if (error instanceof SafetyError) {
      const status = error.code === "not_found" ? 404
        : error.code === "forbidden" ? 403 : error.code === "locked" ? 423 : 409;
      return c.json({ error: error.code }, status);
    }
    console.error("Échec interne de l’API");
    return c.json({ error: "internal_error" }, 500);
  });

  return api;
}
