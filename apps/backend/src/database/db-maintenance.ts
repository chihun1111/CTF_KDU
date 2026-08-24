import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { challengeSeedRows } from "@campus-ctf/db";

export type PgQueryable = {
  query: (sql: string, params?: unknown[]) => Promise<unknown> | unknown;
};

export function resolveInitialMigrationPath(fromDir = import.meta.dirname): string {
  const migrationPath = path.resolve(fromDir, "../../../../packages/db/drizzle/0000_initial_schema.sql");
  if (!existsSync(migrationPath)) {
    throw new Error("Initial database migration SQL was not found");
  }

  return migrationPath;
}

export async function runInitialMigration(db: PgQueryable, migrationPath = resolveInitialMigrationPath()): Promise<void> {
  await db.query(readFileSync(migrationPath, "utf8"));
}

function challengeIdFromFlagId(flagId: string): string {
  const challengeId = /^FLAG-(\d{2})$/.exec(flagId)?.[1];
  if (!challengeId) {
    throw new Error(`Invalid challenge flag id: ${flagId}`);
  }

  return challengeId;
}

export async function runChallengeSeed(db: PgQueryable): Promise<void> {
  const params = challengeSeedRows.flatMap((row) => [challengeIdFromFlagId(row.flagId), row.flagId, row.title, row.difficulty, row.category]);
  const values = challengeSeedRows
    .map((_, index) => {
      const offset = index * 5;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::challenge_difficulty, $${offset + 5})`;
    })
    .join(", ");

  await db.query(
    `
INSERT INTO challenges (id, flag_id, title, difficulty, category)
VALUES ${values}
ON CONFLICT (flag_id) DO UPDATE
SET
  title = EXCLUDED.title,
  difficulty = EXCLUDED.difficulty,
  category = EXCLUDED.category,
  is_active = true
`,
    params,
  );
}
