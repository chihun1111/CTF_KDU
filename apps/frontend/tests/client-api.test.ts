import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { getClientSession, logoutParticipant } from "../app/lib/client-api";

afterEach(() => mock.restoreAll());

test("logout reports failure instead of pretending the authenticated session ended", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  await assert.rejects(logoutParticipant, /로그아웃하지 못했습니다/);
});

test("logout treats an already expired session as signed out and bounds the request", async () => {
  const upstream = mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(url, "/api/auth/logout");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "include");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(null, { status: 401 });
  });
  await logoutParticipant();
  assert.equal(upstream.mock.callCount(), 1);
});

test("session lookup distinguishes an outage from an expired session", async () => {
  const upstream = mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  await assert.rejects(getClientSession, /인증 서비스/);
  upstream.mock.mockImplementation(async () => new Response(null, { status: 401 }));
  assert.deepEqual(await getClientSession(), { authenticated: false });
});
