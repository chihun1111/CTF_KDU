import assert from "node:assert/strict";
import test from "node:test";
import { ClearCertificateDrizzleStore } from "./clear-certificate-drizzle.store.js";

function tableName(table: unknown): string {
  return String((table as { [key: symbol]: string | undefined })[Symbol.for("drizzle:Name")] ?? "unknown");
}

test("ClearCertificateDrizzleStore consumes only the current user's valid clear token", async () => {
  const events: string[] = [];
  let updateWins = true;
  const db = {
    transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      events.push("transaction");
      const tx = {
        select(selection?: unknown) {
          const keys = Object.keys((selection ?? {}) as Record<string, unknown>);
          return {
            from(table: unknown) {
              events.push(`from:${tableName(table)}`);
              return {
                innerJoin(joinTable: unknown) {
                  events.push(`join:${tableName(joinTable)}`);
                  return {
                    innerJoin(secondJoinTable: unknown) {
                      events.push(`join:${tableName(secondJoinTable)}`);
                      return {
                        innerJoin(thirdJoinTable: unknown) {
                          events.push(`join:${tableName(thirdJoinTable)}`);
                          return {
                            where() {
                              events.push("where");
                              return {
                                limit(count: number) {
                                  events.push(`limit:${count}`);
                                  if (keys.includes("clearViewTokenId")) {
                                    return Promise.resolve([
                                      {
                                        clearViewTokenId: "token-1",
                                        studentIdCiphertext: {
                                          alg: "AES-256-GCM",
                                          keyVersion: "student-id-v1",
                                          iv: "iv",
                                          ciphertext: "ciphertext",
                                          tag: "tag",
                                        },
                                        clearedAt: new Date("2026-05-07T12:00:00.000Z"),
                                        clearReceiptCode: "CLR-8F3K2A",
                                      },
                                    ]);
                                  }
                                  return Promise.resolve([]);
                                },
                              };
                            },
                          };
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
              events.push(`set:${Object.keys(value as Record<string, unknown>).join(",")}`);
              return {
                where() {
                  events.push("update-where");
                  return {
                    returning() {
                      events.push("returning");
                      return Promise.resolve(updateWins ? [{ clearViewTokenId: "token-1" }] : []);
                    },
                  };
                },
              };
            },
          };
        },
      };
      return callback(tx);
    },
  };

  const store = new ClearCertificateDrizzleStore({ db } as ConstructorParameters<typeof ClearCertificateDrizzleStore>[0]);

  const result = await store.consumeClearViewToken({
    userId: "user-1",
    tokenHash: "token-hash",
    now: new Date("2026-05-10T00:00:00.000Z"),
  });

  assert.deepEqual(result, {
    studentIdCiphertext: {
      alg: "AES-256-GCM",
      keyVersion: "student-id-v1",
      iv: "iv",
      ciphertext: "ciphertext",
      tag: "tag",
    },
    clearedAt: new Date("2026-05-07T12:00:00.000Z"),
    clearReceiptCode: "CLR-8F3K2A",
  });
  assert(events.includes("from:clear_view_tokens"));
  assert(events.includes("join:final_submissions"));
  assert(events.includes("join:clears"));
  assert(events.includes("join:users"));
  assert(events.includes("update:clear_view_tokens"));
  assert(events.includes("returning"));
  assert.equal(JSON.stringify(result).includes("token-hash"), false);
  assert.equal(JSON.stringify(result).includes("user-1"), false);

  updateWins = false;
  const concurrentLoser = await store.consumeClearViewToken({
    userId: "user-1",
    tokenHash: "token-hash",
    now: new Date("2026-05-10T00:00:00.000Z"),
  });
  assert.equal(concurrentLoser, null);
});
