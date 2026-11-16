import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { ChallengesDrizzleStore } from "./challenges-drizzle.store.js";

test("latest progress uses a deterministic tie-breaker and stays scoped to its participant", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(`
    CREATE TABLE final_submissions (id TEXT PRIMARY KEY, user_id TEXT, correct_count INTEGER, is_clear INTEGER, created_at TEXT);
    CREATE TABLE final_submission_results (id TEXT PRIMARY KEY, final_submission_id TEXT, user_id TEXT, flag_id TEXT, is_correct INTEGER);
    INSERT INTO final_submissions VALUES
      ('00000000-0000-0000-0000-000000000001', 'participant', 1, 0, '2026-05-10T00:00:00.000Z'),
      ('00000000-0000-0000-0000-000000000002', 'participant', 2, 0, '2026-05-10T00:00:00.000Z'),
      ('00000000-0000-0000-0000-000000000003', 'other-participant', 8, 1, '2026-05-11T00:00:00.000Z');
    INSERT INTO final_submission_results VALUES
      ('result-1', '00000000-0000-0000-0000-000000000001', 'participant', 'FLAG-01', 1),
      ('result-2', '00000000-0000-0000-0000-000000000002', 'participant', 'FLAG-01', 1),
      ('result-3', '00000000-0000-0000-0000-000000000002', 'participant', 'FLAG-02', 1),
      ('result-other', '00000000-0000-0000-0000-000000000003', 'other-participant', 'FLAG-08', 1);
  `);
  // Execute the real PostgreSQL adapter's portable SELECT SQL against data,
  // rather than making a fake query builder return the expected winner.
  const client = {
    async query(config: { text: string; rowMode?: string }, values: unknown[] = []) {
      const bindings: SQLInputValue[] = [];
      const query = config.text.replace(/\$(\d+)/g, (_match, position: string) => {
        bindings.push(values[Number(position) - 1] as SQLInputValue);
        return "?";
      });
      const statement = sqlite.prepare(query);
      if (config.rowMode === "array") statement.setReturnArrays(true);
      const columns = statement.columns();
      const rows = statement.all(...bindings).map((row) => !Array.isArray(row) ? row : row.map((value: unknown, index: number) =>
        ["is_clear", "is_correct"].includes(columns[index]?.column ?? "") ? Boolean(value) : value));
      return { rows };
    },
  };
  const db = drizzle(client as unknown as Pool);
  const store = new ChallengesDrizzleStore({ db });

  assert.deepEqual(await store.getLatestProgress("participant"), {
    correctCount: 2,
    requiredCount: 8,
    cleared: false,
    resultsByFlagId: { "FLAG-01": { correct: true }, "FLAG-02": { correct: true } },
  });
  assert.deepEqual(await store.getLatestProgress("absent-participant"), {
    correctCount: 0, requiredCount: 8, cleared: false, resultsByFlagId: {},
  });
});
