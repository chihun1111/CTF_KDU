import assert from "node:assert/strict";
import test from "node:test";
import { LoginDrizzleStore } from "./login-drizzle.store.js";

function tableName(table: unknown): string {
  return String((table as { [key: symbol]: string | undefined })[Symbol.for("drizzle:Name")] ?? "unknown");
}

test("LoginDrizzleStore finds login user by student hash and creates a session", async () => {
  const events: string[] = [];
  const db = {
    select() {
      return {
        from(table: unknown) {
          events.push(`select:${tableName(table)}`);
          return {
            where() {
              events.push("where");
              return {
                limit(count: number) {
                  events.push(`limit:${count}`);
                  return Promise.resolve([{ id: "user-1", passwordHash: "password-hash", role: "participant" }]);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      events.push(`insert:${tableName(table)}`);
      return {
        values(value: unknown) {
          events.push(`values:${JSON.stringify(value)}`);
          return {
            returning() {
              return Promise.resolve([{ id: "session-1" }]);
            },
          };
        },
      };
    },
  };

  const store = new LoginDrizzleStore({ db });

  assert.deepEqual(await store.findLoginUserByStudentIdHash("student-hash"), {
    id: "user-1",
    passwordHash: "password-hash",
    role: "participant",
  });
  assert.deepEqual(
    await store.createSession({
      userId: "user-1",
      sessionHash: "session-hash",
      expiresAt: new Date("2026-05-10T00:00:00.000Z"),
      lastSeenAt: new Date("2026-05-09T00:00:00.000Z"),
    }),
    { id: "session-1" },
  );
  assert(events.includes("select:users"));
  assert(events.includes("insert:sessions"));
});
