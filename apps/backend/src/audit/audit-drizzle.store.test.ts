import assert from "node:assert/strict";
import test from "node:test";
import { AuditDrizzleStore } from "./audit-drizzle.store.js";

function tableName(table: unknown): string {
  return String((table as { [key: symbol]: string | undefined })[Symbol.for("drizzle:Name")] ?? "unknown");
}

test("AuditDrizzleStore inserts audit log rows without plaintext request material", async () => {
  const events: string[] = [];
  const db = {
    insert(table: unknown) {
      events.push(`insert:${tableName(table)}`);
      return {
        values(value: unknown) {
          events.push(JSON.stringify(value));
          return Promise.resolve([]);
        },
      };
    },
  };
  const store = new AuditDrizzleStore({ db });

  await store.createAuditLog({
    userId: "admin-1",
    action: "ADMIN_PARTICIPANTS_VIEWED",
    metadata: {
      resource: "participants",
      page: 1,
      pageSize: 50,
    },
  });

  assert.equal(events[0], "insert:audit_logs");
  assert.equal(events[1]?.includes('"userId":"admin-1"'), true);
  assert.equal(events[1]?.includes('"action":"ADMIN_PARTICIPANTS_VIEWED"'), true);
  assert.equal(events[1]?.includes('"resource":"participants"'), true);
  assert.equal(events[1]?.includes("ctf_session"), false);
  assert.equal(events[1]?.includes("KDUCTF{"), false);
});
