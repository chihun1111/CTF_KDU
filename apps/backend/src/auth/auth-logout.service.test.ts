import assert from "node:assert/strict";
import test from "node:test";
import { AuthLogoutService, type LogoutStore } from "./auth-logout.service.js";

function createStore(events: string[]): LogoutStore {
  return {
    async revokeSession(sessionId, now) {
      events.push(`revoke:${sessionId}:${now instanceof Date}`);
    },
  };
}

test("AuthLogoutService revokes the current session and expires the cookie without returning token data", async () => {
  const events: string[] = [];
  const service = new AuthLogoutService(
    {
      authenticateCookieHeader: async (cookieHeader) => {
        events.push(`auth:${cookieHeader}`);
        return { sessionId: "session-1", userId: "user-1", role: "participant" };
      },
    },
    createStore(events),
    {
      buildExpiredSessionCookie: () => "ctf_session=; HttpOnly; Max-Age=0",
    },
  );

  const result = await service.logout("ctf_session=opaque-token");

  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.setCookie, "ctf_session=; HttpOnly; Max-Age=0");
  assert.deepEqual(events, ["auth:ctf_session=opaque-token", "revoke:session-1:true"]);
  assert.equal(JSON.stringify(result).includes("opaque-token"), false);
});

test("AuthLogoutService expires the cookie even when no active session is found", async () => {
  const events: string[] = [];
  const service = new AuthLogoutService(
    {
      authenticateCookieHeader: async (cookieHeader) => {
        events.push(`auth:${cookieHeader ?? "missing"}`);
        return null;
      },
    },
    createStore(events),
    {
      buildExpiredSessionCookie: () => "ctf_session=; HttpOnly; Max-Age=0",
    },
  );

  const result = await service.logout(undefined);

  assert.deepEqual(result, {
    body: { ok: true },
    setCookie: "ctf_session=; HttpOnly; Max-Age=0",
  });
  assert.deepEqual(events, ["auth:missing"]);
});
