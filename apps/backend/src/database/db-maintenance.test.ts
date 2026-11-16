import assert from "node:assert/strict";
import test from "node:test";
import { challengeSeedRows } from "@campus-ctf/db";
import { runChallengeSeed } from "./db-maintenance.js";

test("runChallengeSeed upserts exactly the documented challenge metadata", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  await runChallengeSeed({
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
    },
  });

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert(call);
  assert.match(call.sql, /INSERT INTO challenges \(id, flag_id, title, difficulty, category\)/);
  assert.match(call.sql, /ON CONFLICT \(flag_id\) DO UPDATE/);
  assert.deepEqual(
    call.params,
    challengeSeedRows.flatMap((row) => [row.flagId.replace(/^FLAG-/, ""), row.flagId, row.title, row.difficulty, row.category]),
  );
});
