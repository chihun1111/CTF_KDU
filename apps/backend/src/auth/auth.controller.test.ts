import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AuthController } from "./auth.controller.js";

test("AuthController imports request DTOs as runtime values for Nest validation metadata", () => {
  const source = readFileSync(new URL("./auth.controller.ts", import.meta.url), "utf8");

  const importList = source.match(/import \{([^}]+)\} from "\.\/dto\/auth\.dto\.js";/)?.[1] ?? "";
  const importedNames = importList.split(",").map((name) => name.trim());
  assert(importedNames.includes("LoginRequestDto"));
  assert(importedNames.includes("RegisterRequestDto"));
});

test("AuthController register sets cookie and no-store while returning only ok body", async () => {
  const headers: Record<string, string> = {};
  const events: string[] = [];
  const controller = new AuthController(
    {
      register: async (input) => {
        events.push(`register:${input.ipHash}:${input.userAgentHash}`);
        return {
        body: { ok: true },
        setCookie: "ctf_session=opaque-session-token; HttpOnly",
        };
      },
    },
    {
      login: async () => ({
        body: { ok: true },
        setCookie: "unused",
      }),
    },
    {
      logout: async () => ({
        body: { ok: true },
        setCookie: "unused",
      }),
    },
    {
      authenticateCookieHeader: async () => null,
    },
    {
      checkRegister: async (ipHash) => {
        events.push(`register-limit:${ipHash}`);
      },
      checkLogin: async () => {
        events.push("unexpected-login-limit");
      },
    },
    {
      requestMetadataHash: (value) => `hash:${value}`,
      studentIdHash: (value) => `student-hash:${value}`,
    },
  );

  const body = await controller.register(
    {
      studentId: "2622022",
      password: "valid-password",
      consent: {
        consentVersion: "2026-ctf-v1",
        requiredLoggingAccepted: true,
        cookieAccepted: true,
      },
    },
    {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    },
    {
      ip: "203.0.113.10",
    },
    "Mozilla/5.0",
  );

  assert.deepEqual(body, { ok: true });
  assert.deepEqual(events, ["register-limit:hash:203.0.113.10", "register:hash:203.0.113.10:hash:Mozilla/5.0"]);
  assert.equal(headers["Set-Cookie"], "ctf_session=opaque-session-token; HttpOnly");
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(JSON.stringify(body).includes("opaque-session-token"), false);
});

test("AuthController login sets cookie and no-store while returning only ok body", async () => {
  const headers: Record<string, string> = {};
  const events: string[] = [];
  const controller = new AuthController(
    {
      register: async () => ({
        body: { ok: true },
        setCookie: "unused",
      }),
    },
    {
      login: async () => ({
        body: { ok: true },
        setCookie: "ctf_session=login-token; HttpOnly",
      }),
    },
    {
      logout: async () => ({
        body: { ok: true },
        setCookie: "unused",
      }),
    },
    {
      authenticateCookieHeader: async () => null,
    },
    {
      checkRegister: async () => {
        events.push("unexpected-register-limit");
      },
      checkLogin: async (ipHash, studentIdHash) => {
        events.push(`login-limit:${ipHash}:${studentIdHash}`);
      },
    },
    {
      requestMetadataHash: (value) => `hash:${value}`,
      studentIdHash: (value) => `student-hash:${value}`,
    },
  );

  const body = await controller.login(
    {
      studentId: "2622022",
      password: "valid-password",
    },
    {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    },
    {
      socket: { remoteAddress: "203.0.113.11" },
    },
  );

  assert.deepEqual(body, { ok: true });
  assert.deepEqual(events, ["login-limit:hash:203.0.113.11:student-hash:2622022"]);
  assert.equal(headers["Set-Cookie"], "ctf_session=login-token; HttpOnly");
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(JSON.stringify(body).includes("login-token"), false);
});

test("AuthController logout expires cookie and returns only ok body", async () => {
  const headers: Record<string, string> = {};
  const controller = new AuthController(
    {
      register: async () => ({
        body: { ok: true },
        setCookie: "unused",
      }),
    },
    {
      login: async () => ({
        body: { ok: true },
        setCookie: "unused",
      }),
    },
    {
      logout: async (cookieHeader) => ({
        body: { ok: true },
        setCookie: `ctf_session=; HttpOnly; Max-Age=0; seen=${cookieHeader === "ctf_session=opaque-token"}`,
      }),
    },
    {
      authenticateCookieHeader: async () => null,
    },
    {
      checkRegister: async () => undefined,
      checkLogin: async () => undefined,
    },
    {
      requestMetadataHash: (value) => `hash:${value}`,
      studentIdHash: (value) => `student-hash:${value}`,
    },
  );

  const body = await controller.logout("ctf_session=opaque-token", {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  });

  assert.deepEqual(body, { ok: true });
  assert.equal(headers["Set-Cookie"], "ctf_session=; HttpOnly; Max-Age=0; seen=true");
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(JSON.stringify(body).includes("opaque-token"), false);
});

test("AuthController me returns only authenticated state and role from the session cookie", async () => {
  const controller = new AuthController(
    {
      register: async () => ({
        body: { ok: true },
        setCookie: "unused",
      }),
    },
    {
      login: async () => ({
        body: { ok: true },
        setCookie: "unused",
      }),
    },
    {
      logout: async () => ({
        body: { ok: true },
        setCookie: "unused",
      }),
    },
    {
      authenticateCookieHeader: async (cookieHeader) =>
        cookieHeader
          ? { sessionId: "session-1", userId: "user-1", role: "admin" }
          : null,
    },
    {
      checkRegister: async () => undefined,
      checkLogin: async () => undefined,
    },
    {
      requestMetadataHash: (value) => `hash:${value}`,
      studentIdHash: (value) => `student-hash:${value}`,
    },
  );

  const authenticated = await controller.me("ctf_session=opaque-token");
  const anonymous = await controller.me(undefined);

  assert.deepEqual(authenticated, { authenticated: true, role: "admin" });
  assert.deepEqual(anonymous, { authenticated: false });
  assert.equal(JSON.stringify(authenticated).includes("user-1"), false);
  assert.equal(JSON.stringify(authenticated).includes("session-1"), false);
  assert.equal(JSON.stringify(authenticated).includes("opaque-token"), false);
});
