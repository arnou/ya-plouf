import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { authenticateWith } from "../apps/api/service.ts";

test("authentifie une session active et retourne ses rôles", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `auth_${randomUUID().replaceAll("-", "")}`;
  await db.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  t.after(async () => {
    await pool.end();
    await db.query(`DROP SCHEMA ${schema} CASCADE`);
    await db.end();
  });
  await pool.query(await readFile(new URL("../migrations/001_safety_sheet.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("../migrations/002_user_roles.sql", import.meta.url), "utf8"));

  const userId = randomUUID();
  const activeToken = randomBytes(32).toString("base64url");
  const expiredToken = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO app_user (id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO app_user_role (user_id, role) VALUES ($1, 'dp'), ($1, 'responsible')", [userId]);
  await pool.query("INSERT INTO app_session VALUES ($1, $2, now() + interval '1 hour'), ($3, $2, now() - interval '1 second')", [
    createHash("sha256").update(activeToken).digest("hex"), userId,
    createHash("sha256").update(expiredToken).digest("hex"),
  ]);

  const authenticate = authenticateWith(pool);
  assert.deepEqual(await authenticate(activeToken), { id: userId, roles: ["dp", "responsible"] });
  assert.equal(await authenticate(expiredToken), null);
  assert.equal(await authenticate("not-a-session"), null);
});
