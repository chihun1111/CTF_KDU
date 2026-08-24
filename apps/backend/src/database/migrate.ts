import { Pool } from "pg";
import { buildDatabaseUrl } from "./database-url.js";
import { runInitialMigration } from "./db-maintenance.js";

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: buildDatabaseUrl() });

  try {
    await runInitialMigration(pool);
    console.log("Initial database migration applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown database migration error";
  console.error(`Initial database migration failed: ${message}`);
  process.exitCode = 1;
});
