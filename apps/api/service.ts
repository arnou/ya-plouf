import { createHash, createHmac } from "node:crypto";
import type { Pool } from "pg";
import { safetySheets } from "../../packages/application/safety-sheets.ts";
import { postgresSafetyStore } from "../../packages/persistence-postgres/safety-store.ts";

export type Digest = (data: unknown) => Promise<string>;

export function nodeDigest(signingKey: string): Digest {
  return async data => createHmac("sha256", signingKey).update(JSON.stringify(data)).digest("hex");
}

export function createSafetyService(pool: Pool, digest: Digest) {
  return safetySheets({
    store: postgresSafetyStore(pool),
    now: () => new Date().toISOString(),
    id: () => crypto.randomUUID(),
    digest,
  });
}

export function authenticateWith(pool: Pool) {
  return async (token: string) => {
    const digest = createHash("sha256").update(token).digest("hex");
    const { rows: [session] } = await pool.query<{ user_id: string }>(
      "SELECT user_id FROM app_session WHERE token_digest = $1 AND expires_at > now()", [digest],
    );
    return session?.user_id ?? null;
  };
}
