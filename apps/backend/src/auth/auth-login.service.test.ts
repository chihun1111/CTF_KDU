import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { AuthLoginService, type LoginStore } from "./auth-login.service.js";
import { DUMMY_PASSWORD_HASH } from "./password-hash.service.js";

function createStore(events: string[], user: Awaited<ReturnType<LoginStore["findLoginUserByStudentIdHash"]>>): LoginStore {
  return {
    async findLoginUserByStudentIdHash(studentIdHash) {
      events.push(`find:${studentIdHash}`);
      return user;
    },
    async createSession(input) {
      events.push(`session:${input.userId}:${input.sessionHash}`);
      return { id: "session-1" };
    },
  };
}

test("AuthLoginService creates a new session and returns token only as cookie", async () => {
  const events: string[] = [];
  const service = new AuthLoginService(
    createStore(events, { id: "user-1", passwordHash: "password-hash", role: "participant" }),
    {
      studentIdHash: () => "student-hash",
      generateOpaqueToken: () => "opaque-session-token",
      sessionHash: (token) => `hash:${token}`,
    },
    { verifyPassword: async () => true },
    { buildSessionCookie: (token, maxAge) => `ctf_session=${token}; Max-Age=${maxAge}; HttpOnly` },
  );

  const result = await service.login({
    studentId: "2622022",
    password: "valid-password",
  });

  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.setCookie, "ctf_session=opaque-session-token; Max-Age=86400; HttpOnly");
  assert.equal(JSON.stringify(result.body).includes("opaque-session-token"), false);
  assert.deepEqual(events, ["find:student-hash", "session:user-1:hash:opaque-session-token"]);
});

test("AuthLoginService uses the same generic failure for unknown student id and bad password", async () => {
  const comparisons: string[] = [];
  const missingUserService = new AuthLoginService(
    createStore([], null),
    {
      studentIdHash: () => "student-hash",
      generateOpaqueToken: () => "unused-token",
      sessionHash: (token) => `hash:${token}`,
    },
    { verifyPassword: async (_password, hash) => { comparisons.push(hash); return true; } },
    { buildSessionCookie: (token) => `ctf_session=${token}` },
  );
  const badPasswordEvents: string[] = [];
  const badPasswordService = new AuthLoginService(
    createStore(badPasswordEvents, { id: "user-1", passwordHash: "password-hash", role: "participant" }),
    {
      studentIdHash: () => "student-hash",
      generateOpaqueToken: () => "unused-token",
      sessionHash: (token) => `hash:${token}`,
    },
    { verifyPassword: async () => false },
    { buildSessionCookie: (token) => `ctf_session=${token}` },
  );

  await assert.rejects(() => missingUserService.login({ studentId: "2622022", password: "valid-password" }), {
    constructor: UnauthorizedException,
    message: "Login failed",
  });
  await assert.rejects(() => badPasswordService.login({ studentId: "2622022", password: "wrong-password" }), {
    constructor: UnauthorizedException,
    message: "Login failed",
  });
  assert.deepEqual(badPasswordEvents, ["find:student-hash"]);
  assert.deepEqual(comparisons, [DUMMY_PASSWORD_HASH]);
});
