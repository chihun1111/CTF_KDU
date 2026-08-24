import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { SessionAuthGuard, type AuthenticatedRequest } from "../auth/session-auth.guard.js";
import { FinalSubmitController } from "./final-submit.controller.js";
import { FINAL_FLAG_IDS } from "./final-submit.service.js";

const GUARDS_METADATA = "__guards__";
const METHOD_METADATA = "method";
const PATH_METADATA = "path";

test("FinalSubmitController exposes POST /api/final-submit behind the session guard", async () => {
  const headers: Record<string, string> = {};
  const controller = new FinalSubmitController({
    async submit(userId, input) {
      assert.equal(userId, "user-1");
      assert.equal(input.flagsByFlagId?.["FLAG-01"], "KDUCTF" + "{x}");
      return {
        setCookie: "ctf_clear_once=opaque; HttpOnly",
        body: {
          cleared: true,
          correctCount: 8,
          requiredCount: 8,
          resultsByFlagId: Object.fromEntries(FINAL_FLAG_IDS.map((flagId) => [flagId, { correct: true }])) as Record<
            (typeof FINAL_FLAG_IDS)[number],
            { correct: boolean }
          >,
          clearRedirectTo: "/clear",
          message: "8개 플래그가 모두 맞았습니다.",
        },
      };
    },
  });

  const body = await controller.submit(
    { authSession: { sessionId: "session-1", userId: "user-1", role: "participant" } } as AuthenticatedRequest,
    { flagsByFlagId: { "FLAG-01": "KDUCTF" + "{x}" } },
    { setHeader: (name, value) => { headers[name] = value; } },
  );

  assert.equal(headers["Set-Cookie"], "ctf_clear_once=opaque; HttpOnly");
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(JSON.stringify(body).includes("opaque"), false);
  assert.equal(JSON.stringify(body).includes("user-1"), false);
  assert.equal(Reflect.getMetadata(PATH_METADATA, FinalSubmitController), "api");
  assert.equal(Reflect.getMetadata(PATH_METADATA, FinalSubmitController.prototype.submit), "final-submit");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, FinalSubmitController.prototype.submit), RequestMethod.POST);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, FinalSubmitController.prototype.submit), [SessionAuthGuard]);
});
