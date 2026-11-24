import pg from "pg";
import { createApi } from "./http.ts";
import { authenticateWith, createSafetyService } from "./service.ts";

type Hyperdrive = { connectionString: string };
type Env = { HYPERDRIVE: Hyperdrive; SAFETY_SIGNING_KEY: string; PREVIEW_SCHEMA: string; WEB_ORIGIN: string };

async function digest(signingKey: string, data: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoded);
  return [...new Uint8Array(signature)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.SAFETY_SIGNING_KEY || env.SAFETY_SIGNING_KEY.length < 32) {
      return new Response("SAFETY_SIGNING_KEY is not configured", { status: 500 });
    }
    if (!/^preview_pr_\d+$/.test(env.PREVIEW_SCHEMA)) {
      return new Response("PREVIEW_SCHEMA is not configured", { status: 500 });
    }
    const connection = new URL(env.HYPERDRIVE.connectionString);
    connection.searchParams.set("options", `-c search_path=\"${env.PREVIEW_SCHEMA}\",public`);
    const pool = new pg.Pool({ connectionString: connection.toString(), max: 2 });
    const service = createSafetyService(pool, data => digest(env.SAFETY_SIGNING_KEY, data));
    const api = createApi(service, authenticateWith(pool), env.WEB_ORIGIN);
    return api.fetch(request, env);
  },
};
