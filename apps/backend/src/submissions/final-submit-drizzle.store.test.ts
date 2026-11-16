import assert from "node:assert/strict";
import test from "node:test";
import { FinalSubmitDrizzleStore } from "./final-submit-drizzle.store.js";

test("submission audit records use the same transaction and an audit failure prevents commit", async () => {
  const events: string[] = [];
  const failure = new Error("audit write failed");
  const store = new FinalSubmitDrizzleStore({
    db: {
      async transaction(callback) {
        events.push("begin");
        try {
          const result = await callback({
            select() { throw new Error("unused"); },
            insert(table) {
              const name = String((table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")]);
              return {
                values(value) {
                  events.push(`insert:${name}`);
                  if (name === "audit_logs") {
                    assert.deepEqual(value, {
                      userId: "user-1",
                      action: "FINAL_SUBMIT",
                      metadata: { logCategory: "required_operations", correctCount: 1, requiredCount: 8, submittedCount: 1, cleared: false },
                    });
                    throw failure;
                  }
                  return { returning: async () => [{ id: "submission-1" }] };
                },
              };
            },
          });
          events.push("commit");
          return result;
        } catch (error) {
          events.push("rollback");
          throw error;
        }
      },
    },
  });

  await assert.rejects(() => store.transaction(async (tx) => {
    await tx.createFinalSubmission({ userId: "user-1", submittedHashBundle: { "FLAG-01": "hash" }, correctCount: 1, isClear: false });
    await tx.recordFinalSubmitAudit({ userId: "user-1", correctCount: 1, requiredCount: 8, submittedCount: 1, cleared: false });
  }), (error) => error === failure);
  assert.deepEqual(events, ["begin", "insert:final_submissions", "insert:audit_logs", "rollback"]);
});
