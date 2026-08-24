import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { SessionAuthGuard, type AuthenticatedRequest } from "../auth/session-auth.guard.js";
import { ClearCertificateController } from "./clear-certificate.controller.js";

const GUARDS_METADATA = "__guards__";
const METHOD_METADATA = "method";
const PATH_METADATA = "path";

test("ClearCertificateController exposes POST /api/clear-certificate/consume behind the session guard", async () => {
  const headers: Record<string, string> = {};
  const events: string[] = [];
  const controller = new ClearCertificateController({
    async consume(userId, cookieHeader) {
      events.push(`${userId}:${cookieHeader}`);
      return {
        setCookie: "ctf_clear_once=; Max-Age=0",
        body: {
          studentId: "2622022",
          clearedAt: "2026-05-07T12:00:00.000Z",
          clearReceiptCode: "CLR-8F3K2A",
          message: "8개 플래그를 모두 제출했습니다.",
        },
      };
    },
  });

  const body = await controller.consume(
    { authSession: { sessionId: "session-1", userId: "user-1", role: "participant" } } as AuthenticatedRequest,
    "ctf_session=session-token; ctf_clear_once=clear-token",
    { setHeader: (name, value) => { headers[name] = value; } },
  );

  assert.deepEqual(events, ["user-1:ctf_session=session-token; ctf_clear_once=clear-token"]);
  assert.equal(body.studentId, "2622022");
  assert.equal(headers["Set-Cookie"], "ctf_clear_once=; Max-Age=0");
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers.Pragma, "no-cache");
  assert.equal(JSON.stringify(body).includes("clear-token"), false);
  assert.equal(JSON.stringify(body).includes("session-1"), false);

  assert.equal(Reflect.getMetadata(PATH_METADATA, ClearCertificateController), "api/clear-certificate");
  assert.equal(Reflect.getMetadata(PATH_METADATA, ClearCertificateController.prototype.consume), "consume");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, ClearCertificateController.prototype.consume), RequestMethod.POST);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, ClearCertificateController.prototype.consume), [SessionAuthGuard]);
});
