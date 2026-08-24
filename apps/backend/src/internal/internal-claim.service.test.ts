import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InternalClaimService, type InternalClaimStore } from "./internal-claim.service.js";

function createStore(events: string[] = []): InternalClaimStore {
  return {
    async findValidClaim(input) {
      events.push(JSON.stringify(input));
      if (input.userId !== "user-1" || input.flagId !== "FLAG-08" || input.tokenHash !== "claim-hash") {
        return null;
      }

      return {
        flagId: "FLAG-08",
        flagCiphertext: {
          alg: "AES-256-GCM",
          keyVersion: "flag-v1",
          iv: "iv",
          ciphertext: "ciphertext",
          tag: "tag",
        },
      };
    },
    async createClaimToken() {
      throw new Error("not used");
    },
  };
}

test("InternalClaimService verifies a user-bound claim token and returns only that user's flag", async () => {
  const events: string[] = [];
  const service = new InternalClaimService(
    createStore(events),
    {
      claimTokenHash: () => "claim-hash",
      decryptFlagForInternalApi: () => "KDUCTF" + "{USER1_FLAG08}",
      generateOpaqueToken() {
        throw new Error("not used");
      },
      internalServiceTokenMatches: (challengeId, token) => challengeId === "08" && token === "internal-token",
    },
    {
      async authenticateCookieHeader(cookieHeader) {
        assert.equal(cookieHeader, "ctf_session=session-token");
        return {
          sessionId: "session-1",
          userId: "user-1",
          role: "participant",
        };
      },
    },
  );

  const result = await service.verifyClaim({
    authorizationHeader: "Bearer internal-token",
    cookieHeader: "ctf_session=session-token",
    body: {
      challengeId: "08",
      claimToken: "opaque-claim-token-with-at-least-32-bytes",
    },
  });

  assert.deepEqual(result, {
    flagId: "FLAG-08",
    flag: "KDUCTF" + "{USER1_FLAG08}",
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.includes("opaque-claim-token-with-at-least-32-bytes"), false);
  assert.equal(events[0]?.includes("claim-hash"), true);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
  assert.equal(JSON.stringify(result).includes("session-1"), false);
});

test("InternalClaimService issues a user-bound FLAG-08 claim token without returning a flag", async () => {
  const events: string[] = [];
  const service = new InternalClaimService(
    {
      async findValidClaim() {
        throw new Error("not used");
      },
      async createClaimToken(input) {
        events.push(JSON.stringify(input));
      },
    },
    {
      claimTokenHash(token) {
        assert.equal(token, "issued-opaque-claim-token-with-at-least-32-bytes");
        return "issued-claim-hash";
      },
      decryptFlagForInternalApi() {
        throw new Error("not used");
      },
      generateOpaqueToken() {
        return "issued-opaque-claim-token-with-at-least-32-bytes";
      },
      internalServiceTokenMatches: (challengeId, token) => challengeId === "08" && token === "internal-token",
    },
    {
      async authenticateCookieHeader(cookieHeader) {
        assert.equal(cookieHeader, "ctf_session=session-token");
        return {
          sessionId: "session-1",
          userId: "user-1",
          role: "participant",
        };
      },
    },
    {
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    },
  );

  const result = await service.issueClaim({
    authorizationHeader: "Bearer internal-token",
    cookieHeader: "ctf_session=session-token",
    body: {
      challengeId: "08",
    },
  });

  assert.deepEqual(result, {
    challengeId: "08",
    claimToken: "issued-opaque-claim-token-with-at-least-32-bytes",
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.includes("user-1"), true);
  assert.equal(events[0]?.includes("FLAG-08"), true);
  assert.equal(events[0]?.includes("issued-claim-hash"), true);
  assert.equal(events[0]?.includes("issued-opaque-claim-token-with-at-least-32-bytes"), false);
  assert.equal(JSON.stringify(result).includes("KDUCTF{"), false);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
});

test("InternalClaimService rejects invalid service auth or invalid claim input before reading store", async () => {
  const events: string[] = [];
  const service = new InternalClaimService(
    createStore(events),
    {
      claimTokenHash: () => "claim-hash",
      decryptFlagForInternalApi: () => "KDUCTF" + "{NOPE}",
      generateOpaqueToken() {
        throw new Error("not used");
      },
      internalServiceTokenMatches: () => false,
    },
    {
      async authenticateCookieHeader() {
        throw new Error("should not authenticate session");
      },
    },
  );

  await assert.rejects(
    () =>
      service.verifyClaim({
        authorizationHeader: "Bearer wrong",
        cookieHeader: "ctf_session=session-token",
        body: {
          challengeId: "08",
          claimToken: "opaque-claim-token-with-at-least-32-bytes",
        },
      }),
    UnauthorizedException,
  );
  assert.deepEqual(events, []);
});

test("InternalClaimService binds the service token to body.challengeId", async () => {
  const service = new InternalClaimService(
    createStore(),
    {
      claimTokenHash: () => "claim-hash",
      decryptFlagForInternalApi: () => "KDUCTF" + "{NOPE}",
      generateOpaqueToken() {
        throw new Error("not used");
      },
      internalServiceTokenMatches: (challengeId, token) => challengeId === "06" && token === "challenge-06-token",
    },
    {
      async authenticateCookieHeader() {
        throw new Error("should not authenticate a mismatched challenge token");
      },
    },
  );

  await assert.rejects(
    () =>
      service.verifyClaim({
        authorizationHeader: "Bearer challenge-06-token",
        cookieHeader: "ctf_session=session-token",
        body: {
          challengeId: "08",
          claimToken: "opaque-claim-token-with-at-least-32-bytes",
        },
      }),
    UnauthorizedException,
  );
});

test("InternalClaimService rejects unsupported challenge ids and missing or expired claims", async () => {
  const auditEvents: string[] = [];
  const service = new InternalClaimService(
    createStore(),
    {
      claimTokenHash: () => "missing-hash",
      decryptFlagForInternalApi: () => "KDUCTF" + "{NOPE}",
      generateOpaqueToken() {
        throw new Error("not used");
      },
      internalServiceTokenMatches: (challengeId) => challengeId === "08",
    },
    {
      async authenticateCookieHeader() {
        return {
          sessionId: "session-1",
          userId: "user-1",
          role: "participant",
        };
      },
    },
    undefined,
    {
      async recordClaimVerifyFailure(input) {
        auditEvents.push(JSON.stringify(input));
      },
    },
  );

  await assert.rejects(
    () =>
      service.verifyClaim({
        authorizationHeader: "Bearer internal-token",
        cookieHeader: "ctf_session=session-token",
        body: {
          challengeId: "07",
          claimToken: "opaque-claim-token-with-at-least-32-bytes",
        },
      }),
    NotFoundException,
  );
  await assert.rejects(
    () =>
      service.verifyClaim({
        authorizationHeader: "Bearer internal-token",
        cookieHeader: "ctf_session=session-token",
        body: {
          challengeId: "08",
          claimToken: "opaque-claim-token-with-at-least-32-bytes",
        },
      }),
    NotFoundException,
  );
  assert.equal(auditEvents.length, 2);
  assert.equal(auditEvents[0]?.includes("opaque-claim-token-with-at-least-32-bytes"), false);
  assert.equal(auditEvents[1]?.includes("opaque-claim-token-with-at-least-32-bytes"), false);
  assert.equal(auditEvents[0]?.includes('"userId":"user-1"'), true);
  assert.equal(auditEvents[1]?.includes('"flagId":"FLAG-08"'), true);
});

test("InternalClaimService rejects another user's session for an otherwise valid claim token hash", async () => {
  const events: string[] = [];
  const service = new InternalClaimService(
    createStore(events),
    {
      claimTokenHash: () => "claim-hash",
      decryptFlagForInternalApi() {
        throw new Error("must not decrypt a foreign user's claim");
      },
      generateOpaqueToken() {
        throw new Error("not used");
      },
      internalServiceTokenMatches: (challengeId) => challengeId === "08",
    },
    {
      async authenticateCookieHeader() {
        return {
          sessionId: "session-2",
          userId: "user-2",
          role: "participant",
        };
      },
    },
  );

  await assert.rejects(
    () =>
      service.verifyClaim({
        authorizationHeader: "Bearer internal-token",
        cookieHeader: "ctf_session=session-token-b",
        body: {
          challengeId: "08",
          claimToken: "opaque-claim-token-with-at-least-32-bytes",
        },
      }),
    NotFoundException,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.includes('"userId":"user-2"'), true);
  assert.equal(events[0]?.includes("opaque-claim-token-with-at-least-32-bytes"), false);
});
