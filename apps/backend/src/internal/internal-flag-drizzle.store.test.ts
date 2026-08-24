import assert from "node:assert/strict";
import test from "node:test";
import { InternalFlagDrizzleStore } from "./internal-flag-drizzle.store.js";

function tableName(table: unknown): string {
  return String((table as { [key: symbol]: string | undefined })[Symbol.for("drizzle:Name")] ?? "unknown");
}

test("InternalFlagDrizzleStore reads only the current user challenge flag ciphertext", async () => {
  const events: string[] = [];
  const db = {
    select() {
      return {
        from(table: unknown) {
          events.push(`from:${tableName(table)}`);
          return {
            where() {
              events.push("where");
              return {
                limit(count: number) {
                  events.push(`limit:${count}`);
                  if (events.length === 3) {
                    return Promise.resolve([{ id: "challenge-1", flagId: "FLAG-01" }]);
                  }

                  return Promise.resolve([
                    {
                      flagCiphertext: {
                        alg: "AES-256-GCM",
                        keyVersion: "flag-v1",
                        iv: "iv",
                        ciphertext: "ciphertext",
                        tag: "tag",
                      },
                    },
                  ]);
                },
              };
            },
          };
        },
      };
    },
  };
  const store = new InternalFlagDrizzleStore({ db });

  const result = await store.findUserChallengeFlag("user-1", "FLAG-01");

  assert.deepEqual(result, {
    flagId: "FLAG-01",
    flagCiphertext: {
      alg: "AES-256-GCM",
      keyVersion: "flag-v1",
      iv: "iv",
      ciphertext: "ciphertext",
      tag: "tag",
    },
  });
  assert.deepEqual(events, ["from:challenges", "where", "limit:1", "from:challenge_flags", "where", "limit:1"]);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
});
