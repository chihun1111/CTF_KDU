import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { AdminOperationsController } from "./admin-operations.controller.js";

const GUARDS_METADATA = "__guards__";
const METHOD_METADATA = "method";
const PATH_METADATA = "path";
const adminRequest = { authSession: { sessionId: "session-1", userId: "admin-1", role: "admin" as const } };
const auditRecorder = {
  async recordAdminRead() {
    return undefined;
  },
  async recordOnlineCountRead() {
    return undefined;
  },
};

test("AdminOperationsController exposes guarded online-count without participant identifiers", async () => {
  const auditEvents: string[] = [];
  const controller = new AdminOperationsController({
    async getOnlineCount() {
      return {
        onlineSessionCount: 3,
        source: "redis_presence",
        windowSeconds: 90,
        generatedAt: "2026-05-10T00:00:00.000Z",
      };
    },
  }, {
    async getSummary() {
      throw new Error("not used");
    },
    async listParticipants() {
      throw new Error("not used");
    },
    async listSubmissions() {
      throw new Error("not used");
    },
    async listClears() {
      throw new Error("not used");
    },
  }, {
    async recordAdminRead(input) {
      auditEvents.push(JSON.stringify(input));
    },
    async recordOnlineCountRead(input) {
      auditEvents.push(JSON.stringify(input));
    },
  });
  const headers = new Map<string, string>();

  const body = await controller.onlineCount(adminRequest, { setHeader: (name, value) => headers.set(name, value) });

  assert.deepEqual(body, {
    onlineSessionCount: 3,
    source: "redis_presence",
    windowSeconds: 90,
    generatedAt: "2026-05-10T00:00:00.000Z",
  });
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(JSON.stringify(body).includes("user-1"), false);
  assert.equal(JSON.stringify(body).includes("session-1"), false);
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminOperationsController), "api/admin/operations");
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminOperationsController.prototype.onlineCount), "online-count");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, AdminOperationsController.prototype.onlineCount), RequestMethod.GET);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AdminOperationsController.prototype.onlineCount), [
    SessionAuthGuard,
    AdminRoleGuard,
  ]);
  assert.equal(auditEvents[0]?.includes('"adminUserId":"admin-1"'), true);
  assert.equal(auditEvents[0]?.includes('"onlineSessionCount":3'), true);
  assert.equal(auditEvents[0]?.includes('"source":"redis_presence"'), true);
  assert.equal(auditEvents[0]?.includes('"windowSeconds":90'), true);
  assert.equal(auditEvents[0]?.includes('"generatedAt":"2026-05-10T00:00:00.000Z"'), true);
  assert.equal(auditEvents[0]?.includes("ctf_session"), false);
});

test("AdminOperationsController exposes guarded summary without sensitive fields", async () => {
  const controller = new AdminOperationsController({
    async getOnlineCount() {
      throw new Error("not used");
    },
  }, {
    async getSummary() {
      return {
        onlineSessionCount: 3,
        registeredUserCount: 12,
        submittedUserCount: 7,
        clearedUserCount: 2,
        finalSubmissionCount: 19,
        systemHealth: {
          backend: "ok",
          postgres: "ok",
          redis: "ok",
          challengeServices: {
            ok: 8,
            degraded: 0,
            down: 0,
          },
        },
        generatedAt: "2026-05-10T00:00:00.000Z",
      };
    },
    async listParticipants() {
      throw new Error("not used");
    },
    async listSubmissions() {
      throw new Error("not used");
    },
    async listClears() {
      throw new Error("not used");
    },
  }, auditRecorder);
  const headers = new Map<string, string>();

  const body = await controller.summary(adminRequest, { setHeader: (name, value) => headers.set(name, value) });
  const serialized = JSON.stringify(body);

  assert.equal(body.registeredUserCount, 12);
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(serialized.includes("studentId"), false);
  assert.equal(serialized.includes("sessionHash"), false);
  assert.equal(serialized.includes("submittedFlag"), false);
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminOperationsController.prototype.summary), "summary");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, AdminOperationsController.prototype.summary), RequestMethod.GET);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AdminOperationsController.prototype.summary), [
    SessionAuthGuard,
    AdminRoleGuard,
  ]);
});
