import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { HintsController } from "./hints.controller.js";

const GUARDS_METADATA = "__guards__";
const METHOD_METADATA = "method";
const PATH_METADATA = "path";
const adminRequest = { authSession: { sessionId: "session-1", userId: "admin-1", role: "admin" as const } };

test("HintsController exposes guarded public hints with no-store cache headers", async () => {
  const controller = new HintsController({
    async getPublicHints() {
      return {
        generatedAt: "2026-05-10T00:00:00.000Z",
        challenges: [],
      };
    },
    async getAdminHints() {
      throw new Error("not used");
    },
    async releaseHintStage() {
      throw new Error("not used");
    },
  }, {
    async recordAdminRead() {
      throw new Error("not used");
    },
  });
  const headers = new Map<string, string>();

  const body = await controller.publicHints({ setHeader: (name, value) => headers.set(name, value) });

  assert.deepEqual(body, { generatedAt: "2026-05-10T00:00:00.000Z", challenges: [] });
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(Reflect.getMetadata(PATH_METADATA, HintsController.prototype.publicHints), "api/hints");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, HintsController.prototype.publicHints), RequestMethod.GET);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, HintsController.prototype.publicHints), [SessionAuthGuard]);
});

test("HintsController exposes guarded admin hint reads and releases", async () => {
  const calls: string[] = [];
  const auditEvents: string[] = [];
  const controller = new HintsController({
    async getPublicHints() {
      throw new Error("not used");
    },
    async getAdminHints() {
      calls.push("read");
      return {
        generatedAt: "2026-05-10T00:00:00.000Z",
        totalStageCount: 24,
        releasedStageCount: 0,
        challenges: [],
      };
    },
    async releaseHintStage(adminUserId, stageId) {
      calls.push(`${adminUserId}:${stageId}`);
      return {
        stageId,
        released: true,
        releasedAt: "2026-05-10T00:00:00.000Z",
      };
    },
  }, {
    async recordAdminRead(input) {
      auditEvents.push(JSON.stringify(input));
    },
  });
  const headers = new Map<string, string>();
  const writer = { setHeader: (name: string, value: string) => headers.set(name, value) };

  const adminHints = await controller.adminHints(adminRequest, writer);
  const release = await controller.releaseHintStage(adminRequest, { stageId: "01:first" }, writer);

  assert.equal(adminHints.totalStageCount, 24);
  assert.equal(release.stageId, "01:first");
  assert.deepEqual(calls, ["read", "admin-1:01:first"]);
  assert.equal(auditEvents[0]?.includes('"adminUserId":"admin-1"'), true);
  assert.equal(auditEvents[0]?.includes('"resource":"hints"'), true);
  assert.equal(auditEvents[0]?.includes("ctf_session"), false);
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(Reflect.getMetadata(PATH_METADATA, HintsController.prototype.adminHints), "api/admin/hints");
  assert.equal(Reflect.getMetadata(PATH_METADATA, HintsController.prototype.releaseHintStage), "api/admin/hints/release");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, HintsController.prototype.adminHints), RequestMethod.GET);
  assert.equal(Reflect.getMetadata(METHOD_METADATA, HintsController.prototype.releaseHintStage), RequestMethod.POST);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, HintsController.prototype.adminHints), [
    SessionAuthGuard,
    AdminRoleGuard,
  ]);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, HintsController.prototype.releaseHintStage), [
    SessionAuthGuard,
    AdminRoleGuard,
  ]);
});
