import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { ChallengeArtifactService, type ChallengeArtifactStore } from "./challenge-artifact.service.js";

const flagCiphertext = {
  alg: "AES-256-GCM",
  keyVersion: "flag-v1",
  iv: "iv",
  ciphertext: "ciphertext",
  tag: "tag",
} as const;

function createStore(row: Awaited<ReturnType<ChallengeArtifactStore["findArtifactForUser"]>>): ChallengeArtifactStore {
  return {
    async findArtifactForUser(input) {
      assert.equal(input.userId, "user-1");
      assert.equal(input.publicChallengeId, "02");
      return row;
    },
    async findFlagForArtifact() {
      throw new Error("not used");
    },
    async createArtifactForUser() {
      throw new Error("not used");
    },
    async createClaimTokenForUser() {
      throw new Error("not used");
    },
  };
}

test("ChallengeArtifactService returns a cached artifact without exposing owner or path data", async () => {
  const service = new ChallengeArtifactService(createStore({ artifactPath: "02/cache/file-1.jpg", artifactHash: "a".repeat(64) }), {
    async readArtifact(path) {
      assert.equal(path, "02/cache/file-1.jpg");
      return Buffer.from("artifact-bytes");
    },
  }, {
    async writeArtifact() {
      throw new Error("not used");
    },
  }, {
    decryptFlagForInternalApi() {
      throw new Error("not used");
    },
    generateOpaqueToken() {
      throw new Error("not used");
    },
    claimTokenHash() {
      throw new Error("not used");
    },
  });

  const result = await service.getArtifactForParticipant("user-1", "it-center-status");

  assert.deepEqual(result.body, Buffer.from("artifact-bytes"));
  assert.equal(result.contentType, "image/jpeg");
  assert.equal(result.filename.endsWith(".jpg"), true);
  assert.equal(result.etag, `"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
  assert.equal(JSON.stringify(result).includes("02/cache/file-1.jpg"), false);
});

test("ChallengeArtifactService generates and stores a missing FLAG-02 artifact for the current user", async () => {
  const events: string[] = [];
  const service = new ChallengeArtifactService({
    async findArtifactForUser(input) {
      events.push(`find-artifact:${input.userId}:${input.publicChallengeId}:${input.artifactVersion}`);
      return null;
    },
    async findFlagForArtifact(input) {
      events.push(`find-flag:${input.userId}:${input.publicChallengeId}`);
      return { flagCiphertext };
    },
    async createArtifactForUser(input) {
      events.push(`create:${input.userId}:${input.publicChallengeId}:${input.artifactVersion}:${input.artifactHash.length}`);
      assert.equal(input.artifactPath.startsWith("02/artifact-v1/"), true);
      assert.equal(input.artifactPath.includes("user-1"), false);
      assert.equal(input.artifactPath.includes("KDUCTF"), false);
    },
    async createClaimTokenForUser() {
      throw new Error("not used");
    },
  }, {
    async readArtifact() {
      throw new Error("not used");
    },
  }, {
    async writeArtifact(path, body) {
      events.push(`write:${path}:${body.byteLength > 0}`);
    },
  }, {
    decryptFlagForInternalApi(ciphertext) {
      assert.deepEqual(ciphertext, flagCiphertext);
      return "KDUCTF" + "{artifact_user_flag}";
    },
    generateOpaqueToken() {
      throw new Error("not used");
    },
    claimTokenHash() {
      throw new Error("not used");
    },
  });

  const result = await service.getArtifactForParticipant("user-1", "it-center-status");

  assert.equal(result.contentType, "image/jpeg");
  assert.equal(result.filename.endsWith(".jpg"), true);
  assert.equal(/^"[a-f0-9]{64}"$/.test(result.etag), true);
  assert(result.body.includes(Buffer.from("KDUCTF" + "{artifact_user_flag}")));
  assert.deepEqual(events.map((event) => event.replace(/[a-f0-9]{64}/, "<hash>")), [
    "find-artifact:user-1:02:artifact-v1",
    "find-flag:user-1:02",
    "write:02/artifact-v1/<hash>.jpg:true",
    "create:user-1:02:artifact-v1:64",
  ]);
});

test("ChallengeArtifactService generates FLAG-06 with a user-bound claim token hash only", async () => {
  const events: string[] = [];
  const service = new ChallengeArtifactService({
    async findArtifactForUser(input) {
      events.push(`find-artifact:${input.userId}:${input.publicChallengeId}:${input.artifactVersion}`);
      return null;
    },
    async findFlagForArtifact() {
      throw new Error("not used");
    },
    async createArtifactForUser(input) {
      events.push(`create-artifact:${input.userId}:${input.publicChallengeId}:${input.artifactVersion}:${input.artifactHash.length}`);
      assert.equal(input.artifactPath.startsWith("06/artifact-v1/"), true);
    },
    async createClaimTokenForUser(input) {
      events.push(`create-claim:${input.userId}:${input.publicChallengeId}:${input.tokenHash}:${input.expiresAt > new Date("2026-05-10T00:00:00.000Z")}`);
      assert.equal(JSON.stringify(input).includes("opaque-claim-token"), false);
    },
  }, {
    async readArtifact() {
      throw new Error("not used");
    },
  }, {
    async writeArtifact(path, body) {
      events.push(`write:${path.replace(/[a-f0-9]{64}/, "<hash>")}:${body.includes(Buffer.from("opaque-claim-token"))}`);
    },
  }, {
    decryptFlagForInternalApi() {
      throw new Error("not used");
    },
    generateOpaqueToken() {
      return "opaque-claim-token-with-at-least-32-bytes";
    },
    claimTokenHash(token) {
      assert.equal(token, "opaque-claim-token-with-at-least-32-bytes");
      return "c".repeat(64);
    },
  }, {
    now: () => new Date("2026-05-10T00:00:00.000Z"),
  });

  const result = await service.getArtifactForParticipant("user-1", "club-build-archive");

  assert.equal(result.contentType, "application/octet-stream");
  assert.equal(result.filename, "club-fee-tool.bin");
  assert.equal(result.body.includes(Buffer.from("KDUCTF" + "{")), false);
  assert.deepEqual(events, [
    "find-artifact:user-1:06:artifact-v1",
    "create-claim:user-1:06:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:true",
    "write:06/artifact-v1/<hash>.bin:false",
    "create-artifact:user-1:06:artifact-v1:64",
  ]);
});

test("ChallengeArtifactService rejects unsupported, missing flag, or unreadable cached artifacts generically", async () => {
  const unsupported = new ChallengeArtifactService(createStore(null), {
    async readArtifact() {
      throw new Error("not used");
    },
  }, {
    async writeArtifact() {
      throw new Error("not used");
    },
  }, {
    decryptFlagForInternalApi() {
      throw new Error("not used");
    },
    generateOpaqueToken() {
      throw new Error("not used");
    },
    claimTokenHash() {
      throw new Error("not used");
    },
  });
  await assert.rejects(() => unsupported.getArtifactForParticipant("user-1", "campus-festival"), NotFoundException);

  const missingFlag = new ChallengeArtifactService({
    async findArtifactForUser() {
      return null;
    },
    async findFlagForArtifact() {
      return null;
    },
    async createArtifactForUser() {
      throw new Error("not used");
    },
    async createClaimTokenForUser() {
      throw new Error("not used");
    },
  }, {
    async readArtifact() {
      throw new Error("not used");
    },
  }, {
    async writeArtifact() {
      throw new Error("not used");
    },
  }, {
    decryptFlagForInternalApi() {
      throw new Error("not used");
    },
    generateOpaqueToken() {
      throw new Error("not used");
    },
    claimTokenHash() {
      throw new Error("not used");
    },
  });
  await assert.rejects(() => missingFlag.getArtifactForParticipant("user-1", "it-center-status"), NotFoundException);

  const unreadable = new ChallengeArtifactService(createStore({ artifactPath: "02/cache/file-1.jpg", artifactHash: "b".repeat(64) }), {
    async readArtifact() {
      throw new Error("missing file");
    },
  }, {
    async writeArtifact() {
      throw new Error("not used");
    },
  }, {
    decryptFlagForInternalApi() {
      throw new Error("not used");
    },
    generateOpaqueToken() {
      throw new Error("not used");
    },
    claimTokenHash() {
      throw new Error("not used");
    },
  });
  await assert.rejects(() => unreadable.getArtifactForParticipant("user-1", "it-center-status"), NotFoundException);
});

test("ChallengeArtifactService records sanitized artifact failure audits", async () => {
  const auditEvents: string[] = [];
  const missingFlag = new ChallengeArtifactService({
    async findArtifactForUser() {
      return null;
    },
    async findFlagForArtifact() {
      return null;
    },
    async createArtifactForUser() {
      throw new Error("not used");
    },
    async createClaimTokenForUser() {
      throw new Error("not used");
    },
  }, {
    async readArtifact() {
      throw new Error("not used");
    },
  }, {
    async writeArtifact() {
      throw new Error("not used");
    },
  }, {
    decryptFlagForInternalApi() {
      throw new Error("not used");
    },
    generateOpaqueToken() {
      throw new Error("not used");
    },
    claimTokenHash() {
      throw new Error("not used");
    },
  }, {
    now: () => new Date("2026-05-10T00:00:00.000Z"),
  }, {
    async recordArtifactGenerationFailure(input) {
      auditEvents.push(JSON.stringify(input));
    },
  });

  await assert.rejects(() => missingFlag.getArtifactForParticipant("user-1", "it-center-status"), NotFoundException);

  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.includes('"userId":"user-1"'), true);
  assert.equal(auditEvents[0]?.includes('"challengeId":"02"'), true);
  assert.equal(auditEvents[0]?.includes('"reason":"missing_flag"'), true);
  assert.equal(auditEvents[0]?.includes("KDUCTF{"), false);
  assert.equal(auditEvents[0]?.includes("artifactPath"), false);
});
