import { createHash, createHmac } from "node:crypto";
import type { Pool } from "pg";
import { safetySheets } from "../../packages/application/safety-sheets.ts";
import { postgresSafetyStore } from "../../packages/persistence-postgres/safety-store.ts";

export type Digest = (data: unknown) => Promise<string>;
export type Role = "admin" | "responsible" | "dp" | "member";
export type AuthenticatedActor = { id: string; roles: Role[] };

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
    const { rows: [session] } = await pool.query<{ user_id: string; roles: Role[] }>(
      `SELECT s.user_id, COALESCE(array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM app_session s
       LEFT JOIN app_user_role ur ON ur.user_id = s.user_id
       WHERE s.token_digest = $1 AND s.expires_at > now()
       GROUP BY s.user_id`, [digest],
    );
    return session ? { id: session.user_id, roles: session.roles } : null;
  };
}
