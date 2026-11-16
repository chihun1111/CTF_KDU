import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, RequestMethod } from "@nestjs/common";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { AdminReadController } from "./admin-read.controller.js";

const GUARDS_METADATA = "__guards__";
const METHOD_METADATA = "method";
const PATH_METADATA = "path";
const adminRequest = { authSession: { sessionId: "session-1", userId: "admin-1", role: "admin" as const } };
const participantUserId = "11111111-1111-4111-8111-111111111111";
const auditRecorder = {
  async recordAdminRead() {
    return undefined;
  },
};

test("AdminReadController exposes guarded participants with pseudonymous references only", async () => {
  const auditEvents: string[] = [];
  const controller = new AdminReadController({
    async listParticipants() {
      return {
        items: [
          {
            participantRef: "participant:aaaaaaaaaaaa",
            role: "participant",
            registeredAt: "2026-05-10T00:00:00.000Z",
            lastSeenAt: null,
            online: false,
            latestCorrectCount: 0,
            requiredCount: 8,
            cleared: false,
            clearedAt: null,
            finalSubmissionCount: 0,
          },
        ],
        page: 1,
        pageSize: 50,
        totalCount: 1,
      };
    },
    async listSubmissions() {
      throw new Error("not used");
    },
    async listClears() {
      throw new Error("not used");
    },
    async listChallengeStatus() {
      throw new Error("not used");
    },
    async getSystemHealth() {
      throw new Error("not used");
    },
    async listAuditLogs() {
      throw new Error("not used");
    },
  }, {
    async recordAdminRead(input) {
      auditEvents.push(JSON.stringify(input));
    },
  });
  const headers = new Map<string, string>();

  const body = await controller.participants(
    adminRequest,
    { setHeader: (name, value) => headers.set(name, value) },
  );
  const serialized = JSON.stringify(body);

  assert.equal(body.items[0]?.participantRef, "participant:aaaaaaaaaaaa");
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(serialized.includes("submittedFlag"), false);
  assert.equal(serialized.includes("2622022"), false);
  assert.equal(serialized.includes('"userId"'), false);
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminReadController), "api/admin");
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminReadController.prototype.participants), "participants");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, AdminReadController.prototype.participants), RequestMethod.GET);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AdminReadController.prototype.participants), [
    SessionAuthGuard,
    AdminRoleGuard,
  ]);
  assert.equal(auditEvents[0]?.includes('"adminUserId":"admin-1"'), true);
  assert.equal(auditEvents[0]?.includes('"resource":"participants"'), true);
  assert.equal(auditEvents[0]?.includes("ctf_session"), false);
});

test("admin collection pagination validates page numbers and records the viewed page", async () => {
  const calls: unknown[] = [];
  const pageReader = async (page = 1, pageSize = 50) => {
    calls.push({ page, pageSize });
    return { items: [], page, pageSize, totalCount: 120 };
  };
  const controller = new AdminReadController({
    listParticipants: pageReader,
    listSubmissions: pageReader,
    listClears: pageReader,
    listAuditLogs: pageReader,
    async listChallengeStatus() { return []; },
    async getSystemHealth() { throw new Error("unused"); },
  }, { async recordAdminRead(input) { calls.push({ auditPage: input.page }); } });
  const writer = { setHeader() {} };
  for (const method of ["participants", "submissions", "clears", "auditLogs"] as const) {
    assert.equal((await controller[method](adminRequest, writer, "2")).page, 2);
    for (const invalid of ["0", "-1", "1.5", "1e2", "100001", "", "2 OR 1=1"]) {
      await assert.rejects(() => controller[method](adminRequest, writer, invalid), BadRequestException);
    }
  }
  assert.equal(calls.length, 8);
  assert.deepEqual(calls.slice(0, 2), [{ auditPage: 2 }, { page: 2, pageSize: 50 }]);
});

test("AdminReadController exposes guarded submissions and clears without flag or session material", async () => {
  const controller = new AdminReadController({
    async listParticipants() {
      throw new Error("not used");
    },
    async listSubmissions() {
      return {
        items: [
          {
            id: "submission-1",
            participantRef: "participant:aaaaaaaaaaaa",
            correctCount: 1,
            requiredCount: 8,
            isClear: false,
            resultsByFlagId: { "FLAG-01": { correct: true } },
            createdAt: "2026-05-10T00:00:00.000Z",
          },
        ],
        page: 1,
        pageSize: 50,
        totalCount: 1,
      };
    },
    async listClears() {
      return {
        items: [
          {
            participantRef: "participant:aaaaaaaaaaaa",
            clearedAt: "2026-05-10T00:01:00.000Z",
          },
        ],
        page: 1,
        pageSize: 50,
        totalCount: 1,
      };
    },
    async listChallengeStatus() {
      throw new Error("not used");
    },
    async getSystemHealth() {
      throw new Error("not used");
    },
    async listAuditLogs() {
      throw new Error("not used");
    },
  }, auditRecorder);
  const headers = new Map<string, string>();

  const submissions = await controller.submissions(adminRequest, { setHeader: (name, value) => headers.set(name, value) });
  const clears = await controller.clears(adminRequest, { setHeader: (name, value) => headers.set(name, value) });
  const serialized = JSON.stringify({ submissions, clears });

  assert.equal(submissions.items[0]?.resultsByFlagId["FLAG-01"]?.correct, true);
  assert.equal(submissions.items[0]?.participantRef, "participant:aaaaaaaaaaaa");
  assert.equal(clears.items[0]?.participantRef, "participant:aaaaaaaaaaaa");
  assert.equal("clearReceiptCode" in (clears.items[0] ?? {}), false);
  assert.equal(serialized.includes("KDUCTF{"), false);
  assert.equal(serialized.includes("sessionHash"), false);
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminReadController.prototype.submissions), "submissions");
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminReadController.prototype.clears), "clears");
});

test("AdminReadController exposes challenge status, system health, and aggregate audit logs", async () => {
  const auditEvents: Array<{ resource: string }> = [];
  const controller = new AdminReadController({
    async listParticipants() {
      throw new Error("not used");
    },
    async listSubmissions() {
      throw new Error("not used");
    },
    async listClears() {
      throw new Error("not used");
    },
    async listChallengeStatus() {
      return [
        {
          challengeId: "01",
          flagId: "FLAG-01",
          title: "캠퍼스 축제 안내",
          servicePath: "/challenges/01/",
          health: "ok",
          visible: true,
          solvedCount: 0,
          lastHealthcheckAt: "2026-05-10T00:00:00.000Z",
        },
      ];
    },
    async getSystemHealth() {
      return {
        backend: { status: "ok", checkedAt: "2026-05-10T00:00:00.000Z" },
        postgres: { status: "ok", latencyMs: 0 },
        redis: { status: "ok", latencyMs: 0 },
        challengeServices: [{ challengeId: "01", status: "ok", latencyMs: 0 }],
      };
    },
    async listAuditLogs(_page?: number, _pageSize?: number, userId?: string) {
      assert.equal(userId, undefined);
      return {
        items: [
          {
            id: "audit-1",
            actorRef: "participant:aaaaaaaaaaaa",
            action: "FINAL_SUBMIT",
            metadata: { correctCount: 1, requiredCount: 8 },
            createdAt: "2026-05-10T00:00:00.000Z",
          },
        ],
        page: 1,
        pageSize: 50,
        totalCount: 1,
      };
    },
  }, {
    async recordAdminRead(input) {
      auditEvents.push({ resource: input.resource });
    },
  });
  const headers = new Map<string, string>();
  const writer = { setHeader: (name: string, value: string) => headers.set(name, value) };

  const challengeStatus = await controller.challengeStatus(adminRequest, writer);
  const systemHealth = await controller.systemHealth(adminRequest, writer);
  const auditLogs = await controller.auditLogs(adminRequest, writer);
  const serialized = JSON.stringify({ challengeStatus, systemHealth, auditLogs });

  assert.equal(challengeStatus[0]?.flagId, "FLAG-01");
  assert.equal(systemHealth.backend.status, "ok");
  assert.equal(auditLogs.items[0]?.metadata.correctCount, 1);
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(serialized.includes("KDUCTF{"), false);
  assert.equal(serialized.includes("sessionHash"), false);
  assert.equal(serialized.includes("Cookie"), false);
  assert.equal(serialized.includes(participantUserId), false);
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminReadController.prototype.challengeStatus), "challenges/status");
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminReadController.prototype.systemHealth), "system/health");
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminReadController.prototype.auditLogs), "audit-logs");
  assert.deepEqual(auditEvents.at(-1), { resource: "audit-logs" });
});
