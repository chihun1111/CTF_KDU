import assert from "node:assert/strict";
import test from "node:test";
import { SessionAuthDrizzleStore } from "./session-auth-drizzle.store.js";

function tableName(table: unknown): string {
  return String((table as { [key: symbol]: string | undefined })[Symbol.for("drizzle:Name")] ?? "unknown");
}

test("SessionAuthDrizzleStore finds active sessions and touches last_seen_at without token plaintext", async () => {
  const events: string[] = [];
  const db = {
    select() {
      return {
        from(table: unknown) {
          events.push(`select:${tableName(table)}`);
          return {
            innerJoin(table: unknown) {
              events.push(`join:${tableName(table)}`);
              return {
                where() {
                  events.push("where-active-session");
                  return {
                    limit(count: number) {
                      events.push(`limit:${count}`);
                      return Promise.resolve([
                        { sessionId: "session-1", userId: "user-1", role: "participant" },
                      ]);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    update(table: unknown) {
      events.push(`update:${tableName(table)}`);
      return {
        set(value: unknown) {
          const serialized = JSON.stringify(value);
          events.push(`set:${serialized}`);
          return {
            where() {
              events.push(serialized.includes("revokedAt") ? "where-revoke-session" : "where-touch-session");
              return Promise.resolve();
            },
          };
        },
      };
    },
  };

  const store = new SessionAuthDrizzleStore({ db });
  const now = new Date("2026-05-09T00:00:00.000Z");

  assert.deepEqual(await store.findActiveSessionByHash("session-hash", now), {
    sessionId: "session-1",
    userId: "user-1",
    role: "participant",
  });
  await store.touchSession("session-1", now);
  await store.revokeSession("session-1", now);

  assert(events.includes("select:sessions"));
  assert(events.includes("join:users"));
  assert(events.includes("where-active-session"));
  assert(events.includes("update:sessions"));
  assert(events.includes("where-touch-session"));
  assert(events.includes("where-revoke-session"));
  assert(events.some((event) => event.includes('"revokedAt":"2026-05-09T00:00:00.000Z"')));
  assert.equal(events.some((event) => event.includes("opaque-token")), false);
});
