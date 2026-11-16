import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { SessionAuthGuard, type AuthenticatedRequest } from "../auth/session-auth.guard.js";
import { ChallengesController } from "./challenges.controller.js";

const GUARDS_METADATA = "__guards__";
const METHOD_METADATA = "method";
const PATH_METADATA = "path";

test("ChallengesController exposes GET /api/services behind the session guard", async () => {
  const events: string[] = [];
  const controller = new ChallengesController({
    async listForParticipant(userId) {
      events.push(`list:${userId}`);
      return {
        services: [
          {
            id: "01",
            slug: "campus-festival",
            title: "캠퍼스 축제 안내",
            department: "축제기획단",
            updatedAt: "2026-11-16",
            summary: "올해 미니 축제 일정과 부스 안내를 확인합니다.",
            actionLabel: "문제 풀기",
            serviceHref: "/challenges/01/",
            difficulty: "입문",
            difficultyLevel: 1,
            category: "Web / Misc",
          },
        ],
      };
    },
  });

  const body = await controller.list({
    authSession: {
      sessionId: "session-1",
      userId: "user-1",
      role: "participant",
    },
  } as AuthenticatedRequest);

  assert.deepEqual(events, ["list:user-1"]);
  assert.equal(body.services[0]?.serviceHref, "/challenges/01/");
  assert.equal(body.services[0]?.difficulty, "입문");
  assert.equal(body.services[0]?.difficultyLevel, 1);
  assert.equal(body.services[0]?.category, "Web / Misc");
  assert.equal("guideHref" in (body.services[0] ?? {}), false);
  assert.equal("servicePath" in (body.services[0] ?? {}), false);
  assert.equal(JSON.stringify(body).includes("/services/"), false);
  assert.equal("artifactHref" in (body.services[0] ?? {}), false);
  assert.equal(JSON.stringify(body).includes("user-1"), false);
  assert.equal(JSON.stringify(body).includes("session-1"), false);
  assert.equal(JSON.stringify(body).includes("/internal/"), false);
  assert.equal(JSON.stringify(body).includes("KDUCTF" + "{"), false);
  assert.equal(JSON.stringify(body).includes("FLAG-"), false);
  assert.equal(JSON.stringify(body).includes("progress"), false);

  assert.equal(Reflect.getMetadata(PATH_METADATA, ChallengesController), "api/services");
  assert.equal(Reflect.getMetadata(PATH_METADATA, ChallengesController.prototype.list), "/");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, ChallengesController.prototype.list), RequestMethod.GET);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, ChallengesController.prototype.list), [SessionAuthGuard]);
});
