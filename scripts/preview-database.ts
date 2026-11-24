import { fileURLToPath } from "node:url";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

export function schemaForPullRequest(pullRequest: string): string {
  if (!/^\d+$/.test(pullRequest)) throw new Error("Le numéro de PR est requis.");
  return `preview_pr_${pullRequest}`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function provisionPreview(
  client: pg.PoolClient,
  pullRequest: string,
  migrationDirectory = new URL("../migrations/", import.meta.url),
): Promise<string> {
  const schema = schemaForPullRequest(pullRequest);
  const quotedSchema = quoteIdentifier(schema);
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ya-plouf:preview:${schema}`]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
    await client.query(`SET LOCAL search_path TO ${quotedSchema}, public`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const files = (await readdir(migrationDirectory)).filter(filename => filename.endsWith(".sql")).sort();
    for (const filename of files) {
      const { rowCount } = await client.query(
        "INSERT INTO schema_migration (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
        [filename],
      );
      if (rowCount) await client.query(await readFile(new URL(filename, migrationDirectory), "utf8"));
    }
    await client.query("COMMIT");
    return schema;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function cleanupPreview(client: pg.PoolClient, pullRequest: string): Promise<string> {
  const schema = schemaForPullRequest(pullRequest);
  await client.query("BEGIN");
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await client.query("COMMIT");
    return schema;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const [command, pullRequest] = process.argv.slice(2);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL est requis.");
  if (!pullRequest) throw new Error("Le numéro de PR est requis.");

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const schema = command === "provision"
      ? await provisionPreview(client, pullRequest)
      : command === "cleanup"
        ? await cleanupPreview(client, pullRequest)
        : (() => { throw new Error("Commande attendue : provision ou cleanup."); })();
    console.log(command === "provision" ? `Schéma Supabase ${schema} provisionné.` : `Schéma Supabase ${schema} supprimé.`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
