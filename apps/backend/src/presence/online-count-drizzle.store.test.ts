import assert from "node:assert/strict";
import test from "node:test";
import { OnlineCountDrizzleStore } from "./online-count-drizzle.store.js";

function tableName(table: unknown): string {
  return String((table as { [key: symbol]: string | undefined })[Symbol.for("drizzle:Name")] ?? "unknown");
}

test("OnlineCountDrizzleStore counts active recent sessions without reading token or user data", async () => {
  const events: string[] = [];
  const db = {
    select() {
      return {
        from(table: unknown) {
          events.push(`from:${tableName(table)}`);
          return {
            where() {
              events.push("where:last_seen_expires_revoked");
              return Promise.resolve([{ count: "2" }]);
            },
          };
        },
      };
    },
  };
  const store = new OnlineCountDrizzleStore({ db });

  const count = await store.countRecentlySeenSessions(
    new Date("2026-05-10T00:00:00.000Z"),
    new Date("2026-05-10T00:02:00.000Z"),
  );

  assert.equal(count, 2);
  assert.deepEqual(events, ["from:sessions", "where:last_seen_expires_revoked"]);
  assert.equal(JSON.stringify(events).includes("session_hash"), false);
  assert.equal(JSON.stringify(events).includes("user_id"), false);
});
