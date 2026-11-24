import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { cleanupPreview, provisionPreview, schemaForPullRequest } from "../scripts/preview-database.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("le provisionnement d’une preview est idempotent et isolé par PR", { skip: !databaseUrl }, async t => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const firstPr = String(Date.now());
  const secondPr = String(Number(firstPr) + 1);
  const client = await pool.connect();
  try {
    await t.test("deux provisions successifs conservent les tables existantes", async () => {
      await provisionPreview(client, firstPr);
      await client.query(`DROP TABLE "${schemaForPullRequest(firstPr)}".schema_migration`);
      await provisionPreview(client, firstPr);
      await provisionPreview(client, firstPr);
      const { rows } = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'app_user'`,
        [schemaForPullRequest(firstPr)],
      );
      assert.equal(rows.length, 1);
    });
    await t.test("une autre PR utilise un schéma distinct", async () => {
      await provisionPreview(client, secondPr);
      const { rows } = await client.query<{ table_schema: string }>(
        `SELECT table_schema FROM information_schema.tables WHERE table_name = 'app_user' AND table_schema IN ($1, $2) ORDER BY table_schema`,
        [schemaForPullRequest(firstPr), schemaForPullRequest(secondPr)],
      );
      assert.deepEqual(rows.map(row => row.table_schema), [schemaForPullRequest(firstPr), schemaForPullRequest(secondPr)].sort());
    });
  } finally {
    await cleanupPreview(client, firstPr);
    await cleanupPreview(client, secondPr);
    client.release();
    await pool.end();
  }
});
