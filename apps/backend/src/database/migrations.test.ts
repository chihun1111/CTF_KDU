import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readMigrations, runDatabaseMigrations } from "./migrations.js";

test("packaged migrations retain the initial schema and add indexes as a new version", () => {
  const migrations = readMigrations();
  assert.deepEqual(migrations.map((migration) => migration.name), ["0000_initial_schema.sql", "0001_admin_query_indexes.sql"]);
  assert.match(migrations[0]!.sql, /CREATE TABLE IF NOT EXISTS "users"/);
  assert.match(migrations[1]!.sql, /final_submissions_user_latest_idx/);
});

test("migration checksums survive CRLF checkouts and invalid version gaps fail before connection", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "migration-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, "0000_schema.sql"), "SELECT 1;\n");
  const checksum = readMigrations(directory)[0]!.checksum;
  writeFileSync(path.join(directory, "0000_schema.sql"), "SELECT 1;\r\n");
  assert.equal(readMigrations(directory)[0]!.checksum, checksum);
  writeFileSync(path.join(directory, "0002_missing_previous.sql"), "SELECT 2;");
  await assert.rejects(runDatabaseMigrations({ connect: async () => { throw new Error("must not connect"); } }, directory), /consecutive versions/);
});

test("already applied migrations are skipped and changed history is rejected without executing DDL", async () => {
  const migrations = readMigrations();
  const queries: string[] = [];
  const rows = migrations.map(({ name, checksum }) => ({ name, checksum }));
  let released = false;
  const pool = { connect: async () => ({
    query: async (sql: string) => { queries.push(sql); return { rows }; },
    release: () => { released = true; },
  }) };
  const result = await runDatabaseMigrations(pool);
  assert.deepEqual(result.applied, []);
  assert.equal(queries.includes(migrations[0]!.sql), false);
  assert.equal(queries.at(-1), "COMMIT");
  assert.equal(released, true);
  rows[0]!.checksum = "changed";
  queries.length = 0;
  await assert.rejects(runDatabaseMigrations(pool), /missing or changed/);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(queries.includes(migrations[1]!.sql), false);
});

test("migration failure rolls back and discards a connection whose rollback also fails", async () => {
  const queries: string[] = [];
  let discard = false;
  const pool = { connect: async () => ({
    async query(sql: string) {
      queries.push(sql);
      if (sql.startsWith("DO $$")) throw new Error("DDL failed");
      if (sql === "ROLLBACK") throw new Error("connection lost");
      return { rows: [] };
    },
    release: (destroy?: boolean) => { discard = destroy ?? false; },
  }) };
  await assert.rejects(runDatabaseMigrations(pool), /DDL failed/);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(queries.includes("COMMIT"), false);
  assert.equal(discard, true);
});
