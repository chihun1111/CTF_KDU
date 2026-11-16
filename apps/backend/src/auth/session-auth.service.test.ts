import assert from "node:assert/strict";
import test from "node:test";
import { SessionAuthService, type SessionAuthStore } from "./session-auth.service.js";

function createStore(events: string[], session: Awaited<ReturnType<SessionAuthStore["findActiveSessionByHash"]>>): SessionAuthStore {
  return {
    async findActiveSessionByHash(sessionHash, now) {
      events.push(`find:${sessionHash}:${now instanceof Date}`);
      return session;
    },
    async touchSession(sessionId, now) {
      events.push(`touch:${sessionId}:${now instanceof Date}`);
    },
  };
}

test("SessionAuthService authenticates ctf_session cookie by hashed token and touches last seen", async () => {
  const events: string[] = [];
  const service = new SessionAuthService(
    createStore(events, {
      sessionId: "session-1",
      userId: "user-1",
      role: "participant",
    }),
    {
      sessionHash: (token) => `hash:${token}`,
    },
  );

  const result = await service.authenticateCookieHeader("foo=bar; ctf_session=opaque-token; theme=light");

  assert.deepEqual(result, {
    sessionId: "session-1",
    userId: "user-1",
    role: "participant",
  });
  assert.deepEqual(events, ["find:hash:opaque-token:true", "touch:session-1:true"]);
});

test("SessionAuthService returns null for missing or unknown session cookie", async () => {
  const events: string[] = [];
  const service = new SessionAuthService(createStore(events, null), {
    sessionHash: (token) => `hash:${token}`,
  });

  assert.equal(await service.authenticateCookieHeader(undefined), null);
  assert.equal(await service.authenticateCookieHeader("foo=bar"), null);
  assert.equal(await service.authenticateCookieHeader("ctf_session=%broken"), null);
  assert.equal(await service.authenticateCookieHeader("ctf_session=one; ctf_session=two"), null);
  assert.equal(await service.authenticateCookieHeader("ctf_session=unknown-token"), null);
  assert.deepEqual(events, ["find:hash:unknown-token:true"]);
});
