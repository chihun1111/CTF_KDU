import { execFileSync } from "node:child_process";

if (process.env.CI !== "true" || !/^ctf-ci-\d+$/.test(process.env.COMPOSE_PROJECT_NAME ?? "")) {
  throw new Error("Database fault checks require a disposable ctf-ci-* Compose project");
}

// Run against real PostgreSQL through the backend's own network and secret files.
// Only a randomly named, isolated schema is modified and removed by this probe.
const program = String.raw`
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { buildDatabaseUrl } from "./dist/database/database-url.js";
import { runDatabaseMigrations } from "./dist/database/migrations.js";

const schema = "migration_probe_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: buildDatabaseUrl(), connectionTimeoutMillis: 2000 });
const pool = new Pool({ connectionString: buildDatabaseUrl(), connectionTimeoutMillis: 2000, options: "-c search_path=" + schema + ",public" });
const directory = mkdtempSync(path.join(tmpdir(), "ctf-migrations-"));
try {
  await admin.query('CREATE SCHEMA "' + schema + '"');
  writeFileSync(path.join(directory, "0000_fixture.sql"), "CREATE TABLE probe (id integer); INSERT INTO probe VALUES (1);");
  assert.equal((await runDatabaseMigrations(pool, directory)).applied.length, 1);
  assert.equal((await runDatabaseMigrations(pool, directory)).applied.length, 0);
  assert.equal((await pool.query("SELECT count(*)::integer AS n FROM probe")).rows[0].n, 1);

  const second = path.join(directory, "0001_next.sql");
  writeFileSync(second, "INSERT INTO probe VALUES (2); SELECT missing_column FROM probe;");
  await assert.rejects(runDatabaseMigrations(pool, directory));
  assert.equal((await pool.query("SELECT count(*)::integer AS n FROM probe")).rows[0].n, 1);
  assert.equal((await pool.query("SELECT count(*)::integer AS n FROM ctf_schema_migrations")).rows[0].n, 1);

  writeFileSync(second, "INSERT INTO probe VALUES (2);");
  const concurrent = await Promise.all([runDatabaseMigrations(pool, directory), runDatabaseMigrations(pool, directory)]);
  assert.equal(concurrent.reduce((sum, result) => sum + result.applied.length, 0), 1);
  assert.equal((await pool.query("SELECT count(*)::integer AS n FROM probe")).rows[0].n, 2);

  writeFileSync(path.join(directory, "0000_fixture.sql"), "DROP TABLE probe;");
  await assert.rejects(runDatabaseMigrations(pool, directory), /missing or changed/);
  assert.equal((await pool.query("SELECT count(*)::integer AS n FROM probe")).rows[0].n, 2);
  console.log("[runtime-database-smoke] passed: idempotency, rollback, concurrent runners, checksum protection");
} finally {
  await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
  await admin.end();
  rmSync(directory, { recursive: true, force: true });
}
`;

execFileSync("docker", ["compose", "-f", "infra/docker/docker-compose.yml", "--env-file", ".env.production",
  "exec", "-T", "--workdir", "/app/apps/backend", "backend", "node", "--input-type=module"], {
  input: program,
  stdio: ["pipe", "inherit", "inherit"],
  timeout: 60_000,
});
