import { Pool } from "pg";
import { buildDatabaseUrl } from "./database-url.js";
import { runDatabaseMigrations } from "./migrations.js";

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: buildDatabaseUrl(),
    connectionTimeoutMillis: 5_000,
    statement_timeout: 120_000,
    query_timeout: 130_000,
    idle_in_transaction_session_timeout: 30_000,
  });

  try {
    const result = await runDatabaseMigrations(pool);
    console.log(`Database migrations applied: ${result.applied.join(", ") || "none"}; already applied: ${result.skipped.length}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown database migration error";
  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
});
