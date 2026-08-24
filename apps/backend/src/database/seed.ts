import { Pool } from "pg";
import { buildDatabaseUrl } from "./database-url.js";
import { runChallengeSeed } from "./db-maintenance.js";

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: buildDatabaseUrl() });

  try {
    await runChallengeSeed(pool);
    console.log("Challenge metadata seed applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown database seed error";
  console.error(`Challenge metadata seed failed: ${message}`);
  process.exitCode = 1;
});
