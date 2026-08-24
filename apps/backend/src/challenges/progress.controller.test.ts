import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { SessionAuthGuard, type AuthenticatedRequest } from "../auth/session-auth.guard.js";
import { ProgressController } from "./progress.controller.js";

const GUARDS_METADATA = "__guards__";
const METHOD_METADATA = "method";
const PATH_METADATA = "path";

test("ProgressController exposes GET /api/progress behind the session guard", async () => {
  const events: string[] = [];
  const controller = new ProgressController({
    async getProgressForParticipant(userId) {
      events.push(`progress:${userId}`);
      return {
        correctCount: 2,
        requiredCount: 8,
        cleared: false,
        resultsByFlagId: {
          "FLAG-01": { correct: true },
          "FLAG-02": { correct: true },
        },
      };
    },
  });

  const body = await controller.get({
    authSession: {
      sessionId: "session-1",
      userId: "user-1",
      role: "participant",
    },
  } as AuthenticatedRequest);

  assert.deepEqual(events, ["progress:user-1"]);
  assert.deepEqual(body, {
    correctCount: 2,
    requiredCount: 8,
    cleared: false,
    resultsByFlagId: {
      "FLAG-01": { correct: true },
      "FLAG-02": { correct: true },
    },
  });
  assert.equal(JSON.stringify(body).includes("user-1"), false);
  assert.equal(JSON.stringify(body).includes("session-1"), false);
  assert.equal(JSON.stringify(body).includes("KDUCTF" + "{"), false);
  assert.equal(JSON.stringify(body).includes("/internal/"), false);

  assert.equal(Reflect.getMetadata(PATH_METADATA, ProgressController), "api/progress");
  assert.equal(Reflect.getMetadata(PATH_METADATA, ProgressController.prototype.get), "/");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, ProgressController.prototype.get), RequestMethod.GET);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, ProgressController.prototype.get), [SessionAuthGuard]);
});
