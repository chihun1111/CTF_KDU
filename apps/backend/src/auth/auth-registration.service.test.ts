import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { FLAG_IDS } from "@campus-ctf/shared";
import type { EncryptedStorageValue } from "../crypto/crypto.service.js";
import { AuthRegistrationService, type RegistrationStore } from "./auth-registration.service.js";

const encryptedValue: EncryptedStorageValue = {
  keyVersion: "student-id-v1",
  hash: "student-hash",
  ciphertext: {
    alg: "AES-256-GCM",
    keyVersion: "student-id-v1",
    iv: "iv",
    ciphertext: "ciphertext",
    tag: "tag",
  },
};

function createStore(events: string[], existingUser = false): RegistrationStore {
  return {
    async transaction(callback) {
      events.push("transaction:start");
      const result = await callback({
        async findUserByStudentIdHash(studentIdHash) {
          events.push(`find:${studentIdHash}`);
          return existingUser ? { id: "existing-user" } : null;
        },
        async createUser(input) {
          events.push(`create-user:${input.studentIdHash}:${input.passwordHash}`);
          return { id: "user-1" };
        },
        async recordCookieConsent(input) {
          events.push(
            `consent:${input.userId}:${input.requiredLoggingAccepted}:${input.cookieAccepted}:${input.ipHash}:${input.userAgentHash}`,
          );
        },
        async listActiveChallenges() {
          events.push("list-challenges");
          return FLAG_IDS.map((flagId, index) => ({
            id: `challenge-${index + 1}`,
            flagId,
          }));
        },
        async createChallengeFlags(userId, records) {
          events.push(`flags:${userId}:${records.length}`);
        },
        async createSession(input) {
          events.push(`session:${input.userId}:${input.sessionHash}`);
          return { id: "session-1" };
        },
      });
      events.push("transaction:end");
      return result;
    },
  };
}

test("AuthRegistrationService creates user, consent, 8 flags, and session without returning the token", async () => {
  const events: string[] = [];
  const service = new AuthRegistrationService(
    createStore(events),
    {
      prepareStudentIdForStorage: () => encryptedValue,
      generateOpaqueToken: () => "opaque-session-token",
      sessionHash: (token) => `hash:${token}`,
    },
    { hashPassword: async () => "password-hash" },
    {
      issueChallengeFlagsForUser: (challenges) =>
        challenges.map((challenge) => ({
          challengeId: challenge.id,
          flagCiphertext: encryptedValue.ciphertext,
          flagKeyVersion: "flag-v1",
          flagHash: `flag-hash:${challenge.id}`,
        })),
    },
    { buildSessionCookie: (token, maxAge) => `ctf_session=${token}; Max-Age=${maxAge}; HttpOnly` },
  );

  const result = await service.register({
    input: {
      studentId: "2622022",
      password: "valid-password",
      consent: {
        consentVersion: "2026-ctf-v1",
        requiredLoggingAccepted: true,
        analyticsLoggingAccepted: false,
        cookieAccepted: true,
      },
    },
    ipHash: "ip-hash",
    userAgentHash: "ua-hash",
  });

  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.setCookie, "ctf_session=opaque-session-token; Max-Age=86400; HttpOnly");
  assert.equal(JSON.stringify(result.body).includes("opaque-session-token"), false);
  assert.equal(events.includes("flags:user-1:8"), true);
  assert.deepEqual(events, [
    "transaction:start",
    "find:student-hash",
    "create-user:student-hash:password-hash",
    "consent:user-1:true:true:ip-hash:ua-hash",
    "list-challenges",
    "flags:user-1:8",
    "session:user-1:hash:opaque-session-token",
    "transaction:end",
  ]);
});

test("AuthRegistrationService rejects duplicate student id without creating downstream records", async () => {
  const events: string[] = [];
  const service = new AuthRegistrationService(
    createStore(events, true),
    {
      prepareStudentIdForStorage: () => encryptedValue,
      generateOpaqueToken: () => "opaque-session-token",
      sessionHash: (token) => `hash:${token}`,
    },
    { hashPassword: async () => "password-hash" },
    { issueChallengeFlagsForUser: () => [] },
    { buildSessionCookie: (token) => `ctf_session=${token}` },
  );

  await assert.rejects(
    () =>
      service.register({
        input: {
          studentId: "2622022",
          password: "valid-password",
          consent: {
            consentVersion: "2026-ctf-v1",
            requiredLoggingAccepted: true,
            cookieAccepted: true,
          },
        },
        ipHash: "ip-hash",
        userAgentHash: "ua-hash",
      }),
    ConflictException,
  );

  assert.deepEqual(events, ["transaction:start", "find:student-hash"]);
});
