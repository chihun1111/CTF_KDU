import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedSession } from "./session-auth.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";

type GuardTestRequest = Record<string, unknown> & {
  headers?: { cookie?: string };
  authSession?: AuthenticatedSession;
};

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return request;
        },
      };
    },
  } as ExecutionContext;
}

test("SessionAuthGuard authenticates only the Cookie header and attaches the server session", async () => {
  const events: string[] = [];
  const request: GuardTestRequest = {
    headers: {
      cookie: "ctf_session=opaque-token",
    },
    query: {
      userId: "attacker-user",
      session: "attacker-session",
    },
    body: {
      studentId: "9999999",
    },
  };
  const guard = new SessionAuthGuard({
    async authenticateCookieHeader(cookieHeader) {
      events.push(`auth:${cookieHeader}`);
      return { sessionId: "session-1", userId: "user-1", role: "participant" };
    },
  });

  assert.equal(await guard.canActivate(createContext(request)), true);
  assert.deepEqual(request.authSession, {
    sessionId: "session-1",
    userId: "user-1",
    role: "participant",
  });
  assert.deepEqual(events, ["auth:ctf_session=opaque-token"]);
});

test("SessionAuthGuard rejects missing or inactive sessions with a generic 401", async () => {
  const guard = new SessionAuthGuard({
    async authenticateCookieHeader() {
      return null;
    },
  });

  await assert.rejects(() => guard.canActivate(createContext({ headers: {} })), UnauthorizedException);
});
