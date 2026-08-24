import assert from "node:assert/strict";
import test from "node:test";
import { SessionCookieService } from "./session-cookie.service.js";

test("buildSessionCookie returns a hardened ctf_session cookie containing only the opaque token", () => {
  const service = new SessionCookieService();
  const cookie = service.buildSessionCookie("opaque-token-value", 3600);

  assert(cookie.startsWith("ctf_session=opaque-token-value;"));
  assert(cookie.includes("HttpOnly"));
  assert(cookie.includes("Secure"));
  assert(cookie.includes("SameSite=Lax"));
  assert(cookie.includes("Path=/"));
  assert(cookie.includes("Max-Age=3600"));
  assert.equal(cookie.includes("user_id"), false);
  assert.equal(cookie.includes("studentId"), false);
  assert.equal(cookie.includes("role"), false);
});

test("buildExpiredSessionCookie clears ctf_session without exposing a token", () => {
  const service = new SessionCookieService();
  const cookie = service.buildExpiredSessionCookie();

  assert(cookie.startsWith("ctf_session=;"));
  assert(cookie.includes("HttpOnly"));
  assert(cookie.includes("Secure"));
  assert(cookie.includes("SameSite=Lax"));
  assert(cookie.includes("Path=/"));
  assert(cookie.includes("Max-Age=0"));
});
