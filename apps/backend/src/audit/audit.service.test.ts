import assert from "node:assert/strict";
import test from "node:test";
import { AuditService, type AuditStore } from "./audit.service.js";

test("AuditService records admin read events with fixed resource-specific action names and sanitized metadata", async () => {
  const events: string[] = [];
  const store: AuditStore = {
    async createAuditLog(input) {
      events.push(JSON.stringify(input));
    },
  };
  const service = new AuditService(store);

  await service.recordAdminRead({
    adminUserId: "admin-1",
    resource: "participants",
    page: 1,
    pageSize: 50,
    unsafeMetadata: {
      cookie: "ctf_session=opaque-token",
      requestBody: { flag: "KDUCTF" + "{secret}" },
      claimToken: "opaque-claim-token-with-at-least-32-bytes",
      studentId: "2622022",
    },
  });

  assert.equal(events.length, 1);
  const [event] = events;
  assert(event);
  assert.equal(event.includes('"action":"ADMIN_PARTICIPANTS_VIEWED"'), true);
  assert.equal(event.includes('"userId":"admin-1"'), true);
  assert.equal(event.includes('"resource":"participants"'), true);
  assert.equal(event.includes('"page":1'), true);
  assert.equal(event.includes('"pageSize":50'), true);
  assert.equal(event.includes('"targetUserId"'), false);
  assert.equal(event.includes("ctf_session=opaque-token"), false);
  assert.equal(event.includes("KDUCTF{"), false);
  assert.equal(event.includes("opaque-claim-token"), false);
  assert.equal(event.includes("2622022"), false);
});

test("AuditService marks audit events as required operations logs", async () => {
  const events: Array<Parameters<AuditStore["createAuditLog"]>[0]> = [];
  const store: AuditStore = {
    async createAuditLog(input) {
      events.push(input);
    },
  };
  const service = new AuditService(store);

  await service.recordClaimVerifyFailure({
    userId: "user-1",
    challengeId: "08",
    flagId: "FLAG-08",
    reason: "not_found",
  });

  assert.equal(events[0]?.metadata.logCategory, "required_operations");
});

test("AuditService records final submit audits with aggregate-only participant metadata", async () => {
  const events: Array<Parameters<AuditStore["createAuditLog"]>[0]> = [];
  const store: AuditStore = {
    async createAuditLog(input) {
      events.push(input);
    },
  };
  const service = new AuditService(store);

  await service.recordFinalSubmit({
    userId: "user-1",
    correctCount: 1,
    requiredCount: 8,
    submittedCount: 1,
    cleared: false,
  });

  assert.deepEqual(events[0], {
    userId: "user-1",
    action: "FINAL_SUBMIT",
    metadata: {
      logCategory: "required_operations",
      correctCount: 1,
      requiredCount: 8,
      submittedCount: 1,
      cleared: false,
    },
  });
  assert.equal(JSON.stringify(events).includes("KDUCTF{"), false);
  assert.equal(JSON.stringify(events).includes("2622022"), false);
  assert.equal(JSON.stringify(events).includes("ctf_session"), false);
});

test("AuditService records artifact generation failures without plaintext artifact material", async () => {
  const events: Array<Parameters<AuditStore["createAuditLog"]>[0]> = [];
  const store: AuditStore = {
    async createAuditLog(input) {
      events.push(input);
    },
  };
  const service = new AuditService(store);

  await service.recordArtifactGenerationFailure({
    userId: "user-1",
    challengeId: "02",
    reason: "missing_flag",
  });

  assert.deepEqual(events[0], {
    userId: "user-1",
    action: "ARTIFACT_GENERATION_FAILED",
    metadata: {
      logCategory: "required_operations",
      challengeId: "02",
      reason: "missing_flag",
    },
  });
  assert.equal(JSON.stringify(events).includes("KDUCTF{"), false);
  assert.equal(JSON.stringify(events).includes("artifactPath"), false);
});

test("AuditService records online count audits with aggregate-only metadata", async () => {
  const events: Array<Parameters<AuditStore["createAuditLog"]>[0]> = [];
  const store: AuditStore = {
    async createAuditLog(input) {
      events.push(input);
    },
  };
  const service = new AuditService(store);

  await service.recordOnlineCountRead({
    adminUserId: "admin-1",
    onlineSessionCount: 7,
    source: "redis_presence",
    windowSeconds: 90,
    generatedAt: "2026-05-10T00:00:00.000Z",
    unsafeMetadata: {
      redisKey: "presence:session:session-1",
      cookie: "ctf_session=opaque-token",
      userAgent: "Mozilla/5.0",
      studentId: "2622022",
      sessionToken: "opaque-token",
    },
  });

  assert.deepEqual(events[0], {
    userId: "admin-1",
    action: "ADMIN_ONLINE_COUNT_VIEWED",
    metadata: {
      logCategory: "required_operations",
      resource: "operations.online-count",
      onlineSessionCount: 7,
      source: "redis_presence",
      windowSeconds: 90,
      generatedAt: "2026-05-10T00:00:00.000Z",
    },
  });
  assert.equal(JSON.stringify(events).includes("presence:session:"), false);
  assert.equal(JSON.stringify(events).includes("ctf_session"), false);
  assert.equal(JSON.stringify(events).includes("Mozilla/5.0"), false);
  assert.equal(JSON.stringify(events).includes("2622022"), false);
  assert.equal(JSON.stringify(events).includes("opaque-token"), false);
});

test("AuditService records admin hint releases with stage metadata only", async () => {
  const events: Array<Parameters<AuditStore["createAuditLog"]>[0]> = [];
  const store: AuditStore = {
    async createAuditLog(input) {
      events.push(input);
    },
  };
  const service = new AuditService(store);

  await service.recordAdminHintStageRelease({
    adminUserId: "admin-1",
    stageId: "07:second",
    challengeNumber: "07",
    stageKey: "second",
    unsafeMetadata: {
      flag: "KDUCTF" + "{secret}",
      cookie: "ctf_session=opaque-token",
      studentId: "2622022",
    },
  });

  assert.deepEqual(events[0], {
    userId: "admin-1",
    action: "ADMIN_HINT_STAGE_RELEASED",
    metadata: {
      logCategory: "required_operations",
      resource: "hints",
      stageId: "07:second",
      challengeNumber: "07",
      stageKey: "second",
    },
  });
  assert.equal(JSON.stringify(events).includes("KDUCTF{"), false);
  assert.equal(JSON.stringify(events).includes("ctf_session"), false);
  assert.equal(JSON.stringify(events).includes("2622022"), false);
});
