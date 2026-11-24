import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { createApi } from "../apps/api/http.ts";
import { safetySheets } from "../packages/application/safety-sheets.ts";
import type { Action, SafetyView } from "../packages/application/safety-sheets.ts";
import { postgresSafetyStore } from "../packages/persistence-postgres/safety-store.ts";

test("parcours #13 via HTTP et PostgreSQL", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `safety_${randomUUID().replaceAll("-", "")}`;
  await db.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  t.after(async () => {
    await pool.end();
    await db.query(`DROP SCHEMA ${schema} CASCADE`);
    await db.end();
  });
  await pool.query(await readFile(new URL("../migrations/001_safety_sheet.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("../migrations/002_user_roles.sql", import.meta.url), "utf8"));

  const [director, other, outing, emptyOuting, draftOuting, member, waitlisted, cancelled, late, manual, registration, lateRegistration]
    = Array.from({ length: 12 }, randomUUID);
  const directorToken = "d".repeat(43);
  const otherToken = "o".repeat(43);
  await pool.query("INSERT INTO app_user VALUES ($1), ($2)", [director, other]);
  await pool.query("INSERT INTO app_user_role (user_id, role) VALUES ($1, 'dp'), ($2, 'member')", [director, other]);
  await pool.query(`INSERT INTO outing VALUES
    ($1, $4, 'published', '2030-06-01'),
    ($2, $4, 'published', '2030-06-01'),
    ($3, $4, 'draft', '2030-06-01')`, [outing, emptyOuting, draftOuting, director]);
  await pool.query(`INSERT INTO member (id, first_name, last_name, held_level) VALUES
    ($1, 'Camille', 'Exemple', 'N2'), ($2, 'Attente', 'Exemple', 'N1'),
    ($3, 'Annulé', 'Exemple', 'N3'), ($4, 'Tardif', 'Exemple', 'N2'), ($5, 'Manuel', 'Exemple', 'N1')`,
  [member, waitlisted, cancelled, late, manual]);
  await pool.query(`INSERT INTO outing_registration VALUES
    ($1, $2, $3, 'confirmed'), ($4, $2, $5, 'waitlisted'), ($6, $2, $7, 'cancelled'),
    ($8, $9, $3, 'confirmed')`,
  [registration, outing, member, randomUUID(), waitlisted, randomUUID(), cancelled, randomUUID(), draftOuting]);

  const service = safetySheets({
    store: postgresSafetyStore(pool),
    now: () => "2030-05-01T10:30:10.000Z",
    id: randomUUID,
    digest: async data => createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  });
  const api = createApi(service, async token => token === directorToken
    ? { id: director, roles: ["dp"] }
    : token === otherToken ? { id: other, roles: ["member"] } : null);
  const path = (id: string) => `/api/sorties/${id}/feuille-securite`;
  const get = (id = outing, token = directorToken) => api.request(path(id), { headers: { Authorization: `Bearer ${token}` } });
  async function view(id = outing) {
    const response = await get(id);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    return response.json() as Promise<SafetyView>;
  }
  function send(token: string, action: Action, key = randomUUID(), id = outing, auth = directorToken) {
    return api.request(path(id), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key, Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token, action }),
    });
  }
  async function apply(action: Action) {
    return send((await view()).token, action);
  }

  assert.equal((await get(outing, otherToken)).status, 403);
  assert.equal((await api.request(path(outing))).status, 401);
  const empty = await view(emptyOuting);
  assert.equal(empty.confirmed.length, 0);
  assert.equal((await send(empty.token, { kind: "initialize" }, randomUUID(), emptyOuting)).status, 409);
  const draft = await view(draftOuting);
  assert.equal(draft.canWrite, false);
  assert.equal((await send(draft.token, { kind: "initialize" }, randomUUID(), draftOuting)).status, 409);
  const preview = await view();
  assert.deepEqual(preview.confirmed.map(candidate => candidate.id), [registration]);
  assert.equal((await send(preview.token, { kind: "initialize" }, randomUUID(), outing, otherToken)).status, 403);

  const key = randomUUID();
  const init: Action = { kind: "initialize" };
  const attempts = await Promise.all([
    send(preview.token, init, key),
    send(preview.token, init, key),
  ]);
  assert.deepEqual(attempts.map(response => response.status), [201, 201]);
  assert.deepEqual(await attempts[0].json(), await attempts[1].json());
  assert.equal((await send(preview.token, init)).status, 409);
  const initialized = await view();
  const participant = initialized.participants[0];
  assert.equal(initialized.revision, 1);
  assert.equal(initialized.participants.length, 1);
  assert.equal(participant.present, null);
  assert.equal(participant.snapshot.profile.heldLevel, "N2");
  assert.equal(participant.snapshot.recordedBy, director);
  assert.equal(participant.snapshot.registrationId, registration);
  assert.deepEqual(participant.warnings, ["caci_missing"]);

  const guest: Action = {
    kind: "add_guest", verified: true,
    profile: { firstName: "Prénom", lastName: "Invité", heldLevel: null, qualifications: [], lastCaci: null },
  };
  assert.equal((await send(initialized.token, guest, key)).status, 409);
  assert.equal((await apply(guest)).status, 200);
  const search = await api.request(`${path(outing)}/adherents?nom=Manuel`, { headers: { Authorization: `Bearer ${directorToken}` } });
  assert.deepEqual(await search.json(), [{ id: manual, firstName: "Manuel", lastName: "Exemple" }]);
  assert.equal((await apply({ kind: "add_member", memberId: manual })).status, 200);

  await pool.query("UPDATE safety_participant SET present = true WHERE id = $1", [participant.id]);
  await pool.query("UPDATE member SET held_level = 'N3', last_caci = '2030-04-01' WHERE id = $1", [member]);
  await pool.query("INSERT INTO outing_registration VALUES ($1, $2, $3, 'confirmed'), ($4, $2, $5, 'confirmed')",
    [lateRegistration, outing, late, randomUUID(), manual]);
  const changed = await view();
  assert.deepEqual(changed.changes.map(change => change.kind).sort(), ["add", "link", "refresh", "refresh"]);
  assert.equal((await send(initialized.token, { kind: "import", registrationId: lateRegistration })).status, 409);
  assert.equal((await apply({ kind: "refresh", participantId: participant.id, registrationId: registration, field: "heldLevel" })).status, 200);
  const updated = (await view()).participants.find(entry => entry.id === participant.id)!;
  assert.equal(updated.snapshot.profile.heldLevel, "N3");
  assert.equal(updated.snapshot.profile.lastCaci, null);
  assert.equal(updated.present, true);
  assert.equal((await apply({ kind: "import", registrationId: lateRegistration })).status, 200);

  await pool.query("UPDATE outing_registration SET status = 'cancelled' WHERE id = $1", [registration]);
  assert.equal((await view()).changes.some(change => change.kind === "cancelled"), true);
  assert.equal((await apply({ kind: "remove", participantId: participant.id })).status, 200);
  await pool.query("UPDATE outing_registration SET status = 'confirmed' WHERE id = $1", [registration]);
  assert.equal((await view()).changes.some(change => change.candidate.id === registration), false);
  await pool.query("UPDATE outing SET reserved_device_id = $1 WHERE id = $2", [randomUUID(), outing]);
  assert.equal((await apply({ kind: "restore", participantId: participant.id })).status, 423);

  const audit = await pool.query("SELECT action, field FROM safety_mutation ORDER BY revision");
  assert.deepEqual(audit.rows.map(row => row.action), ["initialize", "add_guest", "add_member", "refresh", "import", "remove"]);
  assert.equal(audit.rows[3].field, "heldLevel");
  const history = await pool.query("SELECT contents FROM safety_snapshot WHERE participant_id = $1 ORDER BY number", [participant.id]);
  assert.deepEqual(history.rows.map(row => row.contents.profile.heldLevel), ["N2", "N3"]);
});
