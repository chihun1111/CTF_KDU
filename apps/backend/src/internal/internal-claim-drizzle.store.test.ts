import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { InternalClaimDrizzleStore } from "./internal-claim-drizzle.store.js";
import { InternalClaimService } from "./internal-claim.service.js";

function tableName(table: unknown): string {
  return String((table as { [key: symbol]: string | undefined })[Symbol.for("drizzle:Name")] ?? "unknown");
}

test("InternalClaimDrizzleStore validates token hash by user, challenge, and expiry before returning flag ciphertext", async () => {
  const events: string[] = [];
  const db = {
    select(selection?: unknown) {
      const keys = Object.keys((selection ?? {}) as Record<string, unknown>);
      return {
        from(table: unknown) {
          events.push(`from:${tableName(table)}`);
          return {
            where() {
              events.push("where");
              return {
                limit(count: number) {
                  events.push(`limit:${count}`);
                  if (keys.includes("id") && keys.includes("flagId")) {
                    return Promise.resolve([{ id: "challenge-8", flagId: "FLAG-08" }]);
                  }
                  if (keys.includes("claimId")) {
                    return Promise.resolve([{ claimId: "claim-1" }]);
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
    insert() {
      throw new Error("not used");
    },
  };
  const store = new InternalClaimDrizzleStore({ db });

  const result = await store.findValidClaim({
    userId: "user-1",
    flagId: "FLAG-08",
    tokenHash: "claim-hash",
    now: new Date("2026-05-10T00:00:00.000Z"),
  });

  assert.deepEqual(result, {
    flagId: "FLAG-08",
    flagCiphertext: {
      alg: "AES-256-GCM",
      keyVersion: "flag-v1",
      iv: "iv",
      ciphertext: "ciphertext",
      tag: "tag",
    },
  });
  assert.deepEqual(events, [
    "from:challenges",
    "where",
    "limit:1",
    "from:claim_tokens",
    "where",
    "limit:1",
    "from:challenge_flags",
    "where",
    "limit:1",
  ]);
  assert.equal(JSON.stringify(result).includes("claim-hash"), false);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
});

test("InternalClaimDrizzleStore stores issued claim token hash without plaintext token", async () => {
  const events: string[] = [];
  const db = {
    select(selection?: unknown) {
      const keys = Object.keys((selection ?? {}) as Record<string, unknown>);
      return {
        from(table: unknown) {
          events.push(`from:${tableName(table)}`);
          return {
            where() {
              events.push("where");
              return {
                limit(count: number) {
                  events.push(`limit:${count}`);
                  if (keys.includes("id")) {
                    return Promise.resolve([{ id: "challenge-8", flagId: "FLAG-08" }]);
                  }
                  return Promise.resolve([]);
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
          events.push(JSON.stringify(value));
          return Promise.resolve([]);
        },
      };
    },
  };
  const store = new InternalClaimDrizzleStore({ db });

  await store.createClaimToken({
    userId: "user-1",
    flagId: "FLAG-08",
    tokenHash: "claim-hash",
    expiresAt: new Date("2026-05-10T00:10:00.000Z"),
  });

  assert.deepEqual(events.slice(0, 5), ["from:challenges", "where", "limit:1", "insert:claim_tokens", events[4]]);
  assert.equal(events[4]?.includes("user-1"), true);
  assert.equal(events[4]?.includes("challenge-8"), true);
  assert.equal(events[4]?.includes("claim-hash"), true);
  assert.equal(events[4]?.includes("opaque-claim-token"), false);
});

test("claim issuance rejects a missing or disabled challenge instead of returning an unusable token", async () => {
  let inserts = 0;
  const store = new InternalClaimDrizzleStore({
    db: {
      select() {
        return { from: () => ({ where: () => ({ limit: async () => [] }) }) };
      },
      insert() {
        inserts += 1;
        return { values: async () => [] };
      },
    },
  });
  const service = new InternalClaimService(
    store,
    {
      internalServiceTokenMatches: (challengeId, token) => challengeId === "08" && token === "internal-token",
      generateOpaqueToken: () => "opaque-claim-token-with-at-least-32-bytes",
      claimTokenHash: () => "claim-hash",
      decryptFlagForInternalApi() { throw new Error("must not decrypt during issuance"); },
    },
    { async authenticateCookieHeader() { return { sessionId: "session-1", userId: "user-1", role: "participant" }; } },
  );

  await assert.rejects(() => service.issueClaim({
    authorizationHeader: "Bearer internal-token",
    cookieHeader: "ctf_session=session-token",
    body: { challengeId: "08" },
  }), NotFoundException);
  assert.equal(inserts, 0);
});
