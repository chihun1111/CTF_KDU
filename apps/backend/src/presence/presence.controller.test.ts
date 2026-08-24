import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { SessionAuthGuard, type AuthenticatedRequest } from "../auth/session-auth.guard.js";
import { PresenceController } from "./presence.controller.js";

const GUARDS_METADATA = "__guards__";
const METHOD_METADATA = "method";
const PATH_METADATA = "path";

test("PresenceController exposes POST /api/presence/heartbeat behind the session guard", async () => {
  const events: string[] = [];
  const controller = new PresenceController({
    async heartbeat(session) {
      events.push(`heartbeat:${session.sessionId}`);
      return { ok: true };
    },
  });

  const body = await controller.heartbeat({
    authSession: {
      sessionId: "session-1",
      userId: "user-1",
      role: "participant",
    },
  } as AuthenticatedRequest);

  assert.deepEqual(body, { ok: true });
  assert.deepEqual(events, ["heartbeat:session-1"]);
  assert.equal(JSON.stringify(body).includes("session-1"), false);
  assert.equal(JSON.stringify(body).includes("user-1"), false);

  assert.equal(Reflect.getMetadata(PATH_METADATA, PresenceController), "api/presence");
  assert.equal(Reflect.getMetadata(PATH_METADATA, PresenceController.prototype.heartbeat), "heartbeat");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, PresenceController.prototype.heartbeat), RequestMethod.POST);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PresenceController.prototype.heartbeat), [SessionAuthGuard]);
});
