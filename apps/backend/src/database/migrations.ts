import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type MigrationConnection = {
  query(sql: string, params?: unknown[]): Promise<unknown>;
  release(discard?: boolean): void;
};
export type MigrationPool = { connect(): Promise<MigrationConnection> };
export type Migration = { name: string; checksum: string; sql: string };

export function readMigrations(directory = path.resolve(import.meta.dirname, "../../../../packages/db/drizzle")): Migration[] {
  const names = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  if (names.length === 0) throw new Error("No database migrations found");
  return names.map((name, index) => {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name) || Number(name.slice(0, 4)) !== index) {
      throw new Error("Migration names must have consecutive versions starting at 0000");
    }
    const sql = readFileSync(path.join(directory, name), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    if (!sql.trim()) throw new Error(`Empty migration: ${name}`);
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  });
}

export async function runDatabaseMigrations(pool: MigrationPool, directory?: string): Promise<{ applied: string[]; skipped: string[] }> {
  // Read before taking a connection so a missing/broken package cannot touch the DB.
  const migrations = readMigrations(directory);
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    // Serialize migration runners on this dedicated connection for the whole transaction.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [1129596491, 1]);
    await client.query(`CREATE TABLE IF NOT EXISTS ctf_schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const result = await client.query("SELECT name, checksum FROM ctf_schema_migrations ORDER BY name") as { rows: Array<{ name: string; checksum: string }> };
    const appliedRows = result.rows;
    for (const [index, applied] of appliedRows.entries()) {
      const expected = migrations[index];
      if (!expected || expected.name !== applied.name || expected.checksum !== applied.checksum) {
        throw new Error(`Applied migration is missing or changed: ${applied.name}`);
      }
    }
    const applied: string[] = [];
    for (const migration of migrations.slice(appliedRows.length)) {
      await client.query(migration.sql);
      await client.query("INSERT INTO ctf_schema_migrations (name, checksum) VALUES ($1, $2)", [migration.name, migration.checksum]);
      applied.push(migration.name);
    }
    await client.query("COMMIT");
    return { applied, skipped: appliedRows.map((row) => row.name) };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
