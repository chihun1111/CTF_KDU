import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationDrizzleStore } from "./registration-drizzle.store.js";

function createInsert(tableName: string, events: string[]) {
  return {
    values(value: unknown) {
      events.push(`insert:${tableName}:${JSON.stringify(value)}`);
      return {
        returning() {
          events.push(`returning:${tableName}`);
          return Promise.resolve([{ id: `${tableName}-id` }]);
        },
      };
    },
  };
}

function tableName(table: unknown): string {
  return String((table as { [key: symbol]: string | undefined })[Symbol.for("drizzle:Name")] ?? "unknown");
}

test("RegistrationDrizzleStore runs registration operations inside a Drizzle transaction", async () => {
  const events: string[] = [];
  const tx = {
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
                  return Promise.resolve([]);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return createInsert(tableName(table), events);
    },
  };
  const db = {
    async transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
      events.push("db-transaction:start");
      const result = await callback(tx);
      events.push("db-transaction:end");
      return result;
    },
  };

  const store = new RegistrationDrizzleStore({ db });

  await store.transaction(async (registration) => {
    assert.equal(await registration.findUserByStudentIdHash("student-hash"), null);
    await registration.createUser({
      studentIdCiphertext: { alg: "AES-256-GCM", keyVersion: "student-id-v1", iv: "iv", ciphertext: "ct", tag: "tag" },
      studentIdKeyVersion: "student-id-v1",
      studentIdHash: "student-hash",
      passwordHash: "password-hash",
    });
    await registration.recordCookieConsent({
      userId: "user-1",
      consentVersion: "2026-ctf-v1",
      requiredLoggingAccepted: true,
      analyticsLoggingAccepted: false,
      cookieAccepted: true,
      ipHash: "ip-hash",
      userAgentHash: "ua-hash",
    });
    await registration.createChallengeFlags("user-1", [
      {
        challengeId: "challenge-1",
        flagCiphertext: { alg: "AES-256-GCM", keyVersion: "flag-v1", iv: "iv", ciphertext: "ct", tag: "tag" },
        flagKeyVersion: "flag-v1",
        flagHash: "flag-hash",
      },
    ]);
    await registration.createSession({
      userId: "user-1",
      sessionHash: "session-hash",
      expiresAt: new Date("2026-05-10T00:00:00.000Z"),
      lastSeenAt: new Date("2026-05-09T00:00:00.000Z"),
    });
  });

  assert(events.includes("select:users"));
  assert(events.some((event) => event.startsWith("insert:users:")));
  assert(events.some((event) => event.startsWith("insert:cookie_consents:")));
  assert(events.some((event) => event.includes('"ipHash":"ip-hash"')));
  assert(events.some((event) => event.includes('"userAgentHash":"ua-hash"')));
  assert(events.some((event) => event.startsWith("insert:challenge_flags:")));
  assert(events.some((event) => event.startsWith("insert:sessions:")));
  assert.equal(events.at(0), "db-transaction:start");
  assert.equal(events.at(-1), "db-transaction:end");
});
