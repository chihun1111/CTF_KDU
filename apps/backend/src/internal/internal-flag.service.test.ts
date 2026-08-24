import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InternalFlagService, type InternalFlagStore } from "./internal-flag.service.js";

function createStore(): InternalFlagStore {
  return {
    async findUserChallengeFlag(userId, flagId) {
      if (userId !== "user-1" || flagId !== "FLAG-01") {
        return null;
      }

      return {
        flagId,
        flagCiphertext: {
          alg: "AES-256-GCM",
          keyVersion: "flag-v1",
          iv: "iv",
          ciphertext: "ciphertext",
          tag: "tag",
        },
      };
    },
  };
}

test("InternalFlagService returns only the current session user's requested challenge flag", async () => {
  const service = new InternalFlagService(
    createStore(),
    {
      internalServiceTokenMatches: (challengeId, token) => challengeId === "01" && token === "internal-token",
      decryptFlagForInternalApi: () => "KDUCTF" + "{USER1_FLAG01}",
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

  const result = await service.getChallengeFlag({
    authorizationHeader: "Bearer internal-token",
    cookieHeader: "ctf_session=session-token",
    challengeId: "01",
  });

  assert.deepEqual(result, {
    flagId: "FLAG-01",
    flag: "KDUCTF" + "{USER1_FLAG01}",
  });
  assert.equal(JSON.stringify(result).includes("user-1"), false);
  assert.equal(JSON.stringify(result).includes("session-1"), false);
});

test("InternalFlagService rejects missing service token or invalid session before reading flags", async () => {
  const events: string[] = [];
  const service = new InternalFlagService(
    {
      async findUserChallengeFlag() {
        events.push("store");
        throw new Error("should not query flags");
      },
    },
    {
      internalServiceTokenMatches: () => false,
      decryptFlagForInternalApi: () => "KDUCTF" + "{NOPE}",
    },
    {
      async authenticateCookieHeader() {
        events.push("session");
        return null;
      },
    },
  );

  await assert.rejects(
    () =>
      service.getChallengeFlag({
        authorizationHeader: "Bearer wrong-token",
        cookieHeader: "ctf_session=session-token",
        challengeId: "01",
      }),
    UnauthorizedException,
  );
  assert.deepEqual(events, []);
});

test("InternalFlagService rejects unsupported challenge ids and missing flags", async () => {
  const service = new InternalFlagService(
    createStore(),
    {
      internalServiceTokenMatches: (challengeId) => challengeId === "01",
      decryptFlagForInternalApi: () => "KDUCTF" + "{NOPE}",
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
  );

  await assert.rejects(
    () =>
      service.getChallengeFlag({
        authorizationHeader: "Bearer internal-token",
        cookieHeader: "ctf_session=session-token",
        challengeId: "09",
      }),
    NotFoundException,
  );
  await assert.rejects(
    () =>
      service.getChallengeFlag({
        authorizationHeader: "Bearer internal-token",
        cookieHeader: "ctf_session=session-token",
        challengeId: "02",
      }),
    UnauthorizedException,
  );
});
