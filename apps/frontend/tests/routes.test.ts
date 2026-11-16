import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { NextRequest } from "next/server";
import { POST as releaseHint } from "../app/admin/hints/release/route";
import { GET as viewCertificate, HEAD as inspectCertificate } from "../app/clear/route";
import { serverApi } from "../app/lib/server-api";

const originalPublicUrl = process.env.PUBLIC_BASE_URL;
const originalBackendUrl = process.env.BACKEND_INTERNAL_URL;

beforeEach(() => {
  process.env.PUBLIC_BASE_URL = "https://ctf.example.test";
  process.env.BACKEND_INTERNAL_URL = "http://backend:8080";
});

afterEach(() => {
  mock.restoreAll();
  if (originalPublicUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = originalPublicUrl;
  if (originalBackendUrl === undefined) delete process.env.BACKEND_INTERNAL_URL;
  else process.env.BACKEND_INTERNAL_URL = originalBackendUrl;
});

function hintRequest(body = "stageId=01%3Afirst", headers: Record<string, string> = {}) {
  return new NextRequest("http://frontend:3000/admin/hints/release", {
    method: "POST",
    headers: {
      origin: "https://ctf.example.test",
      "content-type": "application/x-www-form-urlencoded",
      cookie: "test-session=opaque",
      ...headers,
    },
    body,
  });
}

test("hint release redirects POST to a GET on the public HTTPS origin", async () => {
  const upstream = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "http://backend:8080/api/admin/hints/release");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("cookie"), "test-session=opaque");
    assert.deepEqual(JSON.parse(String(init?.body)), { stageId: "01:first" });
    return Response.json({ released: true });
  });
  const response = await releaseHint(hintRequest());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://ctf.example.test/admin/operations#hints");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(upstream.mock.callCount(), 1);
});

test("hint release refuses cross-origin, null, and missing origins before forwarding cookies", async () => {
  const upstream = mock.method(globalThis, "fetch", async () => Response.json({}));
  for (const origin of ["https://evil.example.test", "https://ctf.example.test.evil.test", "null", ""]) {
    const response = await releaseHint(hintRequest(undefined, { origin }));
    assert.equal(response.status, 403, origin);
  }
  const crossSite = await releaseHint(hintRequest(undefined, { "sec-fetch-site": "cross-site" }));
  assert.equal(crossSite.status, 403);
  assert.equal(upstream.mock.callCount(), 0);
});

test("invalid hint forms are rejected as client errors instead of crashing", async () => {
  const upstream = mock.method(globalThis, "fetch", async () => Response.json({}));
  for (const body of ["", "stageId=99%3Afirst", "stageId=01%3Afirst&stageId=02%3Asecond"]) {
    const response = await releaseHint(hintRequest(body));
    assert.equal(response.status, 400, body);
  }
  const malformed = await releaseHint(hintRequest("{", { "content-type": "application/json" }));
  assert.equal(malformed.status, 400);
  assert.equal(upstream.mock.callCount(), 0);
});

test("expired administrator sessions redirect safely and forbidden mutations remain forbidden", async () => {
  const upstream = mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  const expired = await releaseHint(hintRequest());
  assert.equal(expired.status, 303);
  assert.equal(expired.headers.get("location"), "https://ctf.example.test/login");
  upstream.mock.mockImplementation(async () => new Response(null, { status: 403 }));
  assert.equal((await releaseHint(hintRequest())).status, 403);
});

test("HEAD and speculative navigation never consume a one-use certificate", async () => {
  const upstream = mock.method(globalThis, "fetch", async () => Response.json({}));
  assert.equal(inspectCertificate().status, 200);
  for (const headers of [
    { purpose: "prefetch" },
    { purpose: "prerender" },
    { "sec-purpose": "prerender" },
    { "sec-purpose": "prefetch;prerender" },
    { "next-router-prefetch": "1" },
  ]) {
    const response = await viewCertificate(new NextRequest("https://ctf.example.test/clear", { headers }));
    assert.equal(response.status, 204);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("sibling-origin resources, embedded views, and mismatched origins cannot consume a certificate", async () => {
  const upstream = mock.method(globalThis, "fetch", async () => Response.json({}));
  const rejectedMetadata: Record<string, string>[] = [
    { "sec-fetch-site": "same-site", "sec-fetch-dest": "image", "sec-fetch-mode": "no-cors" },
    { "sec-fetch-site": "same-site", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
    { "sec-fetch-site": "cross-site", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
    { "sec-fetch-site": "same-origin", "sec-fetch-dest": "image" },
    { "sec-fetch-site": "same-origin", "sec-fetch-dest": "iframe", "sec-fetch-mode": "navigate" },
    { "sec-fetch-site": "same-origin", "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" },
    { "sec-fetch-mode": "same-origin" },
    { "sec-fetch-site": "" },
    { "sec-fetch-dest": "" },
    { "sec-fetch-mode": "" },
    { origin: "https://sibling.example.test" },
    { origin: "null" },
  ];
  for (const metadata of rejectedMetadata) {
    const response = await viewCertificate(new NextRequest("http://frontend:3000/clear", {
      headers: { cookie: "once=opaque", ...metadata },
    }));
    assert.equal(response.status, 403, JSON.stringify(metadata));
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("same-origin top-level and direct browser navigation can consume a certificate", async () => {
  const upstream = mock.method(globalThis, "fetch", async () => Response.json({
    studentId: "participant",
    clearedAt: "2026-11-16T09:00:00.000Z",
    clearReceiptCode: "receipt",
    message: "완료",
  }));
  for (const site of ["same-origin", "none"]) {
    const response = await viewCertificate(new NextRequest("http://frontend:3000/clear", {
      headers: {
        cookie: "once=opaque",
        origin: "https://ctf.example.test",
        "sec-fetch-site": site,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
      },
    }));
    assert.equal(response.status, 200, site);
  }
  assert.equal(upstream.mock.callCount(), 2);
});

test("certificate GET consumes once, escapes values, preserves distinct cookies, and prevents caching", async () => {
  const upstream = mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    const headers = new Headers();
    headers.append("set-cookie", "once=; Path=/clear; Max-Age=0; HttpOnly");
    headers.append("set-cookie", "other=; Path=/; Max-Age=0; HttpOnly");
    return Response.json({
      studentId: "<student>",
      clearedAt: "2026-11-16T09:00:00.000Z",
      clearReceiptCode: 'receipt-"<&',
      message: "<script>alert(1)</script>",
    }, { headers });
  });
  const response = await viewCertificate(new NextRequest("http://frontend:3000/clear", {
    headers: { cookie: "once=opaque" },
  }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("&lt;student&gt;"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(upstream.mock.callCount(), 1);
});

test("failed certificate views and redirects never cache participant responses", async () => {
  const upstream = mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  for (const [status, location] of [[401, "/login"], [403, "/submit"]] as const) {
    upstream.mock.mockImplementation(async () => new Response(null, { status }));
    const response = await viewCertificate(new NextRequest("http://frontend:3000/clear"));
    assert.equal(response.headers.get("location"), `https://ctf.example.test${location}`);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
  upstream.mock.mockImplementation(async () => { throw new TypeError("connection refused"); });
  const unavailable = await viewCertificate(new NextRequest("http://frontend:3000/clear"));
  assert.equal(unavailable.status, 502);
  assert.match(unavailable.headers.get("cache-control") ?? "", /no-store/);
});

test("server API bounds requests, refuses redirects, and does not retry failed mutations", async () => {
  const upstream = mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    throw new DOMException("timed out", "TimeoutError");
  });
  const result = await serverApi("/api/clear-certificate/consume", { method: "POST" }, "");
  assert.equal(result.ok, false);
  assert.equal(upstream.mock.callCount(), 1);
});

test("malformed upstream JSON becomes a controlled gateway error", async () => {
  mock.method(globalThis, "fetch", async () => new Response("<html>unavailable</html>"));
  const result = await serverApi("/api/auth/me", {}, "");
  assert.deepEqual({ ok: result.ok, status: result.ok ? null : result.status }, { ok: false, status: 502 });
});
