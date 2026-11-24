import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL est requis.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const userId = randomUUID();
const outingId = randomUUID();
const memberId = randomUUID();
const token = randomBytes(32).toString("base64url");

try {
  await client.query("BEGIN");
  if (process.env.PREVIEW_SCHEMA) {
    if (!/^preview_pr_\d+$/.test(process.env.PREVIEW_SCHEMA)) throw new Error("PREVIEW_SCHEMA invalide.");
    await client.query(`SET LOCAL search_path TO "${process.env.PREVIEW_SCHEMA}", public`);
  }
  const { rows: [existingUser] } = await client.query<{ id: string }>("SELECT id FROM app_user LIMIT 1");
  if (existingUser) {
    await client.query("INSERT INTO app_session VALUES ($1, $2, now() + interval '8 hours')", [
      createHash("sha256").update(token).digest("hex"), existingUser.id,
    ]);
    const { rows: [existingOuting] } = await client.query<{ id: string }>("SELECT id FROM outing ORDER BY starts_on, id LIMIT 1");
    await client.query("COMMIT");
    console.log("Données fictives déjà présentes.");
    if (existingOuting) console.log("Sortie fictive", existingOuting.id);
    console.log("Nouveau jeton DP valable 8 h", token);
  } else {
    await client.query("INSERT INTO app_user (id) VALUES ($1)", [userId]);
    await client.query("INSERT INTO app_session VALUES ($1, $2, now() + interval '8 hours')", [
      createHash("sha256").update(token).digest("hex"), userId,
    ]);
    await client.query("INSERT INTO member VALUES ($1, 'Camille', 'Exemple', 'N2', '{}', NULL)", [memberId]);
    await client.query("INSERT INTO outing (id, director_id, status, starts_on) VALUES ($1, $2, 'published', current_date + 7)", [outingId, userId]);
    await client.query("INSERT INTO outing_registration VALUES ($1, $2, $3, 'confirmed')", [randomUUID(), outingId, memberId]);
    await client.query("COMMIT");
    console.log("Sortie fictive", outingId);
    console.log("Jeton DP valable 8 h", token);
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
